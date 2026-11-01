/**
 * m2_remediation_adversarial.test.js
 * 
 * Empirical Adversarial Challenger Test Suite for Milestone M2 Remediation:
 * 1. SVG Anchor Resolution (Deep hierarchies, text nodes in SVG text/tspan, xlink:href,
 *    XML namespaces, animated strings, SVG download attribute rejection).
 * 2. Button Vector Icons (DOM structure of copyBtn, tabBtn, closeBtn, createElementNS
 *    usage, tooltip interaction, copy click handling).
 * 3. Modifier Key Logic (16-combination truth tables, Ctrl+Shift, Alt+Click, Command on
 *    Mac, case sensitivity & aliases, mouse button filters).
 * 4. Live Content Script Test Harness (Direct execution of content/content.js, sandbox
 *    isolation between separate calls to setupTestEnvironment, fallback resilience).
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const { setupTestEnvironment, loadLiveContentScript } = require('../harness/extension_loader');
const contentModule = require('../../content/content');

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

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

async function runAsyncTest(testName, fn) {
  totalTests++;
  try {
    await fn();
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

async function runM2RemediationAdversarialTests() {
  console.log('\n========================================================================');
  console.log('   CHALLENGER TEST SUITE: M2 REMEDIATION EMPIRICAL ADVERSARIAL STRESS   ');
  console.log('========================================================================\n');

  // ==========================================================================
  // SECTION 1: SVG Anchor Resolution & Deep Traversal
  // ==========================================================================
  console.log('--- Section 1: SVG Anchor Resolution & Deep Traversal ---');

  runTest('1.1: Deep SVG hierarchy with nested g, text, and tspan text node target', () => {
    const env = setupTestEnvironment();
    const doc = env.doc;
    doc.baseURI = 'https://mysite.org/base/';

    const svg = doc.createElementNS(SVG_NS, 'svg');
    const g1 = doc.createElementNS(SVG_NS, 'g');
    const g2 = doc.createElementNS(SVG_NS, 'g');
    const svgAnchor = doc.createElementNS(SVG_NS, 'a');
    svgAnchor.setAttribute('xlink:href', 'https://example.com/deep-svg');

    const g3 = doc.createElementNS(SVG_NS, 'g');
    const textEl = doc.createElementNS(SVG_NS, 'text');
    const tspan = doc.createElementNS(SVG_NS, 'tspan');
    tspan.textContent = 'Deep SVG Link Text';

    textEl.appendChild(tspan);
    g3.appendChild(textEl);
    svgAnchor.appendChild(g3);
    g2.appendChild(svgAnchor);
    g1.appendChild(g2);
    svg.appendChild(g1);
    doc.body.appendChild(svg);

    // Click on the leaf Text node (nodeType === 3) inside tspan
    const leafTextNode = tspan.firstChild;
    assert.strictEqual(leafTextNode.nodeType, 3, 'Target must be a Text node');

    const result = contentModule.extractAnchorUrl(leafTextNode, doc.baseURI);
    assert.ok(result !== null, 'Should resolve deep SVG anchor from Text node');
    assert.strictEqual(result.fullUrl, 'https://example.com/deep-svg');
    assert.strictEqual(result.displayDomain, 'example.com');
  });

  runTest('1.2: Text node inside SVG text element directly resolves anchor', () => {
    const env = setupTestEnvironment();
    const doc = env.doc;

    const svg = doc.createElementNS(SVG_NS, 'svg');
    const svgAnchor = doc.createElementNS(SVG_NS, 'a');
    svgAnchor.setAttribute('xlink:href', 'https://example.com/svg-direct-text');
    const textEl = doc.createElementNS(SVG_NS, 'text');
    textEl.textContent = 'Clickable Vector Text';

    svgAnchor.appendChild(textEl);
    svg.appendChild(svgAnchor);
    doc.body.appendChild(svg);

    const textNode = textEl.firstChild;
    const result = contentModule.extractAnchorUrl(textNode, doc.baseURI);
    assert.ok(result !== null);
    assert.strictEqual(result.fullUrl, 'https://example.com/svg-direct-text');
  });

  runTest('1.3: xlink:href attribute without standard href resolves relative URL against baseURI', () => {
    const env = setupTestEnvironment();
    const doc = env.doc;
    doc.baseURI = 'https://mysite.com/gallery/';

    const svgAnchor = doc.createElementNS(SVG_NS, 'a');
    svgAnchor.setAttribute('xlink:href', 'photo.html');
    const rect = doc.createElementNS(SVG_NS, 'rect');
    svgAnchor.appendChild(rect);
    doc.body.appendChild(svgAnchor);

    const result = contentModule.extractAnchorUrl(rect, doc.baseURI);
    assert.ok(result !== null);
    assert.strictEqual(result.fullUrl, 'https://mysite.com/gallery/photo.html');
  });

  runTest('1.4: Standard href attribute without xlink:href resolves in SVG anchor', () => {
    const env = setupTestEnvironment();
    const doc = env.doc;

    const svgAnchor = doc.createElementNS(SVG_NS, 'a');
    svgAnchor.setAttribute('href', 'https://example.com/standard-svg-href');
    const circle = doc.createElementNS(SVG_NS, 'circle');
    svgAnchor.appendChild(circle);
    doc.body.appendChild(svgAnchor);

    const result = contentModule.extractAnchorUrl(circle, doc.baseURI);
    assert.ok(result !== null);
    assert.strictEqual(result.fullUrl, 'https://example.com/standard-svg-href');
  });

  runTest('1.5: Dual href and xlink:href attributes handle without collision or crash', () => {
    const env = setupTestEnvironment();
    const doc = env.doc;

    const svgAnchor = doc.createElementNS(SVG_NS, 'a');
    svgAnchor.setAttribute('href', 'https://example.com/primary');
    svgAnchor.setAttribute('xlink:href', 'https://example.com/fallback');
    const pathEl = doc.createElementNS(SVG_NS, 'path');
    svgAnchor.appendChild(pathEl);
    doc.body.appendChild(svgAnchor);

    const result = contentModule.extractAnchorUrl(pathEl, doc.baseURI);
    assert.ok(result !== null);
    assert.ok(result.fullUrl.startsWith('https://example.com/'));
  });

  runTest('1.6: XML namespace getAttributeNS(XLINK_NS, "href") resolution', () => {
    const env = setupTestEnvironment();
    const doc = env.doc;

    const svgAnchor = doc.createElementNS(SVG_NS, 'a');
    // Implement getAttributeNS mock on this anchor
    svgAnchor.getAttributeNS = (ns, localName) => {
      if (ns === XLINK_NS && localName === 'href') {
        return 'https://example.com/from-ns-href';
      }
      return null;
    };
    const circle = doc.createElementNS(SVG_NS, 'circle');
    svgAnchor.appendChild(circle);
    doc.body.appendChild(svgAnchor);

    const result = contentModule.extractAnchorUrl(circle, doc.baseURI);
    assert.ok(result !== null);
    assert.strictEqual(result.fullUrl, 'https://example.com/from-ns-href');
  });

  runTest('1.7: XML namespace getAttributeNS(XLINK_NS, "xlink:href") resolution', () => {
    const env = setupTestEnvironment();
    const doc = env.doc;

    const svgAnchor = doc.createElementNS(SVG_NS, 'a');
    svgAnchor.getAttributeNS = (ns, localName) => {
      if (ns === XLINK_NS && localName === 'xlink:href') {
        return 'https://example.com/from-ns-xlink-href';
      }
      return null;
    };
    const circle = doc.createElementNS(SVG_NS, 'circle');
    svgAnchor.appendChild(circle);
    doc.body.appendChild(svgAnchor);

    const result = contentModule.extractAnchorUrl(circle, doc.baseURI);
    assert.ok(result !== null);
    assert.strictEqual(result.fullUrl, 'https://example.com/from-ns-xlink-href');
  });

  runTest('1.8: SVG download attribute strictly rejected (empty download attr)', () => {
    const env = setupTestEnvironment();
    const doc = env.doc;

    const svgAnchor = doc.createElementNS(SVG_NS, 'a');
    svgAnchor.setAttribute('xlink:href', 'https://example.com/chart.svg');
    svgAnchor.setAttribute('download', '');
    const rect = doc.createElementNS(SVG_NS, 'rect');
    svgAnchor.appendChild(rect);
    doc.body.appendChild(svgAnchor);

    const result = contentModule.extractAnchorUrl(rect, doc.baseURI);
    assert.strictEqual(result, null, 'SVG download links must be rejected from modal interception');
  });

  runTest('1.9: SVG download attribute with filename strictly rejected', () => {
    const env = setupTestEnvironment();
    const doc = env.doc;

    const svgAnchor = doc.createElementNS(SVG_NS, 'a');
    svgAnchor.setAttribute('href', 'https://example.com/report.pdf');
    svgAnchor.setAttribute('download', 'annual_report.pdf');
    const pathEl = doc.createElementNS(SVG_NS, 'path');
    svgAnchor.appendChild(pathEl);
    doc.body.appendChild(svgAnchor);

    const result = contentModule.extractAnchorUrl(pathEl, doc.baseURI);
    assert.strictEqual(result, null, 'Named download links must be rejected');
  });

  runTest('1.10: Deep text node inside SVG a[download] strictly rejected', () => {
    const env = setupTestEnvironment();
    const doc = env.doc;

    const svgAnchor = doc.createElementNS(SVG_NS, 'a');
    svgAnchor.setAttribute('xlink:href', 'https://example.com/export.csv');
    svgAnchor.setAttribute('download', 'true');
    const textEl = doc.createElementNS(SVG_NS, 'text');
    textEl.textContent = 'Download CSV';
    svgAnchor.appendChild(textEl);
    doc.body.appendChild(svgAnchor);

    const textNode = textEl.firstChild;
    const result = contentModule.extractAnchorUrl(textNode, doc.baseURI);
    assert.strictEqual(result, null, 'Deep text node inside download link must reject');
  });

  runTest('1.11: SVGAElement SVGAnimatedString baseVal extraction', () => {
    const env = setupTestEnvironment();
    const doc = env.doc;

    const svgAnchor = doc.createElementNS(SVG_NS, 'a');
    svgAnchor.href = {
      baseVal: 'https://example.com/base-val-link',
      animVal: 'https://example.com/anim-val-link'
    };
    const circle = doc.createElementNS(SVG_NS, 'circle');
    svgAnchor.appendChild(circle);
    doc.body.appendChild(svgAnchor);

    const result = contentModule.extractAnchorUrl(circle, doc.baseURI);
    assert.ok(result !== null);
    assert.strictEqual(result.fullUrl, 'https://example.com/base-val-link');
  });

  runTest('1.12: SVGAElement SVGAnimatedString empty baseVal falls back to animVal', () => {
    const env = setupTestEnvironment();
    const doc = env.doc;

    const svgAnchor = doc.createElementNS(SVG_NS, 'a');
    Object.defineProperty(svgAnchor, 'href', {
      value: {
        baseVal: '',
        animVal: 'https://example.com/anim-fallback-link'
      },
      configurable: true
    });
    const circle = doc.createElementNS(SVG_NS, 'circle');
    svgAnchor.appendChild(circle);
    doc.body.appendChild(svgAnchor);

    const result = contentModule.extractAnchorUrl(circle, doc.baseURI);
    assert.ok(result !== null);
    assert.strictEqual(result.fullUrl, 'https://example.com/anim-fallback-link');
  });

  runTest('1.13: SVGAElement with whitespace-only baseVal and animVal returns null', () => {
    const env = setupTestEnvironment();
    const doc = env.doc;

    const svgAnchor = doc.createElementNS(SVG_NS, 'a');
    svgAnchor.href = {
      baseVal: '   ',
      animVal: '   '
    };
    const circle = doc.createElementNS(SVG_NS, 'circle');
    svgAnchor.appendChild(circle);
    doc.body.appendChild(svgAnchor);

    const result = contentModule.extractAnchorUrl(circle, doc.baseURI);
    assert.strictEqual(result, null);
  });

  runTest('1.14: Inert SVG anchor without href wrapped in outer HTML anchor bubbles upward', () => {
    const env = setupTestEnvironment();
    const doc = env.doc;

    const outerHtmlAnchor = doc.createElement('a');
    outerHtmlAnchor.href = 'https://example.com/outer-target';

    const svg = doc.createElementNS(SVG_NS, 'svg');
    const innerInertSvgAnchor = doc.createElementNS(SVG_NS, 'a'); // no href/xlink:href
    const circle = doc.createElementNS(SVG_NS, 'circle');

    innerInertSvgAnchor.appendChild(circle);
    svg.appendChild(innerInertSvgAnchor);
    outerHtmlAnchor.appendChild(svg);
    doc.body.appendChild(outerHtmlAnchor);

    const result = contentModule.extractAnchorUrl(circle, doc.baseURI);
    assert.ok(result !== null);
    assert.strictEqual(result.fullUrl, 'https://example.com/outer-target');
  });

  runTest('1.15: Adversarial malformed inputs to extractAnchorUrl return null cleanly', () => {
    assert.strictEqual(contentModule.extractAnchorUrl(null), null);
    assert.strictEqual(contentModule.extractAnchorUrl(undefined), null);
    assert.strictEqual(contentModule.extractAnchorUrl('string'), null);
    assert.strictEqual(contentModule.extractAnchorUrl(42), null);
    assert.strictEqual(contentModule.extractAnchorUrl({}), null);
    assert.strictEqual(contentModule.extractAnchorUrl({ nodeType: 1 }), null);
  });


  // ==========================================================================
  // SECTION 2: Button Vector Icons & Tooltip UX
  // ==========================================================================
  console.log('\n--- Section 2: Button Vector Icons & Tooltip UX ---');

  runTest('2.1: Header action buttons exist in Shadow DOM after mount', () => {
    const env = setupTestEnvironment();
    const modalRecord = env.content.mountModal('https://example.com/test-modal', { win: env.win });
    assert.ok(modalRecord !== null, 'Modal should mount');

    const actions = modalRecord.shadowRoot.querySelector('.peek-wave-header-actions');
    assert.ok(actions !== null, 'Actions container must exist');

    const buttons = actions.querySelectorAll('button');
    assert.strictEqual(buttons.length, 3, 'Must have exactly 3 action buttons');
    env.teardown();
  });

  runTest('2.2: copyBtn DOM structure: button, SVG icon, and tooltip element', () => {
    const env = setupTestEnvironment();
    const modal = env.content.mountModal('https://example.com/test-copy', { win: env.win });

    const copyBtn = modal.copyBtn;
    assert.ok(copyBtn !== null);
    assert.strictEqual(copyBtn.tagName, 'BUTTON');
    assert.ok(copyBtn.classList.contains('peek-wave-btn-copy'));
    assert.strictEqual(copyBtn.getAttribute('aria-label'), 'Copy Link');

    const svg = copyBtn.querySelector('svg.peek-icon-copy');
    assert.ok(svg !== null, 'copyBtn must contain svg.peek-icon-copy');
    assert.strictEqual(svg.getAttribute('viewBox'), '0 0 24 24');

    const rect = svg.querySelector('rect');
    assert.ok(rect !== null, 'copy SVG must contain rect');
    assert.strictEqual(rect.getAttribute('width'), '13');

    const pathEl = svg.querySelector('path');
    assert.ok(pathEl !== null, 'copy SVG must contain path');

    const tooltip = copyBtn.querySelector('.peek-wave-tooltip');
    assert.ok(tooltip !== null, 'copyBtn must contain .peek-wave-tooltip');
    assert.strictEqual(tooltip.textContent, 'Copy');
    env.teardown();
  });

  runTest('2.3: tabBtn DOM structure: button and SVG tab icon', () => {
    const env = setupTestEnvironment();
    const modal = env.content.mountModal('https://example.com/test-tab', { win: env.win });

    const tabBtn = modal.tabBtn;
    assert.ok(tabBtn !== null);
    assert.strictEqual(tabBtn.tagName, 'BUTTON');
    assert.ok(tabBtn.classList.contains('peek-wave-btn-tab'));
    assert.strictEqual(tabBtn.getAttribute('aria-label'), 'Open in New Tab');

    const svg = tabBtn.querySelector('svg.peek-icon-tab');
    assert.ok(svg !== null, 'tabBtn must contain svg.peek-icon-tab');
    assert.strictEqual(svg.getAttribute('viewBox'), '0 0 24 24');

    const pathEl = svg.querySelector('path');
    assert.ok(pathEl !== null, 'tab SVG must contain path');
    const polyline = svg.querySelector('polyline');
    assert.ok(polyline !== null, 'tab SVG must contain polyline');
    const line = svg.querySelector('line');
    assert.ok(line !== null, 'tab SVG must contain line');
    env.teardown();
  });

  runTest('2.4: closeBtn DOM structure: button and SVG close cross icon', () => {
    const env = setupTestEnvironment();
    const modal = env.content.mountModal('https://example.com/test-close', { win: env.win });

    const closeBtn = modal.closeBtn;
    assert.ok(closeBtn !== null);
    assert.strictEqual(closeBtn.tagName, 'BUTTON');
    assert.ok(closeBtn.classList.contains('peek-wave-btn-close'));
    assert.strictEqual(closeBtn.getAttribute('aria-label'), 'Close');

    const svg = closeBtn.querySelector('svg.peek-icon-close');
    assert.ok(svg !== null, 'closeBtn must contain svg.peek-icon-close');
    assert.strictEqual(svg.getAttribute('viewBox'), '0 0 24 24');

    const lines = svg.querySelectorAll('line');
    assert.strictEqual(lines.length, 2, 'close SVG must contain 2 line elements forming cross');
    env.teardown();
  });

  runTest('2.5: createElementNS usage verified via spy during modal mount', () => {
    const env = setupTestEnvironment();
    const createdNamespaces = [];
    const origCreateElementNS = env.doc.createElementNS.bind(env.doc);

    env.doc.createElementNS = (ns, tag) => {
      createdNamespaces.push({ ns, tag });
      return origCreateElementNS(ns, tag);
    };

    const modal = env.content.mountModal('https://example.com/test-spy', { win: env.win });
    assert.ok(modal !== null);

    // Verify createElementNS was invoked with SVG_NS for SVG elements
    const svgCreations = createdNamespaces.filter(entry => entry.ns === SVG_NS);
    assert.ok(svgCreations.length >= 8, `Expected at least 8 SVG elements created via SVG_NS, got ${svgCreations.length}`);
    assert.ok(svgCreations.some(c => c.tag.toLowerCase() === 'svg'));
    assert.ok(svgCreations.some(c => c.tag.toLowerCase() === 'rect'));
    assert.ok(svgCreations.some(c => c.tag.toLowerCase() === 'path'));
    assert.ok(svgCreations.some(c => c.tag.toLowerCase() === 'line'));

    env.teardown();
  });

  runTest('2.6: Copy button click triggers clipboard write and active tooltip feedback', () => {
    const env = setupTestEnvironment();
    const targetUrl = 'https://example.com/copy-target-url';
    const modal = env.content.mountModal(targetUrl, { win: env.win });

    const copyBtn = modal.copyBtn;
    const tooltip = modal.copyTooltip;

    assert.strictEqual(tooltip.textContent, 'Copy');
    assert.strictEqual(tooltip.classList.contains('active'), false);

    // Click copyBtn
    const evt = new env.win.MouseEvent('click', { bubbles: true, cancelable: true });
    copyBtn.dispatchEvent(evt);

    assert.strictEqual(tooltip.textContent, 'Copied!');
    assert.strictEqual(tooltip.classList.contains('active'), true);
    assert.strictEqual(env.win._clipboardText, targetUrl);

    // Modal should NOT be closed by clicking copy button
    assert.ok(env.getModal() !== null);
    env.teardown();
  });

  runTest('2.7: Rapid consecutive clicks on copy button clear old timers and remain active', () => {
    const env = setupTestEnvironment();
    const modal = env.content.mountModal('https://example.com/rapid-copy', { win: env.win });

    const copyBtn = modal.copyBtn;
    const tooltip = modal.copyTooltip;

    for (let i = 0; i < 5; i++) {
      const evt = new env.win.MouseEvent('click', { bubbles: true, cancelable: true });
      copyBtn.dispatchEvent(evt);
    }

    assert.strictEqual(tooltip.textContent, 'Copied!');
    assert.strictEqual(tooltip.classList.contains('active'), true);
    assert.ok(modal.copyTimeout !== null);
    env.teardown();
  });

  await runAsyncTest('2.8: Tooltip reverts from "Copied!" back to "Copy" after timeout', async () => {
    const env = setupTestEnvironment();
    const modal = env.content.mountModal('https://example.com/timeout-copy', { win: env.win });

    const copyBtn = modal.copyBtn;
    const tooltip = modal.copyTooltip;

    const evt = new env.win.MouseEvent('click', { bubbles: true, cancelable: true });
    copyBtn.dispatchEvent(evt);
    assert.strictEqual(tooltip.textContent, 'Copied!');

    // Wait for the 1500ms timeout
    await new Promise(resolve => setTimeout(resolve, 1600));

    assert.strictEqual(tooltip.textContent, 'Copy');
    assert.strictEqual(tooltip.classList.contains('active'), false);
    env.teardown();
  });

  runTest('2.9: tabBtn click sends OPEN_TAB runtime message and tears down modal', () => {
    const env = setupTestEnvironment();
    const targetUrl = 'https://example.com/tab-target';
    const modal = env.content.mountModal(targetUrl, { win: env.win });

    let sentMessage = null;
    env.chrome.runtime.sendMessage = (msg) => {
      sentMessage = msg;
    };

    const tabBtn = modal.tabBtn;
    const evt = new env.win.MouseEvent('click', { bubbles: true, cancelable: true });
    tabBtn.dispatchEvent(evt);

    assert.ok(sentMessage !== null);
    assert.strictEqual(sentMessage.action, 'OPEN_TAB');
    assert.strictEqual(sentMessage.url, targetUrl);
    assert.strictEqual(env.getModal(), null, 'Modal must be torn down on tab handoff');
  });

  runTest('2.10: closeBtn click tears down modal immediately', () => {
    const env = setupTestEnvironment();
    const modal = env.content.mountModal('https://example.com/close-target', { win: env.win });

    const closeBtn = modal.closeBtn;
    const evt = new env.win.MouseEvent('click', { bubbles: true, cancelable: true });
    closeBtn.dispatchEvent(evt);

    assert.strictEqual(env.getModal(), null, 'Modal must be torn down on close button click');
  });


  // ==========================================================================
  // SECTION 3: Modifier Key Logic & Strict Exclusivity Stress
  // ==========================================================================
  console.log('\n--- Section 3: Modifier Key Logic & Strict Exclusivity Stress ---');

  runTest('3.1: normalizeModifierKey handles cases, aliases, and composite strings', () => {
    const fn = contentModule.normalizeModifierKey;

    // Shift variants
    assert.strictEqual(fn('shift'), 'shift');
    assert.strictEqual(fn('Shift'), 'shift');
    assert.strictEqual(fn('SHIFT'), 'shift');
    assert.strictEqual(fn('  sHifT  '), 'shift');

    // Alt / Option variants
    assert.strictEqual(fn('alt'), 'alt');
    assert.strictEqual(fn('Alt'), 'alt');
    assert.strictEqual(fn('ALT'), 'alt');
    assert.strictEqual(fn('Option'), 'alt');
    assert.strictEqual(fn('OPTION'), 'alt');

    // Ctrl / Cmd variants
    assert.strictEqual(fn('ctrl'), 'ctrl_cmd');
    assert.strictEqual(fn('Ctrl'), 'ctrl_cmd');
    assert.strictEqual(fn('cmd'), 'ctrl_cmd');
    assert.strictEqual(fn('Cmd'), 'ctrl_cmd');
    assert.strictEqual(fn('control'), 'ctrl_cmd');
    assert.strictEqual(fn('Control'), 'ctrl_cmd');
    assert.strictEqual(fn('command'), 'ctrl_cmd');
    assert.strictEqual(fn('Command'), 'ctrl_cmd');
    assert.strictEqual(fn('Ctrl/Cmd'), 'ctrl_cmd');
    assert.strictEqual(fn('Ctrl/Cmd + Click'), 'ctrl_cmd');
    assert.strictEqual(fn('ctrl_cmd'), 'ctrl_cmd');

    // Fallbacks
    assert.strictEqual(fn(''), 'shift');
    assert.strictEqual(fn('   '), 'shift');
    assert.strictEqual(fn(null), 'shift');
    assert.strictEqual(fn(undefined), 'shift');
    assert.strictEqual(fn(123), 'shift');
  });

  runTest('3.2: 16-combination truth table for configuredModifier="Shift"', () => {
    const isMod = contentModule.isModifierActive;

    // Test all 2^4 = 16 combinations of (shiftKey, altKey, ctrlKey, metaKey)
    for (let shift = 0; shift <= 1; shift++) {
      for (let alt = 0; alt <= 1; alt++) {
        for (let ctrl = 0; ctrl <= 1; ctrl++) {
          for (let meta = 0; meta <= 1; meta++) {
            const e = {
              shiftKey: Boolean(shift),
              altKey: Boolean(alt),
              ctrlKey: Boolean(ctrl),
              metaKey: Boolean(meta)
            };
            const result = isMod(e, 'Shift');
            const expected = (shift === 1 && alt === 0 && ctrl === 0 && meta === 0);
            assert.strictEqual(
              result,
              expected,
              `Shift mode failed on combo: shift=${shift}, alt=${alt}, ctrl=${ctrl}, meta=${meta}`
            );
          }
        }
      }
    }
  });

  runTest('3.3: 16-combination truth table for configuredModifier="Alt"', () => {
    const isMod = contentModule.isModifierActive;

    for (let shift = 0; shift <= 1; shift++) {
      for (let alt = 0; alt <= 1; alt++) {
        for (let ctrl = 0; ctrl <= 1; ctrl++) {
          for (let meta = 0; meta <= 1; meta++) {
            const e = {
              shiftKey: Boolean(shift),
              altKey: Boolean(alt),
              ctrlKey: Boolean(ctrl),
              metaKey: Boolean(meta)
            };
            const result = isMod(e, 'Alt');
            const expected = (shift === 0 && alt === 1 && ctrl === 0 && meta === 0);
            assert.strictEqual(
              result,
              expected,
              `Alt mode failed on combo: shift=${shift}, alt=${alt}, ctrl=${ctrl}, meta=${meta}`
            );
          }
        }
      }
    }
  });

  runTest('3.4: 16-combination truth table for configuredModifier="Ctrl/Cmd"', () => {
    const isMod = contentModule.isModifierActive;

    for (let shift = 0; shift <= 1; shift++) {
      for (let alt = 0; alt <= 1; alt++) {
        for (let ctrl = 0; ctrl <= 1; ctrl++) {
          for (let meta = 0; meta <= 1; meta++) {
            const e = {
              shiftKey: Boolean(shift),
              altKey: Boolean(alt),
              ctrlKey: Boolean(ctrl),
              metaKey: Boolean(meta)
            };
            const result = isMod(e, 'Ctrl/Cmd');
            // Must strictly reject if shift or alt is held
            if (shift === 1 || alt === 1) {
              assert.strictEqual(result, false, `Ctrl/Cmd must reject combo with shift/alt: shift=${shift}, alt=${alt}`);
            } else if (ctrl === 1 || meta === 1) {
              assert.strictEqual(result, true, `Ctrl/Cmd must accept ctrl or meta alone: ctrl=${ctrl}, meta=${meta}`);
            } else {
              assert.strictEqual(result, false, 'No modifier must return false');
            }
          }
        }
      }
    }
  });

  runTest('3.5: Mouse button filter: middle (1) and right (2) clicks strictly rejected', () => {
    const env = setupTestEnvironment();
    const doc = env.doc;

    const link = doc.createElement('a');
    link.href = 'https://example.com/button-filter';
    doc.body.appendChild(link);

    // Button 1 (middle click) with Shift
    const middleClick = new env.win.MouseEvent('click', { bubbles: true, cancelable: true, button: 1, shiftKey: true });
    link.dispatchEvent(middleClick);
    assert.strictEqual(middleClick.defaultPrevented, false, 'Middle click must NOT be prevented');
    assert.strictEqual(env.getModal(), null, 'Middle click must NOT open modal');

    // Button 2 (right click) with Shift
    const rightClick = new env.win.MouseEvent('click', { bubbles: true, cancelable: true, button: 2, shiftKey: true });
    link.dispatchEvent(rightClick);
    assert.strictEqual(rightClick.defaultPrevented, false, 'Right click must NOT be prevented');
    assert.strictEqual(env.getModal(), null, 'Right click must NOT open modal');

    // Button 0 (left click) with Shift
    const leftClick = new env.win.MouseEvent('click', { bubbles: true, cancelable: true, button: 0, shiftKey: true });
    link.dispatchEvent(leftClick);
    assert.strictEqual(leftClick.defaultPrevented, true, 'Left click with Shift must be prevented');
    assert.ok(env.getModal() !== null, 'Left click with Shift must open modal');

    env.teardown();
  });


  // ==========================================================================
  // SECTION 4: Live Content Script Test Harness & Sandbox Isolation
  // ==========================================================================
  console.log('\n--- Section 4: Live Content Script Test Harness & Sandbox Isolation ---');

  runTest('4.1: Direct execution of content/content.js verified in loadLiveContentScript', () => {
    const env = setupTestEnvironment();
    assert.ok(env.content !== null, 'content object must be returned');
    assert.strictEqual(typeof env.content.mountModal, 'function');
    assert.strictEqual(typeof env.content.teardownModal, 'function');
    assert.strictEqual(typeof env.content.isModifierActive, 'function');
    assert.strictEqual(typeof env.content.extractAnchorUrl, 'function');
    assert.strictEqual(typeof env.content.normalizeModifierKey, 'function');
  });

  runTest('4.2: Sandbox isolation between two independent environments (envA & envB)', () => {
    const envA = setupTestEnvironment({ initialSettings: { modifierKey: 'alt', sizePreset: 'compact', modalSize: 'compact' } });
    const envB = setupTestEnvironment({ initialSettings: { modifierKey: 'shift', sizePreset: 'large', modalSize: 'large' } });

    assert.strictEqual(envA.engine.getSettings().modifierKey, 'alt');
    assert.strictEqual(envB.engine.getSettings().modifierKey, 'shift');
    assert.strictEqual(envA.engine.getSettings().sizePreset, 'compact');
    assert.strictEqual(envB.engine.getSettings().sizePreset, 'large');
  });

  runTest('4.3: Mutation in envA settings does not leak or contaminate envB', () => {
    const envA = setupTestEnvironment({ initialSettings: { modifierKey: 'alt' } });
    const envB = setupTestEnvironment({ initialSettings: { modifierKey: 'shift' } });

    envA.engine.setSettings({ modifierKey: 'ctrl_cmd' });

    assert.strictEqual(envA.engine.getSettings().modifierKey, 'ctrl_cmd');
    assert.strictEqual(envB.engine.getSettings().modifierKey, 'shift', 'envB must retain its own modifierKey');
  });

  runTest('4.4: Modal mount in envA does not leak to envB', () => {
    const envA = setupTestEnvironment();
    const envB = setupTestEnvironment();

    envA.content.mountModal('https://example.com/envA-site', { win: envA.win });

    assert.ok(envA.getModal() !== null, 'envA modal must be mounted');
    assert.strictEqual(envA.getModal().iframe.src, 'https://example.com/envA-site');
    assert.strictEqual(envB.getModal(), null, 'envB modal must remain null');
    assert.ok(envA.doc.querySelector('#peek-wave-host') !== null);
    assert.strictEqual(envB.doc.querySelector('#peek-wave-host'), null);

    envA.teardown();
  });

  runTest('4.5: Teardown in envA does not affect active modal in envB', () => {
    const envA = setupTestEnvironment();
    const envB = setupTestEnvironment();

    envA.content.mountModal('https://example.com/envA-site', { win: envA.win });
    envB.content.mountModal('https://example.com/envB-site', { win: envB.win });

    assert.ok(envA.getModal() !== null);
    assert.ok(envB.getModal() !== null);

    envA.teardown();

    assert.strictEqual(envA.getModal(), null, 'envA must be torn down');
    assert.ok(envB.getModal() !== null, 'envB must still be active');
    assert.strictEqual(envB.getModal().iframe.src, 'https://example.com/envB-site');

    envB.teardown();
    assert.strictEqual(envB.getModal(), null);
  });

  runTest('4.6: loadLiveContentScript fallback closure execution resilience', () => {
    // Test the fallback mechanism when VM throws or is bypassed
    const code = fs.readFileSync(path.resolve(__dirname, '../../content/content.js'), 'utf8');
    const { createBrowserEnvironment } = require('../harness/dom_simulator');
    const { createChromeMock } = require('../harness/chrome_mock');

    const win = createBrowserEnvironment();
    const chrome = createChromeMock();
    const mod = { exports: {} };

    const factory = new Function(
      'window', 'document', 'chrome', 'location', 'navigator', 'module', 'exports',
      'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'URL', 'console',
      code
    );

    factory(
      win, win.document, chrome, win.location, win.navigator, mod, mod.exports,
      (fn, ms, ...args) => win.setTimeout(fn, ms, ...args),
      (id) => win.clearTimeout(id),
      (fn, ms, ...args) => win.setInterval(fn, ms, ...args),
      (id) => win.clearInterval(id),
      global.URL, console
    );

    assert.strictEqual(typeof mod.exports.mountModal, 'function');
    assert.strictEqual(typeof mod.exports.isModifierActive, 'function');
    assert.strictEqual(typeof mod.exports.extractAnchorUrl, 'function');
  });

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log('\n========================================================================');
  console.log('              M2 REMEDIATION ADVERSARIAL VERIFICATION SUMMARY           ');
  console.log('========================================================================');
  console.log(`- TOTAL TESTS EXECUTED: ${totalTests}`);
  console.log(`- PASSED:               ${passedTests}`);
  console.log(`- FAILED:               ${failedTests}`);
  console.log(`- OVERALL VERDICT:      ${failedTests === 0 ? 'ALL ADVERSARIAL TESTS PASSED (APPROVE)' : 'FAILURES DETECTED (REJECT)'}`);
  console.log('========================================================================\n');

  return { total: totalTests, passed: passedTests, failed: failedTests };
}

if (require.main === module) {
  runM2RemediationAdversarialTests().then(res => {
    process.exit(res.failed > 0 ? 1 : 0);
  });
}

module.exports = { runM2RemediationAdversarialTests };
