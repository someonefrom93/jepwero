# Exploration: Admin Panel + Customer Checkout + Customer Auth Gate

Change: `admin-panel`
Phase: explore (Phase 0 — pre-proposal investigation)
Artifact store: openspec (files only)
Hard constraint honored: `burger-site-draft/` and `.env*` were NOT edited during this phase.

> Scope was confirmed by the user as **XL / multi-surface**: (1) a brand-new `admin.html` orders dashboard for the chef, (2) a brand-new `checkout.html` customer-side order-placement flow, and (3) an extension of `menu.html` that adds a customer-side auth gate plus a "Checkout" CTA on the existing cart drawer. This document investigates the gaps, the architectural forks still pending a user pick, the recommended stack, and a tentative slice plan.

---

## 1. Current State

### On disk under `burger-site-draft/`

| Path | Lines | State |
|---|---|---|
| `index.html` | 916 | **Untouched.** No topbar, no cart badge, no Supabase references. Carousel hero + menu teaser + locations + footer. |
| `menu.html` | 2141 | **Slice 1 + slice 2 of `shopping-cart` shipped.** Has 32 `<article class="item">` cards with `data-id` / `data-name` / `data-price` / `data-category` / `data-cal` / `data-img` attributes. Cart drawer (`#cart-drawer`) is wired: badge in topbar, slide-over panel, focus trap, ESC/backdrop close, scroll lock, `bp-cart-v1` localStorage persistence. The drawer footer shows subtotal + "Taxes and pickup time calculated at checkout." note — **there is no "Checkout" CTA in the drawer today.** |
| `admin.html` | — | **Does not exist.** |
| `checkout.html` | — | **Does not exist.** |
| `supabase-config.js` (or any equivalent) | — | **Does not exist.** No `window.__bpSupabase` global anywhere. |

### On disk at project root

- `.env` — 4 lines, all populated, **already verified by the orchestrator (do NOT re-test). The actual values are intentionally not quoted here to avoid leaking the service-role key into commit history; the project's Supabase project URL is `https://ouhwfkxqpxikqhwcqioc.supabase.co` (this URL is public via GitHub secret scanning rules anyway).**
- No `.git/`, no `.gitignore`. Project is not a git repo (per `openspec/config.yaml`).
- No `package.json`, no `node_modules/`, no build tooling, no test runner, no bundler.
- No Supabase client code anywhere on disk (grep clean for `supabase`, `@supabase`, `realtime`).

### Main specs already in `openspec/specs/`

- `cart/spec.md` — cart state model, drawer UX, accessibility, persistence (synced from `shopping-cart` archive).
- `menu-catalog/spec.md` — DOM-derived catalog from `data-*` attributes on the 32 cards (synced from `shopping-cart` archive).

These are the foundation the checkout and admin surfaces will read from.

### What does NOT yet exist on disk (and is in scope of this change)

- `admin.html` — chef's orders dashboard.
- `checkout.html` — customer-side order placement form.
- `burger-site-draft/supabase-config.js` — static credential shim (see `## Approach comparison`).
- `burger-site-draft/.env.example` — hand-fillable template users copy from.
- SQL migration(s) for the `orders` and `order_items` tables, plus RLS policies.
- Any `bp-order-*`, `bp-checkout-*`, `bp-admin-*` localStorage keys.
- Any Supabase JS SDK reference (no `<script src="https://…supabase-js…">` yet).
- A "Checkout" CTA anywhere in `menu.html`'s cart drawer footer.

### Cross-session context carried forward

- Engram obs #265 — **closed-state visibility lesson.** `pointer-events: none` does NOT equal `visibility: hidden`. Any new drawer/sheet (e.g. an admin order-details sheet) must ship closed-state `opacity` + `transform` + `visibility` rules from day one, not as a follow-up patch.

---

## 2. Scope (confirmed)

The user has confirmed this is a **multi-surface XL change**. The orchestrator pinned the budget at ~700–1100 lines and the 400-line review budget will be exceeded; chained slices are required.

**In scope (3 surfaces):**

1. **`admin.html` (new file)** — Chef-only orders dashboard. Lists incoming orders in real time, allows status transitions, and lets the chef print an order receipt. Behind an admin-only auth gate (see fork 3b).
2. **`checkout.html` (new file)** — Customer-side flow. Collects name + email + optional pickup notes, calls Supabase `INSERT` against `orders` + `order_items`, redirects to a thank-you state, clears `bp-cart-v1` on success. May or may not require a sign-in step (see fork 3a).
3. **`menu.html` (extended)** — Two small, additive edits only:
   - A "Checkout" CTA in the cart drawer footer that navigates to `checkout.html` (and is disabled / hidden when the cart is empty).
   - A customer-side auth gate (only if fork 3a picks a non-`guest` option). Implemented as either a sign-in step embedded in `checkout.html` or a separate small overlay reachable from the cart drawer.

