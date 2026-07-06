# Design: submit-token-idempotency-fix

## Technical Approach

Drop the broken partial unique index in a new SQL migration; persist the per-tab idempotency token to `sessionStorage` instead of memory; include `submit_token` in the `orders` INSERT payload; add a SECURITY DEFINER RPC-based dedup check that silently redirects duplicates to the existing order's confirmation banner. The RPC (`public.find_order_by_submit_token`) bypasses RLS on behalf of `anon` and filters server-side to exclude cancelled/archived orders. The existing `submitting` boolean double-submit guard is preserved unchanged.

## Architecture Decisions

### Decision: Token storage — `sessionStorage`, not `localStorage`

| Aspect | sessionStorage | localStorage |
|---|---|---|
| Cross-tab isolation | ✅ per-tab | ❌ shared across tabs |
| Survives reload | ✅ | ✅ |
| Survives tab close | ❌ (fresh on new tab) | ✅ |
| Spec requirement | ✅ MATCHES | ❌ violates "per-tab" |

`sessionStorage` is the only storage mechanism that satisfies both "survives reload" and "per-tab" requirements simultaneously. Cross-tab dedup is intentionally out of scope.

### Decision: Dedup at application layer, not via DB constraint

| Aspect | App-layer RPC | Partial unique index |
|---|---|---|
| Predicate must be IMMUTABLE | ✅ | ❌ `now()` is STABLE |
| Works with rolling 24h window | ✅ | ❌ structurally impossible |
| Deployed today | ✅ | ❌ PG rejects the original DDL |
| Works against RLS-protected table | ✅ via SECURITY DEFINER | ❌ blocked by RLS for `anon` |

The proposal's "belt-and-braces" promise was structurally impossible to deliver via DB constraint. The application layer is the correct place — and the only place — for this check. **No DB-level safety net exists** in the final design: idempotency rests entirely on the RPC + `submitting` flag + sessionStorage token.

### Decision: Silent redirect on duplicate, not user-visible warning

User retrying a stuck submit should see a working confirmation banner, not an error toast. Matches the existing flash-banner UX. The `bp-checkout-success` flash carries the existing order id to `menu.html` exactly as a fresh order would.

### Decision: New SQL index for the SELECT — partial btree on `(submit_token)` only

```sql
CREATE INDEX IF NOT EXISTS orders_submit_token_idx
  ON public.orders (submit_token)
  WHERE submit_token IS NOT NULL;
```

**Why this doesn't repeat the original bug**: the original index predicate (`WHERE ... AND created_at > now() - interval '24 hours'`) baked a STABLE expression into an IMMUTABLE-required predicate. The new index has NO time predicate — it is purely on the immutable `submit_token` uuid. The RPC filters `created_at >= cutoff` server-side; the index makes the equality lookup O(log n) instead of seq scan. The new index is NOT unique — there is no DB-level idempotency guarantee. Idempotency rests entirely on the RPC + `submitting` flag + sessionStorage token.

### Decision: SECURITY DEFINER RPC, not RLS policy

`003_rls.sql` defines exactly three policies on `orders`: `anon_insert_order` (INSERT only), `admin_select_orders` (SELECT only), `admin_update_orders` (UPDATE only). **There is no `TO anon FOR SELECT` policy.** Under RLS, an `anon` role calling `.from('orders').select(...)` returns `{ data: null, error: null }` — the classic PostgREST "RLS hides everything" behavior. A direct SELECT-before-INSERT from the browser would always think no prior order exists, defeating dedup entirely.

The fix is **not** to add a `TO anon FOR SELECT` policy: that would expose every order row (customer name, email, phone, fulfillment, totals) to anyone who knew the table existed. Instead we use a **SECURITY DEFINER** RPC that runs as the function owner (bypassing RLS for the duration of the call) but only returns the two columns we need (id, created_at) and only for the specific 24h window.

**The RPC function body**:

```sql
CREATE OR REPLACE FUNCTION public.find_order_by_submit_token(p_token uuid)
RETURNS TABLE(id uuid, created_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.created_at
  FROM public.orders o
  WHERE o.submit_token = p_token
    AND o.created_at >= now() - interval '24 hours'
    AND o.status NOT IN ('cancelled')
    AND o.archived_at IS NULL
  ORDER BY o.created_at DESC
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.find_order_by_submit_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_order_by_submit_token(uuid) TO anon;
```

