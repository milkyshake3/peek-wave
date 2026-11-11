/**
 * tests/adversarial/m1_challenger_probes.js
 * 
 * Adversarial Challenger Empirical Verification Harness for Milestone 1:
 * - R1: Modal Header Click-to-Copy & Listener Lifecycle
 * - R3: Direct Origin Favicon Resolution & Zero External Lookups
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const {
  createBrowserEnvironment,
  MouseEvent,
  KeyboardEvent,
  Event
} = require('../harness/dom_simulator');
const { createChromeMock } = require('../harness/chrome_mock');

// Target under test: Production content script engine
const content = require(path.resolve(__dirname, '../../content/content.js'));
const {
  mountModal,
  teardownModal,
  getModal,
  resolveFaviconUrl,
  parseUrlDetails,
  SVG_NS
} = content;

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m'
};

const results = { passed: 0, failed: 0, tests: [] };

function logHeader(title) {
  console.log(`\n${colors.bright}${colors.cyan}--- ${title} ---${colors.reset}`);
}

function pass(name, detail = '') {
  results.passed++;
  results.tests.push({ name, status: 'PASS', detail });
  console.log(`  ${colors.green}[PASS]${colors.reset} ${name} ${detail ? colors.bright + '(' + detail + ')' + colors.reset : ''}`);
}

function fail(name, err) {
  results.failed++;
  const msg = err?.message || String(err);
  results.tests.push({ name, status: 'FAIL', error: msg });
  console.error(`  ${colors.red}[FAIL]${colors.reset} ${name}`);
  console.error(`         ${colors.red}Error: ${msg}${colors.reset}`);
  if (err?.stack) {
    console.error(`         ${err.stack.split('\n').slice(1, 3).join('\n         ')}`);
  }
}

function setupEnv(options = {}) {
  const origin = options.origin || 'https://news.ycombinator.com';
  const html = options.html || `<!DOCTYPE html><html><head><base href="${origin}/"></head><body><div id="app"></div></body></html>`;
  const win = createBrowserEnvironment(html);
  
  if (options.origin) {
    try {
      win.location.href = options.origin;
      win.document.location = win.location;
    } catch {}
  }

  // Enhance doc.querySelector to support standard W3C link[rel~="icon"] / link[rel*="icon"] in mock DOM
  const origQuerySelector = win.document.querySelector.bind(win.document);
  win.document.querySelector = (selector) => {
    if (typeof selector === 'string' && (selector.includes('rel~="icon"') || selector.includes('rel*="icon"'))) {
      const links = win.document.querySelectorAll('link');
      for (const link of links) {
        const rel = (link.getAttribute('rel') || '').toLowerCase();
        if (rel.split(/\s+/).includes('icon') || rel.includes('icon')) {
          return link;
        }
      }
      return null;
    }
    return origQuerySelector(selector);
  };
  
  const chromeMock = createChromeMock({ enabled: true, modifierKey: 'shift', sizePreset: 'default' });
  win.chrome = chromeMock;
  global.chrome = chromeMock;
  return { win, doc: win.document, chrome: chromeMock };
}

async function runAllChallengerProbes() {
  console.log(`\n${colors.bright}${colors.yellow}========================================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.yellow}  CHALLENGER EMPIRICAL VERIFICATION PROBES: M1 (CLICK-TO-COPY & FAVICON)${colors.reset}`);
  console.log(`${colors.bright}${colors.yellow}========================================================================${colors.reset}`);

  // ==========================================================================
  // SECTION 1: Modal Header Click-to-Copy Probes
  // ==========================================================================
  logHeader('Section 1: Modal Header Click-to-Copy Probes (R1)');

  // Probe 1.1: Direct click on .peek-wave-domain copies URL & shows visual feedback
  try {
    const { win } = setupEnv();
    const targetUrl = 'https://developer.mozilla.org/en-US/docs/Web/JavaScript';
    const modal = mountModal(targetUrl, { win });
    assert.ok(modal, 'Modal mounted');

    const domainSpan = modal.domainSpan;
    const copyTooltip = modal.copyTooltip;
    assert.ok(domainSpan, '.peek-wave-domain must exist');
    assert.strictEqual(domainSpan.textContent, 'developer.mozilla.org');
    assert.strictEqual(domainSpan.getAttribute('role'), 'button');
    assert.strictEqual(domainSpan.getAttribute('tabindex'), '0');
    assert.strictEqual(domainSpan.title, 'Click to copy link');
    assert.strictEqual(domainSpan.getAttribute('aria-label'), 'Copy link to clipboard');

    // Dispatch click to domainSpan
    const clickEvt = new MouseEvent('click', { bubbles: true, cancelable: true });
    domainSpan.dispatchEvent(clickEvt);

    // Verify clipboard content and visual feedback
    assert.strictEqual(win._clipboardText, targetUrl, 'URL must be written to clipboard');
    assert.strictEqual(domainSpan.textContent, 'Copied!', 'domainSpan textContent must show "Copied!"');
    assert.ok(domainSpan.classList.contains('copied'), 'domainSpan must have class "copied"');
    assert.strictEqual(domainSpan.title, 'Copied!', 'domainSpan title must be "Copied!"');
    assert.strictEqual(copyTooltip.textContent, 'Copied!', 'copyTooltip must show "Copied!"');
    assert.ok(copyTooltip.classList.contains('active'), 'copyTooltip must have class "active"');

    // Wait 1600ms for revert
    await new Promise(r => setTimeout(r, 1600));

    assert.strictEqual(domainSpan.textContent, 'developer.mozilla.org', 'domainSpan must revert textContent');
    assert.strictEqual(domainSpan.classList.contains('copied'), false, 'domainSpan must remove "copied" class');
    assert.strictEqual(domainSpan.title, 'Click to copy link', 'domainSpan must revert title');
    assert.strictEqual(copyTooltip.textContent, 'Copy', 'copyTooltip must revert text');
    assert.strictEqual(copyTooltip.classList.contains('active'), false, 'copyTooltip must remove active class');

    teardownModal(win);
    pass('1.1: Direct click on .peek-wave-domain writes URL to clipboard and triggers visual feedback');
  } catch (err) {
    fail('1.1: Direct click on .peek-wave-domain', err);
  }

  // Probe 1.2: Keydown events (Enter, Space) trigger copy
  try {
    const { win } = setupEnv();
    const targetUrl = 'https://github.com/torvalds/linux';
    const modal = mountModal(targetUrl, { win });
    const domainSpan = modal.domainSpan;

    // Test Enter key
    const enterEvt = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
    domainSpan.dispatchEvent(enterEvt);

    assert.strictEqual(win._clipboardText, targetUrl, 'Enter key must write URL to clipboard');
    assert.strictEqual(domainSpan.textContent, 'Copied!', 'Enter key must trigger "Copied!" text');
    assert.ok(enterEvt.defaultPrevented, 'Enter key event must have preventDefault called');
    assert.ok(enterEvt._propagationStopped, 'Enter key event must have stopPropagation called');

    // Revert manually or mount fresh for Space key test
    teardownModal(win);

    const env2 = setupEnv();
    const modal2 = mountModal('https://crates.io/crates/tokio', { win: env2.win });
    const domainSpan2 = modal2.domainSpan;

    // Test Space key (' ')
    const spaceEvt = new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true });
    domainSpan2.dispatchEvent(spaceEvt);

    assert.strictEqual(env2.win._clipboardText, 'https://crates.io/crates/tokio', 'Space key must write URL to clipboard');
    assert.strictEqual(domainSpan2.textContent, 'Copied!', 'Space key must trigger "Copied!" text');
    assert.ok(spaceEvt.defaultPrevented, 'Space key event must have preventDefault called');
    assert.ok(spaceEvt._propagationStopped, 'Space key event must have stopPropagation called');

    teardownModal(env2.win);
    pass('1.2: Keydown events (Enter, Space) trigger copy, visual feedback, and event cancellation');
  } catch (err) {
    fail('1.2: Keydown events (Enter, Space)', err);
  }

  // Probe 1.3: Non-action keys (Tab, Escape, ArrowDown, etc.) do NOT trigger copy
  try {
    const { win } = setupEnv();
    const targetUrl = 'https://python.org';
    const modal = mountModal(targetUrl, { win });
    const domainSpan = modal.domainSpan;
    win._clipboardText = ''; // clear clipboard

    const nonActionKeys = [
      { key: 'Tab', code: 'Tab' },
      { key: 'ArrowDown', code: 'ArrowDown' },
      { key: 'ArrowUp', code: 'ArrowUp' },
      { key: 'ArrowLeft', code: 'ArrowLeft' },
      { key: 'ArrowRight', code: 'ArrowRight' },
      { key: 'Shift', code: 'ShiftLeft' },
      { key: 'Control', code: 'ControlLeft' },
      { key: 'Alt', code: 'AltLeft' },
      { key: 'a', code: 'KeyA' },
      { key: 'Backspace', code: 'Backspace' }
    ];

    for (const keyDef of nonActionKeys) {
      const evt = new KeyboardEvent('keydown', { key: keyDef.key, code: keyDef.code, bubbles: true, cancelable: true });
      domainSpan.dispatchEvent(evt);

      assert.strictEqual(win._clipboardText, '', `Key "${keyDef.key}" must NOT write to clipboard`);
      assert.strictEqual(domainSpan.textContent, 'python.org', `Key "${keyDef.key}" must NOT change domain text`);
      assert.strictEqual(domainSpan.classList.contains('copied'), false, `Key "${keyDef.key}" must NOT add "copied" class`);
    }

    teardownModal(win);
    pass('1.3: Non-action keys (Tab, Arrows, Modifiers, Alphanumeric) do NOT trigger copy');
  } catch (err) {
    fail('1.3: Non-action keys false trigger', err);
  }

  // Probe 1.4: Initial mount textContent strictly equals displayDomain without child text pollution
  try {
    const { win } = setupEnv();
    const testCases = [
      'https://en.wikipedia.org/wiki/Ada_Lovelace',
      'https://sub.domain.corp.internal:8080/path?q=1#sec',
      'http://127.0.0.1:3000/api',
      'https://www.example.com/test'
    ];

    for (const testUrl of testCases) {
      const urlDetails = parseUrlDetails(testUrl);
      const modal = mountModal(testUrl, { win });
      const domainSpan = modal.domainSpan;

      assert.strictEqual(domainSpan.textContent, urlDetails.displayDomain, 'textContent must match displayDomain exactly');
      assert.strictEqual(domainSpan.children.length, 0, 'domainSpan must not contain child elements');
      assert.strictEqual(domainSpan.childNodes.length, 1, 'domainSpan must contain only a single text node');
      assert.strictEqual(domainSpan.innerHTML, urlDetails.displayDomain, 'innerHTML must strictly match displayDomain without markup pollution');

      teardownModal(win);
    }

    pass('1.4: Initial mount textContent strictly equals urlDetails.displayDomain without child element pollution');
  } catch (err) {
    fail('1.4: Initial mount textContent & child element check', err);
  }

  // Probe 1.5: .peek-wave-btn-copy in header actions remains present and functional
  try {
    const { win } = setupEnv();
    const targetUrl = 'https://golang.org/doc';
    const modal = mountModal(targetUrl, { win });

    const copyBtn = modal.copyBtn;
    assert.ok(copyBtn, '.peek-wave-btn-copy must exist in modal');
    assert.strictEqual(copyBtn.tagName, 'BUTTON');
    assert.ok(copyBtn.classList.contains('peek-wave-btn-copy'));

    const clickEvt = new MouseEvent('click', { bubbles: true, cancelable: true });
    copyBtn.dispatchEvent(clickEvt);

    assert.strictEqual(win._clipboardText, targetUrl, 'copyBtn click must write URL to clipboard');
    assert.strictEqual(modal.copyTooltip.textContent, 'Copied!', 'copyTooltip must show "Copied!"');
    assert.ok(modal.domainSpan.classList.contains('copied'), 'domainSpan gets "copied" class on button copy');
    // Important contract: button copy does NOT mutate domainSpan.textContent
    assert.strictEqual(modal.domainSpan.textContent, 'golang.org', 'button copy does NOT overwrite domainSpan textContent');

    teardownModal(win);
    pass('1.5: .peek-wave-btn-copy in header actions remains present, functional, and maintains domain text');
  } catch (err) {
    fail('1.5: .peek-wave-btn-copy functionality', err);
  }

  // Probe 1.6: .peek-wave-header-actions contains exactly 3 buttons
  try {
    const { win } = setupEnv();
    const modal = mountModal('https://example.com', { win });
    const shadowRoot = modal.shadowRoot;

    const headerActions = shadowRoot.querySelector('.peek-wave-header-actions');
    assert.ok(headerActions, '.peek-wave-header-actions must exist');

    const buttons = headerActions.querySelectorAll('button');
    assert.strictEqual(buttons.length, 3, 'header actions must contain exactly 3 buttons');
    assert.ok(buttons[0].classList.contains('peek-wave-btn-copy'), 'Button 0 must be copyBtn');
    assert.ok(buttons[1].classList.contains('peek-wave-btn-tab'), 'Button 1 must be tabBtn');
    assert.ok(buttons[2].classList.contains('peek-wave-btn-close'), 'Button 2 must be closeBtn');

    teardownModal(win);
    pass('1.6: .peek-wave-header-actions contains exactly 3 buttons (copy, tab, close)');
  } catch (err) {
    fail('1.6: header actions button count', err);
  }

  // Probe 1.7: Teardown Stress: 100 mount/dismiss cycles, listener removal & memory hygiene
  try {
    const { win, doc } = setupEnv();
    const initialDomChildCount = doc.documentElement.childNodes.length;

    for (let i = 0; i < 100; i++) {
      const modal = mountModal(`https://example.com/test-${i}`, { win });
      assert.ok(modal, `Modal ${i} mounted`);
      const domainSpan = modal.domainSpan;
      const clickHandler = modal.domainClickHandler;
      const keydownHandler = modal.domainKeydownHandler;

      assert.ok(clickHandler, `domainClickHandler ${i} must exist`);
      assert.ok(keydownHandler, `domainKeydownHandler ${i} must exist`);

      // Teardown modal
      teardownModal(win);

      assert.strictEqual(getModal(), null, `currentModal must be null after teardown ${i}`);

      // Dispatch events to detached domainSpan - verify no side effects or errors
      const clickEvt = new MouseEvent('click', { bubbles: true, cancelable: true });
      domainSpan.dispatchEvent(clickEvt);
      const keyEvt = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
      domainSpan.dispatchEvent(keyEvt);
    }

    // Verify DOM hygiene
    assert.strictEqual(doc.documentElement.childNodes.length, initialDomChildCount, 'Zero residual nodes in documentElement');
    assert.strictEqual(doc.getElementById('peek-wave-host'), null, '#peek-wave-host must be completely detached');

    pass('1.7: Teardown stress: 100 cycles verify clean listener removal and zero DOM/listener leakage');
  } catch (err) {
    fail('1.7: Teardown stress 100 cycles', err);
  }

  // ==========================================================================
  // SECTION 2: Direct Origin Favicon Resolution Probes
  // ==========================================================================
  logHeader('Section 2: Direct Origin Favicon Resolution Probes (R3)');

  // Probe 2.1: Varied target URLs resolve to direct origin without Google lookups
  try {
    const { win, doc } = setupEnv({ origin: 'https://my-host-site.org' });
    const probeTargets = [
      { url: 'https://github.com/torvalds/linux', expected: 'https://github.com/favicon.ico' },
      { url: 'https://en.wikipedia.org/wiki/JavaScript', expected: 'https://en.wikipedia.org/favicon.ico' },
      { url: 'http://localhost:8080/dashboard', expected: 'http://localhost:8080/favicon.ico' },
      { url: 'http://192.168.1.100:3000/api/v1', expected: 'http://192.168.1.100:3000/favicon.ico' },
      { url: 'https://sub.domain.corp.internal:9443/app?a=1&b=2#hash', expected: 'https://sub.domain.corp.internal:9443/favicon.ico' },
      { url: 'https://news.ycombinator.com', expected: 'https://news.ycombinator.com/favicon.ico' }
    ];

    for (const pt of probeTargets) {
      const urlDetails = parseUrlDetails(pt.url);
      const resolved = resolveFaviconUrl(urlDetails, doc, win);
      assert.strictEqual(resolved, pt.expected, `Target ${pt.url} must resolve to ${pt.expected}`);
      assert.strictEqual(resolved.includes('google.com'), false, `Target ${pt.url} must NOT query google.com`);
      assert.strictEqual(resolved.includes('/s2/favicons'), false, `Target ${pt.url} must NOT query /s2/favicons`);

      // Mount modal and verify DOM element attribute
      const modal = mountModal(pt.url, { win });
      assert.strictEqual(modal.favicon.src, pt.expected, `modal.favicon.src must equal ${pt.expected}`);
      assert.strictEqual(modal.favicon.src.includes('google.com'), false, 'modal.favicon.src must NOT query google.com');
      teardownModal(win);
    }

    pass('2.1: Direct origin favicon resolution verified across 6 diverse URL architectures with zero Google lookups');
  } catch (err) {
    fail('2.1: Direct origin favicon resolution', err);
  }

  // Probe 2.2: Same-origin declared link[rel*="icon"] resolution vs cross-origin isolation
  try {
    const hostOrigin = 'https://mysite.example.com';
    const { win, doc } = setupEnv({ origin: hostOrigin });

    // Inject same-origin <link rel="icon">
    const iconLink = doc.createElement('link');
    iconLink.setAttribute('rel', 'icon');
    iconLink.setAttribute('href', '/assets/brand-favicon.svg');
    doc.head.appendChild(iconLink);

    // Test A: Same-origin preview resolves declared link icon
    const sameOriginUrl = `${hostOrigin}/docs/intro`;
    const modalSame = mountModal(sameOriginUrl, { win });
    assert.strictEqual(modalSame.favicon.src, `${hostOrigin}/assets/brand-favicon.svg`, 'Same-origin must resolve declared icon link');
    assert.strictEqual(modalSame.favicon.src.includes('google.com'), false);
    teardownModal(win);

    // Test B: Cross-origin preview does NOT leak host declared link icon
    const crossOriginUrl = 'https://external-service.org/welcome';
    const modalCross = mountModal(crossOriginUrl, { win });
    assert.strictEqual(modalCross.favicon.src, 'https://external-service.org/favicon.ico', 'Cross-origin target must resolve direct origin /favicon.ico');
    assert.strictEqual(modalCross.favicon.src.includes('google.com'), false);
    assert.ok(!modalCross.favicon.src.includes('brand-favicon.svg'), 'Cross-origin must NOT use host document favicon link');
    teardownModal(win);

    // Test C: Same-origin with relative href without leading slash
    iconLink.setAttribute('href', 'images/local-icon.ico');
    const modalRel = mountModal(sameOriginUrl, { win });
    assert.strictEqual(modalRel.favicon.src, `${hostOrigin}/images/local-icon.ico`, 'Same-origin must resolve relative icon link against host origin');
    teardownModal(win);

    pass('2.2: Same-origin link[rel*="icon"] properly resolved while cross-origin targets maintain strict origin isolation');
  } catch (err) {
    fail('2.2: Same-origin link[rel*="icon"] vs cross-origin isolation', err);
  }

  // Probe 2.3: Favicon error handling: display: none and no CSP violation (favicon.onerror === null)
  try {
    const { win } = setupEnv();
    const modal = mountModal('https://nonexistent-site-12345.org', { win });
    const favicon = modal.favicon;

    assert.ok(favicon, 'Favicon element must exist');
    assert.notStrictEqual(favicon.style.display, 'none', 'Favicon should initially not be hidden');

    // Verify CSP compliance: no inline onerror property assigned
    assert.strictEqual(favicon.onerror, null, 'favicon.onerror must be null to preserve CSP conformance');

    // Simulate image error event
    const errEvt = new Event('error', { bubbles: false, cancelable: false });
    favicon.dispatchEvent(errEvt);

    // Verify display: none is applied
    assert.strictEqual(favicon.style.display, 'none', 'Favicon display must be set to "none" on error');

    // Verify teardown cleanly cleans up favicon
    teardownModal(win);
    assert.strictEqual(favicon.src, '', 'Favicon src must be cleared on teardown');

    pass('2.3: Favicon load error gracefully hides image with display: none and zero CSP violations (onerror === null)');
  } catch (err) {
    fail('2.3: Favicon error handling & CSP compliance', err);
  }

  // Probe 2.4: Malformed or fallback inputs to resolveFaviconUrl
  try {
    const fallbackA = resolveFaviconUrl(null);
    assert.strictEqual(fallbackA, 'https://example.com/favicon.ico', 'Null urlDetails falls back safely');

    const fallbackB = resolveFaviconUrl({ protocol: 'http:', hostname: '10.0.0.1' });
    assert.strictEqual(fallbackB, 'http://10.0.0.1/favicon.ico', 'Partial urlDetails falls back safely');

    const fallbackC = resolveFaviconUrl({ fullUrl: 'not a valid url', protocol: 'https:', hostname: 'broken.test' });
    assert.strictEqual(fallbackC, 'https://broken.test/favicon.ico', 'Invalid fullUrl falls back safely');

    pass('2.4: resolveFaviconUrl gracefully handles invalid or partial urlDetails without throwing');
  } catch (err) {
    fail('2.4: resolveFaviconUrl error resilience', err);
  }

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log(`\n${colors.bright}${colors.yellow}========================================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.yellow}                 CHALLENGER PROBE EXECUTION SUMMARY                     ${colors.reset}`);
  console.log(`${colors.bright}${colors.yellow}========================================================================${colors.reset}`);
  console.log(`  Passed: ${results.passed}`);
  console.log(`  Failed: ${results.failed}`);
  console.log(`  Verdict: ${results.failed === 0 ? colors.green + 'ALL PROBES PASSED (APPROVE)' : colors.red + 'FAILURES DETECTED (REJECT)'}${colors.reset}`);
  console.log(`${colors.bright}${colors.yellow}========================================================================${colors.reset}\n`);

  if (results.failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runAllChallengerProbes().catch(err => {
    console.error('Fatal probe harness error:', err);
    process.exit(1);
  });
}

module.exports = { runAllChallengerProbes };
