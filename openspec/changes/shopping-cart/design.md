# Design: Shopping Cart (menu page)

> Change: `shopping-cart` · Phase: design · Artifact store: openspec
> Bound to `proposal.md` and the two delta specs (`specs/cart/spec.md`, `specs/menu-catalog/spec.md`). This design is read-only on source files; it does NOT touch `burger-site-draft/menu.html` or `index.html`.

## Summary

This design implements the cart on a single file: `burger-site-draft/menu.html`. The 32 dead "Order" anchors become `<button>` triggers backed by a vanilla-JS cart module inlined at the bottom of the file. State lives in `localStorage` under `bp-cart-v1` with an in-memory fallback for storage-disabled browsers. The catalog is read from new `data-*` attributes on each `<article class="item">`, so the markup stays the single source of truth. The UI is a right-side slide-over drawer with a topbar badge; accessibility (focus trap, `aria-expanded`, `aria-live`, ESC, backdrop click, scroll lock) is built into the module, not bolted on. Cross-tab sync rides the native `storage` event. This design honors every binding invariant: `index.html` is untouched, no external files, no build tools, no test runner.

## File-level changes

A single file is affected: `burger-site-draft/menu.html`. The HTML/inline-CSS/inline-JS structure already in the file is preserved; only additive and targeted edits are made.

### Inline CSS additions

Insert a new CSS block at the bottom of the existing `<style>` element (right after line 429, the last `@media` rule, before `</style>` on line 430). Approximate size: ~150 lines. Naming follows the existing BEM-ish convention already used in `menu.html` (`topbar__inner`, `btn btn--primary`, `cat-nav__pill`).

New selectors, grouped by concern:

- **Topbar indicator**
  - `.topbar__actions` — flex container placed between `.topbar__logo` and the existing "Back to Home" button, providing a stable right-side slot.
  - `.topbar__cart` — the toggle button (icon button, ghost styling to match the back link).
  - `.topbar__cart-count` — the small numeric badge anchored to the top-right of the icon.
- **Drawer**
  - `.cart-drawer` — root that owns `position: fixed; inset: 0; z-index: 60;` and is `pointer-events: none` when closed.
  - `.cart-drawer[aria-hidden="false"]` — re-enables `pointer-events: auto` and slides the panel in.
  - `.cart-drawer__backdrop` — full-viewport dim layer, `z-index: 55`, semi-transparent black with a fade transition.
  - `.cart-drawer__panel` — the right-side panel: `position: fixed; inset: 0 0 0 auto; width: min(420px, 92vw); z-index: 60;`.
  - `.cart-drawer__head`, `.cart-drawer__title`, `.cart-drawer__close` — header row.
  - `.cart-drawer__body` — scrollable middle region, `aria-live="polite"`.
  - `.cart-drawer__empty` — empty-state block (hidden by default, shown when `lines` is empty).
  - `.cart-drawer__list` — list of cart lines.
  - `.cart-drawer__line` — one row: image thumb, name, unit price, qty controls, line subtotal.
  - `.cart-drawer__qty` — `<div>` wrapper around `+` / `−` / numeric readout.
  - `.cart-drawer__qty-btn` — `+` / `−` buttons (circular, ghost).
  - `.cart-drawer__remove` — small `×` button at the row's right edge.
  - `.cart-drawer__foot` — pinned footer with cart subtotal.
- **Body scroll lock**
  - `body.is-cart-open` — applied imperatively on open, removes on close; sets `overflow: hidden;` and a `scrollbar-gutter: stable;` fallback.
- **Transitions**
  - `@media (prefers-reduced-motion: reduce)` block disables the panel slide and the backdrop fade for users who request reduced motion.

No new `:root` tokens. New colors come from existing CSS variables (`--color-primary`, `--color-ink`, `--color-bg-soft`, `--color-line`). One new literal is allowed and justified below: a translucent `rgba(0,0,0,0.45)` for the backdrop, mirroring the existing `rgba(0,0,0,0.06)` / `rgba(0,0,0,0.10)` shadow tokens.

### Inline CSS modifications

Minimal. The existing `.topbar__inner` uses `justify-content: space-between` and currently has exactly two children (logo + back link). Adding a third child (the cart toggle) will keep the layout coherent because the cart sits as the second child and the back link slides to the rightmost slot. To guarantee spacing between the back link and the new toggle:

- **Targeted edit**: inside `.topbar__inner` (around line 128–132), no rule changes are needed. The `.topbar__actions` wrapper (added above) carries `display: flex; align-items: center; gap: 12px;` to group the toggle + back link on the right.
- No change to `.topbar` itself: `z-index: 50`, `position: sticky; top: 0;` remain.
- No change to `.cat-nav`: `z-index: 40`, `position: sticky; top: 72px;` remain.
- No change to `html { scroll-behavior: smooth; scroll-padding-top: 140px; }` — the drawer's scroll lock does not affect anchor jumps when the drawer is closed.

### DOM markup additions

Two new blocks are inserted into `<body>`.

1. **Topbar indicator block** — inserted inside `.topbar__inner` (currently lines 436–440), after the existing `<a class="btn btn--ghost" href="index.html">← Back to Home</a>` element. Final order in `.topbar__inner`: logo · actions-wrapper · (back link + cart toggle). The wrapper allows the existing back link to stay at the far right while the cart toggle sits immediately to its left. See `## Topbar indicator markup` for the literal HTML.
2. **Drawer block** — inserted immediately after the closing `</footer>` tag (line 1331), before the existing `<script>` block (line 1334). A sibling of `<footer>`, not a child. See `## Drawer markup` for the literal HTML.

### DOM markup modifications

