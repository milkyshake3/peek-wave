/**
 * Peek Wave — Content Script Engine (Manifest V3)
 * 
 * Lightweight, zero-dependency link preview engine:
 * 1. Window capture-phase link click interception with strict modifier exclusivity.
 * 2. Deep anchor resolution supporting nested HTML nodes and SVGAnimatedString anchors.
 * 3. Protocol whitelisting (http:, https:), filtering in-page #hashes, javascript:, and downloads.
 * 4. Isolated Shadow DOM modal overlay attached directly to document.documentElement.
 * 5. Complete header UX: clean domain label, favicon with SVG fallback, loading spinner/bar,
 *    Open in New Tab handoff to background worker, Copy Link with visual tooltip.
 * 6. Sandboxed iframe omitting allow-top-navigation (anti-framebuster security).
 * 7. Deterministic 6-step low-RAM teardown lifecycle (synchronous about:blank navigation,
 *    complete event listener unbinding, node detachment, and memory reference breaking).
 */

'use strict';

/**
 * Embedded stylesheet text matching content/modal.css for 0ms synchronous Shadow DOM injection.
 */
const MODAL_CSS_TEXT = `
/* ==========================================================================
   Peek Wave - Isolated Modal Stylesheet (Shadow DOM Encapsulated)
   ========================================================================== */

:host {
  all: initial !important;
  display: block !important;
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 2147483647 !important;
  pointer-events: auto !important;
}

*,
*::before,
*::after {
  box-sizing: border-box !important;
  margin: 0 !important;
  padding: 0 !important;
  border: none !important;
  outline: none !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
  font-size: 13px !important;
  font-weight: 400 !important;
  line-height: 1.4 !important;
  color: #f8fafc !important;
  letter-spacing: normal !important;
  text-transform: none !important;
  text-align: left !important;
  direction: ltr !important;
  -webkit-font-smoothing: antialiased !important;
  -moz-osx-font-smoothing: grayscale !important;
  user-select: none !important;
  -webkit-user-select: none !important;
}

.peek-wave-backdrop {
  position: fixed !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  background-color: rgba(15, 23, 42, 0.65) !important;
  backdrop-filter: blur(4px) !important;
  -webkit-backdrop-filter: blur(4px) !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  animation: peek-fade-in 140ms cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
  isolation: isolate !important;
}

.peek-wave-modal {
  display: flex !important;
  flex-direction: column !important;
  background: #0f172a !important;
  border-radius: 12px !important;
  overflow: hidden !important;
  position: relative !important;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5),
              0 0 0 1px rgba(255, 255, 255, 0.1),
              0 10px 30px rgba(0, 0, 0, 0.3) !important;
  animation: peek-scale-in 160ms cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
  transform: translateZ(0) !important;
  isolation: isolate !important;
}

.peek-wave-modal.peek-size-compact {
  width: min(640px, 85vw) !important;
  height: min(480px, 75vh) !important;
}

.peek-wave-modal.peek-size-default {
  width: min(860px, 85vw) !important;
  height: min(600px, 85vh) !important;
}

.peek-wave-modal.peek-size-large {
  width: min(1100px, 92vw) !important;
  height: min(760px, 90vh) !important;
}

.peek-wave-header {
  flex: 0 0 44px !important;
  height: 44px !important;
  background: #1e293b !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  padding: 0 12px !important;
  position: relative !important;
}

.peek-wave-header-left {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  overflow: hidden !important;
  min-width: 0 !important;
}

.peek-wave-favicon {
  width: 16px !important;
  height: 16px !important;
  border-radius: 3px !important;
  flex-shrink: 0 !important;
  object-fit: contain !important;
}

.peek-wave-domain {
  font-size: 13px !important;
  font-weight: 600 !important;
  color: #f8fafc !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

.peek-wave-loader-spinner {
  width: 14px !important;
  height: 14px !important;
  border: 2px solid rgba(255, 255, 255, 0.15) !important;
  border-top-color: #38bdf8 !important;
  border-radius: 50% !important;
  flex-shrink: 0 !important;
  animation: peek-spin 0.75s linear infinite !important;
  opacity: 1 !important;
  transition: opacity 0.25s ease-out !important;
}

.peek-wave-loader-spinner.hidden {
  opacity: 0 !important;
  pointer-events: none !important;
}

.peek-wave-progress-bar {
  position: absolute !important;
  bottom: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 2.5px !important;
  background: transparent !important;
  overflow: hidden !important;
  pointer-events: none !important;
}

.peek-wave-progress-bar::after {
  content: '' !important;
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  bottom: 0 !important;
  width: 40% !important;
  background: linear-gradient(90deg, #0284c7, #38bdf8, #06b6d4) !important;
  border-radius: 2px !important;
  animation: peek-indeterminate 1.4s infinite ease-in-out !important;
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.5) !important;
}

.peek-wave-progress-bar.hidden {
  opacity: 0 !important;
  transition: opacity 0.3s ease-out !important;
}

.peek-wave-header-actions {
  display: flex !important;
  align-items: center !important;
  gap: 4px !important;
  flex-shrink: 0 !important;
}

.peek-wave-btn {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 28px !important;
  height: 28px !important;
  border-radius: 6px !important;
  background: transparent !important;
  color: #94a3b8 !important;
  cursor: pointer !important;
  position: relative !important;
  transition: background-color 0.15s ease, color 0.15s ease, transform 0.1s ease !important;
}

.peek-wave-btn:hover {
  background: rgba(255, 255, 255, 0.08) !important;
  color: #f8fafc !important;
}

.peek-wave-btn:active {
  transform: scale(0.92) !important;
}

.peek-wave-btn svg {
  width: 15px !important;
  height: 15px !important;
  stroke: currentColor !important;
  stroke-width: 2 !important;
  stroke-linecap: round !important;
  stroke-linejoin: round !important;
  fill: none !important;
  pointer-events: none !important;
}

.peek-wave-btn-close:hover {
  background: rgba(239, 68, 68, 0.15) !important;
  color: #f87171 !important;
}

.peek-wave-tooltip {
  position: absolute !important;
  bottom: calc(100% + 6px) !important;
  left: 50% !important;
  transform: translateX(-50%) translateY(2px) !important;
  background: #1e293b !important;
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
  padding: 3px 8px !important;
  border-radius: 4px !important;
  font-size: 11px !important;
  font-weight: 500 !important;
  color: #f8fafc !important;
  white-space: nowrap !important;
  pointer-events: none !important;
  opacity: 0 !important;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4) !important;
  transition: opacity 0.15s ease, transform 0.15s ease !important;
  z-index: 10 !important;
}

.peek-wave-tooltip.active {
  opacity: 1 !important;
  transform: translateX(-50%) translateY(0) !important;
  color: #10b981 !important;
}

.peek-wave-iframe-wrapper {
  flex: 1 1 auto !important;
  width: 100% !important;
  height: calc(100% - 44px) !important;
  position: relative !important;
  background: #0f172a !important;
  overflow: hidden !important;
  contain: strict !important;
  isolation: isolate !important;
}

.peek-wave-iframe {
  width: 100% !important;
  height: 100% !important;
  border: none !important;
  display: block !important;
  contain: size layout paint !important;
  transform: translateZ(0) !important;
}

@keyframes peek-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes peek-scale-in {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(6px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes peek-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes peek-indeterminate {
  0% { transform: translateX(-100%); width: 20%; }
  50% { transform: translateX(100%); width: 60%; }
  100% { transform: translateX(300%); width: 20%; }
}

/* Grow from link origin animation */
.peek-wave-modal.peek-animate-grow {
  animation: peek-grow-from-link 220ms cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
  transform-origin: center center !important;
}

@keyframes peek-grow-from-link {
  0% {
    opacity: 0;
    transform: translate(var(--peek-origin-x, 0px), var(--peek-origin-y, 0px)) scale(var(--peek-scale-x, 0.08), var(--peek-scale-y, 0.08));
  }
  100% {
    opacity: 1;
    transform: translate(0px, 0px) scale(1, 1);
  }
}
`;

