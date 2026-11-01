/**
 * background_adversarial.test.js
 * 
 * Empirical Adversarial Test Suite for Peek Wave background.js
 * 
 * Tests:
 * 1. Adversarial URLs:
 *    - Dangerous URI schemes: javascript:alert(1), data:text/html,..., file:///etc/passwd, chrome://settings
 *    - Invalid/adversarial types: null, undefined, objects ({}, { url: '...' }), arrays, numbers, booleans
 *    - Malformed/edge-case strings: empty string, whitespace only, control characters
 *    - Protocol validation: http: and https: permitted; all other protocols strictly blocked
 *    - Relative URL resolution with and without sender context
 * 2. Concurrent Message Handling:
 *    - 100+ concurrent requests (OPEN_TAB, PING, GET_SETTINGS, invalid actions)
 *    - High-concurrency Promise.all stress testing
 *    - Channel isolation, independent responses, absence of race conditions
 * 3. onInstalled Lifecycle & Storage Customization Preservation:
 *    - Fresh install defaults initialization
 *    - Pre-existing customized settings (all custom, partial custom, falsy enabled: false)
 *    - Idempotency across repeated update/reinstall events
 *    - Quota/runtime error fallback from sync to local storage
 */

'use strict';

const assert = require('assert');
const path = require('path');

// Target under test
const background = require(path.resolve(__dirname, '../../background.js'));
const {
  DEFAULT_SETTINGS,
  getStorageArea,
  readStorage,
  writeStorage,
  initializeStorageDefaults,
  validateAndSanitizeUrl,
  createTab,
  handleOpenTab
} = background;

/**
 * Creates an isolated mock Chrome API environment for unit & stress tests.
 */
function createMockChrome(initialStorage = {}) {
  const syncStore = new Map(Object.entries(initialStorage));
  const localStore = new Map();
  const createdTabs = [];
  let nextTabId = 100;

  const chromeMock = {
    runtime: {
      lastError: null,
      onInstalled: {
        _listeners: [],
        addListener(fn) { this._listeners.push(fn); },
        async trigger(details) {
          for (const fn of this._listeners) {
            await fn(details);
          }
        }
      },
      onMessage: {
        _listeners: [],
        addListener(fn) { this._listeners.push(fn); },
        dispatch(message, sender) {
          return new Promise((resolve) => {
            let responded = false;
            const sendResponse = (res) => {
              if (responded) return;
              responded = true;
              resolve(res);
            };
            for (const fn of this._listeners) {
              const keepOpen = fn(message, sender, sendResponse);
              if (!keepOpen && !responded) {
                // Synchronous handler or unhandled
                sendResponse(undefined);
              }
            }
          });
        }
      }
    },
    storage: {
      sync: {
        get(keys, callback) {
          if (chromeMock.storage.sync.failWithLastError) {
            chromeMock.runtime.lastError = new Error('Sync storage unavailable');
            callback({});
            chromeMock.runtime.lastError = null;
            return;
          }
          const res = {};
          const keyList = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys || {}));
          for (const k of keyList) {
            if (syncStore.has(k)) {
              res[k] = syncStore.get(k);
            }
          }
          callback(res);
        },
        set(items, callback) {
          if (chromeMock.storage.sync.failWithLastError) {
            chromeMock.runtime.lastError = new Error('Sync storage write failed');
            callback();
            chromeMock.runtime.lastError = null;
            return;
          }
          for (const [k, v] of Object.entries(items)) {
            syncStore.set(k, v);
          }
          callback();
        },
        _store: syncStore,
        failWithLastError: false
      },
      local: {
        get(keys, callback) {
          const res = {};
          const keyList = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys || {}));
          for (const k of keyList) {
            if (localStore.has(k)) {
              res[k] = localStore.get(k);
            }
          }
          callback(res);
        },
        set(items, callback) {
          for (const [k, v] of Object.entries(items)) {
            localStore.set(k, v);
          }
          callback();
        },
        _store: localStore
      },
      onChanged: {
        _listeners: [],
        addListener(fn) { this._listeners.push(fn); }
      }
    },
    tabs: {
      create(props, callback) {
        if (chromeMock.tabs.failNextCreate) {
          chromeMock.runtime.lastError = new Error('Tab creation failed by mock');
          callback(null);
          chromeMock.runtime.lastError = null;
          return;
        }
        const tab = {
          id: ++nextTabId,
          url: props.url,
          active: props.active !== false,
          openerTabId: props.openerTabId,
          index: props.index
        };
        createdTabs.push(tab);
        callback(tab);
        return Promise.resolve(tab);
      },
      _created: createdTabs,
      failNextCreate: false
    },
    declarativeNetRequest: {
      updateEnabledRulesets: async () => {}
    }
  };

  return chromeMock;
}

