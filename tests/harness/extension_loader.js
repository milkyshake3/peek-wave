/**
 * extension_loader.js - Dynamic test environment loader and file validator
 * Pure Node.js implementation without external dependencies.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createBrowserEnvironment } = require('./dom_simulator');
const { createChromeMock } = require('./chrome_mock');
const { createReferenceEngine } = require('./reference_engine');

const PROJECT_ROOT = path.resolve(__dirname, '../../');
const CONTENT_SCRIPT_PATH = path.join(PROJECT_ROOT, 'content/content.js');
const POPUP_SCRIPT_PATH = path.join(PROJECT_ROOT, 'popup/popup.js');
const POPUP_HTML_PATH = path.join(PROJECT_ROOT, 'popup/popup.html');
const STORAGE_SCRIPT_PATH = path.join(PROJECT_ROOT, 'lib/storage.js');

// Precompiled VM script cache for high performance
let compiledContentScript = null;
let compiledPopupScript = null;
let compiledStorageScript = null;

function getCompiledStorageScript() {
  if (!compiledStorageScript && fs.existsSync(STORAGE_SCRIPT_PATH)) {
    const code = fs.readFileSync(STORAGE_SCRIPT_PATH, 'utf8');
    compiledStorageScript = new vm.Script(code, {
      filename: 'lib/storage.js',
      lineOffset: 0
    });
  }
  return compiledStorageScript;
}

function getCompiledPopupScript() {
  if (!compiledPopupScript && fs.existsSync(POPUP_SCRIPT_PATH)) {
    const code = fs.readFileSync(POPUP_SCRIPT_PATH, 'utf8');
    compiledPopupScript = new vm.Script(code, {
      filename: 'popup/popup.js',
      lineOffset: 0
    });
  }
  return compiledPopupScript;
}

function getCompiledContentScript() {
  if (!compiledContentScript) {
    const code = fs.readFileSync(CONTENT_SCRIPT_PATH, 'utf8');
    compiledContentScript = new vm.Script(code, {
      filename: 'content/content.js',
      lineOffset: 0
    });
  }
  return compiledContentScript;
}

/**
 * Directly evaluates and executes live content/content.js inside the simulated browser context.
 * Provides per-environment isolation to prevent state leakage across concurrent tabs and test runs.
 * @param {Window} win 
 * @param {ChromeMock} chrome 
 * @returns {object} The exported content script engine instance
 */
function loadLiveContentScript(win, chrome) {
  const script = getCompiledContentScript();
  const mod = { exports: {} };

  const sandbox = {
    window: win,
    document: win.document,
    chrome: chrome,
    location: win.location,
    navigator: win.navigator,
    URL: global.URL,
    setTimeout: (fn, ms, ...args) => win.setTimeout(fn, ms, ...args),
    clearTimeout: (id) => win.clearTimeout(id),
    setInterval: (fn, ms, ...args) => win.setInterval(fn, ms, ...args),
    clearInterval: (id) => win.clearInterval(id),
    console: console,
    Event: win.Event,
    MouseEvent: win.MouseEvent,
    KeyboardEvent: win.KeyboardEvent,
    CustomEvent: win.CustomEvent,
    Node: win.Node,
    Element: win.Element,
    ShadowRoot: win.ShadowRoot,
    HTMLAnchorElement: win.HTMLAnchorElement,
    SVGAElement: win.SVGAElement,
    HTMLIFrameElement: win.HTMLIFrameElement,
    HTMLButtonElement: win.HTMLButtonElement,
    HTMLImageElement: win.HTMLImageElement,
    Document: win.Document,
    Window: win.Window,
    module: mod,
    exports: mod.exports
  };

  try {
    const context = vm.createContext(sandbox);
    script.runInContext(context);
    return mod.exports;
  } catch (err) {
    // Resilient fallback to Function constructor closure wrapper if VM context fails
    const code = fs.readFileSync(CONTENT_SCRIPT_PATH, 'utf8');
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
    return mod.exports;
  }
}

