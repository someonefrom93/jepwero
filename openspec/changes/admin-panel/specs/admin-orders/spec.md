# Admin Orders Spec

> SDD capability: `admin-orders` — chef-side dashboard for incoming orders, lifecycle management, filtering, and print. Authored inline by the orchestrator after `sdd-spec` failed (OpenRouter credit exhausted); content is derived from the proposal and explore phase without alteration.

## Purpose

`admin-orders` lets a logged-in chef see live food orders at `admin.html`, advance each one through its 5-state lifecycle, archive completed ones, filter by status, and print a single order's detail. It enforces access via Supabase Auth's `app_metadata.role = 'admin'` and RLS row-level security on the `orders` and `order_items` tables.

## Requirements

### Auth

- The chef MUST be able to sign in to `admin.html` via Supabase Auth's passwordless email (magic link) flow.
- The sign-in form MUST submit `signInWithOtp({ email, options: { emailRedirectTo: <admin.html absolute URL> } })`.
- After submitting the email, the UI MUST show a "check your inbox" message and MUST NOT poll Supabase for the session in a tight loop; the magic-link return handles session establishment.
- An authenticated chef whose `app_metadata.role` is NOT `'admin'` MUST see an empty list and MUST NOT be allowed to PATCH any order row. The UI SHOULD display a polite "your account isn't an admin" message and a sign-out affordance.
- A session MUST persist across page reloads via Supabase's default `localStorage` storage adapter.
- Sign-out MUST call `supabase.auth.signOut()` and MUST redirect the browser back to the unauthenticated login form.

### Authorization (RLS)

- The `orders` and `order_items` tables MUST have RLS enabled.
- An admin SELECT policy MUST allow a row when `auth.uid() IS NOT NULL` AND `auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'`.
- An admin UPDATE (PATCH) policy MUST allow a row when the same condition holds AND the row's `status` is being moved through a permitted transition.
- Anon (logged-out) roles MUST NOT be able to SELECT or UPDATE any `orders` row under any circumstance. This is enforced by RLS, not by client code.
- Customer-side INSERT into `orders` and `order_items` MUST be allowed for `anon` (no `auth.uid()` required) under a separate INSERT policy with a constrained set of columns and a check that `customer_email` matches a non-empty pattern; `status` MUST default to `'received'` and MUST NOT be settable by the customer on insert.

### Data shape

Internal contract (TypeScript-shaped for clarity):

```ts
interface OrderRow {
  id: string;            // uuid, generated server-side
  created_at: string;    // ISO timestamp
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  fulfillment: 'pickup' | 'deliver';
  pickup_time: string | null;  // ISO timestamp; required when fulfillment = 'pickup'
  status: 'received' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  archived_at: string | null;
  subtotal_cents: number;
  total_cents: number;   // currently == subtotal_cents; reserved for taxes/tip
}

interface OrderItemRow {
  id: string;
  order_id: string;
  catalog_id: string;    // e.g. 'burgers:classic'
  name_snapshot: string;
  qty: number;
  unit_price_cents: number;
  line_total_cents: number;
}
```

- Money values MUST be stored as integer cents (no decimals). The frontend MUST use `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })` when displaying.
- `catalog_id` MUST match an existing `data-id` on the source menu card so the chef can verify the order line against the published catalog.
- `name_snapshot`, `unit_price_cents`, and `line_total_cents` MUST be captured at order-creation time so renaming an item later does not corrupt historical orders.
- `status` MUST be one of the five enum values above; any other value MUST fail insertion by CHECK constraint.

### Lifecycle

- A chef MUST be able to advance an order's `status` by clicking a control rendered for the current status. The available transitions MUST be:
  - `received` → `preparing` ("Start preparing")
  - `preparing` → `ready` ("Mark ready")
  - `ready` → `completed` ("Complete")
  - `received | preparing | ready` → `cancelled` ("Cancel", with confirm)