// ============================================================================
// Test Suite Execution
// ============================================================================

async function runAdversarialBackgroundTests() {
  const results = { passed: 0, failed: 0, testCases: [] };

  function logPass(title) {
    results.passed++;
    results.testCases.push({ title, status: 'PASSED' });
    console.log(`  [PASS] ${title}`);
  }

  function logFail(title, err) {
    results.failed++;
    results.testCases.push({ title, status: 'FAILED', error: err.message || String(err) });
    console.error(`  [FAIL] ${title}: ${err.message || String(err)}`);
  }

  console.log('\n===============================================================');
  console.log('   CHALLENGER TEST SUITE: background.js ADVERSARIAL ANALYSIS   ');
  console.log('===============================================================\n');

  // --------------------------------------------------------------------------
  // Category 1: Adversarial URL Attacks & Type Confusion
  // --------------------------------------------------------------------------
  console.log('Category 1: Adversarial URL Attacks & Type Confusion');

  const adversarialUrlInputs = [
    { input: 'javascript:alert(1)', desc: 'XSS javascript: scheme' },
    { input: 'JAVASCRIPT:alert("UPPERCASE")', desc: 'Uppercase JAVASCRIPT: scheme' },
    { input: 'data:text/html,<script>alert(1)</script>', desc: 'data: HTML with script' },
    { input: 'data:image/svg+xml,<svg onload=alert(1)>', desc: 'data: SVG with onload payload' },
    { input: 'file:///etc/passwd', desc: 'file: UNIX password file URI' },
    { input: 'file:///C:/Windows/System32/drivers/etc/hosts', desc: 'file: Windows hosts file URI' },
    { input: 'chrome://settings', desc: 'Internal chrome:// scheme' },
    { input: 'chrome://extensions', desc: 'Internal chrome://extensions scheme' },
    { input: 'chrome-extension://abcdefghijklmnopqrstuvwxyz/page.html', desc: 'chrome-extension: scheme' },
    { input: 'about:blank', desc: 'about:blank scheme' },
    { input: 'about:config', desc: 'about:config scheme' },
    { input: 'vbscript:msgbox(1)', desc: 'vbscript: scheme' },
    { input: 'blob:https://example.com/d94e1d3e-108b', desc: 'blob: URI scheme' },
    { input: 'view-source:https://example.com', desc: 'view-source: wrapper scheme' },
    { input: 'ws://example.com/socket', desc: 'WebSocket ws: scheme' },
    { input: 'wss://example.com/socket', desc: 'Secure WebSocket wss: scheme' },
    { input: 'ftp://ftp.example.com/file.txt', desc: 'ftp: scheme' }
  ];

  for (const { input, desc } of adversarialUrlInputs) {
    try {
      assert.throws(
        () => validateAndSanitizeUrl(input),
        /Disallowed URL protocol/,
        `Should reject disallowed scheme: ${desc}`
      );
      logPass(`Adversarial URL blocked: ${desc} ("${input}")`);
    } catch (err) {
      logFail(`Adversarial URL blocked: ${desc}`, err);
    }
  }

  // Non-string / Type confusion inputs
  const nonStringInputs = [
    { input: null, desc: 'null literal' },
    { input: undefined, desc: 'undefined literal' },
    { input: 12345, desc: 'numeric integer' },
    { input: NaN, desc: 'NaN numeric value' },
    { input: true, desc: 'boolean true' },
    { input: false, desc: 'boolean false' },
    { input: {}, desc: 'empty object {}' },
    { input: { url: 'https://example.com' }, desc: 'object with url property' },
    { input: ['https://example.com'], desc: 'array with valid URL string' },
    { input: Symbol('url'), desc: 'Symbol primitive' },
    { input: '', desc: 'empty string' },
    { input: '   ', desc: 'whitespace string (spaces)' },
    { input: '\t\n\r', desc: 'whitespace string (tabs/newlines)' }
  ];

  for (const { input, desc } of nonStringInputs) {
    try {
      assert.throws(
        () => validateAndSanitizeUrl(input),
        /URL parameter must be a non-empty string/,
        `Should reject non-string / empty: ${desc}`
      );
      logPass(`Non-string input rejected: ${desc}`);
    } catch (err) {
      logFail(`Non-string input rejected: ${desc}`, err);
    }
  }

  // Malformed URLs without sender base
  const malformedInputs = [
    { input: 'not a valid url at all', desc: 'random plain words' },
    { input: 'http://', desc: 'incomplete scheme without host' },
    { input: 'https://', desc: 'incomplete https scheme without host' },
    { input: '//example.com/page', desc: 'protocol-relative without sender' },
    { input: '/relative/path/to/page', desc: 'relative path without sender' }
  ];

  for (const { input, desc } of malformedInputs) {
    try {
      assert.throws(
        () => validateAndSanitizeUrl(input),
        /Malformed URL/,
        `Should throw Malformed URL for ${desc}`
      );
      logPass(`Malformed URL rejected without base: ${desc}`);
    } catch (err) {
      logFail(`Malformed URL rejected without base: ${desc}`, err);
    }
  }

  // Valid Relative URL resolution with sender base URL
  try {
    const sender = { tab: { url: 'https://sub.domain.org/path/index.html' } };
    const resolvedPath = validateAndSanitizeUrl('/api/v1/resource', sender);
    assert.strictEqual(resolvedPath, 'https://sub.domain.org/api/v1/resource');

    const resolvedRelative = validateAndSanitizeUrl('details?id=42', sender);
    assert.strictEqual(resolvedRelative, 'https://sub.domain.org/path/details?id=42');

    const resolvedProtoRelative = validateAndSanitizeUrl('//other.org/feed', sender);
    assert.strictEqual(resolvedProtoRelative, 'https://other.org/feed');
    logPass('Relative URL resolution with valid sender tab context');
  } catch (err) {
    logFail('Relative URL resolution with valid sender tab context', err);
  }

  // Valid absolute HTTP/HTTPS URLs
  const validUrls = [
    'http://example.com',
    'https://example.com',
    'https://sub.domain.co.uk:8443/test/path?foo=bar&baz=1#section',
    'http://127.0.0.1:8080/app',
    'http://localhost:3000'
  ];

  for (const url of validUrls) {
    try {
      const sanitized = validateAndSanitizeUrl(url);
      assert.ok(sanitized.startsWith('http:') || sanitized.startsWith('https:'));
      logPass(`Valid web URL accepted: "${url}"`);
    } catch (err) {
      logFail(`Valid web URL accepted: "${url}"`, err);
    }
  }

  // --------------------------------------------------------------------------
  // Category 2: handleOpenTab Security and Fallback Mechanics
  // --------------------------------------------------------------------------
  console.log('\nCategory 2: handleOpenTab Security and Fallback Mechanics');

  // Test handleOpenTab rejecting adversarial URL without creating tab
  try {
    const mockChrome = createMockChrome();
    global.chrome = mockChrome;

    const res = await handleOpenTab({ action: 'OPEN_TAB', url: 'javascript:alert(document.cookie)' });
    logFail('handleOpenTab should have rejected javascript: URL', new Error('Did not throw'));
  } catch (err) {
    if (/Disallowed URL protocol/.test(err.message)) {
      assert.strictEqual(global.chrome.tabs._created.length, 0, 'No tab must be created for disallowed URL');
      logPass('handleOpenTab throws on javascript: URL and aborts tab creation');
    } else {
      logFail('handleOpenTab unexpected error message', err);
    }
  }

  // Test handleOpenTab fallback when openerTabId fails
  try {
    const mockChrome = createMockChrome();
    global.chrome = mockChrome;

    // Simulate chrome.tabs.create failing when openerTabId is specified, then succeeding without it
    let createCount = 0;
    mockChrome.tabs.create = (props, cb) => {
      createCount++;
      if (props.openerTabId) {
        mockChrome.runtime.lastError = new Error('Invalid opener tab id');
        cb(null);
        mockChrome.runtime.lastError = null;
        return Promise.reject(new Error('Invalid opener tab id'));
      }
      const tab = { id: 999, url: props.url, active: props.active };
      mockChrome.tabs._created.push(tab);
      cb(tab);
      return Promise.resolve(tab);
    };

    const sender = { tab: { id: 888, index: 2 } };
    const result = await handleOpenTab({ action: 'OPEN_TAB', url: 'https://example.org' }, sender);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.tabId, 999);
    assert.strictEqual(createCount, 2, 'Should retry with fallback basic creation');
    logPass('handleOpenTab gracefully falls back to basic tab creation if openerTabId fails');
  } catch (err) {
    logFail('handleOpenTab fallback mechanism failed', err);
  }

  // --------------------------------------------------------------------------
  // Category 3: High-Concurrency Message Handling & Race Condition Stress
  // --------------------------------------------------------------------------
  console.log('\nCategory 3: High-Concurrency Message Handling & Race Condition Stress');

  try {
    const mockChrome = createMockChrome();
    global.chrome = mockChrome;

    // Register onMessage handler directly on mockChrome.runtime.onMessage
    mockChrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || typeof message !== 'object') return false;
      const action = message.action || message.type;
      if (action === 'OPEN_TAB' || action === 'openTab') {
        handleOpenTab(message, sender)
          .then((res) => sendResponse(res))
          .catch((err) => sendResponse({ success: false, error: err.message || String(err) }));
        return true;
      }
      if (action === 'PING' || action === 'ping') {
        sendResponse({ success: true, status: 'PONG', timestamp: Date.now() });
        return false;
      }
      if (action === 'GET_SETTINGS' || action === 'getSettings') {
        readStorage(['enabled', 'modifierKey', 'modalSize', 'sizePreset'])
          .then((settings) => sendResponse({ success: true, settings }))
          .catch((err) => sendResponse({ success: false, error: err.message || String(err) }));
        return true;
      }
      return false;
    });

    // Concurrently dispatch 120 messages:
    // 30 valid OPEN_TAB
    // 30 malicious OPEN_TAB
    // 30 PING
    // 30 GET_SETTINGS
    const concurrentCount = 30;
    const promises = [];

    // 1. Valid OPEN_TAB
    for (let i = 0; i < concurrentCount; i++) {
      const msg = { action: 'OPEN_TAB', url: `https://example.com/page/${i}` };
      const sender = { tab: { id: 10 + i, index: i } };
      promises.push(
        mockChrome.runtime.onMessage.dispatch(msg, sender).then(res => ({
          type: 'valid_open',
          idx: i,
          res
        }))
      );
    }

    // 2. Malicious OPEN_TAB (javascript:, data:, file:)
    for (let i = 0; i < concurrentCount; i++) {
      const schemes = ['javascript:alert(1)', 'file:///secret.txt', 'chrome://settings', 'data:text/html,pwnd'];
      const msg = { action: 'OPEN_TAB', url: schemes[i % schemes.length] };
      promises.push(
        mockChrome.runtime.onMessage.dispatch(msg, null).then(res => ({
          type: 'malicious_open',
          idx: i,
          res
        }))
      );
    }

    // 3. PING
    for (let i = 0; i < concurrentCount; i++) {
      const msg = { action: 'PING' };
      promises.push(
        mockChrome.runtime.onMessage.dispatch(msg, null).then(res => ({
          type: 'ping',
          idx: i,
          res
        }))
      );
    }

    // 4. GET_SETTINGS
    for (let i = 0; i < concurrentCount; i++) {
      const msg = { action: 'GET_SETTINGS' };
      promises.push(
        mockChrome.runtime.onMessage.dispatch(msg, null).then(res => ({
          type: 'get_settings',
          idx: i,
          res
        }))
      );
    }

    const allResults = await Promise.all(promises);
    assert.strictEqual(allResults.length, concurrentCount * 4, 'All 120 concurrent messages must resolve');

    const validOpens = allResults.filter(r => r.type === 'valid_open');
    const maliciousOpens = allResults.filter(r => r.type === 'malicious_open');
    const pings = allResults.filter(r => r.type === 'ping');
    const settings = allResults.filter(r => r.type === 'get_settings');

    assert.strictEqual(validOpens.length, concurrentCount);
    for (const item of validOpens) {
      assert.strictEqual(item.res.success, true, `Valid OPEN_TAB #${item.idx} failed`);
      assert.ok(typeof item.res.tabId === 'number', 'Expected valid tabId');
    }

    assert.strictEqual(maliciousOpens.length, concurrentCount);
    for (const item of maliciousOpens) {
      assert.strictEqual(item.res.success, false, `Malicious OPEN_TAB #${item.idx} should fail`);
      assert.ok(/Disallowed URL protocol/.test(item.res.error), 'Expected protocol error message');
    }

    assert.strictEqual(pings.length, concurrentCount);
    for (const item of pings) {
      assert.strictEqual(item.res.success, true);
      assert.strictEqual(item.res.status, 'PONG');
    }

    assert.strictEqual(settings.length, concurrentCount);
    for (const item of settings) {
      assert.strictEqual(item.res.success, true);
      assert.ok(item.res.settings && typeof item.res.settings === 'object');
    }

    assert.strictEqual(mockChrome.tabs._created.length, concurrentCount, 'Exactly 30 tabs created for 30 valid requests');
    logPass(`120 concurrent messages processed with complete channel isolation (30 valid tabs, 30 blocked, 30 pings, 30 settings)`);
  } catch (err) {
    logFail('High-concurrency message stress test failed', err);
  }

  // --------------------------------------------------------------------------
  // Category 4: onInstalled Lifecycle & Storage Customization Preservation
  // --------------------------------------------------------------------------
  console.log('\nCategory 4: onInstalled Lifecycle & Storage Customization Preservation');

  // Scenario A: Fresh install with empty storage
  try {
    const mockChrome = createMockChrome({});
    global.chrome = mockChrome;

    await initializeStorageDefaults();

    assert.strictEqual(mockChrome.storage.sync._store.get('enabled'), true);
    assert.strictEqual(mockChrome.storage.sync._store.get('modifierKey'), 'Shift');
    assert.strictEqual(mockChrome.storage.sync._store.get('modalSize'), 'default');
    assert.strictEqual(mockChrome.storage.sync._store.get('sizePreset'), 'default');
    logPass('Fresh install populates complete default settings schema');
  } catch (err) {
    logFail('Fresh install defaults population failed', err);
  }

  // Scenario B: Pre-existing fully customized settings
  try {
    const customConfig = {
      enabled: false,
      modifierKey: 'Alt',
      modalSize: 'large',
      sizePreset: 'large'
    };
    const mockChrome = createMockChrome(customConfig);
    global.chrome = mockChrome;

    await initializeStorageDefaults();

    assert.strictEqual(mockChrome.storage.sync._store.get('enabled'), false, 'enabled: false MUST NOT be overwritten');
    assert.strictEqual(mockChrome.storage.sync._store.get('modifierKey'), 'Alt', 'modifierKey: Alt MUST NOT be overwritten');
    assert.strictEqual(mockChrome.storage.sync._store.get('modalSize'), 'large', 'modalSize: large MUST NOT be overwritten');
    assert.strictEqual(mockChrome.storage.sync._store.get('sizePreset'), 'large', 'sizePreset: large MUST NOT be overwritten');
    logPass('Existing customized settings are strictly preserved (enabled: false preserved)');
  } catch (err) {
    logFail('Existing customized settings preservation failed', err);
  }

  // Scenario C: Partial customized settings (only enabled: false set, others missing)
  try {
    const partialConfig = {
      enabled: false
    };
    const mockChrome = createMockChrome(partialConfig);
    global.chrome = mockChrome;

    await initializeStorageDefaults();

    assert.strictEqual(mockChrome.storage.sync._store.get('enabled'), false, 'Custom enabled: false must be retained');
    assert.strictEqual(mockChrome.storage.sync._store.get('modifierKey'), 'Shift', 'Missing modifierKey initialized');
    assert.strictEqual(mockChrome.storage.sync._store.get('modalSize'), 'default', 'Missing modalSize initialized');
    assert.strictEqual(mockChrome.storage.sync._store.get('sizePreset'), 'default', 'Missing sizePreset initialized');
    logPass('Partial custom settings: retains custom keys while populating only missing keys');
  } catch (err) {
    logFail('Partial custom settings test failed', err);
  }

  // Scenario D: Idempotency over multiple install/update runs
  try {
    const customConfig = {
      enabled: false,
      modifierKey: 'Ctrl',
      customUserField: 'do-not-delete'
    };
    const mockChrome = createMockChrome(customConfig);
    global.chrome = mockChrome;

    // Run 5 times successively
    for (let i = 0; i < 5; i++) {
      await initializeStorageDefaults();
    }

    assert.strictEqual(mockChrome.storage.sync._store.get('enabled'), false);
    assert.strictEqual(mockChrome.storage.sync._store.get('modifierKey'), 'Ctrl');
    assert.strictEqual(mockChrome.storage.sync._store.get('customUserField'), 'do-not-delete');
    assert.strictEqual(mockChrome.storage.sync._store.get('modalSize'), 'default');
    logPass('Storage initialization is fully idempotent across multiple successive executions');
  } catch (err) {
    logFail('Storage initialization idempotency test failed', err);
  }

  // Scenario E: Fallback from sync to local when sync throws lastError
  try {
    const mockChrome = createMockChrome({ enabled: false, modifierKey: 'Alt' });
    global.chrome = mockChrome;

    // Cause sync to fail
    mockChrome.storage.sync.failWithLastError = true;

    // Pre-seed local storage with custom settings
    mockChrome.storage.local._store.set('enabled', false);
    mockChrome.storage.local._store.set('modifierKey', 'Alt');

    const settings = await readStorage(['enabled', 'modifierKey']);
    assert.strictEqual(settings.enabled, false);
    assert.strictEqual(settings.modifierKey, 'Alt');
    logPass('readStorage falls back to local storage when sync errors out');
  } catch (err) {
    logFail('readStorage fallback to local storage failed', err);
  }

  console.log('\n---------------------------------------------------------------');
  console.log(`background.js Adversarial Results: ${results.passed} Passed, ${results.failed} Failed`);
  console.log('---------------------------------------------------------------\n');

  return results;
}

if (require.main === module) {
  runAdversarialBackgroundTests()
    .then((results) => {
      process.exit(results.failed > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error('Fatal test execution error:', err);
      process.exit(1);
    });
}

module.exports = { runAdversarialBackgroundTests };
