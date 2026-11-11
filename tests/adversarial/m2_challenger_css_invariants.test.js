/**
 * tests/adversarial/m2_challenger_css_invariants.test.js
 * 
 * Empirical verification harness for Milestone 2:
 * 1. Normalized 100% equivalence between MODAL_CSS_TEXT and content/modal.css
 * 2. Invariant verification on .peek-wave-backdrop:
 *    - backdrop-filter: blur(4px) !important;
 *    - -webkit-backdrop-filter: blur(4px) !important;
 *    - transform: translateZ(0) !important;
 *    - isolation: isolate !important;
 *    - zero will-change occurrences
 * 3. Invariant verification on .peek-wave-modal:
 *    - backdrop-filter: blur(20px) saturate(180%) !important;
 *    - -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
 *    - transform: translateZ(0) !important;
 *    - isolation: isolate !important;
 *    - zero will-change occurrences
 * 4. Overall stylesheet scan for forbidden will-change properties
 * 5. Dynamic theme tokens and light mode (@media (prefers-color-scheme: light)) assertions
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
  assert.strictEqual(normText.length, 12385, 'Expected normalized length 12385');
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

// 3. Modal invariants
run('3.1: .peek-wave-modal has blur(20px) saturate(180%) in modal.css & MODAL_CSS_TEXT', () => {
  [modalCss, MODAL_CSS_TEXT].forEach((css, idx) => {
    const label = idx === 0 ? 'modal.css' : 'MODAL_CSS_TEXT';
    const rule = extractRule(css, '\\.peek-wave-modal');
    assert(rule.includes('backdrop-filter: blur(20px) saturate(180%) !important;'), `backdrop-filter: blur(20px) saturate(180%) missing in ${label}`);
    assert(rule.includes('-webkit-backdrop-filter: blur(20px) saturate(180%) !important;'), `-webkit-backdrop-filter: blur(20px) saturate(180%) missing in ${label}`);
  });
});

run('3.2: .peek-wave-modal has transform: translateZ(0) and isolation: isolate', () => {
  [modalCss, MODAL_CSS_TEXT].forEach((css, idx) => {
    const label = idx === 0 ? 'modal.css' : 'MODAL_CSS_TEXT';
    const rule = extractRule(css, '\\.peek-wave-modal');
    assert(rule.includes('transform: translateZ(0) !important;'), `transform: translateZ(0) missing in ${label}`);
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

// 5. Aesthetic and theming checks
run('5.1: Neutral backdrop color variable is defined and utilized', () => {
  assert(modalCss.includes('--peek-backdrop-bg: rgba(0, 0, 0, 0.40);'), 'Dark mode backdrop token missing');
  assert(modalCss.includes('--peek-backdrop-bg: rgba(0, 0, 0, 0.25);'), 'Light mode backdrop token missing');
  assert(modalCss.includes('background-color: var(--peek-backdrop-bg, rgba(0, 0, 0, 0.40)) !important;'), 'Backdrop rule usage missing');
});

run('5.2: Liquid glass gradient and specular edge tokens are present', () => {
  assert(modalCss.includes('--peek-glass-bg: linear-gradient(135deg,'), 'Liquid glass gradient missing');
  assert(modalCss.includes('--peek-border-glass: rgba(255, 255, 255, 0.18);'), 'Dark border glass token missing');
  assert(modalCss.includes('--peek-border-glass: rgba(255, 255, 255, 0.70);'), 'Light border glass token missing');
  assert(modalCss.includes('--peek-header-highlight: inset 0 1px 0 0 rgba(255, 255, 255, 0.28);'), 'Dark header specular highlight missing');
  assert(modalCss.includes('--peek-header-highlight: inset 0 1px 0 0 rgba(255, 255, 255, 0.95);'), 'Light header specular highlight missing');
});

run('5.3: Dynamic AccentColor adaptation is enabled with fallback', () => {
  assert(modalCss.includes('--peek-accent: #38bdf8;'), 'Default accent fallback missing');
  assert(modalCss.includes('@supports (color: AccentColor)'), '@supports AccentColor block missing');
  assert(modalCss.includes('--peek-accent: AccentColor;'), 'AccentColor binding missing');
});

run('5.4: prefers-color-scheme: light block exists with complete tokens', () => {
  assert(modalCss.includes('@media (prefers-color-scheme: light)'), 'prefers-color-scheme light media query missing');
  assert(modalCss.includes('--peek-text-primary: #0f172a;'), 'Light mode primary text color missing');
  assert(modalCss.includes('--peek-iframe-bg: #f8fafc;'), 'Light mode iframe bg missing');
});

console.log('\n------------------------------------------------------------------------');
console.log(`SUMMARY: ${passedTests}/${totalTests} tests passed cleanly.`);
console.log('------------------------------------------------------------------------\n');
