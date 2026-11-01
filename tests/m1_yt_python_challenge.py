"""
m1_yt_python_challenge.py

Independent Python Adversarial Challenger Suite for Milestone M1_YT:
1. YouTube URL loading: Verify zero embed replacements across all URL forms.
2. Sandboxing: Ensure allow-top-navigation is strictly excluded.
3. Dimensions: Validate compact (640x480), default (860x600), large (1100x760) across files.
4. Renderer stability: Verify DNR header removals, GPU layer pinning, and layout containment.
"""

import sys
import os
import re
import json

if sys.platform == 'win32' and hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
CONTENT_JS_PATH = os.path.join(PROJECT_ROOT, 'content', 'content.js')
MODAL_CSS_PATH = os.path.join(PROJECT_ROOT, 'content', 'modal.css')
RULES_PATH = os.path.join(PROJECT_ROOT, 'rules.json')
POPUP_HTML_PATH = os.path.join(PROJECT_ROOT, 'popup', 'popup.html')
POPUP_JS_PATH = os.path.join(PROJECT_ROOT, 'popup', 'popup.js')

total_tests = 0
passed_tests = 0
failed_tests = 0

def run_test(name, fn):
    global total_tests, passed_tests, failed_tests
    total_tests += 1
    try:
        fn()
        passed_tests += 1
        print(f"  [PASS] {name}")
    except Exception as e:
        failed_tests += 1
        print(f"  [FAIL] {name}: {e}")

print("========================================================")
print("  PEEK WAVE - M1_YT PYTHON ADVERSARIAL CHALLENGER SUITE ")
print("========================================================")

# Suite 1: Anti-Embed & URL Integrity
print("\n> Suite 1: Full YouTube URL Preservation (No Embed Conversion)")

with open(CONTENT_JS_PATH, 'r', encoding='utf-8') as f:
    content_js = f.read()

with open(MODAL_CSS_PATH, 'r', encoding='utf-8') as f:
    modal_css = f.read()

with open(RULES_PATH, 'r', encoding='utf-8') as f:
    rules_data = json.load(f)

with open(POPUP_HTML_PATH, 'r', encoding='utf-8') as f:
    popup_html = f.read()

def test_no_embed_rewriting():
    # Verify no string replacement targeting youtube.com/embed
    assert not re.search(r'replace\([^)]*embed', content_js, re.I), "Found embed string replacement in content.js"
    assert not re.search(r'\/embed\/', content_js), "Found literal /embed/ in content.js"
    assert not re.search(r'youtube\.com\/embed', content_js), "Found youtube.com/embed in content.js"

run_test("1.1: content/content.js contains zero embed replacement patterns", test_no_embed_rewriting)

def test_iframe_src_assignment():
    # Verify iframe.src is assigned urlDetails.fullUrl directly
    match = re.search(r'iframe\.src\s*=\s*urlDetails\.fullUrl;', content_js)
    assert match, "iframe.src is not assigned urlDetails.fullUrl directly"

run_test("1.2: iframe.src is bound directly to urlDetails.fullUrl", test_iframe_src_assignment)

# Suite 2: Strict Top Navigation Omission
print("\n> Suite 2: Sandbox Security & Top Navigation Omission")

def test_sandbox_omits_top_nav():
    sandbox_matches = re.findall(r"setAttribute\(\s*['\"]sandbox['\"]\s*,\s*['\"]([^'\"]+)['\"]\s*\)", content_js)
    assert len(sandbox_matches) > 0, "No sandbox attribute set in content.js"
    for sbox in sandbox_matches:
        tokens = sbox.split()
        assert 'allow-top-navigation' not in tokens, "allow-top-navigation found in sandbox tokens"
        assert 'allow-top-navigation-by-user-activation' not in tokens, "allow-top-navigation-by-user-activation found"
        assert 'allow-top-navigation-to-custom-protocols' not in tokens, "allow-top-navigation-to-custom-protocols found"
        assert 'allow-scripts' in tokens, "allow-scripts missing"
        assert 'allow-same-origin' in tokens, "allow-same-origin missing"
        assert 'allow-forms' in tokens, "allow-forms missing"
        assert 'allow-popups' in tokens, "allow-popups missing"
        assert 'allow-popups-to-escape-sandbox' in tokens, "allow-popups-to-escape-sandbox missing"
        assert 'allow-presentation' in tokens, "allow-presentation missing"
        assert 'allow-modals' in tokens, "allow-modals missing"

run_test("2.1: sandbox permissions strictly omit all top-navigation tokens and include player requirements", test_sandbox_omits_top_nav)

def test_feature_policy_allow():
    allow_matches = re.findall(r"setAttribute\(\s*['\"]allow['\"]\s*,\s*['\"]([^'\"]+)['\"]\s*\)", content_js)
    assert len(allow_matches) > 0, "No allow attribute set on iframe in content.js"
    allow_str = allow_matches[0]
    for perm in ['fullscreen', 'picture-in-picture', 'accelerometer', 'autoplay', 'encrypted-media', 'gyroscope', 'web-share']:
        assert perm in allow_str, f"Missing feature policy: {perm}"

