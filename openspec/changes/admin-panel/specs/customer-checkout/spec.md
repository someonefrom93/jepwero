# Customer Checkout Spec

> SDD capability: `customer-checkout` — guest checkout flow that converts a populated cart (`bp-cart-v1` in localStorage) into a persisted `orders` row in Supabase. Authored inline by the orchestrator after `sdd-spec` failed (OpenRouter credit exhausted); content is derived from the proposal without alteration.

## Purpose

`customer-checkout` collects the customer's name, email, phone, fulfillment type, and pickup time, validates them inline, submits the populated cart as a new `orders` row plus N `order_items` rows via the Supabase PostgREST API, and clears the cart on success. The customer never authenticates (guest flow per fork 3a).

## Requirements

### Form fields

- The form MUST render the following fields in this order: `customer_name` (text), `customer_email` (email), `customer_phone` (tel), `fulfillment` (radio: `pickup` or `deliver`), `pickup_time` (datetime-local, shown only when `fulfillment = 'pickup'`).
- All fields except `pickup_time` MUST be required.
- The form MUST pre-fill `customer_name` and `customer_phone` from `localStorage.bp-checkout-draft` if a prior draft exists.
- The Submit button MUST be disabled until the form passes client-side validation.
- An itemized breakdown of the cart MUST be visible alongside the form (or on small screens, above the form): each line with name, qty, unit price, line total, and a subtotal.

### Validation

- `customer_name` MUST be 1-100 characters after trimming.
- `customer_email` MUST match `^[^\s@]+@[^\s@]+\.[^\s@]+$`. The regex MUST NOT be looser than this.
- `customer_phone` MUST match `^[+0-9\s\-()]{6,}$`. Allow international formats.
- `pickup_time` when shown MUST be in the future (strictly greater than `now()`).
- The form MUST validate on blur for each field, and again on submit.
- Validation errors MUST be announced via `aria-describedby` to the relevant field. Visual styling MUST highlight invalid fields.

### Submission

- On valid submit, the page MUST build a single `orders` insert payload and an `order_items` array matching the populated cart, then issue in parallel:
  - `supabase.from('orders').insert(<orderRow>).select().single()`
  - For each line, `supabase.from('order_items').insert(<itemRow>)`. Items MUST be inserted in a batch via a single multi-row insert when supported, otherwise sequentially with `Prefer: resolution=ignore-duplicates` not applicable here (each row needs its own `id`).
- Both inserts MUST succeed for the order to be considered committed. If either fails, the page MUST surface a clear error, MUST NOT clear the cart, and MUST persist the customer's form values into `localStorage.bp-checkout-draft` so a retry picks up where they left off.
- The browser MUST generate a per-session idempotency token (UUID, kept only in memory) on form mount. The same token MUST be sent on every retry within the session. The `orders` row MUST persist the token in a `submit_token` column (server-side check: at most one row per token per 24h window, via a unique constraint). The frontend MUST block the second click of a double-submit by checking a `submitting` boolean until the response lands; the server-side constraint is the belt-and-braces fallback.
- The `order` row MUST be created with `status = 'received'` (server default or explicit), `archived_at = NULL`.
- `created_at` MUST default to `now()` server-side (NOT set by the client).

### Failure modes

- Network failure on the orders insert → MUST show a retry-friendly error: "We couldn't place your order. Check your connection and try again."
- Network failure on a single `order_items` insert → MUST attempt to roll back the parent `orders` row before surfacing the error (compensating DELETE). If the rollback fails, MUST surface a clear "order partially placed, please contact the restaurant" message with the order id visible.
- RLS rejection → MUST surface a generic error (do not leak policy details to the user), and MUST NOT clear the cart.
- 4xx/5xx other than network failure → MUST show "Order couldn't be placed. Please contact the restaurant with this reference: <orderId if available>."
- Validation errors preventing submit MUST NOT be possible if `bp-cart-v1` is empty — the page MUST redirect to `menu.html` instead of rendering the form.

### Success

