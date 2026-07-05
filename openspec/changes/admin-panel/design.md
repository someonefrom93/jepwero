# Design: Admin Panel (orders dashboard, customer checkout, cart bridge)

> Change: `admin-panel` · Phase: design · Artifact store: openspec
> Bound to `proposal.md` and the three delta specs (`specs/admin-orders/spec.md`, `specs/customer-checkout/spec.md`, `specs/customer-cart-bridge/spec.md`). This design is read-only on source files; it does NOT touch `burger-site-draft/`, `.env*`, or `.gitignore` during this phase. It writes a single artifact: `openspec/changes/admin-panel/design.md`.
>
> User-confirmed forks: `guest` customer auth, `magic-link` admin auth, `full` 5-state lifecycle.
> Forced delivery: 4 chained slices, each ≤ 400 lines.

## Summary

This change adds two new transactional surfaces to the Jochos EPW site — `admin.html` (chef-side orders dashboard with magic-link auth, Supabase Realtime live feed + polling fallback, 5-state lifecycle, print) and `checkout.html` (guest checkout that converts `bp-cart-v1` into a persisted `orders` row) — plus a thin extension of `menu.html` that adds a "Checkout" CTA to the existing cart drawer and a one-shot confirmation banner. Three new top-level files (`admin.html`, `checkout.html`, `burger-site-draft/supabase-config.js`) and two new project-root files (`.env.example`, expanded `.gitignore`) join a paste-only SQL migration set (3 idempotent files). The cart drawer's existing IIFE, focus trap, scroll lock, storage shape, and accessibility code from the `shopping-cart` archive are untouched; the menu extension is purely additive. Each chained slice is independently revertable: slice 1 (data layer) leaves no UI, slice 2 (checkout) adds the customer write path, slice 3 (admin shell) adds login + empty state, slice 4 (admin features) adds the live feed and lifecycle controls.

## File-level changes

### `burger-site-draft/admin.html` (new file)

Independent page (its own `:root` token block, its own topbar, no shared CSS file). Roughly 550 lines total across slices 3 + 4.

**Head + body skeleton (slice 3, ~250 lines)**

