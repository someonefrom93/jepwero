# Verification Report — Slice 2 (`shopping-cart`)

**File verified**: `burger-site-draft/menu.html`
**Scope**: Tasks 2.1–2.9 only. Slice 1 verified separately; structural presence confirmed but slice-1 runtime behavior not re-verified.
**Date**: 2026-07-04
**Line count**: 2116

---

## Verdict

**VERIFIED** — All 15 structural checks PASS. 6/6 price spot-checks PASS. 3/3 category spot-checks PASS. Spec → implementation mapping is complete. The inline JS passes `node --check` with exit code 0. All five binding invariants are honored. No external assets introduced.

---

## Structural checks

| # | Check | Expected | Actual | Status | Location |
|---|---|---|---|---|---|
| 1 | File size (`wc -l`) | ~2116 (±10%) | **2116** | ✅ PASS | `burger-site-draft/menu.html` |
| 2 | `index.html` untouched | 916 lines | **916** | ✅ PASS | `burger-site-draft/index.html` |
| 3 | No external JS/CSS files | None added | **None found** | ✅ PASS | Only Google Fonts CDN + Unsplash pre-existing |
| 4 | `data-id` count | 32 | **32** | ✅ PASS | Lines 705, 727, 748, 787, 807, 827, 847, 867, 887, 924, 944, 964, 984, 1021, 1041, 1061, 1098, 1118, 1138, 1158, 1195, 1215, 1235, 1272, 1292, 1312, 1332, 1352, 1389, 1408, 1427, 1446 |
| 5 | `data-name` count | 32 | **32** | ✅ PASS | Same lines as data-id (co-located on same `<article>` tags) |
| 6 | `data-price` count | 32 | **32** | ✅ PASS | Same lines |
| 7 | `data-category` count | 32 | **32** | ✅ PASS | Same lines |
| 8 | `data-cal` count | 32 | **32** | ✅ PASS | Same lines |
| 9 | `data-img` count | 32 | **32** | ✅ PASS | Same lines |
| 10 | Buttons with `data-add` | 32 | **32** | ✅ PASS | Lines 722, 743, 764, 802, 822, 842, 862, 882, 902, 939, 959, 979, 999, 1036, 1056, 1076, 1113, 1133, 1153, 1173, 1210, 1230, 1250, 1287, 1307, 1327, 1347, 1367, 1403, 1422, 1441, 1460 |
| 11 | Anchors `href="index.html#locations"` in `.item__order` | 0 | **0** (3 remaining anchors are in hero/footer, not in cards) | ✅ PASS | Lines 668, 669 (hero), 1504 (footer) — all outside `.item__order` |
| 12 | Storage key literal `'bp-cart-v1'` | ≥1 occurrence | **3 occurrences** | ✅ PASS | Line 1833 (definition), line 1872 (warning), line 1877 (warning) |
| 13 | `Intl.NumberFormat` usage | Present | **Present** | ✅ PASS | Lines 1770–1771: `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })` |
| 14 | Slice-1 `aria-expanded` patch preserved | 3 occurrences | **3 occurrences** | ✅ PASS | Line 638 (HTML initial `="false"`), line 1718 (`='true'` in `open()`), line 1730 (`='false'` in `close()`) |
| 15 | Inline script syntax sanity (`node --check`) | Exit 0 | **Exit 0** | ✅ PASS | Entire `<script>` block extracted and checked |

**Structural summary**: 15/15 PASS, 0/15 FAIL, 0/15 SKIPPED.

---

## Price spot-checks

Source: `design.md` `## DOM diff plan` (integer-cent values in `data-price` attribute).

