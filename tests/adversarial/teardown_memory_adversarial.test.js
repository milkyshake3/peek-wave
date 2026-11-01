/**
 * teardown_memory_adversarial.test.js
 * 
 * Empirical Adversarial Challenger Test Suite for Peek Wave M2:
 * Strict Low-RAM Teardown Lifecycle and Memory Hygiene.
 * 
 * Direct empirical validation of content/content.js:
 * 1. Synchronous iframe.src = 'about:blank' clearance before detachment.
 * 2. Unbinding of all event listeners (window keydown, backdrop, close, tab, copy).
 * 3. Cancellation of active timers (loadingTimeout, copyTimeout).
 * 4. Complete detachment of DOM nodes (iframe, host container) and zero memory leaks.
 * 5. High-volume repeated open/close cycles across all 4 dismissal triggers.
 * 6. Re-entrancy, double dismissal, and preemptive teardown under race conditions.
 * 7. Memory hygiene, reference breaking, and garbage collection readiness.
 */

'use strict';

const assert = require('assert');
const path = require('path');

// Target under test: Production content script engine
const content = require(path.resolve(__dirname, '../../content/content.js'));
const {
  mountModal,
  teardownModal,
  getModal,
  handleCaptureClick,
  initContentScript,
  MODAL_CSS_TEXT
} = content;

const {
  createBrowserEnvironment,
  MouseEvent,
  KeyboardEvent
} = require('../harness/dom_simulator');
const { createChromeMock } = require('../harness/chrome_mock');

// Colors for terminal reporting
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m',
  dim: '\x1b[2m'
};

function logHeader(msg) {
  console.log(`\n${colors.bright}${colors.cyan}--- ${msg} ---${colors.reset}`);
}

