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

/**
 * Evicts active Service Workers and CacheStorage for framing-heavy origins (x.com, twitter.com).
 * Prevents locally cached responses with X-Frame-Options: deny from bypassing DeclarativeNetRequest.
 * @returns {Promise<void>}
 */
function clearFramingCaches() {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.browsingData?.remove) {
      try {
        const res = chrome.browsingData.remove(
          { origins: ['https://x.com', 'https://twitter.com'] },
          { serviceWorkers: true, cacheStorage: true },
          () => {
            resolve();
          }
        );
        if (res && typeof res.then === 'function') {
          res.then(resolve).catch(() => resolve());
        }
      } catch (err) {
        console.warn('[Peek Wave] browsingData.remove error:', err);
        resolve();
      }
    } else {
      resolve();
    }
  });
}

/**
 * Strips tracking and attribution parameters from a URL while strictly preserving
 * functional parameters (such as YouTube timestamps, video IDs, search queries, pagination).
 * @param {string} rawUrl 
 * @returns {string} Clean URL
 */
function stripTrackingParameters(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return rawUrl;

  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    const isYouTube = host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be';
    const isTwitter = host === 'x.com' || host === 'twitter.com' || host.endsWith('.x.com') || host.endsWith('.twitter.com');

    // Universal tracking parameter patterns safe to remove on all websites
    const universalTrackers = [
      /^utm_[a-z0-9_]+$/i,
      /^fbclid$/i,
      /^gclid$/i,
      /^gclsrc$/i,
      /^dclid$/i,
      /^msclkid$/i,
      /^twclid$/i,
      /^ref_src$/i,
      /^ref_url$/i,
      /^twsrc$/i,
      /^mc_eid$/i,
      /^mc_cid$/i,
      /^igshid$/i,
      /^_hsenc$/i,
      /^_hsmi$/i
    ];

    const keysToRemove = [];

    for (const key of parsed.searchParams.keys()) {
      // 1. Universal tracking parameters
      if (universalTrackers.some((re) => re.test(key))) {
        keysToRemove.push(key);
        continue;
      }

      // 2. Twitter-specific tracking parameters (s, t) on Twitter/X domains
      if (isTwitter && (key === 's' || key === 't')) {
        keysToRemove.push(key);
        continue;
      }

      // 3. Twitter share parameters on non-YouTube target URLs
      if (!isYouTube && (key === 'ref' || key === 's')) {
        keysToRemove.push(key);
        continue;
      }
    }

    for (const key of keysToRemove) {
      parsed.searchParams.delete(key);
    }

    return parsed.href;
  } catch {
    return rawUrl;
  }
}

/**
 * Resolves a redirect or forwarder URL (such as t.co) to its canonical destination.
 * Follows HTTP 301/302 redirects, or parses HTML meta-refresh / location.replace for t.co responses.
 * Enforces a 3-second timeout, validates the destination protocol (http/https only),
 * and strips tracking parameters.
 * @param {string} rawUrl 
 * @param {chrome.runtime.MessageSender} [sender]
 * @returns {Promise<string>}
 */
async function resolveRedirectUrl(rawUrl, sender) {
  const sanitized = validateAndSanitizeUrl(rawUrl, sender);

  // If already a non-forwarder URL, return cleaned URL directly
  try {
    const parsed = new URL(sanitized);
    const host = parsed.hostname.toLowerCase();
    if (host !== 't.co' && !host.endsWith('.t.co')) {
      return stripTrackingParameters(sanitized);
    }
  } catch {
    return stripTrackingParameters(sanitized);
  }

  if (typeof fetch !== 'function') {
    return stripTrackingParameters(sanitized);
  }

  let controller = null;
  let timer = null;
  let signal = undefined;
  if (typeof AbortController === 'function') {
    controller = new AbortController();
    signal = controller.signal;
    timer = setTimeout(() => {
      try { controller.abort(); } catch {}
    }, 3000);
  }

  try {
    const response = await fetch(sanitized, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal
    });
    if (timer) clearTimeout(timer);

    let destinationUrl = response.url;

    // If destination is away from t.co, we followed an HTTP redirect
    try {
      if (destinationUrl) {
        const destParsed = new URL(destinationUrl);
        const destHost = destParsed.hostname.toLowerCase();
        if (destHost !== 't.co' && !destHost.endsWith('.t.co')) {
          const validated = validateAndSanitizeUrl(destinationUrl, sender);
          return stripTrackingParameters(validated);
        }
      }
    } catch {}

    // Otherwise, check response body for meta-refresh or location.replace
    if (typeof response.text === 'function') {
      const body = await response.text();

      // 1. Meta refresh: <meta http-equiv="refresh" content="0;URL=https://...">
      const metaMatch = body.match(/<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["']?[0-9]*;\s*URL=([^"'>\s]+)["']?/i);
      if (metaMatch && metaMatch[1]) {
        let extracted = metaMatch[1].trim();
        extracted = extracted.replace(/\\(['"/])/g, '$1');
        const validated = validateAndSanitizeUrl(extracted, sender);
        return stripTrackingParameters(validated);
      }

      // 2. JavaScript location.replace("https:\/\/...") or location.href = "..."
      const jsMatch = body.match(/location\.(?:replace|href)\s*\(?\s*["']([^"']+)["']\s*\)?/i);
      if (jsMatch && jsMatch[1]) {
        let extracted = jsMatch[1].trim();
        extracted = extracted.replace(/\\(['"/])/g, '$1');
        const validated = validateAndSanitizeUrl(extracted, sender);
        return stripTrackingParameters(validated);
      }
    }

    return stripTrackingParameters(sanitized);
  } catch {
    if (timer) clearTimeout(timer);
    return stripTrackingParameters(sanitized);
  }
}

// Proactively clear framing caches on background initialization
clearFramingCaches().catch(() => {});

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
    await clearFramingCaches();
  });
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onStartup) {
  /**
   * Browser Startup lifecycle listener to clear SW caches before preview framing.
   */
  chrome.runtime.onStartup.addListener(async () => {
    await clearFramingCaches();
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

    // Handle CLEAR_PREVIEW_CACHE / PREPARE_PREVIEW action
    if (action === 'CLEAR_PREVIEW_CACHE' || action === 'PREPARE_PREVIEW' || action === 'clearPreviewCache') {
      clearFramingCaches()
        .then(() => {
          sendResponse({ success: true });
        })
        .catch((err) => {
          sendResponse({ success: false, error: err.message || String(err) });
        });
      return true;
    }

    // Handle RESOLVE_URL / resolveUrl / UNWRAP_URL action
    if (action === 'RESOLVE_URL' || action === 'resolveUrl' || action === 'UNWRAP_URL') {
      resolveRedirectUrl(message.url, sender)
        .then((resolvedUrl) => {
          sendResponse({ success: true, resolvedUrl });
        })
        .catch((err) => {
          sendResponse({ success: false, error: err.message || String(err), fallbackUrl: message.url });
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
    handleOpenTab,
    clearFramingCaches,
    resolveRedirectUrl,
    stripTrackingParameters
  };
}
