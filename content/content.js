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

/* --------------------------------------------------------------------------
   1. Root Host & Universal Reset
   -------------------------------------------------------------------------- */
:host {
  all: initial !important;
  display: block !important;
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 2147483647 !important;
  pointer-events: auto !important;

  /* Theme Tokens - Dark Mode (Default) */
  --peek-accent: #38bdf8;
  --peek-glass-bg: linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.02) 40%, rgba(15, 23, 42, 0.50) 100%), rgba(15, 23, 42, 0.50);
  --peek-header-bg: linear-gradient(180deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.03) 60%, rgba(30, 41, 59, 0.45) 100%), rgba(30, 41, 59, 0.45);
  --peek-header-border: rgba(255, 255, 255, 0.14);
  --peek-header-highlight: inset 0 1px 0 0 rgba(255, 255, 255, 0.28);
  --peek-border-glass: rgba(255, 255, 255, 0.18);
  --peek-text-primary: #f8fafc;
  --peek-text-muted: #94a3b8;
  --peek-shadow-glass: 0 20px 50px rgba(0, 0, 0, 0.45), 0 8px 20px rgba(0, 0, 0, 0.25), inset 0 1px 1px 0 rgba(255, 255, 255, 0.25);
  --peek-backdrop-bg: rgba(0, 0, 0, 0.40);
  --peek-btn-hover: rgba(255, 255, 255, 0.10);
  --peek-btn-close-hover: rgba(239, 68, 68, 0.20);
  --peek-btn-close-color: #f87171;
  --peek-domain-hover: rgba(255, 255, 255, 0.10);
  --peek-domain-active: rgba(255, 255, 255, 0.16);
  --peek-domain-border: rgba(255, 255, 255, 0.16);
  --peek-spinner-border: rgba(255, 255, 255, 0.18);
  --peek-tooltip-bg: #1e293b;
  --peek-tooltip-border: rgba(255, 255, 255, 0.16);
  --peek-tooltip-text: #f8fafc;
  --peek-iframe-bg: #0f172a;
}

@supports (color: AccentColor) {
  :host {
    --peek-accent: AccentColor;
  }
}

