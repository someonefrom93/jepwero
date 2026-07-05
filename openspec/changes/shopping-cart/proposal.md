# Proposal: Shopping Cart (menu page)

## Intent

Replace the 32 dead "Order" links (pointing to `index.html#locations`) on `menu.html` with a functional slide-over cart. Users can collect items, adjust quantities, see a running total, and have their cart survive page reloads via localStorage. This is the first transactional surface on the site — checkout is a separate future change. The storage shape is designed so a follow-up change can surface the badge on `index.html` without rewriting persistence.

## Scope (in)

- Slide-over drawer (right side) with backdrop overlay for cart contents
- Topbar cart indicator: inline SVG icon + item-count badge in `.topbar__inner` on `menu.html`
- 32 "Add" `<button>` elements replacing the current `<a href="index.html#locations">` Order links
- localStorage persistence under versioned key `bp-cart-v1`, with in-memory fallback when storage is unavailable
- DOM-derived catalog via new `data-id`, `data-name`, `data-price`, `data-category`, `data-cal`, `data-img` attributes on each `<article class="item">`
- Integer-cents money math internally; `Intl.NumberFormat` rendering at the display boundary only
- Accessibility: focus trap inside drawer, `aria-label` on controls, `aria-expanded` on toggle, ESC to close

## Scope (out)

- Checkout / payment flow (separate future change)
- Editing `index.html` (untouched in this change; global badge is a follow-up)
- Item customization (no ingredient picker, no "no onions" modifier)
- Quantity discounts, promo codes, shipping/tax math
- Analytics events, server sync, multi-currency
- Nutritional calorie aggregation per cart line
- Any external JS or CSS file — all code stays inline in `menu.html`
- Build tools, test runners, package managers

## Approach

**State model**: `localStorage` with versioned key → chosen over in-memory-only. Single key `bp-cart-v1` serialized as JSON. Falls back to in-memory when storage is disabled. Survives reloads, which in-memory-only cannot. Version suffix means future schema changes use `bp-cart-v2` with migration. Alternative: in-memory-only — simpler but loses the cart on every reload.

**UI placement**: Slide-over drawer + topbar badge → chosen over dropdown popover. Backdrop z-index: 55, drawer panel z-index: 60 (clears topbar's 50 and cat-nav's 40). Popover is lighter but cramps beyond ~3 lines; drawer scales to a full receipt. Alternative: dropdown popover — works for small carts but no room for edit/remove UX.

**Event handling**: Scoped delegation on `.menu-grid` → chosen over per-item listeners. One listener survives DOM changes. Per-item listeners bloat with 32+ elements and don't survive `innerHTML` rewrites. Alternative: per-item listeners — trivial to write, fragile to maintain.

**Catalog source**: `data-*` attributes on `.item` cards → chosen over hardcoded JS array. HTML IS the catalog — adding a menu item is a markup edit only. Hardcoded JS catalog duplicates 32 items across two files; drift is inevitable. Alternative: hardcoded JS array — easy to unit-test (but we have no test runner), guarantees drift.

**Money math rule**: All prices stored as integer cents (e.g., `1095` for $10.95). Totals computed with integer arithmetic. `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })` renders `$X.XX` at the display boundary. Floats are forbidden for any price computation.

**z-index contract**: backdrop at 55, drawer panel at 60. Must clear topbar (`z: 50`) and `.cat-nav` (`z: 40`). Any future layer change to those elements MUST re-verify this contract.

**Versioning contract**: Key is `bp-cart-v1`. The `v1` suffix is a schema version. Any shape change (new fields, different structure) MUST use `bp-cart-v2` and include migration logic to read and upgrade v1 data.

## User-facing behavior

- **Open drawer**: Click topbar cart icon → backdrop dims, drawer slides in from right, focus trapped inside
- **Add item**: Click "Add" on any menu card → badge increments, item appears in drawer with qty 1, subtotal updates
- **Change quantity**: +/− buttons in drawer adjust qty → subtotal recalculated in integer cents, rendered as `$X.XX`
- **Remove item**: Tap × button or reduce qty to 0 → line removed, badge updates
- **Close drawer**: ESC key, × button, or backdrop click → drawer closes, focus returns to toggle, `aria-expanded` set to false
- **Empty state**: No items → drawer shows "Your cart is empty" message
- **Persistence**: Reload `menu.html` → cart restored from `bp-cart-v1`. Second tab picks up changes via `storage` event

## Non-goals

No checkout flow. No `index.html` edits. No item customization. No discounts or promo codes. No shipping, tax, or tip math. No analytics. No server sync. No external files. No build tools. No test runner. No multi-currency. No nutritional aggregation.

## Success criteria

- [ ] Clicking "Add" on any menu item increments the topbar badge count
- [ ] Opening drawer shows all added items with correct name, unit price, qty, and line total in `$X.XX` format
- [ ] Changing qty or removing an item recalculates the subtotal exactly (manual verification with known prices)
- [ ] Reloading `menu.html` restores the cart from localStorage
- [ ] Opening `menu.html` in private/incognito window works — cart stays in memory, no error thrown
- [ ] ESC, backdrop click, and close button all close the drawer and return focus to the toggle
- [ ] Drawer overlays the sticky topbar and category nav completely (no z-index gaps)
- [ ] All 32 "Add" controls are `<button>` elements, not `<a>` links to `#locations`

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Float money math introduced later | Medium | Integer-cents rule in design.md; manual verification of penny-precision on known combos |
| z-index break if topbar/cat-nav z-values change | Medium | Documented contract; verify step checks overlay completeness |
| localStorage disabled → silent cart loss | Low | In-memory fallback + optional UI hint when storage fails |
| Catalog drift — new items added without `data-*` | Medium | Reindex from DOM on every load; text-content fallback if attributes missing |
| 400-line review budget exceeded | Medium | Tasks phase to forecast and recommend chained PRs if needed |
| Inline SVG icon scales poorly on small viewports | Low | Use `viewBox="0 0 24 24"` + `currentColor`; consistent with existing project SVG conventions |
| `scroll-padding-top: 140px` disrupted when drawer locks body scroll | Low | Restore scroll position on close; verify anchor nav still works |

## Open questions

None — proceed to spec phase.

## Capabilities

### New Capabilities

- `cart`: Client-side shopping cart with slide-over drawer, quantity management, integer-cents totals, localStorage persistence, and accessibility support
- `menu-catalog`: DOM-derived catalog index from `data-*` attributes on menu item cards, rebuilt on load and on storage events

### Modified Capabilities

None — no existing specs to modify.

## Invariants (binding across all downstream phases)

1. `burger-site-draft/index.html` MUST NOT be modified.
2. No external JS or CSS files added — all code stays inline in `menu.html`.
3. No build tools introduced.
4. No automated test runner added (manual verification per `openspec/config.yaml`).
5. `index.html` having no topbar is a known follow-up, not a blocker.
