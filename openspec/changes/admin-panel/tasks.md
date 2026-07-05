# Tasks: Admin Panel — orders dashboard, customer checkout, cart bridge

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1000 source + ~230 SQL/template |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | Slice 1 → Slice 2 → Slice 3 → Slice 4 (4 chained PRs to main) |
| Delivery strategy | chained |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

---

## Summary

Four chained slices implementing: (1) SQL schema + env scaffolding, (2) customer checkout + cart bridge, (3) admin auth + shell skeleton, (4) admin live feed + status controls + filters + print. Each slice is independently revertable and stays within the 400-line review budget.

---

## Slice 1 — Data layer + env loader

**PR title:** `chore(data): add supabase schema, env loader, gitignore`

### 1.1 — Author SQL migration files

**Why:** The orders and order_items tables, CHECK constraints, indexes, RLS policies, and the archived_at trigger must exist in Supabase before any browser code can read or write them. These are idempotent paste-ready files.

**Files:**
- `openspec/changes/admin-panel/sql/001_orders.sql` (new)
- `openspec/changes/admin-panel/sql/002_order_items.sql` (new)
- `openspec/changes/admin-panel/sql/003_rls.sql` (new)

**Specifics:** Copy verbatim from `design.md` sections "Migration 1", "Migration 2", "Migration 3". Each file must use `CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS … CREATE POLICY`, `CREATE INDEX IF NOT EXISTS` — fully idempotent. Migration 003's policies reference `public.orders` and `public.order_items`; it MUST run after 001 and 002.

**Acceptance:**
- [ ] 001_orders.sql creates `public.orders` with all columns, CHECK constraints, and three indexes
- [ ] 002_order_items.sql creates `public.order_items` with FK to orders, index on order_id
- [ ] 003_rls.sql creates anon-INSERT policy, admin-SELECT policy, admin-UPDATE policy for orders; anon-INSERT and admin-SELECT for order_items; trigger `trg_orders_set_archived_at`
- [ ] All three files re-run safely without errors

**Estimated lines changed:** 185 (SQL paste-only artifacts, not in burger-site-draft/)

**Conventional commit type:** `chore:`

**PR title:** `chore(data): add supabase schema, env loader, gitignore`

---

### 1.2 — Create .env.example template

**Why:** First-time setup requires a checked-in template so new developers know which env vars are needed and where to find them in the Supabase dashboard.

**Files:**
- `.env.example` (new at project root)

**Specifics:** Write ~20-line file. Sections: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY (anon key, browser-safe), SUPABASE_SECRET_KEY (server-only, clearly marked), SUPABASE_JWKS_URL. Each variable has a leading comment explaining where to find the value in Supabase Dashboard → Settings → API.

**Acceptance:**
- [ ] File exists at project root with all four variables documented
- [ ] Secret key comment explicitly says "SERVER-ONLY — never paste into supabase-config.js"

**Estimated lines changed:** 22

**Conventional commit type:** `chore:`

**PR title:** `chore(data): add supabase schema, env loader, gitignore`

---

### 1.3 — Create supabase-config.js

**Why:** Browser pages need the Supabase URL, publishable key, and JWKS URL before the SDK initializes. This gitignored file sets `window.__bpSupabase`.

**Files:**
- `burger-site-draft/supabase-config.js` (new, gitignored)

**Specifics:** 12-line static JS file. Sets `window.__bpSupabase = { url, publishableKey, jwksUrl }` with placeholder values from .env.example. Header comment: "GITIGNORED. Hand-fill from .env values. NEVER commit. The secret key (sb_secret_) is NOT included here." Uses the verified Supabase project ref `ouhwfkxqpxikqhwcqioc.supabase.co` and placeholder publishable key.

**Acceptance:**
- [ ] File loads before Supabase SDK on admin.html and checkout.html
- [ ] No `sb_secret_` string present anywhere in the file
- [ ] File is gitignored (verified by .gitignore task)

**Estimated lines changed:** 14

**Conventional commit type:** `chore:`

**PR title:** `chore(data): add supabase schema, env loader, gitignore`

---

### 1.4 — Expand .gitignore

**Why:** `.env` and `supabase-config.js` contain credentials and must never be committed. The existing `.gitignore` is empty (0 bytes).

**Files:**
- `.gitignore` (edit at project root)

**Specifics:** Add sections: "# Environment & credentials" (.env, supabase-config.js), "# OS junk" (.DS_Store, Thumbs.db), "# Editor / IDE junk" (.vscode/, .idea/). Preserve any existing content.

**Acceptance:**
- [ ] .gitignore contains `.env` and `burger-site-draft/supabase-config.js`
- [ ] `grep -r "sb_secret_" burger-site-draft/` returns zero matches after this slice

**Estimated lines changed:** 12

**Conventional commit type:** `chore:`

**PR title:** `chore(data): add supabase schema, env loader, gitignore`

---

### 1.5 — Add Supabase SDK + config script tags to admin.html skeleton

**Why:** Slice 3 and 4 IIFEs need `window.__bpSupabase` and the Supabase JS SDK loaded before they run.

**Files:**
- `burger-site-draft/admin.html` (new, skeleton only)

**Specifics:** In `<head>`: (1) `<script src="supabase-config.js"></script>`, (2) `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>`, (3) inline `<script>` that calls `window.supabase = window.supabase.createClient(window.__bpSupabase.url, window.__bpSupabase.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, storage: window.localStorage, detectSessionInUrl: true } })`. This sets up the `window.supabase` global used by slices 3 and 4.

