# Delta for `customer-checkout`

## Purpose

This delta repairs a broken idempotency promise in the `customer-checkout` capability. The `admin-panel` change shipped an invalid partial unique index on `orders.submit_token` that PostgreSQL rejects, and the client never sent `submit_token` to the server — leaving zero idempotency protection in production. This delta replaces the unfulfilled server-side unique-constraint promise with an application-level RPC-based dedup check (SECURITY DEFINER function `public.find_order_by_submit_token`) called from `checkout.html`, and upgrades the in-memory idempotency token to `sessionStorage` so it survives page reloads. The existing `submitting` boolean double-submit guard is preserved unchanged.

## MODIFIED Requirements

### MODIFIED Submission

- On valid submit, the page MUST build a single `orders` insert payload and an `order_items` array matching the populated cart, then issue in parallel:
  - `supabase.from('orders').insert(<orderRow>).select().single()`
  - For each line, `supabase.from('order_items').insert(<itemRow>)`. Items MUST be inserted in a batch via a single multi-row insert when supported, otherwise sequentially with `Prefer: resolution=ignore-duplicates` not applicable here (each row needs its own `id`).
- Both inserts MUST succeed for the order to be considered committed. If either fails, the page MUST surface a clear error, MUST NOT clear the cart, and MUST persist the customer's form values into `localStorage.bp-checkout-draft` so a retry picks up where they left off.
- The browser MUST generate a per-tab idempotency token (UUID, persisted in `sessionStorage` under key `bp-submit-token`) on first `checkout.html` mount within that tab if no token is present. The same token MUST be sent on every retry within the same tab. The `orders` row MUST persist the token in a `submit_token` column. The dedup mechanism MUST be an application-level dedup check (currently implemented as RPC `public.find_order_by_submit_token(token uuid)`, which runs as `SECURITY DEFINER` and bypasses RLS to return an existing order id where `submit_token = <token>` AND `created_at >= now() - interval '24 hours'` AND `status NOT IN ('cancelled')` AND `archived_at IS NULL`); on match, the `Duplicate handling` requirement governs. The frontend MUST block the second click of a double-submit by checking a `submitting` boolean until the response lands.
- The `order` row MUST be created with `status = 'received'` (server default or explicit), `archived_at = NULL`.
- `created_at` MUST default to `now()` server-side (NOT set by the client).

(Previously: token was "kept only in memory" and dedup was "server-side ... via a unique constraint" — both promises were unfulfilled because the index PostgreSQL would reject never deployed and the client never sent `submit_token`.)

#### Scenario: Token generated on first mount of checkout.html

- GIVEN `checkout.html` mounts in a tab where `sessionStorage['bp-submit-token']` is absent
- WHEN the page initializes
- THEN the page MUST write a fresh UUID into `sessionStorage['bp-submit-token']`

#### Scenario: Token reused across reloads in the same tab

- GIVEN `sessionStorage['bp-submit-token']` already holds a UUID
- WHEN the user reloads `checkout.html` (or navigates away and back within the same tab)
- THEN the page MUST reuse the existing token value
- AND the value MUST be the same UUID sent on any prior submit attempt in that tab

#### Scenario: Fresh token after tab close

- GIVEN `sessionStorage['bp-submit-token']` holds a UUID in tab `A`
- WHEN the user closes tab `A` and opens `checkout.html` in a new tab
- THEN the new tab MUST NOT inherit the previous token
- AND MUST generate a fresh UUID

#### Scenario: Token is the same on a resubmit within the same tab

- GIVEN a submit attempt that failed for any reason (network, validation, server error)
- WHEN the user reloads `checkout.html` in the same tab and clicks Submit again
- THEN the `submit_token` value sent in the new INSERT MUST equal the value sent in the failed attempt

## ADDED Requirements

### ADDED Token persistence

