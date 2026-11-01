/**
 * Peek Wave — Background Service Worker (Manifest V3)
 * 
 * Responsibilities:
 * 1. Lifecycle initialization: Sets default storage settings on install without overwriting existing preferences.
 * 2. Message routing: Safely handles OPEN_TAB messages, validates URLs, and opens new tabs.
 * 3. DNR synchronization: Toggles declarative network ruleset when extension enabled state changes.
 */

'use strict';

/**
 * Default extension settings schema.
 */
const DEFAULT_SETTINGS = {
  enabled: true,
  modifierKey: 'Shift',
  modalSize: 'default',
  sizePreset: 'default',
  growAnimation: true
};

/**
 * Resolves the primary storage area (chrome.storage.sync with fallback to chrome.storage.local).
 * @returns {chrome.storage.StorageArea|null}
 */
function getStorageArea() {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    if (chrome.storage.sync) return chrome.storage.sync;
    if (chrome.storage.local) return chrome.storage.local;
  }
  return null;
}

/**
 * Safely reads settings keys from storage.
 * @param {string[]} keys 
 * @returns {Promise<Record<string, any>>}
 */
function readStorage(keys) {
  return new Promise((resolve) => {
    const primary = getStorageArea();
    if (!primary) return resolve({});

    primary.get(keys, (result) => {
      if (chrome.runtime?.lastError) {
        if (chrome.storage?.local && primary !== chrome.storage.local) {
          chrome.storage.local.get(keys, (localResult) => {
            resolve(localResult || {});
          });
        } else {
          resolve({});
        }
      } else {
        resolve(result || {});
      }
    });
  });
}

/**
 * Safely writes key-value pairs to storage.
 * @param {Record<string, any>} data 
 * @returns {Promise<void>}
 */
function writeStorage(data) {
  return new Promise((resolve) => {
    const primary = getStorageArea();
    if (!primary) return resolve();

    primary.set(data, () => {
      if (chrome.runtime?.lastError && chrome.storage?.local && primary !== chrome.storage.local) {
        chrome.storage.local.set(data, () => resolve());
      } else {
        resolve();
      }
    });
  });
}

/**
 * Initializes default settings on installation/update without overwriting existing user preferences.
 */
async function initializeStorageDefaults() {
  try {
    const keysToCheck = Object.keys(DEFAULT_SETTINGS);
    const existing = await readStorage(keysToCheck);

    const missingDefaults = {};
    for (const [key, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
      if (existing[key] === undefined || existing[key] === null) {
        missingDefaults[key] = defaultValue;
      }
    }

    if (Object.keys(missingDefaults).length > 0) {
      console.log('[Peek Wave] Initializing unset storage defaults:', missingDefaults);
      await writeStorage(missingDefaults);
    } else {
      console.log('[Peek Wave] Preserving existing user settings; no defaults overwritten.');
    }
  } catch (err) {
    console.error('[Peek Wave] Error initializing storage defaults:', err);
  }
}

/**
 * Validates that a URL is a valid string with a permitted web protocol (http: or https:).
 * Prevents execution of dangerous protocols (javascript:, file:, chrome:).
 * @param {string} rawUrl 
 * @param {chrome.runtime.MessageSender} [sender]
 * @returns {string} Sanitized absolute URL
 */
function validateAndSanitizeUrl(rawUrl, sender) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new Error('URL parameter must be a non-empty string');
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    const baseUrl = sender?.tab?.url || sender?.url;
    if (baseUrl) {
      try {
        parsed = new URL(rawUrl, baseUrl);
      } catch {
        throw new Error(`Malformed URL: ${rawUrl}`);
      }
    } else {
      throw new Error(`Malformed URL: ${rawUrl}`);
    }
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error(`Disallowed URL protocol: "${protocol}". Only http: and https: URLs are permitted.`);
  }

  return parsed.href;
}

/**
 * Creates a tab defensively, compatible with both Promise and callback mock environments.
 * @param {chrome.tabs.CreateProperties} createProperties 
 * @returns {Promise<chrome.tabs.Tab>}
 */