**Acceptance:**
- [ ] admin.html loads without 404 errors
- [ ] `window.supabase` is defined in DevTools console after page load
- [ ] `detectSessionInUrl: true` is set (required for magic-link callback)

**Estimated lines changed:** 30

**Conventional commit type:** `feat:`

**PR title:** `feat(admin): auth gate and empty-state shell`

---

### 1.6 — Create admin.html shell (page title + heading + body container)

**Why:** The admin page needs a minimal HTML skeleton — page title, topbar placeholder, and `id="admin-root"` body container — so it loads cleanly in the browser even before slices 3 and 4 fill it in.

**Files:**
- `burger-site-draft/admin.html` (new)

**Specifics:** `<head>` with charset, viewport, `<title>Admin — Burger Place</title>`, Google Fonts link (Poppins + Inter matching menu.html). Minimal `<body>`: `<header class="admin-topbar">` with brand link + `[data-admin-logout]` button (hidden until session), `<main id="admin-root">`. Inline `<style>` block: `:root` token block, `.admin-shell` placeholder, `.admin-realtime-pill` (green dot). Empty; slices 3–4 populate it.

**Acceptance:**
- [ ] File opens in browser without JS errors
- [ ] Page title shows "Admin — Burger Place"
- [ ] No 404 errors in console

**Estimated lines changed:** 28

**Conventional commit type:** `feat:`

**PR title:** `feat(admin): auth gate and empty-state shell`

---

### 1.7 — Document manual SQL paste step

**Why:** SQL migrations are paste-only (no `psql` CLI in this project). The onboarding step must be documented clearly so the chef runs them in the correct order.

**Files:**
- `openspec/changes/admin-panel/sql/README.md` (new)

**Specifics:** Single-paragraph instruction: open Supabase Studio → SQL Editor → paste 001_orders.sql → Run → repeat for 002 and 003 in order. Note: migrations are idempotent and safe to re-run.

**Acceptance:**
- [ ] README exists in `openspec/changes/admin-panel/sql/`
- [ ] Step clearly says "run in numeric order: 001 → 002 → 003"

**Estimated lines changed:** 18

**Conventional commit type:** `docs:`

**PR title:** `chore(data): add supabase schema, env loader, gitignore`

---

### 1.8 — Slice 1 verification (manual browser checks)

**Why:** The data layer must be verified in a live Supabase session before slices 2–4 are applied.

**Specifics:** Manual checklist:
1. Open Supabase Studio SQL Editor, run 001_orders.sql → confirm `public.orders` table exists with all columns
2. Run 002_order_items.sql → confirm `public.order_items` table exists with FK
3. Run 003_rls.sql → confirm RLS is enabled on both tables
4. Open `https://ouhwfkxqpxikqhwcqioc.supabase.co` → Authentication → Users → confirm at least one user exists (chef account for later)
5. Open `admin.html` in browser → console shows no 404 errors, `window.supabase` is defined
6. `grep -r "sb_secret_" burger-site-draft/` returns zero matches

**Acceptance:**
- [ ] All three SQL migrations run without error
- [ ] admin.html page loads cleanly
- [ ] No secret key strings in burger-site-draft/

**Estimated lines changed:** 0 (verification only)

**Conventional commit type:** `chore:`

**PR title:** `chore(data): add supabase schema, env loader, gitignore`

---

## Slice 2 — Customer checkout + cart bridge

**PR title:** `feat(checkout): customer checkout page + cart drawer CTA + confirmation banner`

### 2.1 — Build checkout.html head + inline style

**Why:** The checkout page is a standalone surface with its own design tokens, matching the project's "no shared CSS file" rule.

**Files:**
- `burger-site-draft/checkout.html` (new)

**Specifics:** `<head>`: charset, viewport, `<title>Checkout — Burger Place</title>`, Google Fonts (Poppins + Inter). Inline `<style>` with `:root` token block (`--color-primary`, `--color-text`, etc.) plus prefixed selectors: `.checkout-shell` (two-column on tablet, single on phone @ 760px), `.checkout-summary`, `.checkout-summary__line`, `.checkout-form`, `.checkout-field*`, `.checkout-submit`, `.checkout-empty`, `.checkout-success`. `@media print` hides form, keeps receipt. ~80 lines.

**Acceptance:**
- [ ] Page renders without layout breakage on mobile (≤540px) and desktop (≥1024px)
- [ ] Design tokens match the project's visual language (Poppons headings, Poppins/Inter body)

**Estimated lines changed:** 75

**Conventional commit type:** `feat:`

**PR title:** `feat(checkout): customer checkout page + cart drawer CTA + confirmation banner`

---

### 2.2 — Build checkout form markup

**Why:** The form collects customer contact info and fulfillment preference before submission. It must be accessible and follow the field order from the spec.

**Files:**
- `burger-site-draft/checkout.html` (new)

**Specifics:** Inside `<section class="checkout-form" data-checkout-form hidden>`: `<form data-checkout-form-el>` with fields: `customer_name` (text), `customer_email` (email), `customer_phone` (tel), fulfillment radios (`pickup` | `deliver`), `pickup_time` (datetime-local, conditional on pickup), `notes` (textarea, optional). Each field has associated `<label>` and `aria-describedby` wiring to error region. Submit button: `<button type="submit" class="btn btn--primary checkout-submit" data-checkout-submit disabled>Place order</button>`. Error region: `<div class="checkout-field__error" data-checkout-error hidden aria-live="polite">`. Success section: `<section class="checkout-success" data-checkout-success hidden>` with order recap.

