/**
 * twitter_unforwarding_adversarial.test.js
 * 
 * Comprehensive Adversarial & Empirical Test Suite for Twitter/X Link Unforwarding,
 * Raw URL Extraction, Tracking Parameter Stripping, and Asynchronous Fallback Resolution.
 * 
 * Verifies:
 * 1. DOM Fast-Path Unwrapping (title, data-expanded-url, data-full-url, data-url, aria-label, textContent, card wrapper).
 * 2. Universal and Twitter-specific tracking parameter stripping with critical YouTube invariant preservation.
 * 3. Background service worker redirect following, HTML meta-refresh, and location.replace resolution with protocol security.
 * 4. Zero-leak teardown lifecycle and race-condition immunity during asynchronous resolution.
 */

'use strict';

const assert = require('assert');
const path = require('path');

// Production modules under test
const content = require(path.resolve(__dirname, '../../content/content.js'));
const {
  mountModal,
  teardownModal,
  getModal,
  handleCaptureClick,
  initContentScript,
  extractAnchorUrl,
  unwrapForwarderAnchor,
  stripTrackingParameters,
  isValidHttpUrl,
  isNavigableHttp,
  parseUrlDetails
} = content;

const background = require(path.resolve(__dirname, '../../background.js'));
const {
  resolveRedirectUrl,
  validateAndSanitizeUrl
} = background;

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
  bright: '\x1b[1m'
};

const results = { passed: 0, failed: 0, details: [] };

function pass(name) {
  results.passed++;
  results.details.push({ name, status: 'PASS' });
  console.log(`  ${colors.green}[PASS]${colors.reset} ${name}`);
}

function fail(name, err) {
  results.failed++;
  results.details.push({ name, status: 'FAIL', error: err?.message || String(err) });
  console.error(`  ${colors.red}[FAIL]${colors.reset} ${name}`);
  console.error(`         ${colors.red}Error: ${err?.message || err}${colors.reset}`);
}

function setupEnv(html = '<!DOCTYPE html><html><head></head><body><div id="root"></div></body></html>') {
  const win = createBrowserEnvironment(html);
  const chromeMock = createChromeMock({ enabled: true, modifierKey: 'shift', sizePreset: 'default' });
  win.chrome = chromeMock;
  global.chrome = chromeMock;
  return { win, doc: win.document, chrome: chromeMock };
}

