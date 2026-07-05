# Proposal: Admin Panel (orders, checkout, customer auth)

## Intent

Add two new transactional surfaces to the Jochos EPW site so the chef can manage incoming orders in real time and customers can place an order. This is the second transactional surface after the cart (shopping-cart change, archived). The chef gets a live orders dashboard on `admin.html` with magic-link auth and 5-state lifecycle management. Customers get a guest checkout flow on `checkout.html` — no account required, just name/email/phone → submit → confirmation. The existing cart drawer on `menu.html` gains a "Checkout" CTA that bridges the two surfaces.

## Scope (in)

- **`admin.html` (new)**: magic-link auth gate via Supabase Auth, live order feed using Supabase Realtime `postgres_changes` with polling fallback, 5-state status controls (`received → preparing → ready → completed → archived`), order detail panel (slide-down sheet), filter by status, archive view, print styles for receipts, logout button
- **`checkout.html` (new)**: guest contact form (name, email, phone, fulfillment: pickup|deliver, pickup time), reads cart from `bp-cart-v1`, inserts order into Supabase via `place_order()` RPC, clears cart on success, redirects to inline confirmation state with order summary
- **`menu.html` extension**: "Checkout" CTA button added inside `.cart-drawer__foot` (line ~1596), navigates to `checkout.html` without closing the drawer via `data-cart-close`. No other cart code modified.
- **SQL migrations**: `orders` table (id, customer_email, customer_name, customer_phone, status, fulfillment, pickup_time, notes, subtotal_cents, created_at, archived_at), `order_items` table (id, order_id FK, catalog_id, name_snapshot, unit_price_cents, qty, line_subtotal_cents), status CHECK constraint, kitchen query indexes, RLS policies using `auth.uid()` and `app_metadata.role`, `place_order` Postgres function for atomic insert + subtotal validation
- **Env loader**: `burger-site-draft/supabase-config.js` — static credential shim that sets `window.__bpSupabase` before the SDK loads; gitignored
- **`.gitignore` additions**: `.env`, `burger-site-draft/supabase-config.js`
- **`.env.example` template**: at project root for first-time setup
- **Order lifecycle**: 5 states (`received`, `preparing`, `ready`, `completed`, `archived`) with `archived_at` timestamp for soft delete

## Scope (out)

- Real payment processing (Stripe, Square, Mercado Pago, etc.)
- Multi-restaurant / multi-location logic
- Inventory or stock validation
- Refunds, partial fulfillment, splitting orders across chefs
- SMS / push / email notifications to chef or customer (beyond Supabase Auth magic-link)
- Server-side Edge Functions (Supabase, Vercel, Netlify, Cloudflare Workers)
- Client-side use of the secret key (`SUPABASE_SECRET_KEY` stays entirely server-side)
- Editing `burger-site-draft/index.html` (still untouched)
- Editing the existing cart drawer's open/close/focus-trap/scroll-lock code from cart slice 1
- Editing the catalog IIFE / cart IIFE from cart slice 2 (we only ADD a Checkout CTA)
- Replacing `localStorage` cart storage — `bp-cart-v1` schema preserved as-is
- Build tools, test runners, external CSS files, package managers

## Approach