**Acceptance:**
- [ ] All required fields present in correct order
- [ ] `pickup_time` field is hidden when "Deliver" is selected
- [ ] Submit button is disabled until all required fields pass validation
- [ ] `aria-describedby` correctly associates errors with fields

**Estimated lines changed:** 55

**Conventional commit type:** `feat:`

**PR title:** `feat(checkout): customer checkout page + cart drawer CTA + confirmation banner`

---

### 2.3 — Inline script: form validation + idempotency token + draft persistence

**Why:** Client-side validation prevents invalid submissions, the idempotency token prevents duplicate orders within a session, and draft persistence lets users recover after a network failure.

**Files:**
- `burger-site-draft/checkout.html` (new, inline `<script>`)

**Specifics:** IIFE with modules: `money` (DUPLICATED from menu.html, ~12 lines), `catalog` (fetches menu.html once, DOMParser, reindex — ~30 lines), `storage` (reads `bp-cart-v1`, reads/writes `bp-checkout-draft` — ~30 lines), `validation` (blur + submit validators — ~50 lines). On `DOMContentLoaded`: generate `crypto.randomUUID()` as `submitToken` (closure). `validation.email()` uses regex `^[^\s@]+@[^\s@]+\.[^\s@]+$`. `validation.phone()` uses `^[+0-9\s\-()]{6,}$`. `validation.pickupTime()` checks `pickup_time > now()`. Errors rendered via `aria-describedby`. Submit button `disabled` attribute toggled by validation state. Draft persisted to `bp-checkout-draft` on blur and on submit failure.

**Acceptance:**
- [ ] Empty name shows inline error "Name is required"
- [ ] Invalid email shows "Enter a valid email"
- [ ] Invalid phone shows "Enter a valid phone number"
- [ ] Past pickup time shows "Pickup time must be in the future"
- [ ] Draft is pre-filled on next visit after network failure

**Estimated lines changed:** 100

**Conventional commit type:** `feat:`

**PR title:** `feat(checkout): customer checkout page + cart drawer CTA + confirmation banner`

---

### 2.4 — Inline script: submit handler with orders + order_items insert + rollback

**Why:** The submit pipeline must atomically create the order and its line items, handle network errors gracefully, and clear the cart on success.

**Files:**
- `burger-site-draft/checkout.html` (new, inline `<script>`)

**Specifics:** `submit` module: guarded by `submitting` boolean (prevents double-submit). Builds `orderRow` from form + cart + submitToken. Calls `supabase.from('orders').insert(orderRow).select().single()` first. On success: batch-inserts `order_items` rows via `supabase.from('order_items').insert(itemsArray)`. On order_items failure: compensating DELETE on parent order via `supabase.from('orders').delete().eq('id', orderId)`. On any failure: toast "We couldn't place your order. Check your connection and try again." + persist draft. On total success: `clearCartAndShowSuccess(orderId)` → `localStorage.removeItem('bp-cart-v1')`, `localStorage.removeItem('bp-checkout-draft')`, `sessionStorage.setItem('bp-checkout-success', orderId)`, `window.location.href = 'menu.html#order=' + orderId`.

**Acceptance:**
- [ ] Network error on orders insert: cart NOT cleared, draft persisted, retry-friendly message shown
- [ ] Network error on order_items: compensating DELETE attempted, partial-placement message shown with order id
- [ ] Double-click of submit button: second request blocked while first is in-flight
- [ ] Successful submit: cart cleared, redirected to menu.html with `#order=<id>` hash

**Estimated lines changed:** 120

**Conventional commit type:** `feat:`

**PR title:** `feat(checkout): customer checkout page + cart drawer CTA + confirmation banner`

---

### 2.5 — Extend menu.html: add Checkout CTA inside .cart-drawer__foot

**Why:** The cart drawer footer (line ~1596) is the natural place for the checkout CTA. The drawer is open/close only; no other cart behavior is modified.

**Files:**
- `burger-site-draft/menu.html` (edit)

**Specifics:** Inside `<footer class="cart-drawer__foot" data-cart-foot hidden>`, after the `<p class="cart-drawer__subtotal-note">` (line ~1601), insert: `<button type="button" class="btn btn--primary cart-drawer__checkout" data-checkout>Checkout</button>`. NOTE: this button MUST NOT have `data-cart-close` — navigation to checkout.html implicitly closes the drawer via page navigation. Also insert confirmation banner markup near top of `<body>`, between `</header>` (line ~677) and `<section class="menu-hero">` (line ~681): `<aside class="order-confirmation" ...>` block with `data-order-confirmation-banner`, `data-order-confirmation-id`, `data-order-confirmation-close`.

**Acceptance:**
- [ ] Checkout button visible inside cart drawer when cart has ≥1 item
- [ ] Checkout button NOT present in DOM when cart is empty (inherits drawer foot hidden behavior)
- [ ] Clicking Checkout navigates to checkout.html
- [ ] Confirmation banner markup present in DOM (hidden by default)

**Estimated lines changed:** 22

**Conventional commit type:** `feat:`

**PR title:** `feat(checkout): customer checkout page + cart drawer CTA + confirmation banner`

---

### 2.6 — Extend menu.html: add bpCheckoutBridge IIFE

**Why:** The bridge wires the checkout CTA, shows the confirmation banner on redirect from checkout.html, and syncs across tabs via the existing storage listener.

**Files:**
- `burger-site-draft/menu.html` (edit inline `<script>`)