async function runTeardownMemoryAdversarialTests() {
  console.log(`\n${colors.bright}${colors.yellow}========================================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.yellow}  PEEK WAVE — ADVERSARIAL TEARDOWN LIFECYCLE & MEMORY HYGIENE SUITE (M2) ${colors.reset}`);
  console.log(`${colors.bright}${colors.yellow}========================================================================${colors.reset}`);

  const results = { passed: 0, failed: 0, details: [] };

  function pass(testName) {
    results.passed++;
    results.details.push({ name: testName, status: 'PASS' });
    console.log(`  ${colors.green}[PASS]${colors.reset} ${testName}`);
  }

  function fail(testName, err) {
    results.failed++;
    results.details.push({ name: testName, status: 'FAIL', error: err?.message || String(err) });
    console.error(`  ${colors.red}[FAIL]${colors.reset} ${testName}`);
    console.error(`         ${colors.red}Error: ${err?.message || err}${colors.reset}`);
    if (err?.stack) {
      console.error(`         ${colors.dim}${err.stack.split('\n').slice(1, 3).join('\n         ')}${colors.reset}`);
    }
  }

  function setupEnv(html = '<!DOCTYPE html><html><head></head><body><a id="test-link" href="https://example.com/test">Link</a></body></html>') {
    const win = createBrowserEnvironment(html);
    const chromeMock = createChromeMock({ enabled: true, modifierKey: 'shift', sizePreset: 'default' });
    win.chrome = chromeMock;
    global.chrome = chromeMock;
    return { win, doc: win.document, chrome: chromeMock };
  }

  // ==========================================================================
  // SECTION 1: Synchronous iframe.src = 'about:blank' & Detachment Sequence
  // ==========================================================================
  logHeader('Section 1: Synchronous iframe.src Clearance & Detachment Sequence');

  // Test 1.1: Verify iframe.src is set to 'about:blank' synchronously BEFORE iframe is removed from DOM
  try {
    const { win, doc } = setupEnv();
    const modal = mountModal('https://example.com/stream-video', { win });
    assert.ok(modal, 'Modal should be mounted');
    const iframe = modal.iframe;
    assert.strictEqual(iframe.src, 'https://example.com/stream-video');

    // Instrument iframe to track operation order
    const ops = [];
    const originalSrc = iframe.src;
    let recordedSrcAtRemoval = null;

    // Spy on parent removal
    const originalRemoveChild = iframe.parentNode.removeChild.bind(iframe.parentNode);
    iframe.parentNode.removeChild = function (child) {
      if (child === iframe) {
        recordedSrcAtRemoval = iframe.src;
        ops.push({ op: 'removeChild', src: iframe.src });
      }
      return originalRemoveChild(child);
    };

    // Override src setter to log timing
    let currentSrc = originalSrc;
    Object.defineProperty(iframe, 'src', {
      get: () => currentSrc,
      set: (val) => {
        currentSrc = val;
        ops.push({ op: 'setSrc', value: val });
      },
      configurable: true
    });

    teardownModal(win);

    assert.strictEqual(recordedSrcAtRemoval, 'about:blank', 'iframe.src must be about:blank at the exact moment of DOM removal');
    assert.ok(ops.length >= 2, 'Must record setSrc and removeChild operations');
    const setSrcIdx = ops.findIndex(o => o.op === 'setSrc' && o.value === 'about:blank');
    const removeIdx = ops.findIndex(o => o.op === 'removeChild');
    assert.ok(setSrcIdx !== -1, 'setSrc to about:blank must occur');
    assert.ok(removeIdx !== -1, 'removeChild must occur');
    assert.ok(setSrcIdx < removeIdx, 'iframe.src = about:blank must happen BEFORE removeChild to halt worker/media threads synchronously');

    pass('1.1: iframe.src = about:blank is executed synchronously BEFORE DOM detachment');
  } catch (err) {
    fail('1.1: iframe.src = about:blank before DOM detachment', err);
  }

  // Test 1.2: iframe.onload and iframe.onerror are synchronously cleared to null
  try {
    const { win } = setupEnv();
    const modal = mountModal('https://example.com/media-target', { win });
    const iframe = modal.iframe;

    // Attach mock onload/onerror
    iframe.onload = () => {};
    iframe.onerror = () => {};

    teardownModal(win);

    assert.strictEqual(iframe.onload, null, 'iframe.onload must be nullified during teardown');
    assert.strictEqual(iframe.onerror, null, 'iframe.onerror must be nullified during teardown');
    pass('1.2: iframe.onload and iframe.onerror are nullified synchronously');
  } catch (err) {
    fail('1.2: iframe handlers nullification', err);
  }

  // Test 1.3: Detached iframe has parentNode === null immediately following teardown
  try {
    const { win } = setupEnv();
    const modal = mountModal('https://example.com/parent-check', { win });
    const iframe = modal.iframe;
    assert.ok(iframe.parentNode, 'iframe must have parentNode when mounted');

    teardownModal(win);

    assert.strictEqual(iframe.parentNode, null, 'Detached iframe must have parentNode === null');
    pass('1.3: Detached iframe has parentNode === null immediately after teardown');
  } catch (err) {
    fail('1.3: Detached iframe parentNode check', err);
  }

  // Test 1.4: Shadow host container (#peek-wave-host) is completely detached from document.documentElement
  try {
    const { win, doc } = setupEnv();
    mountModal('https://example.com/host-check', { win });
    const host = doc.getElementById('peek-wave-host');
    assert.ok(host, '#peek-wave-host must be present in document while active');
    assert.strictEqual(host.parentNode, doc.documentElement, 'Host must be child of document.documentElement');

    teardownModal(win);

    assert.strictEqual(doc.getElementById('peek-wave-host'), null, '#peek-wave-host must be completely absent from document');
    assert.strictEqual(host.parentNode, null, 'Detached host must have parentNode === null');
    pass('1.4: Shadow host container (#peek-wave-host) is completely detached from document');
  } catch (err) {
    fail('1.4: Shadow host detachment check', err);
  }

  // Test 1.5: getModal() returns null immediately after teardown
  try {
    const { win } = setupEnv();
    mountModal('https://example.com/modal-ref-check', { win });
    assert.ok(getModal() !== null, 'getModal() must return active modal while open');

    teardownModal(win);

    assert.strictEqual(getModal(), null, 'getModal() must return null immediately after teardown');
    pass('1.5: getModal() returns null immediately following teardown');
  } catch (err) {
    fail('1.5: getModal() null check', err);
  }

  // Test 1.6: Synchronous about:blank across varied complex URLs (hash, query, long path)
  try {
    const { win } = setupEnv();
    const testUrls = [
      'https://en.wikipedia.org/wiki/Browser_extension?query=peek&sort=asc#Architecture',
      'https://github.com/developer/repo/blob/main/src/index.ts?raw=true&token=xyz123',
      'https://sub.domain.deep.example.co.uk:8443/very/long/path/name/resource.html'
    ];

    for (const url of testUrls) {
      const modal = mountModal(url, { win });
      const iframe = modal.iframe;
      assert.strictEqual(iframe.src, url);
      teardownModal(win);
      assert.strictEqual(iframe.src, 'about:blank', `iframe.src must be about:blank for ${url}`);
      assert.strictEqual(getModal(), null);
    }
    pass('1.6: Synchronous about:blank clearance verified across varied complex target URLs');
  } catch (err) {
    fail('1.6: Varied URLs about:blank clearance', err);
  }

  // ==========================================================================
  // SECTION 2: All 4 Dismissal Trigger Mechanisms
  // ==========================================================================
  logHeader('Section 2: All 4 Dismissal Trigger Mechanisms');

  // Test 2.1: Dismissal via Escape keydown event (e.key === 'Escape') in capture phase
  try {
    const { win, doc } = setupEnv();
    mountModal('https://example.com/escape-key-test', { win });
    assert.ok(getModal() !== null);

    const escEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      bubbles: true,
      cancelable: true
    });
    win.dispatchEvent(escEvent);

    assert.strictEqual(escEvent.defaultPrevented, true, 'Escape keydown must be preventDefaulted');
    assert.strictEqual(escEvent._propagationStopped, true, 'Escape keydown must be stopPropagation');
    assert.strictEqual(escEvent._immediatePropagationStopped, true, 'Escape keydown must be stopImmediatePropagation');
    assert.strictEqual(getModal(), null, 'Modal must be torn down via Escape key');
    assert.strictEqual(doc.getElementById('peek-wave-host'), null, 'Host must be removed');
    pass('2.1: Dismissal via Escape key (e.key === "Escape") in window capture phase');
  } catch (err) {
    fail('2.1: Escape key dismissal', err);
  }

  // Test 2.2: Dismissal via Escape code (e.code === 'Escape') when e.key is non-standard
  try {
    const { win, doc } = setupEnv();
    mountModal('https://example.com/escape-code-test', { win });
    assert.ok(getModal() !== null);

    const escCodeEvent = new KeyboardEvent('keydown', {
      key: 'Esc', // Legacy or non-standard key name
      code: 'Escape',
      bubbles: true,
      cancelable: true
    });
    win.dispatchEvent(escCodeEvent);

    assert.strictEqual(getModal(), null, 'Modal must be torn down via e.code === "Escape"');
    assert.strictEqual(doc.getElementById('peek-wave-host'), null);
    pass('2.2: Dismissal via Escape code fallback (e.code === "Escape")');
  } catch (err) {
    fail('2.2: Escape code fallback dismissal', err);
  }

  // Test 2.3: Dismissal via Backdrop click
  try {
    const { win, doc } = setupEnv();
    const modal = mountModal('https://example.com/backdrop-click-test', { win });
    assert.ok(getModal() !== null);
    const backdrop = modal.backdrop;
    assert.ok(backdrop, 'Backdrop element must exist');

    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0
    });
    backdrop.dispatchEvent(clickEvent);

    assert.strictEqual(clickEvent.defaultPrevented, true, 'Backdrop click must be preventDefaulted');
    assert.strictEqual(clickEvent._propagationStopped, true, 'Backdrop click must stopPropagation');
    assert.strictEqual(getModal(), null, 'Modal must be torn down via backdrop click');
    assert.strictEqual(doc.getElementById('peek-wave-host'), null);
    pass('2.3: Dismissal via Backdrop overlay click');
  } catch (err) {
    fail('2.3: Backdrop click dismissal', err);
  }

  // Test 2.4: Dismissal via Close button click
  try {
    const { win, doc } = setupEnv();
    const modal = mountModal('https://example.com/close-btn-test', { win });
    assert.ok(getModal() !== null);
    const closeBtn = modal.closeBtn;
    assert.ok(closeBtn, 'Close button must exist');

    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0
    });
    closeBtn.dispatchEvent(clickEvent);

    assert.strictEqual(clickEvent._propagationStopped, true, 'Close button click must stopPropagation');
    assert.strictEqual(getModal(), null, 'Modal must be torn down via Close button click');
    assert.strictEqual(doc.getElementById('peek-wave-host'), null);
    pass('2.4: Dismissal via Close button click');
  } catch (err) {
    fail('2.4: Close button click dismissal', err);
  }

  // Test 2.5: Dismissal via Open in New Tab action button
  try {
    const { win, doc, chrome } = setupEnv();
    const targetUrl = 'https://example.com/tab-handoff-test';
    const modal = mountModal(targetUrl, { win });
    assert.ok(getModal() !== null);
    const tabBtn = modal.tabBtn;
    assert.ok(tabBtn, 'Tab button must exist');

    // Spy on chrome.runtime.sendMessage
    let sentMessage = null;
    chrome.runtime.sendMessage = function (msg) {
      sentMessage = msg;
    };

    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0
    });
    tabBtn.dispatchEvent(clickEvent);

    assert.strictEqual(clickEvent._propagationStopped, true, 'Tab button click must stopPropagation');
    assert.ok(sentMessage !== null, 'runtime.sendMessage must be invoked');
    assert.strictEqual(sentMessage.action, 'OPEN_TAB', 'Message action must be OPEN_TAB');
    assert.strictEqual(sentMessage.url, targetUrl, 'Message url must match target URL');
    assert.strictEqual(getModal(), null, 'Modal must be immediately torn down upon Open in New Tab click');
    assert.strictEqual(doc.getElementById('peek-wave-host'), null);
    pass('2.5: Dismissal via Open in New Tab action button with OPEN_TAB messaging');
  } catch (err) {
    fail('2.5: Open in New Tab dismissal', err);
  }

  // Test 2.6: Negative test: Clicks inside modal card must NOT dismiss modal
  try {
    const { win, doc } = setupEnv();
    const modal = mountModal('https://example.com/card-click-shield', { win });
    const modalCard = modal.modal;

    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0
    });
    modalCard.dispatchEvent(clickEvent);

    assert.strictEqual(clickEvent._propagationStopped, true, 'Modal card clicks must stopPropagation');
    assert.ok(getModal() !== null, 'Modal must remain open when modal card is clicked');
    assert.ok(doc.getElementById('peek-wave-host') !== null, 'Host element must remain mounted');

    teardownModal(win);
    pass('2.6: Negative test: Clicking inside the modal card does NOT trigger teardown');
  } catch (err) {
    fail('2.6: Card click shield test', err);
  }

  // Test 2.7: Negative test: Non-Escape keys do NOT trigger teardown
  try {
    const { win, doc } = setupEnv();
    mountModal('https://example.com/non-esc-keys', { win });

    const nonEscKeys = ['Enter', 'Space', 'Tab', 'ArrowDown', 'ArrowUp', 'KeyA', 'Shift', 'Control', 'Alt'];
    for (const key of nonEscKeys) {
      const evt = new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true });
      win.dispatchEvent(evt);
      assert.strictEqual(evt.defaultPrevented, false, `${key} key must not be preventDefaulted`);
      assert.ok(getModal() !== null, `Modal must remain mounted on ${key}`);
      assert.ok(doc.getElementById('peek-wave-host') !== null);
    }

    teardownModal(win);
    pass('2.7: Negative test: Non-Escape keys (Enter, Space, Tab, Arrows) do NOT dismiss modal');
  } catch (err) {
    fail('2.7: Non-Escape keys negative test', err);
  }

  // ==========================================================================
  // SECTION 3: Event Listener Lifecycle & Zero Residual Listeners
  // ==========================================================================
  logHeader('Section 3: Event Listener Lifecycle & Zero Residual Listeners');

  // Test 3.1: Global keydown capture listener on win: added on mount, verified removed on teardown
  try {
    const { win } = setupEnv();
    const initialKeydownListeners = (win._listeners?.get('keydown') || []).length;

    const modal = mountModal('https://example.com/keydown-listener-test', { win });
    const mountedKeydownListeners = (win._listeners?.get('keydown') || []).length;
    assert.strictEqual(mountedKeydownListeners, initialKeydownListeners + 1, 'Exactly 1 keydown listener must be added on mount');

    teardownModal(win);

    const postKeydownListeners = (win._listeners?.get('keydown') || []).length;
    assert.strictEqual(postKeydownListeners, initialKeydownListeners, 'Keydown listener must be cleanly removed on teardown');
    pass('3.1: Global keydown capture listener on window is completely unbound on teardown');
  } catch (err) {
    fail('3.1: Window keydown listener unbinding', err);
  }

  // Test 3.2: Firing Escape on window after teardown has zero effect
  try {
    const { win } = setupEnv();
    mountModal('https://example.com/post-teardown-esc', { win });
    teardownModal(win);

    const escEvent = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true });
    win.dispatchEvent(escEvent);

    assert.strictEqual(escEvent.defaultPrevented, false, 'Post-teardown Escape must NOT be preventDefaulted');
    assert.strictEqual(escEvent._propagationStopped, false, 'Post-teardown Escape must NOT stopPropagation');
    pass('3.2: Post-teardown Escape key event produces no side-effects and is not hijacked');
  } catch (err) {
    fail('3.2: Post-teardown Escape neutrality', err);
  }

  // Test 3.3: Backdrop, Close, Tab, and Copy button event listeners are unbound
  try {
    const { win } = setupEnv();
    const modal = mountModal('https://example.com/button-listeners-test', { win });
    const { backdrop, closeBtn, tabBtn, copyBtn } = modal;

    assert.ok((backdrop._listeners?.get('click') || []).length >= 1, 'Backdrop must have click listener');
    assert.ok((closeBtn._listeners?.get('click') || []).length >= 1, 'Close button must have click listener');
    assert.ok((tabBtn._listeners?.get('click') || []).length >= 1, 'Tab button must have click listener');
    assert.ok((copyBtn._listeners?.get('click') || []).length >= 1, 'Copy button must have click listener');

    teardownModal(win);

    assert.strictEqual((backdrop._listeners?.get('click') || []).length, 0, 'Backdrop click listener must be removed');
    assert.strictEqual((closeBtn._listeners?.get('click') || []).length, 0, 'Close button click listener must be removed');
    assert.strictEqual((tabBtn._listeners?.get('click') || []).length, 0, 'Tab button click listener must be removed');
    assert.strictEqual((copyBtn._listeners?.get('click') || []).length, 0, 'Copy button click listener must be removed');

    pass('3.3: Backdrop, Close, Tab, and Copy button event listeners are all unbound');
  } catch (err) {
    fail('3.3: UI button listeners unbinding', err);
  }

  // Test 3.4: Zero residual resize listeners on window
  try {
    const { win } = setupEnv();
    mountModal('https://example.com/resize-check', { win });
    const resizeListenersWhileMounted = (win._listeners?.get('resize') || []).length;
    teardownModal(win);
    const resizeListenersAfterTeardown = (win._listeners?.get('resize') || []).length;

    assert.strictEqual(resizeListenersAfterTeardown, 0, 'No resize listeners should linger on window');
    pass('3.4: Verified zero residual resize listeners on window');
  } catch (err) {
    fail('3.4: Window resize listeners check', err);
  }

  // ==========================================================================
  // SECTION 4: Active Timers Cancellation & Callback Neutralization
  // ==========================================================================
  logHeader('Section 4: Active Timers Cancellation & Callback Neutralization');

  // Test 4.1: Teardown with active loadingTimeout (8000ms): clearTimeout called with exact ID
  try {
    const { win } = setupEnv();
    let clearedTimerIds = [];
    const origClearTimeout = global.clearTimeout;
    global.clearTimeout = function (id) {
      clearedTimerIds.push(id);
      return origClearTimeout(id);
    };

    try {
      const modal = mountModal('https://example.com/loading-timeout-test', { win });
      const loadingTimeoutId = modal.loadingTimeout;
      assert.ok(loadingTimeoutId, 'modal.loadingTimeout must be initialized');

      teardownModal(win);

      assert.ok(clearedTimerIds.includes(loadingTimeoutId), 'loadingTimeout must be passed to clearTimeout during teardown');
      pass('4.1: Active loadingTimeout (8000ms) is cancelled immediately via clearTimeout');
    } finally {
      global.clearTimeout = origClearTimeout;
    }
  } catch (err) {
    fail('4.1: loadingTimeout cancellation check', err);
  }

  // Test 4.2: Teardown during active copy feedback cancels copyTimeout (1500ms)
  try {
    const { win } = setupEnv();
    let clearedTimerIds = [];
    const origClearTimeout = global.clearTimeout;
    global.clearTimeout = function (id) {
      clearedTimerIds.push(id);
      return origClearTimeout(id);
    };

    try {
      const modal = mountModal('https://example.com/copy-feedback-test', { win });
      const copyBtn = modal.copyBtn;

      // Click copy button to trigger copyTimeout
      copyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      const copyTimeoutId = modal.copyTimeout;
      assert.ok(copyTimeoutId, 'modal.copyTimeout must be scheduled after Copy click');

      teardownModal(win);

      assert.ok(clearedTimerIds.includes(copyTimeoutId), 'copyTimeout must be cancelled during teardown');
      pass('4.2: Teardown during active copy feedback immediately cancels copyTimeout');
    } finally {
      global.clearTimeout = origClearTimeout;
    }
  } catch (err) {
    fail('4.2: copyTimeout cancellation check', err);
  }

  // Test 4.3: Rapid multiple copy clicks track and cancel latest copyTimeout
  try {
    const { win } = setupEnv();
    const modal = mountModal('https://example.com/rapid-copy-test', { win });
    const copyBtn = modal.copyBtn;

    // Click copy button 5 times rapidly
    for (let i = 0; i < 5; i++) {
      copyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    }
    const finalCopyTimeout = modal.copyTimeout;
    assert.ok(finalCopyTimeout, 'Final copy timeout must exist');

    let clearedTimerIds = [];
    const origClearTimeout = global.clearTimeout;
    global.clearTimeout = function (id) {
      clearedTimerIds.push(id);
      return origClearTimeout(id);
    };

    try {
      teardownModal(win);
      assert.ok(clearedTimerIds.includes(finalCopyTimeout), 'Final copyTimeout must be cancelled upon teardown');
      pass('4.3: Rapid copy clicks maintain consistent timer tracking and teardown cancellation');
    } finally {
      global.clearTimeout = origClearTimeout;
    }
  } catch (err) {
    fail('4.3: Rapid copy clicks timer hygiene', err);
  }

  // ==========================================================================
  // SECTION 5: High-Stress Churn & Repeated Open/Close Cycles
  // ==========================================================================
  logHeader('Section 5: High-Stress Churn & Repeated Open/Close Cycles');

  // Test 5.1: 100 consecutive cycles of Mount -> Teardown via Escape
  try {
    const { win, doc } = setupEnv();
    const initialKeydowns = (win._listeners?.get('keydown') || []).length;

    for (let i = 0; i < 100; i++) {
      mountModal(`https://example.com/cycle-escape-${i}`, { win });
      assert.strictEqual(doc.getElementById('peek-wave-host') !== null, true);
      win.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
      assert.strictEqual(getModal(), null);
      assert.strictEqual(doc.getElementById('peek-wave-host'), null);
    }

    const postKeydowns = (win._listeners?.get('keydown') || []).length;
    assert.strictEqual(postKeydowns, initialKeydowns, 'Keydown listeners must not accumulate after 100 Escape cycles');
    assert.strictEqual(doc.documentElement.childNodes.filter(n => n.id === 'peek-wave-host').length, 0);
    pass('5.1: 100 consecutive Mount -> Escape cycles: 0 DOM leaks, 0 listener accumulation');
  } catch (err) {
    fail('5.1: 100 Escape cycles', err);
  }

  // Test 5.2: 100 consecutive cycles of Mount -> Teardown via Backdrop Click
  try {
    const { win, doc } = setupEnv();
    for (let i = 0; i < 100; i++) {
      const modal = mountModal(`https://example.com/cycle-backdrop-${i}`, { win });
      modal.backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      assert.strictEqual(getModal(), null);
      assert.strictEqual(doc.getElementById('peek-wave-host'), null);
    }
    assert.strictEqual((win._listeners?.get('keydown') || []).length, 0);
    pass('5.2: 100 consecutive Mount -> Backdrop Click cycles: 0 DOM leaks, 0 listener accumulation');
  } catch (err) {
    fail('5.2: 100 Backdrop cycles', err);
  }

  // Test 5.3: 100 consecutive cycles of Mount -> Teardown via Close Button
  try {
    const { win, doc } = setupEnv();
    for (let i = 0; i < 100; i++) {
      const modal = mountModal(`https://example.com/cycle-close-${i}`, { win });
      modal.closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      assert.strictEqual(getModal(), null);
      assert.strictEqual(doc.getElementById('peek-wave-host'), null);
    }
    assert.strictEqual((win._listeners?.get('keydown') || []).length, 0);
    pass('5.3: 100 consecutive Mount -> Close Button cycles: 0 DOM leaks, 0 listener accumulation');
  } catch (err) {
    fail('5.3: 100 Close Button cycles', err);
  }

  // Test 5.4: 100 consecutive cycles of Mount -> Teardown via Open in New Tab
  try {
    const { win, doc, chrome } = setupEnv();
    let dispatchedTabUrls = [];
    chrome.runtime.sendMessage = function (msg) {
      if (msg?.action === 'OPEN_TAB') dispatchedTabUrls.push(msg.url);
    };

    for (let i = 0; i < 100; i++) {
      const targetUrl = `https://example.com/cycle-tab-${i}`;
      const modal = mountModal(targetUrl, { win });
      modal.tabBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      assert.strictEqual(getModal(), null);
      assert.strictEqual(doc.getElementById('peek-wave-host'), null);
    }

    assert.strictEqual(dispatchedTabUrls.length, 100);
    assert.strictEqual((win._listeners?.get('keydown') || []).length, 0);
    pass('5.4: 100 consecutive Mount -> Open in New Tab cycles: 100 tab handoffs, 0 DOM leaks');
  } catch (err) {
    fail('5.4: 100 Tab Handoff cycles', err);
  }

  // Test 5.5: 200 randomized mixed cycles across all 4 dismissal paths
  try {
    const { win, doc, chrome } = setupEnv();
    const triggers = ['escape', 'backdrop', 'close', 'tab'];

    for (let i = 0; i < 200; i++) {
      const targetUrl = `https://example.com/random-${i}`;
      const modal = mountModal(targetUrl, { win });
      const trigger = triggers[i % 4];

      if (trigger === 'escape') {
        win.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
      } else if (trigger === 'backdrop') {
        modal.backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      } else if (trigger === 'close') {
        modal.closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      } else if (trigger === 'tab') {
        modal.tabBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      }

      assert.strictEqual(getModal(), null, `Cycle ${i} (${trigger}) must tear down modal`);
      assert.strictEqual(doc.getElementById('peek-wave-host'), null, `Cycle ${i} host must be detached`);
    }

    assert.strictEqual((win._listeners?.get('keydown') || []).length, 0, 'Zero residual keydown listeners after 200 mixed cycles');
    assert.strictEqual(doc.documentElement.childNodes.filter(n => n.id === 'peek-wave-host').length, 0, 'Zero host elements remaining');
    pass('5.5: 200 randomized mixed dismissal cycles: 100% clean teardown and zero leaks');
  } catch (err) {
    fail('5.5: 200 randomized mixed dismissal cycles', err);
  }

  // ==========================================================================
  // SECTION 6: Re-entrancy, Double Dismissal & Preemptive Teardown
  // ==========================================================================
  logHeader('Section 6: Re-entrancy, Double Dismissal & Preemptive Teardown');

  // Test 6.1: Double dismissal: calling teardownModal() twice consecutively is safe
  try {
    const { win, doc } = setupEnv();
    mountModal('https://example.com/double-teardown', { win });

    // First teardown
    teardownModal(win);
    assert.strictEqual(getModal(), null);
    assert.strictEqual(doc.getElementById('peek-wave-host'), null);

    // Second teardown immediately after
    teardownModal(win);
    assert.strictEqual(getModal(), null);
    assert.strictEqual(doc.getElementById('peek-wave-host'), null);

    pass('6.1: Double dismissal: successive teardownModal() calls are idempotent and non-throwing');
  } catch (err) {
    fail('6.1: Double dismissal idempotency', err);
  }

  // Test 6.2: Simultaneous triggers race condition: Escape key + Close button + Backdrop in same tick
  try {
    const { win, doc } = setupEnv();
    const modal = mountModal('https://example.com/multi-trigger-race', { win });
    const { backdrop, closeBtn } = modal;

    // Dispatch all three triggers in immediate sequence without waiting
    win.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
    closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

    assert.strictEqual(getModal(), null);
    assert.strictEqual(doc.getElementById('peek-wave-host'), null);
    assert.strictEqual((win._listeners?.get('keydown') || []).length, 0);
    pass('6.2: Simultaneous triggers race condition handled cleanly without double-free errors');
  } catch (err) {
    fail('6.2: Multi-trigger race condition', err);
  }

  // Test 6.3: Preemptive teardown on rapid re-mount: mountModal(url2) while url1 is open
  try {
    const { win, doc } = setupEnv();
    const modal1 = mountModal('https://example.com/first-preview', { win });
    const iframe1 = modal1.iframe;
    const host1 = modal1.hostElement;

    // Immediately mount second URL without closing first
    const modal2 = mountModal('https://example.com/second-preview', { win });
    const iframe2 = modal2.iframe;
    const host2 = modal2.hostElement;

    assert.notStrictEqual(host1, host2, 'New host element must be created');
    assert.strictEqual(iframe1.src, 'about:blank', 'Old modal iframe must be reset to about:blank');
    assert.strictEqual(iframe1.parentNode, null, 'Old iframe must be detached');
    assert.strictEqual(host1.parentNode, null, 'Old host element must be detached');

    assert.strictEqual(doc.getElementById('peek-wave-host'), host2, 'Current DOM host must be host2');
    assert.strictEqual(iframe2.src, 'https://example.com/second-preview', 'New iframe must load second URL');
    assert.strictEqual((win._listeners?.get('keydown') || []).length, 1, 'Exactly 1 keydown listener must exist on window');

    teardownModal(win);
    assert.strictEqual(getModal(), null);
    assert.strictEqual(doc.getElementById('peek-wave-host'), null);
    assert.strictEqual((win._listeners?.get('keydown') || []).length, 0);

    pass('6.3: Preemptive teardown on rapid re-mount cleanly tears down old modal before mounting new');
  } catch (err) {
    fail('6.3: Preemptive teardown on rapid re-mount', err);
  }

  // Test 6.4: 50 rapid sequential mountModal calls without teardown -> only final modal in DOM
  try {
    const { win, doc } = setupEnv();
    const iframes = [];

    for (let i = 0; i < 50; i++) {
      const m = mountModal(`https://example.com/rapid-mount-${i}`, { win });
      iframes.push(m.iframe);
    }

    assert.strictEqual(doc.documentElement.childNodes.filter(n => n.id === 'peek-wave-host').length, 1, 'Only 1 host in DOM');
    assert.strictEqual((win._listeners?.get('keydown') || []).length, 1, 'Only 1 keydown listener on window');

    // All previous 49 iframes must have src = 'about:blank' and parentNode === null
    for (let i = 0; i < 49; i++) {
      assert.strictEqual(iframes[i].src, 'about:blank', `Iframe ${i} must have src about:blank`);
      assert.strictEqual(iframes[i].parentNode, null, `Iframe ${i} must be detached`);
    }

    // Final iframe must be active
    assert.strictEqual(iframes[49].src, 'https://example.com/rapid-mount-49');
    assert.ok(iframes[49].parentNode !== null);

    teardownModal(win);
    assert.strictEqual(getModal(), null);
    assert.strictEqual(doc.getElementById('peek-wave-host'), null);
    assert.strictEqual((win._listeners?.get('keydown') || []).length, 0);

    pass('6.4: 50 rapid sequential mountModal calls cleanly tear down all preceding instances');
  } catch (err) {
    fail('6.4: 50 rapid sequential mountModal calls', err);
  }

  // Test 6.5: teardownModal(null) or no arguments resolves window fallback safely
  try {
    const { win, doc } = setupEnv();
    mountModal('https://example.com/null-win-fallback', { win });
    assert.ok(getModal() !== null);

    // Call teardown without passing win
    teardownModal();

    assert.strictEqual(getModal(), null, 'Modal must be torn down even if win argument is omitted');
    assert.strictEqual(doc.getElementById('peek-wave-host'), null);
    pass('6.5: teardownModal() without window argument resolves win fallback safely');
  } catch (err) {
    fail('6.5: teardownModal null window fallback', err);
  }

  // ==========================================================================
  // SECTION 7: Memory Hygiene, Reference Breaking & GC Readiness
  // ==========================================================================
  logHeader('Section 7: Memory Hygiene, Reference Breaking & GC Readiness');

  // Test 7.1: Verify currentModal is set to null, eliminating root references
  try {
    const { win } = setupEnv();
    mountModal('https://example.com/gc-readiness-test', { win });
    assert.ok(getModal() !== null);

    teardownModal(win);

    assert.strictEqual(getModal(), null, 'currentModal must be strictly null');
    pass('7.1: currentModal reference is completely broken (set to null) for V8 GC');
  } catch (err) {
    fail('7.1: currentModal GC reference break', err);
  }

  // Test 7.2: Verify host element has no children attached to document.documentElement
  try {
    const { win, doc } = setupEnv();
    const initialChildren = doc.documentElement.childNodes.length;
    mountModal('https://example.com/clean-root-test', { win });
    assert.strictEqual(doc.documentElement.childNodes.length, initialChildren + 1);

    teardownModal(win);

    assert.strictEqual(doc.documentElement.childNodes.length, initialChildren, 'documentElement must have original children count');
    pass('7.2: document.documentElement returns to pristine child count post-teardown');
  } catch (err) {
    fail('7.2: Clean root child count check', err);
  }

  // Test 7.3: DOM Simulator heap stability verification
  try {
    const { win } = setupEnv();
    const memBefore = process.memoryUsage().heapUsed;

    for (let i = 0; i < 300; i++) {
      mountModal(`https://example.com/heap-audit-${i}`, { win });
      teardownModal(win);
    }

    if (global.gc) {
      global.gc();
    }
    const memAfter = process.memoryUsage().heapUsed;
    const diffMb = (memAfter - memBefore) / (1024 * 1024);

    // Heap difference after 300 mount/teardown cycles should be minimal (< 35MB)
    assert.ok(diffMb < 35, `Heap difference (${diffMb.toFixed(2)} MB) exceeds threshold`);
    pass(`7.3: 300 mount/teardown cycles demonstrate stable heap memory (delta: ${diffMb.toFixed(2)} MB)`);
  } catch (err) {
    fail('7.3: Heap stability verification', err);
  }

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log(`\n${colors.bright}${colors.yellow}========================================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.yellow}               ADVERSARIAL VERIFICATION SUMMARY (M2)                   ${colors.reset}`);
  console.log(`${colors.bright}${colors.yellow}========================================================================${colors.reset}`);
  console.log(`- TOTAL TESTS EXECUTED: ${results.passed + results.failed}`);
  console.log(`- PASSED:               ${colors.green}${results.passed}${colors.reset}`);
  console.log(`- FAILED:               ${results.failed > 0 ? colors.red + results.failed + colors.reset : colors.green + '0' + colors.reset}`);
  console.log(`- LIFECYCLE VERDICT:    ${results.failed === 0 ? colors.green + 'APPROVE (100% PASS)' + colors.reset : colors.red + 'REQUEST_CHANGES' + colors.reset}`);
  console.log(`${colors.bright}${colors.yellow}========================================================================${colors.reset}\n`);

  return results;
}

if (require.main === module) {
  runTeardownMemoryAdversarialTests()
    .then(r => {
      process.exit(r.failed > 0 ? 1 : 0);
    })
    .catch(err => {
      console.error('Fatal test error:', err);
      process.exit(1);
    });
}

module.exports = { runTeardownMemoryAdversarialTests };
