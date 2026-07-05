# Archive Report: shopping-cart

**Date**: 2026-07-04
**Executor**: sdd-archive

---

## Change

| Field | Value |
|---|---|
| Name | `shopping-cart` |
| Intent | Replace 32 dead "Order" links on `menu.html` with a functional slide-over cart — DOM-derived catalog, integer-cents money, localStorage persistence, accessibility-supported drawer |
| Owner | orchestrator-initiated, executor-implemented |
| Final state | **COMPLETED** — both slices applied and verified; delta specs synced to main specs; change closed |

## Phases completed

| Phase | Outcome |
|---|---|
| **init** | SDD context initialized; openspec artifact store configured; binding invariants established |
| **explore** | Codebase investigated; 32-item inventory taken; approaches compared (state model, UI placement, event handling, catalog source); exploration artifact written |
| **propose** | Intent, scope (in/out), approach decisions, user-facing behavior, risks, success criteria, and 5 binding invariants documented |
| **spec** | Two delta specs authored: `cart` (18 requirements, 13 scenarios) and `menu-catalog` (8 requirements, 4 scenarios). RFC 2119 keywords + Given/When/Then structure |
| **design** | Full technical design: data shapes (`bp-cart-v1`, `CatalogItem`), module structure (5 IIFEs + app init), DOM diff plan (32 rows), drawer markup, topbar indicator, money math, z-index layering, focus trap, migration hooks, failure modes, delivery split into chained slices |
| **tasks** | 16 tasks across 2 slices defined: slice 1 (tasks 1.1–1.7, UI shell), slice 2 (tasks 2.1–2.9, state + behaviour). Dependencies, rollback plans, and reviewer checklists documented |
| **apply (slice-1)** | UI shell applied: CSS additions, topbar indicator markup, drawer DOM, drawer open/close/focus-trap/scroll-lock module. Post-verify `aria-expanded` runtime patch applied |
| **verify (slice-1)** | **VERIFIED** — 13/13 structural checks PASS. Manual browser checklist (10 steps) defined. No slice-2 markers present |
| **apply (slice-2)** | Behaviour layer applied: `data-*` attributes on all 32 cards, `<a>`→`<button>` conversions, `money`/`catalog`/`storage`/`cart`/`app` IIFEs, badge + drawer rendering wiring |
| **verify (slice-2)** | **VERIFIED** — 15/15 structural checks PASS, 6/6 price spot-checks PASS, 3/3 category spot-checks PASS, 14/14 spec→implementation mappings, 5/5 invariants honored, `node --check` exit 0 |
| **archive** | Delta specs synced to `openspec/specs/`; archive report written; Engram cross-session state persisted |

## Artifacts created

### Under `openspec/changes/shopping-cart/`

| Path | Type | Description |
|---|---|---|
| `proposal.md` | Specification | Intent, scope, approach, invariants (102 lines) |
| `explore.md` | Exploration | 32-item inventory, comparative approaches, 10 gotchas (253 lines) |
| `specs/cart/spec.md` | Delta spec | Cart capability: 18 requirements, 13 scenarios (168 lines) |
| `specs/menu-catalog/spec.md` | Delta spec | Menu-catalog capability: 8 requirements, 4 scenarios (91 lines) |
| `design.md` | Design | Full technical design: data shapes, modules, DOM diff, markup, money math, z-index, accessibility, failure modes, delivery split (701 lines) |
| `tasks.md` | Tasks | 16 tasks across 2 slices: dependencies, rollback plans, review checklists (1018 lines) |
| `verify-report-slice-1.md` | Verify report | 13/13 structural checks PASS, manual checklist (257 lines) |
| `verify-report-slice-2.md` | Verify report | 15/15 structural PASS, 6/6 price PASS, 3/3 category PASS, 14/14 spec→implementation (175 lines) |
| `archive-report.md` | Archive report | This file — final closeout of the change |

### Under `openspec/specs/`

| Path | Type | Description |
|---|---|---|
| `cart/spec.md` | Main spec (synced) | Canonical spec for `cart` capability — future changes will `modify` this file |
| `menu-catalog/spec.md` | Main spec (synced) | Canonical spec for `menu-catalog` capability — future changes will `modify` this file |

## Source changes

Only one file was modified: `burger-site-draft/menu.html`.

