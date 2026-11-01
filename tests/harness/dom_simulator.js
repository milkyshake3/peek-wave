/**
 * dom_simulator.js - Lightweight, self-contained DOM & Event engine for Peek Wave E2E testing
 * Built exclusively using Node.js standard library with zero external dependencies.
 */

class Event {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = init.bubbles ?? true;
    this.cancelable = init.cancelable ?? true;
    this.composed = init.composed ?? true;
    this.target = null;
    this.currentTarget = null;
    this.eventPhase = 0; // 0=NONE, 1=CAPTURING, 2=AT_TARGET, 3=BUBBLING
    this.defaultPrevented = false;
    this._propagationStopped = false;
    this._immediatePropagationStopped = false;
  }

  preventDefault() {
    if (this.cancelable) {
      this.defaultPrevented = true;
    }
  }

  stopPropagation() {
    this._propagationStopped = true;
  }

  stopImmediatePropagation() {
    this._propagationStopped = true;
    this._immediatePropagationStopped = true;
  }
}

class MouseEvent extends Event {
  constructor(type, init = {}) {
    super(type, init);
    this.button = init.button ?? 0; // 0=left, 1=middle, 2=right
    this.buttons = init.buttons ?? 1;
    this.clientX = init.clientX ?? 0;
    this.clientY = init.clientY ?? 0;
    this.shiftKey = Boolean(init.shiftKey);
    this.altKey = Boolean(init.altKey);
    this.ctrlKey = Boolean(init.ctrlKey);
    this.metaKey = Boolean(init.metaKey);
  }
}

class KeyboardEvent extends Event {
  constructor(type, init = {}) {
    super(type, init);
    this.key = init.key ?? '';
    this.code = init.code ?? '';
    this.shiftKey = Boolean(init.shiftKey);
    this.altKey = Boolean(init.altKey);
    this.ctrlKey = Boolean(init.ctrlKey);
    this.metaKey = Boolean(init.metaKey);
  }
}

class CustomEvent extends Event {
  constructor(type, init = {}) {
    super(type, init);
    this.detail = init.detail ?? null;
  }
}

class EventTarget {
  constructor() {
    this._listeners = new Map(); // eventType -> Array<{ handler, capture, once }>
  }

  addEventListener(type, handler, options = {}) {
    if (!type || typeof handler !== 'function') return;
    const capture = typeof options === 'boolean' ? options : Boolean(options.capture);
    const once = typeof options === 'object' ? Boolean(options.once) : false;

    if (!this._listeners.has(type)) {
      this._listeners.set(type, []);
    }
    const list = this._listeners.get(type);
    const exists = list.some(entry => entry.handler === handler && entry.capture === capture);
    if (!exists) {
      list.push({ handler, capture, once });
    }
  }

  removeEventListener(type, handler, options = {}) {
    if (!this._listeners.has(type)) return;
    const capture = typeof options === 'boolean' ? options : Boolean(options.capture);
    const list = this._listeners.get(type);
    const filtered = list.filter(entry => !(entry.handler === handler && entry.capture === capture));
    this._listeners.set(type, filtered);
  }

  dispatchEvent(event) {
    if (!event || !event.type) return true;
    event.target = this;

    // Collect propagation path: from window -> document -> ancestors -> target
    const path = [];
    let current = this;
    while (current) {
      path.push(current);
      if (current instanceof ShadowRoot) {
        current = current.host;
      } else {
        current = current.parentNode;
      }
    }
    // Also include document and window if available
    const doc = this.ownerDocument || (this instanceof Document ? this : null);
    if (doc && !path.includes(doc)) path.push(doc);
    const win = (doc && doc.defaultView) || (this instanceof Window ? this : null);
    if (win && !path.includes(win)) path.push(win);

    // Path in capture order: window -> ... -> target
    const captureOrder = [...path].reverse();

    // Phase 1: Capturing
    event.eventPhase = 1;
    for (let i = 0; i < captureOrder.length - 1; i++) {
      const node = captureOrder[i];
      event.currentTarget = node;
      node._invokeListeners(event, true);
      if (event._propagationStopped) return !event.defaultPrevented;
    }

    // Phase 2: Target
    event.eventPhase = 2;
    event.currentTarget = this;
    this._invokeListeners(event, true);
    if (!event._immediatePropagationStopped) {
      this._invokeListeners(event, false);
    }
    if (event._propagationStopped) return !event.defaultPrevented;

    // Phase 3: Bubbling
    if (event.bubbles) {
      event.eventPhase = 3;
      for (let i = 1; i < path.length; i++) {
        const node = path[i];
        event.currentTarget = node;
        node._invokeListeners(event, false);
        if (event._propagationStopped) return !event.defaultPrevented;
      }
    }

    event.eventPhase = 0;
    event.currentTarget = null;
    return !event.defaultPrevented;
  }