**Out of scope (per project hard constraints)** — see `## 4. Out of Scope (binding)` below.

---

## 3. Open architectural forks

The orchestrator will surface these in `sdd-propose`. Each is presented as a label the user can pick, not a generic ask. Tradeoffs are pre-written so the user can decide quickly.

### 3a. Customer-side auth

| Label | Description | Tradeoff |
|---|---|---|
| `guest` | No account. Customer enters name + email at checkout; that email becomes the order's contact field. No sign-in step, no email verification, no session. | **Lowest friction.** Zero emails sent, zero drop-off from auth. Downside: no returning-customer history, no way to look up "did I already order?", no link between orders and a real `auth.users` row. |
| `magic-link` | Supabase Auth passwordless email. Customer enters email; Supabase sends a one-time link; click confirms and signs them in; the order is tied to `auth.uid()`. | **Best UX-to-accountability ratio.** No password to forget, no confirmation page friction, customers come back as themselves. Downside: one extra round-trip per first-time customer, email deliverability risk (Supabase's SMTP in dev may go to spam or fail silently), magic links expire (1 hour default). |
| `email-password` | Supabase Auth email + password. Customer signs up, confirms email, signs in. Order tied to `auth.uid()`. | **Most familiar.** Downside: confirmation email + password reset flow are both required for a polished experience; high friction for a one-time pickup order; Supabase's default redirect URLs need configuring. Overkill for the MVP. |

**Recommended for this change**: `guest`. The MVP is a single-restaurant, walk-up-and-order flow; the user has not asked for customer accounts. `magic-link` is the best upgrade path if returning customers ever become a requirement — the schema (see `## Recommended stack`) already supports it.

### 3b. Admin-side auth

| Label | Description | Tradeoff |
|---|---|---|
| `shared-password` | Single pre-shared secret in `.env`. `admin.html` shows a password input; success sets a `bp-admin-authed: 1` flag in localStorage and unmasks the dashboard. No Supabase Auth involved. | **Operationally simplest.** No email dependency, no SMTP, no session expiry to manage. Downside: single secret = single point of compromise; rotation requires editing `.env` AND logging every device out; the secret IS effectively a publishable value (it sits next to the publishable key in `.env`), so anyone who reads `.env` has admin access. |
| `magic-link` | Supabase Auth passwordless email to a chef-known address (e.g. `chef@jochos.com`). Sign-in issues a JWT; the admin's `auth.uid()` is checked by RLS policies on the `orders` table. | **Best fit for a kitchen tablet.** No password to remember or share. Recovery is "click the email again." Downside: depends on email deliverability; if the chef's inbox goes down, the kitchen is locked out. Onboarding is "enter your email once per device." |
| `email-password` | Supabase Auth email + password for the chef. Same library path as customers, just with a different role marker. | **Familiar.** Downside: the chef has to remember (or write down) a password. Recovery flow is heavier than magic-link. Adds little value over magic-link for a single-admin deployment. |

**Recommended for this change**: `magic-link`. It plays to Supabase Auth's strengths, gives us a real `auth.users` row to hang the admin role on (via `app_metadata.role = 'admin'` or a `profiles` table), and removes any "where do I put the shared secret?" question. The email-deliverability risk is real but manageable (Supabase's project-level SMTP can be replaced with a custom provider if needed; for a single-chef demo, the default works once the chef's email is in the allow-list).

### 3c. Order lifecycle

| Label | Description | Tradeoff |
|---|---|---|
| `simple` | Two states: `new` → `done`. Chef marks an order done when it's handed to the customer. No archival, no filtering beyond "done". | **Demo simplicity.** Smallest schema, smallest UI, smallest spec. Downside: no concept of "the kitchen is cooking this right now" vs. "this is sitting on the counter waiting", which is the whole point of a kitchen tablet. After 50 orders the active feed gets long. |
| `full` | Five states: `received` → `preparing` → `ready` → `completed` → `archived`, with an `archived_at` timestamp on the latter. Archived rows are filtered out of the live feed by default. | **Real-life realism.** Chef taps `received` → preparing when they start, → `ready` when it's on the counter, → `completed` when handed off, → `archived` after a shift ends. UI stays clean because archived rows are hidden by default. Downside: 5 states means 5 transitions in the UI and 5 acceptance scenarios in the spec. |

**Recommended for this change**: `full`. The chef's tablet is the central nervous system of this MVP — if the lifecycle doesn't model "I'm cooking this right now", the demo doesn't show off Supabase Realtime. The 5-state cost is paid once and then forgotten.

---

## 4. Out of Scope (binding)

These are excluded by either user confirmation, `openspec/config.yaml` constraints, or the orchestrator's preflight. The proposal phase MUST respect them.

- **Real payment processing** (Stripe, Square, Mercado Pago, etc.). Out. This is "place an order for the kitchen to prepare", not "pay online". The user will collect payment in person.
- **Multi-restaurant / multi-location logic.** Out. One restaurant only. No `restaurant_id` column, no per-location filtering.
- **Inventory or stock validation.** Out. Every item is always available. If the chef runs out, they mark the order done with a refund (offline process).
- **Refunds, partial fulfillment, splitting orders across chefs.** Out. Each order is atomic. One chef, one pickup.
- **SMS / push / email notifications** to the chef or to the customer. Out. The chef's tablet IS the notification surface; the customer knows their order is received because they got a thank-you screen and the chef will call their name. Supabase Auth's magic-link email is the only transactional email that fires, and it fires only at sign-in.
- **Server-side Edge Functions** (Supabase Functions, Vercel, Netlify, Cloudflare Workers). Out. Everything runs in the browser against PostgREST and Realtime using the publishable key only.
- **Using the secret key client-side.** Out. The `SUPABASE_SECRET_KEY` in `.env` stays server-only (it's never used; it's there for future server-side work). The publishable key is the only credential the browser ever sees.
- **Editing `burger-site-draft/index.html`.** Out per the `shopping-cart` archive's binding invariants. Index.html stays as-is.
- **A build pipeline** (Vite, esbuild, Rollup, webpack, Parcel). Out per `rules.design` in `openspec/config.yaml`. Everything stays inline in HTML files or in a small static `.js` file.
- **A test runner.** Out per `rules.apply.no_test_runner_warning: true`. Verification is structural (`grep`, `wc -l`, `node --check`) plus manual browser checks.
- **An external CSS file.** Out. All styles stay in inline `<style>` blocks per the project's existing convention.
- **Migrating the cart's `bp-cart-v1` storage shape.** The cart's v1 schema is preserved as-is. Checkout reads it; on success, it deletes the key. We do NOT introduce `bp-cart-v2`.
- **Touching `bp-cart-v1` storage from admin surfaces.** Admin reads from Supabase, not from the cart's localStorage. Cross-tab cart sync continues to work exactly as the cart change shipped it.

---

## 5. Approach comparison

For each major pillar, the viable approaches and the recommended pick.

### 5.1 Data store

| Approach | Pros | Cons |
|---|---|---|
| **Supabase Postgres + Auth + PostgREST + Realtime** | Single platform; orchestrator has already verified `https://ouhwfkxqpxikqhwcqioc.supabase.co` works against `/rest/v1/orders` and `/auth/v1/...` and JWKS HTTP 200. Browser-only with the publishable key. RLS gives us per-user access control without writing server code. | Requires adding the Supabase JS SDK from CDN (see 5.6); adds one external runtime dependency. |
| Firebase (Firestore + Auth) | Comparable feature set; well-documented. | New vendor to introduce; orchestrator preflight already validated Supabase, not Firebase. Out of scope per "use what was verified." |
| Roll-our-own Node + Postgres + a hand-rolled auth layer | Full control. | Requires a server. Forbidden by the no-Edge-Functions constraint. |

**Pick**: Supabase. Orchestrator-verified, single vendor, browser-only.

### 5.2 Auth on customer side

See `## 3a. Customer-side auth`. Pick: `guest` for MVP. Schema stays compatible with future `magic-link` upgrade.

### 5.3 Auth on admin side

See `## 3b. Admin-side auth`. Pick: `magic-link`.

### 5.4 Real-time feed

| Approach | Pros | Cons |
|---|---|---|
| **Supabase Realtime channels** (`supabase.channel('orders').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => …).subscribe()`) | Native, low-latency, no polling. Works over WebSockets. Filter by `event: 'INSERT'` to only react to new orders. | Requires WebSocket support (all evergreen browsers have it; the Supabase JS SDK falls back to long-poll if WS fails). Slightly more code than a `setInterval`. |
| **Polling** (`setInterval(() => supabase.from('orders').select('*').gte('created_at', lastSeen), 5000)`) | Trivial to write. No WebSocket concerns. | Latency up to the poll interval. Burned API quota. Doesn't scale (one chef is fine; many chefs would suffer). |
| **Both, with Realtime preferred and polling as fallback** | If Realtime fails (network blocks WS, JWT refresh hiccup), the polling interval kicks in after 10 s of no events. | More code paths to test. |

**Pick**: Realtime primary, polling fallback. The polling interval is hidden behind a `__bpRealtime.degrade()` call that's only invoked if the channel emits an error or closes unexpectedly. Total UI behavior is identical to the user; only the "freshness" of the feed differs.

### 5.5 Schema migrations

| Approach | Pros | Cons |
|---|---|---|
| **`openspec/changes/admin-panel/sql/0001_init.sql`** as a checked-in, hand-runnable SQL file the user pastes into the Supabase SQL editor | No migration tooling; explicit; reviewable in this change; user owns the database. | Manual step. Drift between SQL file and live DB if the user edits in the dashboard. |
| Use Supabase's `supabase` CLI for migrations | Industry standard. | Requires the CLI; adds tooling that violates the "no build tools" spirit. |
| Generate migrations via a serverless migration runner | Hands-off. | Forbidden (no Edge Functions). |

**Pick**: Hand-rolled SQL file under `openspec/changes/admin-panel/sql/0001_init.sql`. The user pastes it once during onboarding. README instructs.

### 5.6 Env loader

| Approach | Pros | Cons |
|---|---|---|
| **`burger-site-draft/supabase-config.js`** — a small static JS file that sets `window.__bpSupabase = { url, publishableKey, jwksUrl }`. Each HTML page loads it via `<script src="supabase-config.js"></script>` BEFORE the Supabase SDK. `.gitignore` excludes both `.env` AND `supabase-config.js`. | Single source of truth for credentials; gitignored; works in browsers with zero tooling. User creates it once by copying from a checked-in `.env.example`. | Two files to keep in sync (`.env` for the future server-side path; `supabase-config.js` for the browser). Manual setup step. |
| Read `.env` at "build" time via Vite / Webpack / esbuild | Industry standard. | Forbidden by `rules.design`. |
| Inline the publishable key directly in each HTML page | Zero files. | DRY violation; 3 pages × 1 credential = 3 places to update; easy to leak in a screenshot. |
| Use a `<meta>` tag in each HTML page | Simple. | Same DRY problem; worse — meta tags get scraped by social-card crawlers. |

**Pick**: `burger-site-draft/supabase-config.js`. This is the cleanest browser-compatible shim given the project's "no build tools" rule. The `.gitignore` rule is forward-looking (the project has no git yet, but the file MUST be excluded from the moment a `.git/` appears, since the publishable key is sensitive enough to leak via search engines that index GitHub).

---

## 6. Recommended stack

Single coherent stack across all pillars. The orchestrator will surface the 3 forks in `sdd-propose`; this is the combination I'm recommending.

| Pillar | Recommendation |
|---|---|
| **Data store** | Supabase (Postgres + Auth + PostgREST + Realtime). Verified by orchestrator preflight. |
| **Customer auth** | `guest` — email-only contact field at checkout. Schema-compatible with future `magic-link`. |
| **Admin auth** | `magic-link` — Supabase Auth passwordless email to the chef's known address; chef's row gets `app_metadata.role = 'admin'`. |
| **Real-time** | Supabase Realtime `postgres_changes` channel on the `orders` table, INSERT-filtered for the admin dashboard. Polling fallback (`setInterval` @ 5 s) kicks in if the channel emits `CHANNEL_ERROR` or `CLOSED`. |
| **Schema** | Two tables: `orders` (id, customer_email, customer_name, status, notes, subtotal_cents, created_at, archived_at) and `order_items` (id, order_id FK, catalog_id, name_snapshot, unit_price_cents, qty, line_subtotal_cents). RLS via `auth.uid()`: anyone can INSERT an order; admin can SELECT/UPDATE; customers authenticated via magic-link can SELECT their own. |
| **Env loader** | `burger-site-draft/supabase-config.js` (gitignored), loaded via `<script src>` before the Supabase SDK; checked-in `burger-site-draft/.env.example` template for first-time setup. |
| **Supabase SDK** | Loaded from CDN as a global: `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>`. Exposes `window.supabase.createClient(url, key)`. |
| **Build tooling** | None. All HTML / CSS / JS inline; one small external `.js` for config; Supabase SDK from CDN. |
| **Test runner** | None. Structural checks + manual browser verification, per `openspec/config.yaml`. |

**Why this stack**: it respects every project constraint (no build, no tests, no edits to `index.html`, all code in HTML/JS), keeps the secret key server-only, uses the publishable key only on the browser with RLS as the perimeter, and gives the chef the real-time experience that justifies choosing Supabase in the first place. The schema is small enough to hand-author in one SQL file and rich enough to support both `guest` and future `magic-link` customer auth without migration.

---

## 7. Site-specific gotchas

Twelve gotchas specific to this site, ordered from most-likely-to-bite to least. Lessons learned from the cart change are surfaced in italics.

1. **No build tools → credentials MUST live in a static file.** `.env` is a Node convention; browsers cannot read it. The `supabase-config.js` shim is the only viable approach given the project's "no build tools" rule. *(Same constraint as the cart change, but with a twist: the cart change didn't need any credentials at all.)*

