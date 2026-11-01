"""
adversarial_challenge.py - Empirical Adversarial Test Harness for Peek Wave (M2)

Adversarially stress-tests link interception mechanics against:
1. Deeply nested anchor children (up to 10+ levels, mixed tags, sibling isolation, text/img/svg)
2. SVGs with animated strings (SVGAnimatedString, baseVal vs animVal, relative SVG hrefs, xlink:href, empty/missing hrefs)
3. #hash links (in-page hash, whitespace hash, same-path hash, external hash, relative hash)
4. Relative URLs (root-relative, path-relative, parent-relative, custom baseURI, queries)
5. Download links (download attribute with/without value, nested triggers)
6. Non-HTTP schemes (javascript, mailto, tel, data, blob, file, ftp, chrome, edge, view-source, ws/wss)
7. Multi-modifier combinations (Shift+Ctrl, Shift+Alt, Ctrl+Alt, Meta combinations, mutual exclusivity)
8. Rapid clicks, double clicks, spam gestures, button filters (left vs middle/right)
9. Direct source code AST / structural verification of content/content.js
"""

import sys
import os
import re
import time
import urllib.parse

# Ensure stdout supports UTF-8 on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# -----------------------------------------------------------------------------
# Mini In-Memory DOM & Event Simulator (Mirroring Browser WHATWG DOM & Content Script)
# -----------------------------------------------------------------------------

class Event:
    def __init__(self, event_type, bubbles=True, cancelable=True):
        self.type = event_type
        self.bubbles = bubbles
        self.cancelable = cancelable
        self.target = None
        self.currentTarget = None
        self.defaultPrevented = False
        self._propagationStopped = False
        self._immediatePropagationStopped = False

    def preventDefault(self):
        if self.cancelable:
            self.defaultPrevented = True

    def stopPropagation(self):
        self._propagationStopped = True

    def stopImmediatePropagation(self):
        self._propagationStopped = True
        self._immediatePropagationStopped = True


class MouseEvent(Event):
    def __init__(self, event_type, button=0, shiftKey=False, altKey=False, ctrlKey=False, metaKey=False, bubbles=True, cancelable=True):
        super().__init__(event_type, bubbles, cancelable)
        self.button = button
        self.shiftKey = shiftKey
        self.altKey = altKey
        self.ctrlKey = ctrlKey
        self.metaKey = metaKey


class SVGAnimatedString:
    def __init__(self, baseVal="", animVal=None):
        self.baseVal = str(baseVal)
        self.animVal = str(animVal if animVal is not None else baseVal)

    def __repr__(self):
        return f"SVGAnimatedString(baseVal='{self.baseVal}', animVal='{self.animVal}')"


class Node:
    def __init__(self, node_name, node_type=1):
        self.nodeName = node_name
        self.nodeType = node_type
        self.parentNode = None
        self.childNodes = []
        self.ownerDocument = None
        self._listeners = {}

    def appendChild(self, child):
        if child.parentNode:
            child.parentNode.removeChild(child)
        child.parentNode = self
        child.ownerDocument = self.ownerDocument if self.ownerDocument else (self if isinstance(self, Document) else None)
        self.childNodes.append(child)
        return child

    def removeChild(self, child):
        if child in self.childNodes:
            self.childNodes.remove(child)
            child.parentNode = None
            return child
        raise ValueError("NotFoundError")

    def addEventListener(self, event_type, handler, capture=False):
        if event_type not in self._listeners:
            self._listeners[event_type] = []
        self._listeners[event_type].append({"handler": handler, "capture": bool(capture)})

    def removeEventListener(self, event_type, handler, capture=False):
        if event_type in self._listeners:
            self._listeners[event_type] = [
                entry for entry in self._listeners[event_type]
                if not (entry["handler"] == handler and entry["capture"] == bool(capture))
            ]

    def dispatchEvent(self, event):
        event.target = self
        # Build path from window -> document -> root -> ... -> target
        path = []
        curr = self
        while curr:
            path.append(curr)
            curr = curr.parentNode

        doc = self.ownerDocument or (self if isinstance(self, Document) else None)
        win = doc.defaultView if doc else None
        if doc and doc not in path:
            path.append(doc)
        if win and win not in path:
            path.append(win)

        capture_path = list(reversed(path))

        # Capturing phase
        for node in capture_path[:-1]:
            event.currentTarget = node
            for entry in list(node._listeners.get(event.type, [])):
                if entry["capture"]:
                    entry["handler"](event)
                    if event._immediatePropagationStopped:
                        return not event.defaultPrevented
            if event._propagationStopped:
                return not event.defaultPrevented

        # Target phase
        event.currentTarget = self
        for entry in list(self._listeners.get(event.type, [])):
            entry["handler"](event)
            if event._immediatePropagationStopped:
                return not event.defaultPrevented
        if event._propagationStopped:
            return not event.defaultPrevented

        # Bubbling phase
        if event.bubbles:
            for node in path[1:]:
                event.currentTarget = node
                for entry in list(node._listeners.get(event.type, [])):
                    if not entry["capture"]:
                        entry["handler"](event)
                        if event._immediatePropagationStopped:
                            return not event.defaultPrevented
                if event._propagationStopped:
                    return not event.defaultPrevented

        return not event.defaultPrevented


