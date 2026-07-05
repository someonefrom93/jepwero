# Tasks: Shopping Cart (menu page)

## Summary

This change implements a shopping cart on `burger-site-draft/menu.html` in two chained slices. **Slice 1** delivers the UI shell: CSS for the drawer and badge, topbar indicator markup, drawer DOM, and the drawer's open/close/focus-trap/scroll-lock module (~210 lines). **Slice 2** delivers the behaviour layer: `data-*` attributes on all 32 cards, button conversions, and the catalog/cart/storage/money IIFEs wired to the UI (~490 lines). Delivery strategy is `force-chained` with `n/a-no-git` (no real branches; each slice is a review/rollback boundary). No build tools, no test runner, no external files, no edits to `index.html`.

---

## Slice 1 — UI shell (drawer + topbar indicator)

### 1.1 — Add CSS for drawer and badge

**Why**: The drawer and badge need their own styling that does not exist in the current stylesheet. This is required before any drawer markup can render correctly.

**Files**: `burger-site-draft/menu.html`

**Specifics**: Append a new CSS block inside the existing `<style>` element, right before `</style>` (after the last `@media` rule). Insert the following selectors in order:
1. `.topbar__actions` — `display: flex; align-items: center; gap: 12px;`
2. `.topbar__cart` — ghost button, 40×40, same visual weight as the existing ghost back-link
3. `.topbar__cart-count` — `display: none` when 0, `position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px; border-radius: 9px; background: var(--color-primary); color: #fff; font-size: 11px; line-height: 18px; text-align: center;`
4. `.cart-drawer` — `position: fixed; inset: 0; z-index: 60; pointer-events: none;`
5. `.cart-drawer[aria-hidden="false"]` — `pointer-events: auto;`
6. `.cart-drawer__backdrop` — `position: fixed; inset: 0; z-index: 55; background: rgba(0,0,0,0.45);`
7. `.cart-drawer__panel` — `position: fixed; inset: 0 0 0 auto; width: min(420px, 92vw); z-index: 60; background: var(--color-bg); box-shadow: -4px 0 24px rgba(0,0,0,0.15); display: flex; flex-direction: column;`
8. `.cart-drawer__head` — `display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--color-line);`
9. `.cart-drawer__title` — `font-family: var(--font-heading); font-size: 1.25rem;`
10. `.cart-drawer__close` — 32×32 button, `×` glyph, aria-label `"Close cart"`
11. `.cart-drawer__body` — `flex: 1; overflow-y: auto; padding: 16px 20px;`
12. `.cart-drawer__empty` — centred empty-state, `hidden` attribute controls visibility
13. `.cart-drawer__empty-title` — `font-weight: 600; margin-bottom: 4px;`
14. `.cart-drawer__list` — `list-style: none; margin: 0; padding: 0;`
15. `.cart-drawer__line` — `display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--color-line);`
16. `.cart-drawer__qty` — `display: flex; align-items: center; gap: 8px;`
17. `.cart-drawer__qty-btn` — circular ghost button, 28×28, `+` or `−`
18. `.cart-drawer__remove` — small `×` button at row end
19. `.cart-drawer__foot` — `padding: 16px 20px; border-top: 1px solid var(--color-line);` `hidden` attribute
20. `.cart-drawer__subtotal-row` — `display: flex; justify-content: space-between; font-weight: 600;`
21. `.cart-drawer__subtotal-note` — `font-size: 0.75rem; color: var(--color-ink-soft); margin-top: 4px;`
22. `body.is-cart-open` — `overflow: hidden;`
23. `@media (prefers-reduced-motion: reduce)` — disable panel slide and backdrop fade (set transition to `none` for `.cart-drawer__panel` and `.cart-drawer__backdrop`)

**Acceptance**:
- [ ] Opening `menu.html` in a browser shows no visual change (drawer markup is `aria-hidden="true"` at load)
- [ ] The `.cart-drawer`, `.cart-drawer__backdrop`, and `.cart-drawer__panel` selectors appear in the `<style>` block
- [ ] The `.topbar__cart`, `.topbar__cart-count`, `.topbar__actions` selectors appear in the `<style>` block
- [ ] No existing CSS rule is modified

**Estimated lines changed**: ~150

---

### 1.2 — Add topbar cart indicator markup

**Why**: The topbar is the only place on `menu.html` where the user can open the cart. The indicator must exist in the DOM before the drawer module can wire to it.

**Files**: `burger-site-draft/menu.html`

**Specifics**: Inside `.topbar__inner`, wrap the existing `<a class="btn btn--ghost" href="index.html">← Back to Home</a>` in a new `<div class="topbar__actions">`. As a sibling inside `.topbar__actions`, insert the cart toggle button:
```html
<button
  type="button"
  class="topbar__cart"
  data-cart-toggle
  aria-label="Open cart"
  aria-expanded="false"
  aria-controls="cart-drawer"
>
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
       aria-hidden="true" focusable="false">
    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/>
    <line x1="3" y1="6" x2="21" y2="6"/>
    <path d="M16 10a4 4 0 0 1-8 0"/>
  </svg>
  <span class="topbar__cart-count" data-cart-count aria-hidden="true">0</span>
</button>
```
The back-link stays as the last child of `.topbar__actions`. The `.topbar__actions` wrapper itself is the first child after `.topbar__logo`.

**Acceptance**:
- [ ] The cart icon button appears in the topbar, to the left of "← Back to Home"
- [ ] Badge count shows `0` and is hidden (CSS `display: none` when value is 0)
- [ ] `data-cart-toggle` attribute is present on the button
- [ ] `aria-expanded="false"` and `aria-controls="cart-drawer"` are set on the button

**Estimated lines changed**: ~22

---

### 1.3 — Add drawer markup at end of `<body>`

**Why**: The drawer DOM must be present in the document for the JS module to wire event listeners and manage `aria-hidden` state.

**Files**: `burger-site-draft/menu.html`

**Specifics**: Immediately before the existing `<script>` block (sibling of `<footer>`), insert:
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
      <button type="button" class="cart-drawer__close" data-cart-close aria-label="Close cart">×</button>
    </header>

    <div class="cart-drawer__body" data-cart-body aria-live="polite">
      <div class="cart-drawer__empty" data-cart-empty>
        <p class="cart-drawer__empty-title">Your cart is empty</p>
        <p class="cart-drawer__empty-sub">Add something from the menu to get started.</p>
        <a class="btn btn--primary" href="#limited" data-cart-close>Browse menu</a>
      </div>
      <ul class="cart-drawer__list" data-cart-list hidden></ul>
    </div>

    <footer class="cart-drawer__foot" data-cart-foot hidden>
      <div class="cart-drawer__subtotal-row">
        <span class="cart-drawer__subtotal-label">Subtotal</span>
        <span class="cart-drawer__subtotal" data-cart-subtotal>$0.00</span>
      </div>
      <p class="cart-drawer__subtotal-note">Taxes and pickup time calculated at checkout.</p>
    </footer>
  </div>