**Specifics:** Append new IIFE `bpCheckoutBridge` at the bottom of the existing `<script>` (after line 2138, before `</script>`). ~30 lines. Responsibilities: (1) `[data-checkout]` click → `window.location.href = 'checkout.html'`. (2) On `DOMContentLoaded`: read `sessionStorage.getItem('bp-checkout-success')` and `window.location.hash` (`#order=<id>`); if both present and match, render banner, set `data-order-confirmation-id` text, show banner, then `sessionStorage.removeItem('bp-checkout-success')`. (3) `[data-order-confirmation-close]` click → hide banner. Listens to existing `bp-cart-v1` storage events via the slice-2 cart module's existing `attachChangeListener` — no additional storage listener needed.

**Acceptance:**
- [ ] Navigating to `menu.html#order=<id>` with matching sessionStorage shows confirmation banner once
- [ ] Manual reload of `menu.html#order=<id>` does NOT show banner again
- [ ] Closing banner hides it (hidden attribute set)
- [ ] `window.__bpCheckoutBridge` is defined

**Estimated lines changed:** 32

**Conventional commit type:** `feat:`

**PR title:** `feat(checkout): customer checkout page + cart drawer CTA + confirmation banner`

---

### 2.7 — Extend menu.html: add CSS for cart-drawer__checkout and confirmation banner

**Why:** The Checkout button and confirmation banner need styling consistent with the project's BEM conventions.

**Files:**
- `burger-site-draft/menu.html` (edit inline `<style>`)

**Specifics:** At bottom of existing `<style>` element (before line 647 `</style>`), add: `.cart-drawer__checkout` (`display: inline-flex; width: 100%; justify-content: center; margin-top: 12px;`), `.order-confirmation` (hidden by default, full-width banner), `.order-confirmation__inner` (container, padding), `.order-confirmation__text`, `.order-confirmation__close`. ~25 lines. All BEM-prefixed with `order-` or `cart-drawer__`.

**Acceptance:**
- [ ] Checkout button spans full width of drawer foot, centered text
- [ ] Confirmation banner uses same container as menu hero
- [ ] No style collision with existing cart-drawer or topbar styles

**Estimated lines changed:** 25

**Conventional commit type:** `feat:`

**PR title:** `feat(checkout): customer checkout page + cart drawer CTA + confirmation banner`

---

### 2.8 — Slice 2 verification (manual browser checks)

**Why:** End-to-end checkout flow must work in a live browser session.

**Specifics:** Manual checklist:
1. Open `menu.html`, add 2 items to cart, click Checkout CTA → navigates to `checkout.html`
2. `checkout.html` shows itemized summary with correct names, qty, unit prices, line totals, subtotal
3. Submit with empty name → error "Name is required"
4. Fill name "Juan", email "juan@test.com", phone "555-1234", pickup radio selected → pickup_time field appears
5. Set pickup_time to a future date/time. Submit → order placed successfully
6. Redirected to `menu.html`, confirmation banner visible with order id prefix
7. Reload `menu.html` → banner gone
8. Open checkout with empty cart → redirected to menu.html
9. In second tab, open checkout with items. In first tab, add item to cart. Second tab's summary re-renders (storage event)
10. Submit checkout, network disconnected → error toast shown, cart NOT cleared, draft pre-filled on retry

**Acceptance:**
- [ ] Full happy path: cart → checkout form → submit → confirmation → cart cleared
- [ ] Validation blocks submit with inline errors
- [ ] Network error shows retry-friendly message, preserves cart
- [ ] Storage event in another tab updates summary
- [ ] Double-submit blocked

**Estimated lines changed:** 0 (verification only)

**Conventional commit type:** `chore:`

**PR title:** `feat(checkout): customer checkout page + cart drawer CTA + confirmation banner`

---

## Slice 3 — Admin auth + shell

**PR title:** `feat(admin): auth gate and empty-state shell`

### 3.1 — Build admin.html body markup: login form + main app shell skeleton

**Why:** The admin page requires a magic-link login form, a protected main shell, and three empty-state variants — all visible only when appropriate.

**Files:**
- `burger-site-draft/admin.html` (edit)

**Specifics:** Inside `<main id="admin-root">`: (1) `<section class="admin-login" data-admin-login hidden>` with email input (`name="email"`, `type="email"`, `autocomplete="email"`), submit button, and `<output class="admin-login__status" data-admin-login-status aria-live="polite">`. (2) `<section class="admin-orders" data-admin-orders hidden>` — empty in slice 3; slices 3–4 progressively fill it. (3) `<section class="admin-empty" data-admin-empty hidden>` with three message variants toggled by `data-empty-reason="not-admin|no-orders|no-archived"`. Topbar: `<header class="admin-topbar">` with brand `<a href="menu.html">`, `[data-admin-logout]` button (hidden until authenticated). Realtime pill: `<span class="admin-realtime-pill" data-admin-realtime-pill hidden>`.

**Acceptance:**
- [ ] Login form visible when no session exists
- [ ] Order list and empty state both hidden initially
- [ ] Topbar brand link points to menu.html
- [ ] Logout button present but hidden until session established

**Estimated lines changed:** 80

**Conventional commit type:** `feat:`

**PR title:** `feat(admin): auth gate and empty-state shell`

---

### 3.2 — Inline script: bpAdminAuth IIFE — signInWithOtp + getSession + onAuthStateChange + signOut + role check

**Why:** Admin auth uses Supabase magic-link. The inline script must handle the full auth lifecycle: detect existing session on load, submit magic-link, receive callback, and sign out.

**Files:**
- `burger-site-draft/admin.html` (edit inline `<script>`)

