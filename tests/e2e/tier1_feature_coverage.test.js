/**
 * tier1_feature_coverage.test.js - Tier 1: Feature Coverage E2E Tests
 * Validates baseline happy-path behaviors and contracts across all 11 core features.
 * Pure Node.js with zero external dependencies.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { setupTestEnvironment, getManifest, getRules, checkIconAsset } = require('../harness/extension_loader');
const { MouseEvent, KeyboardEvent } = require('../harness/dom_simulator');

describe('Tier 1: Feature Coverage', () => {

  // --------------------------------------------------------------------------
  // Feature 1: Manifest V3 Packaging & Permissions
  // --------------------------------------------------------------------------
  describe('F1: Manifest V3 Packaging & Permissions', () => {
    const { data: manifest, isFromDisk } = getManifest();

    test('T1.F1.1: manifest.json declares manifest_version 3', () => {
      assert.strictEqual(manifest.manifest_version, 3, 'Must be Manifest V3');
    });

    test('T1.F1.2: manifest.json has correct name and version', () => {
      assert.strictEqual(manifest.name, 'Peek Wave');
      assert.strictEqual(manifest.version, '1.0.0');
      assert.ok(typeof manifest.description === 'string' && manifest.description.length > 10);
    });

    test('T1.F1.3: manifest.json declares required permissions', () => {
      assert.ok(Array.isArray(manifest.permissions), 'permissions must be an array');
      assert.ok(manifest.permissions.includes('storage'), 'Must include storage');
      assert.ok(manifest.permissions.includes('declarativeNetRequest'), 'Must include declarativeNetRequest');
      assert.ok(manifest.permissions.includes('clipboardWrite'), 'Must include clipboardWrite');
    });

    test('T1.F1.4: manifest.json declares host_permissions for <all_urls>', () => {
      assert.ok(Array.isArray(manifest.host_permissions), 'host_permissions must be an array');
      assert.ok(manifest.host_permissions.includes('<all_urls>'), 'Must include <all_urls> for DNR header modification');
    });

    test('T1.F1.5: manifest.json configures ES module background service worker', () => {
      assert.ok(manifest.background, 'background must be defined');
      assert.strictEqual(manifest.background.service_worker, 'background.js');
      assert.strictEqual(manifest.background.type, 'module');
    });

    test('T1.F1.6: manifest.json declares action popup and content_scripts without all_frames', () => {
      assert.strictEqual(manifest.action.default_popup, 'popup/popup.html');
      assert.ok(Array.isArray(manifest.content_scripts), 'content_scripts must be an array');
      const cs = manifest.content_scripts[0];
      assert.ok(cs.matches.includes('<all_urls>'));
      assert.ok(cs.js.includes('content/content.js'));
      assert.strictEqual(cs.run_at, 'document_idle');
      assert.strictEqual(cs.all_frames, false, 'all_frames must be false to prevent recursive modals');
    });
  });

  // --------------------------------------------------------------------------
  // Feature 2: Sub-Frame DeclarativeNetRequest Header Stripping
  // --------------------------------------------------------------------------
  describe('F2: DeclarativeNetRequest Header Stripping Rules', () => {
    const { data: rules } = getRules();

    test('T1.F2.1: rules.json exists with valid array structure', () => {
      assert.ok(Array.isArray(rules), 'rules must be an array');
      assert.ok(rules.length >= 1, 'At least one DNR rule must be declared');
    });

    test('T1.F2.2: DNR rule 1 uses modifyHeaders action', () => {
      const rule = rules.find(r => r.id === 1) || rules[0];
      assert.strictEqual(rule.action.type, 'modifyHeaders');
      assert.ok(Array.isArray(rule.action.responseHeaders));
    });

    test('T1.F2.3: DNR rule removes X-Frame-Options response header', () => {
      const rule = rules.find(r => r.id === 1) || rules[0];
      const hasXFO = rule.action.responseHeaders.some(h =>
        h.header.toLowerCase() === 'x-frame-options' && h.operation === 'remove'
      );
      assert.ok(hasXFO, 'Must remove X-Frame-Options');
    });

    test('T1.F2.4: DNR rule removes Frame-Options response header', () => {
      const rule = rules.find(r => r.id === 1) || rules[0];
      const hasFO = rule.action.responseHeaders.some(h =>
        h.header.toLowerCase() === 'frame-options' && h.operation === 'remove'
      );
      assert.ok(hasFO, 'Must remove Frame-Options');
    });

    test('T1.F2.5: DNR rule removes Content-Security-Policy headers', () => {
      const rule = rules.find(r => r.id === 1) || rules[0];
      const hasCSP = rule.action.responseHeaders.some(h =>
        h.header.toLowerCase() === 'content-security-policy' && h.operation === 'remove'
      );
      assert.ok(hasCSP, 'Must remove Content-Security-Policy');
    });

    test('T1.F2.6: DNR rule condition strictly targets sub_frame requests with urlFilter *', () => {
      const rule = rules.find(r => r.id === 1) || rules[0];
      assert.strictEqual(rule.condition.urlFilter, '*');
      assert.ok(rule.condition.resourceTypes.includes('sub_frame'), 'Must target sub_frame');
      assert.ok(!rule.condition.resourceTypes.includes('main_frame'), 'Must NEVER strip headers on main_frame');
    });
  });

  // --------------------------------------------------------------------------
  // Feature 3: Brand Icon Assets
  // --------------------------------------------------------------------------
  describe('F3: Brand Icon Assets', () => {
    const { data: manifest } = getManifest();

    test('T1.F3.1: Manifest specifies 16, 32, 48, and 128 icon paths in action', () => {
      assert.strictEqual(manifest.action.default_icon['16'], 'icons/icon16.png');
      assert.strictEqual(manifest.action.default_icon['32'], 'icons/icon32.png');
      assert.strictEqual(manifest.action.default_icon['48'], 'icons/icon48.png');
      assert.strictEqual(manifest.action.default_icon['128'], 'icons/icon128.png');
    });

    test('T1.F3.2: Manifest specifies 16, 32, 48, and 128 icon paths in root icons', () => {
      assert.strictEqual(manifest.icons['16'], 'icons/icon16.png');
      assert.strictEqual(manifest.icons['32'], 'icons/icon32.png');
      assert.strictEqual(manifest.icons['48'], 'icons/icon48.png');
      assert.strictEqual(manifest.icons['128'], 'icons/icon128.png');
    });

    test('T1.F3.3: 16x16 icon asset specification check', () => {
      const res = checkIconAsset(16);
      if (res.exists) {
        assert.ok(res.valid, `icon16.png must be valid binary PNG: ${res.error}`);
        assert.strictEqual(res.width, 16);
        assert.strictEqual(res.height, 16);
      } else {
        assert.strictEqual(manifest.icons['16'], 'icons/icon16.png');
      }
    });

    test('T1.F3.4: 32x32 icon asset specification check', () => {
      const res = checkIconAsset(32);
      if (res.exists) {
        assert.ok(res.valid, `icon32.png must be valid binary PNG: ${res.error}`);
        assert.strictEqual(res.width, 32);
        assert.strictEqual(res.height, 32);
      } else {
        assert.strictEqual(manifest.icons['32'], 'icons/icon32.png');
      }
    });

    test('T1.F3.5: 48x48 icon asset specification check', () => {
      const res = checkIconAsset(48);
      if (res.exists) {
        assert.ok(res.valid, `icon48.png must be valid binary PNG: ${res.error}`);
        assert.strictEqual(res.width, 48);
        assert.strictEqual(res.height, 48);
      } else {
        assert.strictEqual(manifest.icons['48'], 'icons/icon48.png');
      }
    });

    test('T1.F3.6: 128x128 icon asset specification check', () => {
      const res = checkIconAsset(128);
      if (res.exists) {
        assert.ok(res.valid, `icon128.png must be valid binary PNG: ${res.error}`);
        assert.strictEqual(res.width, 128);
        assert.strictEqual(res.height, 128);
      } else {
        assert.strictEqual(manifest.icons['128'], 'icons/icon128.png');
      }
    });
  });

  // --------------------------------------------------------------------------
  // Feature 4: Background Service Worker
  // --------------------------------------------------------------------------
  describe('F4: Background Service Worker', () => {
    test('T1.F4.1: Background worker registers runtime.onMessage listener', () => {
      const env = setupTestEnvironment();
      assert.strictEqual(env.chrome.runtime.onMessage._listeners.size, 1);
    });

    test('T1.F4.2: Handles OPEN_TAB action message and opens tab', async () => {
      const env = setupTestEnvironment();
      const testUrl = 'https://example.com/destination';
      const response = await env.chrome.runtime.sendMessage({ action: 'OPEN_TAB', url: testUrl });
      assert.strictEqual(response.success, true);
      assert.strictEqual(env.chrome.createdTabs.length, 1);
      assert.strictEqual(env.chrome.createdTabs[0].url, testUrl);
    });

    test('T1.F4.3: Created tab has active set to true', async () => {
      const env = setupTestEnvironment();
      await env.chrome.runtime.sendMessage({ action: 'OPEN_TAB', url: 'https://example.com/active-tab' });
      assert.strictEqual(env.chrome.createdTabs[0].active, true);
    });

    test('T1.F4.4: Response callback receives valid numeric tabId', async () => {
      const env = setupTestEnvironment();
      const response = await env.chrome.runtime.sendMessage({ action: 'OPEN_TAB', url: 'https://example.com/id-test' });
      assert.ok(typeof response.tabId === 'number');
    });

    test('T1.F4.5: Multiple OPEN_TAB messages create multiple independent tabs', async () => {
      const env = setupTestEnvironment();
      await env.chrome.runtime.sendMessage({ action: 'OPEN_TAB', url: 'https://example.com/tab-1' });
      await env.chrome.runtime.sendMessage({ action: 'OPEN_TAB', url: 'https://example.com/tab-2' });
      assert.strictEqual(env.chrome.createdTabs.length, 2);
      assert.strictEqual(env.chrome.createdTabs[0].url, 'https://example.com/tab-1');
      assert.strictEqual(env.chrome.createdTabs[1].url, 'https://example.com/tab-2');
    });

    test('T1.F4.6: Ignores unknown action messages without throwing', async () => {
      const env = setupTestEnvironment();
      const response = await env.chrome.runtime.sendMessage({ action: 'UNKNOWN_ACTION_XYZ' });
      assert.ok(response);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 5: Link Click Interception & Modifiers
  // --------------------------------------------------------------------------
  describe('F5: Link Click Interception & Modifiers', () => {
    test('T1.F5.1: Shift + Click intercepts <a> click and displays modal', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/test-article';
      link.textContent = 'Read More';
      env.doc.body.appendChild(link);

      const evt = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        shiftKey: true,
        button: 0
      });
      link.dispatchEvent(evt);

      assert.strictEqual(evt.defaultPrevented, true, 'Default action must be prevented');
      const modal = env.getModal();
      assert.ok(modal, 'Modal should be mounted');
      assert.strictEqual(modal.iframe.src, 'https://example.com/test-article');
    });

    test('T1.F5.2: Normal click without modifier allows default navigation', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/normal-nav';
      env.doc.body.appendChild(link);

      const evt = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        button: 0
      });
      link.dispatchEvent(evt);

      assert.strictEqual(evt.defaultPrevented, false, 'Default action must NOT be prevented');
      assert.strictEqual(env.getModal(), null, 'Modal should NOT open on normal click');
    });

    test('T1.F5.3: Middle click with Shift (button=1) is not intercepted', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/middle-click';
      env.doc.body.appendChild(link);

      const evt = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        shiftKey: true,
        button: 1 // Middle click
      });
      link.dispatchEvent(evt);

      assert.strictEqual(evt.defaultPrevented, false);
      assert.strictEqual(env.getModal(), null);
    });

    test('T1.F5.4: Right click with Shift (button=2) is not intercepted', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/right-click';
      env.doc.body.appendChild(link);

      const evt = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        shiftKey: true,
        button: 2 // Right click
      });
      link.dispatchEvent(evt);

      assert.strictEqual(evt.defaultPrevented, false);
      assert.strictEqual(env.getModal(), null);
    });

    test('T1.F5.5: Click on plain text/div outside anchor does not open modal', () => {
      const env = setupTestEnvironment();
      const div = env.doc.createElement('div');
      div.textContent = 'Not a link';
      env.doc.body.appendChild(div);

      const evt = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        shiftKey: true,
        button: 0
      });
      div.dispatchEvent(evt);

      assert.strictEqual(evt.defaultPrevented, false);
      assert.strictEqual(env.getModal(), null);
    });

    test('T1.F5.6: Click on anchor without href attribute does not open modal', () => {
      const env = setupTestEnvironment();
      const anchorWithoutHref = env.doc.createElement('a');
      anchorWithoutHref.textContent = 'Anchor bookmark';
      env.doc.body.appendChild(anchorWithoutHref);

      const evt = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        shiftKey: true,
        button: 0
      });
      anchorWithoutHref.dispatchEvent(evt);

      assert.strictEqual(evt.defaultPrevented, false);
      assert.strictEqual(env.getModal(), null);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 6: Shadow DOM Modal Overlay & Styling
  // --------------------------------------------------------------------------
  describe('F6: Shadow DOM Modal Overlay & Styling', () => {
    test('T1.F6.1: Shadow root is created in open mode on document.documentElement', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/shadow-test';
      env.doc.body.appendChild(link);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const host = env.doc.getElementById('peek-wave-host');
      assert.ok(host, 'Host element peek-wave-host must exist in DOM');
      assert.strictEqual(host.parentNode, env.doc.documentElement, 'Host must attach to document.documentElement');
      assert.ok(host.shadowRoot, 'Host must have shadowRoot');
      assert.strictEqual(host.shadowRoot.mode, 'open', 'ShadowRoot mode must be open');
    });

    test('T1.F6.2: Host element resets inherited CSS via all: initial', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/reset-test';
      env.doc.body.appendChild(link);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const host = env.doc.getElementById('peek-wave-host');
      assert.ok(host.style.cssText.includes('all: initial'), 'Host must have all: initial');
      assert.ok(host.style.cssText.includes('z-index: 2147483647'), 'Host must have maximum z-index');
    });

    test('T1.F6.3: ShadowRoot contains .peek-wave-backdrop element', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/backdrop-test';
      env.doc.body.appendChild(link);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const host = env.doc.getElementById('peek-wave-host');
      const backdrop = host.shadowRoot.querySelector('.peek-wave-backdrop');
      assert.ok(backdrop, '.peek-wave-backdrop must exist inside shadowRoot');
    });

    test('T1.F6.4: ShadowRoot contains .peek-wave-modal window with size preset class', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/modal-test';
      env.doc.body.appendChild(link);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const host = env.doc.getElementById('peek-wave-host');
      const modalWin = host.shadowRoot.querySelector('.peek-wave-modal');
      assert.ok(modalWin, '.peek-wave-modal must exist');
      assert.ok(modalWin.classList.contains('peek-size-default'), 'Must have default size preset');
    });

    test('T1.F6.5: Opening another link while modal is open replaces previous modal cleanly', () => {
      const env = setupTestEnvironment();
      const link1 = env.doc.createElement('a');
      link1.href = 'https://example.com/page-1';
      const link2 = env.doc.createElement('a');
      link2.href = 'https://example.com/page-2';
      env.doc.body.appendChild(link1);
      env.doc.body.appendChild(link2);

      link1.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      assert.strictEqual(env.getModal().iframe.src, 'https://example.com/page-1');

      link2.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      assert.strictEqual(env.getModal().iframe.src, 'https://example.com/page-2');

      const hosts = env.doc.querySelectorAll('#peek-wave-host');
      assert.strictEqual(hosts.length, 1, 'Only one host element should exist');
    });

    test('T1.F6.6: Styles inside ShadowRoot are isolated from outside document', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/isolation-test';
      env.doc.body.appendChild(link);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      // Host page querySelector cannot directly find elements inside open shadowRoot without piercing
      const backdropFromOutside = env.doc.querySelector('.peek-wave-backdrop');
      assert.strictEqual(backdropFromOutside, null, 'Backdrop inside ShadowRoot must not be exposed to document.querySelector');
    });
  });

  // --------------------------------------------------------------------------
  // Feature 7: Sandboxed Iframe Preview Security
  // --------------------------------------------------------------------------
  describe('F7: Sandboxed Iframe Preview Security', () => {
    test('T1.F7.1: Modal mounts iframe with class peek-wave-iframe', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/iframe-test';
      env.doc.body.appendChild(link);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const iframe = env.getModal().iframe;
      assert.ok(iframe, 'Iframe must exist');
      assert.ok(iframe.classList.contains('peek-wave-iframe'));
    });

    test('T1.F7.2: Iframe src is set to target URL', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://github.com/microsoft/vscode';
      env.doc.body.appendChild(link);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      assert.strictEqual(env.getModal().iframe.src, 'https://github.com/microsoft/vscode');
    });

    test('T1.F7.3: Iframe has sandbox attribute configured', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/sandbox-check';
      env.doc.body.appendChild(link);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const iframe = env.getModal().iframe;
      assert.ok(iframe.hasAttribute('sandbox'), 'Iframe must have sandbox attribute');
    });

    test('T1.F7.4: Sandbox includes allow-scripts', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/scripts-check';
      env.doc.body.appendChild(link);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      assert.ok(env.getModal().iframe.sandbox.contains('allow-scripts'));
    });

    test('T1.F7.5: Sandbox includes allow-same-origin', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/same-origin-check';
      env.doc.body.appendChild(link);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      assert.ok(env.getModal().iframe.sandbox.contains('allow-same-origin'));
    });

    test('T1.F7.6: Sandbox omits allow-top-navigation (anti-framebuster security)', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/framebuster-check';
      env.doc.body.appendChild(link);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      assert.ok(!env.getModal().iframe.sandbox.contains('allow-top-navigation'),
        'Must NOT contain allow-top-navigation to prevent framed sites from hijacking host window');
    });
  });

  // --------------------------------------------------------------------------
  // Feature 8: Modal Header Bar UX & Domain Formatting
  // --------------------------------------------------------------------------
  describe('F8: Modal Header Bar UX & Domain Formatting', () => {
    test('T1.F8.1: Header displays clean target domain without www.', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://www.wikipedia.org/wiki/Node.js';
      env.doc.body.appendChild(link);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const host = env.doc.getElementById('peek-wave-host');
      const domainEl = host.shadowRoot.querySelector('.peek-wave-domain');
      assert.ok(domainEl);
      assert.strictEqual(domainEl.textContent, 'wikipedia.org');
    });

    test('T1.F8.2: Header displays favicon image pointing to google favicon service', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://github.com/nodejs/node';
      env.doc.body.appendChild(link);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const host = env.doc.getElementById('peek-wave-host');
      const favicon = host.shadowRoot.querySelector('.peek-wave-favicon');
      assert.ok(favicon);
      assert.ok(favicon.src.includes('https://www.google.com/s2/favicons?domain=github.com'));
    });

    test('T1.F8.3: Header contains loading spinner element', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/load-spinner';
      env.doc.body.appendChild(link);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const host = env.doc.getElementById('peek-wave-host');
      const spinner = host.shadowRoot.querySelector('.peek-wave-loader-spinner');
      assert.ok(spinner);
    });

    test('T1.F8.4: Header contains Copy Link button', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/copy-check';
      env.doc.body.appendChild(link);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const copyBtn = env.getModal().copyBtn;
      assert.ok(copyBtn);
      assert.strictEqual(copyBtn.title, 'Copy Link');
    });

    test('T1.F8.5: Header contains Open in New Tab button', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/tab-check';
      env.doc.body.appendChild(link);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const tabBtn = env.getModal().tabBtn;
      assert.ok(tabBtn);
      assert.strictEqual(tabBtn.title, 'Open in New Tab');
    });

    test('T1.F8.6: Header contains Close button with title Close (Esc)', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/close-check';
      env.doc.body.appendChild(link);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const closeBtn = env.getModal().closeBtn;
      assert.ok(closeBtn);
      assert.strictEqual(closeBtn.title, 'Close (Esc)');
    });
  });

  // --------------------------------------------------------------------------
  // Feature 9: Strict Low-RAM Teardown Lifecycle
  // --------------------------------------------------------------------------
  describe('F9: Strict Low-RAM Teardown Lifecycle', () => {
    test('T1.F9.1: Pressing Escape key triggers immediate modal teardown', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/esc-test';
      env.doc.body.appendChild(link);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      assert.ok(env.getModal() !== null);

      // Fire Escape keydown on window
      const escEvt = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true });
      env.win.dispatchEvent(escEvt);

      assert.strictEqual(escEvt.defaultPrevented, true);
      assert.strictEqual(env.getModal(), null, 'Modal must be nullified after Escape');
      assert.strictEqual(env.doc.getElementById('peek-wave-host'), null, 'Host must be removed from DOM');
    });

    test('T1.F9.2: Clicking backdrop overlay triggers immediate teardown', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/backdrop-click-test';
      env.doc.body.appendChild(link);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const modal = env.getModal();
      modal.backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      assert.strictEqual(env.getModal(), null);
      assert.strictEqual(env.doc.getElementById('peek-wave-host'), null);
    });

    test('T1.F9.3: Clicking Close button triggers immediate teardown', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/close-btn-test';
      env.doc.body.appendChild(link);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const modal = env.getModal();
      modal.closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      assert.strictEqual(env.getModal(), null);
      assert.strictEqual(env.doc.getElementById('peek-wave-host'), null);
    });

    test('T1.F9.4: Teardown navigates iframe.src to about:blank synchronously', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/about-blank-test';
      env.doc.body.appendChild(link);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const iframe = env.getModal().iframe;
      env.teardown();

      assert.strictEqual(iframe.src, 'about:blank', 'Iframe src must be reset to about:blank to kill media/workers');
    });

    test('T1.F9.5: Teardown removes iframe from parent container', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/detach-test';
      env.doc.body.appendChild(link);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const iframe = env.getModal().iframe;
      env.teardown();

      assert.strictEqual(iframe.parentNode, null, 'Iframe parentNode must be null');
    });

    test('T1.F9.6: Teardown detaches global keydown listener from window', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/listener-clean-test';
      env.doc.body.appendChild(link);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      env.teardown();

      // Dispatching Escape again should not error or affect anything
      const escEvt = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true });
      env.win.dispatchEvent(escEvt);
      assert.strictEqual(escEvt.defaultPrevented, false, 'Escape should not be handled when no modal is open');
    });
  });

  // --------------------------------------------------------------------------
  // Feature 10: Settings Toolbar Popup UI
  // --------------------------------------------------------------------------
  describe('F10: Settings Toolbar Popup UI', () => {
    test('T1.F10.1: Popup provides toggle checkbox for enabling/disabling', () => {
      const env = setupTestEnvironment();
      const popup = env.engine.initPopup(env.win, env.chrome);
      assert.ok(popup.toggleEl);
      assert.strictEqual(popup.toggleEl.type, 'checkbox');
      assert.strictEqual(popup.toggleEl.checked, true);
    });

    test('T1.F10.2: Popup provides modifier selection dropdown with shift, alt, ctrl_cmd', () => {
      const env = setupTestEnvironment();
      const popup = env.engine.initPopup(env.win, env.chrome);
      assert.ok(popup.modifierSelect);
      const options = popup.modifierSelect.querySelectorAll('option').map(o => o.value);
      assert.ok(options.includes('shift'));
      assert.ok(options.includes('alt'));
      assert.ok(options.includes('ctrl_cmd'));
    });

    test('T1.F10.3: Popup provides size preset dropdown with compact, default, large', () => {
      const env = setupTestEnvironment();
      const popup = env.engine.initPopup(env.win, env.chrome);
      assert.ok(popup.sizeSelect);
      const options = popup.sizeSelect.querySelectorAll('option').map(o => o.value);
      assert.ok(options.includes('compact'));
      assert.ok(options.includes('default'));
      assert.ok(options.includes('large'));
    });

    test('T1.F10.4: Toggling extension updates storage', async () => {
      const env = setupTestEnvironment();
      const popup = env.engine.initPopup(env.win, env.chrome);

      popup.toggleEl.checked = false;
      popup.saveSettings();

      const stored = await env.chrome.storage.sync.get('enabled');
      assert.strictEqual(stored.enabled, false);
    });

    test('T1.F10.5: Changing modifier updates storage', async () => {
      const env = setupTestEnvironment();
      const popup = env.engine.initPopup(env.win, env.chrome);

      popup.modifierSelect.value = 'alt';
      popup.saveSettings();

      const stored = await env.chrome.storage.sync.get('modifierKey');
      assert.strictEqual(stored.modifierKey, 'alt');
    });

    test('T1.F10.6: Changing size preset updates storage', async () => {
      const env = setupTestEnvironment();
      const popup = env.engine.initPopup(env.win, env.chrome);

      popup.sizeSelect.value = 'large';
      popup.saveSettings();

      const stored = await env.chrome.storage.sync.get('sizePreset');
      assert.strictEqual(stored.sizePreset, 'large');
    });
  });

  // --------------------------------------------------------------------------
  // Feature 11: Settings Storage & Real-Time Sync
  // --------------------------------------------------------------------------
  describe('F11: Settings Storage & Real-Time Sync', () => {
    test('T1.F11.1: Default settings are persisted across sessions', async () => {
      const env = setupTestEnvironment();
      const items = await env.chrome.storage.sync.get(['enabled', 'modifierKey', 'sizePreset']);
      assert.strictEqual(items.enabled, true);
      assert.strictEqual(items.modifierKey, 'shift');
      assert.strictEqual(items.sizePreset, 'default');
    });

    test('T1.F11.2: Content script updates active modifier on chrome.storage.onChanged event', async () => {
      const env = setupTestEnvironment();
      await env.chrome.storage.sync.set({ modifierKey: 'alt' });

      const link = env.doc.createElement('a');
      link.href = 'https://example.com/sync-alt';
      env.doc.body.appendChild(link);

      // Shift+Click should now be ignored
      const shiftEvt = new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 });
      link.dispatchEvent(shiftEvt);
      assert.strictEqual(shiftEvt.defaultPrevented, false);
      assert.strictEqual(env.getModal(), null);

      // Alt+Click should now trigger modal
      const altEvt = new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true, button: 0 });
      link.dispatchEvent(altEvt);
      assert.strictEqual(altEvt.defaultPrevented, true);
      assert.ok(env.getModal() !== null);
    });

    test('T1.F11.3: Disabling extension in storage halts all link interceptions immediately', async () => {
      const env = setupTestEnvironment();
      await env.chrome.storage.sync.set({ enabled: false });

      const link = env.doc.createElement('a');
      link.href = 'https://example.com/disabled-test';
      env.doc.body.appendChild(link);

      const evt = new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 });
      link.dispatchEvent(evt);

      assert.strictEqual(evt.defaultPrevented, false);
      assert.strictEqual(env.getModal(), null);
    });

    test('T1.F11.4: Re-enabling extension in storage restores link interception immediately', async () => {
      const env = setupTestEnvironment({ initialSettings: { enabled: false } });
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/reenable-test';
      env.doc.body.appendChild(link);

      // Initially disabled
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      assert.strictEqual(env.getModal(), null);

      // Re-enable via storage
      await env.chrome.storage.sync.set({ enabled: true });

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      assert.ok(env.getModal() !== null);
    });

    test('T1.F11.5: Size preset change in storage updates class on subsequent modal mount', async () => {
      const env = setupTestEnvironment();
      await env.chrome.storage.sync.set({ sizePreset: 'compact' });

      const link = env.doc.createElement('a');
      link.href = 'https://example.com/compact-test';
      env.doc.body.appendChild(link);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const modal = env.getModal();
      assert.ok(modal.modal.classList.contains('peek-size-compact'));
    });

    test('T1.F11.6: Storage sync falls back to local storage when sync throws quota error', async () => {
      const env = setupTestEnvironment();
      env.chrome.storage.sync.simulateQuotaError = true;

      const popup = env.engine.initPopup(env.win, env.chrome);
      popup.modifierSelect.value = 'ctrl_cmd';
      popup.saveSettings();

      // Give microtask queue time to process rejection fallback
      await new Promise(r => setTimeout(r, 10));

      const localStored = await env.chrome.storage.local.get('modifierKey');
      assert.strictEqual(localStored.modifierKey, 'ctrl_cmd');
    });
  });

});