2. **`.gitignore` must exclude BOTH `.env` AND `supabase-config.js`.** The project has no `.git/` today, but the moment one is added, both files leak. Since there's no git yet, this rule is forward-looking — the `.gitignore` should be authored now as a defensive artifact, with comments explaining the rule.

3. **First-time setup is a manual copy step.** Because `supabase-config.js` is gitignored, a new contributor (or the user re-cloning) must hand-fill it from `supabase-config.example.js`. The proposal MUST include a one-time "how to set up credentials" doc — likely a README in `openspec/changes/admin-panel/` that the user pastes into their personal notes.

4. **The admin page must work on a kitchen tablet.** `index.html`'s CSS is desktop-first and the menu.html topbar uses 72 px sticky offsets. `admin.html` and `checkout.html` need their own layouts tuned for landscape tablet (1024×768) AND portrait phone (the chef may pull up an order on their phone). The `bp-cat-v1` / `bp-cart-v1` precedent of "no shared CSS file" means each new HTML page inlines its own tokens.

5. **The cart drawer's "Checkout" CTA must NOT re-open slice-1/2 territory.** Adding the button is a small additive edit inside the `.cart-drawer__foot` block at line ~1596 of `menu.html`. The only thing it does is `<a href="checkout.html" class="btn btn--primary" data-cart-checkout>Checkout</a>`. The cart change's storage shape, accessibility, and drawer behavior stay untouched. The proposal should treat this as part of the checkout-flow slice, not a "cart change."