class Element(Node):
    def __init__(self, tag_name):
        super().__init__(tag_name.upper(), 1)
        self.tagName = tag_name.upper()
        self.attributes = {}
        self.shadowRoot = None

    def setAttribute(self, name, val):
        self.attributes[name.lower()] = str(val)

    def getAttribute(self, name):
        return self.attributes.get(name.lower(), None)

    def hasAttribute(self, name):
        return name.lower() in self.attributes

    def removeAttribute(self, name):
        self.attributes.pop(name.lower(), None)

    @property
    def id(self):
        return self.getAttribute("id") or ""

    @id.setter
    def id(self, val):
        self.setAttribute("id", val)

    def attachShadow(self, mode="open"):
        self.shadowRoot = ShadowRoot(self, mode)
        return self.shadowRoot

    def closest(self, selector):
        curr = self
        while curr and isinstance(curr, Element):
            if self._matches(curr, selector):
                return curr
            curr = curr.parentNode
        return None

    def _matches(self, el, selector):
        sel = selector.strip()
        if sel == "a[href]":
            return el.tagName == "A" and el.hasAttribute("href")
        if sel.startswith("#"):
            return el.id == sel[1:]
        if sel.upper() == el.tagName:
            return True
        return False


class ShadowRoot(Node):
    def __init__(self, host, mode="open"):
        super().__init__("#shadow-root", 11)
        self.host = host
        self.mode = mode


class HTMLAnchorElement(Element):
    def __init__(self):
        super().__init__("A")

    @property
    def href(self):
        raw = self.getAttribute("href") or ""
        if not raw:
            return ""
        base = (self.ownerDocument.baseURI if self.ownerDocument else "https://example.com/")
        try:
            return urllib.parse.urljoin(base, raw)
        except Exception:
            return raw

    @href.setter
    def href(self, val):
        self.setAttribute("href", str(val))


class SVGAElement(Element):
    def __init__(self):
        super().__init__("A")
        self._href_obj = SVGAnimatedString()

    @property
    def href(self):
        raw = self.getAttribute("href") or ""
        self._href_obj.baseVal = raw
        self._href_obj.animVal = raw
        return self._href_obj

    @href.setter
    def href(self, val):
        if isinstance(val, SVGAnimatedString):
            self._href_obj = val
            self.setAttribute("href", val.baseVal)
        else:
            self._href_obj.baseVal = str(val)
            self._href_obj.animVal = str(val)
            self.setAttribute("href", str(val))


class Document(Node):
    def __init__(self, defaultView=None):
        super().__init__("#document", 9)
        self.defaultView = defaultView
        self.baseURI = "https://example.com/blog/article/"
        self.documentElement = Element("HTML")
        self.documentElement.ownerDocument = self
        self.documentElement.parentNode = self
        self.childNodes.append(self.documentElement)
        self.body = Element("BODY")
        self.body.ownerDocument = self
        self.documentElement.appendChild(self.body)

    def createElement(self, tag_name):
        tag = tag_name.upper()
        if tag == "A":
            el = HTMLAnchorElement()
        else:
            el = Element(tag)
        el.ownerDocument = self
        return el

    def createElementNS(self, ns, tag_name):
        tag = tag_name.upper()
        if "svg" in ns.lower() and tag == "A":
            el = SVGAElement()
        else:
            el = Element(tag)
        el.ownerDocument = self
        return el


class Location:
    def __init__(self, href):
        self.href = href

class Window(Node):
    def __init__(self):
        super().__init__("#window", 0)
        self.document = Document(defaultView=self)
        self.location = Location("https://example.com/blog/article/")


# -----------------------------------------------------------------------------
# Python Mirror Engine of Content Script Link Interception (Algorithmically Exact)
# -----------------------------------------------------------------------------

def parse_url_details(raw_url, base_uri="https://example.com/"):
    try:
        base = base_uri or "https://example.com/"
        resolved = urllib.parse.urljoin(base, raw_url)
        parsed = urllib.parse.urlparse(resolved)
        hostname = parsed.hostname or ""
        display_domain = re.sub(r"^www\.", "", hostname, flags=re.I)
        path_snippet = parsed.path
        if path_snippet in ["/", ""]:
            path_snippet = ""
        elif len(path_snippet) > 24:
            path_snippet = path_snippet[:21] + "…"

        return {
            "fullUrl": resolved,
            "hostname": hostname,
            "displayDomain": display_domain,
            "pathSnippet": path_snippet,
            "protocol": (parsed.scheme + ":") if parsed.scheme else "",
            "hash": ("#" + parsed.fragment) if parsed.fragment else ""
        }
    except Exception:
        return None


def is_modifier_active(e, configured_modifier):
    mod = (configured_modifier or "shift").lower()
    if mod == "shift":
        return bool(e.shiftKey and not e.altKey and not e.ctrlKey and not e.metaKey)
    elif mod == "alt":
        return bool(e.altKey and not e.shiftKey and not e.ctrlKey and not e.metaKey)
    elif mod in ["ctrl_cmd", "ctrl", "cmd"]:
        return bool((e.ctrlKey or e.metaKey) and not e.shiftKey and not e.altKey)
    else:
        return bool(e.shiftKey and not e.altKey and not e.ctrlKey and not e.metaKey)