- On successful commit, the page MUST clear `bp-cart-v1`, MUST remove `bp-checkout-draft`, MUST set a single-shot flash message `bp-checkout-success = <orderId>` in sessionStorage, and MUST redirect the browser to `menu.html#order=<orderId>` where the menu page shows a one-time confirmation banner.
- The customer-facing redirect MUST happen on the same origin (same-origin navigation, not a Supabase Auth callback URL).
- The submit button MUST stay disabled while the request is in flight to prevent double-submit.

## Scenarios

#### Empty cart on arrival at checkout
- Given `bp-cart-v1` is empty or absent on `localStorage`
- When `checkout.html` loads
- Then the form MUST NOT render
- And a "your cart is empty — back to menu" placeholder MUST show
- And clicking the placeholder MUST navigate to `menu.html`

#### Form missing required fields on submit attempt
- Given a populated cart and the form
- When the user clicks Submit with `customer_name` empty
- Then the browser MUST NOT send the Supabase POST
- And an inline error MUST appear under the field
- And `customer_name` MUST receive focus

#### Email format invalid
- Given the email field has the value `bogus@`
- When the user blurs the field
- Then inline validation MUST show "Enter a valid email"
- And the Submit button MUST remain disabled

#### Phone format invalid
- Given the phone field has the value `abc`
- When the user blurs the field
- Then inline validation MUST show "Enter a valid phone number (e.g. +1 555 555 0100)"

#### Pickup time in the past
- Given `fulfillment = 'pickup'` is selected and `pickup_time` is set to a past timestamp
- When the user blurs the field
- Then inline validation MUST show "Pickup time must be in the future"

#### Successful submit
- Given a populated cart and a valid form
- When the user clicks Submit
- Then `supabase.from('orders').insert(...)` MUST be sent with `status = 'received'`, `archived_at = null`, integer-cent totals
- And parallel `order_items` inserts MUST succeed for every line in the cart
- And the form MUST persist no further retry on success
- And the cart MUST be cleared

#### Double-submit prevented
- Given the Submit button has been clicked once and the request is still in flight
- When the user clicks again
- Then the second click MUST NOT issue a second Supabase call
- And the Submit button MUST be visually disabled
- And the idempotency token MUST be the same on any retry within the session

#### Submit fails with network error
- Given offline mode or a failing Supabase POST
- When the user clicks Submit
- Then a user-visible error toast MUST appear
- And the cart MUST NOT be cleared
- And the form values MUST be persisted in `bp-checkout-draft`

#### RLS rejection (defensive)
- Given a token is missing or the request otherwise trips an RLS policy
- When the POST is sent
- Then a generic "couldn't place your order" error MUST be shown
- And the cart MUST NOT be cleared

#### Successful redirect to confirmation banner
- Given the order was successfully placed
- When the redirect is performed
- Then the browser MUST navigate to `menu.html#order=<id>`
- And `bp-cart-v1` MUST be cleared
- And `bp-checkout-draft` MUST be cleared
- And sessionStorage `bp-checkout-success` MUST contain the order id

## Out of scope

- Customer authentication. Email is captured but no Supabase Auth user is created. (Fork 3a = `guest`.)
- Payment processing. (Out per proposal.)
- Saved addresses or order history for customers. (No account = no history.)
- Multiple delivery addresses or scheduled delivery windows (only pickup time is captured; `deliver` placeholder is preserved for future use).
- Editing or cancelling the order after submit. (Cancellations happen chef-side on `admin.html`.)
- Sending a confirmation email to the customer. (Customer receives no automatic email in this slice.)
- Idempotency across browser sessions (token is per-session memory only).

## Dependencies

- `bp-cart-v1` in `localStorage` populated by the previous cart change. Read-only consumer here; cleared on success.
- Supabase tables `orders`, `order_items` with RLS allowing `anon` INSERT only on whitelisted columns and `status` defaulted server-side.
- `burger-site-draft/supabase-config.js` setting `window.__bpSupabase` URL and publishable key.
- The Supabase JS SDK (CDN).
- `menu.html`'s "Confirmation banner" UI (added in this same change) for the post-redirect display.