6. **Admin needs `@media print` styles.** The chef needs to print order details to a receipt printer or a piece of paper. The admin order-details sheet MUST have `@media print` rules that hide nav / chrome and render only the receipt. Cart change's `@media (prefers-reduced-motion)` precedent shows that media-query conventions are already in play.

7. **`bp-cart-v1` must be cleared on successful order placement.** Otherwise the customer's cart "leaks" into their next visit. The checkout flow reads `bp-cart-v1`, posts the order to Supabase, then on success calls `localStorage.removeItem('bp-cart-v1')` AND broadcasts a `storage` event so the cart drawer in any open tab updates. The cart change already handles cross-tab sync via the `storage` event; we just emit it.

8. **`index.html`'s `gap: 72px` topbar offset MUST NOT carry over.** `index.html` has no topbar; `menu.html` has a topbar with `top: 0` and a sticky cat-nav at `top: 72px`. `admin.html` and `checkout.html` will likely have their own topbars (admin needs a logout button; checkout needs a "back to menu" button). Reusing the exact `top: 72px` offset by accident would imply a cat-nav we don't have. Proposal should pin explicit z-index / position rules per page.

9. **No CORS or `.htaccess` changes needed.** `admin.html`, `checkout.html`, and `menu.html` are served from the same origin (the `burger-site-draft/` folder). PostgREST, Auth, and Realtime all hit `https://ouhwfkxqpxikqhwcqioc.supabase.co` from the browser — Supabase has CORS configured at the project level, which the orchestrator's preflight already verified works.