**Specifics:** New IIFE `bpAdminAuth` (~120 lines) added to the inline `<script>` already in the page. Modules: `auth` with `submitMagicLink(email)` → `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: new URL('admin.html', window.location.origin).href } })`, `detectSession()` → `supabase.auth.getSession()`, `onAuthStateChange()` → `supabase.auth.onAuthStateChange(...)`, `signOut()` → `supabase.auth.signOut()`. `isAdmin()` checks `session?.user?.app_metadata?.role === 'admin'`. Init flow: `detectSession()` → if no session → `ui.renderLogin()`; if session but not admin → `ui.renderEmpty('not-admin')`; if admin → proceed to orders. `onAuthStateChange` re-runs init on any auth event.

**Acceptance:**
- [ ] Email submit → "Check your inbox" message shown, no tight polling loop
- [ ] Magic-link click → session established, orders shell shown
- [ ] Wrong role (non-admin) → polite "not admin" empty state + sign-out button
- [ ] Sign-out → reload → login form shown

**Estimated lines changed:** 125

**Conventional commit type:** `feat:`

**PR title:** `feat(admin): auth gate and empty-state shell`

---

### 3.3 — Inline script: empty-state messaging + role-mismatch message

**Why:** The admin shell needs three distinct empty states communicated clearly so the chef knows what to expect.

**Files:**
- `burger-site-draft/admin.html` (edit inline `<script>`)

**Specifics:** `ui.renderEmpty(reason)` function: `reason === 'not-admin'` → shows "Your account isn't an admin — contact the restaurant manager." + sign-out button; `reason === 'no-orders'` → shows "No orders yet — new orders will appear here automatically."; `reason === 'no-archived'` → shows "No archived orders yet." Each message is a separate `<p>` inside `data-admin-empty`, toggled via `hidden` and `data-empty-reason`.

**Acceptance:**
- [ ] Non-admin session → "not-admin" message + sign-out button visible
- [ ] Admin session with zero orders → "no-orders" message visible
- [ ] Admin session with zero archived → "no-archived" message visible
- [ ] Messages are polite and non-technical

**Estimated lines changed:** 30

**Conventional commit type:** `feat:`

**PR title:** `feat(admin): auth gate and empty-state shell`

---

### 3.4 — Slice 3 verification (manual browser checks)

**Why:** Auth flow must be verified in a live browser session before the orders shell is populated.

**Specifics:** Manual checklist:
1. Open `admin.html` with no prior session → login form shown, orders list hidden
2. Enter valid email, submit → "Check your inbox" message shown
3. Click magic link in inbox (dev: use Supabase Studio → Authentication → Users → "Send magic link" as fallback) → session established, topbar + orders shell shown, logout button visible
4. Reload page → session persists, orders shell still shown
5. Sign out → login form shown, session cleared
6. Use a non-admin account → "not admin" empty state with sign-out button visible
7. `window.__bpAdmin.auth.isAdmin()` returns correct boolean in DevTools

**Acceptance:**
- [ ] Magic-link flow completes without errors
- [ ] Session persists across reload
- [ ] Non-admin account handled gracefully
- [ ] No `sb_secret_` strings in admin.html source

**Estimated lines changed:** 0 (verification only)

**Conventional commit type:** `chore:`

**PR title:** `feat(admin): auth gate and empty-state shell`

---

## Slice 4 — Admin features (live feed + status controls + filter + print)

**PR title:** `feat(admin): live orders feed with realtime + polling + print`

### 4.1 — Inline script: bpAdminOrders IIFE — list rendering + fetch + transformation

**Why:** The orders list fetches from Supabase, transforms rows into renderable objects, and displays them sorted by `created_at DESC`.

**Files:**
- `burger-site-draft/admin.html` (edit inline `<script>`)

**Specifics:** `orders` module (~80 lines): `fetch(filter)` → `supabase.from('orders').select('*').order('created_at', { ascending: false })` with optional filter (active: `archived_at=is.null`; archived: `archived_at=not.is.null`). Returns transformed rows: `{ id, shortId, customerName, total, status, age }`. `prepend(newRow)` and `replace(updatedRow)` for realtime event handling. `advance(id, newStatus)` → optimistic update in local state + `supabase.from('orders').update({ status: newStatus }).eq('id', id)` with `Prefer: return=representation` header; on failure: rollback + `ui.showError()`. `getById(id)` for detail panel.

**Acceptance:**
- [ ] `orders.fetch('active')` returns only rows where `archived_at IS NULL`
- [ ] `orders.fetch('archived')` returns only rows where `archived_at IS NOT NULL`
- [ ] Rows sorted newest-first
- [ ] Optimistic status update reverts on PATCH failure

**Estimated lines changed:** 80

**Conventional commit type:** `feat:`

**PR title:** `feat(admin): live orders feed with realtime + polling + print`

---

### 4.2 — Inline script: realtime subscription with polling fallback

**Why:** The live feed must show new orders within ~1 second via Supabase Realtime, and degrade gracefully to 5-second polling when the channel errors or closes.

**Files:**
- `burger-site-draft/admin.html` (edit inline `<script>`)

**Specifics:** `realtime` module (~70 lines): `supabase.channel('public:orders').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, handler)` where handler calls `orders.prepend(payload.new)` on INSERT and `orders.replace(payload.new)` on UPDATE. `.subscribe()` callback: on `SUBSCRIBED` → `polling.stop()` + `ui.showRealtimeOk()`; on `CHANNEL_ERROR` or `CLOSED` → `polling.start()` + `ui.showRealtimeDegraded()`. `polling` module: `{ start(), stop() }` wrapping `setInterval(refetchOrders, 5000)` / `clearInterval`. Realtime pill: green dot + "Live" when subscribed; amber + "Realtime offline — polling every 5s" when polling.

