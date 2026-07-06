# Verify Report: `submit-token-idempotency-fix`

## Mode

- **Persistence**: both (openspec + engram)
- **Test runner**: none (`openspec/config.yaml` `apply.tdd: false`); verification is structural + manual
- **Branch**: `fix/submit-token-idempotency`
- **Diff vs `main`**: +148 / −39 across 3 files
- **Commits**: 3 (rebased onto `main`; original SHAs `fa22a1a / feed6aa / 31ff84f` now `7f03ca5 / 62e6ec1 / 70a512b`, same messages, same content)

---

## Completeness Table

| Dimension | Status | Notes |
|---|---|---|
| Proposal artifact | n/a | Not re-verified here (proposal gates were satisfied before apply). |
| Spec delta | PASS | `openspec/changes/submit-token-idempotency-fix/specs/customer-checkout/spec.md` present with MODIFIED + ADDED sections. |
| Design | PASS | `design.md` present with all 5 edits, SQL migrations, failure modes, manual verification (15 steps). |
| Tasks | PASS | 10/10 implementation tasks checked; 1/1 manual verification gate (`4.1`) intentionally unchecked — operator must run it. |
| Apply implementation | PASS | 3 files changed matching tasks; no drift. |
| Build / type-check | n/a | No build tooling in this project (binding invariant 7). |
| Unit / integration tests | n/a | No test runner (`apply.tdd: false`, binding invariant 8). |
| Runtime verification | PENDING | The 15-step manual verification (browser + Supabase Studio) must be run by the operator. This report documents it. |
| Spec compliance matrix | PASS | All scenarios map to implementation evidence; see Section A. |
| Design coherence | PASS | All 5 edits + 3 MEDIUM review items (M-A, M-B, M-C) applied. |
| Binding invariants | PASS | Diff vs `main` for all out-of-scope paths is empty (see Section A6 / A9). |

---

## Section A — Structural Checks

### A1. Spec §MODIFIED Submission

| ID | Requirement | Status | Evidence | Line ref |
|---|---|---|---|---|
| A1.1 | `sessionStorage` key is exactly `bp-submit-token` | PASS | `var SUBMIT_TOKEN_KEY = 'bp-submit-token';` | checkout.html:143 |
| A1.2 | Token generated on first mount if absent | PASS | `ensureSubmitToken()` reads-or-writes; absent → generate fresh | checkout.html:145–155 |
| A1.3 | Same token sent on every retry within the same tab | PASS | sessionStorage persists across reloads; `window.__bpIdempotencyToken` set once and reused | checkout.html:148, 354 |
| A1.4 | `submit_token` is in the order INSERT payload | PASS | `submit_token: window.__bpIdempotencyToken` | checkout.html:354 |
| A1.5 | Dedup mechanism is the SECURITY DEFINER RPC with `.single()` | PASS | `supabase.rpc('find_order_by_submit_token', { p_token: token }).single()` | checkout.html:322 |
| A1.6 | 24h window + status NOT IN ('cancelled') + archived_at IS NULL | PASS | RPC body filters all four conditions | 002_create_find_order_rpc.sql:19–22 |
| A1.7 | `submitting` boolean still gates double-submit | PASS | `if (submitting) return;` on submit; flag lifecycle preserved (declare L179, set true L265, set false on error L388) | checkout.html:256, 179, 265, 388 |

### A2. Spec §ADDED Token persistence

| ID | Requirement | Status | Evidence | Line ref |
|---|---|---|---|---|
| A2.1 | Storage is `sessionStorage`, key `bp-submit-token` | PASS | `var SUBMIT_TOKEN_KEY = 'bp-submit-token';` + `sessionStorage.getItem/setItem` | checkout.html:143, 147, 153 |
| A2.2 | Cross-tab sharing is NOT enabled | PASS | sessionStorage is per-tab by spec; no `localStorage.setItem('bp-submit-token', ...)` exists anywhere in the repo | grep result: no matches in burger-site-draft |
| A2.3 | Survives reloads | PASS (logical) | sessionStorage persists across reloads; explicit reuse in `ensureSubmitToken()` (line 148) | checkout.html:147–148 |
| A2.4 | Fresh token on tab close | PASS (logical) | sessionStorage is per-tab; new tab = new storage | confirmed by spec (sessionStorage semantics) |
| A2.5 | NOT written to localStorage, document.cookie, or other persistent store | PASS | grep for `localStorage.*submit_token`, `document.cookie` → 0 matches in checkout.html | grep result: no matches |