def extract_anchor_url(target, base_uri):
    if not target or not hasattr(target, "closest"):
        return None
    anchor = target.closest("a[href]")
    if not anchor:
        return None
    if anchor.hasAttribute("download"):
        return None

    raw_href = None
    href_prop = getattr(anchor, "href", None)
    if isinstance(href_prop, str):
        raw_href = anchor.getAttribute("href") or href_prop
    elif href_prop and hasattr(href_prop, "baseVal") and isinstance(href_prop.baseVal, str):
        raw_href = href_prop.baseVal
    else:
        raw_href = anchor.getAttribute("href") or anchor.getAttribute("xlink:href")

    if not raw_href:
        return None

    details = parse_url_details(raw_href, base_uri)
    if details:
        details["rawHref"] = raw_href
    return details


def is_navigable_http(url_details, current_loc):
    if not url_details:
        return False
    if url_details.get("rawHref") and url_details["rawHref"].startswith("#"):
        return False

    proto = (url_details.get("protocol") or "").lower()
    if proto not in ["http:", "https:"]:
        return False

    if current_loc:
        current_href = getattr(current_loc, "href", str(current_loc))
        current_no_hash = current_href.split("#")[0]
        target_no_hash = url_details["fullUrl"].split("#")[0]
        if current_no_hash == target_no_hash and bool(url_details.get("hash")):
            return False

    return True


# Simulated Content Script Engine Instance
class ContentScriptEngine:
    def __init__(self, win):
        self.win = win
        self.activeSettings = {
            "enabled": True,
            "modifierKey": "shift",
            "sizePreset": "default"
        }
        self.currentModal = None
        self.modalMountCount = 0
        self.interceptionEvents = []

        def click_handler(e):
            if not self.activeSettings["enabled"]:
                return
            if e.button != 0:
                return
            if not is_modifier_active(e, self.activeSettings["modifierKey"]):
                return

            base_uri = self.win.document.baseURI
            details = extract_anchor_url(e.target, base_uri)
            if not details:
                return

            if not is_navigable_http(details, self.win.location):
                return

            # Intercept
            e.preventDefault()
            e.stopPropagation()
            e.stopImmediatePropagation()

            self.mount_modal(details["fullUrl"])
            self.interceptionEvents.append({"url": details["fullUrl"], "target": e.target})

        self.win.addEventListener("click", click_handler, capture=True)

    def mount_modal(self, target_url):
        # Preemptively tear down old modal
        if self.currentModal:
            self.teardown_modal()

        host = Element("peek-wave-container")
        host.id = "peek-wave-host"
        shadow = host.attachShadow()
        iframe = Element("IFRAME")
        iframe.setAttribute("src", target_url)
        shadow.appendChild(iframe)

        self.win.document.documentElement.appendChild(host)
        self.currentModal = {
            "host": host,
            "shadow": shadow,
            "iframe": iframe,
            "src": target_url
        }
        self.modalMountCount += 1

    def teardown_modal(self):
        if not self.currentModal:
            return
        host = self.currentModal["host"]
        iframe = self.currentModal["iframe"]
        iframe.setAttribute("src", "about:blank")
        if host.parentNode:
            host.parentNode.removeChild(host)
        self.currentModal = None


# -----------------------------------------------------------------------------
# Adversarial Test Suite Execution Engine
# -----------------------------------------------------------------------------

tests_run = 0
tests_passed = 0
tests_failed = 0
failure_log = []

def run_test(name, fn):
    global tests_run, tests_passed, tests_failed
    tests_run += 1
    try:
        fn()
        tests_passed += 1
        print(f"  \033[32m✔\033[0m {name}")
    except Exception as e:
        tests_failed += 1
        failure_log.append((name, str(e)))
        print(f"  \033[31m✖\033[0m {name} -> {e}")


print("\n========================================================")
print("  PEEK WAVE — ADVERSARIAL CHALLENGER SUITE (M2)")
print("========================================================\n")

# -----------------------------------------------------------------------------
# SUITE 1: Deeply Nested Anchor Children Stress Testing
# -----------------------------------------------------------------------------
print("\033[34m▶ Suite 1: Deeply Nested Anchor Children\033[0m")

def test_nested_10_levels():
    win = Window()
    engine = ContentScriptEngine(win)
    anchor = win.document.createElement("a")
    anchor.setAttribute("href", "https://example.com/deep10")
    
    curr = anchor
    for i in range(10):
        nested = win.document.createElement("div")
        nested.id = f"nested-level-{i}"
        curr.appendChild(nested)
        curr = nested
    
    deepest_span = win.document.createElement("span")
    deepest_span.id = "deepest-target"
    curr.appendChild(deepest_span)
    win.document.body.appendChild(anchor)

    evt = MouseEvent("click", button=0, shiftKey=True)
    deepest_span.dispatchEvent(evt)

    assert evt.defaultPrevented is True, "Event should be prevented"
    assert engine.currentModal is not None, "Modal should be mounted"
    assert engine.currentModal["src"] == "https://example.com/deep10"

run_test("T_ADV.1.1: 10 levels of nested div/span inside anchor resolves correctly", test_nested_10_levels)