**Acceptance:**
- [ ] New order inserted in second tab appears in first tab's list within 5 seconds
- [ ] `CHANNEL_ERROR` triggers polling fallback and amber pill
- [ ] `SUBSCRIBED` recovers and stops polling, green pill restored
- [ ] `polling.stop()` clears the interval (no interval accumulation on multiple SUBSCRIBED events)

**Estimated lines changed:** 72

**Conventional commit type:** `feat:`

**PR title:** `feat(admin): live orders feed with realtime + polling + print`

---

### 4.3 — Inline script: status controls — render next legal transition only + optimistic update + rollback

**Why:** The chef advances an order through its lifecycle by clicking a single contextual button. The UI shows only the next legal transition, never arbitrary status values.

**Files:**
- `burger-site-draft/admin.html` (edit inline `<script>`)

**Specifics:** `ui.renderControls(order)` inside the detail panel: renders exactly one button based on current status: `received` → "Start preparing"; `preparing` → "Mark ready"; `ready` → "Complete"; `received|preparing|ready` → "Cancel" (with confirm dialog). `cancelled` and `completed` → no controls (terminal states). Each button: `data-status-action="<nextStatus>"`. Clicking calls `orders.advance(id, nextStatus)` → optimistic badge flip → PATCH → success replaces local row / failure reverts badge + shows error toast. Cancel requires `window.confirm()` before issuing the PATCH.

**Acceptance:**
- [ ] "Start preparing" visible only on `received` orders
- [ ] "Mark ready" visible only on `preparing` orders
- [ ] "Complete" visible only on `ready` orders; sets `archived_at` (verified in DB)
- [ ] "Cancel" visible on `received|preparing|ready`; blocked by confirm dialog
- [ ] Optimistic update reverts correctly on network failure
- [ ] `completed` and `cancelled` orders show no status controls

**Estimated lines changed:** 82

**Conventional commit type:** `feat:`

**PR title:** `feat(admin): live orders feed with realtime + polling + print`

---

### 4.4 — Inline script: filters (Active/Archived + status subfilter) with URL hash persistence

**Why:** The chef switches between active and archived views, and optionally filters by status. The URL hash preserves the view across reloads and enables deep-linking.

**Files:**
- `burger-site-draft/admin.html` (edit inline `<script>`)

**Specifics:** `filters` module (~40 lines): `setView('active'|'archived')` + optional `setStatusFilter(status|null)`. URL hash mapping: `#active` → active view; `#archived` → archived view; `#status=preparing` → status subfilter. On load: parse `window.location.hash`, apply filter, render list. Tab bar: `[data-filter="active"]` and `[data-filter="archived"]` buttons. Status chips: `[data-status-filter="received"]`, etc. Active view: shows only `archived_at IS NULL` rows; Archived view: shows only `archived_at IS NOT NULL` rows. Within Active: status chips filter by `status` column.

**Acceptance:**
- [ ] Clicking "Archived" tab → only archived orders shown, URL hash updated to `#archived`
- [ ] Clicking "Active" tab → only active orders shown, URL hash updated to `#active`
- [ ] Reloading with `#status=preparing` → pre-selects the "preparing" chip
- [ ] Empty filter result shows empty-state message

**Estimated lines changed:** 42

**Conventional commit type:** `feat:`

**PR title:** `feat(admin): live orders feed with realtime + polling + print`

---

### 4.5 — CSS for @media print: hide chrome, render only detail panel as receipt

**Why:** The chef prints a receipt from the order detail panel. Print styles must hide all chrome (topbar, list, filters, controls) and show only the detail panel in a clean portrait receipt layout.

**Files:**
- `burger-site-draft/admin.html` (edit inline `<style>`)

**Specifics:** Append to existing `<style>` block in admin.html: `@media print { .admin-topbar, .admin-filters, .admin-orders-list, .admin-detail__controls, .admin-realtime-pill { display: none !important; } .admin-detail { box-shadow: none; transform: none; opacity: 1; visibility: visible; page-break-inside: avoid; } .admin-detail__controls { display: none; } body { background: #fff !important; } }`. Also add `.admin-print-only { display: none }` default; `@media print { .admin-print-only { display: block !important } }`. `print` module: `[data-admin-print]` click → `window.print()`.

**Acceptance:**
- [ ] Browser print preview shows only the detail panel, no topbar/list/filters
- [ ] Receipt is portrait, readable, no overflow
- [ ] Print button in detail panel triggers `window.print()`
- [ ] `admin-detail` sheet ships with `opacity: 0; visibility: hidden; transform: translateY(-100%); pointer-events: none` by default; class `is-open` reveals it

**Estimated lines changed:** 30

**Conventional commit type:** `feat:`

**PR title:** `feat(admin): live orders feed with realtime + polling + print`

---

### 4.6 — Slice 4 verification (manual browser checks)

**Why:** All admin features must be verified end-to-end in a live browser pair (checkout tab + admin tab).

**Specifics:** Manual checklist:
1. Open two tabs: tab A = `menu.html`, tab B = `admin.html` (logged in as admin)
2. Tab A: add item, go to checkout, fill form, submit → "Order placed" confirmation
3. Tab B: new order appears in list within 5 seconds (Realtime or polling)
4. Tab B: click the new order row → detail panel slides open
5. Click "Start preparing" → badge flips to "Preparing" immediately (optimistic), then PATCH confirmed
6. Click "Mark ready" → badge flips → PATCH confirmed
7. Click "Complete" → row disappears from Active view
8. Click "Archived" tab → row appears with correct status
9. Click "Active" tab → filter chips for `received|preparing|ready` work
10. Click an archived order → print button present; print preview shows receipt only
11. Tab B: `window.__bpAdmin.realtime.subscribe()` DevTools check — channel state is `SUBSCRIBED`
12. Block realtime channel (DevTools → Network offline on WS) → amber pill appears within 5s
13. Restore network → green pill restored, polling stopped
14. Verify: `grep -r "sb_secret_" burger-site-draft/` → zero matches

