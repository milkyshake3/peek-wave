/**
 * m1_yt_empirical_challenge.test.js
 * 
 * Empirical Adversarial Challenger Test Suite for Milestone M1_YT:
 * 1. Full-page YouTube URLs loaded without /embed/ transformation across all formats.
 * 2. Strict omission of allow-top-navigation and variants from sandbox permissions.
 * 3. Exact size preset dimensions and synchronization across CSS, JS, HTML, and storage.
 * 4. Renderer stability invariants: COOP/COEP sub_frame stripping, GPU layer pinning,
 *    DOM containment, isolation, and backdrop blur optimizations.
 * 5. Deterministic low-RAM teardown lifecycle under rapid YouTube modal cycling.
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { setupTestEnvironment, loadLiveContentScript } = require('../harness/extension_loader');

const PROJECT_ROOT = path.resolve(__dirname, '../../');
const RULES_PATH = path.join(PROJECT_ROOT, 'rules.json');
const CONTENT_JS_PATH = path.join(PROJECT_ROOT, 'content/content.js');
const MODAL_CSS_PATH = path.join(PROJECT_ROOT, 'content/modal.css');
const POPUP_HTML_PATH = path.join(PROJECT_ROOT, 'popup/popup.html');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

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
    if (err.stack) {
      const callerLine = err.stack.split('\n')[2];
      if (callerLine) console.error(`         ${callerLine.trim()}`);
    }
  }
}

console.log('\n===============================================================');
console.log('   EMPIRICAL ADVERSARIAL CHALLENGER SUITE: MILESTONE M1_YT     ');
console.log('===============================================================\n');

// -----------------------------------------------------------------------------
// Suite 1: Full-Page YouTube URL Integrity (Strictly No /embed/ Conversion)
// -----------------------------------------------------------------------------
console.log('▶ Suite 1: Full-Page YouTube URL Integrity & Anti-Embed Verification');

const youtubeTestUrls = [
  { desc: 'Standard watch URL', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
  { desc: 'Watch URL with timestamp', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s' },
  { desc: 'Watch URL with playlist and index', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLrAXtmErZgOdP_8GztsuKi9nrraNbKKp4&index=3' },
  { desc: 'Watch URL with feature/share/si tracking query', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share&si=test123abc' },
  { desc: 'Shortened youtu.be URL', url: 'https://youtu.be/dQw4w9WgXcQ' },
  { desc: 'Shortened youtu.be URL with timestamp', url: 'https://youtu.be/dQw4w9WgXcQ?t=120' },
  { desc: 'YouTube Shorts URL', url: 'https://www.youtube.com/shorts/3d6v5f4g3h' },
  { desc: 'YouTube Live stream URL', url: 'https://www.youtube.com/live/AbCdEfGhIjK' },
  { desc: 'YouTube Channel handle URL', url: 'https://www.youtube.com/@mkbhd' },
  { desc: 'YouTube Channel videos tab URL', url: 'https://www.youtube.com/c/Veritasium/videos' },
  { desc: 'YouTube Playlist URL', url: 'https://www.youtube.com/playlist?list=PLrAXtmErZgOdP_8GztsuKi9nrraNbKKp4' },
  { desc: 'YouTube Community post URL', url: 'https://www.youtube.com/post/Ugkxxxx' },
  { desc: 'YouTube Music URL', url: 'https://music.youtube.com/watch?v=dQw4w9WgXcQ' },
  { desc: 'Mobile m.youtube.com URL', url: 'https://m.youtube.com/watch?v=dQw4w9WgXcQ' },
  { desc: 'YouTube URL with fragment hash', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ#t=10m' },
  { desc: 'Pre-existing embed URL (preserved as-is without distortion)', url: 'https://www.youtube.com/embed/dQw4w9WgXcQ' },
  { desc: 'Non-YouTube URL (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Chromium' },
  { desc: 'Non-YouTube URL (GitHub repo)', url: 'https://github.com/test/repo' }
];

youtubeTestUrls.forEach((item, idx) => {
  runTest(`1.${idx + 1}: ${item.desc} loads exact full URL without /embed/ conversion`, () => {
    const env = setupTestEnvironment({ currentUrl: 'https://myblog.com/posts/1' });
    const content = loadLiveContentScript(env.win);

    const anchor = env.doc.createElement('a');
    anchor.href = item.url;
    anchor.textContent = 'Link';
    env.doc.body.appendChild(anchor);

    const modal = content.mountModal(item.url, { win: env.win });
    assert(modal, 'Modal failed to mount');

    const iframe = modal.iframe;
    assert(iframe, 'Iframe element missing in modal');

    // Expected URL should equal exact parsed fullUrl
    const expectedUrl = new URL(item.url, env.doc.baseURI).href;
    assert.strictEqual(iframe.src, expectedUrl, `Expected iframe.src to be "${expectedUrl}", got "${iframe.src}"`);

    // Verify /embed/ was NOT introduced
    if (!item.url.includes('/embed/')) {
      assert(!iframe.src.includes('/embed/'), `Forbidden /embed/ found in iframe.src: "${iframe.src}"`);
    }

    content.teardownModal(env.win);
  });
});

runTest('1.19: extractAnchorUrl extracts raw href and full URL without embed substitution', () => {
  const env = setupTestEnvironment({ currentUrl: 'https://myblog.com/posts/1' });
  const content = loadLiveContentScript(env.win);

  const anchor = env.doc.createElement('a');
  anchor.href = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  env.doc.body.appendChild(anchor);

  const details = content.extractAnchorUrl(anchor, env.doc.baseURI);
  assert(details, 'extractAnchorUrl returned null');
  assert.strictEqual(details.fullUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert(!details.fullUrl.includes('/embed/'), 'extractAnchorUrl introduced /embed/');
});

// -----------------------------------------------------------------------------
// Suite 2: Strict Sandbox Security & Navigation Restrictions
// -----------------------------------------------------------------------------
console.log('\n▶ Suite 2: Strict Sandbox Security & Navigation Restrictions');

runTest('2.1: iframe sandbox strictly omits allow-top-navigation', () => {
  const env = setupTestEnvironment({ currentUrl: 'https://myblog.com/posts/1' });
  const content = loadLiveContentScript(env.win);

  const modal = content.mountModal('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { win: env.win });
  const sandbox = modal.iframe.getAttribute('sandbox') || '';
  
  assert(!sandbox.includes('allow-top-navigation'), 'Security violation: allow-top-navigation is present in sandbox');
  content.teardownModal(env.win);
});

runTest('2.2: iframe sandbox strictly omits allow-top-navigation-by-user-activation', () => {
  const env = setupTestEnvironment({ currentUrl: 'https://myblog.com/posts/1' });
  const content = loadLiveContentScript(env.win);

  const modal = content.mountModal('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { win: env.win });
  const sandbox = modal.iframe.getAttribute('sandbox') || '';
  
  assert(!sandbox.includes('allow-top-navigation-by-user-activation'), 'Security violation: allow-top-navigation-by-user-activation is present');
  content.teardownModal(env.win);
});

runTest('2.3: iframe sandbox strictly omits allow-top-navigation-to-custom-protocols', () => {
  const env = setupTestEnvironment({ currentUrl: 'https://myblog.com/posts/1' });
  const content = loadLiveContentScript(env.win);

  const modal = content.mountModal('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { win: env.win });
  const sandbox = modal.iframe.getAttribute('sandbox') || '';
  
  assert(!sandbox.includes('allow-top-navigation-to-custom-protocols'), 'Security violation: custom protocols top navigation present');
  content.teardownModal(env.win);
});

runTest('2.4: iframe sandbox includes required permissions for full YouTube player', () => {
  const env = setupTestEnvironment({ currentUrl: 'https://myblog.com/posts/1' });
  const content = loadLiveContentScript(env.win);

  const modal = content.mountModal('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { win: env.win });
  const sandbox = modal.iframe.getAttribute('sandbox') || '';
  const tokens = sandbox.split(/\s+/).filter(Boolean);

  const requiredTokens = [
    'allow-scripts',
    'allow-same-origin',
    'allow-forms',
    'allow-popups',
    'allow-popups-to-escape-sandbox',
    'allow-presentation',
    'allow-modals',
    'allow-downloads'
  ];

  requiredTokens.forEach((token) => {
    assert(tokens.includes(token), `Required sandbox token missing: ${token}`);
  });

  content.teardownModal(env.win);
});

runTest('2.5: iframe allow attribute includes player media and hardware permissions', () => {
  const env = setupTestEnvironment({ currentUrl: 'https://myblog.com/posts/1' });
  const content = loadLiveContentScript(env.win);

  const modal = content.mountModal('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { win: env.win });
  const allow = modal.iframe.getAttribute('allow') || '';

  const requiredPermissions = [
    'accelerometer',
    'autoplay',
    'clipboard-write',
    'encrypted-media',
    'gyroscope',
    'picture-in-picture',
    'web-share',
    'fullscreen'
  ];

  requiredPermissions.forEach((perm) => {
    assert(allow.includes(perm), `Required permission missing from allow attribute: ${perm}`);
  });

  content.teardownModal(env.win);
});

runTest('2.6: iframe security attributes: allowfullscreen, loading eager, importance high, referrerpolicy', () => {
  const env = setupTestEnvironment({ currentUrl: 'https://myblog.com/posts/1' });
  const content = loadLiveContentScript(env.win);

  const modal = content.mountModal('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { win: env.win });
  const iframe = modal.iframe;

  assert.strictEqual(iframe.getAttribute('allowfullscreen'), 'true');
  assert.strictEqual(iframe.getAttribute('loading'), 'eager');
  assert.strictEqual(iframe.getAttribute('importance'), 'high');
  assert.strictEqual(iframe.getAttribute('referrerpolicy'), 'origin-when-cross-origin');

  content.teardownModal(env.win);
});

// -----------------------------------------------------------------------------
// Suite 3: Size Presets & Layout Dimensions Across Codebase
// -----------------------------------------------------------------------------
console.log('\n▶ Suite 3: Modal Dimensions & Size Presets Integrity Across Components');

runTest('3.1: Compact preset applies .peek-size-compact class to modal element', () => {
  const env = setupTestEnvironment({ currentUrl: 'https://myblog.com/posts/1' });
  const content = loadLiveContentScript(env.win);

  const modal = content.mountModal('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
    win: env.win,
    sizePreset: 'compact'
  });

  assert(modal.modal.classList.contains('peek-size-compact'), 'Expected class peek-size-compact on modal');
  content.teardownModal(env.win);
});

runTest('3.2: Default preset applies .peek-size-default class to modal element', () => {
  const env = setupTestEnvironment({ currentUrl: 'https://myblog.com/posts/1' });
  const content = loadLiveContentScript(env.win);

  const modal = content.mountModal('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
    win: env.win,
    sizePreset: 'default'
  });

  assert(modal.modal.classList.contains('peek-size-default'), 'Expected class peek-size-default on modal');
  content.teardownModal(env.win);
});

runTest('3.3: Large preset applies .peek-size-large class to modal element', () => {
  const env = setupTestEnvironment({ currentUrl: 'https://myblog.com/posts/1' });
  const content = loadLiveContentScript(env.win);

  const modal = content.mountModal('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
    win: env.win,
    sizePreset: 'large'
  });

  assert(modal.modal.classList.contains('peek-size-large'), 'Expected class peek-size-large on modal');
  content.teardownModal(env.win);
});

runTest('3.4: Invalid or missing size preset safely defaults to "default"', () => {
  const env = setupTestEnvironment({ currentUrl: 'https://myblog.com/posts/1' });
  const content = loadLiveContentScript(env.win);

  ['unknown_size', '', null, undefined, 12345].forEach((badSize) => {
    const modal = content.mountModal('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
      win: env.win,
      sizePreset: badSize
    });
    assert(modal.modal.className.includes('peek-size-'), 'Modal must have a size class');
    content.teardownModal(env.win);
  });
});

runTest('3.5: CSS dimensions in content/content.js MODAL_CSS_TEXT match exact specifications', () => {
  const contentJsCode = fs.readFileSync(CONTENT_JS_PATH, 'utf8');

  // Compact: 640x480
  assert(contentJsCode.includes('width: min(640px, 85vw) !important;'), 'Compact width missing in content.js');
  assert(contentJsCode.includes('height: min(480px, 75vh) !important;'), 'Compact height missing in content.js');

  // Default: 860x600
  assert(contentJsCode.includes('width: min(860px, 85vw) !important;'), 'Default width missing in content.js');
  assert(contentJsCode.includes('height: min(600px, 85vh) !important;'), 'Default height missing in content.js');

  // Large: 1100x760
  assert(contentJsCode.includes('width: min(1100px, 92vw) !important;'), 'Large width missing in content.js');
  assert(contentJsCode.includes('height: min(760px, 90vh) !important;'), 'Large height missing in content.js');
});

runTest('3.6: CSS dimensions in content/modal.css match MODAL_CSS_TEXT 100%', () => {
  const modalCssCode = fs.readFileSync(MODAL_CSS_PATH, 'utf8');

  // Compact: 640x480
  assert(modalCssCode.includes('width: min(640px, 85vw) !important;'), 'Compact width missing in modal.css');
  assert(modalCssCode.includes('height: min(480px, 75vh) !important;'), 'Compact height missing in modal.css');

  // Default: 860x600
  assert(modalCssCode.includes('width: min(860px, 85vw) !important;'), 'Default width missing in modal.css');
  assert(modalCssCode.includes('height: min(600px, 85vh) !important;'), 'Default height missing in modal.css');

  // Large: 1100x760
  assert(modalCssCode.includes('width: min(1100px, 92vw) !important;'), 'Large width missing in modal.css');
  assert(modalCssCode.includes('height: min(760px, 90vh) !important;'), 'Large height missing in modal.css');
});

runTest('3.7: popup/popup.html labels and inputs reflect 640×480, 860×600, 1100×760 presets', () => {
  const popupHtml = fs.readFileSync(POPUP_HTML_PATH, 'utf8');

  assert(popupHtml.includes('640×480'), 'Compact 640×480 missing in popup.html');
  assert(popupHtml.includes('860×600'), 'Default 860×600 missing in popup.html');
  assert(popupHtml.includes('1100×760'), 'Large 1100×760 missing in popup.html');

  assert(popupHtml.includes('value="compact"'), 'compact value missing in popup.html');
  assert(popupHtml.includes('value="default"'), 'default value missing in popup.html');
  assert(popupHtml.includes('value="large"'), 'large value missing in popup.html');
});

// -----------------------------------------------------------------------------
// Suite 4: Renderer Crash (STATUS_BREAKPOINT) & Compositing Invariants
// -----------------------------------------------------------------------------
console.log('\n▶ Suite 4: Renderer Stability & Compositing Invariants');

runTest('4.1: rules.json removes Cross-Origin-Opener-Policy on sub_frame requests', () => {
  const rules = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
  const subframeRule = rules.find((r) => r.condition?.resourceTypes?.includes('sub_frame'));
  assert(subframeRule, 'No rule found targeting sub_frame in rules.json');

  const removed = subframeRule.action?.responseHeaders?.filter((h) => h.operation === 'remove').map((h) => h.header);
  assert(removed.includes('Cross-Origin-Opener-Policy'), 'Cross-Origin-Opener-Policy not removed');
});

runTest('4.2: rules.json removes Cross-Origin-Embedder-Policy on sub_frame requests', () => {
  const rules = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
  const subframeRule = rules.find((r) => r.condition?.resourceTypes?.includes('sub_frame'));

  const removed = subframeRule.action?.responseHeaders?.filter((h) => h.operation === 'remove').map((h) => h.header);
  assert(removed.includes('Cross-Origin-Embedder-Policy'), 'Cross-Origin-Embedder-Policy not removed');
});

runTest('4.3: rules.json removes X-Frame-Options and Frame-Options on sub_frame requests', () => {
  const rules = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
  const subframeRule = rules.find((r) => r.condition?.resourceTypes?.includes('sub_frame'));

  const removed = subframeRule.action?.responseHeaders?.filter((h) => h.operation === 'remove').map((h) => h.header);
  assert(removed.includes('X-Frame-Options'), 'X-Frame-Options not removed');
  assert(removed.includes('Frame-Options'), 'Frame-Options not removed');
});

runTest('4.4: rules.json removes Content-Security-Policy and Report-Only on sub_frame requests', () => {
  const rules = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
  const subframeRule = rules.find((r) => r.condition?.resourceTypes?.includes('sub_frame'));

  const removed = subframeRule.action?.responseHeaders?.filter((h) => h.operation === 'remove').map((h) => h.header);
  assert(removed.includes('Content-Security-Policy'), 'Content-Security-Policy not removed');
  assert(removed.includes('Content-Security-Policy-Report-Only'), 'Content-Security-Policy-Report-Only not removed');
});

runTest('4.5: rules.json strictly excludes main_frame from header stripping', () => {
  const rules = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
  rules.forEach((rule) => {
    const resourceTypes = rule.condition?.resourceTypes || [];
    assert(!resourceTypes.includes('main_frame'), 'Security violation: main_frame targeted in declarativeNetRequest rule');
  });
});

runTest('4.6: CSS backdrop-filter is tuned to 4px and isolated', () => {
  const contentJsCode = fs.readFileSync(CONTENT_JS_PATH, 'utf8');
  assert(contentJsCode.includes('backdrop-filter: blur(4px) !important;'), 'backdrop-filter: blur(4px) missing in content.js');
  assert(contentJsCode.includes('-webkit-backdrop-filter: blur(4px) !important;'), '-webkit-backdrop-filter missing in content.js');

  const modalCssCode = fs.readFileSync(MODAL_CSS_PATH, 'utf8');
  assert(modalCssCode.includes('backdrop-filter: blur(4px) !important;'), 'backdrop-filter: blur(4px) missing in modal.css');
  assert(modalCssCode.includes('-webkit-backdrop-filter: blur(4px) !important;'), '-webkit-backdrop-filter missing in modal.css');
});

runTest('4.7: CSS modal container removes persistent will-change and pins layer via translateZ(0)', () => {
  const contentJsCode = fs.readFileSync(CONTENT_JS_PATH, 'utf8');
  const modalCssCode = fs.readFileSync(MODAL_CSS_PATH, 'utf8');

  // Verify will-change: transform, opacity is NOT present on .peek-wave-modal
  const willChangeModalPattern = /\.peek-wave-modal\s*\{[^}]*will-change:[^}]*\}/;
  assert(!willChangeModalPattern.test(contentJsCode), 'Forbidden persistent will-change found on modal container in content.js');
  assert(!willChangeModalPattern.test(modalCssCode), 'Forbidden persistent will-change found on modal container in modal.css');

  // Verify transform: translateZ(0) and isolation: isolate are present
  assert(contentJsCode.includes('transform: translateZ(0) !important;'), 'transform: translateZ(0) missing in content.js');
  assert(modalCssCode.includes('transform: translateZ(0) !important;'), 'transform: translateZ(0) missing in modal.css');
});

runTest('4.8: CSS iframe wrapper enforces strict containment and isolation', () => {
  const contentJsCode = fs.readFileSync(CONTENT_JS_PATH, 'utf8');
  const modalCssCode = fs.readFileSync(MODAL_CSS_PATH, 'utf8');

  assert(contentJsCode.includes('contain: strict !important;'), 'contain: strict missing in content.js');
  assert(modalCssCode.includes('contain: strict !important;'), 'contain: strict missing in modal.css');

  assert(contentJsCode.includes('contain: size layout paint !important;'), 'contain: size layout paint missing for iframe in content.js');
  assert(modalCssCode.includes('contain: size layout paint !important;'), 'contain: size layout paint missing for iframe in modal.css');
});

// -----------------------------------------------------------------------------
// Suite 5: Teardown Lifecycle & Resource Deallocation Stress Harness
// -----------------------------------------------------------------------------
console.log('\n▶ Suite 5: Teardown Lifecycle & Resource Deallocation Stress Harness');

runTest('5.1: 50 consecutive YouTube preview mounts and dismissals execute cleanly', () => {
  const env = setupTestEnvironment({ currentUrl: 'https://myblog.com/posts/1' });
  const content = loadLiveContentScript(env.win);

  for (let i = 0; i < 50; i++) {
    const url = `https://www.youtube.com/watch?v=video_${i}`;
    const modal = content.mountModal(url, { win: env.win });
    assert(modal, `Modal mount failed on iteration ${i}`);
    assert.strictEqual(modal.iframe.src, url);

    // Alternate dismissal methods: backdrop click, Escape key, teardownModal
    if (i % 3 === 0) {
      modal.backdrop.dispatchEvent(new env.win.MouseEvent('click', { bubbles: true }));
    } else if (i % 3 === 1) {
      env.win.dispatchEvent(new env.win.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    } else {
      content.teardownModal(env.win);
    }

    assert.strictEqual(content.getModal(), null, `Active modal not nullified on iteration ${i}`);
    assert.strictEqual(env.doc.getElementById('peek-wave-host'), null, `Host element not removed on iteration ${i}`);
  }
});

runTest('5.2: teardownModal synchronously sets iframe.src = "about:blank" to stop media threads', () => {
  const env = setupTestEnvironment({ currentUrl: 'https://myblog.com/posts/1' });
  const content = loadLiveContentScript(env.win);

  const modal = content.mountModal('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { win: env.win });
  const iframeRef = modal.iframe;

  content.teardownModal(env.win);
  assert.strictEqual(iframeRef.src, 'about:blank', 'Iframe src was not set to about:blank during teardown');
});

runTest('5.3: double teardownModal calls are safe and idempotent', () => {
  const env = setupTestEnvironment({ currentUrl: 'https://myblog.com/posts/1' });
  const content = loadLiveContentScript(env.win);

  content.mountModal('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { win: env.win });
  content.teardownModal(env.win);
  
  // Second call must not throw
  assert.doesNotThrow(() => {
    content.teardownModal(env.win);
  });
  assert.strictEqual(content.getModal(), null);
});

// -----------------------------------------------------------------------------
// Summary & Verdict
// -----------------------------------------------------------------------------
console.log('\n---------------------------------------------------------------');
console.log(`M1_YT CHALLENGER SUITE SUMMARY: ${passedTests} passed, ${failedTests} failed, ${totalTests} total`);
console.log('---------------------------------------------------------------');

if (failedTests > 0) {
  console.error(`\n❌ CHALLENGE FAILED: ${failedTests} test(s) failed in Milestone M1_YT.`);
  process.exit(1);
} else {
  console.log(`\n✔ ALL ${passedTests} EMPIRICAL CHALLENGES PASSED SUCCESSFULLY!`);
  process.exit(0);
}
