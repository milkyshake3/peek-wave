/**
 * reference_engine.js - Authoritative behavioral reference engine & oracle for Peek Wave
 * Conforms 100% to specifications in ORIGINAL_REQUEST.md and PROJECT.md.
 */

function createReferenceEngine() {
  let currentModal = null;
  let activeSettings = {
    enabled: true,
    modifierKey: 'shift',
    sizePreset: 'default'
  };

  function parseUrlDetails(rawUrl, baseURI = 'https://example.com/') {
    try {
      const parsed = new URL(rawUrl, baseURI);
      const hostname = parsed.hostname;
      const displayDomain = hostname.replace(/^www\./i, '');
      let pathSnippet = parsed.pathname;
      if (pathSnippet === '/' || !pathSnippet) {
        pathSnippet = '';
      } else if (pathSnippet.length > 24) {
        pathSnippet = pathSnippet.substring(0, 21) + '…';
      }
      return {
        fullUrl: parsed.href,
        hostname,
        displayDomain,
        pathSnippet,
        protocol: parsed.protocol,
        hash: parsed.hash
      };
    } catch {
      return null;
    }
  }

  function isModifierActive(e, configuredModifier) {
    switch (configuredModifier) {
      case 'shift':
        return Boolean(e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey);
      case 'alt':
        return Boolean(e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey);
      case 'ctrl_cmd':
        return Boolean((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey);
      default:
        return Boolean(e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey);
    }
  }

  function extractAnchorUrl(target, baseURI) {
    if (!target || typeof target.closest !== 'function') return null;
    const anchor = target.closest('a[href]');
    if (!anchor) return null;

    // Check download attribute
    if (anchor.hasAttribute('download')) return null;

    let rawHref = null;
    if (typeof anchor.href === 'string') {
      rawHref = anchor.getAttribute('href') || anchor.href;
    } else if (anchor.href && typeof anchor.href.baseVal === 'string') {
      rawHref = anchor.href.baseVal;
    } else {
      rawHref = anchor.getAttribute('href');
    }

    if (!rawHref) return null;
    const details = parseUrlDetails(rawHref, baseURI);
    if (details) {
      details.rawHref = rawHref;
    }
    return details;
  }

  function isNavigableHttp(urlDetails, currentUrl) {
    if (!urlDetails) return false;
    if (urlDetails.rawHref && urlDetails.rawHref.startsWith('#')) return false;
    const proto = urlDetails.protocol.toLowerCase();
    if (proto !== 'http:' && proto !== 'https:') return false;

    // Filter same-page fragments
    if (currentUrl) {
      const currentNoHash = currentUrl.href.split('#')[0];
      const targetNoHash = urlDetails.fullUrl.split('#')[0];
      if (currentNoHash === targetNoHash && Boolean(urlDetails.hash)) {
        return false;
      }
    }
    return true;
  }

  function teardownModal(win) {
    if (!currentModal) return;
    const {
      hostElement,
      iframe,
      keydownHandler,
      backdrop,
      backdropHandler,
      closeBtn,
      closeHandler,
      copyTimeout,
      loadingTimeout
    } = currentModal;

    // Step 1: Unbind global listeners
    if (keydownHandler && win) {
      win.removeEventListener('keydown', keydownHandler, { capture: true });
    }

    // Step 2: Clear timers & UI listeners
    if (copyTimeout) clearTimeout(copyTimeout);
    if (loadingTimeout) clearTimeout(loadingTimeout);
    if (backdrop && backdropHandler) {
      backdrop.removeEventListener('click', backdropHandler);
    }
    if (closeBtn && closeHandler) {
      closeBtn.removeEventListener('click', closeHandler);
    }

    // Step 3: Clear iframe src to about:blank
    if (iframe) {
      iframe.onload = null;
      iframe.onerror = null;
      try {
        iframe.src = 'about:blank';
      } catch {}
      // Step 4: Detach iframe from modal
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    }

    // Step 5: Detach shadow host container
    if (hostElement && hostElement.parentNode) {
      hostElement.parentNode.removeChild(hostElement);
    }

    // Step 6: Break object references
    currentModal = null;
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  function createSvgElement(doc, className, children) {
    const createNode = (tag) => {
      return (typeof doc.createElementNS === 'function')
        ? doc.createElementNS(SVG_NS, tag)
        : doc.createElement(tag);
    };
    const svg = createNode('svg');
    svg.setAttribute('class', className);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    if (Array.isArray(children)) {
      for (const childSpec of children) {
        const child = createNode(childSpec.tag);
        if (childSpec.attrs) {
          for (const [attrName, attrVal] of Object.entries(childSpec.attrs)) {
            child.setAttribute(attrName, attrVal);
          }
        }
        svg.appendChild(child);
      }
    }
    return svg;
  }

  function resolveFaviconUrl(urlDetails, doc, win) {
    try {
      const parsed = new URL(urlDetails.fullUrl);
      const targetOrigin = parsed.origin;
      const currentOrigin = win?.location?.origin || (doc?.location?.origin) || '';

      if (currentOrigin && currentOrigin === targetOrigin && doc) {
        const iconEl = doc.querySelector('link[rel~="icon"]') || doc.querySelector('link[rel*="icon"]');
        if (iconEl) {
          const href = iconEl.getAttribute('href') || iconEl.href;
          if (href) {
            try {
              return new URL(href, currentOrigin).href;
            } catch {}
          }
        }
      }

      return `${targetOrigin}/favicon.ico`;
    } catch {
      const proto = urlDetails?.protocol || 'https:';
      const host = urlDetails?.hostname || 'example.com';
      return `${proto}//${host}/favicon.ico`;
    }
  }

  function mountModal(win, chrome, targetUrl) {
    if (currentModal) {
      teardownModal(win);
    }

    const doc = win.document;
    const urlDetails = parseUrlDetails(targetUrl, doc.baseURI);

    // Host element
    const hostElement = doc.createElement('peek-wave-container');
    hostElement.id = 'peek-wave-host';
    hostElement.style.cssText = 'all: initial !important; position: fixed !important; z-index: 2147483647 !important;';

    // Open Shadow DOM
    const shadowRoot = hostElement.attachShadow({ mode: 'open' });

    // Backdrop
    const backdrop = doc.createElement('div');
    backdrop.className = 'peek-wave-backdrop';

    // Modal Window
    const modal = doc.createElement('div');
    const sizeClass = `peek-size-${activeSettings.sizePreset || 'default'}`;
    modal.className = `peek-wave-modal ${sizeClass}`;

    // Header Bar
    const header = doc.createElement('header');
    header.className = 'peek-wave-header';

    const headerLeft = doc.createElement('div');
    headerLeft.className = 'peek-wave-header-left';

    const favicon = doc.createElement('img');
    favicon.className = 'peek-wave-favicon';
    favicon.src = resolveFaviconUrl(urlDetails, doc, win);

    const domainSpan = doc.createElement('span');
    domainSpan.className = 'peek-wave-domain';
    domainSpan.textContent = urlDetails.displayDomain;

    const spinner = doc.createElement('div');
    spinner.className = 'peek-wave-loader-spinner';

    headerLeft.appendChild(favicon);
    headerLeft.appendChild(domainSpan);
    headerLeft.appendChild(spinner);

    const progressBar = doc.createElement('div');
    progressBar.className = 'peek-wave-progress-bar';

    const headerActions = doc.createElement('div');
    headerActions.className = 'peek-wave-header-actions';

    // Copy Link Button
    const copyBtn = doc.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'peek-wave-btn peek-wave-btn-copy';
    copyBtn.title = 'Copy Link';
    const copySvg = createSvgElement(doc, 'peek-icon-copy', [
      { tag: 'rect', attrs: { x: '9', y: '9', width: '13', height: '13', rx: '2', ry: '2' } },
      { tag: 'path', attrs: { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' } }
    ]);
    copyBtn.appendChild(copySvg);
    const copyTooltip = doc.createElement('span');
    copyTooltip.className = 'peek-wave-tooltip';
    copyTooltip.textContent = 'Copy';
    copyBtn.appendChild(copyTooltip);

    let copyTimeout = null;
    const copyHandler = (e) => {
      e.stopPropagation();
      copyTooltip.textContent = 'Copied!';
      let copied = false;
      if (win.navigator?.clipboard?.writeText) {
        win.navigator.clipboard.writeText(urlDetails.fullUrl).catch(() => {});
        copied = true;
      }
      if (!copied && doc.execCommand) {
        doc.execCommand('copy');
      }
      copyTimeout = setTimeout(() => {
        copyTooltip.textContent = 'Copy';
      }, 1500);
    };
    copyBtn.addEventListener('click', copyHandler);

    // Open in New Tab Button
    const tabBtn = doc.createElement('button');
    tabBtn.type = 'button';
    tabBtn.className = 'peek-wave-btn peek-wave-btn-tab';
    tabBtn.title = 'Open in New Tab';
    const tabSvg = createSvgElement(doc, 'peek-icon-tab', [
      { tag: 'path', attrs: { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' } },
      { tag: 'polyline', attrs: { points: '15 3 21 3 21 9' } },
      { tag: 'line', attrs: { x1: '10', y1: '14', x2: '21', y2: '3' } }
    ]);
    tabBtn.appendChild(tabSvg);
    const tabHandler = (e) => {
      e.stopPropagation();
      if (chrome?.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ action: 'OPEN_TAB', url: urlDetails.fullUrl });
      }
      teardownModal(win);
    };
    tabBtn.addEventListener('click', tabHandler);

    // Close Button
    const closeBtn = doc.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'peek-wave-btn peek-wave-btn-close';
    closeBtn.title = 'Close (Esc)';
    const closeSvg = createSvgElement(doc, 'peek-icon-close', [
      { tag: 'line', attrs: { x1: '18', y1: '6', x2: '6', y2: '18' } },
      { tag: 'line', attrs: { x1: '6', y1: '6', x2: '18', y2: '18' } }
    ]);
    closeBtn.appendChild(closeSvg);
    const closeHandler = (e) => {
      e.stopPropagation();
      teardownModal(win);
    };
    closeBtn.addEventListener('click', closeHandler);

    headerActions.appendChild(copyBtn);
    headerActions.appendChild(tabBtn);
    headerActions.appendChild(closeBtn);

    header.appendChild(headerLeft);
    header.appendChild(progressBar);
    header.appendChild(headerActions);

    // Iframe wrapper
    const iframeWrapper = doc.createElement('div');
    iframeWrapper.className = 'peek-wave-iframe-wrapper';

    const iframe = doc.createElement('iframe');
    iframe.className = 'peek-wave-iframe';
    iframe.src = urlDetails.fullUrl;
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads');

    iframeWrapper.appendChild(iframe);

    modal.appendChild(header);
    modal.appendChild(iframeWrapper);
    backdrop.appendChild(modal);
    shadowRoot.appendChild(backdrop);

    // Backdrop click dismissal
    const backdropHandler = (e) => {
      if (e.target === backdrop) {
        e.preventDefault();
        e.stopPropagation();
        teardownModal(win);
      }
    };
    backdrop.addEventListener('click', backdropHandler);

    // Global Escape Keydown listener in capture phase
    const keydownHandler = (e) => {
      if (e.key === 'Escape' || e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        teardownModal(win);
      }
    };
    win.addEventListener('keydown', keydownHandler, { capture: true });

    // Mount to document.documentElement
    (doc.documentElement || doc.body).appendChild(hostElement);

    currentModal = {
      win,
      hostElement,
      shadowRoot,
      modal,
      backdrop,
      iframe,
      closeBtn,
      tabBtn,
      copyBtn,
      copySvg,
      tabSvg,
      closeSvg,
      copyTooltip,
      copyTimeout,
      keydownHandler,
      backdropHandler,
      closeHandler,
      tabHandler,
      copyHandler
    };

    return currentModal;
  }

  function initContentScript(win, chrome) {
    // Load storage settings
    if (chrome?.storage?.sync) {
      chrome.storage.sync.get(['enabled', 'modifierKey', 'sizePreset'], (items) => {
        if (items) {
          activeSettings = { ...activeSettings, ...items };
        }
      });
    }

    // Subscribe to live storage changes
    if (chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes) => {
        for (const [k, change] of Object.entries(changes)) {
          if (change && change.newValue !== undefined) {
            activeSettings[k] = change.newValue;
          }
        }
      });
    }

    // Capture phase link click interceptor on window
    const clickHandler = (e) => {
      if (!activeSettings.enabled) return;
      if (e.button !== 0) return; // Only primary left-click

      if (!isModifierActive(e, activeSettings.modifierKey)) return;

      const urlDetails = extractAnchorUrl(e.target, win.document.baseURI);
      if (!urlDetails) return;

      if (!isNavigableHttp(urlDetails, win.location)) return;

      // Intercept and prevent host page navigation & browser window popups
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      mountModal(win, chrome, urlDetails.fullUrl);
    };

    win.addEventListener('click', clickHandler, { capture: true });

    return {
      getModal: () => currentModal,
      teardown: () => teardownModal(win),
      getSettings: () => ({ ...activeSettings }),
      setSettings: (s) => { activeSettings = { ...activeSettings, ...s }; }
    };
  }

  function initBackgroundWorker(chrome) {
    const handler = (message, sender, sendResponse) => {
      if (message && message.action === 'OPEN_TAB') {
        chrome.tabs.create({ url: message.url, active: true }, (tab) => {
          sendResponse({ success: true, tabId: tab.id });
        });
        return true; // asynchronous response
      }
      if (message && (message.action === 'CLEAR_PREVIEW_CACHE' || message.action === 'PREPARE_PREVIEW')) {
        if (chrome.browsingData?.remove) {
          chrome.browsingData.remove(
            { origins: ['https://x.com', 'https://twitter.com'] },
            { serviceWorkers: true, cacheStorage: true },
            () => {
              sendResponse({ success: true });
            }
          );
          return true;
        }
        sendResponse({ success: true });
        return false;
      }
      if (message && (message.action === 'RESOLVE_URL' || message.action === 'resolveUrl' || message.action === 'UNWRAP_URL')) {
        sendResponse({ success: true, resolvedUrl: message.url });
        return true;
      }
    };

    chrome.runtime.onMessage.addListener(handler);
    return {
      handler
    };
  }

  function initPopup(win, chrome) {
    const doc = win.document;
    const toggleEl = doc.createElement('input');
    toggleEl.id = 'toggle-enabled';
    toggleEl.type = 'checkbox';
    toggleEl.checked = activeSettings.enabled;

    const modifierSelect = doc.createElement('select');
    modifierSelect.id = 'select-modifier';
    ['shift', 'alt', 'ctrl_cmd'].forEach((opt) => {
      const option = doc.createElement('option');
      option.value = opt;
      option.textContent = opt;
      if (opt === activeSettings.modifierKey) option.selected = true;
      modifierSelect.appendChild(option);
    });

    const sizeSelect = doc.createElement('select');
    sizeSelect.id = 'select-size';
    ['compact', 'default', 'large'].forEach((opt) => {
      const option = doc.createElement('option');
      option.value = opt;
      option.textContent = opt;
      if (opt === activeSettings.sizePreset) option.selected = true;
      sizeSelect.appendChild(option);
    });

    doc.body.appendChild(toggleEl);
    doc.body.appendChild(modifierSelect);
    doc.body.appendChild(sizeSelect);

    const saveSettings = () => {
      const newSettings = {
        enabled: toggleEl.checked,
        modifierKey: modifierSelect.value,
        sizePreset: sizeSelect.value
      };
      if (chrome?.storage?.sync) {
        chrome.storage.sync.set(newSettings).catch(() => {
          // Fallback to local storage on error
          if (chrome?.storage?.local) {
            chrome.storage.local.set(newSettings);
          }
        });
      }
    };

    toggleEl.addEventListener('change', saveSettings);
    modifierSelect.addEventListener('change', saveSettings);
    sizeSelect.addEventListener('change', saveSettings);

    return {
      toggleEl,
      modifierSelect,
      sizeSelect,
      saveSettings
    };
  }

  return {
    parseUrlDetails,
    isModifierActive,
    extractAnchorUrl,
    isNavigableHttp,
    mountModal,
    teardownModal,
    resolveFaviconUrl,
    initContentScript,
    initBackgroundWorker,
    initPopup,
    getCurrentModal: () => currentModal,
    getSettings: () => ({ ...activeSettings }),
    setSettings: (s) => { activeSettings = { ...activeSettings, ...s }; }
  };
}

module.exports = {
  createReferenceEngine
};