  _invokeListeners(event, isCapturePhase) {
    if (!this._listeners.has(event.type)) return;
    const list = [...this._listeners.get(event.type)];
    for (const entry of list) {
      if (entry.capture === isCapturePhase) {
        if (entry.once) {
          this.removeEventListener(event.type, entry.handler, { capture: entry.capture });
        }
        try {
          entry.handler.call(this, event);
        } catch (err) {
          console.error(`Error in ${event.type} listener:`, err);
        }
        if (event._immediatePropagationStopped) break;
      }
    }
  }
}

class DOMTokenList {
  constructor(element) {
    this._element = element;
    this._tokens = new Set();
  }

  add(...tokens) {
    for (const t of tokens) {
      if (t) this._tokens.add(String(t).trim());
    }
    this._sync();
  }

  remove(...tokens) {
    for (const t of tokens) {
      this._tokens.delete(String(t).trim());
    }
    this._sync();
  }

  contains(token) {
    return this._tokens.has(String(token).trim());
  }

  toggle(token, force) {
    const t = String(token).trim();
    if (force !== undefined) {
      if (force) this.add(t);
      else this.remove(t);
      return Boolean(force);
    }
    if (this.contains(t)) {
      this.remove(t);
      return false;
    } else {
      this.add(t);
      return true;
    }
  }

  _sync() {
    this._element._attributes.set('class', Array.from(this._tokens).join(' '));
  }

  _initFromString(classStr) {
    this._tokens.clear();
    if (!classStr) return;
    classStr.split(/\s+/).filter(Boolean).forEach(t => this._tokens.add(t));
  }

  toString() {
    return Array.from(this._tokens).join(' ');
  }
}

class Node extends EventTarget {
  constructor(nodeName, nodeType = 1) {
    super();
    this.nodeName = nodeName;
    this.nodeType = nodeType; // 1=Element, 3=Text, 9=Document, 11=DocumentFragment
    this.parentNode = null;
    this.childNodes = [];
    this.ownerDocument = null;
  }

  appendChild(child) {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    child.parentNode = this;
    child.ownerDocument = this.ownerDocument || (this instanceof Document ? this : null);
    this.childNodes.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx === -1) {
      throw new Error('NotFoundError: Node to be removed is not a child of this node.');
    }
    this.childNodes.splice(idx, 1);
    child.parentNode = null;
    return child;
  }

  replaceChild(newChild, oldChild) {
    const idx = this.childNodes.indexOf(oldChild);
    if (idx === -1) {
      throw new Error('NotFoundError: Old child not found.');
    }
    if (newChild.parentNode) {
      newChild.parentNode.removeChild(newChild);
    }
    this.childNodes[idx] = newChild;
    newChild.parentNode = this;
    newChild.ownerDocument = this.ownerDocument;
    oldChild.parentNode = null;
    return oldChild;
  }

  get firstChild() {
    return this.childNodes[0] || null;
  }

  get lastChild() {
    return this.childNodes[this.childNodes.length - 1] || null;
  }

  get children() {
    return this.childNodes.filter(n => n.nodeType === 1);
  }

  get parentElement() {
    return (this.parentNode && this.parentNode.nodeType === 1) ? this.parentNode : null;
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }

  contains(other) {
    if (!other) return false;
    let curr = other;
    while (curr) {
      if (curr === this) return true;
      curr = curr.parentNode;
    }
    return false;
  }
}

class Element extends Node {
  constructor(tagName) {
    super(tagName.toUpperCase(), 1);
    this.tagName = tagName.toUpperCase();
    this._attributes = new Map();
    this.classList = new DOMTokenList(this);
    this.style = {};
    this.shadowRoot = null;
  }

  getAttribute(name) {
    return this._attributes.get(name.toLowerCase()) ?? null;
  }

  setAttribute(name, value) {
    const lower = name.toLowerCase();
    const strVal = String(value);
    this._attributes.set(lower, strVal);
    if (lower === 'class') this.classList._initFromString(strVal);
    if (lower === 'style') this._parseInlineStyle(strVal);
    if (lower === 'checked') this._checked = true;
  }

  hasAttribute(name) {
    return this._attributes.has(name.toLowerCase());
  }

  removeAttribute(name) {
    const lower = name.toLowerCase();
    this._attributes.delete(lower);
    if (lower === 'class') this.classList._initFromString('');
    if (lower === 'style') this.style = {};
    if (lower === 'checked') this._checked = false;
  }

