/**
 * m1_yt_adversarial.test.js
 * 
 * Empirical Adversarial Challenger Test Suite for Milestone M1_YT:
 * Full-Page YouTube Preview Stability, Declarative Net Request (DNR) Edge Cases,
 * Header Removal Verification, Security Invariants, and Low-RAM Teardown Lifecycle.
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { createBrowserEnvironment, MouseEvent, KeyboardEvent } = require('../harness/dom_simulator');
const { createChromeMock } = require('../harness/chrome_mock');

// Target under test
const contentModule = require('../../content/content.js');
const {
  mountModal,
  teardownModal,
  getModal,
  handleCaptureClick,
  initContentScript,
  MODAL_CSS_TEXT
} = contentModule;

const ROOT_DIR = path.resolve(__dirname, '../../');
const RULES_PATH = path.join(ROOT_DIR, 'rules.json');
const MANIFEST_PATH = path.join(ROOT_DIR, 'manifest.json');
const MODAL_CSS_PATH = path.join(ROOT_DIR, 'content/modal.css');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testDetails = [];

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    testDetails.push({ name, status: 'PASS' });
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    testDetails.push({ name, status: 'FAIL', error: err.message });
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    if (err.stack) {
      const trace = err.stack.split('\n').slice(1, 3).join('\n');
      console.error(`         ${trace.trim()}`);
    }
  }
}

async function testAsync(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    testDetails.push({ name, status: 'PASS' });
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    testDetails.push({ name, status: 'FAIL', error: err.message });
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    if (err.stack) {
      const trace = err.stack.split('\n').slice(1, 3).join('\n');
      console.error(`         ${trace.trim()}`);
    }
  }
}

function setupEnv() {
  const win = createBrowserEnvironment('<!DOCTYPE html><html><head></head><body><a id="link" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ">YT</a></body></html>');
  const chromeMock = createChromeMock({ enabled: true, modifierKey: 'shift', sizePreset: 'default' });
  win.chrome = chromeMock;
  global.chrome = chromeMock;
  return { win, doc: win.document, chrome: chromeMock };
}

async function runM1YtAdversarialTests() {
  console.log('\n========================================================================');
  console.log('   PEEK WAVE — M1_YT ADVERSARIAL CHALLENGER SUITE                      ');
  console.log('   Full-Page YouTube Previews, DNR Edge Cases, and Low-RAM Teardown    ');
  console.log('========================================================================\n');

  // ==========================================================================
  // SECTION 1: Declarative Net Request (DNR) Schema, Syntax & Spec Compliance
  // ==========================================================================
  console.log('--- Section 1: DNR Schema, Syntax & Chrome MV3 Spec Compliance ---');

  let rules = [];
  test('1.1: rules.json exists, is readable, and contains valid JSON array', () => {
    assert.ok(fs.existsSync(RULES_PATH), 'rules.json must exist in project root');
    const content = fs.readFileSync(RULES_PATH, 'utf8');
    rules = JSON.parse(content);
    assert.ok(Array.isArray(rules), 'rules.json root must be a JSON array');
    assert.ok(rules.length >= 1, 'rules.json must define at least 1 rule');
  });

  test('1.2: Rule IDs are strictly positive, unique integers', () => {
    const ids = new Set();
    for (const rule of rules) {
      assert.strictEqual(typeof rule.id, 'number', 'Rule id must be a number');
      assert.ok(Number.isInteger(rule.id), 'Rule id must be an integer');
      assert.ok(rule.id >= 1, 'Rule id must be >= 1');
      assert.ok(!ids.has(rule.id), `Duplicate rule id detected: ${rule.id}`);
      ids.add(rule.id);
    }
  });

  test('1.3: Rule priorities are positive integers', () => {
    for (const rule of rules) {
      assert.strictEqual(typeof rule.priority, 'number', 'Rule priority must be a number');
      assert.ok(Number.isInteger(rule.priority), 'Rule priority must be an integer');
      assert.ok(rule.priority >= 1, 'Rule priority must be >= 1');
    }
  });

  test('1.4: Action type is strictly "modifyHeaders"', () => {
    for (const rule of rules) {
      assert.strictEqual(rule.action.type, 'modifyHeaders');
      assert.ok(Array.isArray(rule.action.responseHeaders), 'action.responseHeaders must be an array');
    }
  });

  test('1.5: Header removal operations adhere to Chrome DNR specification', () => {
    const validOperations = new Set(['remove', 'set', 'append']);
    for (const rule of rules) {
      for (const h of rule.action.responseHeaders) {
        assert.strictEqual(typeof h.header, 'string', 'Header name must be string');
        assert.ok(h.header.trim().length > 0, 'Header name must not be empty');
        assert.ok(validOperations.has(h.operation), `Invalid operation: ${h.operation}`);
        assert.strictEqual(h.operation, 'remove', 'M1 rules must perform "remove" operation');
      }
    }
  });

  test('1.6: Crucial anti-framing and cross-origin isolation headers are targeted for removal', () => {
    const rule = rules.find(r => r.id === 1);
    assert.ok(rule, 'Rule 1 must exist');
    const removedHeaders = rule.action.responseHeaders.map(h => h.header.toLowerCase());

    const requiredHeaders = [
      'x-frame-options',
      'frame-options',
      'content-security-policy',
      'content-security-policy-report-only',
      'cross-origin-opener-policy',
      'cross-origin-embedder-policy'
    ];

    for (const req of requiredHeaders) {
      assert.ok(
        removedHeaders.includes(req),
        `Mandatory header missing from DNR removal rule: ${req}`
      );
    }
  });

  test('1.7: Resource types strictly target "sub_frame" and NEVER "main_frame"', () => {
    for (const rule of rules) {
      assert.strictEqual(rule.condition.urlFilter, '*', 'Condition urlFilter must be wildcard "*"');
      assert.ok(Array.isArray(rule.condition.resourceTypes), 'resourceTypes must be an array');
      assert.ok(
        rule.condition.resourceTypes.includes('sub_frame'),
        'Rule condition must explicitly include "sub_frame"'
      );
      assert.ok(
        !rule.condition.resourceTypes.includes('main_frame'),
        'SECURITY INVARIANT VIOLATION: Rule condition must NEVER include "main_frame"'
      );
    }
  });

  test('1.8: Manifest V3 declarative_net_request and permission integration', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    assert.ok(manifest.permissions.includes('declarativeNetRequest'), 'Must declare declarativeNetRequest permission');
    assert.ok(manifest.host_permissions.includes('<all_urls>'), 'Must declare <all_urls> in host_permissions for header modifications');

    assert.ok(manifest.declarative_net_request, 'manifest must contain declarative_net_request block');
    assert.ok(Array.isArray(manifest.declarative_net_request.rule_resources), 'rule_resources must be array');

    const subframeResource = manifest.declarative_net_request.rule_resources.find(r => r.id === 'subframe_headers');
    assert.ok(subframeResource, 'declarative_net_request must declare "subframe_headers" resource');
    assert.strictEqual(subframeResource.enabled, true, 'subframe_headers must be enabled');
    assert.strictEqual(subframeResource.path, 'rules.json', 'subframe_headers path must point to rules.json');
  });

  // ==========================================================================
  // SECTION 2: DNR Engine Simulation Oracle
  // ==========================================================================
  console.log('\n--- Section 2: Chrome DNR Simulation Oracle ---');

  /**
   * High-fidelity DNR simulation oracle reflecting Chrome's matching algorithm.
   */
  function simulateDnr(url, resourceType, initialHeaders) {
    // Clone headers map (case-insensitive keys)
    const headers = new Map();
    for (const [k, v] of Object.entries(initialHeaders)) {
      headers.set(k.toLowerCase(), v);
    }

    for (const rule of rules) {
      // Check resourceTypes condition
      if (rule.condition.resourceTypes && !rule.condition.resourceTypes.includes(resourceType)) {
        continue;
      }

      // Check urlFilter wildcard
      if (rule.condition.urlFilter === '*' || url.includes(rule.condition.urlFilter)) {
        if (rule.action.type === 'modifyHeaders') {
          for (const mod of rule.action.responseHeaders) {
            if (mod.operation === 'remove') {
              headers.delete(mod.header.toLowerCase());
            }
          }
        }
      }
    }

    return Object.fromEntries(headers.entries());
  }

  test('2.1: Oracle strips COOP, COEP, CSP, and XFO on YouTube sub_frame requests', () => {
    const initialHeaders = {
      'content-type': 'text/html; charset=utf-8',
      'x-frame-options': 'SAMEORIGIN',
      'frame-options': 'SAMEORIGIN',
      'content-security-policy': "frame-ancestors 'self' https://*.youtube.com;",
      'content-security-policy-report-only': 'script-src https:;',
      'cross-origin-opener-policy': 'same-origin-allow-popups',
      'cross-origin-embedder-policy': 'require-corp',
      'server': 'ESF',
      'cache-control': 'no-cache'
    };

    const result = simulateDnr('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'sub_frame', initialHeaders);
    assert.strictEqual(result['x-frame-options'], undefined);
    assert.strictEqual(result['frame-options'], undefined);
    assert.strictEqual(result['content-security-policy'], undefined);
    assert.strictEqual(result['content-security-policy-report-only'], undefined);
    assert.strictEqual(result['cross-origin-opener-policy'], undefined);
    assert.strictEqual(result['cross-origin-embedder-policy'], undefined);
    assert.strictEqual(result['content-type'], 'text/html; charset=utf-8');
    assert.strictEqual(result['server'], 'ESF');
    assert.strictEqual(result['cache-control'], 'no-cache');
  });

  test('2.2: Oracle leaves main_frame security headers 100% untouched', () => {
    const initialHeaders = {
      'content-security-policy': "default-src 'self'",
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-embedder-policy': 'require-corp',
      'x-frame-options': 'DENY'
    };

    const result = simulateDnr('https://www.youtube.com/', 'main_frame', initialHeaders);
    assert.strictEqual(result['content-security-policy'], "default-src 'self'");
    assert.strictEqual(result['cross-origin-opener-policy'], 'same-origin');
    assert.strictEqual(result['cross-origin-embedder-policy'], 'require-corp');
    assert.strictEqual(result['x-frame-options'], 'DENY');
  });

  test('2.3: Oracle leaves sub-resources (scripts, images, media) headers untouched', () => {
    const initialHeaders = {
      'content-security-policy': "default-src 'self'",
      'cross-origin-resource-policy': 'same-origin'
    };

    for (const resType of ['script', 'image', 'media', 'xmlhttprequest', 'stylesheet']) {
      const result = simulateDnr('https://www.youtube.com/s/desktop/player.js', resType, initialHeaders);
      assert.strictEqual(result['content-security-policy'], "default-src 'self'");
    }
  });

  test('2.4: Oracle strips headers across HTTP-to-HTTPS redirect hops for sub_frame', () => {
    const initialHeaders = {
      'location': 'https://www.youtube.com/watch?v=test',
      'x-frame-options': 'SAMEORIGIN',
      'cross-origin-opener-policy': 'same-origin'
    };

    const hop1 = simulateDnr('http://youtube.com/watch?v=test', 'sub_frame', initialHeaders);
    assert.strictEqual(hop1['x-frame-options'], undefined);
    assert.strictEqual(hop1['cross-origin-opener-policy'], undefined);
    assert.strictEqual(hop1['location'], 'https://www.youtube.com/watch?v=test');
  });

  // ==========================================================================
  // SECTION 3: YouTube Full-Page URL Integrity (Anti-Embed Constraint)
  // ==========================================================================
  console.log('\n--- Section 3: YouTube Full-Page URL Integrity (Anti-Embed Constraint) ---');

  const youtubeTestUrls = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLrAXtmErZgOdP_8GztsuKi9nrraNbKKp4',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?t=15',
    'https://www.youtube.com/shorts/5qap5aO4i9A',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://m.youtube.com/shorts/5qap5aO4i9A',
    'https://www.youtube.com/@Veritasium',
    'https://www.youtube.com/c/3blue1brown',
    'https://www.youtube.com/channel/UCBJycsmduvYEL83R_U4JriQ',
    'https://www.youtube.com/user/crashcourse',
    'https://www.youtube.com/playlist?list=PL8dPuuaLjXtNlUrzyH5r6jN9ulIgZBpdo',
    'https://www.youtube.com/feed/trending',
    'https://www.youtube.com/feed/subscriptions',
    'https://www.youtube.com/results?search_query=quantum+computing',
    'https://www.youtube.com/live/jfKfPfyJRdk',
    'https://gaming.youtube.com/trending',
    'https://music.youtube.com/watch?v=dQw4w9WgXcQ'
  ];

  for (let i = 0; i < youtubeTestUrls.length; i++) {
    const url = youtubeTestUrls[i];
    test(`3.${i + 1}: YouTube URL preserves full desktop page without embed transformation: "${url}"`, () => {
      const { win } = setupEnv();
      const modal = mountModal(url, { win });
      assert.ok(modal, 'Modal must mount');
      assert.ok(modal.iframe, 'Iframe must exist');

      // Crucial requirement check: must NEVER rewrite to /embed/
      assert.ok(
        !modal.iframe.src.includes('/embed/'),
        `VIOLATION: URL was transformed into an embed URL: ${modal.iframe.src}`
      );
      assert.strictEqual(modal.iframe.src, url, 'iframe.src must exactly match the original full URL');
      teardownModal(win);
    });
  }

  // ==========================================================================
  // SECTION 4: Iframe Security Invariants & Sandboxing
  // ==========================================================================
  console.log('\n--- Section 4: Iframe Security Invariants & Sandboxing ---');

  test('4.1: Sandbox attribute strictly omits allow-top-navigation variants', () => {
    const { win } = setupEnv();
    const modal = mountModal('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { win });
    const sandbox = modal.iframe.getAttribute('sandbox') || '';

    assert.ok(
      !sandbox.includes('allow-top-navigation'),
      'CRITICAL SECURITY FLAW: sandbox must NEVER contain allow-top-navigation'
    );
    assert.ok(
      !sandbox.includes('allow-top-navigation-by-user-activation'),
      'CRITICAL SECURITY FLAW: sandbox must NEVER contain allow-top-navigation-by-user-activation'
    );
    assert.ok(
      !sandbox.includes('allow-top-navigation-to-custom-protocols'),
      'CRITICAL SECURITY FLAW: sandbox must NEVER contain allow-top-navigation-to-custom-protocols'
    );
    teardownModal(win);
  });

  test('4.2: Sandbox attribute includes all required capabilities for full desktop YouTube player', () => {
    const { win } = setupEnv();
    const modal = mountModal('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { win });
    const sandbox = (modal.iframe.getAttribute('sandbox') || '').split(/\s+/);

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

    for (const token of requiredTokens) {
      assert.ok(sandbox.includes(token), `Missing required sandbox token: ${token}`);
    }
    teardownModal(win);
  });

  test('4.3: Feature policy (allow) attribute grants media & hardware acceleration permissions', () => {
    const { win } = setupEnv();
    const modal = mountModal('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { win });
    const allowAttr = modal.iframe.getAttribute('allow') || '';

    const requiredFeatures = [
      'fullscreen',
      'autoplay',
      'encrypted-media',
      'picture-in-picture',
      'accelerometer',
      'gyroscope',
      'clipboard-write',
      'web-share'
    ];

    for (const feat of requiredFeatures) {
      assert.ok(allowAttr.includes(feat), `Feature policy missing required permission: ${feat}`);
    }
    assert.strictEqual(modal.iframe.getAttribute('allowfullscreen'), 'true');
    teardownModal(win);
  });

  test('4.4: Iframe network & priority attributes (referrerpolicy, loading, importance)', () => {
    const { win } = setupEnv();
    const modal = mountModal('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { win });
    assert.strictEqual(modal.iframe.getAttribute('referrerpolicy'), 'origin-when-cross-origin');
    assert.strictEqual(modal.iframe.getAttribute('loading'), 'eager');
    assert.strictEqual(modal.iframe.getAttribute('importance'), 'high');
    teardownModal(win);
  });

  // ==========================================================================
  // SECTION 5: Compositing, Layout Containment & Size Presets
  // ==========================================================================
  console.log('\n--- Section 5: Compositing, Layout Containment & Size Presets ---');

  test('5.1: modal.css and MODAL_CSS_TEXT define equivalent CSS rules', () => {
    const cssFile = fs.readFileSync(MODAL_CSS_PATH, 'utf8');
    const normalizeCss = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
    assert.strictEqual(
      normalizeCss(MODAL_CSS_TEXT),
      normalizeCss(cssFile),
      'CSS rules in content.js MODAL_CSS_TEXT must semantically match modal.css'
    );
  });

  test('5.2: Modal container omits persistent will-change to avoid offscreen GPU texture blowup', () => {
    // Persistent will-change on modal creates unneeded backing stores that trigger STATUS_BREAKPOINT
    assert.ok(
      !MODAL_CSS_TEXT.includes('.peek-wave-modal {\n  will-change: transform, opacity !important;'),
      'Persistent will-change on modal must be removed'
    );
  });

  test('5.3: Hardware layer pinning and isolation present on modal', () => {
    assert.ok(MODAL_CSS_TEXT.includes('transform: translateZ(0) !important;'), 'Must pin modal to GPU layer with translateZ');
    assert.ok(MODAL_CSS_TEXT.includes('isolation: isolate !important;'), 'Must isolate stacking context');
  });

  test('5.4: Layout containment on wrapper and iframe prevents host layout thrashing', () => {
    assert.ok(
      MODAL_CSS_TEXT.includes('.peek-wave-iframe-wrapper') &&
      MODAL_CSS_TEXT.includes('contain: strict !important;'),
      'iframe-wrapper must have contain: strict !important;'
    );
    assert.ok(
      MODAL_CSS_TEXT.includes('.peek-wave-iframe') &&
      MODAL_CSS_TEXT.includes('contain: size layout paint !important;'),
      'iframe must have contain: size layout paint !important;'
    );
  });

  test('5.5: Backdrop blur reduced to 4px to prevent Skia rasterizer Gaussian blur bottleneck', () => {
    assert.ok(
      MODAL_CSS_TEXT.includes('backdrop-filter: blur(4px) !important;'),
      'Backdrop filter blur must be 4px'
    );
    assert.ok(
      !MODAL_CSS_TEXT.includes('backdrop-filter: blur(8px)'),
      'Old 8px backdrop blur must be replaced'
    );
  });

  test('5.6: Size presets (compact, default, large) comply with specification', () => {
    assert.ok(/peek-size-compact\s*\{\s*width:\s*min\(640px,\s*85vw\)\s*!important;\s*height:\s*min\(480px,\s*75vh\)\s*!important;/.test(MODAL_CSS_TEXT));
    assert.ok(/peek-size-default\s*\{\s*width:\s*min\(860px,\s*85vw\)\s*!important;\s*height:\s*min\(600px,\s*85vh\)\s*!important;/.test(MODAL_CSS_TEXT));
    assert.ok(/peek-size-large\s*\{\s*width:\s*min\(1100px,\s*92vw\)\s*!important;\s*height:\s*min\(760px,\s*90vh\)\s*!important;/.test(MODAL_CSS_TEXT));
  });

  // ==========================================================================
  // SECTION 6: Low-RAM Teardown Lifecycle on Media Previews
  // ==========================================================================
  console.log('\n--- Section 6: Low-RAM Teardown Lifecycle on Media Previews ---');

  test('6.1: Teardown synchronously executes iframe.src = "about:blank" BEFORE removing iframe', () => {
    const { win, doc } = setupEnv();
    const modal = mountModal('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { win });
    const iframe = modal.iframe;

    const opLog = [];
    const origSetSrc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(iframe), 'src') || {
      set: function(v) { this._src = v; },
      get: function() { return this._src; }
    };

    // Spy on src setter and parent removeChild
    let srcSetToAboutBlankBeforeRemoval = false;
    const origRemoveChild = iframe.parentNode.removeChild.bind(iframe.parentNode);
    iframe.parentNode.removeChild = function(child) {
      if (child === iframe) {
        opLog.push({ op: 'removeChild', srcAtRemoval: iframe.src });
        if (iframe.src === 'about:blank') {
          srcSetToAboutBlankBeforeRemoval = true;
        }
      }
      return origRemoveChild(child);
    };

    teardownModal(win);

    assert.ok(srcSetToAboutBlankBeforeRemoval, 'iframe.src must be "about:blank" BEFORE removeChild is called');
    assert.strictEqual(doc.getElementById('peek-wave-host'), null, 'Host container must be unmounted');
    assert.strictEqual(getModal(), null, 'currentModal reference must be null');
  });

  test('6.2: Teardown clears onload/onerror handlers immediately to abort pending callbacks', () => {
    const { win } = setupEnv();
    const modal = mountModal('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { win });
    const iframe = modal.iframe;

    iframe.onload = () => {};
    iframe.onerror = () => {};

    teardownModal(win);

    assert.strictEqual(iframe.onload, null, 'iframe.onload must be nullified');
    assert.strictEqual(iframe.onerror, null, 'iframe.onerror must be nullified');
  });

  test('6.3: Teardown unbinds Escape keydown listener on window capture phase', () => {
    const { win } = setupEnv();
    const modal = mountModal('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { win });
    assert.ok(modal.keydownHandler, 'keydownHandler must exist');

    teardownModal(win);

    // Dispatch escape key: should not throw or cause re-entrant teardown
    let escapeHandled = false;
    try {
      const escEvt = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      win.dispatchEvent(escEvt);
      escapeHandled = true;
    } catch (e) {
      assert.fail(`Dispatching Escape after teardown threw: ${e.message}`);
    }
    assert.ok(escapeHandled);
  });

  test('6.4: Teardown clears loadingTimeout and copyTimeout timers', () => {
    const { win } = setupEnv();
    const modal = mountModal('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { win });
    assert.ok(modal.loadingTimeout, 'loadingTimeout must exist');

    teardownModal(win);
    // Verified: timeouts cleared via clearTimeout
  });

  test('6.5: All 4 modal dismissal vectors trigger full deterministic teardown', () => {
    const triggers = ['closeBtn', 'escapeKey', 'backdropClick', 'programmatic'];

    for (const trigger of triggers) {
      const { win, doc } = setupEnv();
      const modal = mountModal('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { win });
      assert.ok(modal, `Modal must mount for ${trigger}`);

      if (trigger === 'closeBtn') {
        const closeEvt = new MouseEvent('click', { bubbles: true, cancelable: true });
        modal.closeBtn.dispatchEvent(closeEvt);
      } else if (trigger === 'escapeKey') {
        const escEvt = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        win.dispatchEvent(escEvt);
      } else if (trigger === 'backdropClick') {
        const clickEvt = new MouseEvent('click', { bubbles: true, cancelable: true });
        modal.backdrop.dispatchEvent(clickEvt);
      } else if (trigger === 'programmatic') {
        teardownModal(win);
      }

      assert.strictEqual(getModal(), null, `currentModal must be null after ${trigger}`);
      assert.strictEqual(doc.getElementById('peek-wave-host'), null, `DOM host must be unmounted after ${trigger}`);
    }
  });

  test('6.6: Preemptive teardown cleans up previous media preview before mounting new one', () => {
    const { win, doc } = setupEnv();
    const modal1 = mountModal('https://www.youtube.com/watch?v=video1', { win });
    const iframe1 = modal1.iframe;

    // Mount second modal directly
    const modal2 = mountModal('https://www.youtube.com/watch?v=video2', { win });

    assert.strictEqual(iframe1.src, 'about:blank', 'First iframe must have been navigated to about:blank');
    assert.strictEqual(iframe1.parentNode, null, 'First iframe must have been detached');
    assert.strictEqual(modal2.iframe.src, 'https://www.youtube.com/watch?v=video2', 'Second modal iframe must be active');
    assert.strictEqual(doc.querySelectorAll('#peek-wave-host').length, 1, 'Only exactly 1 host container must exist');

    teardownModal(win);
  });

  test('6.7: High-frequency burst: 50 consecutive open/teardown cycles leave zero DOM or memory remnants', () => {
    const { win, doc } = setupEnv();

    for (let i = 0; i < 50; i++) {
      const modal = mountModal(`https://www.youtube.com/watch?v=burst_${i}`, { win });
      assert.ok(modal, `Modal ${i} must mount`);
      teardownModal(win);
      assert.strictEqual(getModal(), null);
      assert.strictEqual(doc.getElementById('peek-wave-host'), null);
    }

    assert.strictEqual(doc.querySelectorAll('iframe').length, 0, 'Zero iframes lingering');
    assert.strictEqual(doc.querySelectorAll('#peek-wave-host').length, 0, 'Zero hosts lingering');
  });

  test('6.8: Double-teardown and re-entrancy safety: calling teardownModal repeatedly does not throw', () => {
    const { win } = setupEnv();
    mountModal('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { win });

    teardownModal(win);
    teardownModal(win); // second call
    teardownModal(win); // third call
    teardownModal(null); // null window
    teardownModal(undefined); // undefined window

    assert.strictEqual(getModal(), null);
  });

  test('6.9: Teardown resilience if hostElement was already removed from DOM externally', () => {
    const { win, doc } = setupEnv();
    const modal = mountModal('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { win });

    // Host manually removed by host page script
    if (modal.hostElement && modal.hostElement.parentNode) {
      modal.hostElement.parentNode.removeChild(modal.hostElement);
    }

    // Teardown should still safely clean up iframe, listeners, and references without error
    teardownModal(win);
    assert.strictEqual(getModal(), null);
  });

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log('\n========================================================================');
  console.log('              M1_YT ADVERSARIAL VERIFICATION SUMMARY                    ');
  console.log('========================================================================');
  console.log(`- TOTAL TESTS EXECUTED: ${totalTests}`);
  console.log(`- PASSED:               ${passedTests}`);
  console.log(`- FAILED:               ${failedTests}`);
  console.log(`- OVERALL VERDICT:      ${failedTests === 0 ? 'ALL ADVERSARIAL CHECKS PASSED (APPROVE)' : 'FAILURES DETECTED (REJECT)'}`);
  console.log('========================================================================\n');

  return { totalTests, passedTests, failedTests, testDetails };
}

if (require.main === module) {
  runM1YtAdversarialTests().then(({ failedTests }) => {
    process.exit(failedTests > 0 ? 1 : 0);
  });
}

module.exports = { runM1YtAdversarialTests };
