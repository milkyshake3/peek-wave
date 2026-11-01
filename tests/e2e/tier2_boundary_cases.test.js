/**
 * tier2_boundary_cases.test.js - Tier 2: Boundary & Corner Cases E2E Tests
 * Validates edge cases, special protocols, nested nodes, modifier combos, and rapid gestures.
 * Pure Node.js with zero external dependencies.
 */

const assert = require('assert');
const { setupTestEnvironment } = require('../harness/extension_loader');
const { MouseEvent, KeyboardEvent, Element } = require('../harness/dom_simulator');

describe('Tier 2: Boundary & Corner Cases', () => {

  // --------------------------------------------------------------------------
  // B1: Deeply Nested DOM Nodes inside Links
  // --------------------------------------------------------------------------
  describe('B1: Deeply Nested DOM Nodes', () => {
    test('T2.B1.1: Click on <span> inside <b> inside <a> resolves anchor URL', () => {
      const env = setupTestEnvironment();
      const anchor = env.doc.createElement('a');
      anchor.href = 'https://example.com/nested-text';

      const bold = env.doc.createElement('b');
      const span = env.doc.createElement('span');
      span.textContent = 'Deeply Nested Text';

      bold.appendChild(span);
      anchor.appendChild(bold);
      env.doc.body.appendChild(anchor);

      const evt = new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 });
      span.dispatchEvent(evt);

      assert.strictEqual(evt.defaultPrevented, true);
      assert.ok(env.getModal() !== null);
      assert.strictEqual(env.getModal().iframe.src, 'https://example.com/nested-text');
    });

    test('T2.B1.2: Click on <img> thumbnail inside <a> resolves anchor URL', () => {
      const env = setupTestEnvironment();
      const anchor = env.doc.createElement('a');
      anchor.href = 'https://example.com/image-link';

      const img = env.doc.createElement('img');
      img.src = 'https://example.com/thumb.png';
      anchor.appendChild(img);
      env.doc.body.appendChild(anchor);

      const evt = new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 });
      img.dispatchEvent(evt);

      assert.strictEqual(evt.defaultPrevented, true);
      assert.strictEqual(env.getModal().iframe.src, 'https://example.com/image-link');
    });

    test('T2.B1.3: Click on card container containing multiple paragraphs inside <a>', () => {
      const env = setupTestEnvironment();
      const anchor = env.doc.createElement('a');
      anchor.href = 'https://example.com/card-article';

      const card = env.doc.createElement('div');
      const p1 = env.doc.createElement('p');
      p1.textContent = 'Paragraph 1';
      const p2 = env.doc.createElement('p');
      p2.textContent = 'Paragraph 2';

      card.appendChild(p1);
      card.appendChild(p2);
      anchor.appendChild(card);
      env.doc.body.appendChild(anchor);

      const evt = new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 });
      p2.dispatchEvent(evt);

      assert.strictEqual(evt.defaultPrevented, true);
      assert.strictEqual(env.getModal().iframe.src, 'https://example.com/card-article');
    });

    test('T2.B1.4: Click on non-anchor element with anchor sibling does not trigger modal', () => {
      const env = setupTestEnvironment();
      const container = env.doc.createElement('div');
      const siblingLink = env.doc.createElement('a');
      siblingLink.href = 'https://example.com/sibling';
      const siblingText = env.doc.createElement('span');
      siblingText.textContent = 'Adjacent plain text';

      container.appendChild(siblingLink);
      container.appendChild(siblingText);
      env.doc.body.appendChild(container);

      const evt = new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 });
      siblingText.dispatchEvent(evt);

      assert.strictEqual(evt.defaultPrevented, false);
      assert.strictEqual(env.getModal(), null);
    });

    test('T2.B1.5: Nested button inside anchor prevents modal if button stops propagation', () => {
      const env = setupTestEnvironment();
      const anchor = env.doc.createElement('a');
      anchor.href = 'https://example.com/outer';
      const btn = env.doc.createElement('button');
      btn.textContent = 'Action';
      anchor.appendChild(btn);
      env.doc.body.appendChild(anchor);

      // In capture phase on window, our listener runs before child listeners
      const evt = new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 });
      btn.dispatchEvent(evt);

      assert.strictEqual(evt.defaultPrevented, true);
      assert.ok(env.getModal() !== null);
    });
  });

  // --------------------------------------------------------------------------
  // B2: SVG Anchors & SVGAnimatedString hrefs
  // --------------------------------------------------------------------------
  describe('B2: SVG Links & SVGAnimatedString', () => {
    test('T2.B2.1: Click on SVG circle inside SVG anchor resolves href and opens modal', () => {
      const env = setupTestEnvironment();
      const svgAnchor = env.doc.createElementNS('http://www.w3.org/2000/svg', 'a');
      svgAnchor.href = 'https://example.com/vector-destination';

      const circle = env.doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
      svgAnchor.appendChild(circle);
      env.doc.body.appendChild(svgAnchor);

      const evt = new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 });
      circle.dispatchEvent(evt);

      assert.strictEqual(evt.defaultPrevented, true);
      assert.ok(env.getModal() !== null);
      assert.strictEqual(env.getModal().iframe.src, 'https://example.com/vector-destination');
    });

    test('T2.B2.2: SVG anchor with relative URL resolves against document.baseURI', () => {
      const env = setupTestEnvironment();
      env.doc.baseURI = 'https://example.com/svg-gallery/';

      const svgAnchor = env.doc.createElementNS('http://www.w3.org/2000/svg', 'a');
      svgAnchor.href = 'details.html';

      const rect = env.doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
      svgAnchor.appendChild(rect);
      env.doc.body.appendChild(svgAnchor);

      const evt = new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 });
      rect.dispatchEvent(evt);

      assert.strictEqual(evt.defaultPrevented, true);
      assert.strictEqual(env.getModal().iframe.src, 'https://example.com/svg-gallery/details.html');
    });

    test('T2.B2.3: SVG anchor without href attribute is ignored', () => {
      const env = setupTestEnvironment();
      const svgAnchor = env.doc.createElementNS('http://www.w3.org/2000/svg', 'a');
      const circle = env.doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
      svgAnchor.appendChild(circle);
      env.doc.body.appendChild(svgAnchor);

      const evt = new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 });
      circle.dispatchEvent(evt);

      assert.strictEqual(evt.defaultPrevented, false);
      assert.strictEqual(env.getModal(), null);
    });

    test('T2.B2.4: SVG element outside any anchor does not trigger modal', () => {
      const env = setupTestEnvironment();
      const svg = env.doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const path = env.doc.createElementNS('http://www.w3.org/2000/svg', 'path');
      svg.appendChild(path);
      env.doc.body.appendChild(svg);

      const evt = new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 });
      path.dispatchEvent(evt);

      assert.strictEqual(evt.defaultPrevented, false);
      assert.strictEqual(env.getModal(), null);
    });

    test('T2.B2.5: SVG anchor with hash fragment only is ignored', () => {
      const env = setupTestEnvironment();
      const svgAnchor = env.doc.createElementNS('http://www.w3.org/2000/svg', 'a');
      svgAnchor.href = '#vector-icon-1';
      const path = env.doc.createElementNS('http://www.w3.org/2000/svg', 'path');
      svgAnchor.appendChild(path);
      env.doc.body.appendChild(svgAnchor);

      const evt = new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 });
      path.dispatchEvent(evt);

      assert.strictEqual(evt.defaultPrevented, false);
      assert.strictEqual(env.getModal(), null);
    });
  });

  // --------------------------------------------------------------------------
  // B3: Non-HTTP Schemes & Special Links
  // --------------------------------------------------------------------------
  describe('B3: Non-HTTP Schemes & Special Links', () => {
    test('T2.B3.1: javascript: links are ignored and allowed to execute natively', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'javascript:void(0)';
      env.doc.body.appendChild(link);

      const evt = new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 });
      link.dispatchEvent(evt);

      assert.strictEqual(evt.defaultPrevented, false, 'javascript: should not be intercepted');
      assert.strictEqual(env.getModal(), null);
    });

    test('T2.B3.2: mailto: links are ignored', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'mailto:hello@example.com';
      env.doc.body.appendChild(link);

      const evt = new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 });
      link.dispatchEvent(evt);

      assert.strictEqual(evt.defaultPrevented, false);
      assert.strictEqual(env.getModal(), null);
    });

    test('T2.B3.3: tel: links are ignored', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'tel:+15551234567';
      env.doc.body.appendChild(link);

      const evt = new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 });
      link.dispatchEvent(evt);

      assert.strictEqual(evt.defaultPrevented, false);
      assert.strictEqual(env.getModal(), null);
    });

    test('T2.B3.4: In-page hash fragments (#section) are ignored', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = '#comments-section';
      env.doc.body.appendChild(link);

      const evt = new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 });
      link.dispatchEvent(evt);

      assert.strictEqual(evt.defaultPrevented, false, 'In-page fragments should not open peek modal');
      assert.strictEqual(env.getModal(), null);
    });

    test('T2.B3.5: data: and blob: schemes are ignored', () => {
      const env = setupTestEnvironment();
      const dataLink = env.doc.createElement('a');
      dataLink.href = 'data:text/html,<h1>Hello</h1>';
      const blobLink = env.doc.createElement('a');
      blobLink.href = 'blob:https://example.com/fake-blob-id';
      env.doc.body.appendChild(dataLink);
      env.doc.body.appendChild(blobLink);

      dataLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      assert.strictEqual(env.getModal(), null);

      blobLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      assert.strictEqual(env.getModal(), null);
    });

    test('T2.B3.6: Links with download attribute are bypassed', () => {
      const env = setupTestEnvironment();
      const downloadLink = env.doc.createElement('a');
      downloadLink.href = 'https://example.com/report.pdf';
      downloadLink.setAttribute('download', 'report.pdf');
      env.doc.body.appendChild(downloadLink);

      const evt = new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 });
      downloadLink.dispatchEvent(evt);

      assert.strictEqual(evt.defaultPrevented, false, 'Download links must be bypassed for native download');
      assert.strictEqual(env.getModal(), null);
    });
  });

  // --------------------------------------------------------------------------
  // B4: Modifier Key Combinations & Variations
  // --------------------------------------------------------------------------
  describe('B4: Modifier Combinations & Variations', () => {
    test('T2.B4.1: Shift + Ctrl simultaneously does not trigger Shift preset', () => {
      const env = setupTestEnvironment({ initialSettings: { modifierKey: 'shift' } });
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/combo-shift-ctrl';
      env.doc.body.appendChild(link);

      // User pressed Ctrl+Shift+Click (Chrome background tab shortcut)
      const evt = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        shiftKey: true,
        ctrlKey: true,
        button: 0
      });
      link.dispatchEvent(evt);

      assert.strictEqual(evt.defaultPrevented, false, 'Must not collide with native Ctrl+Shift+Click');
      assert.strictEqual(env.getModal(), null);
    });

    test('T2.B4.2: Shift + Alt simultaneously does not trigger Shift preset', () => {
      const env = setupTestEnvironment({ initialSettings: { modifierKey: 'shift' } });
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/combo-shift-alt';
      env.doc.body.appendChild(link);

      const evt = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        shiftKey: true,
        altKey: true,
        button: 0
      });
      link.dispatchEvent(evt);

      assert.strictEqual(evt.defaultPrevented, false);
      assert.strictEqual(env.getModal(), null);
    });

    test('T2.B4.3: Alt alone triggers Alt preset cleanly', () => {
      const env = setupTestEnvironment({ initialSettings: { modifierKey: 'alt' } });
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/alt-success';
      env.doc.body.appendChild(link);

      const evt = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        altKey: true,
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        button: 0
      });
      link.dispatchEvent(evt);

      assert.strictEqual(evt.defaultPrevented, true);
      assert.ok(env.getModal() !== null);
    });

    test('T2.B4.4: Ctrl on Windows/Linux triggers ctrl_cmd preset', () => {
      const env = setupTestEnvironment({ initialSettings: { modifierKey: 'ctrl_cmd' } });
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/ctrl-win';
      env.doc.body.appendChild(link);

      const evt = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
        altKey: false,
        button: 0
      });
      link.dispatchEvent(evt);

      assert.strictEqual(evt.defaultPrevented, true);
      assert.ok(env.getModal() !== null);
    });

    test('T2.B4.5: Meta/Cmd on macOS triggers ctrl_cmd preset', () => {
      const env = setupTestEnvironment({ initialSettings: { modifierKey: 'ctrl_cmd' } });
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/cmd-mac';
      env.doc.body.appendChild(link);

      const evt = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        button: 0
      });
      link.dispatchEvent(evt);

      assert.strictEqual(evt.defaultPrevented, true);
      assert.ok(env.getModal() !== null);
    });
  });

  // --------------------------------------------------------------------------
  // B5: Rapid Repeated Clicks & Double Clicks
  // --------------------------------------------------------------------------
  describe('B5: Rapid Repeated Clicks', () => {
    test('T2.B5.1: Double-click in rapid succession maintains single modal instance', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/double-click';
      env.doc.body.appendChild(link);

      // First click
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      // Second rapid click on same link
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const hosts = env.doc.querySelectorAll('#peek-wave-host');
      assert.strictEqual(hosts.length, 1, 'Only one modal host should exist in DOM');
      assert.ok(env.getModal() !== null);
    });

    test('T2.B5.2: Spamming 10 consecutive clicks produces 0 duplicate host elements', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/spam-clicks';
      env.doc.body.appendChild(link);

      for (let i = 0; i < 10; i++) {
        link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      }

      const hosts = env.doc.querySelectorAll('#peek-wave-host');
      assert.strictEqual(hosts.length, 1);
      assert.strictEqual(env.getModal().iframe.src, 'https://example.com/spam-clicks');
    });

    test('T2.B5.3: Rapid switching between 3 distinct links updates modal src to latest link', () => {
      const env = setupTestEnvironment();
      const l1 = env.doc.createElement('a');
      l1.href = 'https://example.com/alpha';
      const l2 = env.doc.createElement('a');
      l2.href = 'https://example.com/beta';
      const l3 = env.doc.createElement('a');
      l3.href = 'https://example.com/gamma';
      env.doc.body.appendChild(l1);
      env.doc.body.appendChild(l2);
      env.doc.body.appendChild(l3);

      l1.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      l2.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      l3.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      assert.strictEqual(env.getModal().iframe.src, 'https://example.com/gamma');
      assert.strictEqual(env.doc.querySelectorAll('#peek-wave-host').length, 1);
    });

    test('T2.B5.4: Normal click immediately after Shift+Click does not destroy or mutate open modal', () => {
      const env = setupTestEnvironment();
      const link1 = env.doc.createElement('a');
      link1.href = 'https://example.com/peeked';
      const link2 = env.doc.createElement('a');
      link2.href = 'https://example.com/normal';
      env.doc.body.appendChild(link1);
      env.doc.body.appendChild(link2);

      link1.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      assert.ok(env.getModal() !== null);

      // Normal click without shift
      link2.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: false, button: 0 }));

      // Open modal remains intact
      assert.ok(env.getModal() !== null);
      assert.strictEqual(env.getModal().iframe.src, 'https://example.com/peeked');
    });

    test('T2.B5.5: Rapid click with unconfigured modifier is bypassed without creating modal', () => {
      const env = setupTestEnvironment({ initialSettings: { modifierKey: 'shift' } });
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/ignored-alt';
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true, button: 0 }));
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true, button: 0 }));

      assert.strictEqual(env.getModal(), null);
    });
  });

  // --------------------------------------------------------------------------
  // B6: Double Dismissals & Rapid Escape Spamming
  // --------------------------------------------------------------------------
  describe('B6: Double Dismissals & Escape Spamming', () => {
    test('T2.B6.1: Pressing Escape 5 times in a row closes modal on first key and does not error', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/esc-spam';
      env.doc.body.appendChild(link);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      assert.ok(env.getModal() !== null);

      for (let i = 0; i < 5; i++) {
        env.win.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
      }

      assert.strictEqual(env.getModal(), null);
      assert.strictEqual(env.doc.getElementById('peek-wave-host'), null);
    });

    test('T2.B6.2: Pressing Escape when NO modal is open executes cleanly without error', () => {
      const env = setupTestEnvironment();
      assert.doesNotThrow(() => {
        env.win.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
      });
    });

    test('T2.B6.3: Clicking Close button twice rapidly does not error', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/double-close';
      env.doc.body.appendChild(link);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const closeBtn = env.getModal().closeBtn;
      assert.doesNotThrow(() => {
        closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      });

      assert.strictEqual(env.getModal(), null);
    });

    test('T2.B6.4: Invoking teardownModal() directly when no modal is active is safe no-op', () => {
      const env = setupTestEnvironment();
      assert.doesNotThrow(() => {
        env.teardown();
        env.teardown();
      });
    });

    test('T2.B6.5: Backdrop click followed immediately by Escape does not throw', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/backdrop-and-esc';
      env.doc.body.appendChild(link);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const modal = env.getModal();
      assert.doesNotThrow(() => {
        modal.backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        env.win.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
      });

      assert.strictEqual(env.getModal(), null);
    });
  });

  // --------------------------------------------------------------------------
  // B7: Malformed, Extreme Length, and Unicode URLs
  // --------------------------------------------------------------------------
  describe('B7: Complex and Extreme URLs', () => {
    test('T2.B7.1: Extremely long URL (>2000 chars) opens modal without error', () => {
      const env = setupTestEnvironment();
      const longQuery = 'param='.repeat(400);
      const longUrl = `https://example.com/deep/path?${longQuery}`;

      const link = env.doc.createElement('a');
      link.href = longUrl;
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      assert.ok(env.getModal() !== null);
      assert.strictEqual(env.getModal().iframe.src, longUrl);
    });

    test('T2.B7.2: URL with heavy query parameters and arrays opens properly', () => {
      const env = setupTestEnvironment();
      const complexUrl = 'https://api.github.com/search/issues?q=repo:facebook/react+is:issue&page=1&per_page=100';

      const link = env.doc.createElement('a');
      link.href = complexUrl;
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const modal = env.getModal();
      assert.ok(modal !== null);
      const host = env.doc.getElementById('peek-wave-host');
      const domainEl = host.shadowRoot.querySelector('.peek-wave-domain');
      assert.strictEqual(domainEl.textContent, 'api.github.com');
    });

    test('T2.B7.3: Deep multi-tier subdomain correctly formats displayDomain', () => {
      const env = setupTestEnvironment();
      const subUrl = 'https://auth.staging.dev.mycompany.org/login';

      const link = env.doc.createElement('a');
      link.href = subUrl;
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const host = env.doc.getElementById('peek-wave-host');
      const domainEl = host.shadowRoot.querySelector('.peek-wave-domain');
      assert.strictEqual(domainEl.textContent, 'auth.staging.dev.mycompany.org');
    });

    test('T2.B7.4: URL with custom non-standard port displays domain properly', () => {
      const env = setupTestEnvironment();
      const portUrl = 'https://localhost:8443/admin';

      const link = env.doc.createElement('a');
      link.href = portUrl;
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const host = env.doc.getElementById('peek-wave-host');
      const domainEl = host.shadowRoot.querySelector('.peek-wave-domain');
      assert.strictEqual(domainEl.textContent, 'localhost');
    });

    test('T2.B7.5: Invalid href string that cannot parse as URL is safely ignored without throwing', () => {
      const env = setupTestEnvironment();
      const badLink = env.doc.createElement('a');
      badLink.setAttribute('href', 'http://::invalid::');
      env.doc.body.appendChild(badLink);

      assert.doesNotThrow(() => {
        badLink.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      });

      assert.strictEqual(env.getModal(), null);
    });
  });

});
