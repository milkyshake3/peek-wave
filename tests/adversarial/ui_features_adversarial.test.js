/**
 * ui_features_adversarial.test.js
 * 
 * Adversarial & Integration Verification Suite for Peek Wave UI & Feature Upgrades:
 * 1. 3-Way Theme Mode ('dark' | 'light' | 'auto'): normalization, storage sync, quota fallback,
 *    3-way popup cycling, live modal data-theme sync, and Reset Defaults.
 * 2. Per-Site Pause / Disable List: hostname normalization, click bypass, multi-tab sync,
 *    popup toggle + removable chips, and Reset Defaults.
 * 3. Interactive Modal Controls: path preview sibling & domain purity, quick size cycle button &
 *    3-button header-actions contract, header drag-to-move (button exclusion & listener cleanup),
 *    corner resize handle (clamping & listener cleanup), fallback banner on error/timeout, zero innerHTML.
 * 4. Dynamic Popup Micro-Polish: dynamic footer hint per modifier & OS, manifest version badge,
 *    hidden non-tabbable Grow-from-Link compatibility control, FOUC theme-init script, WCAG contrast tokens, zero innerHTML.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { setupTestEnvironment, loadLiveContentScript } = require('../harness/extension_loader');
const { createBrowserEnvironment, MouseEvent, KeyboardEvent, Event } = require('../harness/dom_simulator');
const { createChromeMock } = require('../harness/chrome_mock');
const Storage = require('../../lib/storage');
const Background = require('../../background');
const Popup = require('../../popup/popup');

const ROOT_DIR = path.resolve(__dirname, '../../');
const POPUP_HTML_PATH = path.join(ROOT_DIR, 'popup/popup.html');
const POPUP_CSS_PATH = path.join(ROOT_DIR, 'popup/popup.css');
const POPUP_JS_PATH = path.join(ROOT_DIR, 'popup/popup.js');
const THEME_INIT_PATH = path.join(ROOT_DIR, 'popup/theme-init.js');

function createPopupEnv(options = {}) {
  const html = fs.readFileSync(POPUP_HTML_PATH, 'utf8');
  const win = createBrowserEnvironment(html);
  const chrome = options.chrome || createChromeMock(options.initialSettings || {});
  if (options.activeTabUrl !== undefined) {
    chrome.tabs.query = (queryInfo, cb) => {
      const tabs = options.activeTabUrl ? [{ id: 101, url: options.activeTabUrl, active: true }] : [];
      if (typeof cb === 'function') cb(tabs);
      return Promise.resolve(tabs);
    };
  }
  if (options.manifestVersion) {
    chrome.runtime.getManifest = () => ({ version: options.manifestVersion });
  }
  if (options.platform) {
    win.navigator.platform = options.platform;
    win.navigator.userAgent = options.platform;
  }
  const store = new Map();
  win.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v))
  };
  win.chrome = chrome;
  const popup = Popup.initPopup(win, chrome);
  return { win, doc: win.document, chrome, popup, localStorageMap: store };
}

async function runUiFeaturesAdversarialTests() {
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      passed++;
      console.log(`  [PASS] ${name}`);
    } catch (err) {
      failed++;
      console.error(`  [FAIL] ${name}`);
      console.error(`         ${err.message}`);
    }
  }

  async function testAsync(name, fn) {
    try {
      await fn();
      passed++;
      console.log(`  [PASS] ${name}`);
    } catch (err) {
      failed++;
      console.error(`  [FAIL] ${name}`);
      console.error(`         ${err.message}`);
    }
  }

  console.log('\n========================================================================');
  console.log('   CHALLENGER TEST SUITE: UI THEME, PER-SITE PAUSE & MODAL CONTROLS     ');
  console.log('========================================================================\n');

  // --------------------------------------------------------------------------
  // Section 1: 3-Way Theme System (Dark / Light / Auto)
  // --------------------------------------------------------------------------
  console.log('--- Section 1: 3-Way Theme System (Dark / Light / Auto) ---');

  test('1.1: normalizeTheme handles dark, light, auto, system, white, and invalid inputs', () => {
    for (const fn of [Storage.normalizeTheme, Background.normalizeTheme, Popup.FallbackStorage.normalizeTheme]) {
      assert.strictEqual(fn('dark'), 'dark');
      assert.strictEqual(fn('LIGHT'), 'light');
      assert.strictEqual(fn('white'), 'light');
      assert.strictEqual(fn('auto'), 'auto');
      assert.strictEqual(fn('System'), 'auto');
      assert.strictEqual(fn('invalid'), 'dark');
      assert.strictEqual(fn(null), 'dark');
    }
  });

  await testAsync('1.2: 3-way theme persists through storage.sync and quota fallback to local', async () => {
    const chrome = createChromeMock();
    await Storage.saveSettings({ theme: 'auto' }, chrome);
    const read1 = await Storage.readSettings(chrome);
    assert.strictEqual(read1.theme, 'auto');

    chrome.storage.sync.simulateQuotaError = true;
    await Storage.saveSettings({ theme: 'light' }, chrome);
    const localData = await chrome.storage.local.get('theme');
    assert.strictEqual(localData.theme, 'light');
  });

  await testAsync('1.3: Popup theme button cycles dark -> light -> auto -> dark and broadcasts live to modal', async () => {
    const sharedChrome = createChromeMock();
    const tabWin = createBrowserEnvironment('<a id="lnk" href="https://example.com/page">Link</a>');
    tabWin.chrome = sharedChrome;
    const content = loadLiveContentScript(tabWin, sharedChrome);
    const modal = content.mountModal('https://example.com/page', { win: tabWin });
    assert.strictEqual(modal.hostElement.getAttribute('data-theme'), 'dark');

    const { doc, popup, localStorageMap } = createPopupEnv({ chrome: sharedChrome });
    await popup.loadSettings();
    const btn = doc.getElementById('themeToggleBtn');
    assert.strictEqual(popup.getTheme(), 'dark');

    btn.dispatchEvent(new Event('click', { bubbles: true }));
    assert.strictEqual(popup.getTheme(), 'light');
    assert.strictEqual(localStorageMap.get('peekWaveTheme'), 'light');
    assert.strictEqual(modal.hostElement.getAttribute('data-theme'), 'light');
    assert.strictEqual(modal.modal.getAttribute('data-theme'), 'light');

    btn.dispatchEvent(new Event('click', { bubbles: true }));
    assert.strictEqual(popup.getTheme(), 'auto');
    assert.strictEqual(localStorageMap.get('peekWaveTheme'), 'auto');
    assert.strictEqual(modal.hostElement.getAttribute('data-theme'), 'auto');

    btn.dispatchEvent(new Event('click', { bubbles: true }));
    assert.strictEqual(popup.getTheme(), 'dark');
    assert.strictEqual(modal.hostElement.getAttribute('data-theme'), 'dark');

    content.teardownModal(tabWin);
  });

  await testAsync('1.4: Reset Defaults restores theme to dark and clears disabledSites', async () => {
    const { doc, popup } = createPopupEnv({
      activeTabUrl: 'https://www.figma.com/file/123'
    });
    await popup.loadSettings();
    popup.applyTheme('auto');
    await popup.toggleSitePause('figma.com');
    assert.strictEqual(popup.getTheme(), 'auto');
    assert.deepStrictEqual(popup.getDisabledSites(), ['figma.com']);

    doc.getElementById('resetDefaultsBtn').dispatchEvent(new Event('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));

    assert.strictEqual(popup.getTheme(), 'dark');
    assert.deepStrictEqual(popup.getDisabledSites(), []);
  });

  // --------------------------------------------------------------------------
  // Section 2: Per-Site Pause / Disable List
  // --------------------------------------------------------------------------
  console.log('\n--- Section 2: Per-Site Pause / Disable List ---');

  test('2.1: normalizeHostname, normalizeDisabledSites, and isSiteDisabled enforce clean deduplicated hostnames', () => {
    assert.strictEqual(Storage.normalizeHostname('https://www.Notion.so/workspace/doc'), 'notion.so');
    assert.strictEqual(Storage.normalizeHostname('chrome://extensions'), '');
    assert.strictEqual(Storage.normalizeHostname('bad host/path'), '');

    const list = Storage.normalizeDisabledSites([
      'https://www.figma.com/board/1',
      'FIGMA.COM',
      'notion.so',
      'javascript:alert(1)'
    ]);
    assert.deepStrictEqual(list, ['figma.com', 'notion.so']);
    assert.strictEqual(Storage.isSiteDisabled('https://www.figma.com/design/abc', list), true);
    assert.strictEqual(Storage.isSiteDisabled('github.com', list), false);
  });

  await testAsync('2.2: Paused site bypasses modifier+click interception while unpaused site intercepts normally', async () => {
    const sharedChrome = createChromeMock({ disabledSites: ['figma.com'] });

    const pausedWin = createBrowserEnvironment('<a id="a1" href="https://example.com/1">A1</a>');
    pausedWin.location = new URL('https://www.figma.com/file/xyz');
    pausedWin.chrome = sharedChrome;
    const pausedContent = loadLiveContentScript(pausedWin, sharedChrome);
    await new Promise((r) => setTimeout(r, 10));

    const evt1 = new pausedWin.MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 });
    pausedWin.document.getElementById('a1').dispatchEvent(evt1);
    assert.strictEqual(evt1.defaultPrevented, false, 'Paused site must NOT intercept modifier click');
    assert.strictEqual(pausedContent.getModal(), null);

    const activeWin = createBrowserEnvironment('<a id="a2" href="https://example.com/2">A2</a>');
    activeWin.location = new URL('https://news.ycombinator.com/');
    activeWin.chrome = sharedChrome;
    const activeContent = loadLiveContentScript(activeWin, sharedChrome);
    await new Promise((r) => setTimeout(r, 10));

    const evt2 = new activeWin.MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 });
    activeWin.document.getElementById('a2').dispatchEvent(evt2);
    assert.strictEqual(evt2.defaultPrevented, true, 'Non-paused site must intercept modifier click');
    assert.ok(activeContent.getModal() !== null);
    activeContent.teardownModal(activeWin);
  });

  await testAsync('2.3: Popup per-site pause button and removable chips synchronize live to active tabs', async () => {
    const sharedChrome = createChromeMock();
    const tabWin = createBrowserEnvironment('<a id="lnk" href="https://example.com/doc">Doc</a>');
    tabWin.location = new URL('https://www.notion.so/page');
    tabWin.chrome = sharedChrome;
    const content = loadLiveContentScript(tabWin, sharedChrome);

    const { doc, popup } = createPopupEnv({
      chrome: sharedChrome,
      activeTabUrl: 'https://www.notion.so/page'
    });
    await popup.loadSettings();

    const siteBtn = doc.getElementById('siteToggleBtn');
    assert.strictEqual(doc.getElementById('currentSiteHost').textContent, 'notion.so');
    assert.strictEqual(siteBtn.textContent, 'Pause');

    siteBtn.dispatchEvent(new Event('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));

    assert.strictEqual(siteBtn.textContent, 'Paused');
    assert.ok(siteBtn.classList.contains('is-paused'));
    assert.deepStrictEqual(Array.from(content.getSettings().disabledSites), ['notion.so']);

    // Chip should be rendered and clicking its remove button should resume
    const chips = doc.getElementById('pausedSitesList').querySelectorAll('.paused-site-chip');
    assert.strictEqual(chips.length, 1);
    const removeBtn = chips[0].querySelector('.chip-remove');
    removeBtn.dispatchEvent(new Event('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));

    assert.strictEqual(siteBtn.textContent, 'Pause');
    assert.deepStrictEqual(Array.from(content.getSettings().disabledSites), []);
  });

  // --------------------------------------------------------------------------
  // Section 3: Interactive Modal Controls (Path, Size Cycle, Drag, Resize, Fallback)
  // --------------------------------------------------------------------------
  console.log('\n--- Section 3: Interactive Modal Controls ---');

  test('3.1: Modal displays sibling .peek-wave-path while keeping .peek-wave-domain pure with 0 children', () => {
    const env = setupTestEnvironment();
    const modal = env.content.mountModal('https://github.com/google/gemini/tree/main/src', { win: env.win });

    assert.strictEqual(modal.domainSpan.textContent, 'github.com');
    assert.strictEqual(modal.domainSpan.children.length, 0);
    assert.ok(modal.pathSpan);
    assert.strictEqual(modal.pathSpan.textContent.startsWith('/google/gemini'), true);
    assert.strictEqual(modal.pathSpan.classList.contains('hidden'), false);
    env.teardown();

    const rootModal = env.content.mountModal('https://github.com/', { win: env.win });
    assert.ok(rootModal.pathSpan.classList.contains('hidden'));
    env.teardown();
  });

  test('3.2: Quick size cycle button cycles compact -> default -> large -> compact without breaking 3-button header-actions', () => {
    const env = setupTestEnvironment();
    const modal = env.content.mountModal('https://example.com/size-test', { win: env.win, sizePreset: 'compact' });

    const headerActions = modal.shadowRoot.querySelector('.peek-wave-header-actions');
    assert.strictEqual(headerActions.querySelectorAll('button').length, 3);
    assert.ok(modal.modal.classList.contains('peek-size-compact'));

    modal.sizeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert.ok(modal.modal.classList.contains('peek-size-default'));
    assert.strictEqual(modal.sizePreset, 'default');

    modal.sizeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert.ok(modal.modal.classList.contains('peek-size-large'));
    assert.strictEqual(modal.sizePreset, 'large');

    modal.sizeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert.ok(modal.modal.classList.contains('peek-size-compact'));
    assert.strictEqual(modal.sizePreset, 'compact');

    env.teardown();
  });

  test('3.3: Header drag moves modal, excludes header buttons, and leaks 0 window listeners on mouseup or mid-drag Escape', () => {
    const env = setupTestEnvironment();
    env.win.innerWidth = 1200;
    env.win.innerHeight = 900;
    const modal = env.content.mountModal('https://example.com/drag-test', {
      win: env.win,
      linkRect: { left: 100, top: 200, width: 120, height: 24 }
    });
    assert.ok(modal.modal.classList.contains('peek-animate-grow'), 'Mounting with linkRect adds peek-animate-grow');

    // Mousedown on closeBtn must NOT initiate drag
    modal.closeBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 100, clientY: 100 }));
    assert.strictEqual((env.win._listeners.get('mousemove') || []).length, 0);

    // Mousedown on header initiates drag
    modal.header.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 200, clientY: 100 }));
    assert.strictEqual((env.win._listeners.get('mousemove') || []).length, 1);
    assert.strictEqual((env.win._listeners.get('mouseup') || []).length, 1);
    assert.strictEqual(modal.modal.classList.contains('peek-animate-grow'), false, 'Starting drag strips peek-animate-grow');
    assert.ok(modal.modal.classList.contains('peek-positioned'));

    env.win.dispatchEvent(new MouseEvent('mousemove', { clientX: 260, clientY: 140 }));
    assert.strictEqual(modal.dragX, 60);
    assert.strictEqual(modal.dragY, 40);

    // Mouseup cleans transient window listeners
    env.win.dispatchEvent(new MouseEvent('mouseup', { clientX: 260, clientY: 140 }));
    assert.strictEqual((env.win._listeners.get('mousemove') || []).length, 0);
    assert.strictEqual((env.win._listeners.get('mouseup') || []).length, 0);

    // Mid-drag Escape teardown must also clean up mousemove/mouseup
    modal.header.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 200, clientY: 100 }));
    assert.strictEqual((env.win._listeners.get('mousemove') || []).length, 1);
    env.win.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));

    assert.strictEqual(env.getModal(), null);
    assert.strictEqual((env.win._listeners.get('mousemove') || []).length, 0);
    assert.strictEqual((env.win._listeners.get('mouseup') || []).length, 0);
  });

  test('3.4: Corner resize handle clamps dimensions and cleans up window listeners on mouseup and mid-resize teardown', () => {
    const env = setupTestEnvironment();
    env.win.innerWidth = 1200;
    env.win.innerHeight = 900;
    const modal = env.content.mountModal('https://example.com/resize-test', { win: env.win, sizePreset: 'default' });

    modal.resizeHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 500, clientY: 500 }));
    assert.ok(modal.modal.classList.contains('peek-custom-sized'));
    assert.strictEqual((env.win._listeners.get('mousemove') || []).length, 1);

    // Extreme shrink clamps to min 360x280
    env.win.dispatchEvent(new MouseEvent('mousemove', { clientX: -1000, clientY: -1000 }));
    assert.strictEqual(modal.customWidth, 360);
    assert.strictEqual(modal.customHeight, 280);

    // Extreme grow clamps to 96% x 94% of viewport
    env.win.dispatchEvent(new MouseEvent('mousemove', { clientX: 5000, clientY: 5000 }));
    assert.strictEqual(modal.customWidth, Math.round(1200 * 0.96));
    assert.strictEqual(modal.customHeight, Math.round(900 * 0.94));

    // Mid-resize teardown leaves 0 listeners
    env.teardown();
    assert.strictEqual((env.win._listeners.get('mousemove') || []).length, 0);
    assert.strictEqual((env.win._listeners.get('mouseup') || []).length, 0);
  });

  await testAsync('3.5: Fallback banner appears on iframe error, hides on load/dismiss, and opens tab on click', async () => {
    const env = setupTestEnvironment();
    const modal = env.content.mountModal('https://example.com/blocked-frame', { win: env.win });

    assert.ok(modal.fallbackBanner.classList.contains('hidden'));
    modal.iframe.dispatchEvent(new Event('error'));
    assert.strictEqual(modal.fallbackBanner.classList.contains('hidden'), false);
    assert.ok(modal.fallbackText.textContent.includes("couldn't be previewed"));

    modal.fallbackDismissBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert.strictEqual(modal.fallbackBanner.classList.contains('hidden'), true);

    modal.fallbackOpenBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 5));
    assert.strictEqual(env.chrome.createdTabs.length, 1);
    assert.strictEqual(env.chrome.createdTabs[0].url, 'https://example.com/blocked-frame');
    assert.strictEqual(env.getModal(), null);
  });

  // --------------------------------------------------------------------------
  // Section 4: Dynamic Popup Micro-Polish & Accessibility
  // --------------------------------------------------------------------------
  console.log('\n--- Section 4: Dynamic Popup Micro-Polish & Accessibility ---');

  test('4.1: Popup populates manifest version, hides growAnimationToggle without phantom tab stop, and updates OS-aware footer hint', () => {
    const { doc, popup } = createPopupEnv({
      manifestVersion: '1.2.3',
      platform: 'MacIntel'
    });

    assert.strictEqual(doc.getElementById('versionBadge').textContent, 'v1.2.3');
    const growEl = doc.getElementById('growAnimationToggle');
    assert.strictEqual(growEl.checked, true, 'Grow animation must remain enabled by default');
    assert.ok(growEl.classList.contains('sr-only'), 'Grow toggle must stay visually hidden from popup UI');
    assert.strictEqual(growEl.getAttribute('tabindex'), '-1', 'Hidden grow toggle must not create a phantom tab stop');
    assert.strictEqual(growEl.getAttribute('aria-hidden'), 'true', 'Hidden grow toggle must be hidden from screen readers');

    assert.strictEqual(doc.getElementById('altKeyLabel').textContent, 'Option (⌥)');
    assert.strictEqual(doc.getElementById('ctrlKeyLabel').textContent, 'Cmd (⌘)');
    assert.strictEqual(doc.getElementById('footerHintText').textContent, 'Hold Shift + click any link to peek');

    popup.modifierSelect.value = 'ctrl_cmd';
    popup.modifierSelect.dispatchEvent(new Event('change', { bubbles: true }));
    assert.strictEqual(doc.getElementById('footerHintText').textContent, 'Hold Cmd (⌘) + click any link to peek');
  });

  test('4.2: Pre-paint theme-init.js sets data-theme from localStorage synchronously without errors', () => {
    const code = fs.readFileSync(THEME_INIT_PATH, 'utf8');
    let attrValue = null;
    const sandbox = {
      localStorage: { getItem: () => 'light' },
      document: { documentElement: { setAttribute: (k, v) => { if (k === 'data-theme') attrValue = v; } } }
    };
    vm.runInNewContext(code, sandbox);
    assert.strictEqual(attrValue, 'light');
  });

  test('4.3: Popup uses zero innerHTML assignments and satisfies WCAG AA contrast & reduced motion tokens', () => {
    const popupJs = fs.readFileSync(POPUP_JS_PATH, 'utf8');
    const popupCss = fs.readFileSync(POPUP_CSS_PATH, 'utf8');
    assert.ok(!popupJs.includes('.innerHTML'), 'popup.js must not use innerHTML');
    assert.ok(popupCss.includes('--text-muted: #949494;'), 'Dark muted text must meet WCAG AA contrast');
    assert.ok(popupCss.includes('--text-muted: #595959;'), 'Light muted text must meet WCAG AA contrast');
    assert.ok(popupCss.includes('@media (prefers-reduced-motion: reduce)'), 'popup.css must honor prefers-reduced-motion');
    assert.ok(!popupCss.includes('opacity: 0.45;\n  pointer-events: none;'), 'Disabled opacity must not stack doubly');
  });

  await testAsync('4.4: YouTube Embed Mode toggle defaults to false, syncs storage/fallback, broadcasts live, disables when off, and resets', async () => {
    const sharedChrome = createChromeMock();
    const tabWin = createBrowserEnvironment('<a id="yt" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ">YT</a>');
    tabWin.chrome = sharedChrome;
    const content = loadLiveContentScript(tabWin, sharedChrome);

    const { doc, popup } = createPopupEnv({ chrome: sharedChrome });
    await popup.loadSettings();

    const ytToggle = doc.getElementById('youtubeEmbedToggle');
    assert.ok(ytToggle, 'youtubeEmbedToggle element must exist');
    assert.strictEqual(ytToggle.checked, false, 'youtubeEmbedFallback must default to false');
    assert.strictEqual(content.getSettings().youtubeEmbedFallback, false);

    // Enable in popup -> syncs to storage and broadcasts live to content script
    ytToggle.checked = true;
    ytToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 15));

    const stored1 = await Storage.readSettings(sharedChrome);
    assert.strictEqual(stored1.youtubeEmbedFallback, true);
    assert.strictEqual(content.getSettings().youtubeEmbedFallback, true);

    // Quota fallback persists youtubeEmbedFallback to local storage
    sharedChrome.storage.sync.simulateQuotaError = true;
    ytToggle.checked = false;
    ytToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 15));
    const localData = await sharedChrome.storage.local.get('youtubeEmbedFallback');
    assert.strictEqual(localData.youtubeEmbedFallback, false);
    sharedChrome.storage.sync.simulateQuotaError = false;

    // Master toggle off disables youtubeEmbedToggle
    popup.toggleEl.checked = false;
    popup.toggleEl.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));
    assert.strictEqual(ytToggle.disabled, true);

    // Re-enable, set embed true, then Reset Defaults -> returns to false
    popup.toggleEl.checked = true;
    popup.toggleEl.dispatchEvent(new Event('change', { bubbles: true }));
    ytToggle.checked = true;
    ytToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));

    doc.getElementById('resetDefaultsBtn').dispatchEvent(new Event('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 15));
    assert.strictEqual(ytToggle.checked, false, 'Reset Defaults must reset youtubeEmbedFallback to false');
    assert.strictEqual(content.getSettings().youtubeEmbedFallback, false);
  });

  console.log('\n========================================================================');
  console.log(`   UI FEATURES & CONTROLS ADVERSARIAL SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================================\n');

  return { passed, failed };
}

if (require.main === module) {
  runUiFeaturesAdversarialTests().then(({ failed }) => {
    process.exit(failed > 0 ? 1 : 0);
  });
}

module.exports = { runUiFeaturesAdversarialTests };