run_test("2.2: iframe allow feature-policy includes all required media/fullscreen capabilities", test_feature_policy_allow)

# Suite 3: Size Presets & Layout Dimensions
print("\n> Suite 3: Dimension Presets Verification")

def test_size_presets_content_js():
    compact = re.search(r'\.peek-size-compact\s*\{[^}]*width:\s*min\(640px,\s*85vw\)[^}]*height:\s*min\(480px,\s*75vh\)', content_js, re.DOTALL)
    assert compact, "Compact 640x480 rule missing in content.js"
    
    default_p = re.search(r'\.peek-size-default\s*\{[^}]*width:\s*min\(860px,\s*85vw\)[^}]*height:\s*min\(600px,\s*85vh\)', content_js, re.DOTALL)
    assert default_p, "Default 860x600 rule missing in content.js"
    
    large = re.search(r'\.peek-size-large\s*\{[^}]*width:\s*min\(1100px,\s*92vw\)[^}]*height:\s*min\(760px,\s*90vh\)', content_js, re.DOTALL)
    assert large, "Large 1100x760 rule missing in content.js"

run_test("3.1: content/content.js contains correct CSS rules for compact (640x480), default (860x600), large (1100x760)", test_size_presets_content_js)

def test_size_presets_modal_css():
    compact = re.search(r'\.peek-size-compact\s*\{[^}]*width:\s*min\(640px,\s*85vw\)[^}]*height:\s*min\(480px,\s*75vh\)', modal_css, re.DOTALL)
    assert compact, "Compact 640x480 rule missing in modal.css"
    
    default_p = re.search(r'\.peek-size-default\s*\{[^}]*width:\s*min\(860px,\s*85vw\)[^}]*height:\s*min\(600px,\s*85vh\)', modal_css, re.DOTALL)
    assert default_p, "Default 860x600 rule missing in modal.css"
    
    large = re.search(r'\.peek-size-large\s*\{[^}]*width:\s*min\(1100px,\s*92vw\)[^}]*height:\s*min\(760px,\s*90vh\)', modal_css, re.DOTALL)
    assert large, "Large 1100x760 rule missing in modal.css"

run_test("3.2: content/modal.css matches dimension presets identically to content.js", test_size_presets_modal_css)

def test_popup_html_presets():
    assert "640×480" in popup_html, "640×480 missing in popup.html"
    assert "860×600" in popup_html, "860×600 missing in popup.html"
    assert "1100×760" in popup_html, "1100×760 missing in popup.html"

run_test("3.3: popup/popup.html labels reflect compact, default, and large presets", test_popup_html_presets)

# Suite 4: Renderer Stability & Crash Mitigation Invariants
print("\n> Suite 4: Renderer Stability & Crash Prevention Invariants")

def test_rules_json_coop_coep():
    subframe_rule = next((r for r in rules_data if 'sub_frame' in r.get('condition', {}).get('resourceTypes', [])), None)
    assert subframe_rule is not None, "sub_frame rule missing in rules.json"
    headers_removed = [h.get('header') for h in subframe_rule.get('action', {}).get('responseHeaders', []) if h.get('operation') == 'remove']
    assert 'Cross-Origin-Opener-Policy' in headers_removed, "COOP removal missing"
    assert 'Cross-Origin-Embedder-Policy' in headers_removed, "COEP removal missing"
    assert 'X-Frame-Options' in headers_removed, "X-Frame-Options removal missing"
    assert 'Content-Security-Policy' in headers_removed, "CSP removal missing"

run_test("4.1: rules.json removes COOP, COEP, XFO, CSP for sub_frame", test_rules_json_coop_coep)

def test_compositing_optimizations():
    # Backdrop filter 4px
    assert "backdrop-filter: blur(4px) !important;" in content_js
    assert "backdrop-filter: blur(4px) !important;" in modal_css
    
    # Isolation on backdrop and modal
    assert "isolation: isolate !important;" in content_js
    assert "isolation: isolate !important;" in modal_css
    
    # Layer pinned
    assert "transform: translateZ(0) !important;" in content_js
    assert "transform: translateZ(0) !important;" in modal_css
    
    # Strict containment
    assert "contain: strict !important;" in content_js
    assert "contain: size layout paint !important;" in content_js
    
    # No will-change on modal container
    modal_rule_match = re.search(r'\.peek-wave-modal\s*\{([^}]+)\}', content_js)
    if modal_rule_match:
        assert 'will-change' not in modal_rule_match.group(1), "Found will-change on .peek-wave-modal in content.js"

run_test("4.2: Compositing optimizations: 4px blur, translateZ(0), isolation, contain strict, no will-change churn", test_compositing_optimizations)

print("\n--------------------------------------------------------")
print(f"M1_YT PYTHON SUITE SUMMARY: {passed_tests} passed, {failed_tests} failed, {total_tests} total")
print("--------------------------------------------------------")

if failed_tests > 0:
    print(f"\n[FAIL] CHALLENGE FAILED: {failed_tests} test(s) failed.")
    sys.exit(1)
else:
    print(f"\n[PASS] ALL {passed_tests} PYTHON ADVERSARIAL STRESS CHALLENGES PASSED!")
    sys.exit(0)
