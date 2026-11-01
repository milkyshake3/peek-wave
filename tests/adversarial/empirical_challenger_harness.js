/**
 * tests/adversarial/empirical_challenger_harness.js
 * 
 * EMPIRICAL CHALLENGER STRESS HARNESS
 * Comprehensive adversarial verification of all requirements:
 * 1. R1: YouTube Full-Page Stability, Embed-Immunity & Dimension Presets
 * 2. R2: Smooth Grow Animation Mathematics, Fallbacks, Popup Toggle & Dynamic Tab Sync
 * 3. R3: Git Repository Preparation (.gitignore & zero-emoji README.md)
 * 4. Authentic Icon Binary Integrity
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { setupTestEnvironment, loadLiveContentScript } = require('../harness/extension_loader');
const { createBrowserEnvironment } = require('../harness/dom_simulator');
const { createChromeMock } = require('../harness/chrome_mock');

const PROJECT_ROOT = path.resolve(__dirname, '../../');
const RULES_PATH = path.join(PROJECT_ROOT, 'rules.json');
const CONTENT_JS_PATH = path.join(PROJECT_ROOT, 'content/content.js');
const MODAL_CSS_PATH = path.join(PROJECT_ROOT, 'content/modal.css');
const STORAGE_JS_PATH = path.join(PROJECT_ROOT, 'lib/storage.js');
const BACKGROUND_JS_PATH = path.join(PROJECT_ROOT, 'background.js');
const POPUP_HTML_PATH = path.join(PROJECT_ROOT, 'popup/popup.html');
const POPUP_JS_PATH = path.join(PROJECT_ROOT, 'popup/popup.js');
const GITIGNORE_PATH = path.join(PROJECT_ROOT, '.gitignore');
const README_PATH = path.join(PROJECT_ROOT, 'README.md');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureDetails = [];

function runTest(testName, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✔ [PASS] ${testName}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✖ [FAIL] ${testName}`);
    console.error(`         ${err.message}`);
    failureDetails.push({ testName, error: err.message, stack: err.stack });
  }
}

async function runAsyncTest(testName, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✔ [PASS] ${testName}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✖ [FAIL] ${testName}`);
    console.error(`         ${err.message}`);
    failureDetails.push({ testName, error: err.message, stack: err.stack });
  }
}

function getStyleProp(el, propName) {
  if (!el || !el.style) return '';
  if (typeof el.style.getPropertyValue === 'function') {
    return el.style.getPropertyValue(propName);
  }
  return el.style[propName] || '';
}

async function runHarness() {
  console.log('========================================================================');
  console.log('       PEEK WAVE — EMPIRICAL CHALLENGER FINAL VERIFICATION HARNESS      ');
  console.log('========================================================================\n');

  // ==========================================================================
  // REQUIREMENT R1: YOUTUBE FULL-PAGE PREVIEWS & STABILITY INVARIANTS
  // ==========================================================================
  console.log('▶ [R1] ADVERSARIAL CHALLENGE: YouTube Preview Stability & Full-Page Invariants');

  const ytUrls = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120s&list=PLtest&index=1',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?t=45',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/abcdef12345',
    'https://www.youtube.com/@mkbhd',
    'https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw',
    'https://www.youtube.com/playlist?list=PLrAXtmErZgOdP_8GztsuKi9nrraNbKKp4',
    'https://www.youtube.com/live/someStreamId',
    'https://www.youtube.com/embed/existingEmbed'
  ];

  ytUrls.forEach((url, i) => {
    runTest(`R1.${i + 1}: YouTube URL preserves full URL without embed substitution: "${url}"`, () => {
      const env = setupTestEnvironment({ currentUrl: 'https://news.ycombinator.com' });
      const modal = env.content.mountModal(url, { win: env.win });
      assert(modal, 'Modal failed to mount');
      assert.strictEqual(modal.iframe.src, url, `Expected exact iframe.src "${url}", got "${modal.iframe.src}"`);
      if (!url.includes('/embed/')) {
        assert(!modal.iframe.src.includes('/embed/'), `Forbidden /embed/ found in: ${modal.iframe.src}`);
      }
      env.content.teardownModal(env.win);
    });
  });

  runTest('R1.13: Sandbox strictly omits top-navigation tokens to prevent frame-busting crash', () => {
    const env = setupTestEnvironment();
    const modal = env.content.mountModal('https://www.youtube.com/watch?v=test', { win: env.win });
    const sandbox = modal.iframe.getAttribute('sandbox') || '';
    assert(!sandbox.includes('allow-top-navigation'), 'Security violation: allow-top-navigation present');
    assert(!sandbox.includes('allow-top-navigation-by-user-activation'), 'Security violation: allow-top-navigation-by-user-activation present');
    assert(sandbox.includes('allow-scripts'), 'Missing allow-scripts');
    assert(sandbox.includes('allow-same-origin'), 'Missing allow-same-origin');
    assert(sandbox.includes('allow-forms'), 'Missing allow-forms');
    assert(sandbox.includes('allow-popups'), 'Missing allow-popups');
    env.content.teardownModal(env.win);
  });

  runTest('R1.14: Media feature-policy allows accelerometer, autoplay, encrypted-media, fullscreen', () => {
    const env = setupTestEnvironment();
    const modal = env.content.mountModal('https://www.youtube.com/watch?v=test', { win: env.win });
    const allow = modal.iframe.getAttribute('allow') || '';
    assert(allow.includes('autoplay'), 'Missing autoplay');
    assert(allow.includes('encrypted-media'), 'Missing encrypted-media');
    assert(allow.includes('fullscreen'), 'Missing fullscreen');
    assert(allow.includes('picture-in-picture'), 'Missing picture-in-picture');
    env.content.teardownModal(env.win);
  });

  runTest('R1.15: DeclarativeNetRequest removes COOP, COEP, CSP, XFO on sub_frame requests', () => {
    const rulesRaw = fs.readFileSync(RULES_PATH, 'utf8');
    const rules = JSON.parse(rulesRaw);
    assert(Array.isArray(rules) && rules.length > 0, 'rules.json must contain rules');
    const subframeRule = rules.find(r => r.condition?.resourceTypes?.includes('sub_frame'));
    assert(subframeRule, 'No sub_frame rule found in rules.json');
    const removedHeaders = subframeRule.action.responseHeaders.map(h => h.header.toLowerCase());
    assert(removedHeaders.includes('x-frame-options'), 'Missing X-Frame-Options removal');
    assert(removedHeaders.includes('content-security-policy'), 'Missing Content-Security-Policy removal');
    assert(removedHeaders.includes('cross-origin-opener-policy'), 'Missing COOP removal');
    assert(removedHeaders.includes('cross-origin-embedder-policy'), 'Missing COEP removal');
  });

  runTest('R1.16: Modal dimension presets match across Compact (640x480), Default (860x600), Large (1100x760)', () => {
    const modalCss = fs.readFileSync(MODAL_CSS_PATH, 'utf8');
    const contentJs = fs.readFileSync(CONTENT_JS_PATH, 'utf8');
    ['compact', 'default', 'large'].forEach(preset => {
      assert(modalCss.includes(`peek-size-${preset}`), `modal.css missing peek-size-${preset}`);
      assert(contentJs.includes(`peek-size-${preset}`), `content.js missing peek-size-${preset}`);
    });
    assert(modalCss.includes('640px'), 'compact width 640px missing in CSS');
    assert(modalCss.includes('480px'), 'compact height 480px missing in CSS');
    assert(modalCss.includes('860px'), 'default width 860px missing in CSS');
    assert(modalCss.includes('600px'), 'default height 600px missing in CSS');
    assert(modalCss.includes('1100px'), 'large width 1100px missing in CSS');
    assert(modalCss.includes('760px'), 'large height 760px missing in CSS');
  });

  // ==========================================================================
  // REQUIREMENT R2: GROW ANIMATION FROM LINK & POPUP SETTINGS TOGGLE
  // ==========================================================================
  console.log('\n▶ [R2] ADVERSARIAL CHALLENGE: Smooth Grow Animation & Toggle Mechanics');

  runTest('R2.1: Default settings include growAnimation: true across all components', () => {
    const storageModule = require(STORAGE_JS_PATH);
    const backgroundModule = require(BACKGROUND_JS_PATH);
    const contentModule = require(CONTENT_JS_PATH);
    assert.strictEqual(storageModule.DEFAULT_SETTINGS.growAnimation, true, 'storage.js DEFAULT_SETTINGS.growAnimation !== true');
    assert.strictEqual(backgroundModule.DEFAULT_SETTINGS.growAnimation, true, 'background.js DEFAULT_SETTINGS.growAnimation !== true');
    assert.strictEqual(contentModule.DEFAULT_SETTINGS.growAnimation, true, 'content.js DEFAULT_SETTINGS.growAnimation !== true');
  });

  runTest('R2.2: CSS keyframe peek-grow-from-link exists in modal.css and content.js', () => {
    const modalCss = fs.readFileSync(MODAL_CSS_PATH, 'utf8');
    const contentJs = fs.readFileSync(CONTENT_JS_PATH, 'utf8');
    assert(modalCss.includes('.peek-wave-modal.peek-animate-grow'), 'modal.css missing .peek-animate-grow');
    assert(modalCss.includes('@keyframes peek-grow-from-link'), 'modal.css missing @keyframes peek-grow-from-link');
    assert(contentJs.includes('.peek-wave-modal.peek-animate-grow'), 'content.js missing .peek-animate-grow');
    assert(contentJs.includes('@keyframes peek-grow-from-link'), 'content.js missing @keyframes peek-grow-from-link');
  });

  runTest('R2.3: Mathematical translation & scaling verification: Top-Left Anchor', () => {
    const env = setupTestEnvironment();
    env.win.innerWidth = 1000;
    env.win.innerHeight = 800;

    // Link at Top-Left: left=50, top=50, width=100, height=30
    const modal = env.content.mountModal('https://example.com/top-left', {
      win: env.win,
      sizePreset: 'default',
      linkRect: { left: 50, top: 50, width: 100, height: 30 },
      growAnimation: true
    });
    assert(modal, 'Modal failed to mount');
    assert(modal.modal.classList.contains('peek-animate-grow'), 'peek-animate-grow class missing');

    const originX = getStyleProp(modal.modal, '--peek-origin-x');
    const originY = getStyleProp(modal.modal, '--peek-origin-y');
    const scaleX = getStyleProp(modal.modal, '--peek-scale-x');
    const scaleY = getStyleProp(modal.modal, '--peek-scale-y');

    // Viewport: 1000x800 -> Center = (500, 400)
    // Link Center: (50 + 50, 50 + 15) = (100, 65)
    // DeltaX = 100 - 500 = -400px
    // DeltaY = 65 - 400 = -335px
    assert.strictEqual(originX, '-400px', `Unexpected originX: ${originX}`);
    assert.strictEqual(originY, '-335px', `Unexpected originY: ${originY}`);
    assert(parseFloat(scaleX) > 0 && parseFloat(scaleX) <= 1, `scaleX out of range: ${scaleX}`);
    assert(parseFloat(scaleY) > 0 && parseFloat(scaleY) <= 1, `scaleY out of range: ${scaleY}`);
    env.content.teardownModal(env.win);
  });

  runTest('R2.4: Mathematical translation & scaling verification: Bottom-Right Anchor', () => {
    const env = setupTestEnvironment();
    env.win.innerWidth = 1200;
    env.win.innerHeight = 900;

    // Link at Bottom-Right: left=1000, top=800, width=120, height=40
    const modal = env.content.mountModal('https://example.com/bot-right', {
      win: env.win,
      sizePreset: 'large',
      linkRect: { left: 1000, top: 800, width: 120, height: 40 },
      growAnimation: true
    });
    assert(modal.modal.classList.contains('peek-animate-grow'), 'peek-animate-grow class missing');

    const originX = getStyleProp(modal.modal, '--peek-origin-x');
    const originY = getStyleProp(modal.modal, '--peek-origin-y');
    // Viewport: 1200x900 -> Center = (600, 450)
    // Link Center: (1000 + 60, 800 + 20) = (1060, 820)
    // DeltaX = 1060 - 600 = +460px
    // DeltaY = 820 - 450 = +370px
    assert.strictEqual(originX, '460px', `Unexpected originX: ${originX}`);
    assert.strictEqual(originY, '370px', `Unexpected originY: ${originY}`);
    env.content.teardownModal(env.win);
  });

  runTest('R2.5: Center appearance fallback when growAnimation is explicitly disabled', () => {
    const env = setupTestEnvironment();
    env.win.innerWidth = 1000;
    env.win.innerHeight = 800;

    const modal = env.content.mountModal('https://example.com/no-grow', {
      win: env.win,
      linkRect: { left: 100, top: 100, width: 80, height: 24 },
      growAnimation: false
    });
    assert(!modal.modal.classList.contains('peek-animate-grow'), 'peek-animate-grow MUST NOT be present when growAnimation: false');
    env.content.teardownModal(env.win);
  });

  runTest('R2.6: Center appearance fallback when linkRect is missing/null', () => {
    const env = setupTestEnvironment();
    const modal = env.content.mountModal('https://example.com/no-rect', {
      win: env.win,
      linkRect: null,
      growAnimation: true
    });
    assert(!modal.modal.classList.contains('peek-animate-grow'), 'peek-animate-grow MUST NOT be present when linkRect is null');
    env.content.teardownModal(env.win);
  });

  runTest('R2.7: Bounding rect fallback to click coordinates when getClientRects is empty/unsupported', () => {
    const env = setupTestEnvironment();

    const anchor = env.doc.createElement('a');
    anchor.href = 'https://example.com/coords-fallback';
    anchor.textContent = 'Coords Fallback';
    env.doc.body.appendChild(anchor);

    // Click at coordinates (400, 300) with Shift
    const clickEvt = new env.win.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      shiftKey: true,
      clientX: 400,
      clientY: 300,
      button: 0
    });
    anchor.dispatchEvent(clickEvt);

    const modal = env.getModal();
    assert(modal, 'Modal should be mounted via click interception');
    assert(modal.modal.classList.contains('peek-animate-grow'), 'Modal should grow using click coordinate fallback');

    const originX = getStyleProp(modal.modal, '--peek-origin-x');
    const originY = getStyleProp(modal.modal, '--peek-origin-y');
    assert(originX && originX.includes('px'), `originX CSS property must be set in px, got: ${originX}`);
    assert(originY && originY.includes('px'), `originY CSS property must be set in px, got: ${originY}`);
    env.teardown();
  });

  await runAsyncTest('R2.8: Popup UI toggle loads default, toggles state, and persists to storage', async () => {
    const popupHtml = fs.readFileSync(POPUP_HTML_PATH, 'utf8');
    const popupWin = createBrowserEnvironment(popupHtml);
    const chromeMock = createChromeMock();
    const popupModule = require(POPUP_JS_PATH);

    const controller = popupModule.initPopup(popupWin, chromeMock);
    assert(controller.growToggleEl, 'growToggleEl handle missing from controller');
    assert.strictEqual(controller.growToggleEl.checked, true, 'Default grow toggle state must be checked (true)');

    // Uncheck grow toggle
    controller.growToggleEl.checked = false;
    await controller.saveSettings();

    // Verify storage received growAnimation: false
    const storageModule = require(STORAGE_JS_PATH);
    const saved = await storageModule.readSettings(chromeMock);
    assert.strictEqual(saved.growAnimation, false, 'Expected growAnimation: false in storage after unchecking');

    // Re-check grow toggle
    controller.growToggleEl.checked = true;
    await controller.saveSettings();
    const savedAfter = await storageModule.readSettings(chromeMock);
    assert.strictEqual(savedAfter.growAnimation, true, 'Expected growAnimation: true in storage after re-checking');
  });

  await runAsyncTest('R2.9: Live dynamic propagation: toggling popup setting immediately affects active tabs without reload', async () => {
    const chromeMock = createChromeMock();
    const storageModule = require(STORAGE_JS_PATH);

    // Tab 1 running live content script
    const envTab1 = createBrowserEnvironment();
    envTab1.chrome = chromeMock;
    const contentTab1 = loadLiveContentScript(envTab1, chromeMock);

    // Tab 2 running live content script
    const envTab2 = createBrowserEnvironment();
    envTab2.chrome = chromeMock;
    const contentTab2 = loadLiveContentScript(envTab2, chromeMock);

    // Initial state: grow animation is enabled in both tabs
    assert.strictEqual(contentTab1.getSettings().growAnimation, true, 'Tab 1 initial growAnimation should be true');
    assert.strictEqual(contentTab2.getSettings().growAnimation, true, 'Tab 2 initial growAnimation should be true');

    // Popup disables grow animation and persists (automatically notifies onChanged listeners)
    await storageModule.saveSettings({ growAnimation: false }, chromeMock);

    assert.strictEqual(contentTab1.getSettings().growAnimation, false, 'Tab 1 should update growAnimation to false dynamically');
    assert.strictEqual(contentTab2.getSettings().growAnimation, false, 'Tab 2 should update growAnimation to false dynamically');

    // Create anchor in Tab 1 and click
    const anchor = envTab1.document.createElement('a');
    anchor.href = 'https://example.com/dynamic-test';
    anchor.textContent = 'Dynamic Link';
    envTab1.document.body.appendChild(anchor);

    const clickEvt = new envTab1.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      shiftKey: true,
      clientX: 300,
      clientY: 200,
      button: 0
    });
    anchor.dispatchEvent(clickEvt);

    const modal = contentTab1.getModal();
    assert(modal, 'Modal should mount in Tab 1');
    assert(!modal.modal.classList.contains('peek-animate-grow'), 'Modal in Tab 1 must NOT have peek-animate-grow when dynamically disabled');

    contentTab1.teardownModal(envTab1);
  });

  // ==========================================================================
  // REQUIREMENT R3: GIT REPOSITORY PREPARATION (.gitignore & README.md)
  // ==========================================================================
  console.log('\n▶ [R3] ADVERSARIAL CHALLENGE: Git Repository Preparation (.gitignore & README.md)');

  runTest('R3.1: .gitignore exists in repo root and contains all required categories', () => {
    assert(fs.existsSync(GITIGNORE_PATH), '.gitignore missing in repository root');
    const gitignoreContent = fs.readFileSync(GITIGNORE_PATH, 'utf8');

    const requiredPatterns = [
      '.agents/',
      '_metadata/',
      'node_modules/',
      'package-lock.json',
      'coverage/',
      '.nyc_output/',
      '*.log',
      'logs/',
      '*.tmp',
      'temp/',
      'tmp/',
      '.vscode/',
      '.idea/',
      '.DS_Store',
      'Thumbs.db',
      '__pycache__/'
    ];

    for (const pat of requiredPatterns) {
      assert(gitignoreContent.includes(pat), `.gitignore missing required pattern: "${pat}"`);
    }
  });

  runTest('R3.2: README.md exists, is concise, and contains installation, usage, and structure', () => {
    assert(fs.existsSync(README_PATH), 'README.md missing in repository root');
    const readmeContent = fs.readFileSync(README_PATH, 'utf8');
    assert(readmeContent.includes('# Peek Wave'), 'README missing title');
    assert(readmeContent.includes('## Features'), 'README missing Features section');
    assert(readmeContent.includes('## Installation'), 'README missing Installation section');
    assert(readmeContent.includes('Load unpacked'), 'README missing Load unpacked instructions');
    assert(readmeContent.includes('## Usage'), 'README missing Usage section');
    assert(readmeContent.includes('## Project Structure'), 'README missing Project Structure section');
    assert(readmeContent.includes('## Automated Tests'), 'README missing Automated Tests section');
  });

  runTest('R3.3: README.md contains STRICTLY ZERO EMOJIS across all Unicode emoji blocks', () => {
    const readmeContent = fs.readFileSync(README_PATH, 'utf8');
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{203C}\u{2049}\u{2122}\u{2139}\u{2194}-\u{2199}\u{21A9}-\u{21AA}\u{25AA}\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}]/gu;
    const matches = readmeContent.match(emojiRegex);
    assert.strictEqual(matches, null, `Found emojis in README.md: ${JSON.stringify(matches)}`);
  });

  // ==========================================================================
  // AUTHENTIC ICON ASSETS EMPIRICAL INTEGRITY
  // ==========================================================================
  console.log('\n▶ [ICONS] ADVERSARIAL CHALLENGE: Authentic User Icon Assets Validation');

  const iconSizes = [16, 32, 48, 128];
  iconSizes.forEach((sz) => {
    runTest(`ICONS.${sz}: icon${sz}.png exists and matches authentic PNG format`, () => {
      const p = path.join(PROJECT_ROOT, `icons/icon${sz}.png`);
      assert(fs.existsSync(p), `Missing icon file: ${p}`);
      const buf = fs.readFileSync(p);
      assert(buf.length > 50, `Icon file too small (${buf.length} bytes): ${p}`);
      // PNG 8-byte magic: 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
      assert.strictEqual(buf[0], 0x89);
      assert.strictEqual(buf[1], 0x50);
      assert.strictEqual(buf[2], 0x4E);
      assert.strictEqual(buf[3], 0x47);
      // IHDR width and height at offset 16 and 20 (big-endian 32-bit int)
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      assert.strictEqual(width, sz, `Expected width ${sz}, got ${width}`);
      assert.strictEqual(height, sz, `Expected height ${sz}, got ${height}`);
    });
  });

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log('\n========================================================================');
  console.log('              EMPIRICAL CHALLENGER VERIFICATION SUMMARY                 ');
  console.log('========================================================================');
  console.log(`- TOTAL TESTS EXECUTED: ${totalTests}`);
  console.log(`- TOTAL PASSED:         ${passedTests}`);
  console.log(`- TOTAL FAILED:         ${failedTests}`);
  console.log(`- FINAL VERDICT:        ${failedTests === 0 ? 'APPROVE' : 'REJECT'}`);
  console.log('========================================================================\n');

  if (failureDetails.length > 0) {
    console.error('Failure Details:');
    failureDetails.forEach((f, idx) => {
      console.error(`  ${idx + 1}. ${f.testName}: ${f.error}`);
    });
  }

  process.exit(failedTests > 0 ? 1 : 0);
}

runHarness().catch((err) => {
  console.error('Fatal unhandled error in challenger harness:', err);
  process.exit(1);
});
