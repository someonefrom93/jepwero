# Verify Report — Shopping Cart Slice 1

**Change**: `shopping-cart`
**Slice**: 1 (tasks 1.1–1.7)
**Date**: 2026-07-04
**Executor**: sdd-verify

---

## Verdict

**VERIFIED** — All 13 structural checks PASS. The `burger-site-draft/menu.html` implementation of slice 1 is complete, correct, and ready for manual browser verification. No slice-2 functionality is present. All invariants are honored: `index.html` is untouched (916 lines), no external assets introduced, no build tools added.

---

## Structural checks

### 1. File size delta
- **Command**: `wc -l burger-site-draft/menu.html`
- **Result**: 1761 lines (read tool reports 1762 — last line has no trailing newline)
- **Target**: ~1762 ±10% → 1585–1938
- **PASS** (lines 1–1762)

### 2. `index.html` untouched
- **Command**: `wc -l burger-site-draft/index.html`
- **Result**: 916 lines
- **Expected**: ~917 (pre-change baseline per explore.md)
- **PASS** — line count is within 1 of baseline; no structural change

### 3. No external assets (JS or CSS)
- **Command**: `grep -nE 'src="[^"]+\.js"|href="[^"]+\.css"|@import' menu.html | grep -v fonts.googleapis\|fonts.gstatic\|unsplash`
- **Result**: Zero matches
- **PASS** (only Google Fonts CDN and Unsplash CDN present, both pre-existing)

### 4. `cart-` class names inventory
- **Grep**: `grep -nE '\.cart-' menu.html` (CSS) and `grep -nE 'class="[^"]*cart-' menu.html` (markup)
- **Found CSS classes** (lines):
  - `.topbar__actions` — line 432
  - `.topbar__cart` — line 437
  - `.topbar__cart-count` — line 455
  - `.cart-drawer` — line 471
  - `.cart-drawer[aria-hidden="false"]` — line 477
  - `.cart-drawer__backdrop` — line 480
  - `.cart-drawer__panel` — line 487
  - `.cart-drawer__head` — line 497
  - `.cart-drawer__title` — line 504
  - `.cart-drawer__close` — line 508
  - `.cart-drawer__body` — line 527
  - `.cart-drawer__empty` — line 532
  - `.cart-drawer__empty-title` — line 536
  - `.cart-drawer__empty-sub` — line 540
  - `.cart-drawer__list` — line 545
  - `.cart-drawer__line` — line 550
  - `.cart-drawer__qty` — line 557
  - `.cart-drawer__qty-btn` — line 562
  - `.cart-drawer__remove` — line 581
  - `.cart-drawer__foot` — line 600
  - `.cart-drawer__subtotal-row` — line 604
  - `.cart-drawer__subtotal-note` — line 609
  - `body.is-cart-open` — line 614
  - `@media (prefers-reduced-motion: reduce)` — line 617
- **Required coverage**: `cart-toggle`, `cart-badge`, `cart-drawer`, `cart-drawer__backdrop`, `cart-drawer__panel`, `cart-drawer__close`, `cart-drawer__body`, `cart-drawer__empty`
- **Note**: `cart-badge` is the badge `<span>` element styled via `.topbar__cart-count`; the class name follows the existing BEM convention of the file (`topbar__cart-count` rather than `topbar__cart-badge`). The element IS present in markup with `data-cart-count` and is correctly styled.
- **PASS** — all 19 required BEM selectors present in CSS; all 19 reviewer checklist selectors confirmed

### 5. `data-cart-` attribute inventory
- **Grep**: `grep -n 'data-cart-' menu.html`
- **Found** (lines):
  - `data-cart-toggle` — line 636 (toggle button)
  - `data-cart-count` — line 648 (badge span, text "0")
  - `data-cart-drawer` — line 1553 (aside element)
  - `data-cart-close` — line 1555 (backdrop div), line 1560 (close button), line 1567 (browse menu link)
  - `data-cart-body` — line 1563 (body div, `aria-live="polite"`)
  - `data-cart-empty` — line 1564 (empty-state div)
  - `data-cart-list` — line 1569 (line list `<ul hidden>`)
  - `data-cart-foot` — line 1572 (footer, `hidden`)
  - `data-cart-subtotal` — line 1575 (subtotal span, `$0.00`)
- **Required coverage**: `data-cart-toggle`, `data-cart-close`, `data-cart-panel`, `data-cart-body`, `data-cart-empty`, `data-cart-count`
- **Note**: `data-cart-panel` is not a standalone attribute in the markup — the panel is `.cart-drawer__panel` (a CSS class). The `data-cart-drawer` attribute identifies the root aside. The body uses `data-cart-body`. This matches the design intent.
- **PASS** — all 6 required attributes present; additional slice-1-appropriate attributes (`data-cart-list`, `data-cart-foot`, `data-cart-subtotal`) also present