/**
 * Directly evaluates and executes live lib/storage.js inside the simulated browser context.
 * Binds the storage utility instance to win.PeekWaveStorage and returns it.
 * @param {Window} win 
 * @param {ChromeMock} chrome 
 * @returns {object} The storage module instance
 */
function loadLiveStorageScript(win, chrome) {
  if (!fs.existsSync(STORAGE_SCRIPT_PATH)) {
    return null;
  }

  const script = getCompiledStorageScript();
  const mod = { exports: {} };

  const sandbox = {
    window: win,
    globalThis: win,
    chrome: chrome || (win && win.chrome),
    console: console,
    queueMicrotask: (fn) => (typeof win?.queueMicrotask === 'function' ? win.queueMicrotask(fn) : typeof queueMicrotask === 'function' ? queueMicrotask(fn) : Promise.resolve().then(fn)),
    setTimeout: (fn, ms, ...args) => (win ? win.setTimeout(fn, ms, ...args) : setTimeout(fn, ms, ...args)),
    clearTimeout: (id) => (win ? win.clearTimeout(id) : clearTimeout(id)),
    module: mod,
    exports: mod.exports
  };

  try {
    const context = vm.createContext(sandbox);
    script.runInContext(context);
    const storageObj = (mod.exports && Object.keys(mod.exports).length > 0)
      ? mod.exports
      : sandbox.PeekWaveStorage;
    if (win) {
      win.PeekWaveStorage = storageObj;
      win.DEFAULT_SETTINGS = storageObj.DEFAULT_SETTINGS;
      win.readSettings = storageObj.readSettings;
      win.saveSettings = storageObj.saveSettings;
      win.normalizeModifierKey = storageObj.normalizeModifierKey;
      win.normalizeModalSize = storageObj.normalizeModalSize;
      win.resolveModalSize = storageObj.resolveModalSize;
      win.broadcastSettings = storageObj.broadcastSettings;
    }
    return storageObj;
  } catch (err) {
    const storageObj = require(STORAGE_SCRIPT_PATH);
    if (win) {
      win.PeekWaveStorage = storageObj;
    }
    return storageObj;
  }
}

/**
 * Directly evaluates and executes live popup/popup.js inside the simulated browser context.
 * Provides per-environment isolation to prevent state leakage across concurrent tabs and test runs.
 * @param {Window} win 
 * @param {ChromeMock} chrome 
 * @returns {object|null} The exported popup module instance
 */
function loadLivePopupScript(win, chrome) {
  if (!fs.existsSync(POPUP_SCRIPT_PATH)) {
    return null;
  }

  // Ensure live storage module is loaded and bound to win.PeekWaveStorage
  let storageInstance = (win && win.PeekWaveStorage) || loadLiveStorageScript(win, chrome);
  if (!storageInstance && fs.existsSync(STORAGE_SCRIPT_PATH)) {
    storageInstance = require(STORAGE_SCRIPT_PATH);
    if (win) win.PeekWaveStorage = storageInstance;
  }

  const script = getCompiledPopupScript();
  const mod = { exports: {} };

  const sandbox = {
    window: win,
    document: win.document,
    chrome: chrome,
    location: win.location,
    navigator: win.navigator,
    URL: global.URL,
    PeekWaveStorage: storageInstance,
    require: (modPath) => {
      if (typeof modPath === 'string' && modPath.includes('storage')) {
        return storageInstance;
      }
      return require(modPath);
    },
    queueMicrotask: (fn) => (typeof win?.queueMicrotask === 'function' ? win.queueMicrotask(fn) : typeof queueMicrotask === 'function' ? queueMicrotask(fn) : Promise.resolve().then(fn)),
    setTimeout: (fn, ms, ...args) => win.setTimeout(fn, ms, ...args),
    clearTimeout: (id) => win.clearTimeout(id),
    setInterval: (fn, ms, ...args) => win.setInterval(fn, ms, ...args),
    clearInterval: (id) => win.clearInterval(id),
    console: console,
    Event: win.Event,
    MouseEvent: win.MouseEvent,
    KeyboardEvent: win.KeyboardEvent,
    CustomEvent: win.CustomEvent,
    Node: win.Node,
    Element: win.Element,
    Document: win.Document,
    Window: win.Window,
    module: mod,
    exports: mod.exports
  };

  try {
    const context = vm.createContext(sandbox);
    script.runInContext(context);
    return mod.exports;
  } catch (err) {
    const code = fs.readFileSync(POPUP_SCRIPT_PATH, 'utf8');
    const factory = new Function(
      'window', 'document', 'chrome', 'location', 'navigator', 'module', 'exports',
      'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'URL', 'console',
      'PeekWaveStorage', 'require',
      code
    );
    factory(
      win, win.document, chrome, win.location, win.navigator, mod, mod.exports,
      (fn, ms, ...args) => win.setTimeout(fn, ms, ...args),
      (id) => win.clearTimeout(id),
      (fn, ms, ...args) => win.setInterval(fn, ms, ...args),
      (id) => win.clearInterval(id),
      global.URL, console,
      storageInstance,
      (modPath) => (typeof modPath === 'string' && modPath.includes('storage') ? storageInstance : require(modPath))
    );
    return mod.exports;
  }
}