**Acceptance:**
- [ ] New order from checkout appears in admin list within 5s
- [ ] Status advances correctly through all 5 states
- [ ] Completed order archived automatically, visible in Archived tab
- [ ] Realtime pill reflects actual connection state
- [ ] Print preview renders receipt without chrome
- [ ] No secret key strings in any browser-loaded file

**Estimated lines changed:** 0 (verification only)

**Conventional commit type:** `chore:`

**PR title:** `feat(admin): live orders feed with realtime + polling + print`

---

## Task ordering and dependencies

```
Slice 1 (data layer)
  └── Slice 2 (customer checkout)
        └── Slice 3 (admin auth shell)
              └── Slice 4 (admin features)
```

```
Slice 1 ──→ Slice 2 ──→ Slice 3 ──→ Slice 4
  │            │            │            │
  ▼            ▼            ▼            ▼
 SQL+env    checkout    admin login   live feed
 gitignore  cart bridge  shell        status+
                       empty state   filters+print
```

**Dependency rationale:**
- Slice 2 (checkout) writes to `orders` and `order_items` — requires slice 1's schema + RLS
- Slice 3 (admin auth) needs the Supabase client set up in slice 1's `<script>` tags, but the shell itself is independent
- Slice 4 (admin features) requires slice 3's auth shell to be in place; it extends the same `admin.html` file
- All slices are independently revertable without breaking later slices (later slices add to existing files; earlier slices do not reference later slices)

---

## Slice 1 verification (manual browser checks)

1. Open Supabase Studio SQL Editor → paste and run `001_orders.sql` → confirm `public.orders` table exists with all columns and indexes
2. Paste and run `002_order_items.sql` → confirm `public.order_items` with FK
3. Paste and run `003_rls.sql` → confirm RLS enabled, policies created
4. Run `SELECT * FROM public.orders LIMIT 1` → should return 0 rows (empty, not error)
5. Open `admin.html` → no 404 in Network tab, `window.supabase` defined in console
6. `grep -r "sb_secret_" burger-site-draft/` → zero matches

---

## Slice 2 verification

1. menu.html → add items → click Checkout → checkout.html loads with summary
2. Submit with empty fields → inline validation errors per field
3. Fill form (valid email, phone, future pickup time) → submit → redirected to menu.html with banner
4. Cart is empty on menu.html after redirect
5. Reload menu.html → banner gone
6. Open checkout with empty cart → redirected to menu.html
7. Two-tab: add item in tab 1 → tab 2's checkout summary updates (storage event)
8. Disconnect network on submit → error toast, cart preserved, draft pre-filled on retry
9. Double-click submit → second request blocked

---

## Slice 3 verification

1. admin.html (no session) → login form shown
2. Submit email → "Check your inbox" message, no polling loop
3. Click magic link (or Supabase Studio → Send magic link fallback) → session established
4. Reload → session persists (login form NOT shown)
5. Sign out → login form shown again
6. Sign in with non-admin account → "not admin" empty state + sign-out button
7. `window.__bpAdmin.auth.isAdmin()` in DevTools → correct boolean

---

## Slice 4 verification

1. Two tabs: menu.html + admin.html (admin logged in)
2. menu.html: checkout with 1 item
3. admin.html: new order appears within 5s (realtime or polling)
4. Click row → detail panel opens
5. "Start preparing" → badge → "Preparing", PATCH confirmed in Network tab
6. "Mark ready" → badge → "Ready"
7. "Complete" → row disappears from Active, appears in Archived
8. "Archived" tab → correct row with "completed" badge
9. "Active" tab → status chip filter works
10. Print button → print preview shows receipt only (no topbar/list/filters/chrome)
11. Realtime pill: green when subscribed
12. Block WS in DevTools → amber pill within 5s
13. Restore WS → green pill restored
14. `grep -r "sb_secret_" burger-site-draft/` → zero matches

---

## Rollback plan per slice

| Slice | Rollback action |
|-------|-----------------|
| Slice 1 | Revert `.env.example`, `supabase-config.js`, `.gitignore`, `admin.html`. SQL tables and RLS policies remain in Supabase but are harmless without browser code. Drop tables via Supabase Studio if full cleanup needed. |
| Slice 2 | Revert checkout.html, menu.html changes (Checkout CTA, banner markup, CSS, bpCheckoutBridge IIFE). Cart drawer returns to previous state. |
| Slice 3 | Revert admin.html shell body markup and slices 3–4 inline script additions. The `<script>` tags from slice 1 remain but are harmless. Admin page returns to skeleton state. |
| Slice 4 | Revert slice 4 additions to admin.html inline script (orders, realtime, polling, filters, print IIFEs). Admin page returns to slice 3 state (auth shell only). |

---

## Risks per slice

