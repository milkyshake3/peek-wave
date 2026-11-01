/**
 * Peek Wave — Shared Storage Utility (lib/storage.js)
 * 
 * Provides unified, resilient access to extension preferences:
 * - Normalizes schema keys and aliases ('modalSize' <-> 'sizePreset').
 * - Primary storage on chrome.storage.sync with automatic chrome.storage.local fallback.
 * - Handles both Promise rejections and callback runtime.lastError.
 * - Immediate execution without debounce timers for microtask assertions.
 * - Dual-environment UMD support for browser popup, background, and Node test runner.
 */

(function (root, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else {
    const exports = factory();
    root.PeekWaveStorage = exports;
    if (root === globalThis || (typeof window !== 'undefined' && root === window)) {
      root.DEFAULT_SETTINGS = exports.DEFAULT_SETTINGS;
      root.readSettings = exports.readSettings;
      root.saveSettings = exports.saveSettings;
      root.normalizeModifierKey = exports.normalizeModifierKey;
      root.normalizeModalSize = exports.normalizeModalSize;
      root.resolveModalSize = exports.resolveModalSize;
      root.broadcastSettings = exports.broadcastSettings;
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  /**
   * Default extension settings schema.
   */
  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    modifierKey: 'Shift',
    modalSize: 'default',
    sizePreset: 'default',
    growAnimation: true
  });

  /**
   * Normalizes modifier key string to canonical representation: 'shift' | 'alt' | 'ctrl_cmd'.
   * @param {string} key 
   * @returns {'shift'|'alt'|'ctrl_cmd'}
   */
  function normalizeModifierKey(key) {
    if (typeof key !== 'string') return 'shift';
    const clean = key.trim().toLowerCase().replace(/[^a-z]/g, '');
    if (clean.includes('ctrl') || clean.includes('cmd') || clean.includes('control') || clean.includes('command')) {
      return 'ctrl_cmd';
    }
    if (clean.includes('alt') || clean.includes('option')) {
      return 'alt';
    }
    if (clean.includes('shift')) {
      return 'shift';
    }
    return 'shift';
  }

  /**
   * Valid modal size presets.
   */
  const VALID_MODAL_SIZES = Object.freeze(['compact', 'default', 'large']);

  /**
   * Normalizes modal size string to valid preset: 'compact' | 'default' | 'large'.
   * @param {string} size 
   * @returns {'compact'|'default'|'large'}
   */
  function normalizeModalSize(size) {
    if (typeof size !== 'string') return 'default';
    const clean = size.trim().toLowerCase();
    if (VALID_MODAL_SIZES.includes(clean)) return clean;
    return 'default';
  }

  /**
   * Resolves modal size from an object checking both 'modalSize' and 'sizePreset' in order.
   * Ensures dual-key lockstep and graceful fallback to DEFAULT_SETTINGS.modalSize.
   * @param {object} obj 
   * @returns {'compact'|'default'|'large'}
   */
  function resolveModalSize(obj) {
    if (obj && typeof obj === 'object') {
      if (typeof obj.modalSize === 'string') {
        const clean = obj.modalSize.trim().toLowerCase();
        if (VALID_MODAL_SIZES.includes(clean)) return clean;
      }
      if (typeof obj.sizePreset === 'string') {
        const clean = obj.sizePreset.trim().toLowerCase();
        if (VALID_MODAL_SIZES.includes(clean)) return clean;
      }
    }
    return DEFAULT_SETTINGS.modalSize;
  }

  /**
   * Resolves available Chrome API instance.
   * @param {object} [customChrome] 
   * @returns {object|null}
   */
  function resolveChrome(customChrome) {
    if (customChrome && typeof customChrome === 'object') return customChrome;
    if (typeof chrome !== 'undefined' && chrome) return chrome;
    if (typeof window !== 'undefined' && window.chrome) return window.chrome;
    return null;
  }

  /**
   * Checks if an object contains any known settings keys.
   * @param {object} obj 
   * @returns {boolean}
   */
  function hasSettings(obj) {
    if (!obj || typeof obj !== 'object') return false;
    return (
      obj.enabled !== undefined ||
      obj.modifierKey !== undefined ||
      obj.modalSize !== undefined ||
      obj.sizePreset !== undefined ||
      obj.growAnimation !== undefined
    );
  }

  /**
   * Resilient microtask scheduler supporting standard queueMicrotask and Promise fallbacks.
   */
  const deferMicrotask = (typeof queueMicrotask === 'function')
    ? queueMicrotask
    : (typeof Promise !== 'undefined' ? (fn) => Promise.resolve().then(fn) : (fn) => setTimeout(fn, 0));

  /**
   * Safely reads from a single chrome.storage.StorageArea.
   * Handles both Promise and callback resolutions.
   * @param {chrome.storage.StorageArea} area 
   * @param {string[]} keys 
   * @param {object} chromeObj 
   * @returns {Promise<Record<string, any>>}
   */
  function readFromArea(area, keys, chromeObj) {
    return new Promise((resolve, reject) => {
      if (!area || typeof area.get !== 'function') {
        return reject(new Error('Storage area is unavailable'));
      }
      let settled = false;
      try {
        let p;
        const cb = (res) => {
          if (chromeObj?.runtime?.lastError) {
            if (!settled) {
              settled = true;
              const err = new Error(chromeObj.runtime.lastError.message || String(chromeObj.runtime.lastError));
              try { chromeObj.runtime.lastError = null; } catch {}
              reject(err);
            }
            return;
          }
          // Defer callback resolution to microtask so Promise assignment can complete
          deferMicrotask(() => {
            if (!p || typeof p.then !== 'function') {
              if (!settled) {
                settled = true;
                resolve(res || {});
              }
            }
          });
        };

        p = area.get(keys, cb);

        if (p && typeof p.then === 'function') {
          p.then(
            (res) => {
              if (!settled) {
                settled = true;
                resolve(res || {});
              }
            },
            (err) => {
              if (!settled) {
                settled = true;
                reject(err);
              }
            }
          );
        }
      } catch (err) {
        if (!settled) {
          settled = true;
          reject(err);
        }
      }
    });
  }

  /**
   * Safely writes to a single chrome.storage.StorageArea.
   * Prioritizes Promise rejection and uses queueMicrotask to avoid synchronous callback race conditions.
   * @param {chrome.storage.StorageArea} area 
   * @param {Record<string, any>} data 
   * @param {object} chromeObj 
   * @returns {Promise<void>}
   */
  function writeToArea(area, data, chromeObj) {
    return new Promise((resolve, reject) => {
      if (!area || typeof area.set !== 'function') {
        return reject(new Error('Storage area is unavailable'));
      }
      let settled = false;
      try {
        let p;
        const cb = () => {
          if (chromeObj?.runtime?.lastError) {
            if (!settled) {
              settled = true;
              const err = new Error(chromeObj.runtime.lastError.message || String(chromeObj.runtime.lastError));
              try { chromeObj.runtime.lastError = null; } catch {}
              reject(err);
            }
            return;
          }
          // Defer callback resolution to microtask so Promise assignment can complete
          deferMicrotask(() => {
            if (!p || typeof p.then !== 'function') {
              if (!settled) {
                settled = true;
                resolve();
              }
            }
          });
        };

        p = area.set(data, cb);

        if (p && typeof p.then === 'function') {
          p.then(
            () => {
              if (!settled) {
                settled = true;
                resolve();
              }
            },
            (err) => {
              if (!settled) {
                settled = true;
                reject(err);
              }
            }
          );
        }
      } catch (err) {
        if (!settled) {
          settled = true;
          reject(err);
        }
      }
    });
  }

  /**
   * Reads settings from primary storage (sync) with automatic local storage fallback.
   * If sync returns empty ({}), queries local storage before falling back to DEFAULT_SETTINGS.
   * Resolves 'modalSize' and 'sizePreset' in lockstep.
   * @param {object} [customChrome] 
   * @returns {Promise<{ enabled: boolean, modifierKey: string, modalSize: string, sizePreset: string, growAnimation: boolean }>}
   */
  async function readSettings(customChrome) {
    const chromeObj = resolveChrome(customChrome);
    if (!chromeObj?.storage) {
      return {
        enabled: DEFAULT_SETTINGS.enabled,
        modifierKey: normalizeModifierKey(DEFAULT_SETTINGS.modifierKey),
        modalSize: DEFAULT_SETTINGS.modalSize,
        sizePreset: DEFAULT_SETTINGS.sizePreset,
        growAnimation: DEFAULT_SETTINGS.growAnimation
      };
    }

    const keys = ['enabled', 'modifierKey', 'modalSize', 'sizePreset', 'growAnimation'];
    const syncArea = chromeObj.storage.sync;
    const localArea = chromeObj.storage.local;

    let items = null;

    if (syncArea) {
      try {
        items = await readFromArea(syncArea, keys, chromeObj);
        // If sync storage succeeds but contains no settings (e.g. previous writes fell back
        // to local due to sync quota error), query localArea before defaulting.
        if (!hasSettings(items) && localArea) {
          if (chromeObj?.runtime?.lastError) {
            try { chromeObj.runtime.lastError = null; } catch {}
          }
          try {
            const localItems = await readFromArea(localArea, keys, chromeObj);
            if (hasSettings(localItems)) {
              items = localItems;
            }
          } catch {}
        }
      } catch {
        // Fallback to local storage on sync error or rejection
        if (localArea) {
          if (chromeObj?.runtime?.lastError) {
            try { chromeObj.runtime.lastError = null; } catch {}
          }
          try {
            items = await readFromArea(localArea, keys, chromeObj);
          } catch {}
        }
      }
    } else if (localArea) {
      try {
        items = await readFromArea(localArea, keys, chromeObj);
      } catch {}
    }

    const raw = items || {};
    const normalizedSize = resolveModalSize(raw);

    return {
      enabled: raw.enabled !== undefined ? Boolean(raw.enabled) : DEFAULT_SETTINGS.enabled,
      modifierKey: normalizeModifierKey(raw.modifierKey || DEFAULT_SETTINGS.modifierKey),
      modalSize: normalizedSize,
      sizePreset: normalizedSize,
      growAnimation: raw.growAnimation !== undefined ? Boolean(raw.growAnimation) : DEFAULT_SETTINGS.growAnimation
    };
  }

  /**
   * Writes settings to primary storage (sync) with automatic local storage fallback on error/quota.
   * Ensures 'modalSize' and 'sizePreset' remain in lockstep.
   * Clears lingering runtime.lastError before local fallback write.
   * Executes immediately without debounce timers to maintain microtask assertion compatibility.
   * @param {object} settings 
   * @param {object} [customChrome] 
   * @returns {Promise<{ enabled: boolean, modifierKey: string, modalSize: string, sizePreset: string, growAnimation: boolean }>}
   */
  async function saveSettings(settings, customChrome) {
    const chromeObj = resolveChrome(customChrome);
    const normalizedSize = resolveModalSize(settings);
    const normalizedMod = normalizeModifierKey(settings?.modifierKey || DEFAULT_SETTINGS.modifierKey);
    const isEnabled = settings?.enabled !== undefined ? Boolean(settings.enabled) : DEFAULT_SETTINGS.enabled;
    const isGrow = settings?.growAnimation !== undefined ? Boolean(settings.growAnimation) : DEFAULT_SETTINGS.growAnimation;

    const payload = {
      enabled: isEnabled,
      modifierKey: normalizedMod,
      modalSize: normalizedSize,
      sizePreset: normalizedSize,
      growAnimation: isGrow
    };

    if (!chromeObj?.storage) {
      return payload;
    }

    const syncArea = chromeObj.storage.sync;
    const localArea = chromeObj.storage.local;

    if (syncArea) {
      try {
        await writeToArea(syncArea, payload, chromeObj);
        return payload;
      } catch (err) {
        // Fallback to local storage on sync quota error or rejection
        if (localArea) {
          // Clear any lingering runtime.lastError from sync failure before attempting local fallback
          if (chromeObj?.runtime?.lastError) {
            try { chromeObj.runtime.lastError = null; } catch {}
          }
          await writeToArea(localArea, payload, chromeObj);
          return payload;
        }
        throw err;
      }
    } else if (localArea) {
      await writeToArea(localArea, payload, chromeObj);
      return payload;
    }

    return payload;
  }

  /**
   * Defensive broadcast of updated settings to active browser tabs.
   * @param {object} settings 
   * @param {object} [customChrome] 
   */
  function broadcastSettings(settings, customChrome) {
    const chromeObj = resolveChrome(customChrome);
    if (!chromeObj?.tabs?.query || !chromeObj?.tabs?.sendMessage) return;

    try {
      chromeObj.tabs.query({}, (tabs) => {
        if (chromeObj.runtime?.lastError || !Array.isArray(tabs)) return;
        for (const tab of tabs) {
          if (tab?.id) {
            try {
              chromeObj.tabs.sendMessage(tab.id, { action: 'SETTINGS_CHANGED', settings }, () => {
                void chromeObj.runtime?.lastError;
              });
            } catch {}
          }
        }
      });
    } catch {}
  }

  return {
    DEFAULT_SETTINGS,
    normalizeModifierKey,
    normalizeModalSize,
    resolveModalSize,
    readSettings,
    saveSettings,
    broadcastSettings
  };
});