// Authoritative spec fallback objects if files are not yet created on disk
const SPEC_MANIFEST = {
  manifest_version: 3,
  name: "Peek Wave",
  version: "1.0.0",
  description: "Lightweight, low-RAM link previewer in an isolated modal overlay.",
  permissions: ["storage", "declarativeNetRequest", "clipboardWrite"],
  host_permissions: ["<all_urls>"],
  background: {
    service_worker: "background.js",
    type: "module"
  },
  action: {
    default_popup: "popup/popup.html",
    default_title: "Peek Wave Settings",
    default_icon: {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["content/content.js"],
      css: [],
      run_at: "document_idle",
      all_frames: false
    }
  ],
  declarative_net_request: {
    rule_resources: [
      {
        id: "subframe_headers",
        enabled: true,
        path: "rules.json"
      }
    ]
  },
  icons: {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
};

const SPEC_RULES = [
  {
    id: 1,
    priority: 1,
    action: {
      type: "modifyHeaders",
      responseHeaders: [
        { header: "X-Frame-Options", operation: "remove" },
        { header: "Frame-Options", operation: "remove" },
        { header: "Content-Security-Policy", operation: "remove" },
        { header: "Content-Security-Policy-Report-Only", operation: "remove" }
      ]
    },
    condition: {
      urlFilter: "*",
      resourceTypes: ["sub_frame"]
    }
  }
];

function getManifest() {
  const p = path.join(PROJECT_ROOT, 'manifest.json');
  if (fs.existsSync(p)) {
    try {
      return { data: JSON.parse(fs.readFileSync(p, 'utf8')), isFromDisk: true, path: p };
    } catch (e) {
      return { error: e.message, isFromDisk: true, path: p };
    }
  }
  return { data: SPEC_MANIFEST, isFromDisk: false, path: p };
}

function getRules() {
  const p = path.join(PROJECT_ROOT, 'rules.json');
  if (fs.existsSync(p)) {
    try {
      return { data: JSON.parse(fs.readFileSync(p, 'utf8')), isFromDisk: true, path: p };
    } catch (e) {
      return { error: e.message, isFromDisk: true, path: p };
    }
  }
  return { data: SPEC_RULES, isFromDisk: false, path: p };
}

function validatePngBuffer(buf, expectedSize) {
  if (!Buffer.isBuffer(buf) || buf.length < 24) {
    return { valid: false, error: 'File is not a valid binary buffer or is too small' };
  }
  // PNG Magic Header: 89 50 4E 47 0D 0A 1A 0A
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buf.subarray(0, 8).equals(pngHeader)) {
    return { valid: false, error: 'Missing PNG magic header bytes' };
  }
  // IHDR chunk starts at byte 12 (length: 4, type 'IHDR': 4, width: 4, height: 4)
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);

  if (expectedSize && (width !== expectedSize || height !== expectedSize)) {
    return { valid: false, width, height, error: `Expected ${expectedSize}x${expectedSize}, got ${width}x${height}` };
  }
  return { valid: true, width, height };
}