### A3. Spec §ADDED Duplicate handling

| ID | Requirement | Status | Evidence | Line ref |
|---|---|---|---|---|
| A3.1 | SELECT (RPC) runs BEFORE INSERT | PASS | `findExistingOrderForToken(...)` called before `supabase.from('orders').insert(...)` | checkout.html:357 → 370 |
| A3.2 | Filtered by all four conditions | PASS | RPC WHERE clause: `submit_token = p_token AND created_at >= now() - interval '24 hours' AND status NOT IN ('cancelled') AND archived_at IS NULL` | 002_create_find_order_rpc.sql:19–22 |
| A3.3 | On match: sets `sessionStorage['bp-checkout-success']`, navigates to `menu.html#order=<id>`, NO error UX | PASS | `silentRedirectToExisting(id)` sets `SUCCESS_KEY` and navigates; no error UX in that branch | checkout.html:325–329, 364–368 |
| A3.4 | Cart and draft are NOT cleared on duplicate | PASS | `silentRedirectToExisting` does not touch `CART_KEY` / `DRAFT_KEY`; explicit comment "do NOT clear cart or draft on duplicate (spec delta)" | checkout.html:325–329 |
| A3.5 | On no match: proceeds to normal INSERT path | PASS | `else if (sel.data) { ... return; }` falls through to INSERT | checkout.html:364–369 |

### A4. SQL files

#### `001_drop_broken_index.sql`

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| A4.1 | `DROP INDEX IF EXISTS public.orders_submit_token_24h_uidx;` | PASS | Line 12 |
| A4.2 | `CREATE INDEX IF NOT EXISTS orders_submit_token_idx ON public.orders (submit_token) WHERE submit_token IS NOT NULL;` | PASS | Lines 18–20 |
| A4.3 | REQUIRES header comment present | PASS | Lines 6–8: `REQUIRES: admin-panel/sql/001_orders.sql + 002_order_items.sql + 003_rls.sql` |
| A4.4 | Idempotent | PASS | `DROP INDEX IF EXISTS` + `CREATE INDEX IF NOT EXISTS` |

#### `002_create_find_order_rpc.sql`

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| A4.5 | `CREATE OR REPLACE FUNCTION public.find_order_by_submit_token(p_token uuid)` | PASS | Line 11 |
| A4.6 | `RETURNS TABLE(id uuid, created_at timestamptz)` | PASS | Line 12 |
| A4.7 | `LANGUAGE sql` | PASS | Line 13 |
| A4.8 | `SECURITY DEFINER` | PASS | Line 14 |
| A4.9 | `SET search_path = public` | PASS | Line 15 |
| A4.10 | Body filters all four conditions | PASS | Lines 19–22 |
| A4.11 | `ORDER BY o.created_at DESC LIMIT 1` | PASS | Lines 23–24 |
| A4.12 | `REVOKE ALL ... FROM PUBLIC` BEFORE `GRANT EXECUTE ... TO anon` | PASS | Lines 27 (REVOKE) → 28 (GRANT) |
| A4.13 | REQUIRES header comment present | PASS | Lines 7–8: `REQUIRES: admin-panel/sql/001_orders.sql + 002_order_items.sql + 003_rls.sql` |

### A5. checkout.html edits