  get id() {
    return this.getAttribute('id') || '';
  }

  set id(val) {
    this.setAttribute('id', val);
  }

  get className() {
    return this.getAttribute('class') || '';
  }

  set className(val) {
    this.setAttribute('class', val);
  }

  get type() {
    return this.getAttribute('type') || '';
  }

  set type(val) {
    this.setAttribute('type', val);
  }

  get value() {
    return this._value !== undefined ? this._value : (this.getAttribute('value') || '');
  }

  set value(val) {
    this._value = String(val);
    this.setAttribute('value', String(val));
  }

  get checked() {
    return Boolean(this._checked);
  }

  set checked(val) {
    this._checked = Boolean(val);
  }

  _parseInlineStyle(styleStr) {
    this.style = {};
    if (!styleStr) return;
    const parts = styleStr.split(';');
    for (const part of parts) {
      const idx = part.indexOf(':');
      if (idx !== -1) {
        const prop = part.slice(0, idx).trim();
        const val = part.slice(idx + 1).trim();
        if (prop) {
          // camelCase conversion
          const camel = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          this.style[camel] = val;
          this.style[prop] = val;
        }
      }
    }
    this.style.cssText = styleStr;
  }

  get textContent() {
    return this.childNodes.map(n => n.textContent || '').join('');
  }

  set textContent(val) {
    this.childNodes = [];
    if (val !== '') {
      const textNode = new Node('#text', 3);
      textNode.textContent = String(val);
      textNode.ownerDocument = this.ownerDocument;
      this.appendChild(textNode);
    }
  }

  get innerHTML() {
    return this.childNodes.map(n => (n.outerHTML !== undefined ? n.outerHTML : n.textContent)).join('');
  }

  set innerHTML(html) {
    this.childNodes = [];
    if (!html) return;
    // Simple tag parser for test elements
    parseHTMLToNode(html, this, this.ownerDocument);
  }

  get outerHTML() {
    const attrs = Array.from(this._attributes.entries())
      .map(([k, v]) => ` ${k}="${v.replace(/"/g, '&quot;')}"`)
      .join('');
    const tag = this.tagName.toLowerCase();
    return `<${tag}${attrs}>${this.innerHTML}</${tag}>`;
  }

  attachShadow(options = { mode: 'open' }) {
    if (this.shadowRoot) {
      throw new Error('InvalidStateError: Shadow root already exists.');
    }
    const shadow = new ShadowRoot(this, options.mode);
    shadow.ownerDocument = this.ownerDocument;
    this.shadowRoot = shadow;
    return shadow;
  }

  closest(selector) {
    let curr = this;
    while (curr && curr.nodeType === 1) {
      if (matchesSelector(curr, selector)) {
        return curr;
      }
      curr = curr.parentElement;
    }
    return null;
  }

  querySelector(selector) {
    return querySelectorOne(this, selector);
  }

  querySelectorAll(selector) {
    return querySelectorAllNodes(this, selector);
  }

  click() {
    const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
    this.dispatchEvent(evt);
  }
}

class ShadowRoot extends Node {
  constructor(host, mode = 'open') {
    super('#shadow-root', 11);
    this.host = host;
    this.mode = mode;
  }

  querySelector(selector) {
    return querySelectorOne(this, selector);
  }

  querySelectorAll(selector) {
    return querySelectorAllNodes(this, selector);
  }

  getElementById(id) {
    return this.querySelector(`#${id}`);
  }
}

class HTMLAnchorElement extends Element {
  constructor() {
    super('A');
    this._href = '';
  }

  get href() {
    const raw = this.getAttribute('href') || '';
    if (!raw) return '';
    try {
      const base = (this.ownerDocument && this.ownerDocument.baseURI) || 'https://example.com/';
      return new URL(raw, base).href;
    } catch {
      return raw;
    }
  }

  set href(val) {
    this._href = val;
    this._attributes.set('href', String(val));
  }
}

class SVGAElement extends Element {
  constructor() {
    super('A');
    this._hrefObj = {
      baseVal: '',
      animVal: ''
    };
  }

  get href() {
    const raw = this.getAttribute('href') || '';
    this._hrefObj.baseVal = raw;
    this._hrefObj.animVal = raw;
    return this._hrefObj;
  }

  set href(val) {
    const str = typeof val === 'string' ? val : (val?.baseVal || '');
    this._hrefObj.baseVal = str;
    this._hrefObj.animVal = str;
    this._attributes.set('href', str);
  }
}

