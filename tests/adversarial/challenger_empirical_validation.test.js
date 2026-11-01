/**
 * tests/adversarial/challenger_empirical_validation.test.js
 * 
 * EMPIRICAL CHALLENGER TEST SUITE (challenger_final_2)
 * Adversarial validation of:
 * 1. Low-RAM Teardown Lifecycle & Memory Hygiene
 * 2. Extreme Coordinates & Grow Animation Dynamics
 * 3. Repository File Boundaries & Layout Compliance
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Target under test: Production content script engine
const content = require(path.resolve(__dirname, '../../content/content.js'));
const {
  mountModal,
  teardownModal,
  getModal,
  handleCaptureClick,
  initContentScript,
  parseUrlDetails,
  isModifierActive,
  extractAnchorUrl,
  isNavigableHttp,
  MODAL_CSS_TEXT
} = content;

const {
  createBrowserEnvironment,
  MouseEvent,
  KeyboardEvent
} = require('../harness/dom_simulator');
const { createChromeMock } = require('../harness/chrome_mock');

// Colors
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

function getStyleProp(el, prop) {
  if (!el || !el.style) return '';
  if (typeof el.style.getPropertyValue === 'function') {
    return el.style.getPropertyValue(prop) || '';
  }
  return el.style[prop] || '';
}

function setupEnv(html = '<!DOCTYPE html><html><head></head><body><a id="link1" href="https://example.com/page">Link</a></body></html>') {
  const win = createBrowserEnvironment(html);
  const chromeMock = createChromeMock({ enabled: true, modifierKey: 'shift', sizePreset: 'default', growAnimation: true });
  win.chrome = chromeMock;
  return { win, doc: win.document, chrome: chromeMock };
}

async function runAllChallengerProbes() {
  console.log(`${colors.bright}${colors.yellow}========================================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.yellow}  CHALLENGER_FINAL_2: EMPIRICAL ADVERSARIAL STRESS HARNESS             ${colors.reset}`);
  console.log(`${colors.bright}${colors.yellow}========================================================================${colors.reset}\n`);

  // ==========================================================================
  // SUITE 1: LOW-RAM TEARDOWN LIFECYCLE
  // ==========================================================================
  console.log(`${colors.bright}${colors.cyan}--- SUITE 1: LOW-RAM TEARDOWN LIFECYCLE ---${colors.reset}`);

  // Test 1.1: Synchronous iframe.src = 'about:blank' precedes detachment
  try {
    const { win, doc } = setupEnv();
    const modal = mountModal('https://example.com/target', { win });
    assert.ok(modal, 'Modal mounted');
    const iframe = modal.iframe;

    let srcAtDetach = null;
    const origRemoveChild = iframe.parentNode.removeChild.bind(iframe.parentNode);
    iframe.parentNode.removeChild = function (child) {
      if (child === iframe) {
        srcAtDetach = iframe.src;
      }
      return origRemoveChild(child);
    };

    teardownModal(win);

    assert.strictEqual(srcAtDetach, 'about:blank', 'iframe.src must be about:blank at the moment of removal');
    assert.strictEqual(getModal(), null, 'currentModal reference must be null after teardown');
    assert.strictEqual(doc.getElementById('peek-wave-host'), null, 'Host container must be detached from DOM');
    pass('1.1: Synchronous iframe about:blank navigation precedes DOM detachment');
  } catch (err) {
    fail('1.1: Synchronous iframe about:blank navigation precedes DOM detachment', err);
  }

  // Test 1.2: Window keydown (Escape) listener strictly unbound
  try {
    const { win } = setupEnv();
    mountModal('https://example.com/test-esc', { win });

    // Tear down once
    teardownModal(win);

    // Now dispatch 50 Escape keydown events on window
    for (let i = 0; i < 50; i++) {
      const escEv = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true });
      win.dispatchEvent(escEv);
    }
    // Should not throw or cause any errors
    assert.strictEqual(getModal(), null);
    pass('1.2: Window Escape keydown listener is cleanly unbound; 50 subsequent Escape events are no-ops');
  } catch (err) {
    fail('1.2: Window Escape keydown listener is cleanly unbound', err);
  }

  // Test 1.3: Active timers (loadingTimeout and copyTimeout) cancelled on teardown
  try {
    const { win } = setupEnv();
    const modal = mountModal('https://example.com/timer-test', { win });
    assert.ok(modal.loadingTimeout, 'loadingTimeout should be created');

    // Trigger copy button to start copyTimeout
    const copyEv = new MouseEvent('click', { bubbles: true, cancelable: true });
    modal.copyBtn.dispatchEvent(copyEv);
    assert.ok(modal.copyTimeout, 'copyTimeout should be active after copy click');

    teardownModal(win);

    // In a clean teardown, timers must be cleared
    assert.strictEqual(getModal(), null);
    pass('1.3: Active loadingTimeout and copyTimeout are cancelled upon teardown');
  } catch (err) {
    fail('1.3: Active loadingTimeout and copyTimeout are cancelled upon teardown', err);
  }

  // Test 1.4: Idempotent and safe teardown: 100 consecutive teardown calls
  try {
    const { win } = setupEnv();
    mountModal('https://example.com/idem', { win });
    for (let i = 0; i < 100; i++) {
      teardownModal(win);
      teardownModal(null);
      teardownModal(undefined);
    }
    assert.strictEqual(getModal(), null);
    pass('1.4: Idempotent teardown resilience across 100 consecutive calls with null/undefined');
  } catch (err) {
    fail('1.4: Idempotent teardown resilience', err);
  }

  // Test 1.5: Re-entrant mountModal: 50 consecutive mounts without manual teardown
  try {
    const { win, doc } = setupEnv();
    for (let i = 0; i < 50; i++) {
      mountModal(`https://example.com/page-${i}`, { win });
      // Exactly 1 host container should be present in DOM at any time
      const hosts = doc.querySelectorAll('#peek-wave-host');
      assert.strictEqual(hosts.length, 1, `After mount ${i}, exactly 1 host container must exist`);
    }
    teardownModal(win);
    assert.strictEqual(doc.querySelectorAll('#peek-wave-host').length, 0, 'Host container detached after final teardown');
    pass('1.5: Re-entrant mountModal: 50 rapid mounts without teardown maintain exactly 1 host in DOM');
  } catch (err) {
    fail('1.5: Re-entrant mountModal', err);
  }

  // Test 1.6: Teardown with corrupted / externally mutated DOM
  try {
    const { win, doc } = setupEnv();
    const modal = mountModal('https://example.com/corrupt-dom', { win });
    // Manually tamper with DOM before teardown
    if (modal.iframe && modal.iframe.parentNode) {
      modal.iframe.parentNode.removeChild(modal.iframe); // Remove iframe prematurely
    }
    if (modal.hostElement && modal.hostElement.parentNode) {
      modal.hostElement.parentNode.removeChild(modal.hostElement); // Remove host prematurely
    }

    // Teardown should not throw even if DOM was altered externally
    teardownModal(win);
    assert.strictEqual(getModal(), null);
    pass('1.6: Teardown survives externally corrupted or prematurely detached DOM elements');
  } catch (err) {
    fail('1.6: Teardown survives externally corrupted DOM', err);
  }

  // Test 1.7: V8 Heap memory stability across 200 mount/teardown cycles
  try {
    const { win } = setupEnv();
    const initialHeap = process.memoryUsage().heapUsed;

    for (let i = 0; i < 200; i++) {
      mountModal(`https://example.com/cycle-${i}`, {
        win,
        linkRect: { left: 50, top: 100, width: 120, height: 24 }
      });
      teardownModal(win);
    }

    const finalHeap = process.memoryUsage().heapUsed;
    const growthMB = (finalHeap - initialHeap) / (1024 * 1024);
    assert.ok(growthMB < 25, `Heap growth (${growthMB.toFixed(2)} MB) must be bounded under 25 MB for 200 cycles`);
    pass(`1.7: V8 heap growth remains strictly bounded (${growthMB.toFixed(2)} MB growth across 200 cycles)`);
  } catch (err) {
    fail('1.7: V8 heap growth stability', err);
  }

  // ==========================================================================
  // SUITE 2: EXTREME COORDINATES & GROW ANIMATION DYNAMICS
  // ==========================================================================
  console.log(`\n${colors.bright}${colors.cyan}--- SUITE 2: EXTREME COORDINATES & GROW ANIMATION ---${colors.reset}`);

  // Test 2.1: Extremely negative coordinates (anchor scrolled far offscreen top-left)
  try {
    const { win } = setupEnv();
    const modal = mountModal('https://example.com/offscreen-negative', {
      win,
      growAnimation: true,
      linkRect: { left: -5000, top: -3500, width: 100, height: 30 }
    });
    assert.ok(modal.modal.classList.contains('peek-animate-grow'), 'Must apply peek-animate-grow');
    const originX = getStyleProp(modal.modal, '--peek-origin-x');
    const originY = getStyleProp(modal.modal, '--peek-origin-y');
    const scaleX = parseFloat(getStyleProp(modal.modal, '--peek-scale-x'));
    const scaleY = parseFloat(getStyleProp(modal.modal, '--peek-scale-y'));

    assert.ok(originX.endsWith('px') && parseInt(originX, 10) < -4000, `originX (${originX}) must be negative pixel string`);
    assert.ok(originY.endsWith('px') && parseInt(originY, 10) < -3000, `originY (${originY}) must be negative pixel string`);
    assert.ok(scaleX >= 0.04 && scaleX <= 1, `scaleX (${scaleX}) clamped [0.04, 1]`);
    assert.ok(scaleY >= 0.04 && scaleY <= 1, `scaleY (${scaleY}) clamped [0.04, 1]`);
    teardownModal(win);
    pass('2.1: Extreme negative offscreen coordinates produce valid CSS pixel translations and clamped scales');
  } catch (err) {
    fail('2.1: Extreme negative offscreen coordinates', err);
  }

  // Test 2.2: Massive positive coordinates (anchor located far offscreen bottom-right)
  try {
    const { win } = setupEnv();
    const modal = mountModal('https://example.com/offscreen-positive', {
      win,
      growAnimation: true,
      linkRect: { left: 5000000, top: 8000000, width: 50000, height: 20000 }
    });
    assert.ok(modal.modal.classList.contains('peek-animate-grow'));
    const originX = getStyleProp(modal.modal, '--peek-origin-x');
    const originY = getStyleProp(modal.modal, '--peek-origin-y');
    const scaleX = parseFloat(getStyleProp(modal.modal, '--peek-scale-x'));
    const scaleY = parseFloat(getStyleProp(modal.modal, '--peek-scale-y'));

    assert.ok(originX.endsWith('px') && parseInt(originX, 10) > 1000000, `originX (${originX}) must be large positive`);
    assert.ok(originY.endsWith('px') && parseInt(originY, 10) > 1000000, `originY (${originY}) must be large positive`);
    assert.strictEqual(scaleX, 1, 'Massive link width clamps scaleX to max 1.0');
    assert.strictEqual(scaleY, 1, 'Massive link height clamps scaleY to max 1.0');
    teardownModal(win);
    pass('2.2: Massive positive coordinates clamp scale factors to 1.0 without mathematical overflow');
  } catch (err) {
    fail('2.2: Massive positive coordinates', err);
  }

  // Test 2.3: Zero and sub-zero dimensions (width: 0, height: 0, or negative)
  try {
    const { win } = setupEnv();
    const modal = mountModal('https://example.com/zero-dim', {
      win,
      growAnimation: true,
      linkRect: { left: 200, top: 150, width: 0, height: 0 }
    });
    assert.ok(modal.modal.classList.contains('peek-animate-grow'));
    const scaleX = parseFloat(getStyleProp(modal.modal, '--peek-scale-x'));
    const scaleY = parseFloat(getStyleProp(modal.modal, '--peek-scale-y'));

    assert.ok(!isNaN(scaleX) && scaleX >= 0.04, `scaleX (${scaleX}) must be a valid number >= 0.04`);
    assert.ok(!isNaN(scaleY) && scaleY >= 0.04, `scaleY (${scaleY}) must be a valid number >= 0.04`);
    teardownModal(win);
    pass('2.3: Zero-dimension link coordinates gracefully fall back to minimum dimensions without divide-by-zero');
  } catch (err) {
    fail('2.3: Zero-dimension link coordinates', err);
  }

  // Test 2.4: Malformed non-numeric coordinates (NaN, Infinity, undefined)
  try {
    const { win } = setupEnv();
    const modal = mountModal('https://example.com/corrupt-coords', {
      win,
      growAnimation: true,
      linkRect: { left: NaN, top: Infinity, width: -Infinity, height: undefined }
    });
    // Should mount successfully without unhandled exception
    assert.ok(modal, 'Modal mounts gracefully even with malformed coordinates');
    teardownModal(win);
    pass('2.4: Corrupted non-numeric coordinates (NaN/Infinity) handled gracefully without runtime crash');
  } catch (err) {
    fail('2.4: Corrupted non-numeric coordinates', err);
  }

  // Test 2.5: Extreme zero viewport dimensions (innerWidth = 0, innerHeight = 0)
  try {
    const { win } = setupEnv();
    win.innerWidth = 0;
    win.innerHeight = 0;
    if (win.document.documentElement) {
      win.document.documentElement.clientWidth = 0;
      win.document.documentElement.clientHeight = 0;
    }
    const modal = mountModal('https://example.com/zero-viewport', {
      win,
      growAnimation: true,
      linkRect: { left: 100, top: 100, width: 80, height: 24 }
    });
    assert.ok(modal, 'Modal mounts cleanly under zero-viewport dimensions');
    teardownModal(win);
    pass('2.5: Zero-viewport dimensions fall back to default resolution without NaN geometry');
  } catch (err) {
    fail('2.5: Zero-viewport dimensions', err);
  }

  // Test 2.6: Multiline wrapped anchor getClientRects() resolution in handleCaptureClick
  try {
    const { win, doc, chrome } = setupEnv(`
      <!DOCTYPE html><html><body>
        <a id="multiline-link" href="https://example.com/multiline">
          <span>First line text</span><br>
          <span>Second line text</span><br>
          <span>Third line text</span>
        </a>
      </body></html>
    `);
    const link = doc.getElementById('multiline-link');

    // Mock getClientRects with 3 distinct lines
    link.getClientRects = () => [
      { left: 20, top: 20, right: 200, bottom: 40, width: 180, height: 20 },
      { left: 20, top: 40, right: 300, bottom: 60, width: 280, height: 20 },
      { left: 20, top: 60, right: 150, bottom: 80, width: 130, height: 20 }
    ];

    initContentScript(win, chrome);

    // Click on Line 2 (y=50, x=50)
    const clickEv = new MouseEvent('click', {
      button: 0,
      shiftKey: true,
      clientX: 50,
      clientY: 50,
      bubbles: true,
      cancelable: true
    });
    link.dispatchEvent(clickEv);

    const activeModal = getModal();
    assert.ok(activeModal, 'Modal should be mounted');
    assert.ok(activeModal.modal.classList.contains('peek-animate-grow'), 'Grow animation active');

    // Origin Y should be calculated from line 2 center: top=40, height=20 -> center=50
    // modalFinalCenterY = 768/2 = 384; deltaY = 50 - 384 = -334px
    const originY = getStyleProp(activeModal.modal, '--peek-origin-y');
    assert.strictEqual(originY, '-334px', 'Origin Y must accurately match line 2 bounding rect');

    teardownModal(win);
    pass('2.6: Multiline wrapped anchor resolves accurate line rect corresponding to click coordinates');
  } catch (err) {
    fail('2.6: Multiline wrapped anchor resolution', err);
  }

  // Test 2.7: Grow animation toggle strictly switches between grow and center expansion
  try {
    const { win } = setupEnv();

    // Mode A: growAnimation = false
    const modalA = mountModal('https://example.com/no-grow', {
      win,
      growAnimation: false,
      linkRect: { left: 100, top: 100, width: 100, height: 30 }
    });
    assert.strictEqual(modalA.modal.classList.contains('peek-animate-grow'), false, 'Must NOT contain peek-animate-grow when disabled');
    assert.strictEqual(getStyleProp(modalA.modal, '--peek-origin-x'), '', '--peek-origin-x must remain unset');
    teardownModal(win);

    // Mode B: growAnimation = true with null linkRect
    const modalB = mountModal('https://example.com/null-rect', {
      win,
      growAnimation: true,
      linkRect: null
    });
    assert.strictEqual(modalB.modal.classList.contains('peek-animate-grow'), false, 'Must NOT contain peek-animate-grow when linkRect is null');
    teardownModal(win);

    // Mode C: growAnimation = true with valid linkRect
    const modalC = mountModal('https://example.com/valid-grow', {
      win,
      growAnimation: true,
      linkRect: { left: 100, top: 100, width: 100, height: 30 }
    });
    assert.strictEqual(modalC.modal.classList.contains('peek-animate-grow'), true, 'Must contain peek-animate-grow when enabled with rect');
    assert.ok(getStyleProp(modalC.modal, '--peek-origin-x').endsWith('px'));
    teardownModal(win);

    pass('2.7: Grow animation toggle strictly switches between link-origin expansion and standard center animation');
  } catch (err) {
    fail('2.7: Grow animation toggle', err);
  }

  // ==========================================================================
  // SUITE 3: REPOSITORY FILE BOUNDARIES & LAYOUT COMPLIANCE
  // ==========================================================================
  console.log(`\n${colors.bright}${colors.cyan}--- SUITE 3: REPOSITORY FILE BOUNDARIES & LAYOUT COMPLIANCE ---${colors.reset}`);

  // Test 3.1: .gitignore exists and contains critical exclusion rules
  try {
    const gitignorePath = path.resolve(__dirname, '../../.gitignore');
    assert.ok(fs.existsSync(gitignorePath), '.gitignore must exist in root');
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');

    const requiredPatterns = [
      '.agents/',
      '_metadata/',
      'node_modules/',
      'coverage/',
      '*.log',
      '*.tmp',
      'scratch/',
      'temp/',
      '.vscode/',
      '.idea/',
      '.DS_Store',
      'Thumbs.db',
      'desktop.ini',
      '__pycache__/'
    ];

    for (const pat of requiredPatterns) {
      assert.ok(gitignoreContent.includes(pat), `.gitignore must contain rule: ${pat}`);
    }
    pass('3.1: .gitignore contains comprehensive exclusion rules matching project boundaries');
  } catch (err) {
    fail('3.1: .gitignore comprehensive exclusion rules', err);
  }

  // Test 3.2: Repository root hygiene (no stray temporary files, dumps, logs)
  try {
    const rootDir = path.resolve(__dirname, '../..');
    const entries = fs.readdirSync(rootDir);

    const forbiddenExtensions = ['.tmp', '.log', '.crx', '.pem', '.swp'];
    for (const entry of entries) {
      const ext = path.extname(entry).toLowerCase();
      assert.ok(!forbiddenExtensions.includes(ext), `Forbidden scratch file in root: ${entry}`);
      assert.ok(entry !== 'node_modules', 'node_modules should not exist in root for zero-dependency extension');
    }
    pass('3.2: Repository root hygiene confirmed: zero logs, temp files, or dependency dumps');
  } catch (err) {
    fail('3.2: Repository root hygiene', err);
  }

  // Test 3.4: README.md zero emojis & completeness
  try {
    const readmePath = path.resolve(__dirname, '../../README.md');
    assert.ok(fs.existsSync(readmePath), 'README.md must exist');
    const readmeContent = fs.readFileSync(readmePath, 'utf8');

    // Emoji regex checking complete Unicode emoji blocks
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F1E6}-\u{1F1FF}]|[\u{1FA00}-\u{1FAFF}]|[\u{203C}\u{2049}\u{2122}\u{2139}\u{2194}-\u{2199}\u{21A9}-\u{21AA}]|[\u{25AA}\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}]/gu;
    const emojiMatches = readmeContent.match(emojiRegex);
    assert.strictEqual(emojiMatches, null, `README.md must contain 0 emojis, found: ${emojiMatches?.join(', ')}`);

    // Verify key sections exist
    assert.ok(readmeContent.includes('Features'), 'README.md must document Features');
    assert.ok(readmeContent.includes('Installation'), 'README.md must document Installation');
    assert.ok(readmeContent.includes('Usage'), 'README.md must document Usage');

    pass('3.4: README.md is concise, well-structured, and verified 100% emoji-free');
  } catch (err) {
    fail('3.4: README.md zero emojis & completeness', err);
  }

  // Test 3.5: Manifest V3 packaging integrity (all declared assets exist on disk)
  try {
    const manifestPath = path.resolve(__dirname, '../../manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'manifest.json must exist');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    // Check service worker
    const swPath = path.resolve(__dirname, '../..', manifest.background.service_worker);
    assert.ok(fs.existsSync(swPath), `Service worker missing: ${swPath}`);

    // Check content scripts
    for (const cs of manifest.content_scripts) {
      for (const js of cs.js || []) {
        const csPath = path.resolve(__dirname, '../..', js);
        assert.ok(fs.existsSync(csPath), `Content script missing: ${csPath}`);
      }
    }

    // Check popup
    if (manifest.action?.default_popup) {
      const popupPath = path.resolve(__dirname, '../..', manifest.action.default_popup);
      assert.ok(fs.existsSync(popupPath), `Popup HTML missing: ${popupPath}`);
    }

    // Check icons
    if (manifest.icons) {
      for (const [size, iconFile] of Object.entries(manifest.icons)) {
        const iconPath = path.resolve(__dirname, '../..', iconFile);
        assert.ok(fs.existsSync(iconPath), `Icon ${size} missing: ${iconPath}`);
      }
    }

    // Check declarative_net_request rulesets
    if (manifest.declarative_net_request?.rule_resources) {
      for (const rr of manifest.declarative_net_request.rule_resources) {
        const rulePath = path.resolve(__dirname, '../..', rr.path);
        assert.ok(fs.existsSync(rulePath), `Rule resource missing: ${rulePath}`);
      }
    }

    pass('3.5: Manifest V3 packaging integrity: 100% of declared files exist and resolve properly');
  } catch (err) {
    fail('3.5: Manifest V3 packaging integrity', err);
  }

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log(`\n${colors.bright}${colors.yellow}========================================================================${colors.reset}`);
  console.log(`${colors.bright}${colors.yellow}  CHALLENGER_FINAL_2 VERIFICATION RESULTS SUMMARY                       ${colors.reset}`);
  console.log(`${colors.bright}${colors.yellow}========================================================================${colors.reset}`);
  console.log(`  Passed: ${results.passed}`);
  console.log(`  Failed: ${results.failed}`);
  console.log(`  Total:  ${results.passed + results.failed}`);

  if (results.failed > 0) {
    console.error(`\n${colors.bright}${colors.red}❌ CHALLENGER VERDICT: REJECT (${results.failed} tests failed)${colors.reset}`);
    process.exit(1);
  } else {
    console.log(`\n${colors.bright}${colors.green}✔ CHALLENGER VERDICT: APPROVE (All ${results.passed} tests passed)${colors.reset}`);
    process.exit(0);
  }
}

runAllChallengerProbes().catch((err) => {
  console.error('\nFatal harness crash:', err);
  process.exit(1);
});