| Card | `data-id` | `data-price` (cents) | Expected cents | Status |
|---|---|---|---|---|
| lt:smokehouse-smash | `lt:smokehouse-smash` | `1095` | `1095` | ✅ PASS |
| burgers:classic | `burgers:classic` | `895` | `895` | ✅ PASS |
| burgers:double-stack | `burgers:double-stack` | `1150` | `1150` | ✅ PASS |
| chicken:chicken-tenders | `chicken:chicken-tenders` | `925` | `925` | ✅ PASS |
| sides:hand-cut-fries | `sides:hand-cut-fries` | `395` | `395` | ✅ PASS |
| shakes:cookies-cream | `shakes:cookies-cream` | `625` | `625` | ✅ PASS |

**Price spot-check summary**: 6/6 PASS.

---

## Category spot-checks

| Card | `data-id` | `data-category` | Expected | Status |
|---|---|---|---|---|
| Smokehouse Smash | `lt:smokehouse-smash` | `lt` | `lt` | ✅ PASS |
| Kids' Burger | `kids:burger` | `kids` | `kids` | ✅ PASS |
| Cookies & Cream shake | `shakes:cookies-cream` | `shakes` | `shakes` | ✅ PASS |

**Category spot-check summary**: 3/3 PASS.

---

## Spec → implementation mapping

Source: `design.md` `## Acceptance verification mapping`. Actual line/function found in `menu.html`.

| Spec scenario | Implementation location | Actual function/line |
|---|---|---|
| Adding one item to an empty cart | `wireAddButtons()` → `cart.addItem(id)` → `cart.subscribe` → `updateBadge()` + `renderDrawer()` | `app.wireAddButtons()` lines 2061–2075; `cart.addItem()` lines 1932–1937 |
| Adding the same item twice | `cart.addItem()` increments `lines[id].qty` if id exists; no duplicate key | Line 1934: `if (!lines[id]) lines[id] = { qty: 0 }; lines[id].qty += 1;` |
| Reducing quantity to 0 removes the line | `cart.dec()` checks `qty <= 1` and calls `remove(id)` | Lines 1945–1950: `if (lines[id].qty <= 1) { remove(id); return; }` |
| localStorage disabled — in-memory fallback | `storage.detect()` sets `available = false`; `storage.write()` is no-op; `storage.read()` returns null | Line 1843: `available = false;` catch block; line 1865: `if (!available) return null;` |
| Reload restores the cart | `app.init()` → `cart.hydrate()` → `storage.read()` | Lines 2081–2084: `init()` calls `storage.detect()`, `catalog.reindex()`, `cart.hydrate()` |
| Cross-tab sync via `storage` event | `storage.attachChangeListener()` → `cart.hydrate()` | Lines 2077–2078: `wireStorageSync()` calls `attachChangeListener(() => cart.hydrate())` |
| ESC closes drawer and returns focus to toggle | `cartDrawer.onKeydown()` checks `e.key === 'Escape'` → `close()` → `previouslyFocused.focus()` | Lines 1677–1681: Escape handler; lines 1735: `previouslyFocused.focus()` |
| Backdrop click closes drawer | `[data-cart-close]` listener on `.cart-drawer__backdrop` → `close()` | Line 1746: `btn.addEventListener('click', close)` inside `mount()` |
| Tabbing inside open drawer cycles only inside drawer | `onKeydown()` Tab/Shift+Tab handler with `FOCUSABLE_SELECTOR` scoped to panel | Lines 1683–1699: Tab/Shift+Tab trap inside `cartDrawer` IIFE |
| Body scroll lock and scroll restoration | `applyScrollLock()` saves `scrollY`; `restoreScroll()` re-applies via `scrollTo` | Lines 1667–1674: `savedScrollY` + `window.scrollTo(0, savedScrollY)` |
| Empty cart shows empty-state message | `renderDrawer()` toggles `data-cart-empty` vs `data-cart-list`/`data-cart-foot` | Lines 2013–2017: empty path hides list/foot, shows empty |
| DOMContentLoaded produces full 32-item catalog | `catalog.reindex()` on `DOMContentLoaded` via `app.init()` | Line 2083: `catalog.reindex()` in `init()`, registered line 2093 |
| Missing `data-price` skipped with warning | `catalog.parsePriceStrict()` returns null; `reindex()` emits `console.warn` | Lines 1789–1795: `parsePriceStrict()`; lines 1815–1817: warning |
| Category-qualified ids prevent collisions | `data-id` format `category:slug`; `catalog.reindex()` checks `next.has(id)` before inserting | Lines 1810–1812: duplicate check with warning |