class HTMLIFrameElement extends Element {
  constructor() {
    super('IFRAME');
    this._src = '';
    this.onload = null;
    this.onerror = null;
    this.sandbox = {
      _tokens: new Set(),
      contains: (tok) => this.sandbox._tokens.has(tok),
      add: (tok) => { this.sandbox._tokens.add(tok); this._syncSandbox(); },
      remove: (tok) => { this.sandbox._tokens.delete(tok); this._syncSandbox(); }
    };
  }

  get src() {
    return this.getAttribute('src') || this._src || '';
  }

  set src(val) {
    this._src = String(val);
    this._attributes.set('src', this._src);
  }

  _syncSandbox() {
    this.setAttribute('sandbox', Array.from(this.sandbox._tokens).join(' '));
  }

  setAttribute(name, val) {
    super.setAttribute(name, val);
    if (name.toLowerCase() === 'sandbox') {
      this.sandbox._tokens = new Set(String(val).split(/\s+/).filter(Boolean));
    }
  }
}

class HTMLButtonElement extends Element {
  constructor() {
    super('BUTTON');
    this.disabled = false;
  }
}

class HTMLImageElement extends Element {
  constructor() {
    super('IMG');
    this.onload = null;
    this.onerror = null;
  }

  get src() {
    return this.getAttribute('src') || '';
  }

  set src(val) {
    this.setAttribute('src', val);
  }
}

class Document extends Node {
  constructor(window) {
    super('#document', 9);
    this.defaultView = window;
    this.baseURI = 'https://example.com/';
    this.documentElement = new Element('HTML');
    this.documentElement.ownerDocument = this;
    this.documentElement.parentNode = this;
    this.childNodes.push(this.documentElement);

    this.head = new Element('HEAD');
    this.head.ownerDocument = this;
    this.documentElement.appendChild(this.head);

    this.body = new Element('BODY');
    this.body.ownerDocument = this;
    this.documentElement.appendChild(this.body);
  }

  createElement(tagName) {
    const tag = tagName.toUpperCase();
    let el;
    if (tag === 'A') el = new HTMLAnchorElement();
    else if (tag === 'IFRAME') el = new HTMLIFrameElement();
    else if (tag === 'BUTTON') el = new HTMLButtonElement();
    else if (tag === 'IMG') el = new HTMLImageElement();
    else el = new Element(tag);

    el.ownerDocument = this;
    return el;
  }

  createElementNS(ns, tagName) {
    const tag = tagName.toUpperCase();
    let el;
    if (ns.includes('svg') && tag === 'A') {
      el = new SVGAElement();
    } else {
      el = new Element(tag);
    }
    el.ownerDocument = this;
    return el;
  }

  getElementById(id) {
    return querySelectorOne(this, `#${id}`);
  }

  querySelector(selector) {
    return querySelectorOne(this, selector);
  }

  querySelectorAll(selector) {
    return querySelectorAllNodes(this, selector);
  }

  execCommand(cmd) {
    if (cmd === 'copy') {
      return true;
    }
    return false;
  }
}

class Window extends EventTarget {
  constructor() {
    super();
    this.document = new Document(this);
    this.window = this;
    this.self = this;
    this.location = new URL('https://example.com/test-page');
    this.navigator = {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      clipboard: {
        writeText: async (text) => {
          this._clipboardText = String(text);
          return Promise.resolve();
        },
        readText: async () => {
          return Promise.resolve(this._clipboardText || '');
        }
      }
    };
    this._clipboardText = '';
    this.Event = Event;
    this.MouseEvent = MouseEvent;
    this.KeyboardEvent = KeyboardEvent;
    this.CustomEvent = CustomEvent;
    this.Element = Element;
    this.HTMLAnchorElement = HTMLAnchorElement;
    this.SVGAElement = SVGAElement;
    this.HTMLIFrameElement = HTMLIFrameElement;
    this.HTMLButtonElement = HTMLButtonElement;
    this.HTMLImageElement = HTMLImageElement;
    this.ShadowRoot = ShadowRoot;

    this.setTimeout = (fn, delay, ...args) => setTimeout(fn, delay, ...args);
    this.clearTimeout = (id) => clearTimeout(id);
    this.setInterval = (fn, delay, ...args) => setInterval(fn, delay, ...args);
    this.clearInterval = (id) => clearInterval(id);
  }
}