- **All 32 `<article class="item">` elements**: add six `data-*` attributes per card (`data-id`, `data-name`, `data-price`, `data-category`, `data-cal`, `data-img`). Total: 32 × 6 = 192 attribute insertions, distributed across lines 493–1251. The exact values are in `## DOM diff plan`.
- **All 32 `<a class="btn btn--primary item__order" href="index.html#locations">Order</a>` elements**: convert each into a `<button type="button" class="btn btn--primary item__order" data-add="<id>">Add</button>`. The `id` in `data-add` MUST equal the parent `<article class="item">`'s `data-id`. The class list is preserved exactly so the existing `.btn--primary` and `.item__order` styles keep working without any CSS edit.
- **Topbar inner restructure**: wrap the existing "Back to Home" anchor in `<div class="topbar__actions">` so the cart toggle and the back link can sit side-by-side without affecting the existing layout. No anchor removed.

### Inline script additions

One new IIFE block appended to the existing `<script>` element (after line 1374, the closing `})();` of the cat-nav scroll handler, before `</script>` on line 1375). Approximate size: ~300 lines, organized into nested IIFEs by concern. See `## Module structure (single inline script)` for the layout.

### Inline script modifications

None. The existing two blocks (`[data-year]` footer year at lines 1335–1338, and the cat-nav IntersectionObserver IIFE at lines 1341–1374) stay exactly as written. The new module loads after both, registers a `DOMContentLoaded` handler that initializes the cart (only if `document.readyState` is not already `interactive`/`complete`), and otherwise initializes inline.

## Data shapes

### Cart payload (`bp-cart-v1` value)

```typescript
// Persisted under localStorage key "bp-cart-v1".
// Schema version is encoded in the key suffix (v1).
// Any shape change MUST introduce bp-cart-v2 + a migrate() hook.
type CartV1 = {
  v: 1;                              // schema version (mirrors the key suffix)
  lines: Record<ItemId, { qty: number }>;
  updatedAt: number;                 // Date.now() at the last mutation
};

type ItemId = `${Category}:${string}`; // category-qualified, e.g. "burgers:classic"
// Allowed Category values: "lt" | "burgers" | "chicken" | "bowls"
//                          | "sides" | "kids" | "shakes" | "drinks"
```

JSON example on disk (pretty-printed for readability; the module writes it compacted):

```json
{
  "v": 1,
  "lines": {
    "burgers:classic": { "qty": 2 },
    "sides:cheese-fries": { "qty": 1 }
  },
  "updatedAt": 1720000000000
}
```

Invariants on read:

- `parsed.v` MUST equal `1`; otherwise the value is treated as foreign and discarded.
- `parsed.lines` MUST be a plain object; values MUST be `{ qty: number }` with `qty > 0` integer.
- Anything else → log a single `console.warn` ("bp-cart-v1: malformed payload, resetting") and start with `{ v: 1, lines: {}, updatedAt: 0 }`.

### Catalog entry (`Map<id, item>` value)

```typescript
type Category =
  | "lt" | "burgers" | "chicken" | "bowls"
  | "sides" | "kids" | "shakes" | "drinks";

type CatalogItem = {
  id: ItemId;                        // category-qualified, e.g. "burgers:classic"
  name: string;                      // exact text from <h3 class="item__name">
  priceCents: number;                // integer, positive; e.g. 895 for $8.95
  category: Category;                // one of the 8 allowed values
  cal: string;                       // raw text from <span class="item__cal">, e.g. "820 cal"
  img: string;                       // exact <img src> value, full URL with query string
};

// The catalog is a Map<ItemId, CatalogItem>; items are frozen on insert
// so consumers cannot mutate them. Updates only happen via reindex().
```

Map on disk is the in-memory `Map` keyed by `data-id`. Frozen object snapshot example:

```json
{
  "id": "burgers:classic",
  "name": "The Classic",
  "priceCents": 895,
  "category": "burgers",
  "cal": "640 cal",
  "img": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=80&auto=format&fit=crop"
}
```

## Module structure (single inline script)

The new module is appended to the existing `<script>` element after the cat-nav IIFE. Layout:

```
<script>
  /* existing footer year */              (kept)
  /* existing cat-nav IntersectionObserver IIFE */   (kept)

  /* NEW: cart module */
  (function () {                          // outer IIFE — cart module
    'use strict';

    // ---------- catalog IIFE ----------
    const catalog = (function () { ... })();   // exposes { reindex, get, size, has }

    // ---------- money utils ----------
    const money = (function () { ... })();     // exposes { format, STORAGE_KEY }

    // ---------- storage IIFE ----------
    const storage = (function () { ... })();   // exposes { read, write, available, onChange }

    // ---------- cart IIFE ----------
    const cart = (function () { ... })();      // exposes { addItem, inc, dec, remove,
                                               //           clear, lines, count, subtotal,
                                               //           subscribe }

    // ---------- drawer IIFE ----------
    const drawer = (function () { ... })();    // exposes { open, close, isOpen, focusables }

    // ---------- app (init + wiring) IIFE ----------
    const app = (function () { ... })();       // runs on DOMContentLoaded

    // Expose a small window.* surface for manual inspection
    window.__bpCart = { catalog, cart, money, storage, drawer };
  })();
</script>
```

Public vs internal:

- **Public on `window.__bpCart`**: `catalog`, `cart`, `money`, `storage`, `drawer`. Exists purely for manual inspection in DevTools and for the verify phase's manual script; no other code reads it.
- **Internal**: every helper that doesn't need to be poked at (`parsePrice`, `parseIntStrict`, `escapeHtml`, `queryFocusables`, `applyScrollLock`, `restoreScroll`, `reindex`, etc.).
- **No globals** beyond `window.__bpCart`. The existing inline scripts (footer year, cat-nav observer) do not touch cart state.

Init sequence (registered on `DOMContentLoaded`):