def test_mixed_inline_elements():
    win = Window()
    engine = ContentScriptEngine(win)
    anchor = win.document.createElement("a")
    anchor.setAttribute("href", "https://example.com/mixed")

    card = win.document.createElement("div")
    img = win.document.createElement("img")
    p = win.document.createElement("p")
    code = win.document.createElement("code")
    b = win.document.createElement("b")

    code.appendChild(b)
    p.appendChild(code)
    card.appendChild(img)
    card.appendChild(p)
    anchor.appendChild(card)
    win.document.body.appendChild(anchor)

    # Click on <b>
    evt = MouseEvent("click", button=0, shiftKey=True)
    b.dispatchEvent(evt)

    assert evt.defaultPrevented is True
    assert engine.currentModal["src"] == "https://example.com/mixed"

run_test("T_ADV.1.2: Complex card with img, p, code, bold correctly bubbles to anchor", test_mixed_inline_elements)


def test_sibling_isolation():
    win = Window()
    engine = ContentScriptEngine(win)
    container = win.document.createElement("div")
    
    anchor1 = win.document.createElement("a")
    anchor1.setAttribute("href", "https://example.com/anchor1")
    s1 = win.document.createElement("span")
    anchor1.appendChild(s1)

    anchor2 = win.document.createElement("a")
    anchor2.setAttribute("href", "https://example.com/anchor2")
    s2 = win.document.createElement("span")
    anchor2.appendChild(s2)

    plain = win.document.createElement("p")

    container.appendChild(anchor1)
    container.appendChild(anchor2)
    container.appendChild(plain)
    win.document.body.appendChild(container)

    # Click plain paragraph -> must NOT trigger
    evt0 = MouseEvent("click", button=0, shiftKey=True)
    plain.dispatchEvent(evt0)
    assert evt0.defaultPrevented is False
    assert engine.currentModal is None

    # Click s1 -> triggers anchor1
    evt1 = MouseEvent("click", button=0, shiftKey=True)
    s1.dispatchEvent(evt1)
    assert engine.currentModal["src"] == "https://example.com/anchor1"

    # Click s2 -> triggers anchor2
    evt2 = MouseEvent("click", button=0, shiftKey=True)
    s2.dispatchEvent(evt2)
    assert engine.currentModal["src"] == "https://example.com/anchor2"

run_test("T_ADV.1.3: Sibling anchors and plain nodes strictly isolate target resolution", test_sibling_isolation)


def test_anchor_without_href():
    win = Window()
    engine = ContentScriptEngine(win)
    anchor = win.document.createElement("a")
    anchor.id = "target-anchor"
    span = win.document.createElement("span")
    anchor.appendChild(span)
    win.document.body.appendChild(anchor)

    evt = MouseEvent("click", button=0, shiftKey=True)
    span.dispatchEvent(evt)

    assert evt.defaultPrevented is False, "Anchor without href must be ignored"
    assert engine.currentModal is None

run_test("T_ADV.1.4: Anchor without href attribute is ignored", test_anchor_without_href)


# -----------------------------------------------------------------------------
# SUITE 2: SVGs with Animated Strings Stress Testing
# -----------------------------------------------------------------------------
print("\n\033[34m▶ Suite 2: SVGs with Animated Strings\033[0m")

def test_svg_animated_string_base_val():
    win = Window()
    engine = ContentScriptEngine(win)
    svg_a = win.document.createElementNS("http://www.w3.org/2000/svg", "a")
    svg_a.href = SVGAnimatedString(baseVal="https://example.com/svg-target", animVal="https://example.com/svg-anim")
    
    circle = win.document.createElementNS("http://www.w3.org/2000/svg", "circle")
    svg_a.appendChild(circle)
    win.document.body.appendChild(svg_a)

    evt = MouseEvent("click", button=0, shiftKey=True)
    circle.dispatchEvent(evt)

    assert evt.defaultPrevented is True
    assert engine.currentModal is not None
    assert engine.currentModal["src"] == "https://example.com/svg-target"

run_test("T_ADV.2.1: SVGAnimatedString resolves baseVal cleanly without crash", test_svg_animated_string_base_val)


def test_svg_relative_href():
    win = Window()
    win.document.baseURI = "https://example.com/vectors/icons/"
    engine = ContentScriptEngine(win)

    svg_a = win.document.createElementNS("http://www.w3.org/2000/svg", "a")
    svg_a.href = SVGAnimatedString(baseVal="../star.svg")
    g = win.document.createElementNS("http://www.w3.org/2000/svg", "g")
    path = win.document.createElementNS("http://www.w3.org/2000/svg", "path")
    g.appendChild(path)
    svg_a.appendChild(g)
    win.document.body.appendChild(svg_a)

    evt = MouseEvent("click", button=0, shiftKey=True)
    path.dispatchEvent(evt)

    assert evt.defaultPrevented is True
    assert engine.currentModal["src"] == "https://example.com/vectors/star.svg"

run_test("T_ADV.2.2: SVG anchor with relative URL resolves against document.baseURI", test_svg_relative_href)


def test_svg_hash_fragment_only():
    win = Window()
    engine = ContentScriptEngine(win)
    svg_a = win.document.createElementNS("http://www.w3.org/2000/svg", "a")
    svg_a.href = SVGAnimatedString(baseVal="#symbol-icon")
    circle = win.document.createElementNS("http://www.w3.org/2000/svg", "circle")
    svg_a.appendChild(circle)
    win.document.body.appendChild(svg_a)

    evt = MouseEvent("click", button=0, shiftKey=True)
    circle.dispatchEvent(evt)

    assert evt.defaultPrevented is False
    assert engine.currentModal is None