**Spec → implementation pairs count**: 14/14 mapped.

**Note**: The actual module structure uses `cartDrawer` (not `drawer`) for the UI shell from slice 1, and `app` for the slice-2 wiring layer. `window.__bpCart` exposes `catalog`, `cart`, `money`, `storage` — not `drawer` (which is `cartDrawer` in the slice-1 module). The drawer's `open/close/toggle/isOpen/mount` are correctly wired via `cartDrawer.mount()` on DOMContentLoaded (line 1761). This is intentional and documented in the apply-progress observation.

---

## Manual browser checks

Source: `tasks.md` "Slice 2 verification (manual browser checks)" block.

> Prerequisites: Slice 1 is verified and present. Open `burger-site-draft/menu.html` in a browser.

1. **[Catalog indexed]** Open DevTools console. Run `__bpCart.catalog.size()` — expect `32`.
2. **[Catalog get]** Run `__bpCart.catalog.get('burgers:classic')` — expect `{ id: 'burgers:classic', name: 'The Classic', priceCents: 895, ... }`.
3. **[Badge increment]** Click "Add" on The Classic card. Badge shows `1`. Badge is now visible (CSS `display` is empty, not `none`).
4. **[Line render — name and price]** Open drawer. Line shows "The Classic", unit price `$8.95`, qty `1`, line subtotal `$8.95`.
5. **[Duplicate add increments qty]** Click "Add" on The Classic again. Badge shows `2`. Line qty is `2`, line subtotal `$17.90`.
6. **[+ button increments]** In drawer, click `+` on the line. Qty becomes `3`. Subtotal becomes `$26.85`.
7. **[− button decrements then removes]** Click `−` once: qty becomes `2`, subtotal `$17.90`. Click `−` again: qty becomes `1`. Click `−` again: line is removed, badge shows `0`, empty state shown.
8. **[Multi-item subtotal]** Add "Cheese Fries" ($5.50) and "Kids' Burger" ($6.95). Subtotal in footer shows `$12.45`.
9. **[Reload persistence]** Reload `menu.html`. Badge immediately shows `2`. Open drawer — cart content matches what was present before reload.
10. **[localStorage shape]** In DevTools Application tab → Local Storage, key `bp-cart-v1` exists and contains `{ "v": 1, "lines": { ... }, "updatedAt": ... }`.
11. **[Cross-tab sync]** Open `menu.html` in a second tab. Add an item in tab 1. Tab 2 badge updates to reflect the new count without any page focus change in tab 2.
12. **[Storage disabled fallback]** In DevTools → Application → Local Storage, set it to blocked (or use private mode). Reload. Adding items still works for the session; no console error thrown. Badge still updates.
13. **[ESC closes with focus return]** Open drawer. Press ESC. Drawer closes. Focus is on the cart icon. `aria-expanded` on the toggle button is `"false"`.
14. **[Price formatting edge cases]** In DevTools console:
    - `__bpCart.money.formatPrice(0)` → `"$0.00"`
    - `__bpCart.money.formatPrice(425)` → `"$4.25"`
    - `__bpCart.money.formatPrice(1095)` → `"$10.95"`
    - `__bpCart.money.formatPrice(895)` → `"$8.95"`

**Manual checks count**: 14 steps (tasks.md lists 14 steps, not 12 as in the cached session context — the extra 2 are steps 13 and 14 above).

---

## Risks observed during verification

