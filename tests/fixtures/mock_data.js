/**
 * Mock data fixtures for Peek Wave E2E testing
 */

const DEFAULT_SETTINGS = {
  enabled: true,
  modifierKey: 'shift', // 'shift' | 'alt' | 'ctrl_cmd'
  sizePreset: 'default' // 'compact' | 'default' | 'large'
};

const VALID_URLS = [
  'https://example.com/article',
  'https://github.com/facebook/react',
  'https://en.wikipedia.org/wiki/Chromium_(web_browser)',
  'https://subdomain.domain.org/path/subpath?query=1&param=true#section',
  'http://insecure-news.org/daily-brief'
];

const SPECIAL_SCHEME_URLS = [
  { url: 'javascript:void(0)', type: 'javascript', shouldIntercept: false },
  { url: 'javascript:alert(1)', type: 'javascript', shouldIntercept: false },
  { url: 'mailto:developer@example.com', type: 'mailto', shouldIntercept: false },
  { url: 'tel:+1234567890', type: 'tel', shouldIntercept: false },
  { url: '#comments', type: 'fragment', shouldIntercept: false },
  { url: 'data:text/html,<h1>Test</h1>', type: 'data', shouldIntercept: false },
  { url: 'blob:https://example.com/uuid-blob', type: 'blob', shouldIntercept: false },
  { url: 'chrome://settings', type: 'chrome_internal', shouldIntercept: false }
];

const MODIFIER_CONFIGS = [
  { name: 'shift', keyProp: 'shiftKey', eventInit: { shiftKey: true, altKey: false, ctrlKey: false, metaKey: false } },
  { name: 'alt', keyProp: 'altKey', eventInit: { shiftKey: false, altKey: true, ctrlKey: false, metaKey: false } },
  { name: 'ctrl_cmd', keyProp: 'ctrlKey', eventInit: { shiftKey: false, altKey: false, ctrlKey: true, metaKey: false } },
  { name: 'ctrl_cmd_mac', keyProp: 'metaKey', eventInit: { shiftKey: false, altKey: false, ctrlKey: false, metaKey: true } }
];

const SIZE_PRESETS = {
  compact: { width: 760, height: 560, className: 'peek-size-compact' },
  default: { width: 1040, height: 740, className: 'peek-size-default' },
  large: { width: 1360, height: 880, className: 'peek-size-large' }
};

module.exports = {
  DEFAULT_SETTINGS,
  VALID_URLS,
  SPECIAL_SCHEME_URLS,
  MODIFIER_CONFIGS,
  SIZE_PRESETS
};