- The idempotency token MUST be stored under `sessionStorage` key `bp-submit-token`.
- `sessionStorage` scope is per-tab by spec; cross-tab sharing is intentionally out of scope.
- The token SHOULD persist across reloads and same-tab navigations for the lifetime of the tab.
- The token MUST be regenerated fresh whenever `sessionStorage['bp-submit-token']` is absent on page mount (first visit, new tab, cleared storage).
- The token MUST NOT be written to `localStorage`, `document.cookie`, or any persistent cross-session store.

#### Scenario: bp-submit-token visible in DevTools session storage

- GIVEN a tab where `checkout.html` has mounted at least once
- WHEN the user opens DevTools → Application → Session Storage
- THEN `bp-submit-token` MUST be present with a UUID value

#### Scenario: bp-submit-token absent from localStorage

- GIVEN a tab where `checkout.html` has mounted and submitted
- WHEN the user opens DevTools → Application → Local Storage
- THEN `bp-submit-token` MUST NOT be present (only `bp-cart-v1` and `bp-checkout-draft` are local)

### ADDED Duplicate handling

- On submit, the page MUST run a dedup check (implemented as RPC `public.find_order_by_submit_token(p_token uuid)` called via `supabase.rpc(...).single()`) that returns the existing order's id where `submit_token = <current token>` AND `created_at >= now() - interval '24 hours'` AND `status NOT IN ('cancelled')` AND `archived_at IS NULL`, or null if no such row exists.
- The dedup check MUST run BEFORE the INSERT.
- If the dedup check returns one row, the page MUST treat that row as the existing order and MUST perform a silent redirect to `menu.html#order=<existingOrderId>` after setting `sessionStorage['bp-checkout-success'] = <existingOrderId>`.
- The silent redirect MUST NOT show any user-visible error, toast, or warning message.
- The silent redirect MUST NOT clear the cart or draft (the existing order is already placed).
- If the dedup check returns no rows (null), the page MUST proceed with the normal INSERT path described in `Submission`.

#### Scenario: Same token resubmitted within 24h silently redirects

- GIVEN an existing `orders` row with `submit_token = T`, `status NOT IN ('cancelled')`, `archived_at IS NULL`, and `created_at` less than 24 hours ago
- WHEN the user resubmits the form with `submit_token = T`
- THEN the dedup check MUST return that existing row's id
- AND the page MUST set `sessionStorage['bp-checkout-success']` to that order id
- AND MUST navigate the browser to `menu.html#order=<existingOrderId>`
- AND MUST NOT show any error, toast, or warning

#### Scenario: Same token resubmitted after 24h does not dedup

- GIVEN an existing `orders` row with `submit_token = T` and `created_at` more than 24 hours ago
- WHEN the user submits with `submit_token = T`
- THEN the dedup check MUST return null
- AND a new `orders` row MUST be inserted with `submit_token = T`

#### Scenario: Duplicate within 24h does not clear the cart

- GIVEN the user resubmits within 24h and a silent redirect is performed
- WHEN the redirect fires
- THEN `bp-cart-v1` and `bp-checkout-draft` MUST remain untouched

## Out of scope

- Admin observability or chef-side duplicate surfacing (no `admin.html` changes).
- Per-day or per-user rate caps.
- Cross-tab token sharing (sessionStorage is per-tab by design).
- A server-side unique constraint on `(submit_token, created_at_24h_bucket)` — structurally impossible in PostgreSQL.
- Editing or canceling `admin-panel` archived artifacts.

## Dependencies

- `orders.submit_token` column (already exists from `001_orders.sql`).
- Supabase RLS INSERT policy on `orders` MUST whitelist `submit_token` (already allowed by `anon_insert_order` in `003_rls.sql`).
- SECURITY DEFINER RPC `public.find_order_by_submit_token(uuid)` MUST exist on the `public` schema with `EXECUTE` granted to the `anon` role. Created by `002_create_find_order_rpc.sql` in this change.
- `bp-cart-v1` localStorage (unchanged consumer here).
- `bp-checkout-success` sessionStorage flash (unchanged; reused for the silent redirect).
- `menu.html` confirmation banner (unchanged; receives the silent redirect target).