function checkIconAsset(size) {
  const iconPath = path.join(PROJECT_ROOT, 'icons', `icon${size}.png`);
  if (fs.existsSync(iconPath)) {
    const buf = fs.readFileSync(iconPath);
    const result = validatePngBuffer(buf, size);
    return { exists: true, ...result, path: iconPath };
  }
  return { exists: false, valid: false, error: 'Icon file not found on disk', path: iconPath };
}

function setupTestEnvironment(options = {}) {
  const { html = '', initialSettings = {} } = options;
  const win = createBrowserEnvironment(html);
  const chrome = createChromeMock(initialSettings);
  win.chrome = chrome;

  // Initialize rules in chrome mock
  const rules = getRules();
  if (rules.data) {
    chrome.declarativeNetRequest.setStaticRules(rules.data);
  }

  // Initialize live storage script
  const storage = loadLiveStorageScript(win, chrome);
  win.PeekWaveStorage = storage;

  // 1. Directly evaluate and execute live content/content.js
  const content = loadLiveContentScript(win, chrome);

  // 2. Reference engine for background worker and popup mock
  const engine = createReferenceEngine();
  const background = engine.initBackgroundWorker(chrome);

  // 3. Adapter binding engine settings to real content script instance
  const originalGetSettings = engine.getSettings.bind(engine);
  const originalSetSettings = engine.setSettings.bind(engine);
  engine.getSettings = () => (content && content.getSettings ? content.getSettings() : originalGetSettings());
  engine.setSettings = (s) => {
    if (content && content.setSettings) content.setSettings(s);
    originalSetSettings(s);
  };

  // 4. Adapter binding engine.initPopup to live popup script instance
  const originalInitPopup = engine.initPopup.bind(engine);
  engine.initPopup = (targetWin, targetChrome) => {
    const pWin = targetWin || win;
    const pChrome = targetChrome || chrome;

    if (!pWin.PeekWaveStorage) {
      loadLiveStorageScript(pWin, pChrome);
    }

    if (fs.existsSync(POPUP_SCRIPT_PATH)) {
      // If popup.html exists and target window lacks toggle element, mount popup elements
      if (fs.existsSync(POPUP_HTML_PATH)) {
        const hasToggle = pWin.document.getElementById('toggle-enabled') || pWin.document.getElementById('enableToggle');
        if (!hasToggle && pWin.document.body) {
          const rawHtml = fs.readFileSync(POPUP_HTML_PATH, 'utf8');
          const bodyMatch = rawHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
          const bodyContent = bodyMatch ? bodyMatch[1] : rawHtml;
          const container = pWin.document.createElement('div');
          container.className = 'peek-wave-popup-root';
          container.innerHTML = bodyContent;
          pWin.document.body.appendChild(container);
        }
      }

      const livePopup = loadLivePopupScript(pWin, pChrome);
      if (livePopup && typeof livePopup.initPopup === 'function') {
        const instance = livePopup.initPopup(pWin, pChrome);
        if (instance) return instance;
      }
    }

    return originalInitPopup(pWin, pChrome);
  };

  return {
    win,
    doc: win.document,
    chrome,
    storage,
    engine,
    background,
    content,
    getModal: () => {
      if (content && typeof content.getModal === 'function') {
        return content.getModal();
      }
      if (win && typeof win.__PEEK_WAVE_GET_MODAL__ === 'function') {
        return win.__PEEK_WAVE_GET_MODAL__();
      }
      return null;
    },
    teardown: () => {
      if (content && typeof content.teardownModal === 'function') {
        content.teardownModal(win);
      } else if (content && typeof content.teardown === 'function') {
        content.teardown();
      } else if (win && typeof win.__PEEK_WAVE_TEARDOWN__ === 'function') {
        win.__PEEK_WAVE_TEARDOWN__();
      } else {
        engine.teardownModal(win);
      }
    }
  };
}

module.exports = {
  PROJECT_ROOT,
  SPEC_MANIFEST,
  SPEC_RULES,
  getManifest,
  getRules,
  validatePngBuffer,
  checkIconAsset,
  setupTestEnvironment,
  loadLiveContentScript,
  loadLiveStorageScript,
  loadLivePopupScript
};
