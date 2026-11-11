/**
 * tier4_real_world.test.js - Tier 4: Real-World Application Scenarios E2E Tests
 * Validates realistic, multi-step end-to-end user journeys mirroring actual daily browsing workflows.
 * Pure Node.js with zero external dependencies.
 */

const assert = require('assert');
const { setupTestEnvironment } = require('../harness/extension_loader');
const { MouseEvent, KeyboardEvent } = require('../harness/dom_simulator');

describe('Tier 4: Real-World Application Scenarios', () => {

  // --------------------------------------------------------------------------
  // Scenario 1: Documentation Browsing & Multi-Link Peeking
  // --------------------------------------------------------------------------
  describe('S1: Documentation Browsing & Multi-Link Peeking', () => {
    test('T4.S1.1: Peeking first API reference link opens modal and Escape closes cleanly', () => {
      const env = setupTestEnvironment();
      const docLink1 = env.doc.createElement('a');
      docLink1.href = 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API';
      docLink1.textContent = 'Fetch API Reference';
      env.doc.body.appendChild(docLink1);

      // User peeks first link
      docLink1.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const modal = env.getModal();
      assert.ok(modal !== null);
      assert.strictEqual(modal.iframe.src, 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API');

      // User dismisses via Escape
      env.win.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
      assert.strictEqual(env.getModal(), null);
      assert.strictEqual(env.doc.getElementById('peek-wave-host'), null);
    });

    test('T4.S1.2: Peeking second API link immediately after first teardown functions with zero state bleed', () => {
      const env = setupTestEnvironment();
      const link1 = env.doc.createElement('a');
      link1.href = 'https://developer.mozilla.org/en-US/docs/Web/API/Request';
      const link2 = env.doc.createElement('a');
      link2.href = 'https://developer.mozilla.org/en-US/docs/Web/API/Response';
      env.doc.body.appendChild(link1);
      env.doc.body.appendChild(link2);

      // Peek and close link 1
      link1.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      env.win.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));

      // Peek link 2 and close via backdrop
      link2.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      const modal2 = env.getModal();
      assert.ok(modal2 !== null);
      assert.strictEqual(modal2.iframe.src, 'https://developer.mozilla.org/en-US/docs/Web/API/Response');

      modal2.backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      assert.strictEqual(env.getModal(), null);
    });

    test('T4.S1.3: Normal link navigation without Shift inside documentation is allowed normally', () => {
      const env = setupTestEnvironment();
      const normalLink = env.doc.createElement('a');
      normalLink.href = 'https://developer.mozilla.org/en-US/docs/Web/JavaScript';
      env.doc.body.appendChild(normalLink);

      const evt = new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: false, button: 0 });
      normalLink.dispatchEvent(evt);

      assert.strictEqual(evt.defaultPrevented, false, 'Default navigation must be permitted');
      assert.strictEqual(env.getModal(), null);
    });

    test('T4.S1.4: Peeking third API link and closing via Close button', () => {
      const env = setupTestEnvironment();
      const link3 = env.doc.createElement('a');
      link3.href = 'https://developer.mozilla.org/en-US/docs/Web/API/Headers';
      env.doc.body.appendChild(link3);

      link3.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      const modal = env.getModal();
      assert.ok(modal !== null);

      modal.closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      assert.strictEqual(env.getModal(), null);
    });

    test('T4.S1.5: End of documentation browsing session leaves 0 lingering hosts in DOM', () => {
      const env = setupTestEnvironment();
      const links = ['https://mdn.io/1', 'https://mdn.io/2', 'https://mdn.io/3'];

      for (const u of links) {
        const a = env.doc.createElement('a');
        a.href = u;
        env.doc.body.appendChild(a);
        a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
        env.teardown();
      }

      assert.strictEqual(env.doc.querySelectorAll('#peek-wave-host').length, 0);
      assert.strictEqual(env.getModal(), null);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Social Media Feed with Deeply Nested Media Cards
  // --------------------------------------------------------------------------
  describe('S2: Social Media Feed with Nested Media Cards', () => {
    test('T4.S2.1: Clicking post thumbnail image opens preview modal for the post URL', () => {
      const env = setupTestEnvironment();
      const cardLink = env.doc.createElement('a');
      cardLink.href = 'https://x.com/chromium/status/123456789';
      cardLink.className = 'tweet-card-link';

      const img = env.doc.createElement('img');
      img.src = 'https://pbs.twimg.com/media/preview.jpg';
      img.className = 'tweet-thumbnail';
      cardLink.appendChild(img);
      env.doc.body.appendChild(cardLink);

      img.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const modal = env.getModal();
      assert.ok(modal !== null);
      assert.strictEqual(modal.iframe.src, 'https://x.com/chromium/status/123456789');
      env.teardown();
    });

    test('T4.S2.2: Clicking author username badge inside post link resolves post destination', () => {
      const env = setupTestEnvironment();
      const cardLink = env.doc.createElement('a');
      cardLink.href = 'https://reddit.com/r/javascript/comments/abc123';

      const userBadge = env.doc.createElement('span');
      userBadge.className = 'author-badge';
      userBadge.textContent = 'u/developer';
      cardLink.appendChild(userBadge);
      env.doc.body.appendChild(cardLink);

      userBadge.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      assert.strictEqual(env.getModal().iframe.src, 'https://reddit.com/r/javascript/comments/abc123');
      env.teardown();
    });

    test('T4.S2.3: Clicking plain post content outside links does not trigger modal', () => {
      const env = setupTestEnvironment();
      const postContainer = env.doc.createElement('article');
      const postText = env.doc.createElement('p');
      postText.textContent = 'This is a discussion post without links.';
      postContainer.appendChild(postText);
      env.doc.body.appendChild(postContainer);

      const evt = new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 });
      postText.dispatchEvent(evt);

      assert.strictEqual(evt.defaultPrevented, false);
      assert.strictEqual(env.getModal(), null);
    });

    test('T4.S2.4: External link card in feed formats domain in modal header properly', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://nytimes.com/2026/10/31/technology/ai-update.html';
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const host = env.doc.getElementById('peek-wave-host');
      const domainEl = host.shadowRoot.querySelector('.peek-wave-domain');
      assert.strictEqual(domainEl.textContent, 'nytimes.com');
      env.teardown();
    });

    test('T4.S2.5: Dismissing modal leaves host feed page completely unperturbed', () => {
      const env = setupTestEnvironment();
      const feedRoot = env.doc.createElement('div');
      feedRoot.id = 'feed-root';
      env.doc.body.appendChild(feedRoot);

      const link = env.doc.createElement('a');
      link.href = 'https://example.com/feed-item';
      feedRoot.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      assert.ok(env.getModal() !== null);

      env.teardown();

      // Feed root exists and is intact
      assert.ok(env.doc.getElementById('feed-root') !== null);
      assert.strictEqual(env.doc.getElementById('peek-wave-host'), null);
    });

    test('T4.S2.6: Clicking t.co link in tweet opens preview modal with t.co URL for redirect resolution', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://t.co/XyZ123Preview';
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const modal = env.getModal();
      assert.ok(modal !== null);
      assert.strictEqual(modal.iframe.src, 'https://t.co/XyZ123Preview');
      assert.ok(modal.iframe.sandbox.contains('allow-scripts'));
      assert.ok(modal.iframe.sandbox.contains('allow-same-origin'));
      assert.ok(!modal.iframe.sandbox.contains('allow-top-navigation'));
      env.teardown();
    });

    test('T4.S2.7: Preview modal created on host page x.com does not set inline event handlers violating CSP', () => {
      const env = setupTestEnvironment();
      env.doc.baseURI = 'https://x.com/home';
      const link = env.doc.createElement('a');
      link.href = 'https://github.com/trending';
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const modal = env.getModal();
      assert.ok(modal !== null);
      const favicon = modal.shadowRoot.querySelector('.peek-wave-favicon');
      assert.strictEqual(favicon.onerror, null, 'Must not set inline onerror on x.com');
      env.teardown();
    });

    test('T4.S2.8: Host page Service Worker unregistration triggers on modal mount', async () => {
      const env = setupTestEnvironment();
      let unregistered = false;
      env.win.navigator.serviceWorker = {
        getRegistrations: async () => [{
          unregister: async () => { unregistered = true; return true; }
        }]
      };

      const link = env.doc.createElement('a');
      link.href = 'https://x.com/elonmusk';
      env.doc.body.appendChild(link);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      // Allow async unregistration microtask to complete
      await Promise.resolve();
      await Promise.resolve();

      assert.strictEqual(unregistered, true, 'Service worker on host page must be unregistered');
      env.teardown();
    });

    test('T4.S2.9: Clicking tweet link with title attribute unwraps raw destination and cleans tracking parameters', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://t.co/article123';
      link.setAttribute('title', 'https://www.theverge.com/tech/2026/future-ai?utm_source=twitter&utm_medium=social');
      link.textContent = 'theverge.com/tech/2026/fut…';
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const modal = env.getModal();
      assert.ok(modal !== null, 'Modal must be mounted');
      assert.strictEqual(modal.iframe.src, 'https://www.theverge.com/tech/2026/future-ai', 'Must load unwrapped target with UTM stripped');
      const domainPill = modal.shadowRoot.querySelector('.peek-wave-domain');
      assert.strictEqual(domainPill.textContent, 'theverge.com', 'Domain pill must display clean destination domain');
      env.teardown();
    });

    test('T4.S2.10: Clicking tweet card with data-expanded-url unwraps directly without framing t.co', () => {
      const env = setupTestEnvironment();
      const card = env.doc.createElement('div');
      card.setAttribute('data-testid', 'card.wrapper');
      card.setAttribute('data-expanded-url', 'https://github.com/google/gemini?ref_src=twsrc');

      const cardLink = env.doc.createElement('a');
      cardLink.href = 'https://t.co/cardShort123';
      const cardText = env.doc.createElement('span');
      cardText.textContent = 'Google Gemini Source';
      cardLink.appendChild(cardText);
      card.appendChild(cardLink);
      env.doc.body.appendChild(card);

      cardText.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const modal = env.getModal();
      assert.ok(modal !== null);
      assert.strictEqual(modal.iframe.src, 'https://github.com/google/gemini');
      env.teardown();
    });

    test('T4.S2.11: Clicking YouTube link in tweet feed preserves timestamp parameter t=30s while stripping utm_source', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://t.co/ytVideoShort';
      link.setAttribute('title', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s&utm_source=twitter');
      link.textContent = 'youtube.com/watch?v=dQw4w…';
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const modal = env.getModal();
      assert.ok(modal !== null);
      assert.strictEqual(modal.iframe.src, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s', 'YouTube timestamp t=30s must be preserved');
      env.teardown();
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Full Preview-to-Tab Handoff Workflow
  // --------------------------------------------------------------------------
  describe('S3: Full Preview-to-Tab Handoff Workflow', () => {
    test('T4.S3.1: User peeks an article and inspects modal header details', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://news.ycombinator.com/item?id=999999';
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      const modal = env.getModal();
      assert.ok(modal !== null);
      const host = env.doc.getElementById('peek-wave-host');
      const domain = host.shadowRoot.querySelector('.peek-wave-domain');
      assert.strictEqual(domain.textContent, 'news.ycombinator.com');
    });

    test('T4.S3.2: User copies article URL to clipboard before tab handoff', async () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://news.ycombinator.com/item?id=999999';
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      const modal = env.getModal();

      modal.copyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      assert.strictEqual(modal.copyTooltip.textContent, 'Copied!');
      assert.strictEqual(env.win._clipboardText, 'https://news.ycombinator.com/item?id=999999');
    });

    test('T4.S3.3: User clicks Open in New Tab and dispatches OPEN_TAB message', async () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://news.ycombinator.com/item?id=999999';
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      const modal = env.getModal();

      modal.tabBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 5));

      assert.strictEqual(env.chrome.createdTabs.length, 1);
      assert.strictEqual(env.chrome.createdTabs[0].url, 'https://news.ycombinator.com/item?id=999999');
      assert.strictEqual(env.chrome.createdTabs[0].active, true);
    });

    test('T4.S3.4: Host page modal is synchronously torn down upon Open in New Tab click', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/handoff-sync-teardown';
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      const modal = env.getModal();

      modal.tabBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      assert.strictEqual(env.getModal(), null);
      assert.strictEqual(env.doc.getElementById('peek-wave-host'), null);
    });

    test('T4.S3.5: User can immediately peek another link on the host page after tab handoff', () => {
      const env = setupTestEnvironment();
      const link1 = env.doc.createElement('a');
      link1.href = 'https://example.com/item-1';
      const link2 = env.doc.createElement('a');
      link2.href = 'https://example.com/item-2';
      env.doc.body.appendChild(link1);
      env.doc.body.appendChild(link2);

      // Hand off link 1
      link1.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      env.getModal().tabBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      // Peek link 2
      link2.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));

      assert.ok(env.getModal() !== null);
      assert.strictEqual(env.getModal().iframe.src, 'https://example.com/item-2');
      env.teardown();
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 4: User Settings Customization & Live Tab Sync Workflow
  // --------------------------------------------------------------------------
  describe('S4: User Settings Customization & Tab Sync', () => {
    test('T4.S4.1: Initial browsing session uses Shift + Click default', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/s4-1';
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      assert.ok(env.getModal() !== null);
      env.teardown();
    });

    test('T4.S4.2: User adjusts modifier to Alt and size preset to Large in popup', async () => {
      const env = setupTestEnvironment();
      const popup = env.engine.initPopup(env.win, env.chrome);

      popup.modifierSelect.value = 'alt';
      popup.sizeSelect.value = 'large';
      popup.saveSettings();

      await new Promise(r => setTimeout(r, 5));

      const stored = await env.chrome.storage.sync.get(['modifierKey', 'sizePreset']);
      assert.strictEqual(stored.modifierKey, 'alt');
      assert.strictEqual(stored.sizePreset, 'large');
    });

    test('T4.S4.3: Active tab receives storage change without requiring a reload', async () => {
      const env = setupTestEnvironment();
      await env.chrome.storage.sync.set({ modifierKey: 'alt', sizePreset: 'large' });

      // Shift should no longer work
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/s4-no-reload';
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      assert.strictEqual(env.getModal(), null);
    });

    test('T4.S4.4: User triggers preview with new Alt modifier and Large modal preset renders', async () => {
      const env = setupTestEnvironment();
      await env.chrome.storage.sync.set({ modifierKey: 'alt', sizePreset: 'large' });

      const link = env.doc.createElement('a');
      link.href = 'https://example.com/s4-alt-large';
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true, button: 0 }));

      const modal = env.getModal();
      assert.ok(modal !== null);
      assert.ok(modal.modal.classList.contains('peek-size-large'));
      env.teardown();
    });

    test('T4.S4.5: User toggles extension off in popup and clicks are completely bypassed', async () => {
      const env = setupTestEnvironment();
      await env.chrome.storage.sync.set({ enabled: false });

      const link = env.doc.createElement('a');
      link.href = 'https://example.com/s4-disabled';
      env.doc.body.appendChild(link);

      const evt = new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 });
      link.dispatchEvent(evt);

      assert.strictEqual(evt.defaultPrevented, false);
      assert.strictEqual(env.getModal(), null);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Repeated Sessions & Zero-Leak Memory Stress Test
  // --------------------------------------------------------------------------
  describe('S5: Repeated Sessions & Low-RAM Audit', () => {
    test('T4.S5.1: 25 consecutive open and dismiss sessions execute cleanly', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/stress-test';
      env.doc.body.appendChild(link);

      const dismissalMethods = ['esc', 'backdrop', 'closeBtn', 'tab'];

      for (let i = 0; i < 25; i++) {
        link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
        const modal = env.getModal();
        assert.ok(modal !== null, `Iteration ${i}: Modal must open`);

        const method = dismissalMethods[i % dismissalMethods.length];
        if (method === 'esc') {
          env.win.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
        } else if (method === 'backdrop') {
          modal.backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        } else if (method === 'closeBtn') {
          modal.closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        } else if (method === 'tab') {
          modal.tabBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }

        assert.strictEqual(env.getModal(), null, `Iteration ${i}: Modal must be null after ${method}`);
        assert.strictEqual(env.doc.getElementById('peek-wave-host'), null, `Iteration ${i}: Host must be removed`);
      }
    });

    test('T4.S5.2: At every teardown iframe.src is reset to about:blank to kill media/workers', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/media-stream';
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      const iframe = env.getModal().iframe;

      env.teardown();

      assert.strictEqual(iframe.src, 'about:blank');
    });

    test('T4.S5.3: Window keydown listener is unbound after teardown', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/listener-count';
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      env.teardown();

      const listeners = env.win._listeners.get('keydown') || [];
      assert.strictEqual(listeners.length, 0, 'No keydown listeners should remain on window');
    });

    test('T4.S5.4: DocumentElement child count remains constant before and after sessions', () => {
      const env = setupTestEnvironment();
      const initialCount = env.doc.documentElement.childNodes.length;

      for (let i = 0; i < 5; i++) {
        const link = env.doc.createElement('a');
        link.href = `https://example.com/page-${i}`;
        env.doc.body.appendChild(link);

        link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
        env.teardown();
      }

      assert.strictEqual(env.doc.documentElement.childNodes.length, initialCount);
    });

    test('T4.S5.5: Final state verification: zero open modals, zero created orphaned iframes', () => {
      const env = setupTestEnvironment();
      const link = env.doc.createElement('a');
      link.href = 'https://example.com/final-audit';
      env.doc.body.appendChild(link);

      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true, button: 0 }));
      env.teardown();

      assert.strictEqual(env.getModal(), null);
      assert.strictEqual(env.doc.querySelectorAll('iframe').length, 0);
      assert.strictEqual(env.doc.querySelectorAll('#peek-wave-host').length, 0);
    });
  });

});