| ID | Requirement | Status | Evidence | Line ref |
|---|---|---|---|---|
| A5.1 | Edit 1: `crypto.randomUUID()` direct, no Math.random fallback, sessionStorage-backed, throws on missing crypto | PASS | Direct call to `crypto.randomUUID()` (line 150); `Math.random` only appears in comment explaining why removed (line 142); throws `new Error(...)` on line 152 | checkout.html:140–155 |
| A5.2 | Edit 2: INSERT payload includes `submit_token: window.__bpIdempotencyToken` | PASS | Field present in `orderPayload` | checkout.html:354 |
| A5.3 | Edit 3: `findExistingOrderForToken` calls `supabase.rpc(...).single()` with `.single()` at the end | PASS | `return supabase.rpc('find_order_by_submit_token', { p_token: token }).single();` | checkout.html:321–323 |
| A5.4 | Edit 4: RPC-before-INSERT wrapper uses `if (sel.error)` then `else if (sel.data)` (not `sel.data && sel.data.id`) | PASS | Both branches present, in that order, with explicit `else if` | checkout.html:359, 364 |
| A5.5 | Edit 5: lines 323–325 from the original (dead error handler) are GONE | PASS | `grep` for `submit_token column not found` → 0 matches in checkout.html | confirmed absent |
| A5.MA | M-A: `SUBMIT_TOKEN_CUTOFF_MS` constant NOT present anywhere | PASS | `grep` for `SUBMIT_TOKEN_CUTOFF_MS` → 0 matches in burger-site-draft | confirmed absent |
| A5.MB | M-B: JSDoc note on `findExistingOrderForToken` documents `.single()` + PGRST116 behavior | PASS | JSDoc block explicitly mentions PGRST116 (lines 312–316) and the `if (sel.error)` branch swallowing it | checkout.html:302–320 |
| A5.MC | M-C: try/catch wraps `ensureSubmitToken()` call, shows user-readable error in `#checkout-form-errors`, doesn't touch `submitting` flag | PASS | try/catch block at lines 156–170; user-readable message at line 165 (`'This browser cannot complete checkout. Please use a recent version of Chrome, Firefox, Safari, or Edge.'`); explicit comment "Do NOT touch the `submitting` flag" (line 161); submitting flag declared on line 179 (after the catch) | checkout.html:156–170 |

### A6. Binding invariants (diff scope)

```
git diff main...HEAD -- \
  openspec/changes/admin-panel/ \
  openspec/specs/admin-orders/ \
  openspec/specs/customer-cart-bridge/ \
  openspec/specs/customer-checkout/ \
  openspec/specs/cart/ \
  burger-site-draft/admin.html \
  burger-site-draft/index.html \
  burger-site-draft/menu.html \
  burger-site-draft/supabase-config.js
```

**Status: PASS** — empty diff. All out-of-scope paths untouched.

### A7. Commit hygiene

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| A7.1 | 3 commits with conventional commit messages | PASS | `7f03ca5 feat(db): ...`, `62e6ec1 feat(checkout): ...`, `70a512b feat(checkout): ...` |
| A7.2 | Each commit is independently reviewable | PASS | Commit 1 touches only SQL files (48 lines). Commit 2 touches only checkout.html (22 ins / 15 del). Commit 3 touches only checkout.html (80 ins / 26 del). The two checkout commits could be merged for review but are non-overlapping in intent. |
| A7.3 | Commit messages explain WHY (not just what) | PARTIAL | Subject lines carry context (`idempotency dedup`, `sessionStorage`, `silent redirect`). No commit bodies. The original apply-phase commits also had no bodies; this is preserved from the original (per orchestrator note). Acceptable but a SUGGESTION, not a CRITICAL. |

### A8. Files in correct locations

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| A8.1 | SQL files at `openspec/changes/submit-token-idempotency-fix/sql/` | PASS | `001_drop_broken_index.sql` and `002_create_find_order_rpc.sql` both present |
| A8.2 | checkout.html edits at `burger-site-draft/checkout.html` | PASS | Only file modified under burger-site-draft |
| A8.3 | No stray files outside the diff | PASS | `git diff main...HEAD --name-only` returns exactly the 3 expected files |

### A9. Synced spec unchanged

```
git diff main...HEAD -- openspec/specs/customer-checkout/spec.md
```

**Status: PASS** — empty diff. Only the delta spec inside the change directory was updated; the canonical synced spec at `openspec/specs/customer-checkout/spec.md` is NOT modified (correct — archive phase will sync it).

---

## Section B — Manual Verification (15 steps, operator-runs)

The following steps require a browser and Supabase Studio credentials that only the operator has. They MUST be run before merge. Each step includes: what to do, expected outcome, how to verify.

