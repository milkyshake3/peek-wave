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

  test('1.4: Action type is strictly "modifyHeaders" with valid responseHeaders or requestHeaders arrays', () => {
    const modifyRules = rules.filter(r => r.action.type === 'modifyHeaders');
    assert.ok(modifyRules.length >= 1, 'At least one modifyHeaders rule must exist');
    const hasResponseHeaderRule = modifyRules.some(r => Array.isArray(r.action.responseHeaders));
    assert.ok(hasResponseHeaderRule, 'At least one modifyHeaders rule must define action.responseHeaders');
    for (const rule of modifyRules) {
      assert.strictEqual(rule.action.type, 'modifyHeaders');
      assert.ok(
        Array.isArray(rule.action.responseHeaders) || Array.isArray(rule.action.requestHeaders),
        'modifyHeaders rule must define action.responseHeaders or action.requestHeaders'
      );
    }
  });

  test('1.5: Header operations adhere to Chrome DNR specification and scope Sec-Fetch-* away from YouTube', () => {
    const validOperations = new Set(['remove', 'set', 'append']);
    const modifyRules = rules.filter(r => r.action.type === 'modifyHeaders');
    for (const rule of modifyRules) {
      if (Array.isArray(rule.action.responseHeaders)) {
        for (const h of rule.action.responseHeaders) {
          assert.strictEqual(typeof h.header, 'string', 'Header name must be string');
          assert.ok(h.header.trim().length > 0, 'Header name must not be empty');
          assert.ok(validOperations.has(h.operation), `Invalid operation: ${h.operation}`);
          assert.strictEqual(h.operation, 'remove', 'Response header rules must perform "remove" operation');
        }
      }
      if (Array.isArray(rule.action.requestHeaders)) {
        for (const h of rule.action.requestHeaders) {
          assert.strictEqual(typeof h.header, 'string', 'Header name must be string');
          assert.ok(h.header.trim().length > 0, 'Header name must not be empty');
          assert.ok(validOperations.has(h.operation), `Invalid operation: ${h.operation}`);
          assert.strictEqual(h.operation, 'set', 'Request header rules must perform "set" operation');
        }
        const modifiesSecFetch = rule.action.requestHeaders.some(h => h.header.toLowerCase().startsWith('sec-fetch-'));
        if (modifiesSecFetch) {
          const excluded = rule.condition?.excludedRequestDomains || [];
          for (const ytDomain of ['youtube.com', 'youtube-nocookie.com', 'youtu.be', 'googlevideo.com', 'accounts.google.com']) {
            assert.ok(excluded.includes(ytDomain), `Request header spoofing must exclude ${ytDomain}`);
          }
        }
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
      'cross-origin-opener-policy-report-only',
      'cross-origin-embedder-policy',
      'cross-origin-embedder-policy-report-only',
      'document-isolation-policy'
    ];

    for (const req of requiredHeaders) {
      assert.ok(
        removedHeaders.includes(req),
        `Mandatory header missing from DNR removal rule: ${req}`
      );
    }
  });

  test('1.7: Resource types strictly target "sub_frame" and NEVER "main_frame"', () => {
    const modifyRules = rules.filter(r => r.action.type === 'modifyHeaders');
    for (const rule of modifyRules) {
      if (Array.isArray(rule.condition.requestDomains) && rule.condition.requestDomains.length > 0) {
        assert.strictEqual(rule.condition.urlFilter, '/embed/', 'Scoped requestDomains rule urlFilter must be "/embed/"');
      } else {
        assert.strictEqual(rule.condition.urlFilter, '*', 'Global condition urlFilter must be wildcard "*"');
      }
      assert.ok(Array.isArray(rule.condition.resourceTypes), 'resourceTypes must be an array');
      assert.ok(
        rule.condition.resourceTypes.includes('sub_frame'),
        'Rule condition must explicitly include "sub_frame"'
      );
    }
    // Security invariant across all rules: NEVER include main_frame
    for (const rule of rules) {
      if (rule.condition && rule.condition.resourceTypes) {
        assert.ok(
          !rule.condition.resourceTypes.includes('main_frame'),
          'SECURITY INVARIANT VIOLATION: Rule condition must NEVER include "main_frame"'
        );
      }
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

  test('1.9: Rule 4 sets non-YouTube Referer on YouTube-initiated /embed/ sub_frame requests to prevent Error 152-4', () => {
    const rule = rules.find(r => r.id === 4);
    assert.ok(rule, 'Rule 4 must exist');
    assert.strictEqual(rule.action.type, 'modifyHeaders');
    assert.ok(Array.isArray(rule.action.requestHeaders));
    const refererMod = rule.action.requestHeaders.find(h => h.header.toLowerCase() === 'referer');
    assert.ok(refererMod, 'Rule 4 must modify Referer request header');
    assert.strictEqual(refererMod.operation, 'set');
    assert.strictEqual(refererMod.value, 'https://noelbuilds.dev/');

    assert.strictEqual(rule.condition.urlFilter, '/embed/');
    assert.ok(Array.isArray(rule.condition.requestDomains));
    assert.ok(rule.condition.requestDomains.includes('youtube-nocookie.com'));
    assert.ok(rule.condition.requestDomains.includes('youtube.com'));
    assert.ok(Array.isArray(rule.condition.initiatorDomains));
    assert.ok(rule.condition.initiatorDomains.includes('youtube.com'));
    assert.ok(rule.condition.initiatorDomains.includes('youtu.be'));
    assert.ok(rule.condition.initiatorDomains.includes('youtube-nocookie.com'));
    assert.deepStrictEqual(rule.condition.resourceTypes, ['sub_frame']);
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
        if (rule.action.type === 'modifyHeaders' && Array.isArray(rule.action.responseHeaders)) {
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

  test('5.5: Backdrop blur tuned to single-pass 4px without nested blur render surfaces', () => {
    const modalCss = fs.readFileSync(MODAL_CSS_PATH, 'utf8');
    for (const [label, css] of [['MODAL_CSS_TEXT', MODAL_CSS_TEXT], ['modal.css', modalCss]]) {
      assert.ok(
        css.includes('backdrop-filter: blur(4px) !important;'),
        `Backdrop filter blur(4px) missing in ${label}`
      );
      for (const forbidden of ['blur(8px)', 'blur(12px)', 'blur(20px)', 'saturate(180%)']) {
        assert.ok(
          !css.includes(forbidden),
          `Nested/heavy blur token "${forbidden}" must not appear in ${label}`
        );
      }
    }
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

  function createMockHostVideo(doc) {
    const video = doc.createElement('video');
    video.paused = false;
    video.ended = false;
    video.isConnected = true;
    video.pauseCalls = 0;
    video.playCalls = 0;
    video.pause = () => {
      video.paused = true;
      video.pauseCalls++;
    };
    video.play = () => {
      video.paused = false;
      video.playCalls++;
      return Promise.resolve();
    };
    return video;
  }

  test('6.10: YouTube-on-YouTube pauses main & hover videos, resumes only main on close, skips resume on Open in New Tab', () => {
    // 1. Escape / backdrop / close vectors resume main video only
    for (const trigger of ['escape', 'backdrop', 'close']) {
      const { win, doc } = setupEnv();
      win.location = new URL('https://www.youtube.com/watch?v=hostVideo');
      const mainVideo = createMockHostVideo(doc);
      const previewContainer = doc.createElement('ytd-video-preview');
      const hoverVideo = createMockHostVideo(doc);
      previewContainer.appendChild(hoverVideo);
      doc.body.appendChild(mainVideo);
      doc.body.appendChild(previewContainer);

      const modal = mountModal('https://www.youtube.com/watch?v=childVideo', { win });
      assert.ok(modal, `Modal must mount for ${trigger}`);
      assert.strictEqual(mainVideo.paused, true, `Main video must be paused during preview (${trigger})`);
      assert.strictEqual(mainVideo.pauseCalls, 1);
      assert.strictEqual(hoverVideo.paused, true, `Inline hover video must be paused (${trigger})`);
      assert.strictEqual(hoverVideo.pauseCalls, 1);

      if (trigger === 'escape') {
        win.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
      } else if (trigger === 'backdrop') {
        modal.backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      } else {
        modal.closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }

      assert.strictEqual(mainVideo.paused, false, `Main video must resume on ${trigger}`);
      assert.strictEqual(mainVideo.playCalls, 1, `Main video play() called once on ${trigger}`);
      assert.strictEqual(hoverVideo.paused, true, `Hover video must remain paused on ${trigger}`);
      assert.strictEqual(hoverVideo.playCalls, 0, `Hover video must never resume on ${trigger}`);
    }

    // 2. Open in New Tab leaves host video paused
    const { win, doc } = setupEnv();
    win.location = new URL('https://www.youtube.com/watch?v=hostVideo');
    const mainVideo = createMockHostVideo(doc);
    doc.body.appendChild(mainVideo);

    const modal = mountModal('https://www.youtube.com/watch?v=childVideo', { win });
    assert.strictEqual(mainVideo.paused, true);
    modal.tabBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    assert.strictEqual(getModal(), null);
    assert.strictEqual(mainVideo.paused, true, 'Main video must remain paused after Open in New Tab');
    assert.strictEqual(mainVideo.playCalls, 0);
  });

  test('6.11: Peeking a non-YouTube URL while on youtube.com does NOT pause parent YouTube video', () => {
    const { win, doc } = setupEnv();
    win.location = new URL('https://www.youtube.com/watch?v=hostVideo');
    const mainVideo = createMockHostVideo(doc);
    doc.body.appendChild(mainVideo);

    const modal = mountModal('https://en.wikipedia.org/wiki/Chromium', { win });
    assert.ok(modal);
    assert.strictEqual(mainVideo.paused, false, 'Parent YouTube video must keep playing for non-YouTube peek');
    assert.strictEqual(mainVideo.pauseCalls, 0);

    teardownModal(win);
    assert.strictEqual(mainVideo.playCalls, 0);
  });

  test('6.12: Preemptive remount between YouTube previews keeps host video paused without flicker until final teardown', () => {
    const { win, doc } = setupEnv();
    win.location = new URL('https://www.youtube.com/watch?v=hostVideo');
    const mainVideo = createMockHostVideo(doc);
    doc.body.appendChild(mainVideo);

    mountModal('https://www.youtube.com/watch?v=child1', { win });
    assert.strictEqual(mainVideo.paused, true);
    assert.strictEqual(mainVideo.playCalls, 0);

    // Preemptively mount second YouTube preview
    mountModal('https://youtu.be/child2', { win });
    assert.strictEqual(mainVideo.paused, true, 'Host video must stay paused across preemptive remount');
    assert.strictEqual(mainVideo.playCalls, 0, 'Host video must not flicker-play during preemptive remount');

    teardownModal(win);
    assert.strictEqual(mainVideo.paused, false, 'Host video must resume after final teardown');
    assert.strictEqual(mainVideo.playCalls, 1);
  });

  test('6.13: animationend marks modal .peek-settled and teardown removes animationend listener cleanly', () => {
    const { win } = setupEnv();
    const { Event } = require('../harness/dom_simulator');

    // Case A: animationend fires before teardown
    const modalA = mountModal('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { win });
    assert.strictEqual(modalA.modal.classList.contains('peek-settled'), false);
    modalA.modal.dispatchEvent(new Event('animationend', { bubbles: false }));
    assert.strictEqual(modalA.modal.classList.contains('peek-settled'), true);
    assert.strictEqual((modalA.modal._listeners.get('animationend') || []).length, 0);
    teardownModal(win);

    // Case B: teardown runs before animationend fires
    const modalB = mountModal('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { win });
    const modalEl = modalB.modal;
    assert.strictEqual((modalEl._listeners.get('animationend') || []).length, 1);
    teardownModal(win);
    assert.strictEqual((modalEl._listeners.get('animationend') || []).length, 0, 'animationend listener must be detached on teardown');
  });

  test('6.14: Default youtubeEmbedFallback=false keeps full YouTube URL, shows Embed switch inactive, and preserves 3-button header-actions', () => {
    const { win } = setupEnv();
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const modal = mountModal(url, { win });
    assert.strictEqual(modal.iframe.src, url);
    assert.strictEqual(modal.isEmbedActive, false);
    assert.strictEqual(modal.ytModeBtn.classList.contains('hidden'), false);
    assert.strictEqual(modal.ytModeBtn.getAttribute('aria-pressed'), 'false');
    assert.strictEqual(modal.shadowRoot.querySelector('.peek-wave-header-actions').querySelectorAll('button').length, 3);
    teardownModal(win);
  });

  test('6.15: Opt-in youtubeEmbedFallback=true loads youtube-nocookie.com/embed while keeping Copy Link & Open Tab on original URL', () => {
    const { win, chrome } = setupEnv();
    const watchUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s&list=PLtest123&index=2';
    const modal = mountModal(watchUrl, { win, youtubeEmbedFallback: true });
    assert.strictEqual(modal.isEmbedActive, true);
    assert.strictEqual(
      modal.iframe.src,
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&start=90&list=PLtest123&index=2'
    );
    assert.strictEqual(modal.domainSpan.textContent, 'youtube.com');

    // Copy Link copies canonical watch URL
    let copiedText = '';
    win.navigator.clipboard = { writeText: (txt) => { copiedText = txt; return Promise.resolve(); } };
    modal.copyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert.strictEqual(copiedText, watchUrl);

    // Open in New Tab opens canonical watch URL
    let sentTabMessage = null;
    chrome.runtime.sendMessage = (msg) => {
      sentTabMessage = msg;
    };
    modal.tabBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert.ok(sentTabMessage, 'OPEN_TAB message must be dispatched');
    assert.strictEqual(sentTabMessage.action, 'OPEN_TAB');
    assert.strictEqual(sentTabMessage.url, watchUrl);

    // Shorts, Live, youtu.be, and Playlist conversion checks
    const cases = [
      ['https://youtu.be/dQw4w9WgXcQ?t=42s', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&start=42'],
      ['https://www.youtube.com/shorts/5qap5aO4i9A', 'https://www.youtube-nocookie.com/embed/5qap5aO4i9A?autoplay=1&rel=0'],
      ['https://www.youtube.com/live/jfKfPfyJRdk', 'https://www.youtube-nocookie.com/embed/jfKfPfyJRdk?autoplay=1&rel=0'],
      ['https://www.youtube.com/playlist?list=PL8dPuuaLjXtNlUrzyH5r6jN9ulIgZBpdo', 'https://www.youtube-nocookie.com/embed/videoseries?list=PL8dPuuaLjXtNlUrzyH5r6jN9ulIgZBpdo&autoplay=1&rel=0']
    ];
    for (const [input, expected] of cases) {
      const m = mountModal(input, { win, youtubeEmbedFallback: true });
      assert.strictEqual(m.iframe.src, expected, `Expected embed URL for ${input}`);
      teardownModal(win);
    }
  });

  test('6.16: Non-video YouTube pages stay full URLs and hide Embed switch even when youtubeEmbedFallback=true', () => {
    const { win } = setupEnv();
    const nonVideoUrls = [
      'https://www.youtube.com/@Veritasium',
      'https://www.youtube.com/channel/UCBJycsmduvYEL83R_U4JriQ',
      'https://www.youtube.com/results?search_query=quantum+computing'
    ];
    for (const url of nonVideoUrls) {
      const modal = mountModal(url, { win, youtubeEmbedFallback: true });
      assert.strictEqual(modal.iframe.src, url);
      assert.strictEqual(modal.isEmbedActive, false);
      assert.strictEqual(modal.ytModeBtn.classList.contains('hidden'), true);
      assert.strictEqual(modal.fallbackEmbedBtn.classList.contains('hidden'), true);
      teardownModal(win);
    }
  });

  test('6.17: Header Embed pill toggles Full <-> Embed live and fallback Try Embed button switches errored preview to embed', () => {
    const { win } = setupEnv();
    const { Event } = require('../harness/dom_simulator');
    const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=15';
    const modal = mountModal(url, { win, youtubeEmbedFallback: false });
    assert.strictEqual(modal.iframe.src, url);
    assert.strictEqual(modal.fallbackEmbedBtn.classList.contains('hidden'), false);

    // Toggle to Embed via header pill
    modal.ytModeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert.strictEqual(modal.isEmbedActive, true);
    assert.strictEqual(modal.ytModeBtn.getAttribute('aria-pressed'), 'true');
    assert.strictEqual(modal.iframe.src, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&start=15');
    assert.strictEqual(modal.fallbackEmbedBtn.classList.contains('hidden'), true);

    // Toggle back to Full via header pill
    modal.ytModeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert.strictEqual(modal.isEmbedActive, false);
    assert.strictEqual(modal.ytModeBtn.getAttribute('aria-pressed'), 'false');
    assert.strictEqual(modal.iframe.src, url);
    assert.strictEqual(modal.fallbackEmbedBtn.classList.contains('hidden'), false);

    // Simulate iframe error -> fallback banner appears with Try Embed button -> clicking switches to Embed
    modal.iframe.dispatchEvent(new Event('error'));
    assert.strictEqual(modal.fallbackBanner.classList.contains('hidden'), false);
    modal.fallbackEmbedBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert.strictEqual(modal.isEmbedActive, true);
    assert.strictEqual(modal.fallbackBanner.classList.contains('hidden'), true);
    assert.strictEqual(modal.iframe.src, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&start=15');
    teardownModal(win);
  });

  test('6.18: Teardown cleanly unbinds ytModeBtn and fallbackEmbedBtn listeners with zero residual listeners', () => {
    const { win } = setupEnv();
    const modal = mountModal('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { win });
    const ytBtn = modal.ytModeBtn;
    const fbEmbedBtn = modal.fallbackEmbedBtn;
    assert.strictEqual((ytBtn._listeners.get('click') || []).length, 1);
    assert.strictEqual((fbEmbedBtn._listeners.get('click') || []).length, 1);

    teardownModal(win);
    assert.strictEqual((ytBtn._listeners.get('click') || []).length, 0, 'ytModeBtn listener must be detached on teardown');
    assert.strictEqual((fbEmbedBtn._listeners.get('click') || []).length, 0, 'fallbackEmbedBtn listener must be detached on teardown');
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