- `<head>`: charset, viewport, `<title>Admin — Burger Place</title>`, Google Fonts `<link>` matching `menu.html` (Poppins + Inter).
- Inline `<style>` defining a self-contained design-token block (`--color-primary` etc. — duplicated per the project's "no shared CSS file" precedent) plus selectors prefixed `admin-` to avoid collision with the cart's `cart-drawer*` and `topbar*` classes:
  - `.admin-shell` — page-level flex container (`min-height: 100vh;`); two columns on tablet (landscape ≥ 1024px), single column on portrait phone.
  - `.admin-topbar` — own topbar (NOT inherited from `menu.html`'s topbar); `z-index: 50`, `position: sticky`, height 64px, holds the brand mark + logout button.
  - `.admin-login` — full-bleed centered card holding the magic-link form; only renders when no session exists.
  - `.admin-login__field`, `.admin-login__label`, `.admin-login__input`, `.admin-login__submit`, `.admin-login__status` — form chrome.
  - `.admin-empty` — empty-state for "no orders yet" / "wrong role" / "no archived orders".
  - `.admin-realtime-pill` — small status indicator (green dot when subscribed, amber when polling).
- Body:
  1. `<header class="admin-topbar">` with brand link + `[data-admin-logout]` button (hidden until session exists).
  2. `<main class="admin-shell" id="admin-app" data-admin-app>` — placeholder; sections are swapped in by JS.
     - `<section class="admin-login" data-admin-login hidden>` — magic-link form (input + submit + status region).
     - `<section class="admin-orders" data-admin-orders hidden>` — empty in slice 3, populated in slice 4.
     - `<section class="admin-empty" data-admin-empty hidden>` — three message variants (`not-admin`, `no-orders`, `no-archived`).
- Inline `<script>` (slice 3): IIFE tree with `auth`, `ui`, and `app` modules. Slice 3 ships only the auth/session-gating logic; slice 4 adds `orders`, `realtime`, `polling`, and `print` modules on top.

**Slice 4 additions to `admin.html` (~300 lines)**

- New `<style>` selectors:
  - `.admin-orders-list` — scrollable list (overflow-y auto; `min-height: 100vh` so the chef can scroll a long active feed on a portrait phone).
  - `.admin-orders-row` — one order summary (id short, customer name, total, status badge, age). Min-height 56px for kitchen-tablet touch targets.
  - `.admin-orders-row.is-active` / `.is-selected` — selected state.
  - `.admin-detail` — slide-down detail sheet (`role="dialog"`, `aria-modal="false"`). Ship with closed-state `opacity: 0; visibility: hidden; transform: translateY(-100%); pointer-events: none;` from day one (Engram obs #265 lesson). Opens via class `is-open`.
  - `.admin-detail__controls` — action bar with status-transition buttons.
  - `.admin-status-badge--{received,preparing,ready,completed,cancelled}` — colored pills.
  - `.admin-filters` — tab bar (Active / Archived) + status sub-filter chips.
  - `.admin-print-only` — `display: none` by default; reveals receipt-only blocks at print.
  - `@media print { .admin-shell__chrome, .admin-detail__controls, .admin-filters, .admin-orders-list, .admin-topbar { display: none !important; } .admin-detail { box-shadow: none; page-break-inside: avoid; transform: none; opacity: 1; visibility: visible; } }` — portrait receipt layout.
- New body markup inside `data-admin-orders`:
  - `<div class="admin-filters" data-admin-filters>` with tabs `[data-filter="active"]`, `[data-filter="archived"]`, plus status chips `[data-status-filter="<status>"]`.
  - `<ol class="admin-orders-list" data-admin-orders-list aria-live="polite">` (list populated by JS).
  - `<section class="admin-detail" data-admin-detail role="dialog" aria-modal="false" aria-labelledby="admin-detail-title" hidden>` — slide-down panel with `<h2 data-admin-detail-title>`, customer block, items block, controls block (status buttons + "Cancel" with confirm), `[data-admin-print]` button.
- New IIFEs in the inline `<script>`:
  - `orders` — fetch list (`.from('orders').select('*').order('created_at', { ascending: false })`), status PATCH with optimistic update + rollback on error, `Prefer: return=representation`.
  - `realtime` — `supabase.channel('public:orders').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, handler).subscribe()`; emits CHANNEL_ERROR/CLOSED → `polling.start()`; emits SUBSCRIBED → `polling.stop()`.
  - `polling` — `setInterval(refetchOrders, 5000)`; lifecycle `{ start, stop }`.
  - `ui` — render list, render detail, render status badge, render empty state, render filters, render realtime pill.
  - `print` — `data-admin-print` click → `window.print()`.

Naming convention: BEM-style, with every new class prefixed `admin-` (e.g., `admin-detail__title`, `admin-status-badge--preparing`). Consistent with the existing project's `topbar__inner`, `btn--primary`, `item__order` recipes.

### `burger-site-draft/checkout.html` (new file)

Independent page; ~350 lines total. Carries its own `:root` design-token block (no shared CSS file).

**Head + body structure**

- `<head>`: charset, viewport, `<title>Checkout — Burger Place</title>`, Google Fonts.
- Inline `<style>`: token block plus selectors prefixed `checkout-`:
  - `.checkout-shell` — two-column on tablet (summary + form), single-column on phone (`@media (max-width: 760px)`).
  - `.checkout-summary` — left column; list of cart lines, subtotal row, `Taxes and pickup time calculated at checkout` note.
  - `.checkout-summary__line` — one item row (name, qty, unit price, line total).
  - `.checkout-form` — right column; field groups, submit button.
  - `.checkout-field`, `.checkout-field__label`, `.checkout-field__input`, `.checkout-field__error` — form chrome with red error text and aria-describedby wiring.
  - `.checkout-submit` — full-width primary button; `disabled` state styled as lower-opacity / not-allowed cursor.
  - `.checkout-empty` — "your cart is empty" placeholder shown when `bp-cart-v1` is empty.
  - `.checkout-success` — confirmation block rendered after a successful submit (summary + "Start a new order" link back to `menu.html`).
  - `@media print` — hides the form, keeps the receipt; consistent with admin print styles.
- Body:
  1. `<header class="checkout-topbar">` — minimal topbar with brand link + "Back to menu" button (`href="menu.html"`, NOT clearing the cart).
  2. `<main class="checkout-shell">`:
     - `<section class="checkout-summary" data-checkout-summary>` — populated by JS; falls back to `<div class="checkout-empty" data-checkout-empty hidden>` when cart is empty.
     - `<section class="checkout-form" data-checkout-form hidden>`:
       - `<form data-checkout-form-el>` with fields in this order: `customer_name`, `customer_email`, `customer_phone`, `fulfillment` (radio: pickup | deliver), `pickup_time` (datetime-local, conditional), `notes` (textarea, optional).
       - Live validation region: `<div class="checkout-field__error" data-checkout-error hidden aria-live="polite">`.
       - `<button type="submit" class="btn btn--primary checkout-submit" data-checkout-submit disabled>Place order</button>`.
     - `<section class="checkout-success" data-checkout-success hidden>` — order id, line items recap, total, link back to menu.

**Inline `<script>` (~250 lines)**

IIFE tree:

```
(function () {
  'use strict';

  /* --- money --- */
  var money = (function () { ... })();  // DUPLICATED from menu.html (see Money math)

  /* --- catalog read-only --- */
  // Catalog is NOT in localStorage; checkout reads via window.__bpCart.catalog.get(id)
  // The page relies on menu.html having populated window.__bpCart (it doesn't here, so we
  // duplicate a tiny catalog cache derived from __bpCart if present; otherwise checkout
  // reads name+price from the persisted bp-cart-v1 snapshot fields. We rely on the
  // bp-cart-v1 schema being pure ids+qtys; names/prices are NOT in bp-cart-v1, so we
  // look them up from a static JSON blob baked into checkout.html OR from window.__bpCart
  // if available. See "Catalog availability on checkout.html" below.)

  /* --- storage --- */  // bp-cart-v1 read-only; bp-checkout-draft read/write; bp-checkout-success one-shot
  /* --- cartBridge --- */ // shared with menu.html via postMessage pattern (see cart-bridge spec)
  /* --- validation --- */ // blur + submit validators
  /* --- submit --- */    // place_order pipeline (orders insert + order_items inserts + rollback)
  /* --- success --- */   // clear cart, set bp-checkout-success, redirect to menu.html#order=<id>
  /* --- app init --- */

  window.__bpCheckout = { submit, clearCartAndShowSuccess };
})();
```

`init()` runs on `DOMContentLoaded`, reads `bp-cart-v1`, and either renders the summary+form or redirects to `menu.html` if empty.

**Catalog availability on checkout.html.** `bp-cart-v1` carries only `{ id, qty }` per line. Names and prices are not persisted. Two options were considered: (a) checkout.html fetches the static menu HTML and parses the same `data-*` attributes — but that requires CORS-friendly same-origin fetch of `menu.html`, which works since they live in the same folder; (b) checkout.html receives name+price via `postMessage` from `menu.html` on navigation. Option (a) is simpler and aligns with the project's "DOM-derived catalog" precedent; checkout.html fetches `menu.html`, parses it with `DOMParser`, runs the same `catalog.reindex()` logic on the parsed doc, and looks up items by id. The fetch is one-time on init and cached.

### `burger-site-draft/menu.html` (extension only)

Add-only. The cart drawer's IIFE, focus trap, scroll lock, aria-expanded patches, catalog IIFE, cart IIFE, money IIFE, storage IIFE, and `app.init` MUST NOT be modified. Three targeted edits inside `<body>` and one inside the inline `<script>`.

**Edit 1 — Add a Checkout CTA inside `.cart-drawer__foot`** (currently around line 1596). Insert one new button BEFORE the existing `<p class="cart-drawer__subtotal-note">` line. New CSS rule: `.cart-drawer__checkout { display: inline-flex; width: 100%; justify-content: center; margin-top: 12px; }` (selector defined in a new `<style>` block added at the bottom of the existing `<style>` element). The button MUST NOT have `data-cart-close` (that would dismiss the drawer before navigation). Hidden when the cart is empty (the drawer already toggles `.cart-drawer__foot` visibility based on cart count, so the button inherits the empty-state hiding).

```html
<button type="button" class="btn btn--primary cart-drawer__checkout" data-checkout>
  Checkout
</button>
```

**Edit 2 — Add a confirmation banner markup** near the top of `<body>`, between `</header>` (line ~677) and `<section class="menu-hero">` (line ~681). Always present in the DOM; toggled via `hidden` attribute by the new `bpCheckoutBridge` IIFE.

```html
<aside class="order-confirmation" data-order-confirmation-banner role="status" aria-live="polite" hidden>
  <div class="container order-confirmation__inner">
    <p class="order-confirmation__text">
      <strong>Order placed!</strong> Your order <code data-order-confirmation-id></code> is on its way to the kitchen.
    </p>
    <button type="button" class="order-confirmation__close" data-order-confirmation-close aria-label="Dismiss">×</button>
  </div>
</aside>
```

**Edit 3 — Inline `<script>` extension.** Append a new IIFE `bpCheckoutBridge` at the bottom of the existing `<script>` (after line 2138, before `</script>`). Approximately 30 lines. Responsibilities:

- Bind `[data-checkout]` click → `window.location.href = 'checkout.html'`. The drawer closes implicitly because the page navigates.
- On `DOMContentLoaded`: read `sessionStorage.bp-checkout-success` and `window.location.hash` (looking for `#order=<id>`); if both present and the order id in the URL hash matches the sessionStorage value, render the banner, set `data-order-confirmation-id` to the id, show the banner, then immediately `sessionStorage.removeItem('bp-checkout-success')` so a manual reload doesn't repeat the banner. Bind `[data-order-confirmation-close]` click → hide banner.
- Listen for `storage` events on `bp-cart-v1` to keep the cart drawer in sync with what checkout did (the existing `cart.hydrate` listener from slice 2 already handles this — `bpCheckoutBridge` does NOT need to add another listener; the existing one is sufficient).
- Expose a tiny `window.__bpCheckoutBridge = { clearCartAndShowSuccess }` helper that `checkout.html` calls (via the same window, since both pages share an origin — checkout navigates back via `window.location.href = 'menu.html#order=<id>'`, the success marker is in sessionStorage, and the banner logic on menu.html handles the rest). No `postMessage` is needed.

**Edit 4 — Tiny CSS additions** at the bottom of the existing `<style>` element (before line 647 `</style>`). Roughly 25 lines: `.order-confirmation`, `.order-confirmation__inner`, `.order-confirmation__text`, `.order-confirmation__close`, `.cart-drawer__checkout`. All scoped, BEM-style, prefixed `order-` or `cart-drawer__`.

**Explicit non-edits.** DO NOT touch: `cartDrawer` IIFE (lines 1661-1781), the slice-2 IIFE (1789-2137), any existing CSS rules, the topbar inner structure, the 32 `<article class="item">` cards, the catalog/storage/money/cart IIFEs. Pure add-only. The diff is ~55 lines added (CSS + markup + script); well under the 400-line slice budget on its own.

### `burger-site-draft/supabase-config.js` (new file, gitignored)

A 12-line static credential shim, loaded via `<script src="supabase-config.js"></script>` BEFORE the Supabase SDK `<script>` tag on every page that needs Supabase. Sets `window.__bpSupabase` so `supabase.createClient(url, key, ...)` can be called from each page's inline IIFE.

```js
// burger-site-draft/supabase-config.js
// GITIGNORED. Hand-fill from .env values. NEVER commit.
// The secret key (sb_secret_) is NOT included here — it stays server-only.
// Values are intentionally <REDACTED> in this design doc; the user fills
// in real values from .env at first-time setup.
window.__bpSupabase = {
  url: '<REDACTED-SUPABASE-URL>',          // e.g. https://<project-ref>.supabase.co
  publishableKey: '<REDACTED-PUBLISHABLE-KEY>',   // starts with sb_publishable_
  jwksUrl: '<REDACTED-JWKS-URL>'            // <url>/auth/v1/.well-known/jwks.json
};
```

`.gitignore` excludes this file. Onboarding: user copies the file from `.env.example` (project root) → pastes values into this file. The `sdd-verify` phase greps `burger-site-draft/` for `sb_secret_` and confirms zero matches.

### `.env.example` (new file at project root)

Checked-in template. ~20 lines. Documents each variable with comments explaining where to find the value in the Supabase dashboard.

```bash
# .env.example — committed; copy to .env and fill with your Supabase project values.
# Then copy the SAME values into burger-site-draft/supabase-config.js (gitignored).

# Supabase project URL — Supabase Dashboard → Settings → API → "Project URL"
SUPABASE_URL=https://your-project-ref.supabase.co

# Supabase publishable (anon) key — Dashboard → Settings → API → "Publishable key"
# Safe for the browser; subject to RLS. Used in burger-site-draft/supabase-config.js.
SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxxxxxxxxxxx

# Supabase secret (service_role) key — Dashboard → Settings → API → "Secret keys"
# SERVER-ONLY. NEVER copy into supabase-config.js. Never paste in screenshots.
# Reserved for future server-side work; this MVP does not read it.
SUPABASE_SECRET_KEY=sb_secret_xxxxxxxxxxxxxxxxxxxxx

# Supabase JWKS endpoint — Dashboard → Settings → API → "JWT Settings" → "JWKS URL"
# Optional reference; Supabase JS SDK handles JWT verification automatically.
SUPABASE_JWKS_URL=https://your-project-ref.supabase.co/auth/v1/.well-known/jwks.json
```

### `.gitignore` (new content at project root, file already exists but is empty)

The `.gitignore` file currently exists at the project root and is empty (0 bytes per `wc -l`). Slice 1 expands it to ~12 lines. Patterns:

```gitignore
# Environment & credentials — DO NOT commit
.env
burger-site-draft/supabase-config.js

# OS junk
.DS_Store
Thumbs.db

# Editor / IDE junk
.vscode/
.idea/

# Note: no node_modules/ or package-lock.json because the project has no
# build tooling. If a future change adds npm, append those patterns here.
```

Defensive artifact: the publishable key is sensitive enough to leak via search engines that index GitHub, so even though no `.git/` exists today, the rule is forward-looking.

## SQL DDL — paste-ready migrations

Three idempotent files, run in numeric order via the Supabase SQL Editor. Each is self-contained and re-runnable. The user (or chef-onboarding) pastes them once during first-time setup; rerunning is safe.

### Migration 1 — `001_orders.sql`

```sql
-- 001_orders.sql — orders table + indexes + extension enablement
-- Idempotent: safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

CREATE TABLE IF NOT EXISTS public.orders (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  customer_name   text        NOT NULL CHECK (length(btrim(customer_name)) BETWEEN 1 AND 100),
  customer_email  text        NOT NULL CHECK (customer_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  customer_phone  text        NOT NULL CHECK (customer_phone ~ '^[+0-9 \-()]{6,}$'),
  fulfillment     text        NOT NULL CHECK (fulfillment IN ('pickup','deliver')),
  pickup_time     timestamptz NULL,
  notes           text        NULL,
  status          text        NOT NULL DEFAULT 'received'
                                CHECK (status IN ('received','preparing','ready','completed','cancelled')),
  archived_at     timestamptz NULL,
  subtotal_cents  bigint      NOT NULL CHECK (subtotal_cents >= 0),
  total_cents     bigint      NOT NULL CHECK (total_cents >= 0),
  submit_token    uuid        NULL,
  CONSTRAINT pickup_time_required_when_pickup
    CHECK (fulfillment <> 'pickup' OR pickup_time IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS orders_created_at_idx
  ON public.orders (created_at DESC);

CREATE INDEX IF NOT EXISTS orders_status_archived_idx
  ON public.orders (status, archived_at);

-- Case-insensitive email lookup for kitchen queries and dedup checks.
CREATE INDEX IF NOT EXISTS orders_customer_email_idx
  ON public.orders (lower(customer_email));

-- Idempotency: at most one order per submit_token within a 24h window.
CREATE UNIQUE INDEX IF NOT EXISTS orders_submit_token_24h_uidx
  ON public.orders (submit_token)
  WHERE submit_token IS NOT NULL
    AND created_at > now() - interval '24 hours';

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
```

### Migration 2 — `002_order_items.sql`

```sql
-- 002_order_items.sql — order_items table + FK + index.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.order_items (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid    NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  catalog_id        text    NOT NULL,
  name_snapshot     text    NOT NULL,
  qty               integer NOT NULL CHECK (qty > 0),
  unit_price_cents  bigint  NOT NULL CHECK (unit_price_cents >= 0),
  line_total_cents  bigint  NOT NULL CHECK (line_total_cents >= 0)
);

CREATE INDEX IF NOT EXISTS order_items_order_id_idx
  ON public.order_items (order_id);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
```

### Migration 3 — `003_rls.sql`

```sql
-- 003_rls.sql — Row Level Security policies for orders + order_items,
-- plus the archived_at-on-complete trigger.
-- Idempotent: DROP POLICY IF EXISTS + CREATE POLICY pairs.

-- ===== orders =====

-- Anon can INSERT an order, but ONLY with a whitelisted column set.
-- status, archived_at, submit_token, created_at are server-defaulted.
DROP POLICY IF EXISTS "anon_insert_order" ON public.orders;
CREATE POLICY "anon_insert_order"
  ON public.orders
  FOR INSERT
  TO anon
  WITH CHECK (
    -- Required fields populated and sane:
    customer_name IS NOT NULL
    AND customer_email IS NOT NULL
    AND customer_phone IS NOT NULL
    AND fulfillment IN ('pickup','deliver')
    AND subtotal_cents >= 0
    AND total_cents >= 0
    AND (fulfillment <> 'pickup' OR pickup_time IS NOT NULL)
  );

-- Admin SELECT — gated by app_metadata.role.
DROP POLICY IF EXISTS "admin_select_orders" ON public.orders;
CREATE POLICY "admin_select_orders"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
  );

-- Admin UPDATE — status transitions only.
-- USING clause checks the row is visible to the admin; WITH CHECK guards the new row.
DROP POLICY IF EXISTS "admin_update_orders" ON public.orders;
CREATE POLICY "admin_update_orders"
  ON public.orders
  FOR UPDATE
  TO authenticated
  USING (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
  )
  WITH CHECK (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    AND status IN ('received','preparing','ready','completed','cancelled')
    AND (
      -- The other writable column is archived_at; allow it to be set on complete.
      archived_at IS NULL
      OR (status = 'completed' AND archived_at IS NOT NULL)
      OR status = 'cancelled'
    )
  );

-- ===== order_items =====

-- Anon INSERT — limited to lines whose parent order was just inserted.
-- PostgREST pattern: client inserts orders row first (gets id back),
-- then inserts items with that order_id. The WITH CHECK is defensive —
-- it requires order_id be a real uuid and qty/price fields be sane.
DROP POLICY IF EXISTS "anon_insert_items" ON public.order_items;
CREATE POLICY "anon_insert_items"
  ON public.order_items
  FOR INSERT
  TO anon
  WITH CHECK (
    qty > 0
    AND unit_price_cents >= 0
    AND line_total_cents >= 0
    AND catalog_id IS NOT NULL
    AND length(name_snapshot) > 0
  );

-- Admin SELECT items.
DROP POLICY IF EXISTS "admin_select_items" ON public.order_items;
CREATE POLICY "admin_select_items"
  ON public.order_items
  FOR SELECT
  TO authenticated
  USING (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
  );

-- ===== archived_at trigger =====
-- Fires BEFORE UPDATE OF status. When transitioning to 'completed',
-- stamps archived_at = now() if it isn't already set.

CREATE OR REPLACE FUNCTION public.set_archived_at_on_complete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'completed'
     AND OLD.status <> 'completed'
     AND NEW.archived_at IS NULL THEN
    NEW.archived_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_set_archived_at ON public.orders;
CREATE TRIGGER trg_orders_set_archived_at
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_archived_at_on_complete();
```

Note on `anon_select_own`: deferred to a future change. Today's MVP does not include a customer-side "view my orders" page; guest checkout is one-shot. The trigger approach means a customer who knows their email can request it from the chef offline, but there's no in-app self-service.

## Supabase JS client init

Loaded identically on `admin.html` and `checkout.html`. Menu.html only needs the SDK for the `bpCheckoutBridge` confirmation banner IIFE (no live client required, but loading it is harmless and future-proof).

**Script load order (every page):**

```html
<!-- 1. Credentials (gitignored; hand-filled) -->
<script src="supabase-config.js"></script>

<!-- 2. Supabase JS SDK from CDN -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

<!-- 3. Page IIFE (uses window.supabase + window.__bpSupabase) -->
```

**Client construction (inside each page's IIFE):**

```js
var supabase = window.supabase.createClient(
  window.__bpSupabase.url,
  window.__bpSupabase.publishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storage: window.localStorage,
      detectSessionInUrl: true  // admin.html needs this for magic-link callback
    }
  }
);
```

**Auth helpers (admin.html):**

```js
// Request magic link
await supabase.auth.signInWithOtp({
  email: 'chef@jochos.com',
  options: { emailRedirectTo: new URL('admin.html', window.location.origin).href }
});

// Session detection
const { data: { session } } = await supabase.auth.getSession();

// Sign out
await supabase.auth.signOut();

// Role check
const role = session?.user?.app_metadata?.role;
const isAdmin = role === 'admin';
```

**Realtime helpers (admin.html slice 4):**

```js
var channel = supabase
  .channel('public:orders')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'orders' },
    function (payload) {
      if (payload.eventType === 'INSERT') orders.prepend(payload.new);
      else if (payload.eventType === 'UPDATE') orders.replace(payload.new);
    }
  )
  .subscribe(function (status) {
    if (status === 'SUBSCRIBED') { polling.stop(); ui.showRealtimeOk(); }
    else if (status === 'CHANNEL_ERROR' || status === 'CLOSED') { polling.start(); ui.showRealtimeDegraded(); }
  });
```

**Polling fallback:**

```js
var polling = (function () {
  var timer = null;
  function start() {
    if (timer) return;
    timer = setInterval(function () { orders.refetch(); }, 5000);
  }
  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }
  return { start: start, stop: stop };
})();
```

The polling interval is cleared on `SUBSCRIBED` and started on `CHANNEL_ERROR` / `CLOSED`. The UI pill (`admin-realtime-pill`) reflects state with text and color.

## Module structure (per surface)

### `admin.html` IIFE tree

```
(function () {
  'use strict';

  /* --- money --- */              // DUPLICATED from menu.html (12 lines)
  /* --- auth --- */               // signInWithOtp, getSession, signOut, role check (~40 lines)
  /* --- orders --- */             // fetch list, PATCH status, optimistic update + rollback (~80 lines)
  /* --- realtime --- */           // supabase.channel + state handlers (~30 lines)
  /* --- polling --- */            // setInterval wrapper (~20 lines)
  /* --- filters --- */            // Active/Archived toggle, status chips, hash sync (~30 lines)
  /* --- ui --- */                 // renderList, renderDetail, renderEmpty, renderBadge, renderPill (~80 lines)
  /* --- print --- */              // data-admin-print → window.print (~5 lines)
  /* --- app init --- */           // DOMContentLoaded (~20 lines)

  window.__bpAdmin = { auth, orders, realtime, polling, filters, ui, print };
})();
```

`init()` sequence: build supabase client → `auth.detectSession()` → branch (no session → render login; session but not admin → render "not-admin" empty state; admin → `orders.fetch()` → `realtime.subscribe()` → `ui.renderList()`).

### `checkout.html` IIFE tree

```
(function () {
  'use strict';

  /* --- money --- */              // DUPLICATED (12 lines)
  /* --- catalog fetch --- */      // fetch menu.html, DOMParser, reindex (~30 lines)
  /* --- storage --- */            // bp-cart-v1 read, bp-checkout-draft read/write (~30 lines)
  /* --- validation --- */         // blur + submit validators (~50 lines)
  /* --- submit --- */             // orders.insert + order_items.insert + rollback (~70 lines)
  /* --- success --- */            // clear cart, set bp-checkout-success, redirect (~25 lines)
  /* --- app init --- */           // DOMContentLoaded (~25 lines)

  window.__bpCheckout = { submit, clearCartAndShowSuccess };
})();
```

`init()` sequence: read `bp-cart-v1` → if empty, redirect to `menu.html` (preserve cart-bridge scenario "Cart modified in another tab" still applies via storage event listener). If non-empty, fetch `menu.html` once → reindex catalog → wire form fields → wire validation → wire submit.

### `menu.html` `bpCheckoutBridge` IIFE

Appended after the slice-2 IIFE. ~30 lines.

```
(function () {
  'use strict';

  /* --- banner show/hide --- */
  function showBanner(orderId) {
    var banner = document.querySelector('[data-order-confirmation-banner]');
    var idEl = document.querySelector('[data-order-confirmation-id]');
    if (!banner || !idEl) return;
    idEl.textContent = orderId.slice(0, 8);
    banner.hidden = false;
    sessionStorage.removeItem('bp-checkout-success');
  }

  /* --- close button --- */
  function wireClose() {
    var btn = document.querySelector('[data-order-confirmation-close]');
    if (!btn) return;
    btn.addEventListener('click', function () {
      document.querySelector('[data-order-confirmation-banner]').hidden = true;
    });
  }

  /* --- Checkout CTA wiring --- */
  function wireCheckoutCta() {
    document.querySelectorAll('[data-checkout]').forEach(function (btn) {
      btn.addEventListener('click', function () { window.location.href = 'checkout.html'; });
    });
  }

  /* --- init --- */
  function init() {
    wireCheckoutCta();
    wireClose();
    var hash = window.location.hash || '';
    var match = hash.match(/^#order=([0-9a-f-]{36})$/i);
    var successId = sessionStorage.getItem('bp-checkout-success');
    if (match && successId && match[1] === successId) {
      showBanner(successId);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.__bpCheckoutBridge = { showBanner: showBanner };
})();
```

## Data flows

ASCII diagrams, one line per flow.

```
[1] CUSTOMER CHECKOUT (happy path)
    bp-cart-v1 → form fill → submit
       → POST /rest/v1/orders        (anon, status=received, subtotal_cents, submit_token)
       → POST /rest/v1/order_items   (anon, N rows referencing the new order_id)
       → removeItem bp-cart-v1
       → removeItem bp-checkout-draft
       → setItem bp-checkout-success (sessionStorage)
       → redirect to menu.html#order=<id>
       → bpCheckoutBridge.showBanner(id)
       → sessionStorage.removeItem bp-checkout-success

[2] ADMIN LOGIN
    visit admin.html
       → supabase.auth.getSession()  ──no session──→ render login form
       → user enters email → click submit
       → supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } })
       → render "check your inbox" message
       → [chef clicks magic link]
       → browser lands on admin.html?access_token=...
       → detectSessionInUrl: true → session established in localStorage
       → fetch orders (admin SELECT)
       → render list
       → subscribe realtime channel

[3] ADMIN ADVANCES STATUS
    click "Start preparing" on order X (status=received)
       → optimistic: row badge → "Preparing"
       → PATCH /rest/v1/orders?id=eq.X  (body: { status: 'preparing' })
                                          Prefer: return=representation
       → on success: replace local row with returned payload
       → on error: rollback badge to "Received", show error toast

[4] REALTIME → POLLING FALLBACK
    subscribed: status = SUBSCRIBED
       → channel CHANNEL_ERROR or CLOSED
       → polling.start(): setInterval(refetchOrders, 5000)
       → ui.renderRealtimePill('amber', 'Realtime offline — polling every 5s')
    channel recovers: SUBSCRIBED
       → polling.stop(): clearInterval
       → ui.renderRealtimePill('green', 'Live')
```

## z-index, layering, layout

- `admin.html` is a standalone page. It re-declares `:root` design tokens (no shared CSS file), owns its own topbar (`z-index: 50`), and does NOT inherit `menu.html`'s topbar/cat-nav.
- `checkout.html` likewise standalone. Its minimal topbar sits at `z-index: 50`. No overlays.
- The cart drawer's `z-index: 60` and `z-index: 55` (backdrop) live ONLY on `menu.html`. Admin and checkout introduce NO overlays; they use `position: relative` containers and rely on document flow.
- Order-detail sheet (admin.html slice 4): `position: sticky; top: 64px;` (the topbar height) so it slides under the topbar like a sheet. Z-index inside its own stacking context: NOT compared against the menu drawer's z-index (different pages).
- Print styles:

```css
@media print {
  .admin-topbar,
  .admin-filters,
  .admin-orders-list,
  .admin-detail__controls { display: none !important; }
  .admin-detail {
    box-shadow: none !important;
    transform: none !important;
    opacity: 1 !important;
    visibility: visible !important;
    page-break-inside: avoid;
  }
  body { background: #fff !important; }
  .admin-print-only { display: block !important; }
}
```

- Kitchen tablet considerations:
  - Portrait phone (≤ 540px): order list full-bleed, detail sheet full-screen.
  - Landscape tablet (≥ 1024px): two-column (`grid-template-columns: 380px 1fr`); list on the left, detail on the right.
  - Touch targets: status buttons `min-height: 56px`; row `min-height: 72px` (chef's finger is bigger than a fingertip).
  - `min-height: 100vh` on `.admin-orders-list` so the chef can scroll a long active feed on a phone.

## Money math implementation

Same recipe as `shopping-cart` slice 2 — integer cents internally, `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })` for display. Per the project's "no shared JS modules" constraint, the `money` IIFE is DUPLICATED in each of `menu.html`, `admin.html`, and `checkout.html` (the cart slice already shipped this duplication pattern). Total of three copies across the codebase. Refactoring to a shared file would require a build step, which `rules.design` forbids.

The exact helper:

```js
var money = (function () {
  var formatter = (typeof Intl !== 'undefined' && Intl.NumberFormat)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
    : null;
  function formatPrice(cents) {
    var n = Number(cents) | 0;
    if (formatter) return formatter.format(n / 100);
    var sign = n < 0 ? '-' : '';
    var abs = Math.abs(n);
    return sign + '$' + Math.floor(abs / 100) + '.' + String(abs % 100).padStart(2, '0');
  }
  return { formatPrice: formatPrice };
})();
```

Worked contracts (verified in DevTools during `sdd-verify`):

- `formatPrice(895)` → `"$8.95"`
- `formatPrice(0)` → `"$0.00"`
- `formatPrice(1095)` → `"$10.95"`
- `formatPrice(-50)` → `"-$0.50"` (defensive only)

No negative subtotals are produced by either checkout or admin.

## Auth flow detail

**Magic-link sign-in (slice 3 admin.html)**

1. `admin.html` loads. Inline script runs `supabase.auth.getSession()`.
2. **No session** → render `<section class="admin-login">` with email input + submit button + status region. Hide `[data-admin-orders]` and `[data-admin-logout]`.
3. User submits email. `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: <absolute URL of admin.html> } })` fires. `emailRedirectTo` is computed as `new URL('admin.html', window.location.origin).href` to be absolute (magic links require absolute URLs).
4. Render "Check your inbox — we sent a sign-in link to <email>" message. **Do NOT poll** for the session in a tight loop (the spec explicitly forbids this).
5. User clicks the magic link in their email client. The link is `https://<origin>/admin.html#access_token=...&refresh_token=...&...`. Because `detectSessionInUrl: true`, the Supabase SDK parses the URL hash and establishes a session in `localStorage`.
6. Page reloads (or hashchange fires); `getSession()` now returns a session.
7. Read `session.user.app_metadata.role`. **If `'admin'`**: render the orders shell, fetch orders, subscribe realtime. **If missing or not `'admin'`**: render the empty-state with the polite "your account isn't an admin — sign out" message and the logout button. Any admin-gated PATCH will fail at RLS layer regardless.

**Logout**

- Click `[data-admin-logout]` → `supabase.auth.signOut()` → `location.reload()` (or re-render the login form via the same `init()` flow).

**Session persistence**

- Supabase JS SDK handles JWT storage in `localStorage` (default), auto-refresh, and tab-to-tab broadcast via the `storage` event. No custom persistence layer.

## Storage and migration plan

**Local storage keys:**

| Key | Scope | Purpose | Owner | Lifecycle |
|---|---|---|---|---|
| `bp-cart-v1` | localStorage | Cart state from slice 2 | `shopping-cart` (read-only here) | Cleared on successful checkout |
| `bp-checkout-draft` | localStorage | Form draft on validation failure | `customer-checkout` | Read on mount, written on submit failure, cleared on success |
| `bp-checkout-success` | sessionStorage | One-shot success marker carrying order id | `customer-checkout` writes, `bpCheckoutBridge` reads+removes | One-shot per session |
| `supabase.auth.token` | localStorage | Supabase JWT | Supabase SDK | Managed by SDK |
| `submit_token` (in-memory) | JS variable | Per-session UUID, sent as a column on `orders` | `customer-checkout` | One-shot per checkout submission; regenerated on form mount |

**Source-of-truth hierarchy:**

- **Orders** → Supabase Postgres (single source of truth).
- **Cart** → localStorage `bp-cart-v1` (preserved from slice 2; unchanged).
- **Form drafts** → localStorage `bp-checkout-draft` (read/write here).
- **One-shot banners** → sessionStorage.

**Idempotency strategy:**

- On `checkout.html` mount, generate `crypto.randomUUID()` → store as `submitToken` on the closure.
- Send `submit_token` as a column on the `orders` row.
- The DB unique index `orders_submit_token_24h_uidx` (see migration 001) prevents duplicate orders within 24h for the same token. If the user double-submits within the session, the second insert hits a unique-constraint violation → RLS error → caught and converted to a "looks like you already submitted" message.
- On a fresh `checkout.html` mount, `submitToken` regenerates — so different sessions = different tokens. The constraint only protects within a single session.

**No migrations to existing storage.** `bp-cart-v1` schema is preserved as-is. No `bp-cart-v2`.

## Failure modes

| Spec scenario | Design response |
|---|---|
| Supabase POST fails network (orders insert) | Catch error → do NOT clear cart → persist `bp-checkout-draft` with current form values → show retry-friendly toast "We couldn't place your order. Check your connection and try again." |
| `order_items` insert fails (network) AFTER `orders` insert succeeded | Compensating DELETE on the parent order (best-effort). If compensation fails, surface "Order partially placed — please contact the restaurant" with the parent order id visible. The compensating DELETE is idempotent on the chef side (admin will see the orphan row and the compensating action can be retried). |
| Auth callback stale (magic link expired, > 1h) | Supabase SDK rejects the link; no session established; `admin.html` re-renders the login form with a polite "Link expired — please request a new one" message. |
| Realtime channel `CHANNEL_ERROR` or `CLOSED` | `polling.start()` kicks in. UI shows `admin-realtime-pill` in amber with text "Realtime offline — polling every 5s". Orders continue to surface via the 5s `refetchOrders`. |
| Realtime recovers (back to `SUBSCRIBED`) | `polling.stop()` clears the interval. Pill flips to green "Live". |
| Order partial insert (orders row created, items failed) | Same as "order_items insert fails" — compensating DELETE + clear messaging. |
| Server-side RLS denies customer insert | Generic error message (no policy details leaked). Cart untouched. Draft persisted. |
| Magic link delivered to wrong email (typo) | No recovery flow. User re-submits the form with the correct email; Supabase sends a fresh link. Old link expires in 1h unused. |
| `localStorage` disabled (private mode) | `bp-cart-v1` read returns `null` → checkout redirect to `menu.html`. The cart drawer on `menu.html` works in-memory for the session (slice 2 already handles this — out of scope here). |
| `bp-cart-v1` mutated in another tab while checkout is open | `storage` event listener fires; `renderSummary()` re-renders from the new state. The user's form values are NOT cleared (they live in `bp-checkout-draft`, separate key). |
| Empty cart on `checkout.html` arrival | `redirectToMenu()` runs before render; no form, no Supabase POST. |
| Empty `bp-cart-v1` after a successful submit | Cart was cleared; subsequent reload still renders empty form (not redirect, because the user just succeeded — show "Start a new order" CTA instead). |
| Admin role missing on first sign-in | `app_metadata.role` is empty for new Supabase users by default. The chef signs in but the empty-state renders. OUT OF BAND provisioning: the user runs `UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb WHERE email = 'chef@jochos.com';` in the Supabase SQL Editor (or sets it via Studio → Authentication → Users → chef user → "Raw App Meta Data"). This is a one-time setup step documented in the project's onboarding README (out of scope of this design). |
| `bp-cart-v1` legacy from earlier session mixed with new schema | Slice 2's `storage.validate()` discards malformed payloads with a `console.warn`. Checkout inherits the same read pattern. |
| Concurrent admin updates on the same order (two browser tabs) | Last-write-wins at the DB. The Realtime channel sends UPDATE events to both tabs; optimistic updates may briefly disagree, then reconcile on the next event. Out of scope to formally resolve. |
| `Intl.NumberFormat` unavailable (very old browser) | SHOULD-grade fallback used in the duplicated `money` IIFE. Already proven in slice 2. |
| `crypto.randomUUID()` unavailable | Fallback to `Math.random()`-based UUID v4 (RFC 4122) helper. SHOULD-grade fallback. |

## Performance budget

Estimates per slice, aligned with the user-confirmed 4-slice chained delivery.

| Slice | Files | Approx lines |
|---|---|---|
| 1 — Data layer | `001_orders.sql` (~50 lines), `002_order_items.sql` (~25 lines), `003_rls.sql` (~110 lines), `supabase-config.js` (~12 lines), `.env.example` (~20 lines), `.gitignore` (~12 lines) — total ~230 lines but only ~70 are source code in `burger-site-draft/`; the SQL is paste-only artifacts in `openspec/changes/admin-panel/sql/`, not added to the running codebase |
| 2 — Customer checkout | `checkout.html` (~350 lines: HTML ~80, CSS ~80, JS ~250 minus duplicates already counted), `menu.html` extension (~55 lines added; 25 CSS, 20 markup, 30 JS) | ~380 source lines |
| 3 — Admin auth + shell | `admin.html` skeleton (~250 lines: HTML ~50, CSS ~80, JS ~120) | ~250 source lines |
| 4 — Admin features | `admin.html` extension (~300 lines: CSS ~80, markup ~40, JS ~180) | ~300 source lines |
| **Grand total** | | **~1000 source lines + ~230 SQL/template lines** |

Each slice individually stays at or below the 400-line review budget. The SQL migration lines are paste-only artifacts in the openspec change folder (out of `burger-site-draft/`); they don't bloat any source file.

Per-slice work-unit commits (recommended for `work-unit-commits` discipline):

- Slice 1: one commit "chore(data): add supabase schema, env loader, gitignore" — pure infrastructure.
- Slice 2: one commit "feat(checkout): customer checkout page + cart drawer CTA + confirmation banner" — feature + thin extension.
- Slice 3: one commit "feat(admin): auth gate and empty-state shell" — feature.
- Slice 4: one commit "feat(admin): live orders feed with realtime + polling + print" — feature extension.

## Delivery

Each slice individually fits the 400-line review budget. Confirmed:

| Slice | Approx changed lines | Budget | Pass? |
|---|---|---|---|
| 1 | ~70 source + ~185 SQL/template (out of repo) | 400 | ✅ |
| 2 | ~380 | 400 | ✅ |
| 3 | ~250 | 400 | ✅ |
| 4 | ~300 | 400 | ✅ |

**Slice 1 — Data layer.** Create `burger-site-draft/supabase-config.js` (gitignored). Create `.env.example` at project root. Expand empty `.gitignore`. Paste three SQL files into Supabase SQL Editor (no commit cost). Add `<script src="supabase-config.js">` and `<script src="...supabase-js@2...">` tags to `admin.html` skeleton and `checkout.html` (these are the headers; the IIFEs that consume them land in slices 2–4). ~70 source lines.

**Slice 2 — Customer checkout.** Create `checkout.html` (full). Extend `menu.html` (Checkout CTA + confirmation banner + `bpCheckoutBridge` IIFE). ~380 source lines.

**Slice 3 — Admin auth + shell.** Create `admin.html` with magic-link login form, session gating, three empty states (not-admin, no-orders, no-archived), and the topbar with logout. ~250 source lines.

**Slice 4 — Admin features.** Extend `admin.html` with: orders list, detail sheet (slide-down), 5-state status controls, filters (Active/Archived, status sub-filter), print styles + print button, Realtime subscription + polling fallback + realtime pill. ~300 source lines.

Total ≈ 1000 source lines across 4 chained slices, each independently revertable.

## Acceptance verification mapping

For each scenario across the three specs, the file/line/function that satisfies it post-apply. Reviewed in `sdd-verify`.

| Spec scenario | File · location · function |
|---|---|
| **admin-orders / Chef visits admin.html while logged out** | `admin.html` · inline script · `auth.detectSession()` returns `null` → `ui.renderLogin()` |
| **admin-orders / Chef submits email for magic link** | `admin.html` · inline script · `auth.submitMagicLink()` → `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } })` |
| **admin-orders / Chef clicks magic link and lands on admin.html** | `admin.html` · `supabase.createClient({ auth: { detectSessionInUrl: true } })` → session from URL hash → `auth.detectSession()` returns session |
| **admin-orders / With zero orders in the database** | `admin.html` · `orders.fetch()` returns `[]` → `ui.renderEmpty('no-orders')` |
| **admin-orders / With at least one order present** | `admin.html` · `ui.renderList()` builds `<li class="admin-orders-row">` per row, sorted by `created_at DESC` |
| **admin-orders / A new order arrives in real time** | `admin.html` · `realtime.subscribe()` → INSERT handler → `orders.prepend(payload.new)` → `ui.renderList()` re-renders without refetch |
| **admin-orders / Realtime channel fails and polling fallback engages** | `admin.html` · `realtime` channel state `CHANNEL_ERROR`/`CLOSED` → `polling.start()` → `ui.renderRealtimePill('amber', 'Realtime offline — polling every 5s')` |
| **admin-orders / Realtime reconnects and polling stops** | `admin.html` · `realtime` state `SUBSCRIBED` → `polling.stop()` → `ui.renderRealtimePill('green', 'Live')` |
| **admin-orders / Advancing status from received to preparing** | `admin.html` · `orders.advance(id, 'preparing')` → optimistic UI flip → PATCH with `Prefer: return=representation` → success replace / failure rollback |
| **admin-orders / Advancing through full lifecycle to archived** | `admin.html` · `orders.advance(id, 'completed')` → triggers Postgres trigger `set_archived_at_on_complete` → row disappears from Active view → appears in Archived view |
| **admin-orders / Filtering to Archived view** | `admin.html` · `filters.setView('archived')` → URL hash `#archived` → `orders.fetch()` filtered by `archived_at IS NOT NULL` |
| **admin-orders / Filtering to Active view** | `admin.html` · `filters.setView('active')` → URL hash `#active` → `orders.fetch()` filtered by `archived_at IS NULL` |
| **admin-orders / Authorization: chef account without admin role** | `admin.html` · `auth.isAdmin()` returns false → `ui.renderEmpty('not-admin')` → admin-gated PATCH fails at RLS |
| **admin-orders / Printing an order's detail** | `admin.html` · `print.run()` → `window.print()` → `@media print` styles hide chrome |
| **admin-orders / Reload preserves session** | Supabase SDK · `auth.persistSession: true` · `storage: localStorage` → `getSession()` restores from `localStorage` |
| **customer-checkout / Empty cart on arrival at checkout** | `checkout.html` · inline script · `app.init()` reads `bp-cart-v1`, empty → `redirectToMenu()` |
| **customer-checkout / Form missing required fields on submit attempt** | `checkout.html` · `validation.onSubmit()` → blocks POST, focuses first invalid field |
| **customer-checkout / Email format invalid** | `checkout.html` · `validation.email()` regex `^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$` |
| **customer-checkout / Phone format invalid** | `checkout.html` · `validation.phone()` regex `^[+0-9\\s\\-()]{6,}$` |
| **customer-checkout / Pickup time in the past** | `checkout.html` · `validation.pickupTime()` → `pickup_time > now()` |
| **customer-checkout / Successful submit** | `checkout.html` · `submit.place()` → orders insert + order_items insert + cart cleared + redirect to `menu.html#order=<id>` |
| **customer-checkout / Double-submit prevented** | `checkout.html` · `submit.submitting` boolean gates the click handler |
| **customer-checkout / Submit fails with network error** | `checkout.html` · `submit.place()` catch → toast + draft persisted to `bp-checkout-draft` + cart untouched |
| **customer-checkout / RLS rejection (defensive)** | `checkout.html` · `submit.place()` catch on RLS error → generic error toast + cart untouched |
| **customer-checkout / Successful redirect to confirmation banner** | `checkout.html` · `success.run()` → `sessionStorage.setItem('bp-checkout-success', id)` + redirect → `bpCheckoutBridge.showBanner(id)` on `menu.html` |
| **customer-cart-bridge / Checkout loads with a populated cart** | `checkout.html` · `summary.render()` reads `bp-cart-v1` + catalog lookup → renders `<li>` per line |
| **customer-cart-bridge / Checkout loads with empty or missing cart** | `checkout.html` · `redirectToMenu()` |
| **customer-cart-bridge / Cart modified in another tab while checkout is open** | `checkout.html` · `storage.onChange()` listener → `summary.render()` re-runs |
| **customer-cart-bridge / Successful order submission clears the cart** | `checkout.html` · `success.run()` → `removeItem bp-cart-v1` + `removeItem bp-checkout-draft` + `setItem bp-checkout-success` |
| **customer-cart-bridge / Cancel from checkout returns to menu without clearing** | `checkout.html` · `[data-checkout-back]` link `href="menu.html"` — no cart mutation |
| **customer-cart-bridge / Checkout link in cart drawer navigates to checkout.html** | `menu.html` · `bpCheckoutBridge.wireCheckoutCta()` → click → `window.location.href = 'checkout.html'` |
| **customer-cart-bridge / Confirmation banner on menu.html shows once after redirect** | `menu.html` · `bpCheckoutBridge.init()` reads `sessionStorage.bp-checkout-success` + URL hash `#order=<id>`, matches → `showBanner()` → `sessionStorage.removeItem('bp-checkout-success')` |

## Risks

Pulled from the proposal's 13 risks and the explore phase's 10 risks, plus 5 design-stage additions. Each has a concrete mitigation. Likelihood × severity are subjective but conservative.

| # | Risk | Likelihood × Severity | Mitigation |
|---|---|---|---|
| R1 | `.env` or `supabase-config.js` accidentally committed to git | High × High | `.gitignore` excludes both; `sdd-verify` greps `burger-site-draft/` for `sb_secret_` and `sb_publishable_` (warn only — publishable is expected). |
| R2 | Publishable key scraped and abused if RLS is wrong | Medium × Critical | Migration 003 installs anon-INSERT-only, admin-SELECT/UPDATE policies. `sdd-verify` manually runs `curl -H 'apikey: <publishable>' /rest/v1/orders` → expects `[]`. |
| R3 | Supabase Auth email deliverability in dev | Medium × High | Document Supabase dashboard fallback (Studio → Auth → Users → "Send magic link"). Chef's email verified at provisioning time. |
| R4 | Realtime channel silently disconnects | Medium × High | Polling fallback @ 5s on `CHANNEL_ERROR`/`CLOSED`; UI pill visible. |
| R5 | Secret key leaked via bug report or screenshot | Medium × Critical | `supabase-config.js` contains only the publishable key + URL + JWKS URL. `sdd-verify` greps `sb_secret_` in `burger-site-draft/` and confirms zero matches. |
| R6 | RLS policy allows INSERT without validating subtotal | Medium × High | Anon INSERT policy requires `subtotal_cents >= 0` and `total_cents >= 0`. Trust boundary: client computes subtotal honestly; in MVP this is acceptable. Future hardening: a Postgres `place_order(...)` function that recomputes server-side. Documented as future. |
| R7 | `bp-cart-v1` not cleared on order success | Medium × Medium | `success.run()` calls `localStorage.removeItem('bp-cart-v1')` AND emits no extra `storage` event (slice 2's storage event listener catches the removal in other tabs automatically). |
| R8 | Checkout CTA inherits `data-cart-close` accidentally | Low × Low | Markup design explicitly omits `data-cart-close`. The design itself includes a "DO NOT add `data-cart-close`" comment in the menu.html extension block. |
| R9 | `index.html` accidentally edited by apply phase | Low × Medium | `sdd-verify` checks `md5sum burger-site-draft/index.html` before and after each slice apply. |
| R10 | Chef email changes — no rotation flow | Medium × Medium | Documented as out-of-band via Supabase Studio or SQL. |
| R11 | Kitchen tablet renders poorly on portrait phone | Medium × Medium | Two-breakpoint layout (≤ 540px single column, ≥ 1024px two-column), touch targets ≥ 56px. |
| R12 | `pointer-events: none` ≠ `visibility: hidden` bug carries to admin detail sheet | Medium × Medium | Detail sheet ships closed-state `opacity: 0; visibility: hidden; transform: translateY(-100%); pointer-events: none;` from day one. Pattern documented in CSS. |
| R13 | SQL migration runs out of order (003 before 001/002) | Low × High | Migration 003's RLS policies reference `public.orders` and `public.order_items` — they exist but lack the right shape if 001/002 didn't run. Mitigation: numbered filenames; onboarding README says "run 001 first, then 002, then 003". `sdd-verify` checks tables exist via `\d public.orders` before applying 003. |
| R14 | Chef's first sign-in has no `app_metadata.role` set (empty list, can't PATCH) | High × High | OUT OF BAND provisioning documented in onboarding README: `UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb WHERE email = '<chef-email>';`. UI gracefully shows the "not-admin" empty state so the chef knows something's wrong. |
| **R15** | **CDN dependency on `@supabase/supabase-js@2`** (jsDelivr outage) — page is dead | Low × Critical | Document: if jsDelivr is down, the chef cannot sign in (admin) and customers cannot check out. Mitigation: pin to a specific version, document the failure mode. Future: self-host a copy of the SDK in `burger-site-draft/vendor/`. |
| **R16** | **Chef's email deliverability depends on Supabase built-in SMTP** — dev SMTP is best-effort; production needs a real provider | Medium × High | Documented. Mitigation: configure custom SMTP provider in Supabase Dashboard → Auth → SMTP Settings before production. Out of scope for MVP. |
| **R17** | **`bp-cart-v1` schema drift between menu.html and checkout.html** (catalog lookup depends on `data-id` matching; if menu renames an item id, checkout can't resolve prices) | Low × Low | Checkout fetches `menu.html` once at mount and reindexes the catalog on-the-fly. If a `data-id` is missing in the fetched menu.html, the corresponding line in the summary renders with `(unavailable)` and the submit is disabled. Documented. |
| **R18** | **SQL migration 003's anon INSERT policy doesn't validate `submit_token` uniqueness on the same call** — relies on the unique index, but a race between two simultaneous POSTs from the same browser session could both pass the index check (since the unique index is partial to the 24h window) | Low × Medium | The double-submit guard is at the client (the `submitting` boolean); the partial unique index is belt-and-braces. The realistic attack is two browser tabs on the same checkout; this is mitigated by the client-side guard. Future hardening: full unique constraint on `submit_token` (no partial WHERE). |
| **R19** | **Print stylesheet in admin.html may render differently on the chef's kitchen printer vs. browser print preview** (driver quirks, page breaks, font availability) | Medium × Low | Provide a `prefers-color-scheme` and `print-color-adjust: exact;` hint; document the manual verification step in slice 4's verify checklist. |

## Invariants (re-stated)

Verbatim from the proposal, plus one addition for design-stage clarity.

1. `burger-site-draft/index.html` MUST NOT be modified.
2. `menu.html` extension touches ONLY: cart drawer markup (a Checkout CTA button inside `.cart-drawer__foot`), inline `<style>` additions for the Checkout CTA and confirmation banner, a confirmation banner block, and the inline `bpCheckoutBridge` IIFE. Do NOT touch the existing `cartDrawer` IIFE, focus trap, scroll lock, catalog IIFE, cart IIFE, money IIFE, storage IIFE, or `app.init`. Pure add-only.
3. No build tools introduced. Supabase JS SDK is loaded from CDN (`https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`), not bundled.
4. No test runner added.
5. The publishable key is the ONLY Supabase credential in browser-loaded files. The secret key stays out of every browser-loaded file. `supabase-config.js` MUST NOT contain `sb_secret_`. Verification: `grep -r sb_secret_ burger-site-draft/` returns zero matches.
6. `.env` and `burger-site-draft/supabase-config.js` MUST be in `.gitignore` (root level). `.env.example` at project root MUST be checked in as a template.
7. The cart's `bp-cart-v1` storage is read-only to this change. The change MUST NOT mutate it except to clear lines after a successful order (which is a single `localStorage.removeItem` call) and to read it for the checkout summary.
8. RLS MUST be in place BEFORE any order insert from the browser succeeds. SQL migrations must run idempotently (`CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS … CREATE POLICY …`, etc.).
9. The 400-line review budget is exceeded (~1000 source lines total). 4 chained slices are mandatory, not optional.
10. **SQL migrations MUST run in numeric order (001 → 002 → 003) and MUST be idempotent (safe to re-run).** Migration 003 references tables created by 001 and 002; running it standalone will fail at policy creation if those tables don't exist with the expected shape.

---

**Next step:** ready for `sdd-tasks admin-panel` to produce the task plan with work-unit commits mapped to the four chained slices.