1. `storage.detect()` — runs `try { localStorage.setItem('__bp_probe','1'); localStorage.removeItem('__bp_probe'); return true; } catch (e) { return false; }`. Caches the result in `storage.available`.
2. `catalog.reindex()` — walks `.menu-grid .item`, validates attributes, fills the Map.
3. `cart.hydrate()` — reads `bp-cart-v1` (if `storage.available`) or starts empty; broadcasts an initial `update` event so the badge and drawer (if open) reflect the state.
4. `drawer.mount()` — wires `[data-cart-toggle]`, `[data-cart-close]`, backdrop click, ESC key, focus trap.
5. `app.wireAddButtons()` — scoped click delegation on each `.menu-grid` element (`document.querySelectorAll('.menu-grid').forEach(g => g.addEventListener('click', ...))`).
6. `app.wireStorageSync()` — `window.addEventListener('storage', e => { if (e.key === 'bp-cart-v1') cart.hydrate(); })`.

Event wiring summary:

- **Click delegation on each `.menu-grid`**: catches `.item__order` clicks, reads `data-add`, calls `cart.addItem(id)` if `catalog.has(id)`.
- **Click on `[data-cart-toggle]`**: calls `drawer.open()`.
- **Click on `[data-cart-close]` and on `.cart-drawer__backdrop`**: both call `drawer.close()`.
- **Keydown on `document` while drawer is open**: ESC → `drawer.close()`; Tab/Shift+Tab → focus trap.
- **`storage` event on `window`**: `bp-cart-v1` writes in another tab → `cart.hydrate()`.
- **Cart internal subscribers**: badge updates (`updateBadge`) and drawer render (`renderDrawer`) subscribe to a tiny pub/sub implemented inside the `cart` IIFE.

## DOM diff plan