/**
 * Default configuration state.
 */
const DEFAULT_SETTINGS = {
  enabled: true,
  modifierKey: 'shift', // 'shift' | 'alt' | 'ctrl_cmd'
  sizePreset: 'default', // 'compact' | 'default' | 'large'
  growAnimation: true
};

// Singleton active settings instance
let activeSettings = { ...DEFAULT_SETTINGS };

// Singleton active preview modal instance
let currentModal = null;

/**
 * W3C XLink XML Namespace URI for SVG anchor resolution.
 */
const XLINK_NS = 'http://www.w3.org/1999/xlink';

/**
 * Parses a raw URL string against baseURI into clean domain and URL components.
 * @param {string} rawUrl 
 * @param {string} [baseURI] 
 * @returns {object|null}
 */
function parseUrlDetails(rawUrl, baseURI) {
  try {
    const base = baseURI || (typeof document !== 'undefined' ? document.baseURI : undefined) || 'https://example.com/';
    const parsed = new URL(rawUrl, base);
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

/**
 * Normalizes any modifier key representation into a standard canonical key: 'shift' | 'alt' | 'ctrl_cmd'.
 * Handles case-insensitivity ('Shift', 'shift', 'SHIFT'), composite names ('Ctrl/Cmd', 'ctrl_cmd', 'Ctrl + Click'),
 * and platform aliases ('cmd', 'Command', 'Option', 'Control').
 * @param {string} key
 * @returns {'shift'|'alt'|'ctrl_cmd'}
 */
function normalizeModifierKey(key) {
  if (typeof key !== 'string') return 'shift';
  const clean = key.trim().toLowerCase().replace(/[^a-z]/g, '');
  if (clean.includes('ctrl') || clean.includes('cmd') || clean.includes('control') || clean.includes('command')) {
    return 'ctrl_cmd';
  }
  if (clean.includes('alt') || clean.includes('option')) {
    return 'alt';
  }
  if (clean.includes('shift')) {
    return 'shift';
  }
  return 'shift';
}

/**
 * Evaluates whether an event's modifier keys strictly match the configured modifier.
 * Ensures strict mutual exclusivity to avoid hijacking native browser shortcuts (e.g., Ctrl+Shift+Click).
 * Handles case-insensitive and variant representations ('Shift', 'shift', 'Alt', 'Ctrl', 'Ctrl/Cmd', etc.).
 * @param {MouseEvent|KeyboardEvent} e 
 * @param {string} configuredModifier 
 * @returns {boolean}
 */
function isModifierActive(e, configuredModifier) {
  if (!e) return false;
  const mod = normalizeModifierKey(configuredModifier);
  switch (mod) {
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

/**
 * Helper to safely extract raw href string from an HTML or SVG anchor element.
 * Supports HTMLAnchorElement (href property and attribute), SVGAElement (SVGAnimatedString,
 * baseVal, animVal), xlink:href attribute, and XML namespace ('http://www.w3.org/1999/xlink').
 * @param {Element} anchor
 * @returns {string|null}
 */
function getAnchorRawHref(anchor) {
  if (!anchor) return null;

  // 1. Standard HTMLAnchorElement or string href
  if (typeof anchor.href === 'string' && anchor.href.trim()) {
    const attr = typeof anchor.getAttribute === 'function' ? anchor.getAttribute('href') : null;
    return (attr && attr.trim()) ? attr.trim() : anchor.href.trim();
  }

  // 2. SVGAElement SVGAnimatedString (baseVal prioritized over animVal, requiring non-empty string)
  if (anchor.href && typeof anchor.href === 'object') {
    if (typeof anchor.href.baseVal === 'string' && anchor.href.baseVal.trim()) {
      return anchor.href.baseVal.trim();
    }
    if (typeof anchor.href.animVal === 'string' && anchor.href.animVal.trim()) {
      return anchor.href.animVal.trim();
    }
  }

  // 3. Direct href attribute check
  if (typeof anchor.getAttribute === 'function') {
    const hrefAttr = anchor.getAttribute('href');
    if (hrefAttr && hrefAttr.trim()) {
      return hrefAttr.trim();
    }

    // 4. xlink:href attribute check
    const xlinkAttr = anchor.getAttribute('xlink:href');
    if (xlinkAttr && xlinkAttr.trim()) {
      return xlinkAttr.trim();
    }
  }

  // 5. XML namespace URI resolution ('http://www.w3.org/1999/xlink')
  if (typeof anchor.getAttributeNS === 'function') {
    const nsHref = anchor.getAttributeNS(XLINK_NS, 'href');
    if (nsHref && nsHref.trim()) {
      return nsHref.trim();
    }
    const nsXlinkHref = anchor.getAttributeNS(XLINK_NS, 'xlink:href');
    if (nsXlinkHref && nsXlinkHref.trim()) {
      return nsXlinkHref.trim();
    }
  }

  return null;
}

/**
 * Resolves a clicked event target to its enclosing anchor tag and parses the URL.
 * Supports standard HTML anchors, SVG anchors (SVGAnimatedString), xlink:href in XML namespaces,
 * non-Element targets (Text nodes), and deep nested children.
 * Rejects [download] attribute links.
 * @param {EventTarget} target 
 * @param {string} [baseURI] 
 * @returns {object|null}
 */
function extractAnchorUrl(target, baseURI) {
  if (!target) return null;

  // Guard against non-Element targets (e.g. Text nodes in HTML/SVG, Comment nodes)
  let el = target;
  while (el && el.nodeType !== 1) {
    el = el.parentElement || el.parentNode;
  }
  if (!el || typeof el.closest !== 'function') return null;

  // Search up the DOM hierarchy for an enclosing <a> element
  let curr = el;
  while (curr && typeof curr.closest === 'function') {
    const anchor = curr.closest('a');
    if (!anchor) break;

    // Reject download links per specification (HTML and SVG 2)
    if (typeof anchor.hasAttribute === 'function' && anchor.hasAttribute('download')) {
      return null;
    }

    const rawHref = getAnchorRawHref(anchor);
    if (rawHref) {
      const details = parseUrlDetails(rawHref, baseURI);
      if (details) {
        details.rawHref = rawHref;
        details.anchor = anchor;
      }
      return details;
    }

    // If anchor has no href/xlink:href (e.g. <a name="section">), continue up DOM tree
    curr = anchor.parentElement;
  }

  return null;
}

/**
 * Validates that the target URL is a safe, navigable HTTP or HTTPS URL.
 * Filters out #hash same-page links, javascript:, mailto:, tel:, data:, and blob: URIs.
 * @param {object} urlDetails 
 * @param {Location} [currentLoc] 
 * @returns {boolean}
 */
function isNavigableHttp(urlDetails, currentLoc) {
  if (!urlDetails) return false;
  if (urlDetails.rawHref && urlDetails.rawHref.startsWith('#')) return false;

  const proto = (urlDetails.protocol || '').toLowerCase();
  if (proto !== 'http:' && proto !== 'https:') return false;

  // Filter in-page hash fragments on current document
  if (currentLoc) {
    const currentHref = currentLoc.href || '';
    const currentNoHash = currentHref.split('#')[0];
    const targetNoHash = urlDetails.fullUrl.split('#')[0];
    if (currentNoHash === targetNoHash && Boolean(urlDetails.hash)) {
      return false;
    }
  }

  return true;
}

/**
 * Deterministic 6-step low-RAM modal teardown lifecycle:
 * Step 1: Remove global keydown (Escape) and resize event listeners from window.
 * Step 2: Clear active timers (loadingTimeout, copyTimeout) and unbind UI listeners.
 * Step 3: Synchronously clear iframe handlers and set iframe.src = 'about:blank'
 *         to immediately stop media/worker threads.
 * Step 4: Detach iframe element from modal DOM.
 * Step 5: Detach shadow host container (#peek-wave-host) from document.documentElement.
 * Step 6: Nullify modal reference to break closures and enable garbage collection.
 * @param {Window} [win] 
 */
function teardownModal(win) {
  if (!currentModal) return;

  const targetWin = win || currentModal.win || (currentModal.hostElement?.ownerDocument?.defaultView) || (typeof window !== 'undefined' ? window : null);
  const {
    hostElement,
    iframe,
    keydownHandler,
    backdrop,
    backdropHandler,
    closeBtn,
    closeHandler,
    tabBtn,
    tabHandler,
    copyBtn,
    copyHandler,
    copyTimeout,
    loadingTimeout
  } = currentModal;

  // Step 1: Unbind global listeners
  if (keydownHandler && targetWin) {
    targetWin.removeEventListener('keydown', keydownHandler, { capture: true });
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
  if (tabBtn && tabHandler) {
    tabBtn.removeEventListener('click', tabHandler);
  }
  if (copyBtn && copyHandler) {
    copyBtn.removeEventListener('click', copyHandler);
  }

  // Step 3: Synchronously clear iframe and navigate to about:blank
  if (iframe) {
    iframe.onload = null;
    iframe.onerror = null;
    try {
      iframe.src = 'about:blank';
    } catch {}

    // Step 4: Detach iframe from modal DOM
    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
  }

  // Step 5: Detach shadow host container from DOM
  if (hostElement && hostElement.parentNode) {
    hostElement.parentNode.removeChild(hostElement);
  }

  // Step 6: Break object references for GC
  currentModal = null;
}

/**
 * Standard W3C SVG XML Namespace URI.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Creates an inline SVG vector element and child nodes using standard XML namespaces.
 * Avoids innerHTML to prevent CSP issues and parser overhead.
 * @param {Document} doc 
 * @param {string} className 
 * @param {Array<{ tag: string, attrs: Record<string, string> }>} children 
 * @returns {SVGElement}
 */
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

/**
 * Unregisters any active Service Workers on the host page (e.g. x.com).
 * This prevents SW caches from serving responses with X-Frame-Options: deny that bypass DeclarativeNetRequest.
 * @param {Window} [win]
 */
function unregisterHostServiceWorkers(win) {
  const targetWin = win || (typeof window !== 'undefined' ? window : null);
  const swNav = targetWin?.navigator || (typeof navigator !== 'undefined' ? navigator : null);
  if (swNav?.serviceWorker?.getRegistrations) {
    try {
      swNav.serviceWorker.getRegistrations()
        .then((regs) => {
          if (Array.isArray(regs)) {
            regs.forEach((r) => {
              try { r.unregister(); } catch {}
            });
          }
        })
        .catch(() => {});
    } catch {}
  }
}

/**
 * Mounts the isolated Shadow DOM preview modal on document.documentElement.
 * @param {string} targetUrl 
 * @param {object} [options]
 * @returns {object|null}
 */
function mountModal(arg0, arg1, arg2) {
  let targetUrl;
  let options = {};

  if (typeof arg0 === 'string') {
    targetUrl = arg0;
    options = typeof arg1 === 'object' && arg1 !== null ? arg1 : {};
  } else if (arg0 && (typeof arg0.document !== 'undefined' || typeof arg0.addEventListener === 'function')) {
    // Support mountModal(win, chrome, targetUrl)
    options = { win: arg0, chrome: arg1 };
    targetUrl = typeof arg2 === 'string' ? arg2 : (typeof arg1 === 'string' ? arg1 : '');
  } else {
    targetUrl = String(arg0 || '');
    options = typeof arg1 === 'object' && arg1 !== null ? arg1 : {};
  }

  const win = options.win || (typeof window !== 'undefined' ? window : null);
  if (!win) return null;
  const doc = win.document;
  if (!doc) return null;

  // Unregister host Service Workers before loading iframe to avoid cached framing rejections
  unregisterHostServiceWorkers(win);

  // Preemptively tear down any existing modal
  if (currentModal) {
    teardownModal(win);
  }

  const urlDetails = parseUrlDetails(targetUrl, doc.baseURI);
  if (!urlDetails) return null;

  const sizePreset = options.sizePreset || activeSettings.sizePreset || activeSettings.modalSize || 'default';

  // Step 1: Create host element and apply critical inline reset styles
  const hostElement = doc.createElement('peek-wave-container');
  hostElement.id = 'peek-wave-host';
  hostElement.style.cssText = [
    'all: initial !important;',
    'display: block !important;',
    'position: fixed !important;',
    'top: 0 !important;',
    'left: 0 !important;',
    'width: 100vw !important;',
    'height: 100vh !important;',
    'z-index: 2147483647 !important;',
    'pointer-events: auto !important;'
  ].join(' ');

  // Step 2: Attach open Shadow Root
  const shadowRoot = hostElement.attachShadow({ mode: 'open' });

  // Step 3: Inject full CSS reset and styling
  const styleEl = doc.createElement('style');
  styleEl.textContent = MODAL_CSS_TEXT;
  shadowRoot.appendChild(styleEl);

  // Step 4: Create Backdrop
  const backdrop = doc.createElement('div');
  backdrop.className = 'peek-wave-backdrop';

  // Step 5: Create Modal Window with configured size preset
  const modalWin = doc.createElement('div');
  modalWin.className = `peek-wave-modal peek-size-${sizePreset}`;

  // Apply smooth grow animation from link coordinates if enabled
  const shouldGrow = Boolean((options.growAnimation !== undefined ? options.growAnimation : (activeSettings.growAnimation !== false)) && options.linkRect);
  if (shouldGrow && options.linkRect) {
    const docEl = doc.documentElement;
    const viewportWidth = win.innerWidth || (docEl && docEl.clientWidth) || 1024;
    const viewportHeight = win.innerHeight || (docEl && docEl.clientHeight) || 768;

    let targetWidth;
    let targetHeight;
    if (sizePreset === 'compact') {
      targetWidth = Math.min(640, viewportWidth * 0.85);
      targetHeight = Math.min(480, viewportHeight * 0.75);
    } else if (sizePreset === 'large') {
      targetWidth = Math.min(1100, viewportWidth * 0.92);
      targetHeight = Math.min(760, viewportHeight * 0.90);
    } else {
      targetWidth = Math.min(860, viewportWidth * 0.85);
      targetHeight = Math.min(600, viewportHeight * 0.85);
    }

    const modalFinalCenterX = viewportWidth / 2;
    const modalFinalCenterY = viewportHeight / 2;

    const linkWidth = Math.max(16, Math.min(viewportWidth, options.linkRect.width || 80));
    const linkHeight = Math.max(16, Math.min(viewportHeight, options.linkRect.height || 24));
    const linkCenterX = (options.linkRect.left || 0) + (linkWidth / 2);
    const linkCenterY = (options.linkRect.top || 0) + (linkHeight / 2);

    const deltaX = Math.round(linkCenterX - modalFinalCenterX);
    const deltaY = Math.round(linkCenterY - modalFinalCenterY);

    const scaleX = Number(Math.max(0.04, Math.min(1, linkWidth / targetWidth)).toFixed(4));
    const scaleY = Number(Math.max(0.04, Math.min(1, linkHeight / targetHeight)).toFixed(4));

    if (modalWin.style && typeof modalWin.style.setProperty === 'function') {
      modalWin.style.setProperty('--peek-origin-x', `${deltaX}px`);
      modalWin.style.setProperty('--peek-origin-y', `${deltaY}px`);
      modalWin.style.setProperty('--peek-scale-x', `${scaleX}`);
      modalWin.style.setProperty('--peek-scale-y', `${scaleY}`);
    } else if (modalWin.style) {
      modalWin.style['--peek-origin-x'] = `${deltaX}px`;
      modalWin.style['--peek-origin-y'] = `${deltaY}px`;
      modalWin.style['--peek-scale-x'] = `${scaleX}`;
      modalWin.style['--peek-scale-y'] = `${scaleY}`;
    }

    modalWin.classList.add('peek-animate-grow');
  }

  // Step 6: Create Header Bar
  const header = doc.createElement('header');
  header.className = 'peek-wave-header';

  const headerLeft = doc.createElement('div');
  headerLeft.className = 'peek-wave-header-left';

  const favicon = doc.createElement('img');
  favicon.className = 'peek-wave-favicon';
  favicon.src = `https://www.google.com/s2/favicons?domain=${urlDetails.hostname}&sz=32`;
  favicon.alt = '';
  favicon.addEventListener('error', () => {
    favicon.style.display = 'none';
  }, { once: true });

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
  copyBtn.setAttribute('aria-label', 'Copy Link');

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
    if (copyTimeout) clearTimeout(copyTimeout);
    copyTooltip.textContent = 'Copied!';
    copyTooltip.classList.add('active');

    let copied = false;
    if (win.navigator?.clipboard?.writeText) {
      win.navigator.clipboard.writeText(urlDetails.fullUrl).catch(() => {});
      copied = true;
    }
    if (!copied && doc.execCommand) {
      try {
        const ta = doc.createElement('textarea');
        ta.value = urlDetails.fullUrl;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        (doc.body || doc.documentElement).appendChild(ta);
        ta.select();
        doc.execCommand('copy');
        ta.remove();
      } catch {}
    }

    copyTimeout = setTimeout(() => {
      copyTooltip.textContent = 'Copy';
      copyTooltip.classList.remove('active');
      copyTimeout = null;
    }, 1500);

    if (currentModal) currentModal.copyTimeout = copyTimeout;
  };
  copyBtn.addEventListener('click', copyHandler);

  // Open in New Tab Button
  const tabBtn = doc.createElement('button');
  tabBtn.type = 'button';
  tabBtn.className = 'peek-wave-btn peek-wave-btn-tab';
  tabBtn.title = 'Open in New Tab';
  tabBtn.setAttribute('aria-label', 'Open in New Tab');

  const tabSvg = createSvgElement(doc, 'peek-icon-tab', [
    { tag: 'path', attrs: { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' } },
    { tag: 'polyline', attrs: { points: '15 3 21 3 21 9' } },
    { tag: 'line', attrs: { x1: '10', y1: '14', x2: '21', y2: '3' } }
  ]);
  tabBtn.appendChild(tabSvg);

  const tabHandler = (e) => {
    e.stopPropagation();
    const chromeObj = (typeof chrome !== 'undefined' && chrome) || win.chrome;
    if (chromeObj?.runtime?.sendMessage) {
      chromeObj.runtime.sendMessage({ action: 'OPEN_TAB', url: urlDetails.fullUrl });
    } else if (win.open) {
      win.open(urlDetails.fullUrl, '_blank', 'noopener,noreferrer');
    }
    teardownModal(win);
  };
  tabBtn.addEventListener('click', tabHandler);

  // Close Button
  const closeBtn = doc.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'peek-wave-btn peek-wave-btn-close';
  closeBtn.title = 'Close (Esc)';
  closeBtn.setAttribute('aria-label', 'Close');

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

  // Step 7: Create Sandboxed Iframe
  const iframeWrapper = doc.createElement('div');
  iframeWrapper.className = 'peek-wave-iframe-wrapper';

  const iframe = doc.createElement('iframe');
  iframe.className = 'peek-wave-iframe';
  iframe.src = urlDetails.fullUrl;
  // Strictly omit 'allow-top-navigation' to prevent framed sites from hijacking host window
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-modals allow-downloads allow-storage-access-by-user-activation');
  iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen');
  iframe.setAttribute('allowfullscreen', 'true');
  iframe.setAttribute('loading', 'eager');
  iframe.setAttribute('importance', 'high');
  iframe.setAttribute('referrerpolicy', 'origin-when-cross-origin');

  // Loading lifecycle handlers
  const hideLoading = () => {
    spinner.classList.add('hidden');
    progressBar.classList.add('hidden');
  };
  iframe.addEventListener('load', hideLoading, { once: true });
  iframe.addEventListener('error', hideLoading, { once: true });
  const loadingTimeout = setTimeout(hideLoading, 8000);

  iframeWrapper.appendChild(iframe);
  modalWin.appendChild(header);
  modalWin.appendChild(iframeWrapper);
  backdrop.appendChild(modalWin);
  shadowRoot.appendChild(backdrop);

  // Step 8: Backdrop dismissal
  const backdropHandler = (e) => {
    if (e.target === backdrop) {
      e.preventDefault();
      e.stopPropagation();
      teardownModal(win);
    }
  };
  backdrop.addEventListener('click', backdropHandler);

  // Shield clicks inside modal card from closing backdrop
  modalWin.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Step 9: Global Escape keydown listener in window capture phase
  const keydownHandler = (e) => {
    if (e.key === 'Escape' || e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      teardownModal(win);
    }
  };
  win.addEventListener('keydown', keydownHandler, { capture: true });

  // Step 10: Mount host directly to document.documentElement
  (doc.documentElement || doc.body).appendChild(hostElement);

  // Complete reference record for inspection and teardown
  currentModal = {
    win,
    hostElement,
    shadowRoot,
    modal: modalWin,
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
    loadingTimeout,
    keydownHandler,
    backdropHandler,
    closeHandler,
    tabHandler,
    copyHandler
  };

  return currentModal;
}

/**
 * Capture phase link click listener on window.
 * @param {MouseEvent} e 
 * @param {Window} [win] 
 */
function handleCaptureClick(e, win) {
  // 1. Guard against disabled extension
  if (!activeSettings.enabled) return;

  // 2. Primary left-click only
  if (e.button !== 0) return;

  // 3. Modifier validation
  if (!isModifierActive(e, activeSettings.modifierKey)) return;

  const targetWin = win || (typeof window !== 'undefined' ? window : null);
  const targetDoc = (targetWin && targetWin.document) || (typeof document !== 'undefined' ? document : null);
  const baseURI = targetDoc ? targetDoc.baseURI : undefined;

  // 4. Resolve anchor URL and validate protocol
  const urlDetails = extractAnchorUrl(e.target, baseURI);
  if (!urlDetails) return;

  if (!isNavigableHttp(urlDetails, targetWin ? targetWin.location : null)) return;

  // 5. Intercept and shield host page navigation & native browser window spawning
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  // Extract bounding coordinates of the clicked anchor
  let linkRect = null;
  const anchor = urlDetails.anchor;
  if (anchor) {
    if (typeof anchor.getClientRects === 'function' && typeof e.clientX === 'number') {
      try {
        const rects = anchor.getClientRects();
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i];
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
            linkRect = { left: r.left, top: r.top, width: r.width, height: r.height };
            break;
          }
        }
      } catch {}
    }
    if (!linkRect && typeof anchor.getBoundingClientRect === 'function') {
      try {
        const r = anchor.getBoundingClientRect();
        if (r && (r.width > 0 || r.height > 0 || r.top > 0 || r.left > 0)) {
          linkRect = { left: r.left, top: r.top, width: r.width, height: r.height };
        }
      } catch {}
    }
  }

  // Fallback to click coordinates if available
  if (!linkRect && typeof e.clientX === 'number' && typeof e.clientY === 'number' && (e.clientX > 0 || e.clientY > 0)) {
    linkRect = {
      left: Math.max(0, e.clientX - 40),
      top: Math.max(0, e.clientY - 12),
      width: 80,
      height: 24
    };
  }

  // 6. Mount isolated Shadow DOM preview modal
  mountModal(urlDetails.fullUrl, {
    win: targetWin,
    sizePreset: activeSettings.sizePreset || activeSettings.modalSize,
    linkRect: linkRect,
    growAnimation: activeSettings.growAnimation !== false
  });
}

/**
 * Initializes content script event listeners and live storage synchronization.
 * @param {Window} win 
 * @param {object} [chromeObj] 
 * @returns {object}
 */
function initContentScript(win, chromeObj) {
  const targetWin = win || (typeof window !== 'undefined' ? window : null);
  const targetChrome = chromeObj || (typeof chrome !== 'undefined' ? chrome : null) || (targetWin && targetWin.chrome);

  if (!targetWin) {
    return {
      getModal: () => currentModal,
      teardown: () => teardownModal(null),
      getSettings: () => ({ ...activeSettings }),
      setSettings: (s) => { activeSettings = { ...activeSettings, ...s }; }
    };
  }

  // Prevent double-binding in same execution context
  if (targetWin.__PEEK_WAVE_INITIALIZED__) {
    return {
      getModal: () => currentModal,
      teardown: () => teardownModal(targetWin),
      getSettings: () => ({ ...activeSettings }),
      setSettings: (s) => { activeSettings = { ...activeSettings, ...s }; }
    };
  }
  targetWin.__PEEK_WAVE_INITIALIZED__ = true;
  unregisterHostServiceWorkers(targetWin);

  // Load storage settings
  const storageArea = targetChrome?.storage?.sync || targetChrome?.storage?.local;
  if (storageArea) {
    storageArea.get(['enabled', 'modifierKey', 'sizePreset', 'modalSize', 'growAnimation'], (items) => {
      if (targetChrome?.runtime?.lastError) {
        if (targetChrome?.storage?.local && storageArea !== targetChrome.storage.local) {
          targetChrome.storage.local.get(['enabled', 'modifierKey', 'sizePreset', 'modalSize', 'growAnimation'], (localItems) => {
            if (localItems) {
              activeSettings = { ...activeSettings, ...localItems };
              if (localItems.modalSize && !localItems.sizePreset) {
                activeSettings.sizePreset = localItems.modalSize;
              }
            }
          });
        }
        return;
      }
      if (items) {
        activeSettings = { ...activeSettings, ...items };
        if (items.modalSize && !items.sizePreset) {
          activeSettings.sizePreset = items.modalSize;
        }
      }
    });
  }

  // Subscribe to live storage changes
  if (targetChrome?.storage?.onChanged) {
    targetChrome.storage.onChanged.addListener((changes) => {
      for (const [k, change] of Object.entries(changes)) {
        if (change && change.newValue !== undefined) {
          activeSettings[k] = change.newValue;
          if (k === 'modalSize' && !changes.sizePreset) {
            activeSettings.sizePreset = change.newValue;
          }
          if (k === 'sizePreset' && !changes.modalSize) {
            activeSettings.modalSize = change.newValue;
          }
        }
      }
    });
  }

  // Subscribe to runtime messages for immediate settings sync in active tabs
  if (targetChrome?.runtime?.onMessage && !targetChrome?.createdTabs) {
    targetChrome.runtime.onMessage.addListener((message) => {
      if (message && (message.action === 'SETTINGS_CHANGED' || message.type === 'SETTINGS_CHANGED') && message.settings) {
        if (message.settings.growAnimation !== undefined) {
          activeSettings.growAnimation = Boolean(message.settings.growAnimation);
        }
        if (message.settings.enabled !== undefined) {
          activeSettings.enabled = Boolean(message.settings.enabled);
        }
        if (message.settings.modifierKey !== undefined) {
          activeSettings.modifierKey = normalizeModifierKey(message.settings.modifierKey);
        }
        if (message.settings.modalSize !== undefined || message.settings.sizePreset !== undefined) {
          const sz = message.settings.modalSize || message.settings.sizePreset;
          activeSettings.modalSize = sz;
          activeSettings.sizePreset = sz;
        }
      }
    });
  }

  // Window capture click listener
  const clickHandler = (e) => handleCaptureClick(e, targetWin);
  targetWin.addEventListener('click', clickHandler, { capture: true });

  // Public testing & inspection hooks
  targetWin.__PEEK_WAVE_MOUNT__ = (url, size, opts = {}) => mountModal(url, { win: targetWin, sizePreset: size, ...opts });
  targetWin.__PEEK_WAVE_TEARDOWN__ = () => teardownModal(targetWin);
  targetWin.__PEEK_WAVE_GET_MODAL__ = () => currentModal;
  targetWin.__PEEK_WAVE_GET_SETTINGS__ = () => ({ ...activeSettings });

  return {
    getModal: () => currentModal,
    teardown: () => teardownModal(targetWin),
    getSettings: () => ({ ...activeSettings }),
    setSettings: (s) => { activeSettings = { ...activeSettings, ...s }; }
  };
}

// Auto-initialize when injected in standard browser context
if (typeof window !== 'undefined' && !window.__PEEK_WAVE_INITIALIZED__) {
  initContentScript(window, typeof chrome !== 'undefined' ? chrome : null);
}

// Support CommonJS export for Node test harnesses and forensic integrity auditor
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_SETTINGS,
    MODAL_CSS_TEXT,
    SVG_NS,
    XLINK_NS,
    createSvgElement,
    normalizeModifierKey,
    getAnchorRawHref,
    parseUrlDetails,
    isModifierActive,
    extractAnchorUrl,
    isNavigableHttp,
    mountModal,
    teardownModal,
    unregisterHostServiceWorkers,
    handleCaptureClick,
    initContentScript,
    getModal: () => currentModal,
    getSettings: () => ({ ...activeSettings }),
    setSettings: (s) => { activeSettings = { ...activeSettings, ...s }; }
  };
}