</aside>
```

**Acceptance**:
- [ ] The `<aside id="cart-drawer">` element is present in the DOM, immediately before `<script>`
- [ ] `role="dialog"`, `aria-modal="true"`, `aria-labelledby="cart-drawer-title"`, and `aria-hidden="true"` are all set
- [ ] The empty-state `<div data-cart-empty>` and the line list `<ul data-cart-list>` are both present
- [ ] The footer with `<span data-cart-subtotal>` is present

**Estimated lines changed**: ~35

---

### 1.4 — Add drawer open/close module (ESC, backdrop, close button)

**Why**: The drawer needs to respond to three triggers: clicking the topbar toggle, pressing ESC, and clicking the backdrop or close button. This is the core UI interaction layer.

**Files**: `burger-site-draft/menu.html`

**Specifics**: Append a new `<script>` block (or append to the existing inline script at the bottom of `<body>`) containing the drawer IIFE:
```js
const drawer = (function () {
  let isOpen = false;
  let previouslyFocused = null;
  const el = document.querySelector('[data-cart-drawer]');
  const panel = el && el.querySelector('.cart-drawer__panel');

  function open() {
    if (isOpen) return;
    previouslyFocused = document.activeElement;
    el.setAttribute('aria-hidden', 'false');
    el.setAttribute('aria-hidden', 'false'); // twice to force repaint on some browsers
    isOpen = true;
    document.body.classList.add('is-cart-open');
    applyScrollLock();
    focusFirst();
    bindKeydown();
  }

  function close() {
    if (!isOpen) return;
    el.setAttribute('aria-hidden', 'true');
    isOpen = false;
    document.body.classList.remove('is-cart-open');
    restoreScroll();
    unbindKeydown();
    if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
  }

  function toggle() { isOpen ? close() : open(); }

  // ---- scroll lock helpers ----
  let savedScrollY = 0;
  function applyScrollLock() {
    savedScrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
  }
  function restoreScroll() {
    document.body.style.overflow = '';
    window.scrollTo(0, savedScrollY);
  }

  // ---- focus trap ----
  const FOCUSABLE_SELECTOR = [
    'a[href]', 'button:not([disabled])',
    'input:not([disabled])', '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  function queryFocusables() {
    return Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR))
      .filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);
  }

  function focusFirst() {
    const focusables = queryFocusables();
    if (focusables.length) { focusables[0].focus(); return; }
    panel.tabIndex = -1;
    panel.focus();
  }

  let keydownHandler = null;
  function bindKeydown() {
    keydownHandler = onKeydown;
    document.addEventListener('keydown', keydownHandler);
  }
  function unbindKeydown() {
    if (keydownHandler) {
      document.removeEventListener('keydown', keydownHandler);
      keydownHandler = null;
    }
  }

  function onKeydown(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const focusables = queryFocusables();
    if (!focusables.length) { e.preventDefault(); panel.focus(); return; }
    const first = focusables[0], last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !panel.contains(active))) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault(); first.focus();
    }
  }

  // ---- mount: wire toggle, close, backdrop ----
  function mount() {
    document.querySelectorAll('[data-cart-toggle]').forEach(btn => {
      btn.addEventListener('click', toggle);
    });
    document.querySelectorAll('[data-cart-close]').forEach(btn => {
      btn.addEventListener('click', close);
    });
  }

  return { open, close, toggle, isOpen: () => isOpen, mount };
})();
```
Wire `drawer.mount()` inside a `DOMContentLoaded` handler.

**Acceptance**:
- [ ] Clicking the topbar cart icon opens the drawer (slide-in from right)
- [ ] Clicking the backdrop closes the drawer
- [ ] Clicking the `×` button closes the drawer
- [ ] Pressing ESC closes the drawer
- [ ] After closing, focus returns to the topbar cart icon

**Estimated lines changed**: ~90

---

### 1.5 — Add focus trap (Tab / Shift+Tab cycling)

**Why**: Accessibility requires that when the drawer is open, keyboard focus is contained within the drawer panel. Tab and Shift+Tab must cycle only through focusable elements inside the drawer.

**Files**: `burger-site-draft/menu.html`

**Specifics**: The focus trap logic is already embedded in the drawer module (task 1.4) via `onKeydown(e)`. This task verifies the implementation is correct and adds any missing edge-case handling:
- `Shift+Tab` from the first focusable element wraps to the last
- `Tab` from the last focusable element wraps to the first
- If no focusable elements exist inside the panel, focus the panel itself (`panel.tabIndex = -1; panel.focus()`)
- Focus must NOT escape the drawer while it is open

**Acceptance**:
- [ ] With the drawer open, pressing Tab repeatedly cycles only through elements inside the drawer panel
- [ ] Shift+Tab from the first focusable element wraps to the last
- [ ] No Tab or Shift+Tab press reaches elements outside the drawer (menu grid, topbar buttons)
- [ ] The `aria-hidden="true"` on the backdrop prevents it from receiving focus

**Estimated lines changed**: 0 (integrated into task 1.4)

---

### 1.6 — Add body scroll lock + scroll restoration

**Why**: When the drawer is open, the page behind it must not scroll. When the drawer closes, the user's scroll position must be restored exactly.

**Files**: `burger-site-draft/menu.html`

**Specifics**: The scroll lock logic is embedded in the drawer IIFE from task 1.4:
- `applyScrollLock()` saves `window.scrollY` to a module-level variable before setting `document.body.style.overflow = 'hidden'`
- `restoreScroll()` removes the `overflow` style and calls `window.scrollTo(0, savedScrollY)` within a `requestAnimationFrame` wrapper
- The saved `savedScrollY` value must be restored to within ±1px after the drawer closes

**Acceptance**:
- [ ] Open the drawer while scrolled to a non-zero `scrollY`; the body does not scroll while the drawer is open
- [ ] Close the drawer; the page returns to the exact same `scrollY` (±1px)
- [ ] On iOS Safari, no rubber-band jump occurs on drawer open/close

**Estimated lines changed**: 0 (integrated into task 1.4)

---

### 1.7 — Slice 1 manual verification script

**Why**: There is no automated test runner. A human must be able to run a short browser checklist to confirm slice 1 is correctly implemented before slice 2 begins.

**Files**: `burger-site-draft/menu.html`

**Specifics**: Add a comment block at the top of the new `<script>` block (or as a standalone comment) listing the manual checks:
```js
/* === Slice 1 Manual Verification ===
1. Open menu.html — topbar shows cart icon (left of "← Back to Home"), no drawer visible.
2. Click cart icon — drawer slides in from right; focus is inside drawer.
3. Press Tab — focus cycles only inside drawer panel.
4. Press Shift+Tab from first element — focus wraps to last element inside drawer.
5. Press ESC — drawer closes; focus returns to cart icon; page scrollY unchanged.
6. Click backdrop — drawer closes; focus returns to cart icon.
7. Click × button — drawer closes; focus returns to cart icon.
8. Badge count shows 0 and is hidden via CSS.
*/
```

**Acceptance**:
- [ ] The comment block with the 8-step checklist is present in the `<script>` block
- [ ] All 8 steps are actionable by a human without any tooling

**Estimated lines changed**: ~12

---

## Slice 2 — State + behaviour (catalog + cart + storage + money)

### 2.1 — Add `Intl.NumberFormat` formatter and `formatPrice(cents)` function

**Why**: All prices are stored as integer cents internally. The display boundary must render them as `$X.XX` using `Intl.NumberFormat`, never float arithmetic.

**Files**: `burger-site-draft/menu.html`

**Specifics**: Inside the main cart `<script>` block, add a `money` IIFE:
```js
const money = (function () {
  const formatter = (typeof Intl !== 'undefined' && Intl.NumberFormat)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
    : null;

  function formatPrice(cents) {
    const n = Number(cents) | 0;
    if (formatter) return formatter.format(n / 100);
    // SHOULD-grade fallback for environments without Intl
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    return sign + '$' + Math.floor(abs / 100) + '.' + String(abs % 100).padStart(2, '0');
  }

  return { formatPrice };
})();
```
Expose on `window.__bpCart` as `money`.

**Acceptance**:
- [ ] `money.formatPrice(895)` returns `"$8.95"`
- [ ] `money.formatPrice(0)` returns `"$0.00"`
- [ ] `money.formatPrice(425)` returns `"$4.25"`
- [ ] `money.formatPrice(1095)` returns `"$10.95"`

**Estimated lines changed**: ~22

---

### 2.2 — Build `catalog` IIFE (reindex from DOM, `get`, `has`, `size`)

**Why**: The catalog is the single source of truth for item metadata. It must index from `data-*` attributes on the 32 `.item` cards so the cart never needs hardcoded data.

**Files**: `burger-site-draft/menu.html`

**Specifics**: Add a `catalog` IIFE exposing `{ reindex, get, has, size }`:
```js
const catalog = (function () {
  const STORE_KEY_PRICE = 'data-price';

  let items = new Map();

  function parsePriceStrict(raw) {
    if (typeof raw !== 'string') return null;
    const cleaned = raw.replace(/[$,]/g, '').trim();
    if (!/^\d+$/.test(cleaned)) return null;
    const n = parseInt(cleaned, 10);
    return n > 0 && n < 1e6 ? n : null;
  }

  function reindex() {
    const next = new Map();
    document.querySelectorAll('.menu-grid .item').forEach(card => {
      const id = card.getAttribute('data-id');
      const name = card.getAttribute('data-name');
      const priceRaw = card.getAttribute('data-price');
      const category = card.getAttribute('data-category');
      const cal = card.getAttribute('data-cal');
      const img = card.getAttribute('data-img');
      if (!id) { console.warn('catalog: skipping card — missing data-id', card.textContent.slice(0, 80)); return; }
      if (next.has(id)) { console.warn('catalog: duplicate data-id "' + id + '", keeping first'); return; }
      const priceCents = parsePriceStrict(priceRaw);
      if (priceCents === null) { console.warn('catalog: skipping "' + id + '" — malformed data-price', priceRaw); return; }
      next.set(id, Object.freeze({ id, name: name || '', priceCents, category: category || '', cal: cal || '', img: img || '' }));
    });
    items = next;
  }

  function get(id) { return items.get(id) || null; }
  function has(id) { return items.has(id); }
  function size() { return items.size; }

  return { reindex, get, has, size };
})();
```
Call `catalog.reindex()` inside `DOMContentLoaded`. Expose on `window.__bpCart` as `catalog`.

**Acceptance**:
- [ ] After `DOMContentLoaded`, `__bpCart.catalog.size()` returns `32`
- [ ] `__bpCart.catalog.get('burgers:classic')` returns an object with `priceCents === 895`
- [ ] `__bpCart.catalog.get('lt:berry-lemonade')` returns an object with `priceCents === 425`
- [ ] `__bpCart.catalog.has('nonexistent')` returns `false`

**Estimated lines changed**: ~50

---

### 2.3 — Build `storage` IIFE (`detect`, `read`, `write`, `attachChangeListener`)

**Why**: The cart must persist to `localStorage` under `bp-cart-v1` and survive page reloads. Cross-tab sync must ride the native `storage` event.

**Files**: `burger-site-draft/menu.html`

**Specifics**: Add a `storage` IIFE:
```js
const storage = (function () {
  const STORAGE_KEY = 'bp-cart-v1';
  const SCHEMA_VERSION = 1;
  let available = false;
  let onChange = null;

  function detect() {
    try {
      localStorage.setItem('__bp_probe__', '1');
      localStorage.removeItem('__bp_probe__');
      available = true;
    } catch (e) { available = false; }
    return available;
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

  function read() {
    if (!available) return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!validate(parsed)) { console.warn('bp-cart-v1: malformed payload, resetting'); return null; }
      return parsed;
    } catch (e) { console.warn('bp-cart-v1: parse error, resetting'); return null; }
  }

  function write(state) {
    if (!available) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* swallow */ }
  }

  function attachChangeListener(fn) {
    onChange = fn;
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY && typeof onChange === 'function') onChange();
    });
  }

  return {
    detect, read, write, attachChangeListener,
    get available() { return available; },
    get STORAGE_KEY() { return STORAGE_KEY; }
  };
})();
```
Expose on `window.__bpCart` as `storage`.

**Acceptance**:
- [ ] `storage.detect()` returns `true` in a normal browser
- [ ] `storage.read()` returns `null` on first load (no `bp-cart-v1` yet)
- [ ] `storage.write({ v: 1, lines: {}, updatedAt: Date.now() })` persists without throwing
- [ ] `storage.attachChangeListener(fn)` registers a `storage` event listener that fires when `bp-cart-v1` changes in another tab

**Estimated lines changed**: ~55

---

### 2.4 — Build `cart` IIFE (`addItem`, `inc`, `dec`, `remove`, `clear`, `hydrate`, `subtotalCents`, `lines`)

**Why**: The cart module is the state authority. It manages the in-memory `lines` object, computes subtotals in integer cents, and calls `storage.write()` on every mutation.

**Files**: `burger-site-draft/menu.html`

**Specifics**: Add a `cart` IIFE:
```js
const cart = (function () {
  let lines = {}; // Record<id, { qty: number }>
  let updatedAt = 0;
  const subscribers = [];

  function persist() {
    updatedAt = Date.now();
    storage.write({ v: 1, lines, updatedAt });
    notify();
  }

  function notify() { subscribers.forEach(fn => fn({ lines, subtotalCents: subtotalCents() })); }

  function subtotalCents() {
    return Object.entries(lines).reduce((sum, [id, { qty }]) => {
      const item = catalog.get(id);
      return sum + (item ? item.priceCents * qty : 0);
    }, 0);
  }

  function addItem(id) {
    if (!catalog.has(id)) { console.warn('cart.addItem: unknown id', id); return; }
    if (!lines[id]) lines[id] = { qty: 0 };
    lines[id].qty += 1;
    persist();
  }

  function inc(id) {
    if (!lines[id]) return;
    lines[id].qty += 1;
    persist();
  }

  function dec(id) {
    if (!lines[id]) return;
    if (lines[id].qty <= 1) { remove(id); return; }
    lines[id].qty -= 1;
    persist();
  }

  function remove(id) {
    delete lines[id];
    persist();
  }

  function clear() {
    lines = {};
    persist();
  }

  function hydrate() {
    const saved = storage.read();
    if (saved && saved.lines) {
      lines = saved.lines;
      updatedAt = saved.updatedAt || 0;
    } else {
      lines = {};
    }
    notify();
  }

  function linesArray() {
    return Object.entries(lines).map(([id, { qty }]) => {
      const item = catalog.get(id);
      return item ? Object.freeze({ id, qty, item }) : null;
    }).filter(Boolean);
  }

  function count() {
    return Object.values(lines).reduce((s, { qty }) => s + qty, 0);
  }

  function subscribe(fn) { subscribers.push(fn); }

  return { addItem, inc, dec, remove, clear, hydrate, subtotalCents, lines: linesArray, count, subscribe };
})();
```
Expose on `window.__bpCart` as `cart`.

**Acceptance**:
- [ ] `cart.addItem('burgers:classic')` increments the line qty to 1 and persists to localStorage
- [ ] Calling `addItem` twice for the same id results in qty 2 (not two separate lines)
- [ ] `cart.dec('burgers:classic')` when qty is 1 removes the line entirely
- [ ] `cart.clear()` empties the cart and persists an empty `bp-cart-v1`

**Estimated lines changed**: ~65

---

### 2.5 — Wire `app.init`: hydrate → reindex → delegate clicks → call `cart.addItem`

**Why**: This is the init sequence that connects all modules. It must run after both existing scripts and before any user interaction.

**Files**: `burger-site-draft/menu.html`

**Specifics**: Add an `app` IIFE registered on `DOMContentLoaded`:
```js
const app = (function () {
  function init() {
    storage.detect();
    catalog.reindex();
    cart.hydrate();
    updateBadge();
    drawer.mount();
    wireAddButtons();
    wireStorageSync();
  }

  function updateBadge() {
    const count = cart.count();
    const badge = document.querySelector('[data-cart-count]');
    if (!badge) return;
    badge.textContent = count;
    badge.style.display = count > 0 ? '' : 'none';
  }

  function renderDrawer() {
    const list = document.querySelector('[data-cart-list]');
    const empty = document.querySelector('[data-cart-empty]');
    const foot = document.querySelector('[data-cart-foot]');
    const subtotalEl = document.querySelector('[data-cart-subtotal]');
    if (!list) return;
    const linesArr = cart.lines();
    if (linesArr.length === 0) {
      list.hidden = true;
      foot.hidden = true;
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    list.hidden = false;
    foot.hidden = false;
    list.innerHTML = linesArr.map(({ id, qty, item }) => {
      const lineTotal = item.priceCents * qty;
      const esc = s => String(s).replace(/[&<">]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      return '<li class="cart-drawer__line">' +
        '<img src="' + esc(item.img) + '" alt="" width="48" height="48" style="object-fit:cover;border-radius:6px;flex-shrink:0;">' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(item.name) + '</div>' +
          '<div style="color:var(--color-ink-soft);font-size:0.875rem;">' + money.formatPrice(item.priceCents) + '</div>' +
        '</div>' +
        '<div class="cart-drawer__qty">' +
          '<button type="button" class="cart-drawer__qty-btn" data-cart-dec="' + esc(id) + '" aria-label="Decrease quantity of ' + esc(item.name) + '">−</button>' +
          '<span>' + qty + '</span>' +
          '<button type="button" class="cart-drawer__qty-btn" data-cart-inc="' + esc(id) + '" aria-label="Increase quantity of ' + esc(item.name) + '">+</button>' +
        '</div>' +
        '<div style="font-weight:600;min-width:60px;text-align:right;">' + money.formatPrice(lineTotal) + '</div>' +
        '<button type="button" class="cart-drawer__remove" data-cart-remove="' + esc(id) + '" aria-label="Remove ' + esc(item.name) + '">×</button>' +
      '</li>';
    }).join('');
    subtotalEl.textContent = money.formatPrice(cart.subtotalCents());
  }

  function wireAddButtons() {
    document.querySelectorAll('.menu-grid').forEach(grid => {
      grid.addEventListener('click', e => {
        const btn = e.target.closest('[data-add]');
        if (!btn) return;
        const id = btn.getAttribute('data-add');
        if (catalog.has(id)) { cart.addItem(id); }
        else { console.warn('app: unknown catalog id', id); }
      });
    });
  }

  function wireCartMutations() {
    document.querySelector('[data-cart-list]').addEventListener('click', e => {
      const decBtn = e.target.closest('[data-cart-dec]');
      if (decBtn) { cart.dec(decBtn.getAttribute('data-cart-dec')); return; }
      const incBtn = e.target.closest('[data-cart-inc]');
      if (incBtn) { cart.inc(incBtn.getAttribute('data-cart-inc')); return; }
      const rmBtn = e.target.closest('[data-cart-remove]');
      if (rmBtn) { cart.remove(rmBtn.getAttribute('data-cart-remove')); return; }
    });
  }

  function wireStorageSync() {
    storage.attachChangeListener(() => { cart.hydrate(); });
  }

  // Subscribe to cart updates
  cart.subscribe(() => { updateBadge(); renderDrawer(); });

  // Override renderDrawer to also handle qty btn wiring on re-render
  const _origRenderDrawer = renderDrawer;
  function renderDrawer() {
    _origRenderDrawer();
    wireCartMutations();
  }

  document.addEventListener('DOMContentLoaded', init);

  return { init, updateBadge, renderDrawer };
})();
```
Expose on `window.__bpCart` as `app`.

**Acceptance**:
- [ ] On page load, the badge shows the correct count from `bp-cart-v1` (or 0 on first load)
- [ ] Clicking `.item__order` with `data-add="burgers:classic"` calls `cart.addItem('burgers:classic')`
- [ ] Adding an item increments the badge count immediately
- [ ] The drawer line list renders with correct name, price, qty, and line subtotal

**Estimated lines changed**: ~95

---

### 2.6 — Wire `app.updateBadge()` and `app.renderDrawer()` on every cart mutation

**Why**: The badge and drawer must reflect cart state in real-time. Every add/inc/dec/remove/clear must trigger a re-render of both the badge and the drawer content.

**Files**: `burger-site-draft/menu.html`

**Specifics**: The subscription `cart.subscribe(() => { updateBadge(); renderDrawer(); })` is already set up in task 2.5. This task verifies and ensures:
- `updateBadge()` reads `cart.count()` and sets `badge.textContent` and `badge.style.display`
- `renderDrawer()` builds the line list from `cart.lines()`, shows/hides empty-state vs. line list vs. footer, and computes line totals with `money.formatPrice()`
- When the drawer is closed and `renderDrawer()` is called (e.g. from a background add), the drawer stays closed (it only re-renders its internal state; `aria-hidden` is managed by `drawer.open/close`)

**Acceptance**:
- [ ] Add an item via the menu card — badge increments, drawer (if open) shows the new line
- [ ] Increment qty via the `+` button in the drawer — line subtotal updates, badge updates
- [ ] Decrement qty to 0 — line disappears, badge decrements
- [ ] Remove a line — line disappears, badge updates, subtotal updates

**Estimated lines changed**: 0 (integrated into task 2.5)

---

### 2.7 — Convert 32 `<a class="btn btn--primary item__order">` to `<button type="button" data-add="<id>">`

**Why**: The dead "Order" links must become functional cart triggers. Each button's `data-add` value must match its parent `<article>`'s `data-id`.

**Files**: `burger-site-draft/menu.html`

**Specifics**: For each of the 32 `<article class="item">` cards, locate the child `<a class="btn btn--primary item__order" href="index.html#locations">Order</a>` and replace with:
```html
<button type="button" class="btn btn--primary item__order" data-add="<id>">Add</button>
```
The `data-add` value for each button MUST match the `data-id` of its parent `<article>`. The full mapping from the design DOM diff table is:

| Category | Slug | `data-add` |
|---|---|---|
| lt | smokehouse-smash | `lt:smokehouse-smash` |
| lt | nashville-hot-chicken | `lt:nashville-hot-chicken` |
| lt | berry-lemonade | `lt:berry-lemonade` |
| burgers | classic | `burgers:classic` |
| burgers | bacon-cheeseburger | `burgers:bacon-cheeseburger` |
| burgers | mushroom-swiss | `burgers:mushroom-swiss` |
| burgers | spicy-southwest | `burgers:spicy-southwest` |
| burgers | double-stack | `burgers:double-stack` |
| burgers | garden-veggie | `burgers:garden-veggie` |
| chicken | crispy-chicken-sandwich | `chicken:crispy-chicken-sandwich` |
| chicken | grilled-chicken-club | `chicken:grilled-chicken-club` |
| chicken | chicken-tenders | `chicken:chicken-tenders` |
| chicken | classic-hot-dog | `chicken:classic-hot-dog` |
| bowls | cobb-salad | `bowls:cobb-salad` |
| bowls | classic-caesar | `bowls:classic-caesar` |
| bowls | build-your-own-bowl | `bowls:build-your-own-bowl` |
| sides | hand-cut-fries | `sides:hand-cut-fries` |
| sides | cheese-fries | `sides:cheese-fries` |
| sides | onion-rings | `sides:onion-rings` |
| sides | mozzarella-sticks | `sides:mozzarella-sticks` |
| kids | burger | `kids:burger` |
| kids | tenders | `kids:tenders` |
| kids | grilled-cheese | `kids:grilled-cheese` |
| shakes | classic-vanilla | `shakes:classic-vanilla` |
| shakes | chocolate | `shakes:chocolate` |
| shakes | strawberry | `shakes:strawberry` |
| shakes | cookies-cream | `shakes:cookies-cream` |
| shakes | salted-caramel | `shakes:salted-caramel` |
| drinks | fountain-soda | `drinks:fountain-soda` |
| drinks | fresh-brewed-iced-tea | `drinks:fresh-brewed-iced-tea` |
| drinks | lemonade | `drinks:lemonade` |
| drinks | bottled-water | `drinks:bottled-water` |

**Acceptance**:
- [ ] All 32 `<a class="btn btn--primary item__order">` are replaced with `<button type="button" class="btn btn--primary item__order" data-add="…">Add</button>`
- [ ] No `<a href="index.html#locations">` remains inside any `.item__order` element
- [ ] Each `data-add` value matches its parent `<article>`'s `data-id`

**Estimated lines changed**: 32 (one line edit per button, 32 total)

---

### 2.8 — Add `data-*` attributes to all 32 `.item` cards

**Why**: The catalog reads item metadata from `data-id`, `data-name`, `data-price`, `data-category`, `data-cal`, and `data-img` on each `<article class="item">`. All 6 attributes are required for the catalog to index correctly.

**Files**: `burger-site-draft/menu.html`

**Specifics**: For each of the 32 `<article class="item">` cards, add the following attributes to the opening `<article>` tag. Values come from the design DOM diff table:

```
data-id="<category>:<slug>"   data-name="<display name>"
data-price="<integer cents>"  data-category="<category key>"
data-cal="<calorie string>"   data-img="<full unsplash URL>"
```

Full data per card (32 rows):

| Slug | `data-id` | `data-name` | `data-price` | `data-cal` |
|---|---|---|---|---|
| smokehouse-smash | `lt:smokehouse-smash` | Smokehouse Smash | `1095` | `820 cal` |
| nashville-hot-chicken | `lt:nashville-hot-chicken` | Nashville Hot Chicken | `995` | `740 cal` |
| berry-lemonade | `lt:berry-lemonade` | Berry Lemonade | `425` | `180 cal` |
| classic | `burgers:classic` | The Classic | `895` | `640 cal` |
| bacon-cheeseburger | `burgers:bacon-cheeseburger` | Bacon Cheeseburger | `1050` | `830 cal` |
| mushroom-swiss | `burgers:mouth-swiss` | Mushroom Swiss | `1025` | `760 cal` |
| spicy-southwest | `burgers:spicy-southwest` | Spicy Southwest | `1095` | `880 cal` |
| double-stack | `burgers:double-stack` | The Double Stack | `1150` | `1010 cal` |
| garden-veggie | `burgers:garden-veggie` | Garden Veggie | `950` | `520 cal` |
| crispy-chicken-sandwich | `chicken:crispy-chicken-sandwich` | Crispy Chicken Sandwich | `950` | `680 cal` |
| grilled-chicken-club | `chicken:grilled-chicken-club` | Grilled Chicken Club | `1025` | `610 cal` |
| chicken-tenders | `chicken:chicken-tenders` | Chicken Tenders | `925` | `520 cal` |
| classic-hot-dog | `chicken:classic-hot-dog` | Classic Hot Dog | `650` | `450 cal` |
| cobb-salad | `bowls:cobb-salad` | Cobb Salad | `1150` | `620 cal` |
| classic-caesar | `bowls:classic-caesar` | Classic Caesar | `995` | `420 cal` |
| build-your-own-bowl | `bowls:build-your-own-bowl` | Build-Your-Own Bowl | `1095` | `Varies` |
| hand-cut-fries | `sides:hand-cut-fries` | Hand-Cut Fries | `395` | `320 cal` |
| cheese-fries | `sides:cheese-fries` | Cheese Fries | `550` | `510 cal` |
| onion-rings | `sides:onion-rings` | Onion Rings | `495` | `430 cal` |
| mozzarella-sticks | `sides:mozzarella-sticks` | Mozzarella Sticks | `625` | `480 cal` |
| burger | `kids:burger` | Kids' Burger | `695` | `380 cal` |
| tenders | `kids:tenders` | Kids' Tenders | `695` | `340 cal` |
| grilled-cheese | `kids:grilled-cheese` | Grilled Cheese | `595` | `320 cal` |
| classic-vanilla | `shakes:classic-vanilla` | Classic Vanilla | `595` | `580 cal` |
| chocolate | `shakes:chocolate` | Chocolate | `595` | `620 cal` |
| strawberry | `shakes:strawberry` | Strawberry | `595` | `540 cal` |
| cookies-cream | `shakes:cookies-cream` | Cookies & Cream | `625` | `660 cal` |
| salted-caramel | `shakes:salted-caramel` | Salted Caramel | `650` | `700 cal` |
| fountain-soda | `drinks:fountain-soda` | Fountain Soda | `295` | `0–310 cal` |
| fresh-brewed-iced-tea | `drinks:fresh-brewed-iced-tea` | Fresh-Brewed Iced Tea | `295` | `5 cal` |
| lemonade | `drinks:lemonade` | Lemonade | `350` | `220 cal` |
| bottled-water | `drinks:bottled-water` | Bottled Water | `225` | `0 cal` |

**Acceptance**:
- [ ] All 32 `<article class="item">` elements have `data-id`, `data-name`, `data-price`, `data-category`, `data-cal`, and `data-img` attributes
- [ ] `data-price` values are integer strings with no `$`, no commas, no decimals
- [ ] `data-id` values are category-qualified (e.g. `burgers:classic`, not `classic`)
- [ ] `__bpCart.catalog.size()` returns `32` after load

**Estimated lines changed**: ~192 (6 attributes × 32 cards)

---

### 2.9 — Slice 2 manual verification script

**Why**: Manual verification is the only testing available. A human must be able to confirm all spec scenarios are working.

**Files**: `burger-site-draft/menu.html`

**Specifics**: Add a second comment block after the slice 1 verification block:
```js
/* === Slice 2 Manual Verification ===
PREREQUISITE: Slice 1 is verified and present.

1. Open DevTools console. Run: __bpCart.catalog.size() — expect 32.
2. Run: __bpCart.catalog.get('burgers:classic') — expect { priceCents: 895 }.
3. Click "Add" on The Classic card. Badge shows 1. Open drawer — line shows "The Classic", "$8.95", qty 1.
4. Click "Add" on The Classic again. Badge shows 2. Line qty is 2, line subtotal "$17.90".
5. Click + in drawer. Qty becomes 3, subtotal "$26.85".
6. Click − in drawer once. Qty becomes 2, subtotal "$17.90".
7. Click − again. Line disappears. Badge shows 0. Empty state shown.
8. Add "Cheese Fries" (qty 1, $5.50) and "Kids' Burger" (qty 1, $6.95). Drawer subtotal = $12.45.
9. Reload page. Badge shows 2. Cart content restored. Drawer subtotal still $12.45.
10. Open second tab to same URL. Add item in tab 1. Tab 2 badge updates automatically (cross-tab sync).
11. Press ESC with drawer open — closes. Focus returns to toggle.
12. Click backdrop — closes. Focus returns to toggle.
*/
```

**Acceptance**:
- [ ] The comment block with all 12 verification steps is present in the `<script>` block
- [ ] All 12 steps are actionable by a human with DevTools open, without any build or test tooling

**Estimated lines changed**: ~18

---

## Task ordering and dependencies

```
Slice 1
  1.1 Add CSS ──────────────────────┐
  1.2 Topbar indicator markup ─────┤── independent of each other
  1.3 Drawer markup ───────────────┤
  1.4 Drawer open/close module ────┼── all depend on 1.1, 1.2, 1.3 being in DOM
  1.5 Focus trap ──────────────────┤── part of 1.4
  1.6 Scroll lock ─────────────────┤── part of 1.4
  1.7 Slice 1 verify script ───────┘

Slice 2
  2.1 formatPrice ──────────────────┐
  2.2 catalog IIFE ─────────────────┤── independent of each other
  2.3 storage IIFE ────────────────┤
  2.4 cart IIFE ───────────────────┤── depends on 2.1, 2.2
  2.5 app init + wiring ────────────┼── depends on 2.1, 2.2, 2.3, 2.4
  2.6 updateBadge + renderDrawer ───┤── part of 2.5
  2.7 button conversions ───────────┤── depends on catalog (data-add must match data-id)
  2.8 data-* attributes ───────────┤── depends on nothing (CSS selectors already exist in 1.1)
  2.9 Slice 2 verify script ────────┘
```

**Dependency rules**:
- Slice 1 must be fully applied before Slice 2 begins (drawer CSS selectors and DOM elements must exist before the JS module references them).
- Within Slice 2, tasks 2.1–2.4 are the foundation; 2.5 wires them; 2.7–2.8 add the DOM data; 2.9 is the final step.
- Task 2.8 (`data-*` attributes) can technically start in parallel with 2.1–2.4 since it only edits existing `<article>` tags and does not affect CSS or JS selectors.

---

## Slice 1 verification (manual browser checks)

> Run these after applying Slice 1 only. No test runner required.

1. **[Visual]** Open `menu.html`. Topbar shows cart icon (shopping bag SVG) to the left of "← Back to Home". No badge visible (count is 0).
2. **[Drawer's `aria-hidden="true"`]** Open DevTools. Run `document.getElementById('cart-drawer').getAttribute('aria-hidden')` — expect `"true"`.
3. **[Open drawer]** Click the cart icon. Drawer slides in from right. `aria-hidden` becomes `"false"`. Focus is inside the drawer panel.
4. **[Focus trap — Tab]** With drawer open, press Tab. Focus cycles only through: close button, "Browse menu" link, empty-state content (or, in Slice 2, line items). Focus never reaches the menu grid or topbar.
5. **[Focus trap — Shift+Tab]** Press Shift+Tab. Focus wraps from first element to last element inside the drawer.
6. **[ESC closes]** Press ESC. Drawer closes. `aria-hidden` is `"true"`. Focus is on the cart icon button.
7. **[Backdrop click closes]** Open drawer again. Click the dim backdrop area. Drawer closes. Focus returns to cart icon.
8. **[Close button closes]** Open drawer again. Click the `×` button. Drawer closes. Focus returns to cart icon.
9. **[Scroll lock]** Scroll the page to `scrollY > 0`. Open the drawer. The page behind the drawer does not scroll. Close the drawer. Page `scrollY` is restored (±1px).
10. **[Reduced motion]** On a browser with `prefers-reduced-motion: reduce`, the drawer opens/closes without animation (CSS transition `none`).

---

## Slice 2 verification (manual browser checks)

> Run these after applying Slice 2 (Slice 1 must already be present).

1. **[Catalog indexed]** Open DevTools. Run `__bpCart.catalog.size()` — expect `32`.
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

---

## Rollback plan per slice

### Slice 1 rollback

**What to revert**:
1. Delete the CSS block added in task 1.1 (the `.topbar__actions`, `.topbar__cart`, `.topbar__cart-count`, `.cart-drawer*` selectors and all associated rules).
2. Delete the topbar indicator markup added in task 1.2 (the `<div class="topbar__actions">` wrapper and its children including the cart toggle button). Restore the original `<a class="btn btn--ghost">` as a direct child of `.topbar__inner`.
3. Delete the drawer markup added in task 1.3 (the entire `<aside class="cart-drawer">` block).
4. Delete the drawer IIFE added in task 1.4 (the entire `drawer` IIFE and its `drawer.mount()` call).
5. Delete the verification comment block added in task 1.7.

**Result**: `menu.html` returns to its exact pre-Slice-1 state. No visual or behavioural change remains.

### Slice 2 rollback

**What to revert**:
1. Delete the `money` IIFE (task 2.1), the `catalog` IIFE (task 2.2), the `storage` IIFE (task 2.3), the `cart` IIFE (task 2.4), and the `app` IIFE (task 2.5) from the `<script>` block.
2. Restore all 32 `<button type="button" class="btn btn--primary item__order" data-add="…">Add</button>` back to `<a class="btn btn--primary item__order" href="index.html#locations">Order</a>` (task 2.7).
3. Remove `data-id`, `data-name`, `data-price`, `data-category`, `data-cal`, and `data-img` from all 32 `<article class="item">` elements (task 2.8).
4. Delete the slice 2 verification comment block (task 2.9).

**Note**: Slice 1 must remain applied for Slice 2 rollback to make sense (the drawer DOM and CSS already exist from Slice 1; without Slice 2 the drawer is inert — all `data-cart-*` buttons exist but do nothing).

---

## Risks per slice

### Slice 1 risks

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R1.1 | **z-index layering is wrong** — drawer panel (z:60) may not cover the sticky topbar (z:50) on some viewport widths | Medium | Verify visually: open drawer at any scroll position; topbar must be fully obscured behind the backdrop |
| R1.2 | **CSS transition causes jank on open/close** — `transform: translateX(100%)` to `translateX(0)` may not be smooth on low-end devices | Low | The CSS uses `opacity` fade (200ms max) which is cheaper; if jank is reported, add `will-change: transform` to `.cart-drawer__panel` in a follow-up |
| R1.3 | **Focus trap leaks if drawer has no focusable descendants** — empty-state drawer has only a link; if the link is broken focus falls to `<body>` | Low | The `focusFirst()` function guards with `panel.tabIndex = -1; panel.focus()` as a fallback; this is already in the code |
| R1.4 | **Body scroll lock causes layout shift on iOS Safari** — `overflow: hidden` on `<body>` can shift fixed-positioned elements | Medium | `restoreScroll()` re-applies `window.scrollY` via `window.scrollTo()` on close; real-device testing recommended before shipping |
| R1.5 | **`prefers-reduced-motion` not respected** — users who request reduced motion still see the drawer animation | Medium | The `@media (prefers-reduced-motion: reduce)` block in task 1.1 sets `transition: none` on both panel and backdrop |

### Slice 2 risks

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R2.1 | **Attribute-typo drift on the 32-card mechanical edit** — one wrong `data-price` silently mis-prices an item | Medium | After task 2.8, run `__bpCart.catalog.get('<id>').priceCents` in DevTools for each of the 32 ids against the design table; catch mismatches before review |
| R2.2 | **`data-add` does not match parent `data-id`** — button gets wrong catalog id; click is a no-op | Medium | The `data-add` value MUST equal the parent `<article>`'s `data-id`; grep for each mapping after task 2.7 |
| R2.3 | **Catalog misses a card silently** — a malformed `data-price` causes the card to be skipped with only a `console.warn` | Medium | Open DevTools console while loading; look for `catalog: skipping` warnings; all 32 cards should index with zero warnings |
| R2.4 | **Float money math sneaks in** — a future refactor uses `price * qty` (float) instead of `priceCents * qty` (integer) | Medium | Code review must check: all arithmetic on prices uses `priceCents` (integer); `money.formatPrice()` is the ONLY display conversion |
| R2.5 | **Cross-tab sync creates feedback loop** — the `storage` event re-hydrates the cart, which re-writes, which fires another `storage` event | Low | The `storage` IIFE's `attachChangeListener` only calls `cart.hydrate()` (never re-writes); the originating mutation path is the only writer |
| R2.6 | **`renderDrawer()` wipes focus if called while drawer is open** — destroying the `<ul>` while focus is on a `+` button loses focus | Low | `renderDrawer()` is only called when the drawer is closed (adding from the menu grid); if called programmatically with drawer open, the next Tab re-queries focusables and self-heals |
| R2.7 | **Integer overflow on extreme quantities** — `priceCents * qty` could exceed `Number.MAX_SAFE_INTEGER` for pathological inputs | Very Low | 32 items × max qty of ~900 (9-digit price in cents) is far below `Number.MAX_SAFE_INTEGER` (2^53); no mitigation needed |
| R2.8 | **Cart count badge shows stale value after cross-tab update** — the `storage` event hydrates the cart but the badge update subscription may not fire if the cart object reference is replaced | Low | `cart.hydrate()` calls `notify()` which runs all subscribers including `updateBadge`; badge always refreshes |

---

## Reviewer checklist

### Slice 1 reviewer checklist

- [ ] **CSS**: `.topbar__actions`, `.topbar__cart`, `.topbar__cart-count`, `.cart-drawer`, `.cart-drawer__backdrop`, `.cart-drawer__panel`, `.cart-drawer__head`, `.cart-drawer__title`, `.cart-drawer__close`, `.cart-drawer__body`, `.cart-drawer__empty`, `.cart-drawer__list`, `.cart-drawer__line`, `.cart-drawer__qty`, `.cart-drawer__qty-btn`, `.cart-drawer__remove`, `.cart-drawer__foot`, `.cart-drawer__subtotal-row`, `body.is-cart-open` — all 19 selectors present in the `<style>` block
- [ ] **CSS**: No existing CSS rule was modified (grep for `topbar__inner`, `topbar__logo`, `cat-nav` — none should have been touched)
- [ ] **Markup**: Cart toggle button is inside `.topbar__inner`, has `data-cart-toggle`, `aria-expanded="false"`, `aria-controls="cart-drawer"`
- [ ] **Markup**: Drawer `<aside>` has `role="dialog"`, `aria-modal="true"`, `aria-labelledby="cart-drawer-title"`, `aria-hidden="true"`, `id="cart-drawer"`
- [ ] **Markup**: Backdrop `<div>` has `data-cart-close` and `aria-hidden="true"`
- [ ] **Markup**: Close button has `data-cart-close` and `aria-label="Close cart"`
- [ ] **Markup**: Empty state `<div data-cart-empty>` is present with `hidden` attribute
- [ ] **JS**: `drawer.open()` sets `aria-hidden="false"` and adds `is-cart-open` to `<body>`
- [ ] **JS**: `drawer.close()` sets `aria-hidden="true"`, removes `is-cart-open`, restores scroll position, and restores focus to the previously focused element
- [ ] **JS**: `drawer.mount()` wires `[data-cart-toggle]` and all `[data-cart-close]` elements
- [ ] **JS**: Focus trap uses `FOCUSABLE_SELECTOR` with `a[href]`, `button:not([disabled])`, `input:not([disabled])`, `[tabindex]:not([tabindex="-1"])` and filters `el.offsetParent !== null`
- [ ] **JS**: Tab/Shift+Tab cycling wraps from first to last and last to first inside the drawer panel
- [ ] **JS**: ESC key calls `drawer.close()` and is handled before the Tab key
- [ ] **JS**: Scroll lock saves `window.scrollY` before setting `body.overflow = 'hidden'` and restores it via `window.scrollTo(0, savedY)` on close
- [ ] **Reduced motion**: `@media (prefers-reduced-motion: reduce)` disables transitions on `.cart-drawer__panel` and `.cart-drawer__backdrop`
- [ ] **Invariant**: `burger-site-draft/index.html` was NOT modified
- [ ] **Invariant**: No external JS or CSS files were added

### Slice 2 reviewer checklist

- [ ] **JS**: `money.formatPrice` uses `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })` — verify no `parseFloat`, no `toFixed(2)`, no `* 0.01` in the format path
- [ ] **JS**: `money.formatPrice(895)` → `"$8.95"`, `formatPrice(0)` → `"$0.00"`, `formatPrice(425)` → `"$4.25"` — verified in DevTools
- [ ] **JS**: `catalog.reindex()` walks `.menu-grid .item`, calls `Object.freeze()` on each entry, skips cards missing `data-id` or with malformed `data-price` with a `console.warn`
- [ ] **JS**: `catalog.reindex()` rejects duplicate `data-id` values with a `console.warn` and keeps the first-in-DOM-order entry
- [ ] **JS**: `storage.detect()` uses a probe write/read/remove pattern and sets `available` boolean
- [ ] **JS**: `storage.read()` validates `state.v === 1` and `state.lines` shape; returns `null` on any mismatch
- [ ] **JS**: `storage.write()` serialises `{ v: 1, lines, updatedAt }` under key `bp-cart-v1`; is a no-op when `available === false`
- [ ] **JS**: `storage.attachChangeListener(fn)` registers a `storage` event listener that calls `fn` only when `e.key === 'bp-cart-v1'`
- [ ] **JS**: `cart.addItem(id)` increments `lines[id].qty` (or creates it at 0) and calls `persist()` on every mutation
- [ ] **JS**: `cart.dec(id)` removes the line when qty would go to 0 (guards `qty <= 1` before decrementing)
- [ ] **JS**: `cart.hydrate()` calls `storage.read()` and sets `cart.lines` from the result (or empty object if `null`)
- [ ] **JS**: `cart.subscribe(fn)` is called with a function that calls both `updateBadge()` and `renderDrawer()`
- [ ] **JS**: `updateBadge()` sets `badge.textContent = count` and `badge.style.display = count > 0 ? '' : 'none'`
- [ ] **JS**: `renderDrawer()` builds the line list via `innerHTML` with `escapeHtml()` (or equivalent) on all user-facing string interpolation
- [ ] **JS**: `renderDrawer()` toggles `hidden` on `data-cart-empty`, `data-cart-list`, and `data-cart-foot` correctly based on whether `cart.lines()` is empty
- [ ] **JS**: `wireAddButtons()` adds a single delegated click listener to each `.menu-grid` element; reads `data-add` and calls `cart.addItem(id)` only if `catalog.has(id)`
- [ ] **JS**: `app.init()` runs in order: `storage.detect()` → `catalog.reindex()` → `cart.hydrate()` → `updateBadge()` → `drawer.mount()` → `wireAddButtons()` → `wireStorageSync()`
- [ ] **DOM**: All 32 `<article class="item">` elements have `data-id`, `data-name`, `data-price` (integer cents), `data-category`, `data-cal`, `data-img` attributes
- [ ] **DOM**: All 32 `<a class="btn btn--primary item__order" href="index.html#locations">Order</a>` are replaced with `<button type="button" class="btn btn--primary item__order" data-add="<id>">Add</button>`
- [ ] **DOM**: Each button's `data-add` value matches its parent `<article>`'s `data-id` value
- [ ] **DOM**: No `<a href="index.html#locations">` remains inside any `.item__order` element
- [ ] **`window.__bpCart`**: `catalog`, `money`, `storage`, `cart`, `drawer` are all exposed for manual inspection
- [ ] **Invariant**: `burger-site-draft/index.html` was NOT modified
- [ ] **Invariant**: No external JS or CSS files were added
- [ ] **Performance**: No `innerHTML` rewrites on the menu grid itself; only the drawer line list uses `innerHTML`