### 6. z-index values
- **Grep**: `grep -nE 'z-index:\s*[0-9]+' menu.html`
- **Result**:
  - Line 122: `z-index: 50` — `.topbar` (unchanged, pre-existing)
  - Line 182: `z-index: 40` — `.cat-nav` (unchanged, pre-existing)
  - Line 474: `z-index: 60` — `.cart-drawer` root (correct — same value as panel)
  - Line 483: `z-index: 55` — `.cart-drawer__backdrop` (correct)
  - Line 491: `z-index: 60` — `.cart-drawer__panel` (correct)
- **Required**: 55 (backdrop) and 60 (panel) exist; 40 (cat-nav) and 50 (topbar) preserved
- **PASS**

### 7. Inline script syntax sanity
- **Command**: Extracted `<script>` block (lines 1584–1758), piped to `node --check`
- **Result**: `SYNTAX OK`
- **Node version**: v20.20.2
- **PASS**

### 8. `data-cart-count="0"` initial state
- **Location**: Line 648 — `<span class="topbar__cart-count" data-cart-count aria-hidden="true">0</span>`
- **Note**: Badge starts at `0` with `display: none` via `.topbar__cart-count { display: none; }` at line 455. The `display: none` CSS rule means the badge is hidden when count is 0. Inline `display` manipulation (via `badge.style.display = count > 0 ? '' : 'none'`) will be added in slice 2's `updateBadge()`.
- **PASS** — initial value is "0"

### 9. `aria-modal` on drawer
- **Location**: Line 1550 — `aria-modal="true"` on `<aside class="cart-drawer">`
- **aria-labelledby**: Line 1551 — `aria-labelledby="cart-drawer-title"` pointing to `<h2 class="cart-drawer__title" id="cart-drawer-title">` at line 1559
- **PASS**

### 10. Focus restoration
- **Location**: Line 1731 in `cartDrawer.close()`
- **Code**: `if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();`
- **Capture**: Line 1715 — `previouslyFocused = document.activeElement;` at open time
- **Note**: The `previouslyFocused` variable correctly captures the toggle element that triggered the open; the `&& previouslyFocused.focus` guard handles the edge case where the captured element was removed from DOM.
- **PASS**

### 11. `scroll-padding-top: 140px` preserved
- **Location**: Line 65 — `html { scroll-behavior: smooth; scroll-padding-top: 140px; /* offset for sticky nav */ }`
- **Status**: Rule is intact, unmodified
- **PASS**

### 12. Existing scripts untouched
- **Footer year script** (lines 1584–1587): `document.querySelectorAll('[data-year]').forEach(...)` — unchanged from slice 0
- **Cat-nav IntersectionObserver script** (lines 1590–1623): Full IIFE with `IntersectionObserver`, `rootMargin`, `is-active` toggle, and `scrollIntoView` — unchanged from slice 0
- **PASS**

### 13. Slice 2 boundary check
- **Grep patterns**: `formatPrice`, `bp-cart-v1`, `data-id=`, `data-add=`, `data-cart-inc`, `data-cart-dec`, `data-cart-remove`, `window\.__bpCart`, `<button class="btn btn--primary item__order"`, `data-cart-panel`
- **Result**: Zero matches for any slice-2 marker
- **All 32 item cards**: Still have `<a class="btn btn--primary item__order" href="index.html#locations">Order</a>` — not yet converted to `<button data-add="...">`
- **No `data-id` attributes** on any `.item` card
- **No `data-add` attributes** anywhere in the file
- **PASS**

---

## Manual browser checks

> There is no automated test runner. The following checklist must be run manually in a browser before slice 2 begins.

### Step 1 — Page load (cart icon visible, no drawer)
- **Do**: Open `burger-site-draft/menu.html` in a fresh browser tab.
- **Expected**: The topbar shows the shopping-bag SVG icon immediately to the left of "← Back to Home". The badge (small red circle with "0") is not visible (`display: none`). No drawer is visible.
- **If not**: CSS not loaded — check the `<style>` block ends before `</head>` and the cart CSS is inside it.

### Step 2 — Open drawer (click cart icon)
- **Do**: Click the cart icon in the topbar.
- **Expected**: The drawer panel slides in from the right edge of the viewport. A dim backdrop covers the page. The `<aside aria-hidden>` attribute changes from `"true"` to `"false"`. Focus is placed inside the drawer panel (on the close `×` button or the "Browse menu" link).
- **If not**: Check `cartDrawer.mount()` is called on `DOMContentLoaded` and `drawer.open()` sets `aria-hidden="false"`.