async function runTwitterUnforwardingAdversarialTests() {
  console.log(`\n${colors.bright}${colors.yellow}========================================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.yellow}   PEEK WAVE — TWITTER/X UNFORWARDING & TRACKING STRIP TEST SUITE       ${colors.reset}`);
  console.log(`${colors.bright}${colors.yellow}========================================================================${colors.reset}\n`);

  // ==========================================================================
  // SECTION 1: DOM FAST-PATH UNWRAPPING (content/content.js)
  // ==========================================================================
  console.log(`${colors.bright}${colors.cyan}--- Section 1: DOM Fast-Path Unwrapping ---${colors.reset}`);

  // Test 1.1: Anchor with title attribute on t.co link (Standard Modern X format)
  try {
    const { win, doc } = setupEnv();
    const anchor = doc.createElement('a');
    anchor.href = 'https://t.co/abc123xyz';
    anchor.setAttribute('title', 'https://www.theverge.com/2026/11/ai-news');
    anchor.textContent = 'theverge.com/2026/11/ai…';
    doc.body.appendChild(anchor);

    const unwrapped = unwrapForwarderAnchor(anchor, anchor.href);
    assert.strictEqual(unwrapped, 'https://www.theverge.com/2026/11/ai-news');

    const details = extractAnchorUrl(anchor, doc.baseURI);
    assert.ok(details, 'extractAnchorUrl must return details');
    assert.strictEqual(details.rawHref, 'https://t.co/abc123xyz');
    assert.strictEqual(details.fullUrl, 'https://www.theverge.com/2026/11/ai-news');
    assert.strictEqual(details.displayDomain, 'theverge.com');
    pass('1.1: Anchor with title attribute on t.co link unwraps to full raw destination URL');
  } catch (err) {
    fail('1.1: Anchor with title attribute on t.co link', err);
  }

  // Test 1.2: Anchor with data-expanded-url attribute
  try {
    const { win, doc } = setupEnv();
    const anchor = doc.createElement('a');
    anchor.href = 'https://t.co/legacy123';
    anchor.setAttribute('data-expanded-url', 'https://github.com/torvalds/linux');
    doc.body.appendChild(anchor);

    const unwrapped = unwrapForwarderAnchor(anchor, anchor.href);
    assert.strictEqual(unwrapped, 'https://github.com/torvalds/linux');

    const details = extractAnchorUrl(anchor, doc.baseURI);
    assert.strictEqual(details.fullUrl, 'https://github.com/torvalds/linux');
    pass('1.2: Anchor with data-expanded-url attribute unwraps correctly');
  } catch (err) {
    fail('1.2: Anchor with data-expanded-url attribute', err);
  }

  // Test 1.3: Anchor with data-full-url attribute
  try {
    const { win, doc } = setupEnv();
    const anchor = doc.createElement('a');
    anchor.href = 'https://t.co/fullUrl123';
    anchor.setAttribute('data-full-url', 'https://developer.mozilla.org/en-US/docs/Web/API');
    doc.body.appendChild(anchor);

    const unwrapped = unwrapForwarderAnchor(anchor, anchor.href);
    assert.strictEqual(unwrapped, 'https://developer.mozilla.org/en-US/docs/Web/API');
    pass('1.3: Anchor with data-full-url attribute unwraps correctly');
  } catch (err) {
    fail('1.3: Anchor with data-full-url attribute', err);
  }

  // Test 1.4: Anchor with data-url attribute
  try {
    const { win, doc } = setupEnv();
    const anchor = doc.createElement('a');
    anchor.href = 'https://t.co/dataUrl123';
    anchor.setAttribute('data-url', 'https://news.ycombinator.com/item?id=12345');
    doc.body.appendChild(anchor);

    const unwrapped = unwrapForwarderAnchor(anchor, anchor.href);
    assert.strictEqual(unwrapped, 'https://news.ycombinator.com/item?id=12345');
    pass('1.4: Anchor with data-url attribute unwraps correctly');
  } catch (err) {
    fail('1.4: Anchor with data-url attribute', err);
  }

  // Test 1.5: Anchor with aria-label containing absolute URL
  try {
    const { win, doc } = setupEnv();
    const anchor = doc.createElement('a');
    anchor.href = 'https://t.co/ariaUrl123';
    anchor.setAttribute('aria-label', 'https://crates.io/crates/tokio');
    doc.body.appendChild(anchor);

    const unwrapped = unwrapForwarderAnchor(anchor, anchor.href);
    assert.strictEqual(unwrapped, 'https://crates.io/crates/tokio');
    pass('1.5: Anchor with aria-label absolute URL unwraps correctly');
  } catch (err) {
    fail('1.5: Anchor with aria-label absolute URL', err);
  }

  // Test 1.6: Clean non-truncated textContent without protocol
  try {
    const { win, doc } = setupEnv();
    const anchor = doc.createElement('a');
    anchor.href = 'https://t.co/cleanText123';
    anchor.textContent = 'arstechnica.com/gadgets/2026/review';
    doc.body.appendChild(anchor);

    const unwrapped = unwrapForwarderAnchor(anchor, anchor.href);
    assert.strictEqual(unwrapped, 'https://arstechnica.com/gadgets/2026/review');
    pass('1.6: Clean non-truncated textContent prepends https:// and unwraps');
  } catch (err) {
    fail('1.6: Clean non-truncated textContent', err);
  }

  // Test 1.7: Truncated textContent with ellipsis (… or ...) must NOT unwrap to incomplete URL
  try {
    const { win, doc } = setupEnv();
    const anchor1 = doc.createElement('a');
    anchor1.href = 'https://t.co/truncated1';
    anchor1.textContent = 'arstechnica.com/gadgets/2026/rev…';
    doc.body.appendChild(anchor1);

    const unwrapped1 = unwrapForwarderAnchor(anchor1, anchor1.href);
    assert.strictEqual(unwrapped1, null, 'Truncated ellipsis text must be rejected');

    const anchor2 = doc.createElement('a');
    anchor2.href = 'https://t.co/truncated2';
    anchor2.textContent = 'arstechnica.com/gadgets/2026/rev...';
    doc.body.appendChild(anchor2);

    const unwrapped2 = unwrapForwarderAnchor(anchor2, anchor2.href);
    assert.strictEqual(unwrapped2, null, 'Three-dot ellipsis text must be rejected');
    pass('1.7: Truncated textContent ending in ellipsis is rejected from unwrap');
  } catch (err) {
    fail('1.7: Truncated textContent with ellipsis', err);
  }

  // Test 1.8: Anchor with internal handle, hashtag, or t.co text must NOT unwrap
  try {
    const { win, doc } = setupEnv();
    const anchor = doc.createElement('a');
    anchor.href = 'https://t.co/selfText';
    anchor.textContent = 't.co/selfText';
    doc.body.appendChild(anchor);

    const unwrapped = unwrapForwarderAnchor(anchor, anchor.href);
    assert.strictEqual(unwrapped, null, 't.co self-text should not be considered destination');
    pass('1.8: Anchor with t.co self text does not unwrap');
  } catch (err) {
    fail('1.8: Anchor with t.co self text', err);
  }

  // Test 1.9: Link Card unwrap: Anchor inside [data-testid="card.wrapper"]
  try {
    const { win, doc } = setupEnv();
    const cardWrapper = doc.createElement('div');
    cardWrapper.setAttribute('data-testid', 'card.wrapper');
    cardWrapper.setAttribute('data-expanded-url', 'https://nature.com/articles/s41586-026');

    const cardAnchor = doc.createElement('a');
    cardAnchor.href = 'https://t.co/cardLink123';
    const cardTitle = doc.createElement('span');
    cardTitle.textContent = 'Scientific Breakthrough in Quantum';
    cardAnchor.appendChild(cardTitle);
    cardWrapper.appendChild(cardAnchor);
    doc.body.appendChild(cardWrapper);

    const details = extractAnchorUrl(cardTitle, doc.baseURI);
    assert.ok(details);
    assert.strictEqual(details.fullUrl, 'https://nature.com/articles/s41586-026');
    assert.strictEqual(details.displayDomain, 'nature.com');
    pass('1.9: Anchor inside tweet card.wrapper unwraps from card wrapper data attribute');
  } catch (err) {
    fail('1.9: Anchor inside tweet card.wrapper', err);
  }

  // Test 1.10: Deeply nested elements inside tweet link unwrap correctly
  try {
    const { win, doc } = setupEnv();
    const anchor = doc.createElement('a');
    anchor.href = 'https://t.co/deepNested';
    anchor.setAttribute('title', 'https://en.wikipedia.org/wiki/Speed_of_light');

    const span1 = doc.createElement('span');
    const b = doc.createElement('b');
    const code = doc.createElement('code');
    code.textContent = 'c = 299792458 m/s';
    b.appendChild(code);
    span1.appendChild(b);
    anchor.appendChild(span1);
    doc.body.appendChild(anchor);

    const details = extractAnchorUrl(code, doc.baseURI);
    assert.ok(details);
    assert.strictEqual(details.fullUrl, 'https://en.wikipedia.org/wiki/Speed_of_light');
    pass('1.10: Deeply nested click inside tweet link unwraps to target URL');
  } catch (err) {
    fail('1.10: Deeply nested click inside tweet link', err);
  }

  // Test 1.11: Dangerous schemes in unwrap attributes rejected
  try {
    const { win, doc } = setupEnv();
    const dangerousSchemes = [
      'javascript:alert(document.domain)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'chrome://settings'
    ];

    for (const scheme of dangerousSchemes) {
      const anchor = doc.createElement('a');
      anchor.href = 'https://t.co/danger';
      anchor.setAttribute('title', scheme);
      doc.body.appendChild(anchor);

      const unwrapped = unwrapForwarderAnchor(anchor, anchor.href);
      assert.strictEqual(unwrapped, null, `Scheme ${scheme} must be rejected by unwrapForwarderAnchor`);
    }
    pass('1.11: Dangerous non-HTTP schemes in unwrap attributes strictly rejected');
  } catch (err) {
    fail('1.11: Dangerous non-HTTP schemes in unwrap attributes', err);
  }

  // Test 1.12: Dual attributes priority check (data-expanded-url > title > aria-label > textContent)
  try {
    const { win, doc } = setupEnv();
    const anchor = doc.createElement('a');
    anchor.href = 'https://t.co/prio';
    anchor.setAttribute('data-expanded-url', 'https://priority-one.com/doc');
    anchor.setAttribute('title', 'https://priority-two.com/doc');
    anchor.setAttribute('aria-label', 'https://priority-three.com/doc');
    anchor.textContent = 'priority-four.com/doc';
    doc.body.appendChild(anchor);

    const unwrapped = unwrapForwarderAnchor(anchor, anchor.href);
    assert.strictEqual(unwrapped, 'https://priority-one.com/doc', 'data-expanded-url takes highest priority');
    pass('1.12: Attribute precedence order strictly enforced');
  } catch (err) {
    fail('1.12: Attribute precedence order', err);
  }

  // ==========================================================================
  // SECTION 2: TRACKING PARAMETER STRIPPING (stripTrackingParameters)
  // ==========================================================================
  console.log(`\n${colors.bright}${colors.cyan}--- Section 2: Tracking Parameter Stripping ---${colors.reset}`);

  // Test 2.1: Universal UTM parameters stripped
  try {
    const url = 'https://example.com/article?utm_source=twitter&utm_medium=social&utm_campaign=launch_2026&utm_term=ai&utm_content=hero_banner';
    const cleaned = stripTrackingParameters(url);
    assert.strictEqual(cleaned, 'https://example.com/article');
    pass('2.1: Universal utm_source, utm_medium, utm_campaign, utm_term, utm_content stripped');
  } catch (err) {
    fail('2.1: Universal UTM parameters', err);
  }

  // Test 2.2: Ad click IDs stripped (fbclid, gclid, twclid, msclkid, dclid)
  try {
    const url = 'https://shop.example.com/item?id=456&fbclid=IwAR123&gclid=Cj0KCQ&twclid=12345&msclkid=abcde&dclid=xyz';
    const cleaned = stripTrackingParameters(url);
    assert.strictEqual(cleaned, 'https://shop.example.com/item?id=456');
    pass('2.2: Ad and platform click identifiers (fbclid, gclid, twclid, msclkid, dclid) stripped');
  } catch (err) {
    fail('2.2: Ad click IDs', err);
  }

  // Test 2.3: Email and marketing campaign tracking IDs stripped
  try {
    const url = 'https://newsletter.example.com/post?id=99&mc_eid=abc1234&mc_cid=def5678&_hsenc=p2ANq&_hsmi=123456&igshid=abcd123';
    const cleaned = stripTrackingParameters(url);
    assert.strictEqual(cleaned, 'https://newsletter.example.com/post?id=99');
    pass('2.3: Newsletter & marketing tags (mc_eid, mc_cid, _hsenc, _hsmi, igshid) stripped');
  } catch (err) {
    fail('2.3: Email and marketing tracking IDs', err);
  }

  // Test 2.4: Twitter attribution tags (ref_src, ref_url, twsrc) stripped
  try {
    const url = 'https://blog.example.com/post?ref_src=twsrc%5Etfw&ref_url=https%3A%2F%2Fplatform.twitter.com&twsrc=tfw';
    const cleaned = stripTrackingParameters(url);
    assert.strictEqual(cleaned, 'https://blog.example.com/post');
    pass('2.4: Twitter attribution tags (ref_src, ref_url, twsrc) stripped');
  } catch (err) {
    fail('2.4: Twitter attribution tags', err);
  }

  // Test 2.5: Twitter share parameters (s, t) stripped on x.com and twitter.com
  try {
    const xUrl = 'https://x.com/username/status/1234567890?s=20&t=abcdef12345';
    assert.strictEqual(stripTrackingParameters(xUrl), 'https://x.com/username/status/1234567890');

    const twUrl = 'https://twitter.com/username/status/1234567890?s=19&t=xyz987';
    assert.strictEqual(stripTrackingParameters(twUrl), 'https://twitter.com/username/status/1234567890');
    pass('2.5: Twitter share parameters (s, t) stripped on x.com and twitter.com');
  } catch (err) {
    fail('2.5: Twitter share parameters', err);
  }

  // Test 2.6: CRITICAL INVARIANT: YouTube timestamps and playlist params NEVER stripped
  try {
    // Desktop watch URL with timestamp
    const yt1 = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&utm_source=twitter';
    const cleaned1 = stripTrackingParameters(yt1);
    assert.strictEqual(cleaned1, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s', 'Must strictly preserve t=42s on youtube.com');

    // Shortened youtu.be with timestamp
    const yt2 = 'https://youtu.be/dQw4w9WgXcQ?t=15&utm_source=twitter';
    const cleaned2 = stripTrackingParameters(yt2);
    assert.strictEqual(cleaned2, 'https://youtu.be/dQw4w9WgXcQ?t=15', 'Must strictly preserve t=15 on youtu.be');

    // Playlist with list and index
    const yt3 = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLtest&index=3&utm_medium=social';
    const cleaned3 = stripTrackingParameters(yt3);
    assert.strictEqual(cleaned3, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLtest&index=3', 'Must strictly preserve list and index on youtube.com');
    pass('2.6: CRITICAL INVARIANT: YouTube video parameters (t, v, list, index) 100% preserved');
  } catch (err) {
    fail('2.6: YouTube timestamp preservation invariant', err);
  }

  // Test 2.7: Functional query parameters preserved
  try {
    const url = 'https://example.com/search?q=quantum+computing&page=3&sort=desc&filter=open_access&utm_source=feed';
    const cleaned = stripTrackingParameters(url);
    assert.strictEqual(cleaned, 'https://example.com/search?q=quantum+computing&page=3&sort=desc&filter=open_access');
    pass('2.7: Functional query parameters (q, page, sort, filter) preserved');
  } catch (err) {
    fail('2.7: Functional query parameters', err);
  }

  // Test 2.8: URL hash fragment preserved while stripping tracking parameters
  try {
    const url = 'https://developer.mozilla.org/en-US/docs/Web/API/Window?utm_source=twitter#methods';
    const cleaned = stripTrackingParameters(url);
    assert.strictEqual(cleaned, 'https://developer.mozilla.org/en-US/docs/Web/API/Window#methods');
    pass('2.8: URL hash fragments preserved during parameter stripping');
  } catch (err) {
    fail('2.8: URL hash fragment preservation', err);
  }

  // Test 2.9: Malformed or non-string inputs safely handled
  try {
    assert.strictEqual(stripTrackingParameters(null), null);
    assert.strictEqual(stripTrackingParameters(undefined), undefined);
    assert.strictEqual(stripTrackingParameters(''), '');
    assert.strictEqual(stripTrackingParameters('not a valid url'), 'not a valid url');
    pass('2.9: Non-string and malformed inputs handled gracefully without throwing');
  } catch (err) {
    fail('2.9: Malformed inputs handling', err);
  }

  // ==========================================================================
  // SECTION 3: BACKGROUND SERVICE WORKER RESOLUTION (background.js)
  // ==========================================================================
  console.log(`\n${colors.bright}${colors.cyan}--- Section 3: Background Service Worker Resolution ---${colors.reset}`);

  // Test 3.1: Non-t.co URLs bypass network fetch directly
  try {
    const url = 'https://example.com/direct-page?utm_source=test';
    const resolved = await resolveRedirectUrl(url);
    assert.strictEqual(resolved, 'https://example.com/direct-page');
    pass('3.1: Non-t.co URL passes through without fetch and strips trackers');
  } catch (err) {
    fail('3.1: Non-t.co URL bypass', err);
  }

  // Test 3.2: HTTP 301/302 Redirect Following simulation
  try {
    const origFetch = global.fetch;
    global.fetch = async (input, init) => {
      return {
        url: 'https://actual-destination.com/article/12345?utm_source=tco',
        status: 200,
        text: async () => '<html><body>OK</body></html>'
      };
    };

    const resolved = await resolveRedirectUrl('https://t.co/redirectTest');
    assert.strictEqual(resolved, 'https://actual-destination.com/article/12345');
    global.fetch = origFetch;
    pass('3.2: HTTP 301/302 redirect following resolves destination and strips trackers');
  } catch (err) {
    fail('3.2: HTTP 301/302 redirect following', err);
  }

  // Test 3.3: HTML meta-refresh parsing
  try {
    const origFetch = global.fetch;
    global.fetch = async (input, init) => {
      return {
        url: 'https://t.co/metaRefreshTest',
        status: 200,
        text: async () => '<noscript><meta http-equiv="refresh" content="0;URL=https://meta-destination.com/post?utm_campaign=spring"></noscript>'
      };
    };

    const resolved = await resolveRedirectUrl('https://t.co/metaRefreshTest');
    assert.strictEqual(resolved, 'https://meta-destination.com/post');
    global.fetch = origFetch;
    pass('3.3: HTML meta-refresh destination extracted and sanitized');
  } catch (err) {
    fail('3.3: HTML meta-refresh parsing', err);
  }

  // Test 3.4: HTML location.replace parsing with escaped slashes
  try {
    const origFetch = global.fetch;
    global.fetch = async (input, init) => {
      return {
        url: 'https://t.co/locationReplaceTest',
        status: 200,
        text: async () => '<script>window.opener = null; location.replace("https:\\/\\/js-destination.com\\/deep\\/path?ref_src=twsrc")</script>'
      };
    };

    const resolved = await resolveRedirectUrl('https://t.co/locationReplaceTest');
    assert.strictEqual(resolved, 'https://js-destination.com/deep/path');
    global.fetch = origFetch;
    pass('3.4: HTML location.replace with escaped slashes unescaped and resolved');
  } catch (err) {
    fail('3.4: HTML location.replace parsing', err);
  }

  // Test 3.5: Security: Dangerous redirect schemes rejected
  try {
    const origFetch = global.fetch;
    global.fetch = async (input, init) => {
      return {
        url: 'https://t.co/exploit',
        status: 200,
        text: async () => '<meta http-equiv="refresh" content="0;URL=javascript:alert(1)">'
      };
    };

    const resolved = await resolveRedirectUrl('https://t.co/exploit');
    assert.strictEqual(resolved, 'https://t.co/exploit', 'Dangerous scheme in meta-refresh safely falls back to sanitized original URL');
    assert.ok(!resolved.startsWith('javascript:'), 'Never returns javascript:');
    global.fetch = origFetch;
    pass('3.5: Security: Malicious non-HTTP destination schemes safely blocked from resolution');
  } catch (err) {
    fail('3.5: Security dangerous redirect schemes', err);
  }

  // Test 3.6: Fetch network error / offline fallback
  try {
    const origFetch = global.fetch;
    global.fetch = async () => {
      throw new Error('Failed to fetch (offline)');
    };

    const resolved = await resolveRedirectUrl('https://t.co/offlineFallback');
    assert.strictEqual(resolved, 'https://t.co/offlineFallback');
    global.fetch = origFetch;
    pass('3.6: Network error/offline falls back to original sanitized URL gracefully');
  } catch (err) {
    fail('3.6: Fetch offline fallback', err);
  }

  // ==========================================================================
  // SECTION 4: ZERO-LEAK TEARDOWN & ASYNC RACE PROTECTION (content/content.js)
  // ==========================================================================
  console.log(`\n${colors.bright}${colors.cyan}--- Section 4: Zero-Leak Teardown & Async Race Protection ---${colors.reset}`);

  // Test 4.1: Synchronous DOM unwrap mounts modal directly with destination
  try {
    const { win, doc, chrome } = setupEnv();
    const anchor = doc.createElement('a');
    anchor.href = 'https://t.co/instant123';
    anchor.setAttribute('title', 'https://instant-dest.com/story');
    doc.body.appendChild(anchor);

    initContentScript(win, chrome);

    const clickEv = new MouseEvent('click', { button: 0, shiftKey: true, bubbles: true, cancelable: true });
    anchor.dispatchEvent(clickEv);

    const modal = getModal();
    assert.ok(modal, 'Modal mounted');
    assert.strictEqual(modal.iframe.src, 'https://instant-dest.com/story');
    teardownModal(win);
    pass('4.1: Synchronous DOM unwrap mounts modal immediately with real destination');
  } catch (err) {
    fail('4.1: Synchronous DOM unwrap modal mount', err);
  }

  // Test 4.2: Raw t.co link without DOM metadata triggers async resolution
  try {
    const { win, doc, chrome } = setupEnv();
    let sentAction = null;
    let sentUrl = null;

    chrome.runtime.sendMessage = (msg, callback) => {
      sentAction = msg.action;
      sentUrl = msg.url;
      setTimeout(() => {
        callback({ success: true, resolvedUrl: 'https://resolved-async.com/target?utm_source=twitter' });
      }, 10);
    };

    const anchor = doc.createElement('a');
    anchor.href = 'https://t.co/async123';
    doc.body.appendChild(anchor);

    initContentScript(win, chrome);
    anchor.dispatchEvent(new MouseEvent('click', { button: 0, shiftKey: true, bubbles: true, cancelable: true }));

    const modal = getModal();
    assert.ok(modal);
    assert.strictEqual(sentAction, 'RESOLVE_URL');
    assert.strictEqual(sentUrl, 'https://t.co/async123');

    // Wait for resolution callback
    await new Promise((r) => setTimeout(r, 25));

    // Verify modal was updated with resolved and stripped URL
    assert.strictEqual(modal.iframe.src, 'https://resolved-async.com/target');
    assert.strictEqual(modal.shadowRoot.querySelector('.peek-wave-domain').textContent, 'resolved-async.com');

    teardownModal(win);
    pass('4.2: Asynchronous RESOLVE_URL resolution updates iframe.src and domain pill');
  } catch (err) {
    fail('4.2: Asynchronous RESOLVE_URL update', err);
  }

  // Test 4.3: Dismissal during pending async resolution does NOT revive modal or leak
  try {
    const { win, doc, chrome } = setupEnv();
    let resolveCb = null;

    chrome.runtime.sendMessage = (msg, callback) => {
      resolveCb = callback; // Hold callback to simulate slow network
    };

    const anchor = doc.createElement('a');
    anchor.href = 'https://t.co/slowResolve';
    doc.body.appendChild(anchor);

    initContentScript(win, chrome);
    anchor.dispatchEvent(new MouseEvent('click', { button: 0, shiftKey: true, bubbles: true, cancelable: true }));

    assert.ok(getModal() !== null, 'Modal open before dismissal');

    // User dismisses modal via Escape key while resolution is still pending in network
    const escEv = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true });
    win.dispatchEvent(escEv);

    assert.strictEqual(getModal(), null, 'Modal immediately torn down');
    assert.strictEqual(doc.getElementById('peek-wave-host'), null, 'Host container detached');

    // Now slow network response arrives
    assert.ok(typeof resolveCb === 'function');
    resolveCb({ success: true, resolvedUrl: 'https://late-arrival.com/page' });

    // Verify modal remains strictly null and was NOT revived
    assert.strictEqual(getModal(), null, 'Late network response must NOT revive modal');
    assert.strictEqual(doc.getElementById('peek-wave-host'), null, 'No host created in DOM');
    pass('4.3: Dismissal during in-flight resolution cleanly cancels without revival or leak');
  } catch (err) {
    fail('4.3: Dismissal during in-flight resolution', err);
  }

  // Test 4.4: Preemptive remount on second link while first resolution is pending
  try {
    const { win, doc, chrome } = setupEnv();
    let resolveCb1 = null;

    chrome.runtime.sendMessage = (msg, callback) => {
      resolveCb1 = callback;
    };

    const link1 = doc.createElement('a');
    link1.href = 'https://t.co/first';
    const link2 = doc.createElement('a');
    link2.href = 'https://t.co/second';
    link2.setAttribute('title', 'https://second-immediate.com/dest');
    doc.body.appendChild(link1);
    doc.body.appendChild(link2);

    initContentScript(win, chrome);

    // Click link 1 (slow async)
    link1.dispatchEvent(new MouseEvent('click', { button: 0, shiftKey: true, bubbles: true, cancelable: true }));
    const modal1 = getModal();
    assert.ok(modal1);

    // Immediately click link 2 (fast sync)
    link2.dispatchEvent(new MouseEvent('click', { button: 0, shiftKey: true, bubbles: true, cancelable: true }));
    const modal2 = getModal();
    assert.ok(modal2);
    assert.notStrictEqual(modal1, modal2, 'New modal instance created');
    assert.strictEqual(modal2.iframe.src, 'https://second-immediate.com/dest');

    // Late arrival of first resolution response
    if (resolveCb1) {
      resolveCb1({ success: true, resolvedUrl: 'https://stale-first-arrival.com/page' });
    }

    // Modal 2 must NOT have been corrupted by link 1's response
    assert.strictEqual(getModal().iframe.src, 'https://second-immediate.com/dest');
    teardownModal(win);
    pass('4.4: Preemptive remount: Stale async resolution does not corrupt new modal');
  } catch (err) {
    fail('4.4: Preemptive remount stale async protection', err);
  }

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log(`\n${colors.bright}${colors.yellow}========================================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.yellow}   TWITTER/X UNFORWARDING & TRACKING VERIFICATION SUMMARY               ${colors.reset}`);
  console.log(`${colors.bright}${colors.yellow}========================================================================${colors.reset}`);
  console.log(`- TOTAL TESTS EXECUTED: ${results.passed + results.failed}`);
  console.log(`- PASSED:               ${colors.green}${results.passed}${colors.reset}`);
  console.log(`- FAILED:               ${results.failed > 0 ? colors.red + results.failed + colors.reset : colors.green + '0' + colors.reset}`);
  console.log(`- VERDICT:              ${results.failed === 0 ? colors.green + 'ALL TESTS PASSED (APPROVE)' + colors.reset : colors.red + 'FAILURES DETECTED' + colors.reset}`);
  console.log(`${colors.bright}${colors.yellow}========================================================================${colors.reset}\n`);

  return results;
}

if (require.main === module) {
  runTwitterUnforwardingAdversarialTests()
    .then((r) => {
      process.exit(r.failed > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error('Fatal test error:', err);
      process.exit(1);
    });
}

module.exports = { runTwitterUnforwardingAdversarialTests };
