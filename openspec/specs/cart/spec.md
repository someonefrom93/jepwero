<!-- Synced from `openspec/changes/shopping-cart/specs/cart/spec.md` on 2026-07-04. Original change: shopping-cart (verifier: slice-1 + slice-2). -->
# Cart Spec

> SDD capability: `cart` — client-side shopping cart for `burger-site-draft/menu.html`. Authored inline by the orchestrator after two failed sub-agent launches (`sdd-spec`); content is unchanged from the proposal and the spec contract.

## Purpose

The `cart` capability lets a visitor of the menu page collect menu items into a private cart, adjust quantities, see a running subtotal, and have the cart survive page reloads. It is the first transactional surface on the site; checkout and payment are explicitly out of scope.

## Requirements

### State model

- The cart state MUST be a flat object `{ lines: Record<id, { qty: number }> }` kept in memory and persisted to `localStorage` under the single key `bp-cart-v1`.
- The `v1` suffix on `bp-cart-v1` is the schema version. Any future change to the stored shape MUST introduce `bp-cart-v2` and MUST include migration logic that reads `bp-cart-v1` and upgrades it.
- All price values MUST be stored as integer cents internally (e.g. `1095` for `$10.95`).
- Line subtotals and the cart subtotal MUST be computed with integer arithmetic. Float arithmetic MUST NOT be used for any price computation.
- If `localStorage.setItem` throws (e.g. quota exceeded, storage disabled, private mode), the cart MUST fall back to an in-memory store and MUST NOT propagate the error to the UI.
- The cart MUST restore from `bp-cart-v1` on `DOMContentLoaded` of `menu.html`.

### Catalog reads

- The cart MUST read item metadata from the `menu-catalog` capability (DOM-derived `data-*` attributes). It MUST NOT hardcode any item list.
- Each cart line MUST display the item's name, unit price (rendered in `$X.XX` format), quantity, and line subtotal (rendered in `$X.XX` format).

### UI behavior

- A topbar cart indicator MUST show an inline SVG icon and a numeric badge with the total item count (sum of all `lines[id].qty`).
- Clicking the indicator MUST open a slide-over drawer from the right edge of the viewport.
- The drawer MUST have a backdrop. Clicking the backdrop MUST close the drawer.
- The drawer MUST have a visible close button (`×`) that closes the drawer.
- Pressing the `ESC` key while the drawer is open MUST close the drawer.
- Closing the drawer MUST restore keyboard focus to the toggle element that opened it.
- The drawer SHOULD animate in/out via a CSS transition; opacity transitions MUST NOT exceed 200ms.

### Quantity controls

- Each cart line MUST render `+` and `−` quantity buttons.
- `+` MUST increment the line qty by 1.
- `−` MUST decrement the line qty by 1. When the resulting qty is `<= 0`, the line MUST be removed from the cart.
- Quantity controls MUST be implemented as `<button>` elements with descriptive `aria-label` (e.g. `aria-label="Increase quantity of The Classic"`).
- The line subtotal MUST recompute immediately on every quantity change, in integer cents, rendered as `$X.XX`.
- The cart subtotal MUST recompute immediately on every quantity change and on every removal.

### Persistence and cross-tab sync

- Every state mutation (add, increment, decrement, remove, clear) MUST call `localStorage.setItem('bp-cart-v1', ...)` so cross-tab sync stays consistent.
- The cart MUST listen for the `storage` event on `window` and, when the event's key equals `bp-cart-v1`, MUST replace its in-memory `lines` with the parsed payload. The in-memory `lines` MUST reflect the change within one event-loop tick.

### Accessibility

- The toggle MUST expose `aria-expanded` reflecting open/closed state.
- The drawer SHOULD have `role="dialog"` and an `aria-labelledby` pointing to its title element.
- While the drawer is open, keyboard focus MUST be trapped inside the drawer (Tab and Shift+Tab cycle only among focusable descendants).
- While the drawer is open, the page body MUST NOT receive focus from any source other than the trap.
- `aria-live="polite"` MUST be present on the drawer body so screen readers announce qty changes when items are added from the menu grid.

### Money rendering

- Display of any price (unit, line subtotal, cart subtotal) MUST use `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })` at the display boundary only.
- The render function MUST NOT mutate the underlying integer-cent values.

### Initial render

- On `DOMContentLoaded`, after the cart restores from `bp-cart-v1`, the badge MUST show the actual count, not `0`.
- An empty cart opening the drawer MUST display the empty-state message ("Your cart is empty") and MUST NOT throw.