**Prerequisites** (verify before running any step):
- Chef has run `admin-panel/sql/001_orders.sql` + `002_order_items.sql` + `003_rls.sql`
- Chef has run `submit-token-idempotency-fix/sql/001_drop_broken_index.sql` + `002_create_find_order_rpc.sql`
- `burger-site-draft/supabase-config.js` has real Supabase URL + publishable key

### Step 1 — `bp-submit-token` visible in sessionStorage on first mount

- **Action**: Open `burger-site-draft/menu.html` → add an item to cart → click "Checkout" → land on `checkout.html`. Open DevTools → Application → Session Storage.
- **Expected**: A key `bp-submit-token` is present with a UUID value (e.g. `550e8400-e29b-41d4-a716-446655440000`).
- **Verify**: Click into the row; the value is a 36-character string in canonical 8-4-4-4-12 form.

### Step 2 — Submit inserts order with matching `submit_token`

- **Action**: On `checkout.html` fill name/email/phone, pick "Pickup", set a future `pickup_time`, click "Place order".
- **Expected**: Browser navigates to `menu.html#order=<id>`; green confirmation banner is visible.
- **Verify**: Open Supabase Studio → `orders` table → find the new row. The `submit_token` column equals the UUID from Step 1's sessionStorage.

### Step 3 — `bp-submit-token` is NOT in localStorage

- **Action**: Stay on `menu.html`. DevTools → Application → Local Storage (same origin).
- **Expected**: NO key named `bp-submit-token`. Only `bp-cart-v1` and `bp-checkout-draft` should be present.
- **Verify**: Scan the localStorage entries; confirm absence.

### Step 4 — Token reused across reloads in the same tab