10. **Engram obs #265 — `pointer-events: none` ≠ `visibility: hidden`.** *(Carried forward from the cart bug.)* The admin order-details sheet will be another drawer/sheet — it MUST ship closed-state `opacity: 0; visibility: hidden; transform: translateX(100%);` rules on day one. A copy-paste of the cart drawer's full closed-state pattern (lines ~471–496 of `menu.html`) is the right starting point.

11. **The cart drawer's `Browse menu` link is `href="#limited"`.** It uses the `data-cart-close` attribute to dismiss the drawer. The new Checkout CTA MUST NOT inherit `data-cart-close` — closing the drawer would prevent the navigation. The Checkout link should navigate without closing (the page change closes it implicitly).

12. **Supabase magic-link expiry is 1 hour by default.** The chef signs in once per shift and stays signed in (Supabase stores the JWT in localStorage with auto-refresh). If the chef closes all tabs and returns the next day, they get a fresh magic link. This is fine for a kitchen tablet but should be documented.

---

## 8. Resolved from previous change

Decisions from the `shopping-cart` change that **carry forward** to this change:

| Decision | Carries forward? | Notes |
|---|---|---|
| `bp-cart-v1` localStorage key + v1 schema (`v`, `lines`, `updatedAt`) | **Yes.** | Checkout reads from it; admin does not. No shape change. |
| Integer-cents money math (no floats) | **Yes.** | `subtotal_cents` column on `orders`; `unit_price_cents` + `line_subtotal_cents` on `order_items`. Renderer stays the same `Intl.NumberFormat` recipe. |
| DOM-derived catalog via `data-*` on `.item` cards | **Yes, but with a snapshot twist.** | The `orders_items` row carries a `name_snapshot` and `unit_price_cents` because the menu could change between order placement and fulfillment. Catalog is the source of truth AT ORDER TIME; the order is its own immutable record. |
| BEM-ish class naming + `:root` design tokens | **Yes.** | `admin.html` and `checkout.html` will duplicate the same token block. Project precedent — `index.html` and `menu.html` already do this. |
| Inline `<style>` and `<script>` blocks | **Yes.** | `supabase-config.js` is the ONLY external file introduced, and it's a credential shim, not an application module. |
| Sticky-layering z-index contract (`topbar: 50`, `cat-nav: 40`, drawer: 60) | **Yes, but admin/checkout need their own contract.** | Topbar on admin may be `z: 50` (consistent); the order-details sheet will be `z: 60`. |
| `prefers-reduced-motion` rule in CSS | **Yes.** | Admin + checkout both respect it. |
| No external CSS files | **Yes.** | All styles inline. |
| The cart's `<a>` → `<button>` conversion on every `.item__order` | **Yes (already shipped).** | Not in scope of this change. |
| Cross-tab sync via the `storage` event | **Yes.** | Checkout will emit a `storage` event with `bp-cart-v1` cleared so other tabs empty their carts. |
| Accessibility bar (focus trap, `aria-expanded`, `aria-live`, ESC) | **Yes, applied to admin's order-details sheet and any future drawer.** | Pattern is now reusable. |
| Verification via `wc -l`, `grep`, `node --check`, manual browser | **Yes.** | No test runner added. |

