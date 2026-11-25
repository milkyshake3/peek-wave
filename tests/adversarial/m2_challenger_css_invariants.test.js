/**
 * tests/adversarial/m2_challenger_css_invariants.test.js
 * 
 * Empirical verification harness for Milestone 2 & Monochrome Theme System:
 * 1. Normalized 100% equivalence between MODAL_CSS_TEXT and content/modal.css
 * 2. Invariant verification on .peek-wave-backdrop:
 *    - backdrop-filter: blur(4px) !important;
 *    - -webkit-backdrop-filter: blur(4px) !important;
 *    - transform: translateZ(0) !important;
 *    - isolation: isolate !important;
 *    - zero will-change occurrences
 * 3. Invariant verification on .peek-wave-modal, .peek-wave-header, and .peek-wave-fallback-banner:
 *    - strictly omit backdrop-filter and -webkit-backdrop-filter (single-pass blur(4px) on backdrop only)
 *    - zero nested blur(20px) / blur(12px) / saturate(180%) render surfaces
 *    - transform: translateZ(0); (non-!important so @keyframes animations can animate transform)
 *    - isolation: isolate !important;
 *    - zero will-change occurrences
 * 4. Overall stylesheet scan for forbidden will-change properties & non-monochrome cyan tokens
 * 5. Monochrome translucent glass tokens, 3-way themes (dark/light/auto), and reduced motion
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../../');
const MODAL_CSS_PATH = path.join(ROOT_DIR, 'content/modal.css');
const CONTENT_JS_PATH = path.join(ROOT_DIR, 'content/content.js');

const modalCss = fs.readFileSync(MODAL_CSS_PATH, 'utf8');
const { MODAL_CSS_TEXT } = require(CONTENT_JS_PATH);

const normalizeCss = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();

let totalTests = 0;
let passedTests = 0;

function run(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

console.log('========================================================================');
console.log('  MILESTONE 2: CHALLENGER CSS & INVARIANT VERIFICATION SUITE           ');
console.log('========================================================================\n');

// 1. Normalized comparison
run('1.1: MODAL_CSS_TEXT matches content/modal.css 100% when normalized', () => {
  const normText = normalizeCss(MODAL_CSS_TEXT);
  const normFile = normalizeCss(modalCss);
  assert.strictEqual(normText, normFile, 'MODAL_CSS_TEXT and modal.css must be 100% equal');
  assert(normText.length > 5000, `Unexpectedly short stylesheet length: ${normText.length}`);
});

// 2. Backdrop invariants
function extractRule(css, selector) {
  const match = css.match(new RegExp(selector + '\\s*\\{([^}]+)\\}'));
  assert(match, `Rule ${selector} not found`);
  return match[1];
}

run('2.1: .peek-wave-backdrop has blur(4px) in modal.css & MODAL_CSS_TEXT', () => {
  [modalCss, MODAL_CSS_TEXT].forEach((css, idx) => {
    const label = idx === 0 ? 'modal.css' : 'MODAL_CSS_TEXT';
    const rule = extractRule(css, '\\.peek-wave-backdrop');
    assert(rule.includes('backdrop-filter: blur(4px) !important;'), `backdrop-filter: blur(4px) missing in ${label}`);
    assert(rule.includes('-webkit-backdrop-filter: blur(4px) !important;'), `-webkit-backdrop-filter: blur(4px) missing in ${label}`);
  });
});

run('2.2: .peek-wave-backdrop has transform: translateZ(0) and isolation: isolate', () => {
  [modalCss, MODAL_CSS_TEXT].forEach((css, idx) => {
    const label = idx === 0 ? 'modal.css' : 'MODAL_CSS_TEXT';
    const rule = extractRule(css, '\\.peek-wave-backdrop');
    assert(rule.includes('transform: translateZ(0) !important;'), `transform: translateZ(0) missing in ${label}`);
    assert(rule.includes('isolation: isolate !important;'), `isolation: isolate missing in ${label}`);
  });
});

run('2.3: .peek-wave-backdrop strictly omits will-change', () => {
  [modalCss, MODAL_CSS_TEXT].forEach((css, idx) => {
    const label = idx === 0 ? 'modal.css' : 'MODAL_CSS_TEXT';
    const rule = extractRule(css, '\\.peek-wave-backdrop');
    assert(!rule.includes('will-change'), `Forbidden will-change detected on backdrop in ${label}`);
  });
});

// 3. Modal, Header & Banner invariants (no nested backdrop-filter render surfaces)
run('3.1: .peek-wave-modal, .peek-wave-header, and .peek-wave-fallback-banner omit backdrop-filter in modal.css & MODAL_CSS_TEXT', () => {
  [modalCss, MODAL_CSS_TEXT].forEach((css, idx) => {
    const label = idx === 0 ? 'modal.css' : 'MODAL_CSS_TEXT';
    ['\\.peek-wave-modal', '\\.peek-wave-header', '\\.peek-wave-fallback-banner'].forEach((selector) => {
      const rule = extractRule(css, selector);
      assert(!rule.includes('backdrop-filter'), `Nested backdrop-filter must be omitted on ${selector} in ${label}`);
    });
    assert(!css.includes('blur(20px)'), `Forbidden blur(20px) found in ${label}`);
    assert(!css.includes('blur(12px)'), `Forbidden blur(12px) found in ${label}`);
  });
});

run('3.2: .peek-wave-modal has transform: translateZ(0) (without !important) and isolation: isolate', () => {
  [modalCss, MODAL_CSS_TEXT].forEach((css, idx) => {
    const label = idx === 0 ? 'modal.css' : 'MODAL_CSS_TEXT';
    const rule = extractRule(css, '\\.peek-wave-modal');
    assert(rule.includes('transform: translateZ(0);'), `transform: translateZ(0); missing in ${label}`);
    assert(!rule.includes('transform: translateZ(0) !important'), `.peek-wave-modal must not use !important on transform in ${label} so @keyframes animate transform`);
    assert(rule.includes('isolation: isolate !important;'), `isolation: isolate missing in ${label}`);
  });
});

run('3.3: .peek-wave-modal strictly omits will-change', () => {
  [modalCss, MODAL_CSS_TEXT].forEach((css, idx) => {
    const label = idx === 0 ? 'modal.css' : 'MODAL_CSS_TEXT';
    const rule = extractRule(css, '\\.peek-wave-modal');
    assert(!rule.includes('will-change'), `Forbidden will-change detected on modal in ${label}`);
  });
});

// 4. Global will-change check across both files
run('4.1: Entire stylesheet contains zero will-change occurrences', () => {
  assert(!modalCss.includes('will-change'), 'Forbidden will-change detected anywhere in modal.css');
  assert(!MODAL_CSS_TEXT.includes('will-change'), 'Forbidden will-change detected anywhere in MODAL_CSS_TEXT');
});

// 5. Aesthetic, Monochrome Translucent Glass & 3-Way Theming checks
run('5.1: Neutral backdrop color tokens are defined and utilized', () => {
  assert(modalCss.includes('--peek-backdrop-bg: rgba(0, 0, 0, 0.40);'), 'Dark mode backdrop token missing');
  assert(modalCss.includes('--peek-backdrop-bg: rgba(0, 0, 0, 0.25);'), 'Light mode backdrop token missing');
  assert(modalCss.includes('background-color: var(--peek-backdrop-bg, rgba(0, 0, 0, 0.40)) !important;'), 'Backdrop rule usage missing');
});

run('5.2: Monochrome translucent frosted glass gradients and specular tokens are present', () => {
  assert(modalCss.includes('rgba(8, 8, 8, 0.72)'), 'Dark translucent glass base missing');
  assert(modalCss.includes('rgba(10, 10, 10, 0.68)'), 'Dark translucent header base missing');
  assert(modalCss.includes('rgba(255, 255, 255, 0.68)'), 'Light translucent glass base missing');
  assert(modalCss.includes('rgba(255, 255, 255, 0.64)'), 'Light translucent header base missing');
  assert(modalCss.includes('--peek-border-glass: rgba(255, 255, 255, 0.18);'), 'Dark border glass token missing');
  assert(modalCss.includes('--peek-border-glass: rgba(255, 255, 255, 0.70);'), 'Light border glass token missing');
  assert(modalCss.includes('--peek-header-highlight: inset 0 1px 0 0 rgba(255, 255, 255, 0.28);'), 'Dark header specular highlight missing');
  assert(modalCss.includes('--peek-header-highlight: inset 0 1px 0 0 rgba(255, 255, 255, 0.95);'), 'Light header specular highlight missing');
});

run('5.3: Strict monochrome palette omits legacy cyan/AccentColor tokens', () => {
  assert(!modalCss.includes('#38bdf8'), 'Legacy cyan #38bdf8 must not appear in modal.css');
  assert(!modalCss.includes('#0284c7'), 'Legacy cyan #0284c7 must not appear in modal.css');
  assert(!modalCss.includes('#06b6d4'), 'Legacy cyan #06b6d4 must not appear in modal.css');
  assert(!modalCss.includes('AccentColor'), 'OS AccentColor override must not break monochrome aesthetic');
  assert(modalCss.includes('--peek-accent: #ffffff;'), 'Dark monochrome accent missing');
  assert(modalCss.includes('--peek-accent: #000000;'), 'Light monochrome accent missing');
});

run('5.4: 3-way theme selectors (dark, light, auto) and prefers-reduced-motion exist', () => {
  assert(modalCss.includes(':host([data-theme="dark"])'), 'Dark host theme selector missing');
  assert(modalCss.includes(':host([data-theme="light"])'), 'Light host theme selector missing');
  assert(modalCss.includes(':host([data-theme="auto"])'), 'Auto host theme selector missing');
  assert(modalCss.includes('@media (prefers-color-scheme: light)'), 'prefers-color-scheme light media query missing');
  assert(modalCss.includes('@media (prefers-reduced-motion: reduce)'), 'prefers-reduced-motion media query missing');
});

console.log('\n------------------------------------------------------------------------');
console.log(`SUMMARY: ${passedTests}/${totalTests} tests passed cleanly.`);
console.log('------------------------------------------------------------------------\n');