| Pillar | Chosen | Alternative | Why chosen wins |
|---|---|---|---|
| **Data store** | Supabase Postgres + Auth + PostgREST + Realtime | In-memory mock | Orchestrator-verified project; RLS gives us per-user access without server code; browser-only with publishable key |
| **Customer auth** | `guest` — email-only contact field, no account | `magic-link` | Lowest friction for walk-up-and-order MVP; no email deliverability risk for customers; schema stays compatible with future `magic-link` upgrade |
| **Admin auth** | `magic-link` — Supabase Auth passwordless email, `app_metadata.role = 'admin'` | `shared-password` | Gives us a real `auth.users` row for RLS; no shared secret to rotate or leak; recovery is "click the email again" (perfect for a kitchen tablet) |
| **Lifecycle** | `full` — 5 states with `archived_at` soft delete | `simple` — two states | Models real kitchen workflow (received→preparing→ready→completed); archived view keeps the active feed clean; demo shows off Supabase Realtime |
| **Real-time** | Supabase Realtime `postgres_changes` channel on `orders` table, INSERT-filtered, with `setInterval` @ 5s polling fallback on error/close | Polling-only | Native WS latency; polling fallback hides gracefully behind a "Reconnecting…" pill; identical UX either way |
| **Env loader** | Static `supabase-config.js` (gitignored), loaded via `<script>` before Supabase SDK | Build-time env injection | Only viable approach given "no build tools" rule; `.env.example` template for first-time setup |
| **Schema** | Two tables (`orders` + `order_items`) with FK, CHECK constraints, RLS | Single-table JSONB blob | Atomic insert via `place_order` Postgres function validates subtotal server-side; indexed for kitchen queries; supports both `guest` and future `magic-link` customer auth |
| **RLS** | Row-level security via `auth.uid()` and `app_metadata.role` | Server-side API gate | No server code needed; anyone can INSERT (guest checkout), only admin can SELECT/UPDATE; unauthenticated SELECT returns `[]` |

## User-facing behavior

- **Customer (no auth)**: Add items to cart on `menu.html` → click Checkout in drawer → land on `checkout.html` → fill name/email/phone/fulfillment/pickup-time → submit → see confirmation with order summary → cart cleared, redirected to menu
- **Customer (multi-device)**: Each checkout is independent; no account means no cross-device history
- **Chef (no auth, on `admin.html`)**: See login form with email input → submit → check email → click magic link → land on `admin.html` → see live order feed
- **Chef (after login)**: Orders arrive in real time; click an order → status controls visible; advance `received → preparing → ready → completed`; completed orders move to archive after `archived_at` timestamp
- **Chef (filtering)**: Switch between Active / Archived views; "No orders yet" empty state when feed is empty

## Non-goals

No payment processing. No customer accounts or order history. No inventory management. No email notifications beyond Supabase Auth magic-link. No server-side code. No edits to `index.html`. No changes to the cart drawer's existing behavior, storage shape, or accessibility code — only a single "Checkout" CTA button is added. No build tools, no test runners, no external CSS files.

## Success criteria