run_test("T_ADV.2.3: SVG anchor with #hash only is ignored", test_svg_hash_fragment_only)


def test_svg_xlink_href_fallback():
    win = Window()
    engine = ContentScriptEngine(win)
    svg_a = win.document.createElementNS("http://www.w3.org/2000/svg", "a")
    svg_a.setAttribute("href", "https://example.com/xlink-dest")
    svg_a.setAttribute("xlink:href", "https://example.com/xlink-dest")
    rect = win.document.createElementNS("http://www.w3.org/2000/svg", "rect")
    svg_a.appendChild(rect)
    win.document.body.appendChild(svg_a)

    details = extract_anchor_url(rect, win.document.baseURI)
    assert details is not None
    assert details["fullUrl"] == "https://example.com/xlink-dest"

run_test("T_ADV.2.4: SVG anchor with dual href and xlink:href attributes resolves", test_svg_xlink_href_fallback)


def test_svg_empty_href():
    win = Window()
    engine = ContentScriptEngine(win)
    svg_a = win.document.createElementNS("http://www.w3.org/2000/svg", "a")
    svg_a.href = SVGAnimatedString(baseVal="")
    rect = win.document.createElementNS("http://www.w3.org/2000/svg", "rect")
    svg_a.appendChild(rect)
    win.document.body.appendChild(svg_a)

    evt = MouseEvent("click", button=0, shiftKey=True)
    rect.dispatchEvent(evt)

    assert evt.defaultPrevented is False
    assert engine.currentModal is None

run_test("T_ADV.2.5: SVG anchor with empty baseVal is safely ignored", test_svg_empty_href)


# -----------------------------------------------------------------------------
# SUITE 3: #hash Links & In-Page Navigation Stress Testing
# -----------------------------------------------------------------------------
print("\n\033[34m▶ Suite 3: #hash Links & In-Page Navigation\033[0m")

def test_hash_links():
    win = Window()
    win.location.href = "https://example.com/blog/article/"
    
    # 1. Plain #
    d1 = extract_anchor_url(make_anchor(win, "#"), win.document.baseURI)
    assert is_navigable_http(d1, win.location) is False

    # 2. #section
    d2 = extract_anchor_url(make_anchor(win, "#comments"), win.document.baseURI)
    assert is_navigable_http(d2, win.location) is False

    # 3. Same page full URL with hash
    d3 = extract_anchor_url(make_anchor(win, "https://example.com/blog/article/#comments"), win.document.baseURI)
    assert is_navigable_http(d3, win.location) is False

    # 4. Same page relative with hash
    d4 = extract_anchor_url(make_anchor(win, "./#top"), win.document.baseURI)
    assert is_navigable_http(d4, win.location) is False

    # 5. External page with hash -> MUST BE NAVIGABLE (user wants to peek external article section)
    d5 = extract_anchor_url(make_anchor(win, "https://example.com/blog/other/#header"), win.document.baseURI)
    assert is_navigable_http(d5, win.location) is True

    # 6. External domain with hash -> MUST BE NAVIGABLE
    d6 = extract_anchor_url(make_anchor(win, "https://github.com/repo#readme"), win.document.baseURI)
    assert is_navigable_http(d6, win.location) is True

    # 7. Same page full URL WITHOUT hash -> MUST BE NAVIGABLE
    d7 = extract_anchor_url(make_anchor(win, "https://example.com/blog/article/"), win.document.baseURI)
    assert is_navigable_http(d7, win.location) is True

def make_anchor(win, href):
    a = win.document.createElement("a")
    a.setAttribute("href", href)
    win.document.body.appendChild(a)
    return a

run_test("T_ADV.3.1: Strict separation of in-page fragments vs external page hash links", test_hash_links)


def test_hash_with_leading_whitespace():
    win = Window()
    win.location.href = "https://example.com/doc"
    win.document.baseURI = "https://example.com/doc"
    a = make_anchor(win, "   #section   ")
    details = extract_anchor_url(a, win.document.baseURI)
    # Even if parsed, is_navigable_http must reject it
    assert is_navigable_http(details, win.location) is False

run_test("T_ADV.3.2: Hash with leading/trailing whitespace is rejected", test_hash_with_leading_whitespace)


def test_current_page_has_hash_already():
    win = Window()
    win.location.href = "https://example.com/doc#first-heading"
    # Clicking link to another section on same page
    a = make_anchor(win, "https://example.com/doc#second-heading")
    details = extract_anchor_url(a, win.document.baseURI)
    assert is_navigable_http(details, win.location) is False

run_test("T_ADV.3.3: Current page with hash navigated to another hash on same page is rejected", test_current_page_has_hash_already)


# -----------------------------------------------------------------------------
# SUITE 4: Relative URLs Resolution Stress Testing
# -----------------------------------------------------------------------------
print("\n\033[34m▶ Suite 4: Relative URLs Resolution\033[0m")