**Why this works**:
- `SECURITY DEFINER` runs the function body as the function owner (typically `postgres`), bypassing RLS for the SELECT inside the function — that's the whole point.
- `LANGUAGE sql` is intentional: single read-only query, no PL/pgSQL constructs, no dynamic SQL execution. Minimum possible SQL surface, no statement-permission concerns.
- `SET search_path = public` prevents search-path hijacking (known SECURITY DEFINER hardening pattern).
- `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO anon` gives `anon` the exact minimum permission needed.
- The function filters `status NOT IN ('cancelled')` AND `archived_at IS NULL` so a user retrying within 24h of a cancelled/archived order gets a NEW order, not a silent redirect to the cancelled confirmation banner (which `menu.html`'s `showBanner` would render as a success).
- `ORDER BY created_at DESC LIMIT 1` is defensive — the broken partial unique index never deployed, but the ORDER+LIMIT keeps the function robust against any future schema change.

**Why this is preferred over a direct `TO anon FOR SELECT` policy**: RPC exposes only two columns (`id`, `created_at`) for matching tokens; a SELECT policy would expose ALL columns of ALL rows. RPC is one auditable function (greppable, reviewable) and allows `LIMIT 1` + custom filters baked into the data path — policies can only express `USING` predicates, not row-shape limits.

## Data Flow

```
User clicks "Place order"
        │
        ▼
[Guard] submitting === true? ──── YES ──▶ return (existing behavior)
        │ NO
        ▼
[Guard] submitting = true; disable button (existing behavior)
        │
        ▼
[Read] sessionStorage['bp-submit-token'] → window.__bpIdempotencyToken
        │ (generate + write UUID if absent)
        ▼
[Build] orderPayload (existing) + submit_token
        │
        ▼
[Dedup RPC] supabase.rpc('find_order_by_submit_token', { p_token: token }).single()
        │ (SECURITY DEFINER — bypasses RLS, filters cancelled/archived server-side)
        │
        ├── { data: { id, created_at } } ──▶ sessionStorage['bp-checkout-success'] = id
        │                                       window.location.href = 'menu.html#order=' + id
        │                                       (return — NO cart clear, NO draft clear)
        │
        └── { data: null } ──▶ [INSERT] existing path → order_items → cart clear
                                → redirect to menu.html#order=<new id>
```

## File Changes

| File | Action | Description |
|---|---|---|
| `openspec/changes/submit-token-idempotency-fix/sql/001_drop_broken_index.sql` | Create | `DROP INDEX IF EXISTS public.orders_submit_token_24h_uidx;` + create replacement `(submit_token)` partial btree. Idempotent. |
| `openspec/changes/submit-token-idempotency-fix/sql/002_create_find_order_rpc.sql` | Create | SECURITY DEFINER RPC `public.find_order_by_submit_token(uuid)` + `GRANT EXECUTE TO anon`. Idempotent. |
| `burger-site-draft/checkout.html` | Modify | Persist token to sessionStorage; include `submit_token` in INSERT; add RPC-based dedup; remove dead "submit_token column not found" error branch. |
| `burger-site-draft/admin.html` | **NO CHANGE** | Binding invariant 3. |
| `burger-site-draft/index.html` | **NO CHANGE** | Binding invariant 4. |
| `burger-site-draft/menu.html` | **NO CHANGE** | Binding invariant 5. |
| `burger-site-draft/supabase-config.js` | **NO CHANGE** | Binding invariant 9 (no new credentials). |
| `openspec/changes/admin-panel/**` | **NO CHANGE** | Binding invariant 1. |

Splitting the SQL into two files (drop-index vs create-RPC) lets apply run them independently and roll back independently.

## Edit Plan: `burger-site-draft/checkout.html`

All edits are inside the IIFE that starts at line 139.

### Edit 1 — Token generation (current lines 142–152)

Replace the in-memory `window.__bpIdempotencyToken = (...)` block with a sessionStorage-backed read-or-write:

```js
// crypto.randomUUID is universally available since 2022; no Math.random fallback (slice bug produced malformed UUIDs).
var SUBMIT_TOKEN_KEY = 'bp-submit-token';
var SUBMIT_TOKEN_CUTOFF_MS = 24 * 60 * 60 * 1000;

function ensureSubmitToken() {
  var existing = null;
  try { existing = sessionStorage.getItem(SUBMIT_TOKEN_KEY); } catch (ex) {}
  if (existing) { window.__bpIdempotencyToken = existing; return; }
  var fresh = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : null;
  if (!fresh) throw new Error('crypto.randomUUID unavailable; checkout cannot run safely');
  try { sessionStorage.setItem(SUBMIT_TOKEN_KEY, fresh); } catch (ex) {}
  window.__bpIdempotencyToken = fresh;
}
ensureSubmitToken();
```

### Edit 2 — Remove dead comment, include `submit_token` (current lines 298–305)

Replace the `// NOTE: Do NOT add submit_token here...` comment block with the corrected payload:

```js
var orderPayload = {
  customer_name: formData.customer_name,
  customer_email: formData.customer_email,
  customer_phone: formData.customer_phone,
  fulfillment: formData.fulfillment,
  pickup_time: formData.fulfillment === 'pickup' ? formData.pickup_time : null,
  subtotal_cents: subtotal,
  total_cents: subtotal,
  submit_token: window.__bpIdempotencyToken
};
```

### Edit 3 — Add dedup helper before `submitOrder` (insert near line 283)

```js
function findExistingOrderForToken(token) {
  return supabase.rpc('find_order_by_submit_token', { p_token: token }).single();
  // `.single()` unwraps the TABLE response to one object or null
  // returns: { data: { id: uuid, created_at: timestamp } | null, error: PostgrestError | null }
}
```

API notes: `.rpc()` returns the same `{ data, error }` envelope as `.from(...).select(...)`. The RPC function `find_order_by_submit_token` is `SECURITY DEFINER` — it bypasses RLS server-side and applies the 24h window + `status NOT IN ('cancelled')` + `archived_at IS NULL` filter in PostgreSQL itself, eliminating the client-side cutoff calculation and the H3 "cancelled-as-success" risk. `data` is `null` when no match, or `{ id, created_at }` on match.

### Edit 4 — Wrap existing INSERT in RPC-before-INSERT (current lines 307–330)

Restructure `submitOrder` so the RPC gates the INSERT. Preserve the existing INSERT → order_items → cart/draft/success flow and the existing error handler. Add silent redirect on match. After `.single()`, the response shape is `{ data: { id } | null, error }`; the if-check simplifies to `if (sel.data)` since `.single()` guarantees `data` is the unwrapped object or null:

```js
function silentRedirectToExisting(id) {
  try { sessionStorage.setItem(SUCCESS_KEY, id); } catch (ex) {}
  window.location.href = 'menu.html#order=' + id;
  // NOTE: do NOT clear cart or draft on duplicate (spec delta)
}

findExistingOrderForToken(window.__bpIdempotencyToken)
  .then(function (sel) {
    if (sel.error) {
      // RPC failed (network, transient). Fall through to INSERT — best-effort.
      console.warn('[checkout] dedup RPC failed', sel.error);
    } else if (sel.data) {
      // Server-side filter already excluded cancelled + archived orders.
      // Any match is a live, active order — safe to silently redirect.
      silentRedirectToExisting(sel.data.id);
      return;
    }
    return supabase.from('orders').insert(orderPayload).select().single()
      .then(function (res) {
        if (res.error) throw res.error;
        // ... existing order_items + cart clear + redirect logic ...
      })
      .catch(function (err) {
        // existing error handler (minus the dead submit_token branch)
        var msg = "We couldn't place your order. Check your connection and try again.";
        var errEl = document.getElementById('checkout-form-errors');
        if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
        submitting = false;
        document.getElementById('checkout-submit').disabled = false;
      });
  });
```

### Edit 5 — Remove dead error branch (current lines 323–325)

Delete these three lines:
```js
if (err && err.details && err.details.indexOf && err.details.indexOf('submit_token') !== -1) {
  msg = 'Server error: submit_token column not found — ensure migrations 001-003 are run in Supabase Studio.';
}
```

`submit_token` is now an explicit field in the INSERT; if the column were missing, the user sees the generic error (which is correct — a schema problem should never be shown to a customer).

### Untouched

- Lines 220, 238, 247, 328: `submitting` flag lifecycle (binding invariant 10).
- Lines 88–90: `data-checkout-subtotal`, 411–434: Slice 2 manual verification comments — leave the existing 10-step list and append 4 new steps for idempotency.

## SQL Migrations

### `001_drop_broken_index.sql`

```sql
-- REQUIRES: admin-panel/sql/001_orders.sql + 002_order_items.sql + 003_rls.sql
--   (provides public.orders table, submit_token column, RLS enabled)
-- Run AFTER the admin-panel migrations.
-- 001_drop_broken_index.sql — Drop the structurally invalid partial unique
-- index from admin-panel/001_orders.sql and replace with an IMMUTABLE-safe
-- index that supports the application-layer dedup RPC.
-- Idempotent: safe to re-run.

-- 1. Drop the broken index. PG would have rejected it at creation time
--    (now() is STABLE, partial index predicates must be IMMUTABLE).
DROP INDEX IF EXISTS public.orders_submit_token_24h_uidx;

-- 2. Add a non-unique partial btree on submit_token only. No time predicate.
--    The RPC filters created_at >= now() - 24h server-side; the index makes
--    the equality lookup O(log n), the time filter applies to a 0-1 row
--    result. NOT unique — there is no DB-level idempotency guarantee in this
--    design (intentional; see architecture decision above).
CREATE INDEX IF NOT EXISTS orders_submit_token_idx
  ON public.orders (submit_token)
  WHERE submit_token IS NOT NULL;
```

### `002_create_find_order_rpc.sql`

```sql
-- REQUIRES: admin-panel/sql/001_orders.sql + 002_order_items.sql + 003_rls.sql
--   (provides public.orders table, submit_token column, RLS enabled)
-- Run AFTER the admin-panel migrations.
-- 002_create_find_order_rpc.sql — SECURITY DEFINER RPC used by
-- checkout.html for dedup. Bypasses RLS to read orders on behalf of anon,
-- but only returns (id, created_at) for orders matching the token + 24h
-- window that are not cancelled and not archived.
-- Idempotent: CREATE OR REPLACE + DROP/GRANT pairs.

CREATE OR REPLACE FUNCTION public.find_order_by_submit_token(p_token uuid)
RETURNS TABLE(id uuid, created_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.created_at
  FROM public.orders o
  WHERE o.submit_token = p_token
    AND o.created_at >= now() - interval '24 hours'
    AND o.status NOT IN ('cancelled')
    AND o.archived_at IS NULL
  ORDER BY o.created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.find_order_by_submit_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_order_by_submit_token(uuid) TO anon;
```

Run order: `001_drop_broken_index.sql` then `002_create_find_order_rpc.sql` (the RPC does not depend on the index, but applying in numeric order keeps the audit trail clean).

## Interfaces / Contracts

### Storage keys

| Key | Scope | Lifetime | Purpose |
|---|---|---|---|
| `bp-submit-token` | sessionStorage | tab lifetime | per-tab UUID for idempotency |
| `bp-checkout-success` | sessionStorage | one-shot (read by menu.html) | existing flash banner trigger |
| `bp-cart-v1` | localStorage | persistent | existing cart |
| `bp-checkout-draft` | localStorage | persistent | existing draft |

### Supabase JS call signatures

```ts
// Dedup lookup (new) — SECURITY DEFINER RPC, server-side filtered
supabase.rpc('find_order_by_submit_token', { p_token: string }).single()
// returns: { data: { id: uuid, created_at: timestamp } | null,
//           error: PostgrestError | null }
//   data === null           → no matching order in 24h window
//   data === { id, ... }    → silent redirect target

// Order insert (existing payload + new field)
supabase.from('orders')
  .insert({ /* ... existing fields ..., submit_token: uuidString */ })
  .select()
  .single()
// returns: { data: { id: uuid, ... }, error: PostgrestError | null }
```

Note: `.rpc()` is the Supabase JS SDK's standard interface for calling PostgreSQL `SECURITY DEFINER` functions. It transparently URL-encodes the parameter and deserializes the returned `TABLE(...)` rows. No SDK version pinning required — the same `.rpc()` API has existed since supabase-js v1.

## Failure Modes

| Failure | Likelihood | Detection | Response |
|---|---|---|---|
| RPC errors (network, transient) | Medium | `sel.error` truthy | Log warning, fall through to INSERT. Worst case: duplicate row, dedup'd on next reload when the user retries. |
| INSERT errors (RLS rejection, schema drift) | Low | `res.error` truthy | Show generic error, re-enable button. Cart/draft preserved. (Existing behavior — error branch simplified.) |
| sessionStorage unavailable (Safari private mode, quota) | Low | `try/catch` around `getItem`/`setItem` | Token generated as in-memory fallback only. Dedup within the tab still works for the lifetime of the page; not across reloads. |
| sessionStorage evicted mid-tab (Safari ITP) | Very low | n/a | Same as above — fresh UUID on next mount, no dedup across the eviction boundary. Acceptable per spec. |
| User has stale cart for an existing order (added items after first submit) | Medium | Cart > existing order | On silent redirect, cart and draft are preserved (spec). User sees banner but cart still has items. Next reload clears nothing; user can re-checkout with a new token (tab close = new token). The RPC's `status NOT IN ('cancelled')` + `archived_at IS NULL` filter means a stale-cart-on-cancelled scenario is no longer possible (the user gets a fresh order instead), but stale-cart-on-a-LIVE order is still possible. |
| Parallel submits in two tabs with same token | Negligible | n/a | sessionStorage is per-tab — different tabs have different tokens. Cross-tab dedup is explicitly out of scope. |
| `orders_submit_token_24h_uidx` exists in prod from a hand-applied edit | Very low | n/a at runtime | `DROP INDEX IF EXISTS` is no-op if absent; safe to re-run. |
| `submit_token` column missing (migrations not run) | Low | INSERT 400 error | Generic error shown; no schema details leaked. Operator must run migrations 001–003 first. |
| RPC `find_order_by_submit_token` not created (002 not run) | Low | RPC 404 / PostgREST error | `sel.error` truthy → falls through to INSERT. Worst case: every submit looks like a "new" order, dedup is broken until operator runs 002. No data corruption — same fail-open behavior as RPC errors. |

## Performance Budget

| Path | p50 | p95 | Notes |
|---|---|---|---|
| RPC (dedup) | ~30–60 ms | ~150–250 ms | Single RPC call over PostgREST. SECURITY DEFINER adds negligible function-call overhead vs the network round-trip. |
| INSERT (existing) | ~80–120 ms | ~200–350 ms | Same as today. |
| Order items batch insert (existing) | ~50–100 ms/line | ~200 ms/line | Same as today. |
| **Total added latency per submit** | **~30–60 ms** | **~150–250 ms** | One extra round-trip. |

**Caching the RPC result**: not warranted within a single page-load — submit fires once per page-load by design (the `submitting` flag prevents repeat calls).

**Index footprint**: the new partial btree on a `uuid` column with low cardinality (one value per active tab) is tiny — kilobytes even at thousands of orders.

## Manual Verification Steps

Run in browser + Supabase Studio. Pre: chef has run migrations 001–003 + this change's `001_drop_broken_index.sql` + `002_create_find_order_rpc.sql`.

| # | Action | Expected |
|---|---|---|
| 1 | Open `checkout.html` (with cart populated) → DevTools → Application → Session Storage | `bp-submit-token` present with a UUID value |
| 2 | Submit valid form → redirected to `menu.html#order=<id>`, banner shown | Order row in `orders` table with `submit_token` matching sessionStorage value |
| 3 | Stay on `menu.html`. Open DevTools → Application → Local Storage | `bp-submit-token` MUST NOT be present (only `bp-cart-v1` and `bp-checkout-draft`) |
| 4 | Add same items to cart again, return to `checkout.html` (do NOT close tab) → DevTools → Session Storage | Same UUID as step 1 |
| 5 | Submit valid form again with the same `bp-submit-token` | Silent redirect to `menu.html#order=<id>` (same id as step 2). NO new row in `orders`. NO error toast. **Then immediately** open Supabase Studio → `orders` table → filter by `submit_token` → confirm exactly ONE row for that token. (Browser-side banner success is not sufficient proof — the RPC could silently no-op and a second row could land without an error.) |
| 6 | Verify cart and draft unchanged after the silent redirect | `bp-cart-v1` and `bp-checkout-draft` still present |
| 7 | Close the tab. Open `checkout.html` again → DevTools → Session Storage | Fresh UUID (different from step 1) |
| 8 | Submit → new order row in `orders` table | Confirms fresh token after tab close |
| 9 | In Supabase Studio → SQL Editor: `\d orders` | `orders_submit_token_24h_uidx` is NOT listed; `orders_submit_token_idx` IS listed |
| 10 | Reload `menu.html` after step 5 | Banner is gone (one-shot flash consumed) |
| 11 | DevTools → Network → throttle to "Slow 3G" → submit twice quickly | Second click is blocked by `submitting` flag; only one Supabase INSERT issued |
| 12 | Open checkout in two tabs, submit in each | Two separate `orders` rows (different per-tab tokens). Cross-tab dedup is intentionally out of scope. |
| 13 | In Supabase Studio → SQL Editor, run: `SELECT proname, prosecdef FROM pg_proc WHERE proname = 'find_order_by_submit_token';` | One row returned with `prosecdef = true`. Verifies the RPC exists and is SECURITY DEFINER. |
| 14 | In Supabase Studio → SQL Editor, run: `SELECT has_function_privilege('anon', 'public.find_order_by_submit_token(uuid)', 'EXECUTE');` | Returns `true`. Verifies anon can execute the RPC. |
| 15 | C1 regression check — before applying this fix, run `SELECT id FROM orders WHERE submit_token = '<any-uuid>' LIMIT 1;` from the JS console as the anon role (or via the Supabase REST API directly without the RPC wrapper) | Returns `{ data: null, error: null }`. Confirms RLS blocks anon SELECT — i.e., proves why the RPC was necessary, not optional. |

## Rollback Plan

1. **Revert `burger-site-draft/checkout.html`** to commit prior to this change. Token behavior returns to in-memory; `submit_token` is no longer in the INSERT payload. **State = today (zero idempotency protection).**
2. **Keep `001_drop_broken_index.sql` committed.** Dropping the broken index is strictly an improvement (the original would have failed at creation time anyway). Reverting it would restore a non-existent object — no-op forward.
3. **Spec delta stays in `openspec/changes/submit-token-idempotency-fix/specs/customer-checkout/spec.md`** until archive phase decides its fate. If the team prefers the original (unfulfilled) wording, do not merge this delta on archive.

## Open Questions

None. All design decisions resolved from proposal + spec + code + RLS inspection. Apply phase can proceed.

## Risks Identified for Apply Phase

| Risk | Severity | Why |
|---|---|---|
| SECURITY DEFINER RPC grants EXECUTE to anon — surface area is one SQL function with one parameter (uuid) returning two columns (id, created_at) for a single row, with `REVOKE ALL FROM PUBLIC` first | Low | Minimal SQL surface; LANGUAGE sql (not PL/pgSQL) eliminates dynamic-SQL risk; `SET search_path = public` prevents search-path hijacking. Worst-case abuse is calling the function with random uuids — it returns nothing for non-matches and leaks at most one order id for matches (which the user would already have if they submitted). |
| Server-side `created_at` filter (RPC) vs client-side ISO string | Low | RPC computes `now() - interval '24 hours'` server-side, eliminating client-side ISO string concerns entirely. The previous design's ISO string timezone risk is now moot — the filter is in PG. |
| `crypto.randomUUID()` unavailable (non-secure context, very old browser) | Low | The broken `Math.random` fallback was removed (the `hex.slice(16,32)` bug pre-dated this change and produced malformed UUIDs Postgres rejects). Checkout now throws a clear error if `crypto.randomUUID` is missing. Acceptable: `crypto.randomUUID` has been universally available since Chrome 92 / Firefox 95 / Safari 15.4 (mid-2022). |
| Safari ITP evicting sessionStorage mid-session | Very low | Acceptable per spec delta — fresh token on reload, dedup window resets. |
| Operator forgets to run `002_create_find_order_rpc.sql` | Low | Symptom: every submit looks new (dedup broken). Detection: manual verification step 14 fails (RPC not callable). No data corruption — `sel.error` truthy path falls through to INSERT. Documented in failure-modes table. |

## Post-review corrections (gate-failure re-review)

Round-1 review returned FAIL on four findings. This section maps each to where it was addressed so a fresh-context reviewer can verify the gate failure was corrected.

| Finding | Where addressed |
|---|---|
| **C1** — Dedup SELECT blocked by RLS (anon has no SELECT policy on orders). | "Decision: SECURITY DEFINER RPC, not RLS policy" section; Data Flow diagram (RPC replaces SELECT); `002_create_find_order_rpc.sql` body; spec delta lines 15 + 71 (RPC wording). |
| **H3** — SELECT could match cancelled/archived orders → silent redirect to "success" banner. | RPC body `AND o.status NOT IN ('cancelled') AND o.archived_at IS NULL`; spec delta lines 78–84 (scenario GIVEN updated to include `status NOT IN ('cancelled')` + `archived_at IS NULL`). |
| **M2** — Spec said `>=`, original SQL said `>`. | RPC body uses `o.created_at >= now() - interval '24 hours'` (matches spec delta); spec delta line 71 unchanged at `>=`. |
| **M4** — Manual verification step 5 needs explicit row-count check. | Manual Verification step 5 updated with: "Then immediately open Supabase Studio → orders table → filter by submit_token → confirm exactly ONE row for that token." Steps 13–15 added for RPC existence + privilege verification. |