| Metric | Before | After | Delta |
|---|---|---|---|
| Lines | 1378 | 2116 | +738 |
| CSS additions | — | ~150 lines (drawer + badge + scroll lock + reduced motion) | +150 |
| DOM markup additions | — | ~50 lines (topbar indicator + drawer block) | +50 |
| DOM markup modifications | — | 32 `<a>` → `<button>` conversions + 192 attribute insertions | +224 line edits |
| Inline JS additions | — | ~300 lines (5 IIFEs + app init + wiring) | +300 |
| Inline JS modifications | — | aria-expanded runtime flip in `open()`/`close()` | +2 lines |
| Existing scripts modified | 0 | 0 | +0 |
| External assets introduced | 0 | 0 | +0 |
| Build tools introduced | 0 | 0 | +0 |
| Test runner added | 0 | 0 | +0 |

All code stays inline: CSS in `<style>`, JS in `<script>`. No external files, no build pipeline.

## Spec capabilities added

### `cart`

**Summary**: Client-side shopping cart with slide-over drawer, quantity management (add/increment/decrement/remove), integer-cents subtotals rendered via `Intl.NumberFormat`, localStorage persistence under versioned key `bp-cart-v1` with in-memory fallback, and accessibility support (focus trap, `aria-expanded`, `aria-live`, ESC close, backdrop close, scroll lock).

**Main spec**: `openspec/specs/cart/spec.md` — 18 requirements, 13 Given/When/Then scenarios.

### `menu-catalog`

**Summary**: DOM-derived item index that reads `data-*` attributes from 32 `<article class="item">` cards and exposes them as a frozen `Map<id, CatalogItem>`. The HTML is the single source of truth — no hardcoded JS catalog. Missing/malformed attributes are skipped with `console.warn`.

**Main spec**: `openspec/specs/menu-catalog/spec.md` — 8 requirements, 4 Given/When/Then scenarios.

## Invariants honored

| # | Invariant | Status |
|---|---|---|
| 1 | `burger-site-draft/index.html` MUST NOT be modified | ✅ HONORED — 916 lines, unchanged |
| 2 | No external JS or CSS files added — all code stays inline in `menu.html` | ✅ HONORED — only Google Fonts CDN + Unsplash pre-existing |
| 3 | No build tools introduced | ✅ HONORED — zero build tooling |
| 4 | No automated test runner added | ✅ HONORED — manual verification per `openspec/config.yaml` |
| 5 | `index.html` having no topbar is a known follow-up, not a blocker | ✅ HONORED — `index.html` untouched |

## Verification summary

### Slice 1 (UI shell)

| Metric | Value |
|---|---|
| Verdict | **VERIFIED** |
| Structural checks | 13/13 PASS |
| CSS classes added (cart-*) | 24 selectors |
| `data-cart-*` attributes | 9 distinct |
| Slice-2 markers found | 0 |
| Existing scripts modified | 0 |
| z-index contract (40/50/55/60) | PASS |
| Node syntax check | PASS |

### Slice 2 (state + behaviour)

| Metric | Value |
|---|---|
| Verdict | **VERIFIED** |
| Structural checks | 15/15 PASS |
| Price spot-checks | 6/6 PASS |
| Category spot-checks | 3/3 PASS |
| Spec→implementation mappings | 14/14 |
| Binding invariants | 5/5 HONORED |
| Node syntax check | Exit 0 |
| Manual browser check steps | 14 |

### Price integrity (spot-checks)

| Card | data-price | Expected | Status |
|---|---|---|---|
| lt:smokehouse-smash | 1095 | 1095 | ✅ |
| burgers:classic | 895 | 895 | ✅ |
| burgers:double-stack | 1150 | 1150 | ✅ |
| chicken:chicken-tenders | 925 | 925 | ✅ |
| sides:hand-cut-fries | 395 | 395 | ✅ |
| shakes:cookies-cream | 625 | 625 | ✅ |

### Category integrity (spot-checks)

| Card | data-category | Expected | Status |
|---|---|---|---|
| Smokehouse Smash | lt | lt | ✅ |
| Kids' Burger | kids | kids | ✅ |
| Cookies & Cream | shakes | shakes | ✅ |

## Known follow-ups (not defects)