// Selector matching helpers
function matchesSelector(el, selector) {
  if (!el || el.nodeType !== 1) return false;
  const sel = selector.trim();

  // Match compound attribute selectors: e.g. tag[attr1="val1"][attr2="val2"] or tag[attr]
  const compoundAttrMatch = sel.match(/^([a-zA-Z0-9_-]+)?((\[[^\]]+\])+)$/);
  if (compoundAttrMatch) {
    const tag = compoundAttrMatch[1];
    if (tag && el.tagName.toLowerCase() !== tag.toLowerCase()) return false;
    const bracketRegex = /\[([a-zA-Z0-9_-]+)(?:=["']?([^"']*)["']?)?\]/g;
    let bMatch;
    let matchCount = 0;
    while ((bMatch = bracketRegex.exec(compoundAttrMatch[2])) !== null) {
      matchCount++;
      const attr = bMatch[1];
      const val = bMatch[2];
      if (val !== undefined) {
        if (el.getAttribute(attr) !== val) return false;
      } else {
        if (!el.hasAttribute(attr)) return false;
      }
    }
    if (matchCount > 0) return true;
  }

  // Match: #id
  if (sel.startsWith('#')) {
    return el.id === sel.slice(1);
  }

  // Match: .class
  if (sel.startsWith('.')) {
    return el.classList.contains(sel.slice(1));
  }

  // Match: tag
  if (/^[a-zA-Z0-9_-]+$/.test(sel)) {
    return el.tagName.toLowerCase() === sel.toLowerCase();
  }

  // Compound match: e.g. 'tag.class'
  const tagClassMatch = sel.match(/^([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]+)$/);
  if (tagClassMatch) {
    const [, tag, cls] = tagClassMatch;
    return el.tagName.toLowerCase() === tag.toLowerCase() && el.classList.contains(cls);
  }

  return false;
}

function querySelectorOne(root, selector) {
  const all = querySelectorAllNodes(root, selector);
  return all[0] || null;
}

function querySelectorAllNodes(root, selector) {
  const results = [];
  function traverse(node) {
    if (!node) return;
    if (node.nodeType === 1 && matchesSelector(node, selector)) {
      results.push(node);
    }
    if (node.childNodes) {
      for (const child of node.childNodes) {
        traverse(child);
      }
    }
  }

  if (root.childNodes) {
    for (const child of root.childNodes) {
      traverse(child);
    }
  }
  return results;
}

// Lightweight HTML snippet parser
function parseHTMLToNode(html, parentNode, ownerDocument) {
  const tagRegex = /<(\/)?([a-zA-Z0-9_-]+)([^>]*)>/g;
  let lastIndex = 0;
  let match;
  let currentParent = parentNode;
  const stack = [currentParent];

  while ((match = tagRegex.exec(html)) !== null) {
    const textBefore = html.slice(lastIndex, match.index).trim();
    if (textBefore) {
      const textNode = new Node('#text', 3);
      textNode.textContent = textBefore;
      textNode.ownerDocument = ownerDocument;
      currentParent.appendChild(textNode);
    }
    lastIndex = tagRegex.lastIndex;

    const isClose = match[1] === '/';
    const tagName = match[2];
    const attrString = match[3];

    if (isClose) {
      if (stack.length > 1) {
        stack.pop();
        currentParent = stack[stack.length - 1];
      }
    } else {
      const el = ownerDocument.createElement(tagName);
      // Parse attributes
      const attrRegex = /([a-zA-Z0-9_-]+)(?:=["']([^"']*)["'])?/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(attrString)) !== null) {
        const attrName = attrMatch[1];
        const attrVal = attrMatch[2] !== undefined ? attrMatch[2] : '';
        el.setAttribute(attrName, attrVal);
      }
      currentParent.appendChild(el);

      // Self-closing tags
      const isSelfClosing = /\/\s*$/.test(attrString) || ['IMG', 'INPUT', 'BR', 'HR', 'META', 'LINK'].includes(el.tagName);
      if (!isSelfClosing) {
        stack.push(el);
        currentParent = el;
      }
    }
  }

  const trailingText = html.slice(lastIndex).trim();
  if (trailingText) {
    const textNode = new Node('#text', 3);
    textNode.textContent = trailingText;
    textNode.ownerDocument = ownerDocument;
    currentParent.appendChild(textNode);
  }
}

function createBrowserEnvironment(htmlContent = '') {
  const win = new Window();
  if (htmlContent) {
    parseHTMLToNode(htmlContent, win.document.body, win.document);
  }
  return win;
}

module.exports = {
  Event,
  MouseEvent,
  KeyboardEvent,
  CustomEvent,
  Node,
  Element,
  ShadowRoot,
  HTMLAnchorElement,
  SVGAElement,
  HTMLIFrameElement,
  HTMLButtonElement,
  HTMLImageElement,
  Document,
  Window,
  createBrowserEnvironment
};