- **Action**: Navigate back to `checkout.html` in the same tab (via menu's "Back to menu" or any same-tab navigation). Open DevTools → Application → Session Storage.
- **Expected**: Same UUID as Step 1 (not a fresh one).
- **Verify**: Compare byte-for-byte with the Step 1 value.

### Step 5 — Resubmit silently redirects to the SAME order id (and verifies exactly one row in `orders`)

- **Action**: From the same tab, fill the form again and submit. Browser should redirect to `menu.html#order=<existingId>` without an error toast. **Then immediately** open Supabase Studio → `orders` table → filter by `submit_token = <Step-1-UUID>`.
- **Expected**: Banner shown with the SAME order id as Step 2. NO error toast or warning. **Exactly ONE row** in `orders` for that `submit_token`.
- **Verify**: The URL fragment after `#order=` equals the id from Step 2. The filter in Supabase Studio returns 1 row, not 2. **Browser-side success alone is NOT sufficient proof — the RPC could silently no-op and a second row could land without an error. The Studio row count is the load-bearing assertion** (this was the M4 fix from earlier review).

### Step 6 — Cart and draft preserved on duplicate redirect

- **Action**: After Step 5's silent redirect, inspect `bp-cart-v1` and `bp-checkout-draft` in DevTools → Application → Local Storage.
- **Expected**: Both keys still present and unchanged from before Step 5.
- **Verify**: Inspect the values; they match what they were before the resubmit.

### Step 7 — Fresh UUID after tab close

- **Action**: Close the tab completely. Open a NEW tab to `checkout.html` (with cart populated). DevTools → Application → Session Storage.
- **Expected**: A NEW UUID (different from Step 1's).
- **Verify**: Compare with the Step 1 UUID; they differ.

### Step 8 — Fresh token produces a new order

- **Action**: Submit valid form in the new tab.
- **Expected**: A NEW order row is inserted (different `submit_token` from Steps 2/5).
- **Verify**: Supabase Studio → `orders` table. Confirm the new row's `submit_token` equals the Step 7 UUID, distinct from the previous one.

### Step 9 — Indexes in Supabase Studio

- **Action**: In Supabase Studio → SQL Editor, run `\d orders`.
- **Expected**: The output lists `orders_submit_token_idx` (partial btree on `submit_token`). It does NOT list `orders_submit_token_24h_uidx` (which was dropped).
- **Verify**: Read the index list under `public.orders`.

### Step 10 — Confirmation banner is one-shot

- **Action**: Reload `menu.html` after Step 5.
- **Expected**: The green banner is gone (it consumed the `bp-checkout-success` flash on first render).
- **Verify**: Page renders without the banner; `sessionStorage['bp-checkout-success']` is no longer present (or is empty).

### Step 11 — `submitting` flag blocks double-submit on slow network

- **Action**: DevTools → Network tab → throttle to "Slow 3G". Submit form twice quickly (double-click).
- **Expected**: Only ONE Supabase RPC + INSERT chain issues. The second click is silently dropped because `submitting === true`.
- **Verify**: DevTools → Network tab shows exactly one POST to `/rest/v1/orders` (or to `/rest/v1/rpc/find_order_by_submit_token` + `/rest/v1/orders`). The button is disabled while the first call is in-flight.

### Step 12 — Two tabs = two separate tokens (cross-tab dedup is out of scope)

- **Action**: Open `checkout.html` in two tabs (A and B) with cart populated in each. Submit in each.
- **Expected**: TWO `orders` rows in `orders` table, each with its own per-tab `submit_token`. No cross-tab dedup.
- **Verify**: Supabase Studio → `orders` table shows two rows created in this test, each with distinct `submit_token` values.

### Step 13 — SECURITY DEFINER RPC exists in `pg_proc`

- **Action**: In Supabase Studio → SQL Editor, run: `SELECT proname, prosecdef FROM pg_proc WHERE proname = 'find_order_by_submit_token';`
- **Expected**: One row returned with `proname = 'find_order_by_submit_token'` and `prosecdef = true`.
- **Verify**: `prosecdef = true` proves SECURITY DEFINER is in effect (the function runs as the function owner, bypassing RLS for `anon`).

### Step 14 — `anon` has EXECUTE privilege on the RPC

- **Action**: In Supabase Studio → SQL Editor, run: `SELECT has_function_privilege('anon', 'public.find_order_by_submit_token(uuid)', 'EXECUTE');`
- **Expected**: Returns `true`.
- **Verify**: The boolean result is `t` (true). This proves `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO anon` is wired correctly.

### Step 15 — Regression check: `anon` direct SELECT is RLS-blocked

- **Action**: In Supabase Studio → SQL Editor as the `anon` role, or via the Supabase REST API directly without the RPC wrapper, run: `SELECT id FROM orders WHERE submit_token = '<any-uuid>' LIMIT 1;`
- **Expected**: Returns zero rows (no anon SELECT policy exists). If you run this via the REST API as `anon`, the response is `{ data: null, error: null }` or `[]`.
- **Verify**: The query returns no rows. **This proves why the RPC was necessary, not optional** — without it, a direct SELECT-before-INSERT would always think no prior order exists.

---

## Section C — Code-quality spot-checks

| ID | Check | Status | Evidence |
|---|---|---|---|
| C.1 | No `console.log` in new sections | PASS | `grep console.log checkout.html` → 0 matches. Only `console.warn` exists (line 363), which is intentional diagnostic on RPC failure. |
| C.2 | No commented-out code in new sections | PASS | New lines 142–170, 301–329, 357–391 contain only live code or explanatory comments. The deleted `Math.random` fallback is referenced only in a comment explaining its removal. |
| C.3 | No new dependencies or `import` statements | PASS | `grep -E "^import \|^require\(" checkout.html` → 0 matches. Supabase SDK is loaded via existing `<script src="https://cdn.jsdelivr.net/...">` (line 11), unchanged. |
| C.4 | `submitting` flag has the same lifecycle sites | PASS | Declare L179, set true L265, set false on error L388. Identical to pre-change sites (binding invariant 10 confirmed). |
| C.5 | try/catch around sessionStorage uses the same `catch (ex) {}` pattern | PASS | `catch (ex) {}` used identically at lines 147, 153, 287, 298, 326, 380 (existing) and the new lines (147, 153, 326). |
| C.6 | M-C error message is user-readable (no schema leak) | PASS | Message at line 165: "This browser cannot complete checkout. Please use a recent version of Chrome, Firefox, Safari, or Edge." — no column names, no SQL, no stack traces. |

---

## Issues

### CRITICAL

None. All structural checks pass.

### WARNING

None.

### SUGGESTION

- **S1**: Commit messages have subject lines but no body. The subject lines do convey WHY (e.g., "drop broken partial unique index", "persist idempotency token to sessionStorage", "dedup orders via SECURITY DEFINER RPC"), so reviewers can understand intent from the title alone. A body explaining the WHY-in-detail would make this even more reviewable, but it's not blocking. Pre-existing condition (also true on the original SHAs before rebase).

### LOW (informational, not blocking)

- **L1 (from review-reliability, pre-existing)**: `001_drop_broken_index.sql` line 16 comment says "The application-layer RPC still filters created_at >= now() - 24h server-side" while `002_create_find_order_rpc.sql` is the file that actually implements the filter. The phrasing reads as if `001` itself references the RPC, which is slightly confusing. Not a code defect — both files are correct; just a wording nuance. Operator should run `002` to make the filter live.

---

## Spec Compliance Matrix

| Spec section | Requirement | Implementation evidence | Status |
|---|---|---|---|
| MODIFIED Submission | sessionStorage key `bp-submit-token` | SUBMIT_TOKEN_KEY constant | PASS |
| MODIFIED Submission | Token generated on first mount if absent | `ensureSubmitToken()` read-or-write | PASS |
| MODIFIED Submission | Same token on every retry within the tab | sessionStorage persists; `window.__bpIdempotencyToken` set once | PASS |
| MODIFIED Submission | `submit_token` in INSERT payload | checkout.html:354 | PASS |
| MODIFIED Submission | SECURITY DEFINER RPC dedup with `.single()` | checkout.html:321–323 | PASS |
| MODIFIED Submission | 24h window + status NOT IN ('cancelled') + archived_at IS NULL | 002_create_find_order_rpc.sql:19–22 | PASS |
| MODIFIED Submission | `submitting` boolean gates double-submit | checkout.html:256 | PASS |
| MODIFIED Submission | `status = 'received'` server-default | Unchanged; server-default in `001_orders.sql:18` | PASS (unchanged) |
| MODIFIED Submission | `created_at` server-default `now()` | Unchanged; server-default in `001_orders.sql:11` | PASS (unchanged) |
| ADDED Token persistence | sessionStorage key `bp-submit-token` | checkout.html:143 | PASS |
| ADDED Token persistence | Per-tab scope; cross-tab out of scope | sessionStorage semantics | PASS |
| ADDED Token persistence | Survives reloads | sessionStorage semantics + reuse in `ensureSubmitToken` | PASS |
| ADDED Token persistence | Fresh on tab close | sessionStorage semantics | PASS |
| ADDED Token persistence | NOT written to localStorage/cookie | grep result: 0 matches | PASS |
| ADDED Duplicate handling | RPC runs BEFORE INSERT | checkout.html:357 → 370 | PASS |
| ADDED Duplicate handling | Filter by all four conditions | 002_create_find_order_rpc.sql:19–22 | PASS |
| ADDED Duplicate handling | On match: set bp-checkout-success + navigate, NO error UX | `silentRedirectToExisting` | PASS |
| ADDED Duplicate handling | Cart and draft NOT cleared on duplicate | No removal calls in `silentRedirectToExisting` | PASS |
| ADDED Duplicate handling | On no match: normal INSERT path | `else if (sel.data)` falls through | PASS |

---

## Final Verdict

**PASS** — All structural checks succeed. The implementation matches the spec, design, and tasks. Binding invariants are respected. The branch is rebased cleanly on `main`, contains 3 reviewable commits, and diffs are scoped exactly to the 3 expected files.

The 15-step manual verification (Section B) is documented but NOT executed by this verify-phase (no browser or Supabase Studio credentials available to the executor). The operator must run all 15 steps before merge, with particular attention to Step 5 (Supabase Studio row-count check — browser-side success alone is not sufficient proof) and Steps 13–15 (SQL-level RPC verification).

**Recommendation: `verify-pass-archive`** pending operator completion of the 15-step manual verification.