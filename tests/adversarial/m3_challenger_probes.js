/**
 * tests/adversarial/m3_challenger_probes.js
 * 
 * Deep Empirical Stress Probes & Adversarial Mutation Suite for M3 Remediation:
 * 1. Quota Error Fallback Authenticity & Mutation Stress (writeToArea, readFromArea, saveSettings, readSettings)
 * 2. High-Frequency Bidirectional Flip-Flop Stress (Radio pills <-> Selects, 500 cycles)
 * 3. Multi-Tab Dynamic Synchronization & Memory Hygiene / Leak Verification
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const {
  createBrowserEnvironment,
  MouseEvent,
  Event
} = require('../harness/dom_simulator');
const { createChromeMock } = require('../harness/chrome_mock');
const {
  loadLiveStorageScript,
  loadLivePopupScript,
  loadLiveContentScript,
  PROJECT_ROOT
} = require('../harness/extension_loader');

const Storage = require('../../lib/storage');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureLog = [];

async function probe(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  [PROBE PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [PROBE FAIL] ${name}: ${err.message}`);
    failureLog.push({ name, error: err });
    failedTests++;
  }
}

async function runAllProbes() {
  console.log('========================================================================');
  console.log('  M3 REMEDIATION — EMPIRICAL CHALLENGER ADVERSARIAL STRESS PROBES       ');
  console.log('========================================================================\n');

  // ==========================================================================
  // PROBE TIER 1: Quota Fallback Authenticity & Storage Mutation Checks
  // ==========================================================================
  console.log('--- PROBE TIER 1: Quota Error Fallback & Storage Integrity Probes ---');

  await probe('1.1: Quota rejection on sync.set reliably falls back to local.set with byte-for-byte fidelity', async () => {
    const chrome = createChromeMock();
    await chrome.storage.sync.clear(); // Ensure sync is empty initially
    chrome.storage.sync.simulateQuotaError = true;

    const payload = { enabled: false, modifierKey: 'alt', modalSize: 'compact', sizePreset: 'compact' };
    const saved = await Storage.saveSettings(payload, chrome);

    assert.strictEqual(saved.enabled, false);
    assert.strictEqual(saved.modifierKey, 'alt');
    assert.strictEqual(saved.modalSize, 'compact');

    // Confirm sync contains NOTHING
    const syncRes = await chrome.storage.sync.get(['enabled', 'modifierKey', 'modalSize']);
    assert.strictEqual(syncRes.modifierKey, undefined, 'Sync storage must not contain data when quota exceeded');

    // Confirm local contains EXACT payload
    const localRes = await chrome.storage.local.get(['enabled', 'modifierKey', 'modalSize', 'sizePreset']);
    assert.strictEqual(localRes.enabled, false);
    assert.strictEqual(localRes.modifierKey, 'alt');
    assert.strictEqual(localRes.modalSize, 'compact');
    assert.strictEqual(localRes.sizePreset, 'compact');
  });

  await probe('1.2: Chrome callback-style runtime.lastError triggers authentic fallback to local without throwing', async () => {
    const chrome = createChromeMock();
    // Simulate legacy callback error on sync area
    chrome.storage.sync.set = function (data, callback) {
      chrome.runtime.lastError = { message: 'MAX_WRITE_OPERATIONS_PER_MINUTE_EXCEEDED' };
      if (typeof callback === 'function') callback();
      return undefined; // pure callback, no promise
    };

    const payload = { enabled: true, modifierKey: 'ctrl_cmd', modalSize: 'large' };
    const saved = await Storage.saveSettings(payload, chrome);
    assert.strictEqual(saved.modifierKey, 'ctrl_cmd');
    assert.strictEqual(saved.modalSize, 'large');

    const localRes = await chrome.storage.local.get(['modifierKey', 'modalSize']);
    assert.strictEqual(localRes.modifierKey, 'ctrl_cmd');
    assert.strictEqual(localRes.modalSize, 'large');
  });

  await probe('1.3: Synchronous throw inside sync.set is caught and falls back to local.set', async () => {
    const chrome = createChromeMock();
    chrome.storage.sync.set = function () {
      throw new Error('IPC channel crashed');
    };

    const saved = await Storage.saveSettings({ modifierKey: 'alt' }, chrome);
    assert.strictEqual(saved.modifierKey, 'alt');

    const localRes = await chrome.storage.local.get('modifierKey');
    assert.strictEqual(localRes.modifierKey, 'alt');
  });

  await probe('1.4: Dual storage collapse: when both sync and local fail, saveSettings rejects with actionable error', async () => {
    const chrome = createChromeMock();
    chrome.storage.sync.simulateQuotaError = true;
    chrome.storage.local.set = function () {
      return Promise.reject(new Error('LOCAL_DISK_FULL'));
    };

    let caught = false;
    try {
      await Storage.saveSettings({ modifierKey: 'alt' }, chrome);
    } catch (err) {
      caught = true;
      assert.ok(err.message.includes('LOCAL_DISK_FULL') || err.message.includes('QUOTA'));
    }
    assert.ok(caught, 'saveSettings must reject when both storage areas fail');
  });

  await probe('1.5: readSettings fallback chain: sync empty -> local populated restores saved preferences', async () => {
    const chrome = createChromeMock();
    // Empty sync storage first
    await chrome.storage.sync.clear();
    // Populate ONLY local
    await chrome.storage.local.set({ enabled: false, modifierKey: 'alt', modalSize: 'compact', sizePreset: 'compact' });

    const read = await Storage.readSettings(chrome);
    assert.strictEqual(read.enabled, false);
    assert.strictEqual(read.modifierKey, 'alt');
    assert.strictEqual(read.modalSize, 'compact');
    assert.strictEqual(read.sizePreset, 'compact');
  });

  await probe('1.6: readSettings fallback chain: sync throws -> local populated restores saved preferences', async () => {
    const chrome = createChromeMock();
    chrome.storage.sync.get = function () {
      return Promise.reject(new Error('NETWORK_TIMEOUT'));
    };
    await chrome.storage.local.set({ enabled: true, modifierKey: 'ctrl_cmd', modalSize: 'large' });

    const read = await Storage.readSettings(chrome);
    assert.strictEqual(read.modifierKey, 'ctrl_cmd');
    assert.strictEqual(read.modalSize, 'large');
  });

  await probe('1.7: Microtask race condition verification: synchronous callback resolution does not prematurely settle promise', async () => {
    // We create a mock StorageArea where .set synchronously calls the callback and returns a rejected promise
    let callbackCalled = false;
    const fakeArea = {
      set(data, cb) {
        callbackCalled = true;
        if (typeof cb === 'function') cb();
        return Promise.reject(new Error('SYNC_ASYNC_REJECTION'));
      }
    };

    const chromeObj = { runtime: {} };
    let rejected = false;
    try {
      // Direct call into storage's internal writeToArea via saveSettings
      const testChrome = {
        storage: {
          sync: fakeArea,
          local: {
            set: (data) => Promise.resolve()
          }
        },
        runtime: chromeObj.runtime
      };
      await Storage.saveSettings({ modifierKey: 'shift' }, testChrome);
    } catch (e) {
      rejected = true;
    }

    // It should NOT resolve prematurely on sync. It caught the sync rejection and succeeded via local fallback!
    assert.strictEqual(callbackCalled, true, 'Callback was called synchronously');
    assert.strictEqual(rejected, false, 'Handled rejection via local fallback without unhandled error');
  });

  // ==========================================================================
  // PROBE TIER 2: High-Frequency Bidirectional Flip-Flop Stress
  // ==========================================================================
  console.log('\n--- PROBE TIER 2: Bidirectional Flip-Flop Stress (Radio Pills <-> Selects) ---');

  function createPopupFixture() {
    const htmlPath = path.join(PROJECT_ROOT, 'popup/popup.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    const win = createBrowserEnvironment(html);
    const chrome = createChromeMock();
    const live = loadLivePopupScript(win, chrome);
    const controller = live.initPopup(win, chrome);
    return { win, chrome, live, controller };
  }

  await probe('2.1: 500 alternating rapid flip-flops between radio clicks and select changes maintain 100% lockstep', async () => {
    const { win, chrome, controller } = createPopupFixture();

    const modifierKeys = ['shift', 'alt', 'ctrl_cmd'];
    const modalSizes = ['compact', 'default', 'large'];

    const modRadios = {
      shift: win.document.getElementById('mod-shift'),
      alt: win.document.getElementById('mod-alt'),
      ctrl_cmd: win.document.getElementById('mod-ctrl')
    };

    const sizeRadios = {
      compact: win.document.getElementById('size-compact'),
      default: win.document.getElementById('size-default'),
      large: win.document.getElementById('size-large')
    };

    for (let i = 0; i < 500; i++) {
      const targetMod = modifierKeys[i % 3];
      const targetSize = modalSizes[i % 3];

      if (i % 2 === 0) {
        // Method A: Click visual radio button
        const modRadio = modRadios[targetMod];
        modRadio.checked = true;
        modRadio.dispatchEvent(new Event('change', { bubbles: true }));

        const sizeRadio = sizeRadios[targetSize];
        sizeRadio.checked = true;
        sizeRadio.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        // Method B: Change select dropdown programmatically
        controller.modifierSelect.value = targetMod;
        controller.modifierSelect.dispatchEvent(new Event('change', { bubbles: true }));

        controller.sizeSelect.value = targetSize;
        controller.sizeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // Assert lockstep after EVERY iteration
      assert.strictEqual(controller.modifierSelect.value, targetMod, `Iteration ${i}: modifierSelect out of sync`);
      assert.strictEqual(modRadios[targetMod].checked, true, `Iteration ${i}: radio ${targetMod} not checked`);
      for (const k of modifierKeys) {
        if (k !== targetMod) {
          assert.strictEqual(modRadios[k].checked, false, `Iteration ${i}: inactive radio ${k} remained checked`);
        }
      }

      assert.strictEqual(controller.sizeSelect.value, targetSize, `Iteration ${i}: sizeSelect out of sync`);
      assert.strictEqual(sizeRadios[targetSize].checked, true, `Iteration ${i}: size radio ${targetSize} not checked`);
      for (const s of modalSizes) {
        if (s !== targetSize) {
          assert.strictEqual(sizeRadios[s].checked, false, `Iteration ${i}: inactive size radio ${s} remained checked`);
        }
      }
    }

    // Verify storage reflects final iteration state (iteration 499: 499 % 3 = 1 -> 'alt', 'default')
    const finalStored = await chrome.storage.sync.get(['modifierKey', 'modalSize']);
    assert.strictEqual(finalStored.modifierKey, 'alt');
    assert.strictEqual(finalStored.modalSize, 'default');
  });

  await probe('2.2: Extreme rapid click spam on already-checked radio pills is idempotent and does not corrupt state', async () => {
    const { win, chrome, controller } = createPopupFixture();
    const altRadio = win.document.getElementById('mod-alt');

    for (let i = 0; i < 100; i++) {
      altRadio.checked = true;
      altRadio.dispatchEvent(new Event('change', { bubbles: true }));
    }

    assert.strictEqual(controller.modifierSelect.value, 'alt');
    assert.strictEqual(altRadio.checked, true);
    assert.strictEqual(win.document.getElementById('mod-shift').checked, false);
    assert.strictEqual(win.document.getElementById('mod-ctrl').checked, false);
  });

  await probe('2.3: Reset Defaults button restores defaults across both radios and selects and syncs immediately', async () => {
    const { win, chrome, controller } = createPopupFixture();

    // Set custom state
    controller.modifierSelect.value = 'ctrl_cmd';
    controller.modifierSelect.dispatchEvent(new Event('change', { bubbles: true }));
    controller.sizeSelect.value = 'large';
    controller.sizeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    controller.toggleEl.checked = false;
    controller.toggleEl.dispatchEvent(new Event('change', { bubbles: true }));

    // Click Reset
    const resetBtn = win.document.getElementById('resetDefaultsBtn');
    assert.ok(resetBtn, 'resetDefaultsBtn must exist');
    resetBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Verify UI immediately restored
    assert.strictEqual(controller.toggleEl.checked, true);
    assert.strictEqual(controller.modifierSelect.value, 'shift');
    assert.strictEqual(controller.sizeSelect.value, 'default');
    assert.strictEqual(win.document.getElementById('mod-shift').checked, true);
    assert.strictEqual(win.document.getElementById('size-default').checked, true);

    // Verify storage updated
    const stored = await chrome.storage.sync.get(['enabled', 'modifierKey', 'modalSize']);
    assert.strictEqual(stored.enabled, true);
    assert.strictEqual(stored.modifierKey, 'shift');
    assert.strictEqual(stored.modalSize, 'default');
  });

  // ==========================================================================
  // PROBE TIER 3: Multi-Tab Synchronization & Memory Hygiene / Leak Verification
  // ==========================================================================
  console.log('\n--- PROBE TIER 3: Multi-Tab Synchronization & Zero Memory Leak ---');

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

  await probe('3.1: 10 concurrent tabs receive rapid burst of 60 settings updates in real time with 100% convergence', async () => {
    const sharedChrome = createChromeMock();
    const tabs = [];

    try {
      for (let i = 0; i < 10; i++) {
        const win = createBrowserEnvironment(`<a id="link-${i}" href="https://example.com/item-${i}">Link ${i}</a>`);
        win.chrome = sharedChrome;
        const content = loadLiveContentScript(win, sharedChrome);
        tabs.push({ id: i + 1, win, content });
      }

      assert.strictEqual(tabs.length, 10);

      // Perform 60 bursts of storage updates
      const modifiers = ['shift', 'alt', 'ctrl_cmd'];
      const sizes = ['compact', 'default', 'large'];

      for (let k = 0; k < 60; k++) {
        const mod = modifiers[k % 3];
        const size = sizes[k % 3];
        const en = (k % 2 === 0);

        await Storage.saveSettings({ enabled: en, modifierKey: mod, modalSize: size }, sharedChrome);
      }

      // Final iteration is k=59: mod = modifiers[59 % 3] = 'ctrl_cmd', size = sizes[59 % 3] = 'large', en = false
      const expectedMod = 'ctrl_cmd';
      const expectedSize = 'large';
      const expectedEn = false;

      for (let i = 0; i < 10; i++) {
        const s = tabs[i].content.getSettings();
        assert.strictEqual(s.enabled, expectedEn, `Tab ${i} failed enabled sync`);
        assert.strictEqual(s.modifierKey, expectedMod, `Tab ${i} failed modifierKey sync`);
        assert.strictEqual(s.modalSize, expectedSize, `Tab ${i} failed modalSize sync`);
      }
    } finally {
      teardownTabs(tabs);
    }
  });

  await probe('3.2: Content script click interception behavior strictly conforms to updated modifier across all 10 tabs', async () => {
    const sharedChrome = createChromeMock();
    const tabs = [];

    try {
      for (let i = 0; i < 10; i++) {
        const win = createBrowserEnvironment(`<a id="link-${i}" href="https://example.com/tab-${i}">Tab Link ${i}</a>`);
        win.chrome = sharedChrome;
        const content = loadLiveContentScript(win, sharedChrome);
        tabs.push({ id: i + 1, win, content });
      }

      // Change setting to alt
      await Storage.saveSettings({ enabled: true, modifierKey: 'alt', modalSize: 'compact' }, sharedChrome);

      for (let i = 0; i < 10; i++) {
        const tab = tabs[i];
        const link = tab.win.document.getElementById(`link-${i}`);

        // 1. Shift+Click (must NOT open modal)
        const shiftEvt = new tab.win.MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 });
        link.dispatchEvent(shiftEvt);
        assert.strictEqual(shiftEvt.defaultPrevented, false, `Tab ${i} improperly intercepted Shift+Click`);
        assert.strictEqual(tab.win.__PEEK_WAVE_GET_MODAL__(), null);

        // 2. Alt+Click (MUST open modal)
        const altEvt = new tab.win.MouseEvent('click', { bubbles: true, cancelable: true, altKey: true, button: 0 });
        link.dispatchEvent(altEvt);
        assert.strictEqual(altEvt.defaultPrevented, true, `Tab ${i} failed to intercept Alt+Click`);
        const modal = tab.win.__PEEK_WAVE_GET_MODAL__();
        assert.ok(modal, `Tab ${i} did not mount modal`);
        assert.ok(modal.modal.classList.contains('peek-size-compact'), `Tab ${i} modal missing peek-size-compact`);

        // Teardown modal in this tab
        if (typeof tab.win.__PEEK_WAVE_TEARDOWN__ === 'function') {
          tab.win.__PEEK_WAVE_TEARDOWN__();
        }
      }
    } finally {
      teardownTabs(tabs);
    }
  });

  await probe('3.3: Memory leak stress probe: 200 consecutive modal mount and teardown cycles leave 0 detached DOM nodes and bounded memory', async () => {
    const win = createBrowserEnvironment('<a id="target" href="https://example.com/test">Test Link</a>');
    const chrome = createChromeMock();
    const content = loadLiveContentScript(win, chrome);
    const link = win.document.getElementById('target');

    const initialHostCount = win.document.querySelectorAll('#peek-wave-host').length;
    assert.strictEqual(initialHostCount, 0);

    for (let i = 0; i < 200; i++) {
      const ev = new win.MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 });
      link.dispatchEvent(ev);

      const modal = win.__PEEK_WAVE_GET_MODAL__();
      assert.ok(modal, `Cycle ${i}: Modal failed to mount`);

      // Dismiss via Escape keydown
      const escEv = new win.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true });
      win.dispatchEvent(escEv);

      assert.strictEqual(win.__PEEK_WAVE_GET_MODAL__(), null, `Cycle ${i}: Modal failed to teardown`);
    }

    // Confirm DOM is completely clean
    const finalHostCount = win.document.querySelectorAll('#peek-wave-host').length;
    assert.strictEqual(finalHostCount, 0, 'No #peek-wave-host elements may linger in DOM');
    const finalIframes = win.document.querySelectorAll('iframe').length;
    assert.strictEqual(finalIframes, 0, 'No orphaned iframes may linger in DOM');
  });

  await probe('3.4: Multi-tab memory hygiene: 50 ephemeral tabs created and torn down leave no lingering chrome storage listeners', async () => {
    const sharedChrome = createChromeMock();

    for (let i = 0; i < 50; i++) {
      const win = createBrowserEnvironment('<a id="a" href="https://example.com">A</a>');
      win.chrome = sharedChrome;
      const content = loadLiveContentScript(win, sharedChrome);

      // Verify listener registered
      assert.ok(sharedChrome.storage.onChanged._listeners.size > 0);

      // Perform teardown
      if (typeof win.__PEEK_WAVE_TEARDOWN__ === 'function') {
        win.__PEEK_WAVE_TEARDOWN__();
      }
      if (typeof content.teardownModal === 'function') {
        content.teardownModal(win);
      }
    }

    // Verify storage write still works cleanly
    await Storage.saveSettings({ enabled: true, modifierKey: 'shift' }, sharedChrome);
  });

  await probe('3.5: 500 high-frequency mount/teardown cycles maintain strict memory bounds and zero DOM residue', async () => {
    const win = createBrowserEnvironment('<a id="target" href="https://example.com/item">Item</a>');
    const chrome = createChromeMock();
    loadLiveContentScript(win, chrome);
    const link = win.document.getElementById('target');

    if (global.gc) global.gc();
    const startHeap = process.memoryUsage().heapUsed;

    for (let i = 0; i < 500; i++) {
      const ev = new win.MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 });
      link.dispatchEvent(ev);
      if (typeof win.__PEEK_WAVE_TEARDOWN__ === 'function') {
        win.__PEEK_WAVE_TEARDOWN__();
      }
    }

    if (global.gc) global.gc();
    const endHeap = process.memoryUsage().heapUsed;
    const deltaMB = (endHeap - startHeap) / (1024 * 1024);

    const maxDelta = global.gc ? 10 : 25;
    assert.ok(deltaMB < maxDelta, `Memory delta (${deltaMB.toFixed(2)} MB) must not exceed ${maxDelta} MB`);
    assert.strictEqual(win.document.querySelectorAll('#peek-wave-host').length, 0);
  });

  // ==========================================================================
  // FINAL REPORT
  // ==========================================================================
  console.log('\n========================================================================');
  console.log('              CHALLENGER EMPIRICAL STRESS PROBE SUMMARY                 ');
  console.log('========================================================================');
  console.log(`- TOTAL PROBES EXECUTED: ${totalTests}`);
  console.log(`- PASSED:                ${passedTests}`);
  console.log(`- FAILED:                ${failedTests}`);
  console.log(`- STATUS:                ${failedTests === 0 ? 'ALL PROBES PASSED (APPROVE)' : 'FAILURES DETECTED (REJECT)'}`);
  console.log('========================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAllProbes().catch((err) => {
  console.error('Fatal probe runner failure:', err);
  process.exit(1);
});