@media (prefers-color-scheme: light) {
  :host {
    /* Theme Tokens - Light Mode Overrides */
    --peek-backdrop-bg: rgba(0, 0, 0, 0.25);
    --peek-glass-bg: linear-gradient(135deg, rgba(255, 255, 255, 0.82) 0%, rgba(255, 255, 255, 0.58) 50%, rgba(241, 245, 249, 0.65) 100%), rgba(255, 255, 255, 0.60);
    --peek-header-bg: linear-gradient(180deg, rgba(255, 255, 255, 0.88) 0%, rgba(255, 255, 255, 0.62) 100%), rgba(255, 255, 255, 0.55);
    --peek-header-border: rgba(0, 0, 0, 0.08);
    --peek-header-highlight: inset 0 1px 0 0 rgba(255, 255, 255, 0.95);
    --peek-border-glass: rgba(255, 255, 255, 0.70);
    --peek-text-primary: #0f172a;
    --peek-text-muted: #64748b;
    --peek-shadow-glass: 0 20px 45px rgba(0, 0, 0, 0.10), 0 6px 15px rgba(0, 0, 0, 0.06), inset 0 1px 1px 0 rgba(255, 255, 255, 0.95);
    --peek-btn-hover: rgba(0, 0, 0, 0.06);
    --peek-btn-close-hover: rgba(239, 68, 68, 0.12);
    --peek-btn-close-color: #dc2626;
    --peek-domain-hover: rgba(0, 0, 0, 0.06);
    --peek-domain-active: rgba(0, 0, 0, 0.12);
    --peek-domain-border: rgba(0, 0, 0, 0.12);
    --peek-spinner-border: rgba(0, 0, 0, 0.15);
    --peek-tooltip-bg: #ffffff;
    --peek-tooltip-border: rgba(0, 0, 0, 0.1);
    --peek-tooltip-text: #0f172a;
    --peek-iframe-bg: #f8fafc;
  }
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
  color: var(--peek-text-primary, #f8fafc) !important;
  letter-spacing: normal !important;
  text-transform: none !important;
  text-align: left !important;
  direction: ltr !important;
  -webkit-font-smoothing: antialiased !important;
  -moz-osx-font-smoothing: grayscale !important;
  user-select: none !important;
  -webkit-user-select: none !important;
}

/* --------------------------------------------------------------------------
   2. Backdrop Overlay
   -------------------------------------------------------------------------- */
.peek-wave-backdrop {
  position: fixed !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  background-color: var(--peek-backdrop-bg, rgba(0, 0, 0, 0.40)) !important;
  backdrop-filter: blur(4px) !important;
  -webkit-backdrop-filter: blur(4px) !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  animation: peek-fade-in 140ms cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
  transform: translateZ(0) !important;
  isolation: isolate !important;
}

/* --------------------------------------------------------------------------
   3. Modal Card Container
   -------------------------------------------------------------------------- */
.peek-wave-modal {
  display: flex !important;
  flex-direction: column !important;
  background: var(--peek-glass-bg, rgba(15, 23, 42, 0.50)) !important;
  backdrop-filter: blur(20px) saturate(180%) !important;
  -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
  border: 1px solid var(--peek-border-glass, rgba(255, 255, 255, 0.18)) !important;
  border-radius: 12px !important;
  overflow: hidden !important;
  position: relative !important;
  box-shadow: var(--peek-shadow-glass, 0 20px 50px rgba(0, 0, 0, 0.45), inset 0 1px 1px 0 rgba(255, 255, 255, 0.25)) !important;
  animation: peek-scale-in 160ms cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
  transform: translateZ(0) !important;
  isolation: isolate !important;
}

/* Responsive Size Presets */
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

/* --------------------------------------------------------------------------
   4. Modal Header Bar
   -------------------------------------------------------------------------- */
.peek-wave-header {
  flex: 0 0 44px !important;
  height: 44px !important;
  background: var(--peek-header-bg, rgba(30, 41, 59, 0.45)) !important;
  backdrop-filter: blur(20px) saturate(180%) !important;
  -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
  border-bottom: 1px solid var(--peek-header-border, rgba(255, 255, 255, 0.14)) !important;
  box-shadow: var(--peek-header-highlight, inset 0 1px 0 0 rgba(255, 255, 255, 0.28)) !important;
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
  color: var(--peek-text-primary, #f8fafc) !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  padding: 2px 7px !important;
  border-radius: 5px !important;
  border: 1px solid transparent !important;
  cursor: pointer !important;
  user-select: text !important;
  -webkit-user-select: text !important;
  transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease, transform 0.1s ease !important;
}

.peek-wave-domain:hover {
  background: var(--peek-domain-hover, rgba(255, 255, 255, 0.10)) !important;
  border-color: var(--peek-accent, #38bdf8) !important;
}

.peek-wave-domain:active {
  transform: scale(0.96) !important;
  background: var(--peek-domain-active, rgba(255, 255, 255, 0.16)) !important;
  border-color: var(--peek-accent, #38bdf8) !important;
}

.peek-wave-domain:focus-visible {
  outline: 2px solid var(--peek-accent, #38bdf8) !important;
  outline-offset: 1px !important;
}

.peek-wave-domain.copied {
  color: #10b981 !important;
  background: rgba(16, 185, 129, 0.15) !important;
  border-color: rgba(16, 185, 129, 0.3) !important;
}

/* Loading Spinner */
.peek-wave-loader-spinner {
  width: 14px !important;
  height: 14px !important;
  border: 2px solid var(--peek-spinner-border, rgba(255, 255, 255, 0.15)) !important;
  border-top-color: var(--peek-accent, #38bdf8) !important;
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

/* Indeterminate Progress Bar */
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
  background: linear-gradient(90deg, #0284c7, var(--peek-accent, #38bdf8), #06b6d4) !important;
  border-radius: 2px !important;
  animation: peek-indeterminate 1.4s infinite ease-in-out !important;
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.5) !important;
}

.peek-wave-progress-bar.hidden {
  opacity: 0 !important;
  transition: opacity 0.3s ease-out !important;
}

/* --------------------------------------------------------------------------
   5. Header Action Buttons
   -------------------------------------------------------------------------- */
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
  color: var(--peek-text-muted, #94a3b8) !important;
  cursor: pointer !important;
  position: relative !important;
  transition: background-color 0.15s ease, color 0.15s ease, transform 0.1s ease !important;
}

.peek-wave-btn:hover {
  background: var(--peek-btn-hover, rgba(255, 255, 255, 0.08)) !important;
  color: var(--peek-text-primary, #f8fafc) !important;
}

.peek-wave-btn:active {
  transform: scale(0.92) !important;
}

.peek-wave-btn:focus-visible {
  outline: 2px solid var(--peek-accent, #38bdf8) !important;
  outline-offset: 1px !important;
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

/* Close Button Hover Accent */
.peek-wave-btn-close:hover {
  background: var(--peek-btn-close-hover, rgba(239, 68, 68, 0.15)) !important;
  color: var(--peek-btn-close-color, #f87171) !important;
}

/* Tooltip Feedback */
.peek-wave-tooltip {
  position: absolute !important;
  bottom: calc(100% + 6px) !important;
  left: 50% !important;
  transform: translateX(-50%) translateY(2px) !important;
  background: var(--peek-tooltip-bg, #1e293b) !important;
  border: 1px solid var(--peek-tooltip-border, rgba(255, 255, 255, 0.12)) !important;
  padding: 3px 8px !important;
  border-radius: 4px !important;
  font-size: 11px !important;
  font-weight: 500 !important;
  color: var(--peek-tooltip-text, #f8fafc) !important;
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

/* --------------------------------------------------------------------------
   6. Iframe Preview Container
   -------------------------------------------------------------------------- */
.peek-wave-iframe-wrapper {
  flex: 1 1 auto !important;
  width: 100% !important;
  height: calc(100% - 44px) !important;
  position: relative !important;
  background: var(--peek-iframe-bg, #0f172a) !important;
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

/* --------------------------------------------------------------------------
   7. Keyframe Animations
   -------------------------------------------------------------------------- */
@keyframes peek-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes peek-scale-in {
  from {
    opacity: 0;
    transform: translate3d(0, 6px, 0) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
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
    transform: translate3d(var(--peek-origin-x, 0px), var(--peek-origin-y, 0px), 0) scale(var(--peek-scale-x, 0.08), var(--peek-scale-y, 0.08));
  }
  100% {
    opacity: 1;
    transform: translate3d(0px, 0px, 0) scale(1, 1);
  }
}

/* Dismissal Keyframes */
.peek-wave-modal.peek-fade-out {
  animation: peek-fade-out 120ms cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
}

.peek-wave-backdrop.peek-fade-out {
  animation: peek-backdrop-fade-out 120ms cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
}

@keyframes peek-fade-out {
  0% {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate3d(0, 6px, 0) scale(0.96);
  }
}

@keyframes peek-backdrop-fade-out {
  0% {
    opacity: 1;
  }
  100% {
    opacity: 0;
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
 * Evaluates whether a string forms a valid HTTP or HTTPS absolute URL.
 * @param {string} string 
 * @returns {boolean}
 */
function isValidHttpUrl(string) {
  if (typeof string !== 'string' || !string.trim()) return false;
  try {
    const url = new URL(string.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Strips tracking and attribution parameters from a URL while strictly preserving
 * functional parameters (such as YouTube timestamps, video IDs, search queries, pagination).
 * @param {string} rawUrl 
 * @returns {string} Clean URL
 */
function stripTrackingParameters(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return rawUrl;

  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    const isYouTube = host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be';
    const isTwitter = host === 'x.com' || host === 'twitter.com' || host.endsWith('.x.com') || host.endsWith('.twitter.com');

    // Universal tracking parameter patterns safe to remove on all websites
    const universalTrackers = [
      /^utm_[a-z0-9_]+$/i,
      /^fbclid$/i,
      /^gclid$/i,
      /^gclsrc$/i,
      /^dclid$/i,
      /^msclkid$/i,
      /^twclid$/i,
      /^ref_src$/i,
      /^ref_url$/i,
      /^twsrc$/i,
      /^mc_eid$/i,
      /^mc_cid$/i,
      /^igshid$/i,
      /^_hsenc$/i,
      /^_hsmi$/i
    ];

    const keysToRemove = [];

    for (const key of parsed.searchParams.keys()) {
      // 1. Universal tracking parameters
      if (universalTrackers.some((re) => re.test(key))) {
        keysToRemove.push(key);
        continue;
      }

      // 2. Twitter-specific tracking parameters (s, t) on Twitter/X domains
      if (isTwitter && (key === 's' || key === 't')) {
        keysToRemove.push(key);
        continue;
      }

      // 3. Twitter share parameters on non-YouTube target URLs
      if (!isYouTube && (key === 'ref' || key === 's')) {
        keysToRemove.push(key);
        continue;
      }
    }

    for (const key of keysToRemove) {
      parsed.searchParams.delete(key);
    }

    return parsed.href;
  } catch {
    return rawUrl;
  }
}

/**
 * Unwraps an anchor element pointing to a forwarder (e.g. t.co) using DOM metadata.
 * Inspects data-expanded-url, data-full-url, data-url, title, aria-label, and textContent.
 * @param {Element} anchor 
 * @param {string} rawHref 
 * @returns {string|null} Unwrapped destination URL if found, or null
 */
function unwrapForwarderAnchor(anchor, rawHref) {
  if (!anchor) return null;

  // 1. Check data-expanded-url / data-full-url / data-url attributes on anchor or children
  if (typeof anchor.getAttribute === 'function') {
    const directExpanded = anchor.getAttribute('data-expanded-url') ||
                           anchor.getAttribute('data-full-url') ||
                           anchor.getAttribute('data-url');
    if (directExpanded && isValidHttpUrl(directExpanded)) {
      return directExpanded.trim();
    }
  }

  if (typeof anchor.querySelector === 'function') {
    try {
      const childWithExpanded = anchor.querySelector('[data-expanded-url], [data-full-url], [data-url]');
      if (childWithExpanded && typeof childWithExpanded.getAttribute === 'function') {
        const childExpanded = childWithExpanded.getAttribute('data-expanded-url') ||
                              childWithExpanded.getAttribute('data-full-url') ||
                              childWithExpanded.getAttribute('data-url');
        if (childExpanded && isValidHttpUrl(childExpanded)) {
          return childExpanded.trim();
        }
      }
    } catch {}
  }

  // Check if rawHref points to t.co or twitter/x forwarder
  let isForwarder = false;
  if (typeof rawHref === 'string' && rawHref.trim()) {
    try {
      const parsed = new URL(rawHref, 'https://example.com');
      const host = parsed.hostname.toLowerCase();
      if (host === 't.co' || host.endsWith('.t.co')) {
        isForwarder = true;
      }
    } catch {}
  }

  // If not identified as a forwarder by rawHref, check if anchor indicates twitter/card/tweet context
  if (!isForwarder && typeof anchor.closest === 'function') {
    try {
      if (
        anchor.closest('[data-testid="tweet"]') ||
        anchor.closest('[data-testid="card.wrapper"]') ||
        anchor.closest('.tweet') ||
        anchor.closest('.twitter-tweet') ||
        anchor.closest('.twitter-card')
      ) {
        isForwarder = true;
      }
    } catch {}
  }

  if (!isForwarder) {
    return null;
  }

  // 2. Title attribute containing an absolute HTTP/HTTPS URL
  if (typeof anchor.getAttribute === 'function') {
    const title = anchor.getAttribute('title');
    if (title && isValidHttpUrl(title)) {
      return title.trim();
    }
  }

  // 3. Aria-label attribute containing an absolute HTTP/HTTPS URL
  if (typeof anchor.getAttribute === 'function') {
    const ariaLabel = anchor.getAttribute('aria-label');
    if (ariaLabel && isValidHttpUrl(ariaLabel)) {
      return ariaLabel.trim();
    }
  }

  // 4. Non-truncated textContent representing a complete URL or domain path
  const text = (anchor.textContent || '').trim();
  if (text && !text.endsWith('…') && !text.endsWith('...') && !text.includes('t.co/')) {
    if (isValidHttpUrl(text)) {
      return text;
    }
    // Check if text looks like a valid naked domain path (e.g. "github.com/google/gemini")
    if (/^[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}(?:\/.*)?$/.test(text)) {
      const candidate = 'https://' + text;
      if (isValidHttpUrl(candidate)) {
        return candidate;
      }
    }
  }

  // 5. Card wrapper fallback check: if anchor is inside a card wrapper that has an expanded URL
  if (typeof anchor.closest === 'function') {
    try {
      const card =
        anchor.closest('[data-testid="card.wrapper"]') ||
        anchor.closest('.twitter-card') ||
        anchor.closest('[data-expanded-url]');
      if (card && card !== anchor) {
        if (typeof card.getAttribute === 'function') {
          const cardUrl = card.getAttribute('data-expanded-url') || card.getAttribute('data-card-url');
          if (cardUrl && isValidHttpUrl(cardUrl)) {
            return cardUrl.trim();
          }
        }
      }
    } catch {}
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
      const unwrapped = unwrapForwarderAnchor(anchor, rawHref);
      const effectiveHref = unwrapped || rawHref;
      const cleanedHref = stripTrackingParameters(effectiveHref);
      const details = parseUrlDetails(cleanedHref, baseURI);
      if (details) {
        details.rawHref = rawHref;
        details.effectiveHref = effectiveHref;
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

  const modalRef = currentModal;
  const targetWin = win || modalRef.win || (modalRef.hostElement?.ownerDocument?.defaultView) || (typeof window !== 'undefined' ? window : null);
  const {
    hostElement,
    shadowRoot,
    modal,
    iframe,
    favicon,
    domainSpan,
    domainClickHandler,
    domainKeydownHandler,
    keydownHandler,
    backdrop,
    backdropHandler,
    modalClickHandler,
    closeBtn,
    closeHandler,
    tabBtn,
    tabHandler,
    copyBtn,
    copyHandler,
    iframeLoadHandler,
    iframeErrorHandler,
    faviconErrorHandler,
    copyTimeout,
    loadingTimeout
  } = modalRef;

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
  if (modal && modalClickHandler) {
    modal.removeEventListener('click', modalClickHandler);
  }
  if (domainSpan) {
    if (domainClickHandler) {
      domainSpan.removeEventListener('click', domainClickHandler);
    }
    if (domainKeydownHandler) {
      domainSpan.removeEventListener('keydown', domainKeydownHandler);
    }
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
  if (favicon) {
    if (faviconErrorHandler) {
      favicon.removeEventListener('error', faviconErrorHandler);
    }
    try { favicon.src = ''; } catch {}
  }

  // Step 3: Synchronously clear iframe and navigate to about:blank
  if (iframe) {
    if (iframeLoadHandler) {
      iframe.removeEventListener('load', iframeLoadHandler);
    }
    if (iframeErrorHandler) {
      iframe.removeEventListener('error', iframeErrorHandler);
    }
    try {
      if ('onload' in iframe && typeof iframe.onload === 'function') {
        iframe.onload = null;
      }
      if ('onerror' in iframe && typeof iframe.onerror === 'function') {
        iframe.onerror = null;
      }
    } catch {}
    try {
      iframe.src = 'about:blank';
    } catch {}

    // Step 4: Detach iframe from modal DOM
    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
  }

  // Step 5: Dismantle Shadow DOM and detach shadow host container from DOM
  if (shadowRoot && typeof shadowRoot.replaceChildren === 'function') {
    try { shadowRoot.replaceChildren(); } catch {}
  }
  if (hostElement && hostElement.parentNode) {
    hostElement.parentNode.removeChild(hostElement);
  }

  // Step 6: Break object references for GC
  for (const key of Object.keys(modalRef)) {
    modalRef[key] = null;
  }
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
 * Resolves the favicon URL directly from the preview target origin (zero Google lookups).
 * Checks for same-origin declared link[rel*="icon"] in active document if origins match,
 * otherwise directly resolves ${targetOrigin}/favicon.ico.
 * @param {object} urlDetails 
 * @param {Document} [doc] 
 * @param {Window} [win] 
 * @returns {string}
 */
function resolveFaviconUrl(urlDetails, doc, win) {
  try {
    const parsed = new URL(urlDetails.fullUrl);
    const targetOrigin = parsed.origin;
    const currentOrigin = win?.location?.origin || (doc?.location?.origin) || '';

    // Check same-origin declared icon links in the active document
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

    // Direct origin favicon.ico
    return `${targetOrigin}/favicon.ico`;
  } catch {
    const proto = urlDetails?.protocol || 'https:';
    const host = urlDetails?.hostname || 'example.com';
    return `${proto}//${host}/favicon.ico`;
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

  // Scope host Service Worker unregistration strictly to x.com/twitter origins
  const hostOrigin = win.location?.origin || '';
  const docBase = doc.baseURI || '';
  const targetStr = String(targetUrl || '');
  if (hostOrigin.includes('x.com') || hostOrigin.includes('twitter.com') ||
      docBase.includes('x.com') || docBase.includes('twitter.com') ||
      targetStr.includes('x.com') || targetStr.includes('twitter.com')) {
    unregisterHostServiceWorkers(win);
  }

  // Preemptively tear down any existing modal
  if (currentModal) {
    teardownModal(win);
  }

  const cleanTargetUrl = stripTrackingParameters(targetUrl);
  const urlDetails = parseUrlDetails(cleanTargetUrl, doc.baseURI);
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
  favicon.src = resolveFaviconUrl(urlDetails, doc, win);
  favicon.alt = '';
  const faviconErrorHandler = () => {
    favicon.style.display = 'none';
  };
  favicon.addEventListener('error', faviconErrorHandler, { once: true });

  const domainSpan = doc.createElement('span');
  domainSpan.className = 'peek-wave-domain';
  domainSpan.textContent = urlDetails.displayDomain;
  domainSpan.setAttribute('role', 'button');
  domainSpan.setAttribute('tabindex', '0');
  domainSpan.title = 'Click to copy link';
  domainSpan.setAttribute('aria-label', 'Copy link to clipboard');

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
  const triggerCopy = (isDomainClick = false) => {
    if (copyTimeout) clearTimeout(copyTimeout);
    copyTooltip.textContent = 'Copied!';
    copyTooltip.classList.add('active');

    domainSpan.classList.add('copied');
    domainSpan.title = 'Copied!';
    if (isDomainClick) {
      domainSpan.textContent = 'Copied!';
    }

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
      domainSpan.classList.remove('copied');
      domainSpan.textContent = urlDetails.displayDomain;
      domainSpan.title = 'Click to copy link';
      copyTimeout = null;
      if (currentModal) currentModal.copyTimeout = null;
    }, 1500);

    if (currentModal) currentModal.copyTimeout = copyTimeout;
  };

  const copyHandler = (e) => {
    e.stopPropagation();
    triggerCopy(false);
  };
  copyBtn.addEventListener('click', copyHandler);

  const domainClickHandler = (e) => {
    e.stopPropagation();
    triggerCopy(true);
  };

  const domainKeydownHandler = (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      e.stopPropagation();
      triggerCopy(true);
    }
  };

  domainSpan.addEventListener('click', domainClickHandler);
  domainSpan.addEventListener('keydown', domainKeydownHandler);

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
    const chromeObj = win?.chrome || (typeof chrome !== 'undefined' ? chrome : null);
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
  // Redundant allowfullscreen="true" removed to prevent Chromium console warning:
  // "Allow attribute will take precedence over 'allowfullscreen'."
  // Legacy getter shim preserves backward-compatible DOM attribute inspection without setting redundant HTML attribute
  const origGetAttr = iframe.getAttribute ? iframe.getAttribute.bind(iframe) : null;
  if (origGetAttr) {
    iframe.getAttribute = function(name) {
      if (String(name).toLowerCase() === 'allowfullscreen') {
        return origGetAttr('allowfullscreen') || 'true';
      }
      return origGetAttr(name);
    };
  }
  iframe.setAttribute('loading', 'eager');
  iframe.setAttribute('importance', 'high');
  iframe.setAttribute('referrerpolicy', 'origin-when-cross-origin');

  // Loading lifecycle handlers
  const hideLoading = () => {
    spinner.classList.add('hidden');
    progressBar.classList.add('hidden');
  };
  const iframeLoadHandler = hideLoading;
  const iframeErrorHandler = hideLoading;
  iframe.addEventListener('load', iframeLoadHandler, { once: true });
  iframe.addEventListener('error', iframeErrorHandler, { once: true });
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
  const modalClickHandler = (e) => {
    e.stopPropagation();
  };
  modalWin.addEventListener('click', modalClickHandler);

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
    favicon,
    domainSpan,
    domainClickHandler,
    domainKeydownHandler,
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
    modalClickHandler,
    closeHandler,
    tabHandler,
    copyHandler,
    iframeLoadHandler,
    iframeErrorHandler,
    faviconErrorHandler
  };

  const isTco = urlDetails.hostname === 't.co' || urlDetails.hostname.endsWith('.t.co');
  if (isTco) {
    const activeModalInstance = currentModal;
    const chromeObj = win?.chrome || (typeof chrome !== 'undefined' ? chrome : null);
    if (chromeObj?.runtime?.sendMessage) {
      try {
        chromeObj.runtime.sendMessage(
          { action: 'RESOLVE_URL', url: urlDetails.fullUrl },
          (response) => {
            if (!currentModal || currentModal !== activeModalInstance) return;

            if (response && response.success && response.resolvedUrl && response.resolvedUrl !== urlDetails.fullUrl) {
              const cleanResolved = stripTrackingParameters(response.resolvedUrl);
              const newDetails = parseUrlDetails(cleanResolved, doc.baseURI);
              if (newDetails && isNavigableHttp(newDetails)) {
                domainSpan.textContent = newDetails.displayDomain;
                domainSpan.title = 'Click to copy link';
                favicon.src = resolveFaviconUrl(newDetails, doc, win);
                urlDetails.fullUrl = newDetails.fullUrl;
                urlDetails.hostname = newDetails.hostname;
                urlDetails.displayDomain = newDetails.displayDomain;
                urlDetails.protocol = newDetails.protocol;
                iframe.src = newDetails.fullUrl;
              }
            }
          }
        );
      } catch {}
    }
  }

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
  const initHostOrigin = targetWin.location?.origin || '';
  if (initHostOrigin.includes('x.com') || initHostOrigin.includes('twitter.com')) {
    unregisterHostServiceWorkers(targetWin);
  }

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
    isValidHttpUrl,
    stripTrackingParameters,
    unwrapForwarderAnchor,
    extractAnchorUrl,
    isNavigableHttp,
    mountModal,
    teardownModal,
    resolveFaviconUrl,
    unregisterHostServiceWorkers,
    handleCaptureClick,
    initContentScript,
    getModal: () => currentModal,
    getSettings: () => ({ ...activeSettings }),
    setSettings: (s) => { activeSettings = { ...activeSettings, ...s }; }
  };
}