| # | Item | Severity | Notes |
|---|---|---|---|
| 1 | **Badge show-animation** | Cosmetic | `.topbar__cart-count` toggles `display: none` → `display: ''` with no transition. Could use `opacity` + `visibility` with a 200ms transition for a smoother appearance. Non-blocking — no functional impact. |
| 2 | **`cartDrawer` not exposed on `window.__bpCart`** | DevTools nicety | The drawer module (`cartDrawer`) is not on `window.__bpCart` (only `catalog`, `cart`, `money`, `storage` are). Verify-phase developers can inspect via `document.querySelector('[data-cart-drawer]')` or the `cartDrawer` variable directly. Low priority. |
| 3 | **`aria-label` fallback on drawer panel** | Accessibility | The `<aside>` has `aria-labelledby="cart-drawer-title"` pointing to the `<h2>`. Some AT combinations may not announce the title unless `aria-label` is also present on the dialog element. Spec-compliant as-is; add `aria-label="Shopping cart"` if AT testing shows gaps. |
| 4 | **`index.html` has no topbar** | Structural | The global cart badge currently lives only in `menu.html`. A follow-up change to `index.html` would be needed to surface the badge site-wide. localStorage persistence (`bp-cart-v1`) is already designed for this — no storage rewrite needed. |
| 5 | **Checkout / payment flow** | Feature | The cart is transactional but has no checkout. User-facing message says "Taxes and pickup time calculated at checkout." A subsequent change to introduce a checkout modal or dedicated page is the natural next step. |
| 6 | **`app.init()` does not call `cartDrawer.mount()`** | Documentation | The drawer mount already happens at line 1761 via a separate `DOMContentLoaded` handler. The `app.init()` sequence (slice 2) does not re-mount it — this is correct but may confuse a future reader. |

## Manual browser checks left for human

The following 14-step manual checklist must be run in a browser before considering the change complete in your own workflow:

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

## Migration hooks for v2

The storage module contains a `migrate(parsed)` function in the `storage` IIFE that serves as the single hook point for future schema changes:

```js
function migrate(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed;
  if (parsed.v === 1) return parsed;
  // Future: if (parsed.v === 2) return upgradeFromV1(parsed);
  return parsed;
}
```

**Contract**: Any future change that alters the `bp-cart-v1` shape (new fields, different structure) MUST:
1. Introduce a new storage key `bp-cart-v2` (not overwrite `bp-cart-v1`).
2. Add a migration branch in `migrate()` that reads `bp-cart-v1` data and upgrades it to the v2 shape.
3. The migration MUST be read-only on the v1 key — never delete v1 data until the application has confirmed all users have been migrated.
4. Set `data-id` values must remain category-qualified (e.g. `burgers:classic`); any change to the id format MUST include a reindex migration.

The `migrate(parsed)` function is called on every `storage.read()` before validation, so migration runs automatically on page load.

## Rollback plan

### Slice 1 rollback (UI shell)

1. Delete the CSS block added in task 1.1 (`.topbar__actions`, `.topbar__cart`, `.topbar__cart-count`, `.cart-drawer*` selectors and all associated rules).
2. Delete the topbar indicator markup (the `<div class="topbar__actions">` wrapper and its children). Restore the original `<a class="btn btn--ghost">` as a direct child of `.topbar__inner`.
3. Delete the entire `<aside class="cart-drawer">` drawer markup block.
4. Delete the `cartDrawer` IIFE and its `cartDrawer.mount()` call from the script block.
5. Delete the verification comment blocks.

**Result**: `menu.html` returns to its exact pre-Slice-1 state. No visual or behavioural change remains.

### Slice 2 rollback (state + behaviour)

1. Delete the `money`, `catalog`, `storage`, `cart`, and `app` IIFEs from the script block.
2. Restore all 32 `<button type="button" class="btn btn--primary item__order" data-add="…">Add</button>` back to `<a class="btn btn--primary item__order" href="index.html#locations">Order</a>`.
3. Remove `data-id`, `data-name`, `data-price`, `data-category`, `data-cal`, and `data-img` from all 32 `<article class="item">` elements.
4. Delete the slice 2 verification comment block.

**Note**: Slice 1 remains applied — the drawer DOM and CSS persist but are inert (all `data-cart-*` buttons exist but do nothing). Either slice can be reverted independently without leaving the codebase in a broken state.