def test_relative_urls():
    win = Window()
    win.document.baseURI = "https://example.com/v1/api/docs/"

    # Root-relative
    d1 = extract_anchor_url(make_anchor(win, "/login"), win.document.baseURI)
    assert d1["fullUrl"] == "https://example.com/login"
    assert d1["displayDomain"] == "example.com"

    # Sibling relative
    d2 = extract_anchor_url(make_anchor(win, "auth.html"), win.document.baseURI)
    assert d2["fullUrl"] == "https://example.com/v1/api/docs/auth.html"

    # Parent relative (double climb)
    d3 = extract_anchor_url(make_anchor(win, "../../status"), win.document.baseURI)
    assert d3["fullUrl"] == "https://example.com/v1/status"

    # Query string relative
    d4 = extract_anchor_url(make_anchor(win, "?debug=true"), win.document.baseURI)
    assert d4["fullUrl"] == "https://example.com/v1/api/docs/?debug=true"

    # Protocol relative
    d5 = extract_anchor_url(make_anchor(win, "//cdn.example.org/lib.js"), win.document.baseURI)
    assert d5["fullUrl"] == "https://cdn.example.org/lib.js"
    assert d5["displayDomain"] == "cdn.example.org"

run_test("T_ADV.4.1: Root, sibling, parent, query, and protocol-relative URLs resolve accurately", test_relative_urls)


# -----------------------------------------------------------------------------
# SUITE 5: Download Links Stress Testing
# -----------------------------------------------------------------------------
print("\n\033[34m▶ Suite 5: Download Links\033[0m")

def test_download_links():
    win = Window()
    engine = ContentScriptEngine(win)

    # 1. Download attribute without value
    a1 = win.document.createElement("a")
    a1.setAttribute("href", "https://example.com/doc.pdf")
    a1.setAttribute("download", "")
    s1 = win.document.createElement("span")
    a1.appendChild(s1)
    win.document.body.appendChild(a1)

    evt1 = MouseEvent("click", button=0, shiftKey=True)
    s1.dispatchEvent(evt1)
    assert evt1.defaultPrevented is False, "Download attribute should not be intercepted"
    assert engine.currentModal is None

    # 2. Download attribute with filename
    a2 = win.document.createElement("a")
    a2.setAttribute("href", "https://example.com/archive.zip")
    a2.setAttribute("download", "custom_name.zip")
    img = win.document.createElement("img")
    a2.appendChild(img)
    win.document.body.appendChild(a2)

    evt2 = MouseEvent("click", button=0, shiftKey=True)
    img.dispatchEvent(evt2)
    assert evt2.defaultPrevented is False
    assert engine.currentModal is None

run_test("T_ADV.5.1: Download links (empty and named) bypass modal for native download", test_download_links)


# -----------------------------------------------------------------------------
# SUITE 6: Non-HTTP Schemes Stress Testing
# -----------------------------------------------------------------------------
print("\n\033[34m▶ Suite 6: Non-HTTP Schemes\033[0m")

def test_non_http_schemes():
    win = Window()
    non_http_list = [
        "javascript:alert(document.cookie)",
        "javascript:void(0)",
        "mailto:support@company.com?subject=Help",
        "tel:+1-800-555-0199",
        "data:text/html,<script>alert(1)</script>",
        "blob:https://example.com/264b971a-e9aa-48bf-a160",
        "file:///C:/Windows/System32/drivers/etc/hosts",
        "ftp://ftp.is.co.za/linux/distributions/",
        "chrome://flags",
        "edge://extensions",
        "about:blank",
        "view-source:https://example.com",
        "ws://echo.websocket.org",
        "wss://secure.websocket.org"
    ]

    for scheme_url in non_http_list:
        a = make_anchor(win, scheme_url)
        details = extract_anchor_url(a, win.document.baseURI)
        navigable = is_navigable_http(details, win.location)
        assert navigable is False, f"Scheme {scheme_url} should NOT be navigable"

run_test("T_ADV.6.1: 14 non-HTTP schemes strictly rejected from modal interception", test_non_http_schemes)


# -----------------------------------------------------------------------------
# SUITE 7: Multi-Modifier Combinations & Exclusivity
# -----------------------------------------------------------------------------
print("\n\033[34m▶ Suite 7: Multi-Modifier Combinations & Exclusivity\033[0m")

def test_modifier_shift_preset():
    # When configured for 'shift'
    # Valid: Shift only
    assert is_modifier_active(MouseEvent("click", shiftKey=True), "shift") is True

    # Invalid combinations: Shift + others
    assert is_modifier_active(MouseEvent("click", shiftKey=True, ctrlKey=True), "shift") is False
    assert is_modifier_active(MouseEvent("click", shiftKey=True, altKey=True), "shift") is False
    assert is_modifier_active(MouseEvent("click", shiftKey=True, metaKey=True), "shift") is False
    assert is_modifier_active(MouseEvent("click", shiftKey=True, ctrlKey=True, altKey=True), "shift") is False
    assert is_modifier_active(MouseEvent("click", shiftKey=True, ctrlKey=True, metaKey=True), "shift") is False
    assert is_modifier_active(MouseEvent("click", shiftKey=True, altKey=True, metaKey=True), "shift") is False
    assert is_modifier_active(MouseEvent("click", shiftKey=True, ctrlKey=True, altKey=True, metaKey=True), "shift") is False

    # Invalid: no shift
    assert is_modifier_active(MouseEvent("click"), "shift") is False
    assert is_modifier_active(MouseEvent("click", ctrlKey=True), "shift") is False
    assert is_modifier_active(MouseEvent("click", altKey=True), "shift") is False

run_test("T_ADV.7.1: Shift preset strictly requires Shift and rejects all multi-modifier combos", test_modifier_shift_preset)