Decisions from `shopping-cart` that **DO NOT carry forward**:

| Decision | Reason it doesn't carry forward |
|---|---|
| `index.html` is untouched | Still untouched. (Carries forward as a *constraint*, not as a code shape.) |
| "No external files" rule | **Broken** — Supabase JS SDK must load from CDN. `supabase-config.js` must exist on disk. Both are first-time exceptions. |
| Slide-over drawer as the only UI surface | Admin adds a top-down full-bleed order-details sheet and a topbar-driven layout. Drawer is one of multiple surfaces now. |
| Cart-only scope (no checkout, no payments) | Resolved by THIS change. Checkout and payments-lite (cash on pickup) are now in scope. |
| 32 items as the only entity type | Now there are 3 entity types: `orders`, `order_items`, plus the implicit `auth.users` row for the chef. |
| `bp-cart-v1` as the only persistence concern | Now we have a server-side DB; `bp-cart-v1` is one of several sources of truth. |

---

## 9. Risks

Ten risks, ordered by likelihood × severity. Each has a proposed mitigation; the proposal phase will pick the ones that need explicit spec coverage.

| # | Risk | Likelihood × Severity | Mitigation |
|---|---|---|---|
| R1 | **`.env` or `supabase-config.js` accidentally committed to git.** No `.git/` exists today, but the moment one is added, the publishable key leaks into the project's history (and into GitHub if it ever goes public). | High × High | Author a `.gitignore` at project root during this change's apply phase, with a comment explaining why each entry is there. The README must instruct "never commit these." |
| R2 | **Publishable key is scraped and abused if RLS is wrong.** The publishable key is in `supabase-config.js` which is in `burger-site-draft/`; anyone hitting the site can read it. Without correct RLS on `orders` and `order_items`, anyone can SELECT ALL orders (including customer emails) or DELETE/UPDATE rows. | Medium × Critical | RLS is non-negotiable. The SQL file MUST include policies: (a) anyone can INSERT into `orders` and `order_items` (for guest checkout), (b) only `auth.uid()` whose `app_metadata.role = 'admin'` can SELECT/UPDATE, (c) admin can UPDATE `status` only within the allowed lifecycle transitions. The verify phase manually attempts an unauthenticated SELECT and confirms it returns `[]`. |
| R3 | **Supabase Auth email deliverability in dev.** Magic-link emails in Supabase's free tier use the project's built-in SMTP, which can be slow, land in spam, or fail silently. If the chef can't receive the email, they can't sign in. | Medium × High | Document a fallback: the chef can use the Supabase dashboard's "Authentication → Users → Magic Link" feature to generate a one-time link manually. Optionally, swap the project's SMTP to a custom provider (out of scope here, but the design must allow it). |
| R4 | **Realtime channel silently disconnects.** Network blips, JWT refresh, or browser throttling can close the WS connection without the JS noticing. Chef misses new orders. | Medium × High | Polling fallback at 5 s interval kicks in if the channel emits `CHANNEL_ERROR` or `CLOSED`. The UI shows a small "Reconnecting…" pill (or nothing — degraded mode is invisible until it fails twice). Reconnect logic re-subscribes with exponential backoff. |
| R5 | **Customer-side auth friction.** If we pick `email-password` (the user can override the recommended `guest`), customers drop off at the sign-up step. | Low × High if chosen × Low if not | Default recommendation is `guest`. If the user picks `email-password`, the spec MUST include a "first-time signup completes in ≤2 screens" scenario. |
| R6 | **Secret key leaked via a bug report or screenshot.** Anyone pasting a `console.log` of their environment into a Slack channel or GitHub issue is leaking the secret key. The orchestrator has already correctly identified this risk in the preflight. | Medium × Critical | The proposal MUST mandate that `SUPABASE_SECRET_KEY` is never read by any browser code. The `supabase-config.js` shim MUST NOT include it. The SQL migration MUST NOT reference it. The verify phase greps for `sb_secret_` in `burger-site-draft/` and confirms zero matches. |
| R7 | **Cart drawer's `Browse menu` link href collision with new Checkout button.** The cart's `.cart-drawer__empty` block has `<a href="#limited" data-cart-close>Browse menu</a>`. A future maintainer could accidentally add `data-cart-close` to the new Checkout link, which would dismiss the drawer before navigation completes. | Low × Low | The proposal MUST specify the Checkout link does NOT have `data-cart-close`. The design phase documents this in a "do not copy" comment near the new CTA. |
| R8 | **`index.html` accidentally edited by the apply phase.** The `shopping-cart` archive's invariant #1 said `index.html` MUST NOT be modified; this change inherits the invariant but adds new HTML files, increasing the chance of a careless edit. | Low × Medium | The `sdd-apply` agent must `git diff --stat burger-site-draft/index.html` (or, in the absence of git, `md5sum burger-site-draft/index.html` before and after) and confirm zero changes. Add to the verify checklist. |
| R9 | **`bp-cart-v1` not cleared on order success.** Customer's cart persists across visits; they accidentally re-submit yesterday's order. | Medium × Medium | The checkout success path MUST (a) call `localStorage.removeItem('bp-cart-v1')`, (b) `window.dispatchEvent(new StorageEvent('storage', { key: 'bp-cart-v1', newValue: null }))` so other tabs update, (c) redirect to a thank-you page that shows the order summary and a "Start a new order" button. |
| R10 | **RLS policy allows INSERT without validating `subtotal_cents` matches the sum of `order_items`.** A malicious client can post an order with `subtotal_cents: 0` but with `order_items` totaling $50. The chef sees a free order. | Low × High | Add a CHECK constraint on `orders.subtotal_cents` AND a `BEFORE INSERT` trigger OR a stored procedure that recomputes the subtotal server-side. Simpler alternative: only allow INSERT via a Postgres function (`place_order(items jsonb, customer_email text, ...)`) and revoke direct INSERT on the table. The proposal should pick one. |