| Slice | Risk | Likelihood | Mitigation |
|-------|------|------------|------------|
| 1 | `.env` or `supabase-config.js` accidentally committed | High | `.gitignore` added; verification step greps for `sb_secret_` |
| 1 | SQL migration run out of order | Low | Numbered files; README documents correct order |
| 2 | `bp-cart-v1` not cleared on success | Medium | `localStorage.removeItem` + `storage` event for cross-tab sync |
| 2 | Checkout CTA accidentally inherits `data-cart-close` | Low | Explicitly omitted in markup; design comment warns against it |
| 2 | Catalog price mismatch if menu item renamed | Low | Checkout fetches live menu.html at mount; reindexes on the fly |
| 3 | Chef email typo on first sign-in | Medium | Supabase Studio fallback documented; "Send magic link" button |
| 3 | First sign-in has no `app_metadata.role = 'admin'` | High | Out-of-band SQL documented: `UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb WHERE email = '...'`. UI gracefully shows "not admin" empty state. |
| 4 | Realtime silently disconnects | Medium | Polling fallback @ 5s on `CHANNEL_ERROR`/`CLOSED`; amber pill visible |
| 4 | Two-tab concurrent status updates | Low | Last-write-wins; realtime UPDATE event reconciles both tabs |
| 4 | Print stylesheet differs on physical printer vs browser preview | Medium | `@media print` tested manually in slice 4 verification |
| All | `index.html` accidentally edited | Low | MD5 check before and after each slice apply |
| All | `sb_secret_` appears in browser-loaded files | Medium | Grep verification step in every slice |

---

## Reviewer checklist

### Slice 1 — Data layer + env loader

- [ ] `001_orders.sql` creates `public.orders` with all columns, CHECK constraints, three indexes
- [ ] `002_order_items.sql` creates `public.order_items` with FK to orders
- [ ] `003_rls.sql` creates all RLS policies and `trg_orders_set_archived_at` trigger
- [ ] All three SQL files are idempotent (safe to re-run)
- [ ] `.env.example` at project root with all four variables documented
- [ ] `supabase-config.js` at `burger-site-draft/` sets `window.__bpSupabase` (no `sb_secret_`)
- [ ] `.gitignore` excludes `.env` and `burger-site-draft/supabase-config.js`
- [ ] `admin.html` skeleton loads without errors; `window.supabase` defined
- [ ] SQL README documents paste order: 001 → 002 → 003
- [ ] `grep -r "sb_secret_" burger-site-draft/` returns zero matches

### Slice 2 — Customer checkout + cart bridge

- [ ] `checkout.html` standalone page renders on mobile and desktop
- [ ] Cart summary shows correct items, qty, prices, subtotal when cart is populated
- [ ] Empty cart on arrival redirects to `menu.html` (no form rendered)
- [ ] All form fields present in correct order with `aria-describedby` wiring
- [ ] `pickup_time` field appears only when "Pickup" radio is selected
- [ ] Submit button disabled until all required fields pass validation
- [ ] Inline validation fires on blur and on submit; errors announced accessibly
- [ ] Double-submit blocked while request in-flight
- [ ] Network error on submit → error toast, cart preserved, draft pre-filled on retry
- [ ] Successful submit → cart cleared, redirected to `menu.html#order=<id>`
- [ ] Confirmation banner shown once on `menu.html` after redirect; gone after reload
- [ ] Menu.html Checkout CTA navigates to `checkout.html` without closing drawer (no `data-cart-close`)
- [ ] Confirmation banner markup present in menu.html DOM (hidden by default)
- [ ] `bpCheckoutBridge` IIFE appended after existing cart IIFE; no existing IIFE modified
- [ ] CSS for `.cart-drawer__checkout` and `.order-confirmation*` added without collision
- [ ] `window.__bpCheckoutBridge` defined
- [ ] Storage event in another tab updates checkout summary

### Slice 3 — Admin auth + shell

- [ ] `admin.html` shows login form when no session exists
- [ ] Magic-link email submit → "Check your inbox" message (no polling loop)
- [ ] Magic-link callback → session established, orders shell rendered
- [ ] Non-admin account → "not admin" empty state + sign-out button
- [ ] Session persists across page reload
- [ ] Sign-out → `supabase.auth.signOut()` → login form re-shown
- [ ] `detectSessionInUrl: true` configured for magic-link callback
- [ ] `window.__bpAdmin` exposes auth module
- [ ] No `sb_secret_` strings in `admin.html`

### Slice 4 — Admin features (live feed + status controls + filter + print)

- [ ] Orders list fetches and renders with `created_at DESC` ordering
- [ ] New order from checkout tab appears in admin list within 5 seconds
- [ ] `realtime` channel subscribed on admin session start
- [ ] `CHANNEL_ERROR` / `CLOSED` → amber pill + polling fallback starts within 5s
- [ ] `SUBSCRIBED` → green pill + polling stopped
- [ ] Status controls show only next legal transition button
- [ ] "Complete" → `archived_at` set server-side, row disappears from Active view
- [ ] "Cancel" → confirm dialog before PATCH
- [ ] Optimistic update reverts on PATCH failure
- [ ] "Active" tab → `archived_at IS NULL` only
- [ ] "Archived" tab → `archived_at IS NOT NULL` only
- [ ] Status chips filter within Active view
- [ ] URL hash reflects current filter; survives reload
- [ ] Order detail panel opens on row click
- [ ] Detail panel: customer name, email, phone, fulfillment, pickup time, line items, total
- [ ] "Print" button triggers `window.print()`
- [ ] Print preview: topbar, filters, list, controls hidden; detail panel only
- [ ] Detail panel ships with `opacity: 0; visibility: hidden; transform: translateY(-100%); pointer-events: none` when closed
- [ ] `window.__bpAdmin.orders.fetch()`, `.advance()`, `.prepend()`, `.replace()` all work
- [ ] `grep -r "sb_secret_" burger-site-draft/` → zero matches