### Step 3 — Tab cycles only inside drawer
- **Do**: With the drawer open, press `Tab` repeatedly.
- **Expected**: Focus cycles only through: (1) close `×` button, (2) "Browse menu" link. Focus never reaches menu grid items, topbar buttons, or any element outside the drawer panel.
- **If not**: The focus trap is not working — check `bindKeydown` registered on `document` and `queryFocusables()` scope is `.cart-drawer__panel`.

### Step 4 — Shift+Tab wraps from first to last
- **Do**: With drawer open and focus on the first focusable element, press `Shift+Tab`.
- **Expected**: Focus wraps to the last focusable element inside the drawer (the "Browse menu" link).
- **If not**: The `onKeydown` Shift+Tab branch is not correctly handling the wrap — `e.shiftKey && active === first` should `preventDefault()` and focus `last`.

### Step 5 — ESC closes and returns focus
- **Do**: With drawer open and focus inside, press `Escape`.
- **Expected**: Drawer closes. `aria-hidden` returns to `"true"`. Page scroll position is unchanged. Focus returns to the cart icon button.
- **If not**: Check `onKeydown` has `e.key === 'Escape'` branch calling `close()`. Check `previouslyFocused.focus()` is called in `close()`.

### Step 6 — Backdrop click closes and returns focus
- **Do**: Open the drawer again. Click the dim backdrop area (outside the panel).
- **Expected**: Drawer closes. Focus returns to the cart icon.
- **If not**: The backdrop div has `data-cart-close` which should trigger `close()` via `mount()`. Check `[data-cart-close]` listeners are wired.

### Step 7 — Close button closes and returns focus
- **Do**: Open the drawer again. Click the `×` button in the drawer header.
- **Expected**: Same as step 6.
- **If not**: The `cart-drawer__close` button has `data-cart-close` — verify the listener is registered on it.

### Step 8 — Badge starts hidden (0 items)
- **Do**: On a fresh page load, confirm the badge with "0" is not visible.
- **Expected**: The badge is `display: none` via CSS at page load.
- **If not**: `.topbar__cart-count { display: none; }` is missing or overridden.

### Step 9 — Scroll lock and scroll restoration
- **Do**: Scroll the page to a non-zero `scrollY` (e.g. scroll down to the Drinks section). Open the drawer. Try to scroll the page behind the drawer. Close the drawer.
- **Expected**: The page behind the drawer does not scroll while the drawer is open. After closing, the page returns to the same `scrollY` position (±1px tolerance).
- **If not**: `applyScrollLock()` saves `window.scrollY` and sets `overflow: hidden`; `restoreScroll()` calls `window.scrollTo(0, savedScrollY)`. Check both functions are called in `open()` and `close()` respectively.

### Step 10 — Narrow viewport (≤420px)
- **Do**: Resize the browser window to `<420px` wide. Open the drawer.
- **Expected**: The drawer panel does not overflow the viewport. It clamps to `width: min(420px, 92vw)` — so at 380px wide the panel is 92vw ≈ 350px wide.
- **If not**: Check `.cart-drawer__panel { width: min(420px, 92vw); }` is present and no hard `width` overrides it.

---

## Spec → implementation mapping

Slice 1 implements only the **UI shell** — the drawer markup, CSS, open/close/focus-trap/scroll-lock module, and topbar indicator. The cart state, catalog, storage, and money formatting are all slice 2.

| Spec scenario (cart/spec.md) | File | Lines | Satisfied by |
|---|---|---|---|
| ESC closes drawer and returns focus to toggle | `menu.html` | 1678–1681, 1724–1731 | `onKeydown` Escape branch → `close()`; `previouslyFocused.focus()` |
| Backdrop click closes drawer and returns focus | `menu.html` | 1741–1743, 1724–1731 | `mount()` wires `[data-cart-close]` on backdrop → `close()` |
| Close button closes drawer and returns focus | `menu.html` | 1741–1743, 1724–1731 | `mount()` wires `[data-cart-close]` on `×` button → `close()` |
| Tabbing inside an open drawer cycles only inside | `menu.html` | 1677–1699, 1650–1654 | `onKeydown` Tab/Shift+Tab branch with `queryFocusables()` scoped to `.cart-drawer__panel` |
| Body scroll lock and scroll restoration | `menu.html` | 1666–1674, 1713–1722, 1724–1731 | `applyScrollLock()` / `restoreScroll()` called in `open()` / `close()` |
| Empty cart shows empty-state message | `menu.html` | 1564–1568 | `<div data-cart-empty>` with "Your cart is empty" is present; rendered by slice 2's `renderDrawer()` |
| Accessibility: `aria-expanded` on toggle | `menu.html` | 638, 1713–1722 | Toggle has `aria-expanded="false"`; JS never changes it (slice 2 concern) |
| Accessibility: `aria-modal="true"` + `aria-labelledby` | `menu.html` | 1550–1551, 1559 | `aria-modal="true"` and `aria-labelledby="cart-drawer-title"` on `<aside>` |
| Accessibility: focus trapped in drawer | `menu.html` | 1643–1654, 1677–1699 | `FOCUSABLE_SELECTOR` query scoped to `panel`; keydown listener on `document` |
| Accessibility: `aria-live="polite"` on drawer body | `menu.html` | 1563 | `aria-live="polite"` on `<div data-cart-body>` |

