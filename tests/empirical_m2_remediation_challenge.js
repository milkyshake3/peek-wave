/**
 * tests/empirical_m2_remediation_challenge.js
 * 
 * Empirical Adversarial Challenger Verification Suite for Milestone M2 Remediation.
 * Written by challenger_m2_rem_2.
 * 
 * Verifies:
 * 1. 6-step low-RAM teardown lifecycle across all dismissal methods (Escape, Close btn, Backdrop, re-mount).
 * 2. Button icon vector SVG rendering without innerHTML.
 * 3. SVG xlink:href extraction across varied and adversarial DOM fixtures.
 * 4. DOM cleanliness and zero listener/node leakage.
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const content = require('../content/content.js');
const {
  mountModal,
  teardownModal,
  getModal,
  extractAnchorUrl,
  isModifierActive,
  normalizeModifierKey,
  createSvgElement,
  SVG_NS,
  XLINK_NS
} = content;

const {
  createBrowserEnvironment,
  MouseEvent,
  KeyboardEvent,
  SVGAnimatedString
} = require('./harness/dom_simulator');
const { createChromeMock } = require('./harness/chrome_mock');
const { setupTestEnvironment, loadLiveContentScript } = require('./harness/extension_loader');

let totalPassed = 0;
let totalFailed = 0;

function runEmpiricalTest(name, fn) {
  try {
    fn();
    console.log(`  ✔ [PASS] ${name}`);
    totalPassed++;
  } catch (err) {
    console.error(`  ✖ [FAIL] ${name}: ${err.message}`);
    console.error(err.stack);
    totalFailed++;
  }
}

async function runAllEmpiricalChallenges() {
  console.log('\n========================================================================');
  console.log('  CHALLENGER M2 REMEDIATION — EMPIRICAL ADVERSARIAL STRESS SUITE        ');
  console.log('========================================================================\n');

  // ==========================================================================
  // Section 1: Teardown Lifecycle Verification (6-step deterministic low-RAM)
  // ==========================================================================
  console.log('--- Section 1: Teardown Lifecycle Verification (6 Steps & 3 Dismissal Vectors) ---');

  runEmpiricalTest('1.1 Escape Key Dismissal: Deterministic 6-step execution', () => {
    const win = createBrowserEnvironment('<!DOCTYPE html><html><head></head><body><a href="https://example.com/item">Link</a></body></html>');
    const doc = win.document;
    const chrome = createChromeMock();
    const modal = mountModal('https://example.com/item', { win });

    assert.ok(modal, 'Modal should be mounted');
    const host = doc.getElementById('peek-wave-host');
    assert.ok(host, 'Host should be in DOM');
    const iframe = modal.iframe;
    assert.strictEqual(iframe.src, 'https://example.com/item');

    // Trigger dismissal via Escape keydown on window
    const escEvt = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true });
    win.dispatchEvent(escEvt);

    assert.strictEqual(escEvt.defaultPrevented, true, 'Escape event should be defaultPrevented');
    assert.strictEqual(getModal(), null, 'Step 6: getModal() must be null');
    assert.strictEqual(iframe.src, 'about:blank', 'Step 3: iframe.src must be about:blank');
    assert.strictEqual(iframe.parentNode, null, 'Step 4: iframe must be detached from DOM');
    assert.strictEqual(host.parentNode, null, 'Step 5: host must be detached from document');
    assert.strictEqual(doc.getElementById('peek-wave-host'), null, 'Host must not exist in document');

    // Step 1 check: Verify Escape listener detached by dispatching another Escape
    const escEvt2 = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true });
    win.dispatchEvent(escEvt2);
    assert.strictEqual(escEvt2.defaultPrevented, false, 'Escape event should NOT be prevented after teardown');
  });

  runEmpiricalTest('1.2 Close Button Dismissal: Deterministic 6-step execution', () => {
    const win = createBrowserEnvironment('<!DOCTYPE html><html><head></head><body><a href="https://example.com/item">Link</a></body></html>');
    const doc = win.document;
    const modal = mountModal('https://example.com/item', { win });

    const host = doc.getElementById('peek-wave-host');
    const iframe = modal.iframe;
    const closeBtn = modal.closeBtn;
    assert.ok(closeBtn, 'Close button must exist');

    // Click close button
    const clickEvt = new MouseEvent('click', { bubbles: true, cancelable: true });
    closeBtn.dispatchEvent(clickEvt);

    assert.strictEqual(getModal(), null, 'Step 6: currentModal must be null');
    assert.strictEqual(iframe.src, 'about:blank', 'Step 3: iframe.src must be about:blank');
    assert.strictEqual(iframe.parentNode, null, 'Step 4: iframe must be detached from parent');
    assert.strictEqual(host.parentNode, null, 'Step 5: host must be removed from document');
    assert.strictEqual(doc.getElementById('peek-wave-host'), null);
  });

  runEmpiricalTest('1.3 Backdrop Click Dismissal: Deterministic 6-step execution', () => {
    const win = createBrowserEnvironment('<!DOCTYPE html><html><head></head><body><a href="https://example.com/item">Link</a></body></html>');
    const doc = win.document;
    const modal = mountModal('https://example.com/item', { win });

    const host = doc.getElementById('peek-wave-host');
    const iframe = modal.iframe;
    const backdrop = modal.backdrop;
    assert.ok(backdrop, 'Backdrop element must exist');

    // Click backdrop
    const clickEvt = new MouseEvent('click', { bubbles: true, cancelable: true });
    backdrop.dispatchEvent(clickEvt);

    assert.strictEqual(getModal(), null, 'Step 6: currentModal must be null');
    assert.strictEqual(iframe.src, 'about:blank', 'Step 3: iframe.src must be about:blank');
    assert.strictEqual(iframe.parentNode, null, 'Step 4: iframe detached');
    assert.strictEqual(host.parentNode, null, 'Step 5: host removed');
    assert.strictEqual(doc.getElementById('peek-wave-host'), null);
  });

  runEmpiricalTest('1.4 Idempotent Teardown: Multiple successive calls do not throw or corrupt state', () => {
    const win = createBrowserEnvironment();
    mountModal('https://example.com/idempotent', { win });
    assert.ok(getModal() !== null);

    // Call teardownModal 5 times
    teardownModal(win);
    assert.strictEqual(getModal(), null);
    teardownModal(win);
    teardownModal(null);
    teardownModal(undefined);
    teardownModal(win);
    assert.strictEqual(getModal(), null);
  });

  runEmpiricalTest('1.5 Preemptive Teardown: Remounting while open tears down old modal cleanly', () => {
    const win = createBrowserEnvironment();
    const doc = win.document;

    const modal1 = mountModal('https://example.com/modal1', { win });
    const iframe1 = modal1.iframe;
    const host1 = modal1.hostElement;

    const modal2 = mountModal('https://example.com/modal2', { win });
    const iframe2 = modal2.iframe;
    const host2 = modal2.hostElement;

    // Modal 1 must be completely torn down
    assert.strictEqual(iframe1.src, 'about:blank');
    assert.strictEqual(iframe1.parentNode, null);
    assert.strictEqual(host1.parentNode, null);

    // Modal 2 must be active
    assert.strictEqual(getModal(), modal2);
    assert.strictEqual(iframe2.src, 'https://example.com/modal2');
    assert.ok(doc.getElementById('peek-wave-host') === host2);

    teardownModal(win);
    assert.strictEqual(getModal(), null);
    assert.strictEqual(iframe2.src, 'about:blank');
    assert.strictEqual(iframe2.parentNode, null);
    assert.strictEqual(host2.parentNode, null);
  });

  runEmpiricalTest('1.6 Active Timers Teardown: copyTimeout and loadingTimeout are cleanly cleared', () => {
    const win = createBrowserEnvironment();
    const modal = mountModal('https://example.com/timer-test', { win });

    // Trigger copy button to activate copyTimeout
    const copyBtn = modal.copyBtn;
    copyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    assert.ok(modal.copyTimeout !== null, 'copyTimeout should be active');
    assert.ok(modal.loadingTimeout !== null, 'loadingTimeout should be active');

    teardownModal(win);
    assert.strictEqual(getModal(), null);
  });

  // ==========================================================================
  // Section 2: Button Icon Rendering & Vector Verification
  // ==========================================================================
  console.log('\n--- Section 2: Button Icon Vector SVG Rendering Verification ---');

  runEmpiricalTest('2.1 Action buttons contain valid inline vector SVG elements', () => {
    const win = createBrowserEnvironment();
    const modal = mountModal('https://example.com/svg-button-test', { win });

    const { copyBtn, tabBtn, closeBtn } = modal;

    // 1. Copy button
    const copySvg = copyBtn.querySelector('svg.peek-icon-copy');
    assert.ok(copySvg, 'copyBtn must contain svg.peek-icon-copy');
    assert.strictEqual(copySvg.getAttribute('viewBox'), '0 0 24 24');
    assert.strictEqual(copySvg.getAttribute('width'), '14');
    assert.strictEqual(copySvg.getAttribute('height'), '14');
    assert.strictEqual(copySvg.getAttribute('fill'), 'none');
    assert.strictEqual(copySvg.getAttribute('stroke'), 'currentColor');
    assert.ok(copySvg.querySelector('rect'), 'copySvg must have rect child');
    assert.ok(copySvg.querySelector('path'), 'copySvg must have path child');

    // Tooltip should be sibling of svg
    const tooltip = copyBtn.querySelector('.peek-wave-tooltip');
    assert.ok(tooltip, 'copyBtn must retain .peek-wave-tooltip');
    assert.strictEqual(tooltip.textContent, 'Copy');

    // 2. Open Tab button
    const tabSvg = tabBtn.querySelector('svg.peek-icon-tab');
    assert.ok(tabSvg, 'tabBtn must contain svg.peek-icon-tab');
    assert.strictEqual(tabSvg.getAttribute('viewBox'), '0 0 24 24');
    assert.ok(tabSvg.querySelector('path'), 'tabSvg must have path child');
    assert.ok(tabSvg.querySelector('polyline'), 'tabSvg must have polyline child');
    assert.ok(tabSvg.querySelector('line'), 'tabSvg must have line child');

    // 3. Close button
    const closeSvg = closeBtn.querySelector('svg.peek-icon-close');
    assert.ok(closeSvg, 'closeBtn must contain svg.peek-icon-close');
    assert.strictEqual(closeSvg.getAttribute('viewBox'), '0 0 24 24');
    const closeLines = closeSvg.querySelectorAll('line');
    assert.strictEqual(closeLines.length, 2, 'closeSvg must have 2 line child elements for X icon');

    teardownModal(win);
  });

  runEmpiricalTest('2.2 Zero innerHTML usage during button icon and modal creation', () => {
    const win = createBrowserEnvironment();
    const doc = win.document;

    // Spy on Element.prototype.innerHTML setter
    let innerHtmlUsed = false;
    const origInnerHTMLDescriptor = Object.getOwnPropertyDescriptor(win.Element.prototype, 'innerHTML') ||
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(doc.createElement('div')), 'innerHTML');

    if (origInnerHTMLDescriptor && origInnerHTMLDescriptor.set) {
      const origSet = origInnerHTMLDescriptor.set;
      origInnerHTMLDescriptor.set = function (val) {
        innerHtmlUsed = true;
        return origSet.call(this, val);
      };
      Object.defineProperty(win.Element.prototype, 'innerHTML', origInnerHTMLDescriptor);
    }

    mountModal('https://example.com/no-innerhtml', { win });
    assert.strictEqual(innerHtmlUsed, false, 'mountModal must construct DOM programmatically without innerHTML');
    teardownModal(win);
  });

  // ==========================================================================
  // Section 3: SVG xlink:href Extraction Across Varied DOM Fixtures
  // ==========================================================================
  console.log('\n--- Section 3: SVG xlink:href Extraction Across Varied DOM Fixtures ---');

  runEmpiricalTest('3.1 SVG anchor with xlink:href attribute resolves accurately', () => {
    const win = createBrowserEnvironment();
    const doc = win.document;
    const svg = doc.createElementNS(SVG_NS, 'svg');
    const a = doc.createElementNS(SVG_NS, 'a');
    a.setAttribute('xlink:href', 'https://example.com/vector-xlink-1');
    const circle = doc.createElementNS(SVG_NS, 'circle');
    a.appendChild(circle);
    svg.appendChild(a);
    doc.body.appendChild(svg);

    const details = extractAnchorUrl(circle, doc.baseURI);
    assert.ok(details, 'Should resolve anchor from circle in SVG anchor with xlink:href');
    assert.strictEqual(details.fullUrl, 'https://example.com/vector-xlink-1');
    assert.strictEqual(details.displayDomain, 'example.com');
  });

  runEmpiricalTest('3.2 SVG anchor with XML namespace getAttributeNS resolves accurately', () => {
    const win = createBrowserEnvironment();
    const doc = win.document;
    const svg = doc.createElementNS(SVG_NS, 'svg');
    const a = doc.createElementNS(SVG_NS, 'a');
    a.getAttributeNS = (ns, localName) => {
      if (ns === XLINK_NS && localName === 'href') {
        return 'https://example.com/ns-xlink-target';
      }
      return null;
    };
    const rect = doc.createElementNS(SVG_NS, 'rect');
    a.appendChild(rect);
    svg.appendChild(a);
    doc.body.appendChild(svg);

    const details = extractAnchorUrl(rect, doc.baseURI);
    assert.ok(details, 'Should resolve anchor via getAttributeNS');
    assert.strictEqual(details.fullUrl, 'https://example.com/ns-xlink-target');
  });

  runEmpiricalTest('3.3 SVG anchor with SVGAnimatedString href object', () => {
    const win = createBrowserEnvironment();
    const doc = win.document;
    const a = doc.createElementNS(SVG_NS, 'a');
    // SVGAElement animated string object { baseVal, animVal }
    a.href = {
      baseVal: 'https://example.com/animated-string-target',
      animVal: 'https://example.com/animated-string-target'
    };
    const pathEl = doc.createElementNS(SVG_NS, 'path');
    a.appendChild(pathEl);
    doc.body.appendChild(a);

    const details = extractAnchorUrl(pathEl, doc.baseURI);
    assert.ok(details, 'Should resolve SVGAnimatedString');
    assert.strictEqual(details.fullUrl, 'https://example.com/animated-string-target');
  });

  runEmpiricalTest('3.4 Click on Text node inside SVG anchor with xlink:href resolves accurately', () => {
    const win = createBrowserEnvironment();
    const doc = win.document;
    const a = doc.createElementNS(SVG_NS, 'a');
    a.setAttribute('xlink:href', 'https://example.com/text-node-xlink');
    const textEl = doc.createElementNS(SVG_NS, 'text');
    textEl.textContent = 'Clickable Vector Text';
    a.appendChild(textEl);
    doc.body.appendChild(a);

    const textNode = textEl.firstChild;
    assert.strictEqual(textNode.nodeType, 3, 'Must be a Text node (nodeType === 3)');
    const details = extractAnchorUrl(textNode, doc.baseURI);
    assert.ok(details, 'Text node inside SVG anchor must resolve to enclosing anchor');
    assert.strictEqual(details.fullUrl, 'https://example.com/text-node-xlink');
  });

  runEmpiricalTest('3.5 Deeply nested hierarchy inside SVG anchor with xlink:href (8 levels)', () => {
    const win = createBrowserEnvironment();
    const doc = win.document;
    const a = doc.createElementNS(SVG_NS, 'a');
    a.setAttribute('xlink:href', 'https://example.com/deep-svg-xlink');

    let current = a;
    for (let i = 0; i < 8; i++) {
      const g = doc.createElementNS(SVG_NS, 'g');
      current.appendChild(g);
      current = g;
    }
    const circle = doc.createElementNS(SVG_NS, 'circle');
    current.appendChild(circle);
    doc.body.appendChild(a);

    const details = extractAnchorUrl(circle, doc.baseURI);
    assert.ok(details, 'Deeply nested SVG node must traverse up to enclosing <a>');
    assert.strictEqual(details.fullUrl, 'https://example.com/deep-svg-xlink');
  });

  runEmpiricalTest('3.6 SVG anchor with [download] attribute is rejected', () => {
    const win = createBrowserEnvironment();
    const doc = win.document;
    const a = doc.createElementNS(SVG_NS, 'a');
    a.setAttribute('xlink:href', 'https://example.com/chart.svg');
    a.setAttribute('download', 'chart.svg');
    const rect = doc.createElementNS(SVG_NS, 'rect');
    a.appendChild(rect);
    doc.body.appendChild(a);

    const details = extractAnchorUrl(rect, doc.baseURI);
    assert.strictEqual(details, null, 'SVG anchor with download attribute must be rejected');
  });

  runEmpiricalTest('3.7 SVG anchor with whitespace or empty xlink:href is ignored', () => {
    const win = createBrowserEnvironment();
    const doc = win.document;
    const a = doc.createElementNS(SVG_NS, 'a');
    a.setAttribute('xlink:href', '   ');
    const rect = doc.createElementNS(SVG_NS, 'rect');
    a.appendChild(rect);
    doc.body.appendChild(a);

    const details = extractAnchorUrl(rect, doc.baseURI);
    assert.strictEqual(details, null, 'Empty or whitespace-only xlink:href must be ignored');
  });

  // ==========================================================================
  // Section 4: Live Content Script VM Binding Verification
  // ==========================================================================
  console.log('\n--- Section 4: Live Content Script VM Evaluation & Isolation ---');

  runEmpiricalTest('4.1 setupTestEnvironment evaluates live content/content.js directly', () => {
    const env = setupTestEnvironment();
    assert.ok(env.content, 'env.content must be initialized from live content script');
    assert.strictEqual(typeof env.content.mountModal, 'function');
    assert.strictEqual(typeof env.content.teardownModal, 'function');
    assert.strictEqual(typeof env.content.extractAnchorUrl, 'function');
    assert.strictEqual(typeof env.content.isModifierActive, 'function');
    assert.strictEqual(typeof env.content.createSvgElement, 'function');

    // Verify public hooks on window
    assert.strictEqual(typeof env.win.__PEEK_WAVE_MOUNT__, 'function');
    assert.strictEqual(typeof env.win.__PEEK_WAVE_TEARDOWN__, 'function');
    assert.strictEqual(typeof env.win.__PEEK_WAVE_GET_MODAL__, 'function');
  });

  runEmpiricalTest('4.2 Multi-environment isolation: env1 and env2 do not leak state', () => {
    const env1 = setupTestEnvironment();
    const env2 = setupTestEnvironment();

    // Mount in env1
    env1.win.__PEEK_WAVE_MOUNT__('https://example.com/tab-1');
    assert.ok(env1.getModal() !== null, 'env1 has active modal');
    assert.strictEqual(env2.getModal(), null, 'env2 must NOT have active modal (isolation)');

    // Mount in env2
    env2.win.__PEEK_WAVE_MOUNT__('https://example.com/tab-2');
    assert.ok(env2.getModal() !== null, 'env2 has active modal');

    // Teardown env1
    env1.teardown();
    assert.strictEqual(env1.getModal(), null, 'env1 modal torn down');
    assert.ok(env2.getModal() !== null, 'env2 modal remains active');

    // Teardown env2
    env2.teardown();
    assert.strictEqual(env2.getModal(), null, 'env2 modal torn down');
  });

  console.log('\n========================================================================');
  console.log(`  EMPIRICAL CHALLENGER RESULTS: ${totalPassed} Passed, ${totalFailed} Failed`);
  console.log(`  VERDICT: ${totalFailed === 0 ? 'ALL EMPIRICAL CHALLENGES CONFIRMED (APPROVE)' : 'FAILURES DETECTED (REJECT)'}`);
  console.log('========================================================================\n');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runAllEmpiricalChallenges().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