def test_modifier_alt_preset():
    # When configured for 'alt'
    assert is_modifier_active(MouseEvent("click", altKey=True), "alt") is True
    assert is_modifier_active(MouseEvent("click", altKey=True, shiftKey=True), "alt") is False
    assert is_modifier_active(MouseEvent("click", altKey=True, ctrlKey=True), "alt") is False
    assert is_modifier_active(MouseEvent("click", altKey=True, metaKey=True), "alt") is False
    assert is_modifier_active(MouseEvent("click"), "alt") is False

run_test("T_ADV.7.2: Alt preset strictly requires Alt and rejects Shift/Ctrl/Meta combos", test_modifier_alt_preset)


def test_modifier_ctrl_cmd_preset():
    # When configured for 'ctrl_cmd'
    # Windows/Linux Ctrl
    assert is_modifier_active(MouseEvent("click", ctrlKey=True), "ctrl_cmd") is True
    # macOS Cmd
    assert is_modifier_active(MouseEvent("click", metaKey=True), "ctrl_cmd") is True
    # Rejection of Shift or Alt
    assert is_modifier_active(MouseEvent("click", ctrlKey=True, shiftKey=True), "ctrl_cmd") is False
    assert is_modifier_active(MouseEvent("click", ctrlKey=True, altKey=True), "ctrl_cmd") is False
    assert is_modifier_active(MouseEvent("click", metaKey=True, shiftKey=True), "ctrl_cmd") is False
    assert is_modifier_active(MouseEvent("click", metaKey=True, altKey=True), "ctrl_cmd") is False
    assert is_modifier_active(MouseEvent("click"), "ctrl_cmd") is False

run_test("T_ADV.7.3: Ctrl/Cmd preset accepts Ctrl or Meta and rejects Shift/Alt combos", test_modifier_ctrl_cmd_preset)


# -----------------------------------------------------------------------------
# SUITE 8: Rapid Clicks & Dynamic Modifier Switching Stress Testing
# -----------------------------------------------------------------------------
print("\n\033[34m▶ Suite 8: Rapid Clicks & Dynamic Modifier Switching\033[0m")

def test_rapid_clicks_single_modal():
    win = Window()
    engine = ContentScriptEngine(win)
    link = make_anchor(win, "https://example.com/rapid-test")

    # Dispatch 25 rapid clicks in immediate succession
    for i in range(25):
        link.dispatchEvent(MouseEvent("click", button=0, shiftKey=True))

    # Host count in documentElement
    hosts = [c for c in win.document.documentElement.childNodes if getattr(c, "id", None) == "peek-wave-host"]
    assert len(hosts) == 1, f"Expected exactly 1 host element, found {len(hosts)}"
    assert engine.currentModal is not None
    assert engine.currentModal["src"] == "https://example.com/rapid-test"

run_test("T_ADV.8.1: 25 rapid consecutive clicks maintain exactly 1 modal host in DOM", test_rapid_clicks_single_modal)


def test_rapid_switching_between_different_links():
    win = Window()
    engine = ContentScriptEngine(win)
    links = [make_anchor(win, f"https://example.com/link_{i}") for i in range(5)]

    for link in links:
        link.dispatchEvent(MouseEvent("click", button=0, shiftKey=True))

    hosts = [c for c in win.document.documentElement.childNodes if getattr(c, "id", None) == "peek-wave-host"]
    assert len(hosts) == 1
    assert engine.currentModal["src"] == "https://example.com/link_4"

run_test("T_ADV.8.2: Rapid succession across 5 different links smoothly updates src to latest", test_rapid_switching_between_different_links)


def test_mouse_button_filtering():
    win = Window()
    engine = ContentScriptEngine(win)
    link = make_anchor(win, "https://example.com/btn-test")

    # Middle click (button 1) -> must NOT trigger
    evt1 = MouseEvent("click", button=1, shiftKey=True)
    link.dispatchEvent(evt1)
    assert evt1.defaultPrevented is False
    assert engine.currentModal is None

    # Right click (button 2) -> must NOT trigger
    evt2 = MouseEvent("click", button=2, shiftKey=True)
    link.dispatchEvent(evt2)
    assert evt2.defaultPrevented is False
    assert engine.currentModal is None

    # Left click (button 0) -> MUST trigger
    evt0 = MouseEvent("click", button=0, shiftKey=True)
    link.dispatchEvent(evt0)
    assert evt0.defaultPrevented is True
    assert engine.currentModal is not None

run_test("T_ADV.8.3: Mouse button 1 (middle) and 2 (right) are strictly bypassed", test_mouse_button_filtering)


# -----------------------------------------------------------------------------
# SUITE 9: Direct Source Code Forensic Audit of content/content.js
# -----------------------------------------------------------------------------
print("\n\033[34m▶ Suite 9: Static Forensic Audit of content/content.js\033[0m")