function createTab(createProperties) {
  return new Promise((resolve, reject) => {
    if (!chrome?.tabs?.create) {
      return reject(new Error('chrome.tabs.create API is not available'));
    }

    try {
      const res = chrome.tabs.create(createProperties, (tab) => {
        if (chrome.runtime?.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        resolve(tab);
      });
      if (res && typeof res.then === 'function') {
        res.then(resolve).catch(reject);
      }
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Handles the OPEN_TAB action.
 * @param {object} message 
 * @param {chrome.runtime.MessageSender} sender 
 * @returns {Promise<{ success: boolean, tabId?: number, error?: string }>}
 */
async function handleOpenTab(message, sender) {
  const sanitizedUrl = validateAndSanitizeUrl(message.url, sender);

  const createProps = {
    url: sanitizedUrl,
    active: true
  };

  // Position tab adjacent to sender tab if available
  if (sender?.tab) {
    if (typeof sender.tab.id === 'number') {
      createProps.openerTabId = sender.tab.id;
    }
    if (typeof sender.tab.index === 'number') {
      createProps.index = sender.tab.index + 1;
    }
  }

  try {
    const tab = await createTab(createProps);
    return { success: true, tabId: tab?.id };
  } catch (err) {
    // If failed with openerTabId (e.g. cross-window issues), fall back to basic creation
    if (createProps.openerTabId || createProps.index !== undefined) {
      const basicTab = await createTab({ url: sanitizedUrl, active: true });
      return { success: true, tabId: basicTab?.id };
    }
    throw err;
  }
}

/* ==========================================================================
   Top-Level Synchronous Event Listeners
   ========================================================================== */

if (typeof chrome !== 'undefined' && chrome.runtime?.onInstalled) {
  /**
   * Service Worker Installation / Update lifecycle listener.
   */
  chrome.runtime.onInstalled.addListener(async (details) => {
    console.log(`[Peek Wave] Service Worker installed/updated. Reason: ${details?.reason}`);
    await initializeStorageDefaults();
  });
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  /**
   * Runtime Message Routing listener.
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== 'object') {
      return false;
    }

    const action = message.action || message.type;

    // Handle OPEN_TAB action
    if (action === 'OPEN_TAB' || action === 'openTab') {
      handleOpenTab(message, sender)
        .then((result) => {
          sendResponse(result);
        })
        .catch((error) => {
          sendResponse({
            success: false,
            error: error.message || String(error)
          });
        });
      return true; // Keep message channel open for asynchronous sendResponse
    }

    // Handle health check PING
    if (action === 'PING' || action === 'ping') {
      sendResponse({
        success: true,
        status: 'PONG',
        timestamp: Date.now()
      });
      return false;
    }

    // Handle GET_SETTINGS request
    if (action === 'GET_SETTINGS' || action === 'getSettings') {
      readStorage(['enabled', 'modifierKey', 'modalSize', 'sizePreset', 'growAnimation'])
        .then((settings) => {
          sendResponse({ success: true, settings });
        })
        .catch((err) => {
          sendResponse({ success: false, error: err.message || String(err) });
        });
      return true;
    }

    return false;
  });
}

if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  /**
   * Storage change listener to synchronize DeclarativeNetRequest ruleset when enabled toggle changes.
   */
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled && chrome.declarativeNetRequest?.updateEnabledRulesets) {
      const isEnabled = Boolean(changes.enabled.newValue);
      const rulesetId = 'subframe_headers';

      chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: isEnabled ? [rulesetId] : [],
        disableRulesetIds: isEnabled ? [] : [rulesetId]
      }).catch((err) => {
        console.warn('[Peek Wave] Failed to update declarative ruleset state:', err);
      });
    }
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_SETTINGS,
    getStorageArea,
    readStorage,
    writeStorage,
    initializeStorageDefaults,
    validateAndSanitizeUrl,
    createTab,
    handleOpenTab
  };
}
