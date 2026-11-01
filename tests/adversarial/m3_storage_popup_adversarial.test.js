/**
 * m3_storage_popup_adversarial.test.js
 * 
 * Empirical Adversarial Challenger & Stress Test Suite for Milestone M3:
 * Settings Popup & Storage Sync
 * 
 * Challenge Categories:
 * 1. Storage Quota & Fallback Mechanics:
 *    - QUOTA_BYTES_PER_ITEM simulation and generic sync error fallback to chrome.storage.local
 *    - Strict latency requirement: all writes must complete without artificial delays (<10ms)
 *    - Dual-key sync (modalSize & sizePreset) consistency across fallback pathways
 *    - Fallback during storage reads when sync area fails
 *    - Extreme rapid write stress (50 consecutive writes) under active quota error
 *    - Total failure resilience when both storage areas fail
 * 
 * 2. Bidirectional Synchronization:
 *    - Query selector resolution of radio groups in simulated DOM environment
 *    - Visual radio pill clicks updating accessible <select> elements and triggering save
 *    - Programmatic <select> changes updating corresponding radio pills
 *    - Modal dimension presets updating size hint indicators
 *    - 100 rapid alternating cycles maintaining 100% state lockstep
 *    - Case-insensitive & alias normalization (Shift, OPTION, Command, LARGE)
 *    - Master toggle switch driving dynamic badge and body status
 *    - Factory reset button restoring defaults across both radios and selects
 * 
 * 3. Multi-Tab Synchronization:
 *    - 5 concurrent active tabs running live content/content.js
 *    - Real-time in-memory propagation of popup changes to all active tabs
 *    - Dynamic modifier switching without page reload verified in all tabs
 *    - Instant disable / re-enable halting / restoring interception across tabs
 *    - Modal size preset propagation to subsequent modal mounts
 *    - Synchronization persistence under storage quota errors
 *    - High-frequency burst of 30 alternating mutations converging cleanly
 *    - Tab isolation between concurrent tabs
 * 
 * 4. Forensic Static & Runtime Invariant Verification:
 *    - Direct VM sandbox evaluation of live popup/popup.js
 *    - Zero debounce delay forensic AST / pattern check
 *    - DOM Simulator compatibility: popup.toggleEl.type and checked evaluate truthfully
 *    - Defensive fallback element creation in bare DOM environments
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { setupTestEnvironment, loadLiveContentScript, loadLivePopupScript } = require('../harness/extension_loader');
const { createBrowserEnvironment } = require('../harness/dom_simulator');
const { createChromeMock } = require('../harness/chrome_mock');
const storageModule = require('../../lib/storage');
const popupModule = require('../../popup/popup');

const POPUP_HTML_PATH = path.resolve(__dirname, '../../popup/popup.html');
const POPUP_JS_PATH = path.resolve(__dirname, '../../popup/popup.js');
const STORAGE_JS_PATH = path.resolve(__dirname, '../../lib/storage.js');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureDetails = [];

function runTest(testName, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] ${testName}`);
  } catch (err) {
    failedTests++;
    console.error(`  [FAIL] ${testName}`);
    console.error(`         ${err.message}`);
    failureDetails.push({ testName, message: err.message });
  }
}

async function runAsyncTest(testName, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  [PASS] ${testName}`);
  } catch (err) {
    failedTests++;
    console.error(`  [FAIL] ${testName}`);
    console.error(`         ${err.message}`);
    failureDetails.push({ testName, message: err.message });
  }
}

/**
 * Creates an isolated popup environment with mounted popup.html DOM.
 */
function createPopupEnv(customChrome) {
  const html = fs.readFileSync(POPUP_HTML_PATH, 'utf8');
  const win = createBrowserEnvironment(html);
  const chrome = customChrome || createChromeMock();
  win.chrome = chrome;

  const popupInstance = popupModule.initPopup(win, chrome);
  return { win, doc: win.document, chrome, popup: popupInstance };
}