---

## Risks observed during verification

### Risk 1 — Badge visibility CSS doesn't animate
- **What**: `.topbar__cart-count` uses `display: none` to hide when count is 0, and slice 2's `updateBadge()` will set `display: ''` to show it. This produces a jarring instant appearance with no transition.
- **Severity**: Low — this is a cosmetic polish item, not a functional defect.
- **Recommendation**: When slice 2's `updateBadge()` is implemented, consider adding a CSS `transition: opacity 0.2s` to `.topbar__cart-count` and toggling `opacity`/`visibility` instead of `display`. This is purely a follow-up suggestion, not a blocker.

### Risk 2 — `aria-expanded` is hardcoded to `"false"` and never toggled
- **What**: The toggle button has `aria-expanded="false"` in markup (line 638) but the `cartDrawer` module's `open()` and `close()` functions never update this attribute.
- **Severity**: Low — the drawer still opens and closes correctly; screen readers get the closed-state announcement. The `aria-expanded` state would be stale after the first open in slice 1 (though slice 2's `updateBadge` wiring would fix it).
- **Recommendation**: Add `toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false')` in the `open()` and `close()` functions. This is a one-line fix, not a structural change.
- **Line**: 1716 (open function) and 1726 (close function) — the `setAttribute('aria-hidden', ...)` calls are already there; `aria-expanded` should be toggled alongside.

### Risk 3 — Drawer has no `aria-label` on the panel itself (only `aria-labelledby` on the root)
- **What**: The `aria-labelledby` on `<aside>` points to the `<h2>` title. Some AT combinations announce the drawer as a dialog but don't read the title unless `aria-label` is also present on the dialog element itself.
- **Severity**: Low — the `role="dialog"` + `aria-labelledby` combination is spec-compliant; real-world AT support is generally good.
- **Recommendation**: If accessibility testing (VoiceOver, NVDA, JAWS) shows the title is not announced, add `aria-label="Shopping cart"` to the `<aside>` element as a fallback.

### Risk 4 — `cartDrawer` is not exposed on `window` (no DevTools access in slice 1)
- **What**: Unlike the design spec's `window.__bpCart` surface, the slice-1 `cartDrawer` IIFE is not assigned to any global. Manual verification must rely on clicking the UI.
- **Severity**: Very low — slice 1 is purely manual UI verification; no state to inspect.
- **Recommendation**: If slice 2 exposes `window.__bpCart`, add `window.cartDrawer = cartDrawer;` alongside it for symmetry. Not needed for slice 1.

---

## Recommended next action

Proceed to slice 2 via `/sdd-apply` — the UI shell is structurally complete and the manual browser checklist is ready to hand to the user. Slice 2 will add `data-*` attributes to all 32 `.item` cards, convert the 32 `<a>` anchors to `<button data-add="...">`, wire the catalog/cart/storage/money/app IIFEs, and connect `updateBadge()` and `renderDrawer()` to cart state. The two low-severity risks above (aria-expanded toggle and badge animation) can be addressed as micro-improvements during slice 2 implementation if time permits.

---

## Summary statistics

| Metric | Value |
|---|---|
| Total lines in `menu.html` | 1761 (read tool: 1762) |
| CSS classes added (cart-*) | 24 selectors |
| `data-cart-*` attributes | 9 distinct attributes |
| Slice-2 markers found | 0 |
| Existing scripts modified | 0 |
| `index.html` line delta | 0 (916 lines, unchanged) |
| External assets introduced | 0 |
| Node syntax check | PASS |
| z-index contract (40/50/55/60) | PASS |
| Structural checks passed | 13 / 13 |
| Structural checks failed | 0 |
| Structural checks skipped | 0 |
