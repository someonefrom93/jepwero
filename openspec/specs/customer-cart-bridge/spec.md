<!-- Synced from `openspec/changes/admin-panel/specs/customer-cart-bridge/spec.md` on 2026-07-05. Original change: admin-panel (4 chained PRs merged: PR #1..#4 on https://github.com/someonefrom93/jepwero). -->

# Customer Cart Bridge Spec

> SDD capability: `customer-cart-bridge` — the seam between the existing cart (`bp-cart-v1` in localStorage from the previous change) and the new `checkout.html` flow. Authored inline by the orchestrator after `sdd-spec` failed (OpenRouter credit exhausted); content is derived from the proposal without alteration.

## Purpose

`customer-cart-bridge` is a thin capability that defines how the cart drawer on `menu.html`, the new `checkout.html`, and the post-redirect confirmation banner on `menu.html` share cart state. It does not change the existing cart's storage layout (`bp-cart-v1`); it adds the read-on-arrival hook in `checkout.html`, the clear-on-success hook, and the navigation between the surfaces.

## Requirements

### Read side

- When `checkout.html` mounts, it MUST read `bp-cart-v1` from `localStorage` and render the itemized cart summary (name, qty, unit price, line total, subtotal).
- If `bp-cart-v1` is missing or has zero lines, the page MUST redirect to `menu.html` and MUST NOT render the checkout form.
- `checkout.html` MUST listen for `storage` events on `window` whose key is `bp-cart-v1`. If the cart changes (a second tab added/removed items while checkout is open), the summary MUST re-render within one event-loop tick.
- The cart summary on `checkout.html` MUST NOT mutate `bp-cart-v1`. It is read-only here.

### Clear side

- On a successful order submission, `customer-checkout` MUST call into `customer-cart-bridge`'s clear hook, which:
  - Removes `bp-cart-v1` from `localStorage`.
  - Removes `bp-checkout-draft` from `localStorage`.
  - Writes a single-shot success marker `bp-checkout-success` to `sessionStorage` containing the order id.
- The clear hook MUST be idempotent: calling it twice in the same session MUST NOT throw.

### Navigation

- The cart drawer on `menu.html` MUST add a "Checkout" control (visible only when the cart has ≥1 item). Clicking it MUST navigate to `checkout.html`.
- The cart drawer's existing Open/Close/Focus-trap code MUST remain untouched (slice-1 invariant).
- The "Checkout" control MUST be a `<button type="button">` styled as a primary action. It MUST be reachable by Tab when the drawer is open.
- After a successful checkout submission, the user MUST land back on `menu.html#order=<orderId>` where a confirmation banner is shown once.
- The confirmation banner MUST read from `sessionStorage.bp-checkout-success` on `menu.html` mount. If the value is present and the URL hash includes `#order=<id>` matching the value, it MUST show the banner and immediately remove the sessionStorage entry so refresh doesn't repeat the banner.
- "Back to cart" affordance from `checkout.html` MUST navigate back to `menu.html` and MUST NOT clear the cart.

## Scenarios

#### Checkout loads with a populated cart
- Given `bp-cart-v1` has ≥1 line with at least one item and a subtotal
- When `checkout.html` mounts
- Then the checkout form MUST render with the form fields visible
- And the itemized cart summary MUST show every line with name, qty, unit price, and line total
- And the subtotal MUST be displayed and reflect the current cart's integer-cent subtotal

#### Checkout loads with empty or missing cart
- Given `bp-cart-v1` is empty OR does not exist on `localStorage`
- When `checkout.html` mounts
- Then the page MUST redirect (or in-page navigate) to `menu.html`
- And no form MUST render
- And no Supabase POST MUST occur

#### Cart modified in another tab while checkout is open
- Given `checkout.html` is open with a populated cart summary
- When `bp-cart-v1` is mutated on another tab (e.g. an item added or removed)
- Then the storage event fires on `window`
- And the cart summary on `checkout.html` MUST re-render to match the new `bp-cart-v1` content within one event-loop tick
- And the form MUST NOT lose entered values

#### Successful order submission clears the cart
- Given `checkout.html` is open with a populated cart and a successful POST has completed
- When the clear hook runs
- Then `bp-cart-v1` MUST be removed from `localStorage`
- And `bp-checkout-draft` MUST be removed from `localStorage`
- And `bp-checkout-success` MUST be set in `sessionStorage` with the new order id

#### Cancel from checkout returns to menu without clearing
- Given a populated cart on `checkout.html`
- When the user clicks "Back to menu" (or browser back) WITHOUT submitting
- Then `bp-cart-v1` MUST remain in `localStorage` unchanged
- And no `bp-checkout-success` MUST be set
- And the cart MUST be present on return to `menu.html`

#### Checkout link in cart drawer navigates to checkout.html
- Given the cart drawer on `menu.html` is open with ≥1 item
- When the user clicks the "Checkout" control
- Then the browser MUST navigate to `checkout.html`
- And the existing drawer MUST close (or be torn down by navigation)

#### Confirmation banner on menu.html shows once after redirect
- Given the user is redirected from a successful submission to `menu.html#order=<id>`
- When `menu.html` mounts
- Then the confirmation banner MUST render with the order id visible
- And `bp-checkout-success` MUST be removed from `sessionStorage` immediately after consumption
- And a manual reload of the same URL MUST NOT show the banner again

## Out of scope

- Changing the existing `bp-cart-v1` storage layout or its contents from previous change.
- Removing or rewriting slice-1's `cartDrawer` module, focus trap, scroll lock, or aria-expanded patches.
- Adding "Save cart for later" or "Restore previous cart" affordances.
- Letting the cart survive a manual "Clear cart" action triggered from the user (no such action exists yet).
- Cross-device cart sync (each browser holds its own `bp-cart-v1`).
- Coupon / promo code application.

## Dependencies

- `bp-cart-v1` storage layout from the previous `shopping-cart` change. Read-only here; cleared only on successful order submission.
- `menu.html`'s existing cart drawer module from cart slice 1 (NO modifications to its public behavior).
- `checkout.html` from `customer-checkout` to call into the clear hook.
- `menu.html` confirmation banner logic (added in this same change).