async function runM3StoragePopupAdversarialTests() {
  console.log('\n========================================================================');
  console.log('   CHALLENGER TEST SUITE: M3 SETTINGS POPUP & STORAGE SYNC STRESS      ');
  console.log('========================================================================\n');

  // ==========================================================================
  // SECTION 1: Storage Quota & Fallback Mechanics
  // ==========================================================================
  console.log('--- Section 1: Storage Quota & Fallback Mechanics ---');

  await runAsyncTest('1.1: QUOTA_BYTES_PER_ITEM simulation triggers fallback to local with 100% data integrity', async () => {
    const chrome = createChromeMock();
    chrome.storage.sync.simulateQuotaError = true;

    const payload = {
      enabled: false,
      modifierKey: 'alt',
      modalSize: 'compact',
      sizePreset: 'compact'
    };

    const saved = await storageModule.saveSettings(payload, chrome);
    assert.strictEqual(saved.enabled, false);
    assert.strictEqual(saved.modifierKey, 'alt');
    assert.strictEqual(saved.modalSize, 'compact');

    // Verify written to local storage
    const localData = await chrome.storage.local.get(['enabled', 'modifierKey', 'modalSize', 'sizePreset']);
    assert.strictEqual(localData.enabled, false, 'Local storage missing enabled: false on quota fallback (silent write loss in lib/storage.js)');
    assert.strictEqual(localData.modifierKey, 'alt', 'Local storage missing modifierKey on quota fallback');
    assert.strictEqual(localData.modalSize, 'compact', 'Local storage missing modalSize on quota fallback');
    assert.strictEqual(localData.sizePreset, 'compact', 'Local storage missing sizePreset on quota fallback');
  });

  await runAsyncTest('1.2: Fallback write completes in microtask window < 10ms (latency benchmark)', async () => {
    const chrome = createChromeMock();
    chrome.storage.sync.simulateQuotaError = true;

    // Benchmark 20 consecutive writes under active quota rejection
    for (let i = 0; i < 20; i++) {
      const t0 = process.hrtime.bigint();
      await storageModule.saveSettings({
        enabled: i % 2 === 0,
        modifierKey: i % 2 === 0 ? 'shift' : 'ctrl_cmd',
        modalSize: 'large'
      }, chrome);
      const t1 = process.hrtime.bigint();
      const elapsedMs = Number(t1 - t0) / 1e6;
      assert.ok(elapsedMs < 10, `Write iteration ${i} took ${elapsedMs.toFixed(3)}ms, exceeding 10ms threshold`);
    }
  });

  await runAsyncTest('1.3: Generic Promise rejection on sync.set falls back to local storage cleanly', async () => {
    const chrome = createChromeMock();
    // Simulate non-quota generic network / operation error
    chrome.storage.sync.set = () => Promise.reject(new Error('MAX_WRITE_OPERATIONS_PER_HOUR exceeded'));

    const result = await storageModule.saveSettings({ modifierKey: 'ctrl_cmd' }, chrome);
    assert.strictEqual(result.modifierKey, 'ctrl_cmd');

    const localData = await chrome.storage.local.get('modifierKey');
    assert.strictEqual(localData.modifierKey, 'ctrl_cmd');
  });

  await runAsyncTest('1.4: Chrome callback error (chrome.runtime.lastError) falls back to local storage cleanly', async () => {
    const chrome = createChromeMock();
    // Override sync.set to simulate callback lastError
    chrome.storage.sync.set = (items, cb) => {
      chrome.runtime.lastError = { message: 'Sync connection severed' };
      if (typeof cb === 'function') cb();
      return null;
    };

    const result = await storageModule.saveSettings({ modalSize: 'large' }, chrome);
    assert.strictEqual(result.modalSize, 'large');

    const localData = await chrome.storage.local.get('modalSize');
    assert.strictEqual(localData.modalSize, 'large');
  });

  await runAsyncTest('1.5: Fallback during storage reads: readSettings falls back to local when sync fails', async () => {
    const chrome = createChromeMock();
    await chrome.storage.local.set({ modifierKey: 'alt', modalSize: 'compact' });

    // Break sync.get
    chrome.storage.sync.get = () => Promise.reject(new Error('Sync read timeout'));

    const read = await storageModule.readSettings(chrome);
    assert.strictEqual(read.modifierKey, 'alt');
    assert.strictEqual(read.modalSize, 'compact');
  });

  await runAsyncTest('1.6: Dual-key lockstep: modalSize and sizePreset remain in identical lockstep on quota fallback', async () => {
    const chrome = createChromeMock();
    chrome.storage.sync.simulateQuotaError = true;

    // Write with only modalSize
    await storageModule.saveSettings({ modalSize: 'large' }, chrome);
    let localData = await chrome.storage.local.get(['modalSize', 'sizePreset']);
    assert.strictEqual(localData.modalSize, 'large', 'local.modalSize not populated');
    assert.strictEqual(localData.sizePreset, 'large', 'local.sizePreset not populated');

    // Write with only sizePreset
    await storageModule.saveSettings({ sizePreset: 'compact' }, chrome);
    localData = await chrome.storage.local.get(['modalSize', 'sizePreset']);
    assert.strictEqual(localData.modalSize, 'compact');
    assert.strictEqual(localData.sizePreset, 'compact');
  });

  await runAsyncTest('1.7: Extreme rapid write stress: 50 consecutive writes under persistent quota error without unhandled rejections', async () => {
    const chrome = createChromeMock();
    chrome.storage.sync.simulateQuotaError = true;

    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(
        storageModule.saveSettings({
          enabled: i % 2 === 0,
          modifierKey: i % 3 === 0 ? 'shift' : (i % 3 === 1 ? 'alt' : 'ctrl_cmd'),
          modalSize: 'default'
        }, chrome)
      );
    }

    const results = await Promise.all(promises);
    assert.strictEqual(results.length, 50);

    const localFinal = await chrome.storage.local.get(['enabled', 'modifierKey']);
    assert.ok(localFinal.enabled !== undefined, 'Local storage not populated under quota stress');
  });

  await runAsyncTest('1.8: Total failure resilience: saveSettings catches when both sync and local fail without unhandled crash', async () => {
    const chrome = createChromeMock();
    chrome.storage.sync.set = () => Promise.reject(new Error('Fatal sync failure'));
    chrome.storage.local.set = () => Promise.reject(new Error('Fatal disk write failure'));

    let caught = false;
    try {
      await storageModule.saveSettings({ enabled: false }, chrome);
    } catch (err) {
      caught = true;
      assert.ok(err.message.includes('Fatal'));
    }
    assert.strictEqual(caught, true);
  });

  // ==========================================================================
  // SECTION 2: Bidirectional Synchronization (Radio Pills vs Selects)
  // ==========================================================================
  console.log('\n--- Section 2: Bidirectional Synchronization (Radio Pills vs Selects) ---');

  runTest('2.0: Query selector resolution: compound selector in popup.js vs DOM simulator capability', () => {
    const html = fs.readFileSync(POPUP_HTML_PATH, 'utf8');
    const win = createBrowserEnvironment(html);

    // popup.js lines 137-143 queries with compound selectors
    const compoundMod = win.document.querySelectorAll('input[type="radio"][name="modifierKey"]');
    const singleMod = win.document.querySelectorAll('input[name="modifierKey"]');

    if (compoundMod.length === 0 && singleMod.length === 3) {
      throw new Error(`popup.js uses unsupported compound selector input[type="radio"][name="modifierKey"] (found: 0, single attr finds: 3); radio change listeners are unbound in simulated DOM`);
    }
    assert.strictEqual(compoundMod.length, 3);
  });

  await runAsyncTest('2.1: Changing visual radio modifierKey="alt" updates select element and persists', async () => {
    const env = createPopupEnv();
    const radioAlt = env.doc.getElementById('mod-alt');
    assert.ok(radioAlt, 'Radio alt (#mod-alt) exists');

    radioAlt.checked = true;
    radioAlt.dispatchEvent(new env.win.Event('change', { bubbles: true }));

    assert.strictEqual(env.popup.modifierSelect.value, 'alt', 'modifierSelect.value not updated when radio changed');
    const stored = await env.chrome.storage.sync.get('modifierKey');
    assert.strictEqual(stored.modifierKey, 'alt');
  });

  await runAsyncTest('2.2: Changing visual radio modifierKey="ctrl_cmd" updates select element and persists', async () => {
    const env = createPopupEnv();
    const radioCtrl = env.doc.getElementById('mod-ctrl');
    assert.ok(radioCtrl, 'Radio ctrl_cmd (#mod-ctrl) exists');

    radioCtrl.checked = true;
    radioCtrl.dispatchEvent(new env.win.Event('change', { bubbles: true }));

    assert.strictEqual(env.popup.modifierSelect.value, 'ctrl_cmd');
    const stored = await env.chrome.storage.sync.get('modifierKey');
    assert.strictEqual(stored.modifierKey, 'ctrl_cmd');
  });

  await runAsyncTest('2.3: Programmatically setting modifierSelect.value="alt" checks mod-alt radio and unchecks others', async () => {
    const env = createPopupEnv();
    env.popup.modifierSelect.value = 'alt';
    env.popup.modifierSelect.dispatchEvent(new env.win.Event('change', { bubbles: true }));

    const radioShift = env.doc.getElementById('mod-shift');
    const radioAlt = env.doc.getElementById('mod-alt');
    const radioCtrl = env.doc.getElementById('mod-ctrl');

    assert.strictEqual(radioShift.checked, false);
    assert.strictEqual(radioAlt.checked, true, 'Radio alt (#mod-alt) not checked when modifierSelect changed');
    assert.strictEqual(radioCtrl.checked, false);

    const stored = await env.chrome.storage.sync.get('modifierKey');
    assert.strictEqual(stored.modifierKey, 'alt');
  });

  await runAsyncTest('2.4: Programmatically setting modifierSelect.value="ctrl_cmd" checks mod-ctrl radio and unchecks others', async () => {
    const env = createPopupEnv();
    env.popup.modifierSelect.value = 'ctrl_cmd';
    env.popup.modifierSelect.dispatchEvent(new env.win.Event('change', { bubbles: true }));

    const radioShift = env.doc.getElementById('mod-shift');
    const radioAlt = env.doc.getElementById('mod-alt');
    const radioCtrl = env.doc.getElementById('mod-ctrl');

    assert.strictEqual(radioShift.checked, false);
    assert.strictEqual(radioAlt.checked, false);
    assert.strictEqual(radioCtrl.checked, true, 'Radio ctrl (#mod-ctrl) not checked when modifierSelect changed');

    const stored = await env.chrome.storage.sync.get('modifierKey');
    assert.strictEqual(stored.modifierKey, 'ctrl_cmd');
  });

  await runAsyncTest('2.5: Changing visual radio modalSize="compact" updates select and size hint', async () => {
    const env = createPopupEnv();
    const radioCompact = env.doc.getElementById('size-compact');
    assert.ok(radioCompact, 'Radio compact (#size-compact) exists');

    radioCompact.checked = true;
    radioCompact.dispatchEvent(new env.win.Event('change', { bubbles: true }));

    assert.strictEqual(env.popup.sizeSelect.value, 'compact');
    const sizeHint = env.doc.getElementById('sizePresetHint');
    assert.ok(sizeHint.textContent.includes('640×480'));

    const stored = await env.chrome.storage.sync.get(['modalSize', 'sizePreset']);
    assert.strictEqual(stored.modalSize, 'compact');
    assert.strictEqual(stored.sizePreset, 'compact');
  });

  await runAsyncTest('2.6: Changing visual radio modalSize="large" updates select and size hint', async () => {
    const env = createPopupEnv();
    const radioLarge = env.doc.getElementById('size-large');
    assert.ok(radioLarge, 'Radio large (#size-large) exists');

    radioLarge.checked = true;
    radioLarge.dispatchEvent(new env.win.Event('change', { bubbles: true }));

    assert.strictEqual(env.popup.sizeSelect.value, 'large');
    const sizeHint = env.doc.getElementById('sizePresetHint');
    assert.ok(sizeHint.textContent.includes('1100×760'));

    const stored = await env.chrome.storage.sync.get(['modalSize', 'sizePreset']);
    assert.strictEqual(stored.modalSize, 'large');
    assert.strictEqual(stored.sizePreset, 'large');
  });

  await runAsyncTest('2.7: Programmatically setting sizeSelect.value="compact" checks compact radio and updates hint', async () => {
    const env = createPopupEnv();
    env.popup.sizeSelect.value = 'compact';
    env.popup.sizeSelect.dispatchEvent(new env.win.Event('change', { bubbles: true }));

    const radioCompact = env.doc.getElementById('size-compact');
    const radioDefault = env.doc.getElementById('size-default');
    const radioLarge = env.doc.getElementById('size-large');

    assert.strictEqual(radioCompact.checked, true, 'Radio compact (#size-compact) not checked when sizeSelect changed');
    assert.strictEqual(radioDefault.checked, false);
    assert.strictEqual(radioLarge.checked, false);

    const sizeHint = env.doc.getElementById('sizePresetHint');
    assert.ok(sizeHint.textContent.includes('640×480'));
  });

  await runAsyncTest('2.8: Programmatically setting sizeSelect.value="large" checks large radio and updates hint', async () => {
    const env = createPopupEnv();
    env.popup.sizeSelect.value = 'large';
    env.popup.sizeSelect.dispatchEvent(new env.win.Event('change', { bubbles: true }));

    const radioCompact = env.doc.getElementById('size-compact');
    const radioDefault = env.doc.getElementById('size-default');
    const radioLarge = env.doc.getElementById('size-large');

    assert.strictEqual(radioCompact.checked, false);
    assert.strictEqual(radioDefault.checked, false);
    assert.strictEqual(radioLarge.checked, true, 'Radio large (#size-large) not checked when sizeSelect changed');

    const sizeHint = env.doc.getElementById('sizePresetHint');
    assert.ok(sizeHint.textContent.includes('1100×760'));
  });

  await runAsyncTest('2.9: 100 alternating rapid flip-flops between radio pills and selects maintain 100% lockstep', async () => {
    const env = createPopupEnv();
    const modConfig = [
      { key: 'shift', id: 'mod-shift' },
      { key: 'alt', id: 'mod-alt' },
      { key: 'ctrl_cmd', id: 'mod-ctrl' }
    ];
    const sizeConfig = [
      { key: 'compact', id: 'size-compact' },
      { key: 'default', id: 'size-default' },
      { key: 'large', id: 'size-large' }
    ];

    for (let i = 0; i < 100; i++) {
      const targetMod = modConfig[i % 3];
      const targetSize = sizeConfig[i % 3];

      if (i % 2 === 0) {
        const rMod = env.doc.getElementById(targetMod.id);
        const rSize = env.doc.getElementById(targetSize.id);
        rMod.checked = true;
        rMod.dispatchEvent(new env.win.Event('change', { bubbles: true }));
        rSize.checked = true;
        rSize.dispatchEvent(new env.win.Event('change', { bubbles: true }));
      } else {
        env.popup.modifierSelect.value = targetMod.key;
        env.popup.modifierSelect.dispatchEvent(new env.win.Event('change', { bubbles: true }));
        env.popup.sizeSelect.value = targetSize.key;
        env.popup.sizeSelect.dispatchEvent(new env.win.Event('change', { bubbles: true }));
      }

      assert.strictEqual(env.popup.modifierSelect.value, targetMod.key, `Mismatch in modifierSelect at step ${i}`);
      assert.strictEqual(env.popup.sizeSelect.value, targetSize.key, `Mismatch in sizeSelect at step ${i}`);
      const checkedMod = env.doc.getElementById(targetMod.id);
      const checkedSize = env.doc.getElementById(targetSize.id);
      assert.strictEqual(checkedMod.checked, true, `Radio ${targetMod.id} not checked at step ${i}`);
      assert.strictEqual(checkedSize.checked, true, `Radio ${targetSize.id} not checked at step ${i}`);
    }
  });

  await runAsyncTest('2.10: Case insensitivity and alias normalization canonicalize properly in bidirectional sync', async () => {
    const env = createPopupEnv();

    const aliases = [
      { input: 'SHIFT', expectedId: 'mod-shift' },
      { input: 'Alt + Click', expectedId: 'mod-alt' },
      { input: 'Option', expectedId: 'mod-alt' },
      { input: 'Command', expectedId: 'mod-ctrl' },
      { input: 'Ctrl/Cmd', expectedId: 'mod-ctrl' }
    ];

    for (const { input, expectedId } of aliases) {
      env.popup.modifierSelect.value = input;
      env.popup.modifierSelect.dispatchEvent(new env.win.Event('change', { bubbles: true }));
      const activeRadio = env.doc.getElementById(expectedId);
      assert.strictEqual(activeRadio.checked, true, `Failed normalizing alias: ${input} to radio ${expectedId}`);
    }
  });

  await runAsyncTest('2.11: Reset Defaults button restores defaults across both radios and selects simultaneously', async () => {
    const env = createPopupEnv();

    env.popup.toggleEl.checked = false;
    env.popup.modifierSelect.value = 'ctrl_cmd';
    env.popup.modifierSelect.dispatchEvent(new env.win.Event('change', { bubbles: true }));
    env.popup.sizeSelect.value = 'large';
    env.popup.sizeSelect.dispatchEvent(new env.win.Event('change', { bubbles: true }));

    const resetBtn = env.doc.getElementById('resetDefaultsBtn');
    assert.ok(resetBtn, 'Reset button exists');
    resetBtn.dispatchEvent(new env.win.Event('click', { bubbles: true }));

    assert.strictEqual(env.popup.toggleEl.checked, true);
    assert.strictEqual(env.popup.modifierSelect.value, 'shift');
    assert.strictEqual(env.popup.sizeSelect.value, 'default');

    const modRadio = env.doc.getElementById('mod-shift');
    const sizeRadio = env.doc.getElementById('size-default');
    assert.strictEqual(modRadio.checked, true, 'Default radio shift not checked after reset');
    assert.strictEqual(sizeRadio.checked, true, 'Default radio size-default not checked after reset');

    const stored = await env.chrome.storage.sync.get(['enabled', 'modifierKey', 'sizePreset']);
    assert.strictEqual(stored.enabled, true);
    assert.strictEqual(stored.modifierKey, 'shift');
    assert.strictEqual(stored.sizePreset, 'default');
  });

  await runAsyncTest('2.12: Master toggle switch updates #statusBadge pill and toggles .extension-disabled on body', async () => {
    const env = createPopupEnv();
    const statusBadge = env.doc.getElementById('statusBadge');
    assert.ok(statusBadge, 'Status badge exists');

    // Toggle off
    env.popup.toggleEl.checked = false;
    env.popup.toggleEl.dispatchEvent(new env.win.Event('change', { bubbles: true }));

    assert.strictEqual(statusBadge.textContent, 'Disabled');
    assert.ok(statusBadge.classList.contains('disabled'));
    assert.ok(env.doc.body.classList.contains('extension-disabled'));

    // Toggle back on
    env.popup.toggleEl.checked = true;
    env.popup.toggleEl.dispatchEvent(new env.win.Event('change', { bubbles: true }));

    assert.strictEqual(statusBadge.textContent, 'Active');
    assert.ok(statusBadge.classList.contains('active'));
    assert.strictEqual(env.doc.body.classList.contains('extension-disabled'), false);
  });

  // ==========================================================================
  // SECTION 3: Multi-Tab Synchronization & Live In-Memory Propagation
  // ==========================================================================
  console.log('\n--- Section 3: Multi-Tab Synchronization & Live In-Memory Propagation ---');

  function teardownTabs(tabs) {
    if (!Array.isArray(tabs)) return;
    for (const tab of tabs) {
      try {
        if (typeof tab.win?.__PEEK_WAVE_TEARDOWN__ === 'function') {
          tab.win.__PEEK_WAVE_TEARDOWN__();
        }
        if (typeof tab.content?.teardownModal === 'function') {
          tab.content.teardownModal(tab.win);
        } else if (typeof tab.content?.teardown === 'function') {
          tab.content.teardown();
        }
      } catch {}
    }
    tabs.length = 0;
  }

  await runAsyncTest('3.1: 5 independent concurrent tabs running live content/content.js initialize with default settings', async () => {
    const sharedChrome = createChromeMock();
    const tabs = [];
    try {
      for (let i = 0; i < 5; i++) {
        const win = createBrowserEnvironment(`<a id="link-${i}" href="https://example.com/item-${i}">Link ${i}</a>`);
        win.chrome = sharedChrome;
        const content = loadLiveContentScript(win, sharedChrome);
        tabs.push({ id: i + 1, win, content });
      }

      assert.strictEqual(tabs.length, 5);
      for (const tab of tabs) {
        const s = tab.content.getSettings();
        assert.strictEqual(s.enabled, true);
        assert.strictEqual(s.modifierKey.toLowerCase(), 'shift');
        assert.strictEqual(s.sizePreset, 'default');
      }
    } finally {
      teardownTabs(tabs);
    }
  });

  await runAsyncTest('3.2: Popup modifier change (shift -> alt) dynamically propagates via storage event to all 5 tabs without reload', async () => {
    const sharedChrome = createChromeMock();
    const tabs = [];
    try {
      for (let i = 0; i < 5; i++) {
        const win = createBrowserEnvironment(`<a id="link-${i}" href="https://example.com/tab-${i}">Tab Link ${i}</a>`);
        win.chrome = sharedChrome;
        const content = loadLiveContentScript(win, sharedChrome);
        tabs.push({ id: i + 1, win, content });
      }

      const popupEnv = createPopupEnv(sharedChrome);
      popupEnv.popup.modifierSelect.value = 'alt';
      popupEnv.popup.modifierSelect.dispatchEvent(new popupEnv.win.Event('change', { bubbles: true }));

      for (let i = 0; i < 5; i++) {
        const s = tabs[i].content.getSettings();
        assert.strictEqual(s.modifierKey, 'alt', `Tab ${i} failed to sync modifierKey`);
      }
    } finally {
      teardownTabs(tabs);
    }
  });

  await runAsyncTest('3.3: Verification in all 5 tabs: Shift+Click ignored, Alt+Click intercepts and mounts modal', async () => {
    const sharedChrome = createChromeMock();
    const tabs = [];
    try {
      for (let i = 0; i < 5; i++) {
        const win = createBrowserEnvironment(`<a id="link-${i}" href="https://example.com/click-${i}">Click ${i}</a>`);
        win.chrome = sharedChrome;
        const content = loadLiveContentScript(win, sharedChrome);
        tabs.push({ id: i + 1, win, content });
      }

      const popupEnv = createPopupEnv(sharedChrome);
      popupEnv.popup.modifierSelect.value = 'alt';
      popupEnv.popup.modifierSelect.dispatchEvent(new popupEnv.win.Event('change', { bubbles: true }));

      for (let i = 0; i < 5; i++) {
        const tab = tabs[i];
        const link = tab.win.document.getElementById(`link-${i}`);

        // 1. Shift+Click (now inactive modifier)
        const shiftEvt = new tab.win.MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 });
        link.dispatchEvent(shiftEvt);
        assert.strictEqual(shiftEvt.defaultPrevented, false, `Tab ${i} improperly intercepted Shift+Click`);
        assert.strictEqual(tab.win.__PEEK_WAVE_GET_MODAL__(), null, `Tab ${i} opened modal on inactive modifier`);

        // 2. Alt+Click (now active modifier)
        const altEvt = new tab.win.MouseEvent('click', { bubbles: true, cancelable: true, altKey: true, button: 0 });
        link.dispatchEvent(altEvt);
        assert.strictEqual(altEvt.defaultPrevented, true, `Tab ${i} failed to intercept Alt+Click`);
        assert.ok(tab.win.__PEEK_WAVE_GET_MODAL__() !== null, `Tab ${i} failed to mount modal on active modifier`);

        // Teardown cleanly
        if (typeof tab.win.__PEEK_WAVE_TEARDOWN__ === 'function') {
          tab.win.__PEEK_WAVE_TEARDOWN__();
        }
        assert.strictEqual(tab.win.__PEEK_WAVE_GET_MODAL__(), null);
      }
    } finally {
      teardownTabs(tabs);
    }
  });

  await runAsyncTest('3.4: Popup toggle change (enabled: false) dynamically updates all 5 tabs, halting link interception everywhere', async () => {
    const sharedChrome = createChromeMock();
    const tabs = [];
    try {
      for (let i = 0; i < 5; i++) {
        const win = createBrowserEnvironment(`<a id="link-${i}" href="https://example.com/toggle-${i}">Toggle ${i}</a>`);
        win.chrome = sharedChrome;
        const content = loadLiveContentScript(win, sharedChrome);
        tabs.push({ id: i + 1, win, content });
      }

      const popupEnv = createPopupEnv(sharedChrome);
      popupEnv.popup.toggleEl.checked = false;
      popupEnv.popup.toggleEl.dispatchEvent(new popupEnv.win.Event('change', { bubbles: true }));

      for (let i = 0; i < 5; i++) {
        const tab = tabs[i];
        assert.strictEqual(tab.content.getSettings().enabled, false);

        const link = tab.win.document.getElementById(`link-${i}`);
        const evt = new tab.win.MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 });
        link.dispatchEvent(evt);
        assert.strictEqual(evt.defaultPrevented, false);
        assert.strictEqual(tab.win.__PEEK_WAVE_GET_MODAL__(), null);
      }
    } finally {
      teardownTabs(tabs);
    }
  });

  await runAsyncTest('3.5: Popup toggle re-enable (enabled: true) restores link interception in all 5 tabs immediately', async () => {
    const sharedChrome = createChromeMock();
    const tabs = [];
    try {
      for (let i = 0; i < 5; i++) {
        const win = createBrowserEnvironment(`<a id="link-${i}" href="https://example.com/reenable-${i}">Reenable ${i}</a>`);
        win.chrome = sharedChrome;
        const content = loadLiveContentScript(win, sharedChrome);
        tabs.push({ id: i + 1, win, content });
      }

      const popupEnv = createPopupEnv(sharedChrome);

      // Disable first
      popupEnv.popup.toggleEl.checked = false;
      popupEnv.popup.toggleEl.dispatchEvent(new popupEnv.win.Event('change', { bubbles: true }));
      for (const tab of tabs) assert.strictEqual(tab.content.getSettings().enabled, false);

      // Re-enable
      popupEnv.popup.toggleEl.checked = true;
      popupEnv.popup.toggleEl.dispatchEvent(new popupEnv.win.Event('change', { bubbles: true }));

      for (let i = 0; i < 5; i++) {
        const tab = tabs[i];
        assert.strictEqual(tab.content.getSettings().enabled, true);

        const link = tab.win.document.getElementById(`link-${i}`);
        const evt = new tab.win.MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 });
        link.dispatchEvent(evt);
        assert.strictEqual(evt.defaultPrevented, true);
        assert.ok(tab.win.__PEEK_WAVE_GET_MODAL__() !== null);

        if (typeof tab.win.__PEEK_WAVE_TEARDOWN__ === 'function') {
          tab.win.__PEEK_WAVE_TEARDOWN__();
        }
      }
    } finally {
      teardownTabs(tabs);
    }
  });

  await runAsyncTest('3.6: Popup size preset change (compact -> large) propagates to all 5 tabs; new modals mount with peek-size-large', async () => {
    const sharedChrome = createChromeMock();
    const tabs = [];
    try {
      for (let i = 0; i < 5; i++) {
        const win = createBrowserEnvironment(`<a id="link-${i}" href="https://example.com/size-${i}">Size ${i}</a>`);
        win.chrome = sharedChrome;
        const content = loadLiveContentScript(win, sharedChrome);
        tabs.push({ id: i + 1, win, content });
      }

      const popupEnv = createPopupEnv(sharedChrome);
      popupEnv.popup.sizeSelect.value = 'large';
      popupEnv.popup.sizeSelect.dispatchEvent(new popupEnv.win.Event('change', { bubbles: true }));

      for (let i = 0; i < 5; i++) {
        const tab = tabs[i];
        assert.strictEqual(tab.content.getSettings().modalSize, 'large');
        assert.strictEqual(tab.content.getSettings().sizePreset, 'large');

        const link = tab.win.document.getElementById(`link-${i}`);
        const evt = new tab.win.MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 });
        link.dispatchEvent(evt);

        const modal = tab.win.__PEEK_WAVE_GET_MODAL__();
        assert.ok(modal, `Tab ${i} failed to mount modal`);
        assert.ok(modal.modal.classList.contains('peek-size-large'), `Tab ${i} modal missing peek-size-large class`);

        if (typeof tab.win.__PEEK_WAVE_TEARDOWN__ === 'function') {
          tab.win.__PEEK_WAVE_TEARDOWN__();
        }
      }
    } finally {
      teardownTabs(tabs);
    }
  });

  await runAsyncTest('3.7: Multi-tab sync works even when sync storage has quota error (via local storage onChanged notifications)', async () => {
    const sharedChrome = createChromeMock();
    sharedChrome.storage.sync.simulateQuotaError = true;

    const tabs = [];
    try {
      for (let i = 0; i < 3; i++) {
        const win = createBrowserEnvironment(`<a id="link-${i}" href="https://example.com/quota-sync-${i}">Quota ${i}</a>`);
        win.chrome = sharedChrome;
        const content = loadLiveContentScript(win, sharedChrome);
        tabs.push({ id: i + 1, win, content });
      }

      const popupEnv = createPopupEnv(sharedChrome);
      popupEnv.popup.modifierSelect.value = 'ctrl_cmd';
      popupEnv.popup.modifierSelect.dispatchEvent(new popupEnv.win.Event('change', { bubbles: true }));

      await new Promise(r => setTimeout(r, 15));

      for (let i = 0; i < 3; i++) {
        const tab = tabs[i];
        assert.strictEqual(tab.content.getSettings().modifierKey, 'ctrl_cmd', `Tab ${i} failed to sync under quota error (blocked by storage quota fallback bug)`);
      }
    } finally {
      teardownTabs(tabs);
    }
  });

  await runAsyncTest('3.8: High-frequency burst of 30 alternating setting mutations from popup converges cleanly across all 5 tabs', async () => {
    const sharedChrome = createChromeMock();
    const tabs = [];
    try {
      for (let i = 0; i < 5; i++) {
        const win = createBrowserEnvironment(`<a id="link-${i}" href="https://example.com/burst-${i}">Burst ${i}</a>`);
        win.chrome = sharedChrome;
        const content = loadLiveContentScript(win, sharedChrome);
        tabs.push({ id: i + 1, win, content });
      }

      const popupEnv = createPopupEnv(sharedChrome);
      const modCycles = ['shift', 'alt', 'ctrl_cmd'];
      const sizeCycles = ['compact', 'default', 'large'];

      for (let k = 0; k < 30; k++) {
        const targetMod = modCycles[k % 3];
        const targetSize = sizeCycles[k % 3];
        popupEnv.popup.modifierSelect.value = targetMod;
        popupEnv.popup.sizeSelect.value = targetSize;
        popupEnv.popup.modifierSelect.dispatchEvent(new popupEnv.win.Event('change', { bubbles: true }));
        popupEnv.popup.sizeSelect.dispatchEvent(new popupEnv.win.Event('change', { bubbles: true }));
      }

      // Final target after 30 cycles (29 % 3 = 2 -> ctrl_cmd and large)
      for (let i = 0; i < 5; i++) {
        const s = tabs[i].content.getSettings();
        assert.strictEqual(s.modifierKey, 'ctrl_cmd');
        assert.strictEqual(s.modalSize, 'large');
        assert.strictEqual(s.sizePreset, 'large');
      }
    } finally {
      teardownTabs(tabs);
    }
  });

  await runAsyncTest('3.9: Tab isolation: destroying/tearing down modal in Tab 2 does not affect active modal in Tab 4', async () => {
    const sharedChrome = createChromeMock();
    const win2 = createBrowserEnvironment('<a id="link2" href="https://example.com/tab2">Tab 2</a>');
    win2.chrome = sharedChrome;
    const content2 = loadLiveContentScript(win2, sharedChrome);

    const win4 = createBrowserEnvironment('<a id="link4" href="https://example.com/tab4">Tab 4</a>');
    win4.chrome = sharedChrome;
    const content4 = loadLiveContentScript(win4, sharedChrome);

    const tabs = [{ win: win2, content: content2 }, { win: win4, content: content4 }];

    try {
      // Mount in both tabs
      win2.document.getElementById('link2').dispatchEvent(new win2.MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      win4.document.getElementById('link4').dispatchEvent(new win4.MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      assert.ok(win2.__PEEK_WAVE_GET_MODAL__() !== null);
      assert.ok(win4.__PEEK_WAVE_GET_MODAL__() !== null);

      // Teardown in Tab 2 only
      if (typeof win2.__PEEK_WAVE_TEARDOWN__ === 'function') {
        win2.__PEEK_WAVE_TEARDOWN__();
      }
      assert.strictEqual(win2.__PEEK_WAVE_GET_MODAL__(), null);
      assert.ok(win4.__PEEK_WAVE_GET_MODAL__() !== null);

      // Teardown Tab 4
      if (typeof win4.__PEEK_WAVE_TEARDOWN__ === 'function') {
        win4.__PEEK_WAVE_TEARDOWN__();
      }
      assert.strictEqual(win4.__PEEK_WAVE_GET_MODAL__(), null);
    } finally {
      teardownTabs(tabs);
    }
  });

  // ==========================================================================
  // SECTION 4: Forensic Code Invariants & Microtask Latency Audit
  // ==========================================================================
  console.log('\n--- Section 4: Forensic Code Invariants & Microtask Latency Audit ---');

  runTest('4.1: Direct evaluation of popup/popup.js in loadLivePopupScript inside isolated VM sandbox', () => {
    const win = createBrowserEnvironment();
    const chrome = createChromeMock();
    const mod = loadLivePopupScript(win, chrome);
    assert.ok(mod, 'loadLivePopupScript returned module');
    assert.strictEqual(typeof mod.initPopup, 'function');
  });

  runTest('4.2: Static code audit of popup/popup.js and lib/storage.js confirms absence of debounce delay on save', () => {
    const popupCode = fs.readFileSync(POPUP_JS_PATH, 'utf8');
    const storageCode = fs.readFileSync(STORAGE_JS_PATH, 'utf8');

    const debounceRegex = /debounce\s*\(|saveDebounce|saveTimer/i;
    assert.strictEqual(debounceRegex.test(popupCode), false, 'popup.js contains debounce patterns that would violate <10ms latency');
    assert.strictEqual(debounceRegex.test(storageCode), false, 'storage.js contains debounce patterns');

    assert.ok(popupCode.includes('return p') || popupCode.includes('return new Promise') || popupCode.includes('Storage.saveSettings'),
      'popup.js must return save Promise');
  });

  runTest('4.3: DOM Simulator compatibility: popup.toggleEl.type and checked evaluate truthfully immediately upon init', () => {
    const env = setupTestEnvironment();
    const popup = env.engine.initPopup(env.win, env.chrome);

    assert.ok(popup.toggleEl);
    assert.strictEqual(popup.toggleEl.type, 'checkbox');
    assert.strictEqual(popup.toggleEl.checked, true);
    assert.strictEqual(popup.modifierSelect.value, 'shift');
    assert.strictEqual(popup.sizeSelect.value, 'default');
  });

  runTest('4.4: Defensive fallback element creation in bare DOM environment without mounted HTML fixture', () => {
    const win = createBrowserEnvironment('');
    const chrome = createChromeMock();
    assert.strictEqual(win.document.body.children.length, 0);

    const popup = popupModule.initPopup(win, chrome);
    assert.ok(popup.toggleEl, 'Created toggleEl fallback');
    assert.ok(popup.modifierSelect, 'Created modifierSelect fallback');
    assert.ok(popup.sizeSelect, 'Created sizeSelect fallback');
    assert.strictEqual(popup.toggleEl.type, 'checkbox');
  });

  // Summary
  console.log('\n========================================================================');
  console.log('              M3 ADVERSARIAL VERIFICATION SUMMARY                      ');
  console.log('========================================================================');
  console.log(`- TOTAL TESTS EXECUTED: ${totalTests}`);
  console.log(`- PASSED:               ${passedTests}`);
  console.log(`- FAILED:               ${failedTests}`);
  console.log(`- OVERALL VERDICT:      ${failedTests === 0 ? 'ALL ADVERSARIAL TESTS PASSED (APPROVE)' : 'FAILURES DETECTED (REJECT)'}`);
  console.log('========================================================================\n');

  if (failedTests > 0) {
    console.log('Documented Failures:');
    failureDetails.forEach((f, idx) => {
      console.log(`  ${idx + 1}. [${f.testName}]: ${f.message}`);
    });
    console.log('');
  }

  return { passed: passedTests, failed: failedTests, total: totalTests, failures: failureDetails };
}

if (require.main === module) {
  runM3StoragePopupAdversarialTests().then(res => {
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

module.exports = {
  runM3StoragePopupAdversarialTests
};