- [ ] Chef receives magic-link email and clicks it to land on `admin.html` authenticated
- [ ] Unauthenticated visitor to `admin.html` sees login form, not the order feed
- [ ] New order inserted from `checkout.html` appears on `admin.html` within 5 seconds (Realtime)
- [ ] Chef can advance an order through all 5 states: received → preparing → ready → completed → archived
- [ ] Completed orders with `archived_at` set disappear from the Active view and appear in Archived view
- [ ] Customer fills checkout form, submits, sees confirmation with order summary, cart is cleared from `bp-cart-v1`
- [ ] Unauthenticated API call to `/rest/v1/orders` returns `[]` (RLS enforced)
- [ ] `sb_secret_` does not appear anywhere in `burger-site-draft/` files
- [ ] Checkout CTA on `menu.html` cart drawer navigates to `checkout.html` without closing the drawer prematurely
- [ ] `.env`, `supabase-config.js`, and `.env.example` exist; only `supabase-config.js` and `.env` are gitignored
- [ ] `admin.html` print preview renders a receipt without nav/chrome (verified via browser print preview)
- [ ] Realtime channel degrades gracefully to polling fallback on `CHANNEL_ERROR` or `CLOSED`

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `.env` or `supabase-config.js` accidentally committed to git | High | Author `.gitignore` with both entries during apply; include comment explaining why |
| Publishable key is scraped and abused if RLS is wrong | Medium | RLS non-negotiable; verify phase confirms unauthenticated SELECT returns `[]`; `place_order` function validates subtotal server-side |
| Supabase Auth magic-link email deliverability in dev | Medium | Document Supabase dashboard fallback; optionally configurable SMTP provider |
| Realtime channel silently disconnects | Medium | Polling fallback @ 5s on error/close; "Reconnecting…" pill in UI |
| Secret key leaked via bug report or screenshot | Medium | Secret key never loaded in browser code; grep for `sb_secret_` in verify phase confirms zero matches |
| RLS policy allows INSERT without validating `subtotal_cents` matches sum of `order_items` | Medium | `place_order` Postgres function recomputes subtotal server-side; direct INSERTs on table are revoked |
| `bp-cart-v1` not cleared on order success | Medium | Checkout success path must clear localStorage AND dispatch `storage` event for cross-tab sync |
| Cart drawer's Checkout CTA accidentally inherits `data-cart-close` | Low | CTA markup explicitly omits `data-cart-close`; design phase documents this as a "do not copy" comment |
| `index.html` accidentally edited by apply phase | Low | Verify phase checks `md5sum burger-site-draft/index.html` before and after |
| Chef email changes — no password rotation flow exists | Medium | Document that admin identity is tied to `auth.users` row; changing email requires Supabase dashboard or future admin profile settings page |
| Abandoned checkouts leave orphaned `bp-cart-v1` data | Low | Cart state is client-only; clearing on next visit is acceptable; `updatedAt` timestamp enables future cleanup logic |
| Customer opens checkout on phone while desktop cart is out of sync | Low | Each checkout is independent (guest flow); `storage` event already syncs across same-origin tabs |
| Kitchen tablet renders poorly on portrait phone | Medium | `admin.html` must use responsive layout (landscape tablet + portrait phone); admin dashboard CSS designed for both |
| `pointer-events: none` ≠ `visibility: hidden` bug carries over to order-detail sheet | Medium | Admin sheet MUST ship closed-state `opacity: 0; visibility: hidden; transform: translateY(-100%)` from day one (Engram obs #265) |

## Open questions

None — all three forks decided by user (customer auth: `guest`, admin auth: `magic-link`, lifecycle: `full`). Remaining details to settle in spec phase.

## Capabilities

### New Capabilities

- `admin-orders`: Admin-side order management — live order feed via Supabase Realtime + polling fallback, 5-state lifecycle advancement, filter by status, archive view, print receipt, order detail sheet
- `customer-checkout`: Guest checkout flow — contact form (name, email, phone, fulfillment, pickup time), reads cart from `bp-cart-v1`, posts order via `place_order()` RPC, clears cart on success, confirmation state
- `customer-cart-bridge`: Integration point between existing cart (`bp-cart-v1`) and checkout — "Checkout" CTA button in cart drawer footer, cart-clear hook on successful order (thin capability scoping the CTA + clear logic only)

### Modified Capabilities

- `cart`: Modified ONLY by `customer-cart-bridge`'s cart-clear hook on successful order placement. No other cart behavior, storage shape, or UI is changed.

## Invariants (binding across all downstream phases)

1. `burger-site-draft/index.html` MUST NOT be modified.
2. `menu.html` extension touches ONLY: cart drawer markup (a Checkout CTA button inside `.cart-drawer__foot`) and inline `<script>` to wire the CTA. Do NOT touch the existing `cartDrawer` module, focus trap, scroll lock, catalog IIFE, or cart IIFE.
3. No build tools introduced. Supabase JS SDK is loaded from CDN, not bundled.
4. No test runner added.
5. The publishable key is the ONLY Supabase credential in browser-loaded files. The secret key stays out of every browser-loaded file.
6. `.env` and `burger-site-draft/supabase-config.js` MUST be in `.gitignore` (root level). `burger-site-draft/.env.example` MUST be checked in as a template.
7. The cart's `bp-cart-v1` storage is read-only to this change. The change MUST NOT mutate it except to clear lines after a successful order (which is a single `localStorage.removeItem` call).
8. RLS MUST be in place BEFORE any order insert from the browser succeeds. SQL migrations must run idempotently (use `CREATE TABLE IF NOT EXISTS`).
9. The 400-line review budget will be exceeded (~1060 lines total). Chained slices are mandatory, not optional.