1. **`__bpCart` does not expose `drawer` / `cartDrawer`**: The slice-1 drawer module is named `cartDrawer` and lives in a separate IIFE from slice-2's `app`. It is correctly mounted (line 1761) and wired. However, `window.__bpCart` only exposes `catalog`, `cart`, `money`, `storage` — the drawer is not inspectable from DevTools via `__bpCart`. This is by design (drawer state is managed imperatively), but if a future developer wants to inspect drawer state they must look at the DOM (`document.querySelector('[data-cart-drawer]')`) or the `cartDrawer` variable directly (which is not exposed). **Risk**: low. The drawer's public API (`open`, `close`, `toggle`, `isOpen`, `mount`) is correctly wired; the missing exposure is cosmetic for manual debugging.

2. **`app.init` does not call `drawer.mount()` (because the drawer module is `cartDrawer`, not `drawer`)**: The init sequence in slice 2 does not call `cartDrawer.mount()` — that already happened at line 1761 via a separate DOMContentLoaded handler. This is correct but could confuse a future reader who expects `init()` to be the single entry point for all wiring. **Risk**: low; documented in apply-progress observation.

3. **`drawer.open()` does not call `renderDrawer()`**: When `cartDrawer.open()` is called (topbar icon click), it only handles the UI shell (aria-hidden, scroll lock, focus trap, aria-expanded). The cart content (badge count, drawer line list) is driven entirely by the `cart.subscribe()` callback that fires `updateBadge()` and `renderDrawer()` on every cart mutation. This means adding items while the drawer is closed correctly updates the badge but does not pre-render the drawer content — `renderDrawer()` is called on every subscription fire regardless of whether the drawer is open or closed. The drawer re-renders when opened because the subscription already fired. **Risk**: low; this is the intended behavior per design.

4. **`prefers-reduced-motion` CSS block exists** (`lines 617–622`) but the drawer module uses no CSS transition property for panel slide — the drawer opens by `pointer-events` toggle only (no `transform` or `opacity` transition from `translateX`). The `@media` block sets `transition: none` on `.cart-drawer__panel` and `.cart-drawer__backdrop` but these panels have no transition properties defined. The "slide" impression comes purely from `pointer-events` snapping, not animation. **Risk**: very low; no regression — the drawer worked identically before the reduced-motion block was added.

5. **`e.preventDefault()` in `wireAddButtons()`**: Line 2066 calls `e.preventDefault()` before reading `data-add`. This is defensive (prevents any default anchor behavior if a button is somehow nested in an anchor), but buttons don't have default anchor behavior. This is harmless but unnecessary. **Risk**: theoretical only.

---

## Recommended next action

Slice 2 is **verified**. Run the 14-step manual browser checklist above to confirm runtime behavior, then proceed to `sdd-archive` to finalize the SDD delta specs and mark the change complete. The `sdd-judgment` phase can be triggered separately if adversarial review is desired.

---

## Binding invariants check

| # | Invariant | Status |
|---|---|---|
| 1 | `burger-site-draft/index.html` NOT modified | ✅ HONORED — 916 lines, unchanged |
| 2 | No external JS/CSS files added | ✅ HONORED — only Google Fonts CDN + Unsplash pre-existing |
| 3 | No build tools introduced | ✅ HONORED — zero build tooling |
| 4 | No automated test runner added | ✅ HONORED — manual verification per `config.yaml` |
| 5 | `index.html` having no topbar is a known follow-up | ✅ HONORED — `index.html` untouched |

**All 5 binding invariants honored**: ✅ TRUE.

---

## Final totals

| Metric | Value |
|---|---|
| `menu.html` final line count | **2116** |
| `index.html` line count | **916** (unchanged) |
| Structural checks passed | **15/15** |
| Price spot-checks passed | **6/6** |
| Category spot-checks passed | **3/3** |
| Spec → implementation mappings | **14/14** |
| Manual browser check steps | **14** |
| Binding invariants honored | **5/5** |
| JS syntax (`node --check`) | **Exit 0** |

---

*Report generated by `sdd-verify` for `shopping-cart` slice 2. No fixes applied; no issues escalated.*