- Advancing `ready → completed` MUST set `archived_at = now()` via a Postgres trigger OR an explicit PATCH that sets both fields atomically.
- Advancing other transitions MUST leave `archived_at` as `NULL`.
- The UI MUST NOT permit arbitrary status values; the only writable `status` values are the next legal transition. `cancelled` MUST be reachable from any active state but MUST NOT be reversible.
- A status PATCH MUST be sent via the Supabase client with `Prefer: return=representation` so the updated row can replace the local copy without a refetch.

### Live feed

- `admin.html` MUST subscribe to Supabase Realtime channel `public:orders` with an INSERT filter so new arrivals trigger list updates within ~1 second.
- The Realtime channel MUST also be configured to receive UPDATE events; updated rows MUST re-render with the new status badge immediately.
- The subscribed channel MUST use Postgres `postgres_changes` filtered to `schema = 'public' AND table = 'orders'`.
- If the Realtime channel's state becomes `CHANNEL_ERROR` or `CLOSED`, the UI MUST fall back to polling: `setInterval(refetchOrders, 5000)`. The fallback MUST be visible via a small indicator ("Realtime offline — polling every 5s").
- The UI MUST cancel the interval when the Realtime channel reconnects successfully.

### Filtering

- A chef MUST be able to filter the order list by `Active` (default) or `Archived`. Active view MUST show only rows where `archived_at IS NULL`. Archived view MUST show only rows where `archived_at IS NOT NULL`.
- Within `Active`, the chef MAY filter further by status (`received`, `preparing`, `ready`); in `Archived`, by `completed` vs `cancelled`.
- Filters MUST be persisted in the URL hash (`#active`, `#archived`, `#status=preparing`) so a deep link restores the same view.
- Empty filter results MUST render an empty-state message (not just an empty list).

### Print / Detail view

- The chef MUST be able to expand an order row into a detail panel showing: customer name, email, phone, fulfillment, pickup time, line items with qty and line totals, and the order total.
- The detail panel MUST include a "Print" button. Clicking it MUST invoke `window.print()`.
- A `@media print` CSS block MUST hide the chrome (topbar, nav, controls) and render the detail panel alone, sized to a standard receipt page.
- The detail panel MUST be navigable by keyboard (`Tab`, `Shift+Tab`) and MUST set `role="dialog"` with `aria-modal="false"` (informational, non-blocking).
- Status controls inside the detail panel MUST match the lifecycle rules above.

## Scenarios

#### Chef visits admin.html while logged out
- Given no Supabase session exists in browser storage
- When the chef navigates to `admin.html`
- Then the login form MUST be shown
- And the order list MUST NOT be rendered
- And no Supabase SELECT to `orders` MUST be issued

#### Chef submits email for magic link
- Given the login form is visible
- When the chef enters a valid email and submits
- Then `supabase.auth.signInWithOtp` MUST be invoked with `options.emailRedirectTo` pointing at the absolute URL of `admin.html`
- And the UI MUST render a "check your inbox" message
- And no `orders` fetch MUST occur before the session is established

#### Chef clicks the magic link and lands on admin.html
- Given the chef received a magic-link email
- When the chef clicks the link in their email client
- Then the browser navigates to `admin.html` with an auth callback
- And the Supabase client MUST establish a session from the URL hash
- And the order list MUST fetch via `supabase.from('orders').select(...)` and render
- And the Realtime channel MUST subscribe

#### With zero orders in the database
- Given the chef is authenticated and `orders` has zero rows
- When the order list fetches
- Then the list MUST render an empty-state placeholder ("No orders yet")

#### With at least one order present
- Given `orders` has ≥1 row
- When the list renders
- Then each row MUST show: order id (short), customer name, total (formatted), status badge, age (relative, e.g. "3 min ago")
- And rows MUST be ordered by `created_at DESC` so newest is on top

#### A new order arrives in real time
- Given the admin is open and the Realtime channel is subscribed
- When a customer completes checkout on another device (or another tab)
- Then the Realtime INSERT event fires within ~1 second
- And the new order MUST appear at the top of the list without manual refresh