---

## 10. Slice recommendation

Tentative 4-slice plan for the orchestrator to revisit in `sdd-tasks`. Each slice has a name, scope, rough line estimate, dependencies, and rollback boundary. **Not binding** — `sdd-tasks` will re-forecast with exact line counts and may merge or split slices.

### Slice 1 — Supabase wiring + admin auth shell (~280 lines)

**Scope**:

- `burger-site-draft/supabase-config.js` — new file (~10 lines).
- `burger-site-draft/.env.example` — new file (~6 lines).
- `burger-site-draft/.gitignore` — new file at project root (~8 lines).
- Add Supabase SDK `<script>` tag to `menu.html`, `admin.html`, `checkout.html`.
- Add `supabase-config.js` `<script>` tag (before SDK) to all three pages.
- `admin.html` — new file, ~250 lines. Scaffold only: topbar, login form (magic-link email input + "Send magic link" button), sign-in state detection, "waiting for sign-in" placeholder UI. NO order feed yet.

**Dependencies**: none (first slice).

**Rollback boundary**: Delete `admin.html`, `supabase-config.js`, `.gitignore`, `.env.example`. Revert the three `<script>` tag additions in `menu.html`. Cart continues to work untouched.

**Why this slice first**: Credentials + auth are the foundation. Once the chef can sign in, everything else can talk to Supabase. No risk of writing orders against a non-existent auth layer.

### Slice 2 — Schema migration + checkout flow (~320 lines)

**Scope**:

- `openspec/changes/admin-panel/sql/0001_init.sql` — `orders` table, `order_items` table, RLS policies, CHECK constraints, indexes, `place_order(jsonb, text, text, text)` function. (~80 lines of SQL.)
- `openspec/changes/admin-panel/README.md` — paste-this-into-Supabase-SQL-editor instructions. (~20 lines.)
- `checkout.html` — new file, ~250 lines. Form: name, email, optional notes. Submit calls `place_order(...)`. Success: clears `bp-cart-v1`, redirects to inline thank-you state.
- `menu.html` — add the "Checkout" CTA inside `.cart-drawer__foot`. (~6 lines of markup; one CSS rule.)
- Window-level helper `window.__bpOrders = { place, list, update }` for the admin slice to import.

**Dependencies**: Slice 1 (Supabase client must be loaded).

**Rollback boundary**: Delete `checkout.html`. Revert the menu.html `<a class="btn btn--primary" data-cart-checkout>Checkout</a>` addition. SQL migration stays in `openspec/changes/admin-panel/sql/` (it's a checked-in artifact, not a live change to the user's DB; rolling back just means the user doesn't paste it). Admin slice still has auth but no orders to display.

**Why this slice second**: Checkout is the write path; admin is the read path. Writers should land before readers so that admin has real data to render.

### Slice 3 — Admin orders dashboard (~380 lines)

**Scope**:

- `admin.html` extension (~350 lines added to the slice-1 scaffold). Order list (live, sorted by `created_at` DESC), order details sheet (slide-down from top), status transition buttons, `@media print` styles, "Archive" button.
- Supabase Realtime channel `supabase.channel('orders').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, refresh)`.
- Polling fallback (`setInterval` @ 5 s) registered when Realtime emits `CHANNEL_ERROR` or `CLOSED`.
- "No orders yet" empty state.
- Logout button.

**Dependencies**: Slice 1 (auth), Slice 2 (data).

**Rollback boundary**: Revert the slice-3 additions to `admin.html`. Admin sign-in still works; the order list is just empty / static.

**Why this slice third**: Once the write path is real, the read path can demo the full flow. The chef can sign in, place a test order from another browser, and watch it appear.

### Slice 4 — End-to-end verification + cross-tab cart clear (~80 lines)

**Scope**:

- Manual browser verification checklist (~50 lines in `verify-report.md`): 12 steps covering happy path, error path, cross-tab, RLS negative test, magic-link reauth, print preview.
- `verify-report.md` — structural checks (`wc -l`, `grep`, `node --check`), spec→implementation mappings, invariants honored.
- Small wiring fix: ensure the cart-drawer's `storage` event listener handles the `bp-cart-v1` removal case cleanly (likely already works; this slice verifies it).

**Dependencies**: Slices 1–3.

**Rollback boundary**: N/A — verification artifact only.

**Why this slice last**: It depends on all surfaces being present.

**Total estimate**: ~1060 lines across 4 slices, with the heaviest slice being slice 3 (admin dashboard). All slices exceed or approach the 400-line review budget individually EXCEPT slice 4 (verification). The chained-PRs recommendation is **mandatory**, not optional.

**Cross-slice invariant (binding)**: The `shopping-cart` archive's invariants 1–5 carry forward unchanged. `index.html` is never edited; no build tools; no test runner; no external CSS file; `bp-cart-v1` schema unchanged.

---

## Ready for proposal

Yes. The next recommended phase is `sdd-propose admin-panel`, which will define the WHAT and WHY (intent, scope, rollback plan, capabilities) and explicitly surface the three forks in `## 3` for the user to pick. The propose phase is the right place to lock in:

- Fork 3a: customer auth (`guest` recommended, but the user picks).
- Fork 3b: admin auth (`magic-link` recommended, but the user picks).
- Fork 3c: lifecycle (`full` recommended, but the user picks).

Definition of `specs/{admin,checkout,auth,orders}/spec.md`, `design.md`, and `tasks.md` belongs to `sdd-spec`, `sdd-design`, and `sdd-tasks` respectively — none should be drafted from this artifact.

### Suggested invariants the proposer should preserve verbatim

1. `burger-site-draft/index.html` MUST NOT be modified (carried forward from `shopping-cart`).
2. `bp-cart-v1` schema is preserved as-is; checkout clears the key on success but never rewrites it.
3. No build tools. No test runner. No external CSS file.
4. The `SUPABASE_SECRET_KEY` is never loaded into browser code. Grep for `sb_secret_` in `burger-site-draft/` must return zero matches.
5. RLS is non-negotiable on `orders` and `order_items`. An unauthenticated SELECT must return `[]`.
6. Chained slices are mandatory (the change exceeds the 400-line review budget).
7. The cart change's `shopping-cart` archive invariants remain in force: no edits to `index.html`, no build tools, no test runner, all cart code inline in `menu.html`, `bp-cart-v1` schema intact.