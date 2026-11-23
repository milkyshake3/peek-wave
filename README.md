# Peek Wave

A lightweight, low-memory Manifest V3 Chromium browser extension bringing floating link previews to Chromium-based browsers including Chrome, Edge, Brave, and Arc.

Hold a configurable modifier key (Shift by default) and click any link to preview the target web page in an isolated, floating modal overlay without navigating away or opening extra tabs.

---

## Features

- Link Preview Modal: Preview web pages inside a sandboxed floating overlay with monochrome translucent frosted glass styling (Dark, Light, and Auto system theme modes) and clean typography.
- Interactive Modal Controls: Drag the modal header to reposition, drag the bottom-right corner handle to resize, cycle size presets from the header, view the muted URL path snippet, and use the fallback prompt if a site fails or times out while framing.
- Customizable Modifier Shortcut: Trigger previews using Shift + Click (default), Alt/Option + Click, or Ctrl/Cmd + Click.
- Per-Site Pause Controls: Pause or resume Peek Wave on the current site with one click in the popup and manage paused sites via removable chips.
- Grow-from-Link Animation: Modal smoothly expands outward from the bounding coordinates of the clicked link by default while respecting reduced-motion preferences.
- Low-RAM Teardown: Enforces a deterministic 6-step lifecycle cleanup on dismissal (immediate iframe about:blank navigation, event listener unbinding, DOM detachment, and reference clearing) to eliminate memory leaks and stop background audio or video processes.
- Sub-Frame Header Stripping: Native declarativeNetRequest rule strips X-Frame-Options, Frame-Options, and Content-Security-Policy frame-ancestors on sub_frame requests, allowing previews across framing-restricted websites.
- Header Bar Controls: Displays target domain, path snippet, and favicon, loading indicator bar, Quick Size Cycle button, Open in New Tab button, Copy Link URL button, and Close button.
- Style Isolation: Built using open Shadow DOM attached directly to document.documentElement, preventing CSS leakage between the host page and the modal overlay.
- Zero External Dependencies: Pure vanilla JavaScript with no runtime frameworks or npm dependencies for minimal CPU and memory usage.

---

## Installation (Developer Mode / Load Unpacked)

1. Open your Chromium browser (Google Chrome, Microsoft Edge, Brave, or Arc).
2. Navigate to the extensions management page:
   - Chrome: chrome://extensions/
   - Edge: edge://extensions/
   - Brave: brave://extensions/
   - Dia: dia://extensions/
3. Enable Developer mode via the toggle switch in the upper-right corner.
4. Click the "Load unpacked" button.
5. In the file picker, select the repository root directory (the folder containing manifest.json).
6. Peek Wave will appear in your installed extensions list. Pin it to the browser toolbar for quick access to settings.

---

## Usage

1. Open any web page.
2. Hold the configured modifier key (Shift by default) and click any hyperlink.
3. The preview modal expands from the clicked link and displays the target page.
4. To dismiss the preview:
   - Press the Escape key.
   - Click anywhere on the dark backdrop outside the modal.
   - Click the Close button in the modal header bar.
5. To configure settings:
   - Click the Peek Wave icon in the browser toolbar.
   - Cycle between Dark, Light, and Auto (system) monochrome themes.
   - Toggle link previews on or off.
   - Pause or resume Peek Wave for the current site or manage paused sites.
   - Select your preferred modifier key (Shift, Alt/Option, or Ctrl/Cmd).
   - Select your preferred modal dimension preset (Compact: 640x480, Default: 860x600, Large: 1100x760).

---

## Project Structure

```
peek wave/
├── manifest.json              # Manifest V3 extension configuration
├── rules.json                 # DeclarativeNetRequest rules for sub_frame header modification
├── background.js              # Service worker handling tab creation and lifecycle
├── icons/                     # Extension icons (16px, 32px, 48px, 128px PNGs)
├── content/
│   ├── content.js             # Link interception, Shadow DOM modal, grow animation, teardown
│   └── modal.css              # Isolated monochrome frosted-glass stylesheet inside Shadow DOM
├── popup/
│   ├── popup.html             # Toolbar settings interface
│   ├── popup.css              # Monochrome settings stylesheet
│   ├── theme-init.js          # Synchronous pre-paint theme initializer
│   └── popup.js               # Settings controller and live tab propagation
├── lib/
│   └── storage.js             # Dual-storage sync utility with local fallback
└── tests/
    ├── e2e/                   # Automated E2E tests across 4 tiers
    ├── adversarial/           # Adversarial challenger and UI feature tests
    ├── harness/               # DOM simulator and Chrome MV3 mocks
    ├── fixtures/              # HTML fixtures and mock datasets
    ├── test_runner.js         # Node.js automated test runner
    └── adversarial_challenge.py # Python adversarial stress runner
```

---

## Automated Tests

Run the automated test runner:

```bash
node tests/test_runner.js
```

Specific test tiers can be executed individually:

```bash
node tests/test_runner.js --tier=1    # Tier 1: Feature Coverage (66 tests)
node tests/test_runner.js --tier=2    # Tier 2: Boundary & Corner Cases (36 tests)
node tests/test_runner.js --tier=3    # Tier 3: Cross-Feature Combinations (25 tests)
node tests/test_runner.js --tier=4    # Tier 4: Real-World Scenarios (25 tests)
```

Run the Python adversarial stress suite:

```bash
python tests/adversarial_challenge.py
```