Single source of truth for the 32 `<article class="item">` edits. Each row also dictates the `<button>` `data-add` value (which MUST equal the `<article>`'s `data-id`).

| # | Category | Current name | Slug | `data-id` | `data-price` (cents) | `data-cal` | `data-img` (truncated, full URL goes in `data-img`) |
|---|---|---|---|---|---|---|---|
| 1 | Limited Time | Smokehouse Smash | smokehouse-smash | `lt:smokehouse-smash` | 1095 | `820 cal` | `photo-1565299624946-b28f40a0ae38?w=800…` |
| 2 | Limited Time | Nashville Hot Chicken | nashville-hot-chicken | `lt:nashville-hot-chicken` | 995 | `740 cal` | `photo-1606755962773-d324e0a13086?w=800…` |
| 3 | Limited Time | Berry Lemonade | berry-lemonade | `lt:berry-lemonade` | 425 | `180 cal` | `photo-1437418747212-8d9709afab22?w=800…` |
| 4 | Burgers | The Classic | classic | `burgers:classic` | 895 | `640 cal` | `photo-1568901346375-23c9450c58cd?w=800…` |
| 5 | Burgers | Bacon Cheeseburger | bacon-cheeseburger | `burgers:bacon-cheeseburger` | 1050 | `830 cal` | `photo-1551615593-ef5fe247e8f7?w=800…` |
| 6 | Burgers | Mushroom Swiss | mushroom-swiss | `burgers:mushroom-swiss` | 1025 | `760 cal` | `photo-1572802419224-296b0aeee0d9?w=800…` |
| 7 | Burgers | Spicy Southwest | spicy-southwest | `burgers:spicy-southwest` | 1095 | `880 cal` | `photo-1586190848861-99aa4a171e90?w=800…` |
| 8 | Burgers | The Double Stack | double-stack | `burgers:double-stack` | 1150 | `1010 cal` | `photo-1550317138-10000687a72b?w=800…` |
| 9 | Burgers | Garden Veggie | garden-veggie | `burgers:garden-veggie` | 950 | `520 cal` | `photo-1520072959219-c595dc870360?w=800…` |
| 10 | Chicken | Crispy Chicken Sandwich | crispy-chicken-sandwich | `chicken:crispy-chicken-sandwich` | 950 | `680 cal` | `photo-1606755456206-b25206cde27e?w=800…` |
| 11 | Chicken | Grilled Chicken Club | grilled-chicken-club | `chicken:grilled-chicken-club` | 1025 | `610 cal` | `photo-1539252554935-80e1e60bb3a3?w=800…` |
| 12 | Chicken | Chicken Tenders | chicken-tenders | `chicken:chicken-tenders` | 925 | `520 cal` | `photo-1612392062798-2bb6fcae7e4f?w=800…` |
| 13 | Chicken | Classic Hot Dog | classic-hot-dog | `chicken:classic-hot-dog` | 650 | `450 cal` | `photo-1612392061787-2d078b3e573a?w=800…` |
| 14 | Bowls | Cobb Salad | cobb-salad | `bowls:cobb-salad` | 1150 | `620 cal` | `photo-1546069901-ba9599a7e63c?w=800…` |
| 15 | Bowls | Classic Caesar | classic-caesar | `bowls:classic-caesar` | 995 | `420 cal` | `photo-1551248429-40975aa4de74?w=800…` |
| 16 | Bowls | Build-Your-Own Bowl | build-your-own-bowl | `bowls:build-your-own-bowl` | 1095 | `Varies` | `photo-1543339308-43e59d6b73a6?w=800…` |
| 17 | Sides | Hand-Cut Fries | hand-cut-fries | `sides:hand-cut-fries` | 395 | `320 cal` | `photo-1573080496219-bb080dd4f877?w=800…` |
| 18 | Sides | Cheese Fries | cheese-fries | `sides:cheese-fries` | 550 | `510 cal` | `photo-1585109649139-366815a0d713?w=800…` |
| 19 | Sides | Onion Rings | onion-rings | `sides:onion-rings` | 495 | `430 cal` | `photo-1639024471283-03518883512d?w=800…` |
| 20 | Sides | Mozzarella Sticks | mozzarella-sticks | `sides:mozzarella-sticks` | 625 | `480 cal` | `photo-1626082927389-6cd097cdc6ec?w=800…` |
| 21 | Kids | Kids' Burger | burger | `kids:burger` | 695 | `380 cal` | `photo-1550317138-10000687a72b?w=800…` |
| 22 | Kids | Kids' Tenders | tenders | `kids:tenders` | 695 | `340 cal` | `photo-1562967914-608f82629710?w=800…` |
| 23 | Kids | Grilled Cheese | grilled-cheese | `kids:grilled-cheese` | 595 | `320 cal` | `photo-1528735602780-2552fd46c7af?w=800…` |
| 24 | Shakes | Classic Vanilla | classic-vanilla | `shakes:classic-vanilla` | 595 | `580 cal` | `photo-1568901346375-23c9450c58cd?w=800…&sat=-100` |
| 25 | Shakes | Chocolate | chocolate | `shakes:chocolate` | 595 | `620 cal` | `photo-1572490122747-3968b75cc699?w=800…` |
| 26 | Shakes | Strawberry | strawberry | `shakes:strawberry` | 595 | `540 cal` | `photo-1626078436980-fc4d4d9d6efd?w=800…` |
| 27 | Shakes | Cookies & Cream | cookies-cream | `shakes:cookies-cream` | 625 | `660 cal` | `photo-1563805042-7684c019e1cb?w=800…` |
| 28 | Shakes | Salted Caramel | salted-caramel | `shakes:salted-caramel` | 650 | `700 cal` | `photo-1560008581-09826d1de69e?w=800…` |
| 29 | Drinks | Fountain Soda | fountain-soda | `drinks:fountain-soda` | 295 | `0–310 cal` | `photo-1581636625402-29b2a704ef13?w=800…` |
| 30 | Drinks | Fresh-Brewed Iced Tea | fresh-brewed-iced-tea | `drinks:fresh-brewed-iced-tea` | 295 | `5 cal` | `photo-1556679343-c7306c1976bc?w=800…` |
| 31 | Drinks | Lemonade | lemonade | `drinks:lemonade` | 350 | `220 cal` | `photo-1437418747212-8d9709afab22?w=800…` |
| 32 | Drinks | Bottled Water | bottled-water | `drinks:bottled-water` | 225 | `0 cal` | `photo-1564419320461-6870880221ad?w=800…` |

Total rows: **32** (3 limited + 6 burgers + 4 chicken + 3 bowls + 4 sides + 3 kids + 5 shakes + 4 drinks).

Per-card `<button>` change (uniform for all 32):

```html
<!-- BEFORE (one example of the 32) -->
<a class="btn btn--primary item__order" href="index.html#locations">Order</a>

<!-- AFTER (substitute the data-add value per the table above) -->
<button type="button" class="btn btn--primary item__order" data-add="burgers:classic">Add</button>
```

Button label MUST be `Add` (matches the cart semantics; "Order" implied checkout, which is out of scope). The catalog's `data-id` MUST equal the button's `data-add` value — this is a hard contract that `sdd-apply` must verify per row.

## Drawer markup

Injected as a sibling of `<footer>`, immediately before the existing `<script>` block. Uses semantic `<aside>` with `role="dialog"` and `aria-labelledby` pointing at the panel title. Body region has `aria-live="polite"`. Empty-state element is always present and toggled via `hidden` attribute.

```html
<aside
  class="cart-drawer"
  id="cart-drawer"
  role="dialog"
  aria-modal="true"
  aria-labelledby="cart-drawer-title"
  aria-hidden="true"
  data-cart-drawer
>
  <div class="cart-drawer__backdrop" data-cart-close aria-hidden="true"></div>

  <div class="cart-drawer__panel" role="document">
    <header class="cart-drawer__head">
      <h2 class="cart-drawer__title" id="cart-drawer-title">Your Cart</h2>
      <button
        type="button"
        class="cart-drawer__close"
        data-cart-close
        aria-label="Close cart"
      >
        <!-- × glyph; keep it text-only to avoid an extra SVG payload -->
        ×
      </button>
    </header>

    <div class="cart-drawer__body" data-cart-body aria-live="polite">
      <!-- Empty-state: always present; shown only when lines is empty -->
      <div class="cart-drawer__empty" data-cart-empty>
        <p class="cart-drawer__empty-title">Your cart is empty</p>
        <p class="cart-drawer__empty-sub">
          Add something from the menu to get started.
        </p>
        <a class="btn btn--primary" href="#limited" data-cart-close>
          Browse menu
        </a>
      </div>

      <!-- Line list: rendered/updated by the cart module on every state change -->
      <ul class="cart-drawer__list" data-cart-list hidden></ul>
    </div>

    <footer class="cart-drawer__foot" data-cart-foot hidden>
      <div class="cart-drawer__subtotal-row">
        <span class="cart-drawer__subtotal-label">Subtotal</span>
        <span class="cart-drawer__subtotal" data-cart-subtotal>$0.00</span>
      </div>
      <p class="cart-drawer__subtotal-note">
        Taxes and pickup time calculated at checkout.
      </p>
    </footer>
  </div>
</aside>
```

No `<template>` is used. The panel markup is in the document at load time and the `cart` module populates the line list (`<ul data-cart-list>`) imperatively. This keeps the markup grep-friendly and avoids the `<template>` content-cloning branch on every render.

## Topbar indicator markup

Inserted inside `.topbar__inner` (currently lines 436–440). Wraps the existing "Back to Home" anchor in a new `<div class="topbar__actions">` so the cart toggle can sit to its left without disturbing the existing layout (`.topbar__inner` keeps `justify-content: space-between`).

```html
<header class="topbar">
  <div class="container topbar__inner">
    <a class="topbar__logo" href="index.html">Burger<span>.</span>Place</a>

    <div class="topbar__actions">
      <!-- NEW: cart toggle. Renders as a 40×40 icon button with a count badge. -->
      <button
        type="button"
        class="topbar__cart"
        data-cart-toggle
        aria-label="Open cart"
        aria-expanded="false"
        aria-controls="cart-drawer"
      >
        <svg
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <!-- Shopping bag: matches the existing footer SVG stroke style -->
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
        <span class="topbar__cart-count" data-cart-count aria-hidden="true">0</span>
      </button>

      <a class="btn btn--ghost" href="index.html">← Back to Home</a>
    </div>
  </div>
</header>
```

Notes:

- Inline SVG uses the same `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="2"`, `stroke-linecap="round"`, `stroke-linejoin="round"` recipe as the footer's Instagram / Facebook / Twitter / YouTube SVGs already in `menu.html`.
- The badge is a `<span>` (not a `<sup>` or pseudo-element) so screen readers can opt in via the parent's `aria-label` ("Open cart, 3 items") and the badge itself is `aria-hidden="true"` to avoid double-announcement.
- The toggle has `aria-expanded` toggled by the drawer module and `aria-controls` pointing to `#cart-drawer`.

## Money math implementation

- **Internal type**: integer (`number`) representing cents. `priceCents` is always a non-negative integer in `[0, 99999]`. Line subtotals are `priceCents * qty` and stay within safe-integer range for any realistic cart (32 items × $11.50 = $368 max single line; even pathological qty=1000 stays under 2^53).
- **`formatPrice(cents)` signature**:

```js
const money = (function () {
  // Cached at module load; never recreated per render.
  const formatter = (typeof Intl !== 'undefined' && Intl.NumberFormat)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
    : null;

  function formatPrice(cents) {
    const n = Number(cents) | 0; // force integer; negative allowed for refunds only
    if (formatter) {
      // Intl.NumberFormat expects dollars; divide by 100 with no rounding surprises
      return formatter.format(n / 100);
    }
    // SHOULD-grade fallback: '$' + 2-decimal format on integer cents
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    const dollars = Math.floor(abs / 100);
    const remainder = (abs % 100).toString().padStart(2, '0');
    return sign + '$' + dollars + '.' + remainder;
  }

  return { formatPrice };
})();
```

- **Worked examples** (these are the contract; `sdd-verify` will run them in DevTools):
  - `formatPrice(895)` → `"$8.95"`
  - `formatPrice(0)` → `"$0.00"`
  - `formatPrice(-50)` → `"-$0.50"` (a defensive test only — see below)
- **No negative subtotals**: the cart NEVER allows a negative subtotal. The decrement step is guarded: `if (currentQty <= 1) { remove line; } else { dec; }`. `formatPrice` accepts negatives only as a defensive convenience for future promo / refund work; the cart itself never produces them.

## z-index layering plan

| Layer | Element | z-index | Position | Note |
|---|---|---|---|---|
| 1 | `.cat-nav` | 40 | sticky, `top: 72px` | unchanged |
| 2 | `.topbar` | 50 | sticky, `top: 0` | unchanged |
| 3 | `.cart-drawer__backdrop` (new) | 55 | fixed, `inset: 0` | sits between topbar and panel; covers the page but is itself covered by the panel |
| 4 | `.cart-drawer__panel` (new) | 60 | fixed, `inset: 0 0 0 auto; width: min(420px, 92vw);` | fully covers the right edge, including the topbar's right portion |

CSS-stacking-context note: backdrop and panel are BOTH `position: fixed;` siblings inside `.cart-drawer`. They share the same containing block (the viewport) and the same stacking context (the root). Their `z-index` values compare directly: `55 < 60`, so the panel always paints on top of the backdrop.

The drawer as a whole sits inside `<body>` (not inside `.topbar`), so its `z-index` is not nested. This avoids the silent-elevation bug where a fixed-positioned element inside a transformed / filtered / sticky ancestor ends up in a higher stacking context than its `z-index` value would suggest.

Contract: any future change to `.topbar` or `.cat-nav` z-index MUST re-verify `60 > topbar_z > cat_nav_z`. If the topbar ever moves to a higher z-index, the panel value moves with it (no fewer than 5 levels above the topbar).

## Focus trap implementation

On `drawer.open()`:

1. Capture `const previouslyFocused = document.activeElement;` and store on the drawer IIFE.
2. Set `aria-hidden="false"` on `.cart-drawer` (and trigger the slide-in transition).
3. Query focusable descendants of `.cart-drawer__panel`:

```js
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function queryFocusables(panel) {
  return Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);
}
```

4. If `focusables.length > 0`, focus the first one; otherwise focus the panel itself (`panel.tabIndex = -1; panel.focus();`).
5. Register a `keydown` listener on the panel (or `document`, filtered by `e.target`):

```js
function onKeydown(e) {
  if (e.key === 'Escape') { e.preventDefault(); drawer.close(); return; }
  if (e.key !== 'Tab') return;
  const f = queryFocusables(panel);
  if (f.length === 0) { e.preventDefault(); panel.focus(); return; }
  const first = f[0], last = f[f.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || !panel.contains(active))) {
    e.preventDefault(); last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault(); first.focus();
  }
}
```

On `drawer.close()`:

1. Set `aria-hidden="true"` on `.cart-drawer` (triggers slide-out transition).
2. Remove the `keydown` listener.
3. Restore focus: `if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();` (guarded because the captured element could be gone if the DOM mutated during the open session).
4. Body scroll-lock class removed; `scrollY` restored to the pre-open value.

ESC, backdrop click, and the close `×` button all call the same `drawer.close()` path; no divergence.

## Storage and migration plan

```js
const storage = (function () {
  const STORAGE_KEY = 'bp-cart-v1';
  const SCHEMA_VERSION = 1;
  let available = false;
  let onChange = null;

  function detect() {
    try {
      const k = '__bp_probe__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      available = true;
    } catch (e) {
      available = false;
    }
    return available;
  }

  function read() {
    if (!available) return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const migrated = migrate(parsed);
      if (!validate(migrated)) {
        console.warn('bp-cart-v1: malformed payload, resetting');
        return null;
      }
      return migrated;
    } catch (e) {
      console.warn('bp-cart-v1: parse error, resetting');
      return null;
    }
  }

  function write(state) {
    if (!available) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // quota or storage disabled mid-session; swallow
    }
  }

  // v1 only. v2+ must read v1, upgrade, then write v2.
  function migrate(parsed) {
    if (!parsed || typeof parsed !== 'object') return parsed;
    if (parsed.v === 1) return parsed;
    // Future: if (parsed.v === 0) return upgradeFromV0(parsed);
    return parsed;
  }

  function validate(state) {
    if (!state || state.v !== SCHEMA_VERSION) return false;
    if (!state.lines || typeof state.lines !== 'object') return false;
    for (const k of Object.keys(state.lines)) {
      const line = state.lines[k];
      if (!line || typeof line.qty !== 'number' || line.qty <= 0) return false;
    }
    return true;
  }

  function attachChangeListener(fn) {
    onChange = fn;
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY && typeof onChange === 'function') onChange();
    });
  }

  return { detect, read, write, migrate, attachChangeListener,
           get available() { return available; },
           get STORAGE_KEY() { return STORAGE_KEY; } };
})();
```

Behavior:

- `storageAvailable` boolean checked once at module init via `storage.detect()`. After init, all reads/writes are gated by this boolean, never re-probed.
- Read path: `storage.read()` parses `bp-cart-v1`; on parse error or shape mismatch, logs a single `console.warn` and returns `null` (cart starts empty).
- Write path: `storage.write(state)` called on every cart state mutation (add, increment, decrement, remove, clear). The full cart object is serialized — there is no partial-write path.
- Storage event: `storage.attachChangeListener(() => cart.hydrate())` registered at app init. Re-reads only; never re-writes (avoid feedback loop with the originator tab).
- Migration hooks: `migrate(parsed)` is the single hook point. `v1` is the only version recognized today; `v2` would add a branch like `if (parsed.v === 1) return upgradeFromV1(parsed);`. The design MUST NOT silently drop foreign-version data; the rule is: read → migrate → validate → use. If validation fails AFTER migration, treat as malformed.

## Failure modes

| Spec failure scenario | Design response |
|---|---|
| `localStorage` disabled (private mode, quota exceeded) | `storage.detect()` returns `false`. `storage.read()`/`write()` are no-ops. Cart lives in `cart.lines` (in-memory); badge and drawer still work for the lifetime of the page. No uncaught errors reach the console. |
| Card missing `data-price` | Catalog `reindex()` parses `parseIntStrict(article.dataset.price, 10)`. If missing, malformed, or non-positive, the card is skipped and a single `console.warn('catalog: skipping card with missing data-price', text)` is emitted. The card's "Add" button click is a no-op (the click handler reads `data-add`, asks `catalog.has(id)`, and bails if false). |
| Card missing `data-id` | Same path: catalog skips with a `console.warn`. The button's `data-add` will be `undefined`; the click handler checks `e.target.closest('[data-add]')` and bails if absent. The card stays clickable but inert. |
| Two cards with the same `data-id` | Catalog's `reindex()` skips the second card, emits `console.warn('catalog: duplicate data-id <id>, keeping first-in-DOM-order')`, and the cart's add/remove/get path uses the FIRST entry. **First-in-DOM-order wins** (the Limited Time cards come before Burgers in the document; the Drinks `lemonade` and Limited Time `berry-lemonade` are category-qualified and never collide). |
| Drawer opened with 0 items | `renderDrawer()` checks `Object.keys(cart.lines).length === 0`; shows `.cart-drawer__empty` and hides `.cart-drawer__list` and `.cart-drawer__foot`. No error thrown. |
| Browser lacks `IntersectionObserver` | Irrelevant — the cart does not use `IntersectionObserver`. (The existing cat-nav IIFE does, but that's a separate concern that gracefully degrades by skipping the active-pill highlight.) |
| Browser lacks `Intl.NumberFormat` | SHOULD-grade fallback used. `formatPrice(cents)` returns `'$' + (cents/100).toFixed(2)`-equivalent via the integer-only helper shown in `## Money math implementation`. All modern browsers support `Intl.NumberFormat`; this branch is defensive only. |
| Cross-tab `storage` event with `bp-cart-v1` cleared (key removed) | `storage.read()` returns `null`; cart becomes empty; badge shows `0`. No infinite loop because the listener never re-writes. |
| User opens drawer mid-scroll at `scrollY=1200` and the body reflows | `applyScrollLock()` saves `window.scrollY` before locking the body; `restoreScroll()` writes it back via `window.scrollTo(0, savedY)` after a `requestAnimationFrame` to avoid layout-jank. Tolerance: ±1px (spec). |
| Catalog attribute contains a `&` (e.g. `Cookies &amp; Cream` is decoded by the browser) | `data-name` is set to the source text without re-encoding; the cart module HTML-escapes names on render via `escapeHtml()` to prevent injection when the line list is built via `innerHTML`. |

## Performance budget

Estimates for `menu.html` deltas:

| Component | Approx. lines added | Approx. lines modified |
|---|---|---|
| Inline CSS (additions) | ~150 | 0 |
| Inline CSS (modifications) | 0 | 1 (the `.topbar__inner` flex gap, absorbed by `.topbar__actions` wrapper) |
| DOM markup (additions) | ~50 (topbar indicator ~20, drawer ~30) | 0 |
| DOM markup (modifications) | ~192 attribute insertions + 32 button conversions spread across 32 lines = **~224 line edits** | 32 (one `<a>` → `<button>` per card) + 1 (topbar wrapper) = 33 line edits |
| Inline JS (additions) | ~300 | 0 |
| Inline JS (modifications) | 0 | 0 (existing scripts untouched) |
| **Total additions** | **~500 lines** | |
| **Total modified lines** |  | **~34 line edits** |
| **Combined delta** | **~530–600 changed lines** | |

DOM and JS budget:

- 32 cards receive 6 new `data-*` attributes each (≈ 192 attribute insertions, on existing lines).
- 32 `<a>` elements converted to `<button>` elements.
- 1 new drawer block (`<aside>`, ~30 lines).
- 1 new topbar indicator button (`<button>` + inline SVG, ~20 lines).
- 1 inline `<script>` block (~300 lines, one IIFE tree).

JS budget (named functions inside the module):

| Function | Concern | Lines (approx) |
|---|---|---|
| `catalog.reindex` | DOM walk + validation | ~30 |
| `catalog.get` / `catalog.has` / `catalog.size` | accessors | ~10 |
| `storage.detect` / `read` / `write` / `migrate` / `validate` | persistence | ~40 |
| `storage.attachChangeListener` | cross-tab | ~8 |
| `money.formatPrice` | rendering | ~15 |
| `cart.addItem` / `inc` / `dec` / `remove` / `clear` | state | ~50 |
| `cart.hydrate` / `cart.subtotal` / `cart.count` / `cart.subscribe` | derived | ~30 |
| `drawer.open` / `drawer.close` / `drawer.mount` | UI shell | ~40 |
| `drawer.queryFocusables` / `drawer.onKeydown` / `drawer.applyScrollLock` | a11y | ~30 |
| `app.init` / `app.wireAddButtons` / `app.wireStorageSync` | init | ~30 |
| Misc helpers (`escapeHtml`, `parseIntStrict`, `publish`) | glue | ~15 |
| **Total** | | **~300 lines, 12–15 named functions** |

The combined delta of ~530–600 lines exceeds the 400-line review budget. See `## Delivery`.

## Delivery

Expected changed lines per component:

| Component | Lines |
|---|---|
| Inline CSS additions | ~150 |
| DOM markup additions | ~50 |
| DOM markup modifications (attrs + buttons) | ~225 |
| Inline JS additions | ~300 |
| **Total** | **~725** |

**This exceeds the 400-line review budget.** Chained PRs are recommended (see `recommends_chained_prs: true` in the return envelope).

Recommended slice plan (open to orchestrator's discretion, with reasoning):

- **Slice 1 — UI shell (drawer + topbar indicator)**: CSS additions for the drawer and badge + the two new DOM blocks + the drawer's open/close/focus trap/scroll-lock code. Approximately 200–220 changed lines. Zero state. Reviewable as a static UI feature. Rollback: revert the slice; no persistent effect.
- **Slice 2 — Catalog + cart logic + storage**: `data-*` attributes on all 32 cards, `<a>` → `<button>` conversions, the catalog IIFE, the money IIFE, the storage IIFE, the cart IIFE, the wiring layer. Approximately 480–500 changed lines. End-to-end state. Self-contained once slice 1's selectors exist.
- **Optional slice 1.5 — Verify reduce-motion and ESC** if the user wants a11y review isolated: tiny (~10 lines), but the drawer's focus trap is in slice 1, so probably not worth a separate PR.

Why this split:

- Slice 1 is a closed visual deliverable; a reviewer can open `menu.html` and confirm the drawer opens, the badge renders, and the focus trap cycles.
- Slice 2 is a closed functional deliverable; a reviewer can add items, see the badge increment, see the line subtotals, reload, and confirm persistence.
- Either slice can be reverted without leaving the codebase in a broken state, because slice 1 leaves all "Add" buttons inert and slice 2 only adds behavior to elements introduced by slice 1.

Alternative split (rejected): cart-first, UI-second. Worse because the cart's drawer rendering depends on the mark-up added by the UI work; splitting UI last leaves slice 1 with un-rendered state.

## Acceptance verification mapping

Each spec scenario → the file/line/function that satisfies it. A reviewer can search `menu.html` after `sdd-apply` to confirm.

| Spec scenario | Where it is satisfied in `menu.html` (post-apply) |
|---|---|
| Adding one item to an empty cart | `app.wireAddButtons` → `cart.addItem(id)` → `cart.publish('update')` → `updateBadge()` + `renderDrawer()`. |
| Adding the same item twice | `cart.addItem` increments `lines[id].qty` if the id already exists; no duplicate key. |
| Increasing then decreasing quantity | `cart.inc(id)` / `cart.dec(id)` (the `−` button's `data-cart-dec="<id>"`). |
| Reducing quantity to 0 removes the line | `cart.dec(id)` checks `qty <= 1` and calls `cart.remove(id)` instead. |
| `localStorage` disabled | `storage.detect()` returns `false`; `cart.lines` lives in memory; `storage.write` is a no-op. |
| Reload restores the cart | `app.init` → `cart.hydrate()` → `storage.read()` → `cart.lines = parsed.lines`. |
| Cross-tab sync via `storage` event | `storage.attachChangeListener(() => cart.hydrate())` registered at init. |
| ESC closes drawer and returns focus to toggle | `drawer.onKeydown` checks `e.key === 'Escape'` → `drawer.close()` → restore focus to `previouslyFocused`. |
| Backdrop click closes drawer and returns focus to toggle | `[data-cart-close]` click listener on `.cart-drawer__backdrop` → `drawer.close()`. |
| Tabbing inside an open drawer cycles only inside the drawer | `drawer.onKeydown` Tab/Shift+Tab handler with `FOCUSABLE_SELECTOR` scope. |
| Body scroll lock and scroll restoration | `drawer.applyScrollLock()` + `drawer.restoreScroll()`; `scrollY` saved and reapplied within ±1px. |
| Empty cart shows the empty-state message | `renderDrawer()` toggles `data-cart-empty` visibility vs `data-cart-list` / `data-cart-foot`. |
| `data-price` missing skipped with warning | `catalog.reindex` validation in `parsePriceStrict()`. |
| `data-id` uniqueness (category-qualified) | `catalog.reindex` rejects duplicates with `console.warn`. |
| Reindex is idempotent | `catalog.reindex` rebuilds the Map from scratch on every call; same DOM ⇒ same Map. |

## Risks

| # | Risk | Mitigation specific to this implementation plan |
|---|---|---|
| R1 | **Attribute-typo drift on the 32-card mechanical edit.** `sdd-apply` is going to paste 192 attributes across 32 lines; one wrong `data-price` (e.g. `1095` → `1094`) silently mis-prices an item. | The `## DOM diff plan` table is the single source of truth. `sdd-tasks` MUST include a "diff-verify" task that greps each `data-id` and its `data-price` against the table after editing. The verify phase manually re-opens `menu.html` in DevTools and calls `__bpCart.catalog.get('burgers:classic').priceCents` — must return `895`. |
| R2 | **Existing cat-nav `IntersectionObserver` IIFE could fight the drawer's scroll lock.** If a user opens the drawer while a category section is mid-intersection, the observer may still fire and toggle `is-active` on a pill behind the backdrop. | Acceptable visual cost (the pill is hidden by the backdrop anyway). Documented in the design so reviewers don't flag it as a regression. If we ever want to suppress it, the cat-nav IIFE would need a public API — out of scope here. |
| R3 | **Drawer's focus trap breaks if the line list is re-rendered while focus is inside it.** Adding a new item triggers `renderDrawer()`, which wipes and rebuilds the `<ul data-cart-list>`. If the user's focus was on the `+` button of an existing line and that node is destroyed, focus is lost (back to `<body>`). | `renderDrawer()` is called only when the drawer is closed (the typical "user clicks Add on a menu card" path), and when it IS called with the drawer open (theoretical: programmatic open), the focus trap's `onKeydown` listener is keyed on `document` and falls back to `panel.focus()` if `activeElement` is no longer in the panel. Additionally, `Tab`/`Shift+Tab` always re-query the focusable list, so a re-render mid-session self-heals on the next Tab. |
| R4 | **The `storage` event listener can fire on writes from the same tab on some browsers (historically inconsistent).** A feedback loop could erase the user's cart. | The listener ignores `e.key` mismatches AND checks `e.newValue !== lastWrittenSerialized` (cached in the `storage` IIFE) before re-hydrating. As a belt-and-suspenders measure, the re-hydration path never re-writes — only the originating mutation path writes. |
| R5 | **`data-img` carries full Unsplash URLs with query strings; an editor later edits an item's image and forgets to update the attribute.** Catalog will index the new image as a separate row from the old one if the image URL is in `data-img`. Wait — actually, the catalog is keyed on `data-id`, not `data-img`, so the new image just overwrites the old entry on reindex. Risk is low. | Catalog stores the URL string verbatim; consumers use it for `<img src>` only. No risk of duplication. Document in the design so future maintainers don't add an `img`-based cache key. |
| R6 | **Inline SVG in the topbar button adds visible weight to a topbar that was minimalist.** The topbar currently contains only the logo and one ghost button. Adding an icon button increases visual density. | SVG follows the exact stroke recipe of the existing footer SVGs, so the visual weight is consistent. Badge starts at `0` and is hidden via CSS (`display: none`) until count > 0, keeping the empty-cart topbar visually clean. |
| R7 | **`body.is-cart-open { overflow: hidden }` on iOS Safari can cause a "rubber-band" jump when the user swipes.** | Combination of `overflow: hidden` + `position: fixed` on `body` while locked; the `restoreScroll` helper reapplies `scrollY` on close. Documented in `## Failure modes`. If real-device testing surfaces rubber-band, the next iteration adds `overscroll-behavior: contain` on `.cart-drawer__panel`. |
| R8 | **The 400-line review budget is exceeded by the combined delta; reviewers will skim.** | Chained PRs are recommended (see `## Delivery`). Slice 1 is reviewable in isolation (UI shell, ~220 lines); slice 2 is reviewable in isolation (state + storage, ~500 lines). |

## Acceptance self-check

- [x] All 32 cards listed in the DOM diff table.
- [x] `bp-cart-v1` schema documented with `v: 1`, `lines`, `updatedAt`.
- [x] Catalog entry shape documented with `id`, `name`, `priceCents`, `category`, `cal`, `img`.
- [x] IIFE boundaries named (`catalog`, `money`, `storage`, `cart`, `drawer`, `app`).
- [x] Public surface (`window.__bpCart`) enumerated.
- [x] Init sequence enumerated.
- [x] Focus trap pseudo-code uses the exact selector list from the spec.
- [x] `formatPrice(895) === "$8.95"`, `formatPrice(0) === "$0.00"`, `formatPrice(-50) === "-$0.50"`.
- [x] Negative subtotals guarded at the decrement step.
- [x] z-index plan documented with exact values per layer.
- [x] Migration hooks documented for v2 (the `migrate(parsed)` function).
- [x] Every failure scenario from the specs has a response.
- [x] Performance budget estimates provided.
- [x] Chained PRs recommended (slice 1 = UI shell, slice 2 = state + storage).
- [x] Each spec scenario mapped to a file/line/function.
- [x] Risks listed (R1–R8) with concrete implementation mitigations.
- [x] Hard constraints honored: `burger-site-draft/menu.html` and `index.html` NOT edited; no files created outside `openspec/changes/shopping-cart/`; no Engram save; no sub-agent calls.