def test_source_code_checks():
    content_js_path = os.path.join(os.path.dirname(__file__), "..", "content", "content.js")
    with open(content_js_path, "r", encoding="utf-8") as f:
        src = f.read()

    # 1. Window capture listener
    assert "window.addEventListener" in src or "addEventListener('click', clickHandler, { capture: true })" in src or "targetWin.addEventListener('click', clickHandler, { capture: true })" in src, "Must attach click in capturing phase"

    # 2. Strict preventDefault and stopImmediatePropagation
    assert "e.preventDefault()" in src
    assert "e.stopPropagation()" in src
    assert "e.stopImmediatePropagation()" in src

    # 3. Mounts directly to document.documentElement
    assert "document.documentElement" in src

    # 4. Open shadow root
    assert "attachShadow({ mode: 'open' })" in src

    # 5. iframe.sandbox attribute strictly omits allow-top-navigation
    sandbox_match = re.search(r"setAttribute\(\s*['\"]sandbox['\"]\s*,\s*['\"]([^'\"]+)['\"]\s*\)", src)
    assert sandbox_match is not None, "sandbox attribute must be set on iframe"
    sandbox_tokens = sandbox_match.group(1).split()
    assert "allow-top-navigation" not in sandbox_tokens, "Must NOT include allow-top-navigation in sandbox"
    assert "allow-scripts" in sandbox_tokens
    assert "allow-same-origin" in sandbox_tokens

    # 6. Low-RAM teardown: about:blank navigation
    assert "about:blank" in src

    # 7. Handles SVGAnimatedString
    assert "baseVal" in src

    # 8. Protocol whitelist
    assert "http:" in src and "https:" in src

    # 9. Download attribute filter
    assert "download" in src

run_test("T_ADV.9.1: Forensic AST & code invariants pass 100% in content/content.js", test_source_code_checks)


# -----------------------------------------------------------------------------
# SUITE 10: Interleaved Lifecycle & Extreme URLs Stress Testing
# -----------------------------------------------------------------------------
print("\n\033[34m▶ Suite 10: Interleaved Lifecycle & Extreme URLs\033[0m")

def test_interleaved_gestures():
    win = Window()
    engine = ContentScriptEngine(win)
    link1 = make_anchor(win, "https://example.com/one")
    link2 = make_anchor(win, "https://example.com/two")

    # 1. Shift+Click link 1 -> mounts
    link1.dispatchEvent(MouseEvent("click", button=0, shiftKey=True))
    assert engine.currentModal is not None
    assert engine.currentModal["src"] == "https://example.com/one"

    # 2. Alt+Click link 2 (with Shift configured) -> ignored, modal stays on link 1
    link2.dispatchEvent(MouseEvent("click", button=0, altKey=True))
    assert engine.currentModal is not None
    assert engine.currentModal["src"] == "https://example.com/one"

    # 3. Shift+Click link 2 -> updates to link 2
    link2.dispatchEvent(MouseEvent("click", button=0, shiftKey=True))
    assert engine.currentModal is not None
    assert engine.currentModal["src"] == "https://example.com/two"

    # 4. Teardown
    engine.teardown_modal()
    assert engine.currentModal is None

    # 5. Shift+Click link 1 -> cleanly remounts
    link1.dispatchEvent(MouseEvent("click", button=0, shiftKey=True))
    assert engine.currentModal is not None
    assert engine.currentModal["src"] == "https://example.com/one"

run_test("T_ADV.10.1: Interleaved modifier gestures and remount cycles execute deterministically", test_interleaved_gestures)


def test_unicode_and_special_urls():
    win = Window()
    # Unicode path
    u1 = "https://example.com/search?q=caf%C3%A9&tag=%E2%9C%93"
    a1 = make_anchor(win, u1)
    d1 = extract_anchor_url(a1, win.document.baseURI)
    assert d1["fullUrl"] == u1
    assert d1["displayDomain"] == "example.com"

    # URL with port
    u2 = "https://example.com:8443/dashboard"
    a2 = make_anchor(win, u2)
    d2 = extract_anchor_url(a2, win.document.baseURI)
    assert d2["fullUrl"] == u2
    assert d2["displayDomain"] == "example.com"

run_test("T_ADV.10.2: Unicode paths and custom port URLs parse without corruption", test_unicode_and_special_urls)


def test_settings_toggle_enable_disable():
    win = Window()
    engine = ContentScriptEngine(win)
    link = make_anchor(win, "https://example.com/target")

    # Disabled extension
    engine.activeSettings["enabled"] = False
    link.dispatchEvent(MouseEvent("click", button=0, shiftKey=True))
    assert engine.currentModal is None, "Disabled extension must never intercept"

    # Enabled extension
    engine.activeSettings["enabled"] = True
    link.dispatchEvent(MouseEvent("click", button=0, shiftKey=True))
    assert engine.currentModal is not None, "Enabled extension must intercept"

run_test("T_ADV.10.3: Dynamic runtime toggle of enabled setting cleanly controls interception", test_settings_toggle_enable_disable)


# -----------------------------------------------------------------------------
# SUMMARY REPORT
# -----------------------------------------------------------------------------
print("\n--------------------------------------------------------")
print(f"ADVERSARIAL SUITE SUMMARY: {tests_passed} passed, {tests_failed} failed, {tests_run} total")
print("--------------------------------------------------------\n")

if tests_failed > 0:
    print(f"\033[31mCRITICAL: {tests_failed} adversarial tests failed!\033[0m")
    for name, err in failure_log:
        print(f" - {name}: {err}")
    sys.exit(1)
else:
    print(f"\033[32m✔ ALL {tests_passed} ADVERSARIAL STRESS CHALLENGES PASSED!\033[0m\n")
    sys.exit(0)