## Scenarios

#### Adding one item to an empty cart
- Given an empty cart and `menu.html` is loaded
- When the user clicks the `Add` button on the menu card for `The Classic`
- Then the badge MUST show `1`
- And the drawer, when opened, MUST show one line: name "The Classic", unit price `$8.95`, qty `1`, line subtotal `$8.95`
- And the cart subtotal MUST be `$8.95`

#### Adding the same item twice
- Given an empty cart
- When the user clicks the `Add` button on `The Classic` twice
- Then the badge MUST show `2`
- And the drawer MUST show one line: qty `2`, line subtotal `$17.90`
- And the cart subtotal MUST be `$17.90`

#### Increasing then decreasing quantity
- Given the cart has `The Classic` with qty `1`
- When the user clicks `+` once and then `−` once
- Then the badge MUST show `1`
- And the line qty MUST be `1`
- And the cart subtotal MUST be `$8.95`

#### Reducing quantity to 0 removes the line
- Given the cart has `The Classic` with qty `1`
- When the user clicks `−`
- Then the line MUST be removed from the drawer
- And the badge MUST show `0`
- And the empty-state message MUST be visible

#### localStorage disabled or quota exceeded
- Given `localStorage.setItem` throws on every call (simulated by overriding the method or using private mode in Safari)
- When the user adds `The Classic`
- Then the badge MUST show `1`
- And the drawer MUST show the line
- And no uncaught error MUST appear in the browser console
- And the cart MUST work for the lifetime of the page (in-memory only)

#### Reload restores the cart
- Given the cart has `The Classic` (qty `2`) and `Cheese Fries` (qty `1`)
- When the user reloads `menu.html`
- Then the cart MUST be restored with the same two lines and the same quantities
- And the badge MUST show `3`
- And the cart subtotal MUST equal `2 × $8.95 + $5.50 = $23.40`

#### Cross-tab sync via the `storage` event
- Given `menu.html` is open in two tabs
- When the user, in tab A, increments `The Classic` from qty `1` to qty `3`
- Then tab B's badge MUST show `3` (or be at least equal to its previous value plus the increment, depending on whether tab B already had the item) without requiring a tab focus change
- And tab B's drawer, if open, MUST reflect the new qty

#### ESC closes drawer and returns focus to toggle
- Given the drawer is open and the toggle has focus history stored
- When the user presses `ESC`
- Then the drawer MUST close
- And the toggle MUST have document focus
- And the toggle's `aria-expanded` MUST be `false`

#### Backdrop click closes drawer and returns focus to toggle
- Given the drawer is open
- When the user clicks the backdrop (outside the drawer panel)
- Then the drawer MUST close
- And the toggle MUST have document focus
- And the toggle's `aria-expanded` MUST be `false`

#### Tabbing inside an open drawer cycles only inside the drawer
- Given the drawer is open
- When the user presses `Tab` repeatedly
- Then focus MUST visit only focusable elements within the drawer
- And focus MUST NOT reach the menu items, the topbar buttons, or any element outside the drawer
- And `Shift+Tab` from the first focusable element MUST wrap to the last

#### Body scroll lock and scroll restoration
- Given the user has scrolled `menu.html` to the position `scrollY = 1200px`
- When the user opens the drawer
- Then the body MUST NOT scroll while the drawer is open
- And when the user closes the drawer
- Then the body's scroll position MUST be `1200px` (within 1px tolerance)

#### Empty cart shows the empty-state message
- Given an empty cart
- When the user opens the drawer
- Then the drawer MUST show the empty-state message ("Your cart is empty")
- And no errors MUST be logged to the console
- And a "Browse menu" link or anchor to `#limited` MUST be available so the user can dismiss the empty state

## Out of scope

- Checkout, payments, or any external order placement
- Editing `burger-site-draft/index.html`
- Item customization (e.g. "no onions", "extra cheese")
- Quantity discounts, promo codes, loyalty points
- Tax, tip, or shipping math
- Multi-currency support
- Server persistence, account login, or any backend integration
- Analytics events
- Calorie or nutritional aggregation per cart line

## Dependencies

- Requires the `menu-catalog` capability for item reads (name, price, image, category, calories).
- `bp-cart-v1` storage layout is owned by this capability; any consumer MUST read the JSON via `JSON.parse(localStorage.getItem('bp-cart-v1'))` and MUST treat the result as untrusted until validated.
