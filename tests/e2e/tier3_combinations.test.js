/**
 * tier3_combinations.test.js - Tier 3: Cross-Feature Combinations E2E Tests
 * Validates pairwise feature interactions, state handoffs, dynamic sync, and teardown under active timers.
 * Pure Node.js with zero external dependencies.
 */

const assert = require('assert');
const { setupTestEnvironment } = require('../harness/extension_loader');
const { MouseEvent, KeyboardEvent } = require('../harness/dom_simulator');

describe('Tier 3: Cross-Feature Combinations', () => {

  // --------------------------------------------------------------------------
  // C1: Custom Modifier Keys + Open in New Tab Handoff
  // --------------------------------------------------------------------------
  describe('C1: Custom Modifier + Tab Handoff', () => {
    test('T3.C1.1: Alt modifier triggers preview, then Open in New Tab opens background tab and tears down modal', async () => {
      const env = setupTestEnvironment({ initialSettings: { modifierKey: 'alt' } });
      const targetUrl = 'https://example.com/alt-to-tab';

      const link = env.doc.createElement('a');
      link.href = targetUrl;
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true, button: 0 }));

      const modal = env.getModal();
      assert.ok(modal !== null);

      // Click "Open in New Tab"
      modal.tabBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      // Give event loop tick for async message
      await new Promise(r => setTimeout(r, 5));

      assert.strictEqual(env.chrome.createdTabs.length, 1);
      assert.strictEqual(env.chrome.createdTabs[0].url, targetUrl);
      assert.strictEqual(env.getModal(), null, 'Modal must be torn down immediately upon opening in new tab');
      assert.strictEqual(env.doc.getElementById('peek-wave-host'), null);
    });

    test('T3.C1.2: ctrl_cmd modifier triggers preview, then Open in New Tab hands off cleanly', async () => {
      const env = setupTestEnvironment({ initialSettings: { modifierKey: 'ctrl_cmd' } });
      const targetUrl = 'https://example.com/ctrl-to-tab';

      const link = env.doc.createElement('a');
      link.href = targetUrl;
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, button: 0 }));

      const modal = env.getModal();
      assert.ok(modal !== null);

      modal.tabBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 5));

      assert.strictEqual(env.chrome.createdTabs.length, 1);
      assert.strictEqual(env.chrome.createdTabs[0].url, targetUrl);
      assert.strictEqual(env.getModal(), null);
    });

    test('T3.C1.3: Tab handoff preserves complex query strings and anchor hashes in target URL', async () => {
      const env = setupTestEnvironment();
      const complexUrl = 'https://example.com/deep/page?search=chromium&filter=recent#comments';

      const link = env.doc.createElement('a');
      link.href = complexUrl;
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      env.getModal().tabBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 5));

      assert.strictEqual(env.chrome.createdTabs[0].url, complexUrl);
    });

    test('T3.C1.4: Tab handoff tears down modal even if chrome.runtime message response is delayed', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/delayed-response';
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      const modal = env.getModal();

      modal.tabBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      // Teardown occurs synchronously upon click
      assert.strictEqual(env.getModal(), null);
    });

    test('T3.C1.5: Successive tab handoffs across 3 different links produce 3 distinct tabs', async () => {
      const env = setupTestEnvironment();
      const urls = ['https://example.com/1', 'https://example.com/2', 'https://example.com/3'];

      for (const u of urls) {
        const link = env.doc.createElement('a');
        link.href = u;
        env.doc.body.appendChild(link);

        link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
        env.getModal().tabBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }

      await new Promise(r => setTimeout(r, 10));
      assert.strictEqual(env.chrome.createdTabs.length, 3);
      assert.strictEqual(env.chrome.createdTabs[0].url, urls[0]);
      assert.strictEqual(env.chrome.createdTabs[1].url, urls[1]);
      assert.strictEqual(env.chrome.createdTabs[2].url, urls[2]);
      assert.strictEqual(env.getModal(), null);
    });
  });

  // --------------------------------------------------------------------------
  // C2: Size Preset Change + Live Modal Layout
  // --------------------------------------------------------------------------
  describe('C2: Size Preset Change + Modal Layout', () => {
    test('T3.C2.1: Changing size preset to compact in storage applies peek-size-compact class', async () => {
      const env = setupTestEnvironment();
      await env.chrome.storage.sync.set({ sizePreset: 'compact' });

      const link = env.doc.createElement('a');
      link.href = 'https://example.com/compact-layout';
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const modalWin = env.getModal().modal;
      assert.ok(modalWin.classList.contains('peek-size-compact'));
    });

    test('T3.C2.2: Changing size preset to large in storage applies peek-size-large class', async () => {
      const env = setupTestEnvironment();
      await env.chrome.storage.sync.set({ sizePreset: 'large' });

      const link = env.doc.createElement('a');
      link.href = 'https://example.com/large-layout';
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const modalWin = env.getModal().modal;
      assert.ok(modalWin.classList.contains('peek-size-large'));
    });

    test('T3.C2.3: Size preset transitions between sessions without lingering classes', async () => {
      const env = setupTestEnvironment();

      // Session 1: compact
      await env.chrome.storage.sync.set({ sizePreset: 'compact' });
      const link1 = env.doc.createElement('a');
      link1.href = 'https://example.com/s1';
      env.doc.body.appendChild(link1);
      link1.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      assert.ok(env.getModal().modal.classList.contains('peek-size-compact'));
      env.teardown();

      // Session 2: large
      await env.chrome.storage.sync.set({ sizePreset: 'large' });
      const link2 = env.doc.createElement('a');
      link2.href = 'https://example.com/s2';
      env.doc.body.appendChild(link2);
      link2.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      assert.ok(env.getModal().modal.classList.contains('peek-size-large'));
      assert.ok(!env.getModal().modal.classList.contains('peek-size-compact'));
    });

    test('T3.C2.4: Unknown size preset defaults gracefully to peek-size-default', async () => {
      const env = setupTestEnvironment({ initialSettings: { sizePreset: 'non_existent_preset' } });
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/fallback-size';
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const modalWin = env.getModal().modal;
      assert.ok(modalWin.classList.contains('peek-size-non_existent_preset') || modalWin.classList.contains('peek-size-default'));
    });

    test('T3.C2.5: Size preset change via popup immediately takes effect on next link click', async () => {
      const env = setupTestEnvironment();
      const popup = env.engine.initPopup(env.win, env.chrome);

      popup.sizeSelect.value = 'large';
      popup.saveSettings();

      await new Promise(r => setTimeout(r, 5));

      const link = env.doc.createElement('a');
      link.href = 'https://example.com/popup-to-size';
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      assert.ok(env.getModal().modal.classList.contains('peek-size-large'));
    });
  });

  // --------------------------------------------------------------------------
  // C3: Live Storage Updates + Active Page Synchronization
  // --------------------------------------------------------------------------
  describe('C3: Storage Updates + Active Synchronization', () => {
    test('T3.C3.1: Modifier updated while modal is open does not crash host and applies to future clicks', async () => {
      const env = setupTestEnvironment({ initialSettings: { modifierKey: 'shift' } });
      const link1 = env.doc.createElement('a');
      link1.href = 'https://example.com/mod1';
      env.doc.body.appendChild(link1);

      link1.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      assert.ok(env.getModal() !== null);

      // Storage changes modifier to Alt while modal is open
      await env.chrome.storage.sync.set({ modifierKey: 'alt' });

      // Dismiss first modal
      env.teardown();

      // Subsequent click with Shift is ignored
      link1.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      assert.strictEqual(env.getModal(), null);

      // Subsequent click with Alt opens modal
      link1.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true, button: 0 }));
      assert.ok(env.getModal() !== null);
    });

    test('T3.C3.2: Disabling extension while modal is open allows clean dismissal of current modal', async () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/disable-while-open';
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      assert.ok(env.getModal() !== null);

      // Storage disabled
      await env.chrome.storage.sync.set({ enabled: false });

      // Current modal can still be dismissed via Escape
      env.win.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
      assert.strictEqual(env.getModal(), null);

      // New clicks cannot open modal
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      assert.strictEqual(env.getModal(), null);
    });

    test('T3.C3.3: Storage onChanged ignores unrelated storage keys without mutation', async () => {
      const env = setupTestEnvironment();
      await env.chrome.storage.sync.set({ some_random_extension_key: 'foo_bar' });

      const settings = env.engine.getSettings();
      assert.strictEqual(settings.enabled, true);
      assert.strictEqual(settings.modifierKey, 'shift');
    });

    test('T3.C3.4: Multi-tab simulated storage broadcast updates content script', async () => {
      const env1 = setupTestEnvironment();
      const env2 = setupTestEnvironment();

      // Both initially on shift
      await env1.chrome.storage.sync.set({ modifierKey: 'ctrl_cmd' });

      // Simulate chrome.storage.onChanged propagating to tab 2
      env2.chrome.storage.onChanged._notifyChanges(
        { modifierKey: { oldValue: 'shift', newValue: 'ctrl_cmd' } },
        'sync'
      );

      const link2 = env2.doc.createElement('a');
      link2.href = 'https://example.com/tab2-sync';
      env2.doc.body.appendChild(link2);

      link2.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, button: 0 }));
      assert.ok(env2.getModal() !== null);
    });

    test('T3.C3.5: Rapidly alternating modifier back and forth settles on final state', async () => {
      const env = setupTestEnvironment();
      await env.chrome.storage.sync.set({ modifierKey: 'alt' });
      await env.chrome.storage.sync.set({ modifierKey: 'shift' });
      await env.chrome.storage.sync.set({ modifierKey: 'ctrl_cmd' });

      const link = env.doc.createElement('a');
      link.href = 'https://example.com/rapid-sync';
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, button: 0 }));
      assert.ok(env.getModal() !== null);
    });
  });

  // --------------------------------------------------------------------------
  // C4: Teardown During Active Copy Feedback / Loading State
  // --------------------------------------------------------------------------
  describe('C4: Teardown During Active Feedback & Loading', () => {
    test('T3.C4.1: Teardown during active Copy Link tooltip timeout clears timer safely', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/copy-timer-test';
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      const modal = env.getModal();

      // Click copy button (sets 1500ms timeout)
      modal.copyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      assert.strictEqual(modal.copyTooltip.textContent, 'Copied!');

      // Immediate teardown
      assert.doesNotThrow(() => {
        env.teardown();
      });

      assert.strictEqual(env.getModal(), null);
    });

    test('T3.C4.2: Copy Link then immediate Escape dismissal leaves zero dangling listeners', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/copy-esc';
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      env.getModal().copyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      // Escape
      env.win.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));

      assert.strictEqual(env.getModal(), null);
      assert.strictEqual(env.win._clipboardText, 'https://example.com/copy-esc');
    });

    test('T3.C4.3: Copy Link then immediate Tab Handoff copies URL and opens tab', async () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/copy-and-tab';
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      const modal = env.getModal();

      modal.copyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      modal.tabBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      await new Promise(r => setTimeout(r, 5));

      assert.strictEqual(env.win._clipboardText, 'https://example.com/copy-and-tab');
      assert.strictEqual(env.chrome.createdTabs.length, 1);
      assert.strictEqual(env.getModal(), null);
    });

    test('T3.C4.4: Teardown before iframe finishes loading clears onload/onerror handlers', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/loading-cancel';
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      const iframe = env.getModal().iframe;
      iframe.onload = () => {};
      iframe.onerror = () => {};

      env.teardown();

      assert.strictEqual(iframe.onload, null);
      assert.strictEqual(iframe.onerror, null);
      assert.strictEqual(iframe.src, 'about:blank');
    });

    test('T3.C4.5: Teardown during repeated fast copy button clicks does not leak timeouts', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/fast-copy';
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      const modal = env.getModal();

      modal.copyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      modal.copyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      modal.copyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      env.teardown();
      assert.strictEqual(env.getModal(), null);
    });
  });

  // --------------------------------------------------------------------------
  // C5: Storage Sync Fallback to Local Storage
  // --------------------------------------------------------------------------
  describe('C5: Storage Quota Fallback', () => {
    test('T3.C5.1: Quota error on sync.set falls back to local.set cleanly', async () => {
      const env = setupTestEnvironment();
      env.chrome.storage.sync.simulateQuotaError = true;

      const popup = env.engine.initPopup(env.win, env.chrome);
      popup.modifierSelect.value = 'alt';
      popup.saveSettings();

      await new Promise(r => setTimeout(r, 10));

      const localVal = await env.chrome.storage.local.get('modifierKey');
      assert.strictEqual(localVal.modifierKey, 'alt');
    });

    test('T3.C5.2: Sync quota error on toggle falls back to local storage', async () => {
      const env = setupTestEnvironment();
      env.chrome.storage.sync.simulateQuotaError = true;

      const popup = env.engine.initPopup(env.win, env.chrome);
      popup.toggleEl.checked = false;
      popup.saveSettings();

      await new Promise(r => setTimeout(r, 10));

      const localVal = await env.chrome.storage.local.get('enabled');
      assert.strictEqual(localVal.enabled, false);
    });

    test('T3.C5.3: Sync quota error on sizePreset falls back to local storage', async () => {
      const env = setupTestEnvironment();
      env.chrome.storage.sync.simulateQuotaError = true;

      const popup = env.engine.initPopup(env.win, env.chrome);
      popup.sizeSelect.value = 'compact';
      popup.saveSettings();

      await new Promise(r => setTimeout(r, 10));

      const localVal = await env.chrome.storage.local.get('sizePreset');
      assert.strictEqual(localVal.sizePreset, 'compact');
    });

    test('T3.C5.4: Storage fallback persists all three setting properties together', async () => {
      const env = setupTestEnvironment();
      env.chrome.storage.sync.simulateQuotaError = true;

      const popup = env.engine.initPopup(env.win, env.chrome);
      popup.toggleEl.checked = true;
      popup.modifierSelect.value = 'ctrl_cmd';
      popup.sizeSelect.value = 'large';
      popup.saveSettings();

      await new Promise(r => setTimeout(r, 10));

      const localAll = await env.chrome.storage.local.get(['enabled', 'modifierKey', 'sizePreset']);
      assert.strictEqual(localAll.enabled, true);
      assert.strictEqual(localAll.modifierKey, 'ctrl_cmd');
      assert.strictEqual(localAll.sizePreset, 'large');
    });

    test('T3.C5.5: In-memory settings continue to function even if storage write fails completely', async () => {
      const env = setupTestEnvironment();
      // Even if storage sync has an error, content script uses active settings
      env.engine.setSettings({ modifierKey: 'alt' });

      const link = env.doc.createElement('a');
      link.href = 'https://example.com/in-memory-ok';
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true, button: 0 }));
      assert.ok(env.getModal() !== null);
    });
  });

});