#### Realtime channel fails and polling fallback engages
- Given the admin is open
- When the Realtime channel transitions to `CHANNEL_ERROR` or `CLOSED`
- Then the UI MUST start `setInterval(refetchOrders, 5000)`
- And a small indicator MUST render: "Realtime offline — polling every 5s"
- And orders MUST continue to surface via the polling fetch

#### Realtime reconnects and polling stops
- Given polling is the active feed
- When the Realtime channel state returns to `SUBSCRIBED`
- Then `clearInterval` MUST run on the polling timer
- And the "Realtime offline" indicator MUST be removed

#### Advancing status from received to preparing
- Given an order has `status = 'received'`
- When the chef clicks "Start preparing"
- Then a PATCH MUST be sent: `supabase.from('orders').update({ status: 'preparing' }).eq('id', <id>)` with `Prefer: return=representation`
- And on success, the row's badge MUST update to "Preparing" with no list refetch
- And on failure, an error toast MUST show and the row MUST revert to its previous status

#### Advancing through full lifecycle to archived
- Given an order has `status = 'ready'`
- When the chef clicks "Complete"
- Then `status` MUST be set to `'completed'` AND `archived_at` MUST be set to `now()` atomically (single UPDATE)
- And the row MUST immediately disappear from the Active view
- And the row MUST immediately appear in the Archived view

#### Filtering to Archived view
- Given the chef is on the Active view
- When the chef clicks "Archived"
- Then only orders where `archived_at IS NOT NULL` MUST render
- And the URL hash MUST update to `#archived`

#### Filtering to Active view
- Given the chef is on a status-filtered view
- When the chef clicks "Active"
- Then only orders where `archived_at IS NULL` MUST render
- And the URL hash MUST update to `#active`

#### Authorization: chef account without admin role
- Given a chef session where `app_metadata.role` is missing or not `'admin'`
- When the chef navigates to `admin.html`
- Then the order list MUST be empty (zero rows from PostgREST)
- And any attempt to PATCH `orders` MUST fail with a Postgres RLS error
- And the UI SHOULD show "your account isn't an admin — sign out"

#### Printing an order's detail
- Given an order row is expanded in the detail panel
- When the chef clicks "Print"
- Then `window.print()` MUST be invoked
- And the print stylesheet MUST hide the chrome (topbar, nav, controls) and render only the detail panel
- And the print SHOULD use a portrait page with the receipt laid out top-to-bottom

#### Reload preserves session
- Given the chef is signed in
- When the chef reloads `admin.html`
- Then Supabase Auth MUST restore the session from `localStorage`
- And the order list MUST refetch automatically
- And Realtime MUST resubscribe

## Out of scope

- Real payment processing (Stripe, etc.).
- Multi-restaurant / multi-location routing.
- Inventory validation (items are always available).
- Refunds, partial fulfillment, splitting orders.
- SMS / push / email notifications.
- Server-side Edge Functions.
- Using `SUPABASE_SECRET_KEY` from the browser (forbidden invariant).
- Soft-unarchiving a completed order.
- Editing `customer_email`, `customer_name`, or any other column after insertion.
- Editing or archiving `order_items` after insertion (lines are immutable for the chef; corrections require a new order).

## Dependencies

- Supabase Postgres with the `orders` and `order_items` tables, RLS enabled, policies for SELECT / UPDATE / INSERT in place.
- Supabase Auth with at least one admin user whose `app_metadata.role = 'admin'` (provisioned out of band; the chef's first-time sign-in requires Supabase Studio or SQL to elevate the role).
- Supabase Realtime enabled on the project.
- The Supabase JS SDK (loaded from CDN) and `burger-site-draft/supabase-config.js` (sets `window.__bpSupabase`).
- The chef's email configured to receive magic links (Supabase Auth's email provider — defaults to built-in in dev; production should swap to a custom SMTP relay).
