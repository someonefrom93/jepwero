# Proposal: submit-token-idempotency-fix

## Intent

The `admin-panel` change (archived 2026-07-05) shipped a SQL migration (`001_orders.sql`) with an invalid partial unique index (`orders_submit_token_24h_uidx`) that PostgreSQL rejects — partial index predicates must be IMMUTABLE and `now()` is STABLE — and even if it compiled, the predicate is evaluated at INSERT time so a rolling 24h window is structurally impossible. The accompanying `customer-checkout` spec promised a server-side dedup "belt-and-braces fallback" but **no `burger-site-draft/` file ever sent the `submit_token` column** (confirmed by grep — `checkout.html:298` explicitly comments it out). Net result: zero idempotency protection in production; double-submits create duplicate orders. This change drops the broken index, persists the idempotency token to `sessionStorage` so it survives page reloads, adds an application-level SELECT-before-INSERT dedup check in `checkout.html`, and silently redirects duplicates to the existing order's confirmation banner.

## Scope

### In Scope

- New SQL migration that drops the broken `orders_submit_token_24h_uidx` index (`DROP INDEX IF EXISTS`) and confirms `submit_token` column exists (no schema change otherwise).
- `burger-site-draft/checkout.html`: persist `bp-submit-token` to `sessionStorage`; include `submit_token` in `orders` insert payload; add SELECT-before-INSERT dedup check; on duplicate, silently redirect to `menu.html#order=<existingOrderId>` with the existing `bp-checkout-success` flash.
- Delta spec at `openspec/changes/submit-token-idempotency-fix/specs/customer-checkout/spec.md` that MODIFIES the "Submission" requirement (replaces broken-constraint promise with app-level check; moves token from in-memory to sessionStorage) and ADDS a "Duplicate handling" requirement + "Token persistence" requirement.

### Out of Scope

- Admin observability (no `admin.html` changes; chef-side duplicate surfacing deferred).
- Per-day or per-user rate caps.
- Cross-tab token sharing (sessionStorage is per-tab by spec — different tabs are different sessions).
- Editing or cancelling `admin-panel` archived artifacts.
- Modifying any other capability spec (`admin-orders`, `customer-cart-bridge`, `cart`).

### Non-Goals

- True server-side unique constraint on `(submit_token, created_at_24h_bucket)` — impossible in PostgreSQL.
- Replacing the existing `submitting` boolean client-side guard.
- Building a payment or auth surface.

## Capabilities

### New Capabilities

None. This is a targeted fix inside an existing capability.

### Modified Capabilities

- `customer-checkout`: token persistence changes from in-memory to `sessionStorage`; the dedup mechanism changes from "server-side unique index" (structurally impossible) to "application-level SELECT-before-INSERT in `checkout.html`". Spec text at `openspec/specs/customer-checkout/spec.md` line 36 needs delta.

## Approach — Round-1 Decisions (locked)

| Decision | Resolution | Rationale |
|---|---|---|
| UX on detected duplicate | **Silent redirect** — reuse existing order id, set `bp-checkout-success`, navigate to `menu.html#order=<existingOrderId>`. No toast, no banner change. | User retrying a stuck submit should see a working confirmation, not an error. Matches the existing flash-banner UX. |
| Token lifetime | **`sessionStorage`** — key `bp-submit-token`. Generated on first `checkout.html` mount if absent; reused on reloads in the same tab; fresh when the tab closes. | Survives the realistic failure (page reload after a network hiccup) without leaking across users (tab close = fresh start). |
| Idempotency window | **24h sliding window** (unchanged). The check uses the same `now() - interval '24 hours'` predicate, but in the application layer instead of a partial index. | Matches the original spec's intent; restaurant-relevant horizon; no design pressure to change. |

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `openspec/changes/submit-token-idempotency-fix/sql/001_drop_broken_index.sql` | New | `DROP INDEX IF EXISTS public.orders_submit_token_24h_uidx;` — idempotent. |
| `openspec/changes/submit-token-idempotency-fix/specs/customer-checkout/spec.md` | New | Delta spec: MODIFY "Submission" requirement; ADD "Duplicate handling" + "Token persistence". |
| `burger-site-draft/checkout.html` | Modified | Add sessionStorage token persistence; include `submit_token` in insert payload; add SELECT-before-INSERT dedup; on duplicate redirect silently. |

## Spec-Wording Delta for `customer-checkout`

The existing line (`openspec/specs/customer-checkout/spec.md` line 36) reads:

> *"The browser MUST generate a per-session idempotency token (UUID, kept only in memory) on form mount. The same token MUST be sent on every retry within the session. The `orders` row MUST persist the token in a `submit_token` column (server-side check: at most one row per token per 24h window, via a unique constraint)."*

The delta replaces "kept only in memory" with "persisted in `sessionStorage` under key `bp-submit-token`", replaces "via a unique constraint" with "via an application-level SELECT-before-INSERT in `checkout.html`", and adds an explicit "Duplicate handling" requirement that mandates the silent redirect.

## User-Facing Behavior

| Trigger | Behavior |
|---|---|
| First successful submit | Same as today: cart cleared, draft cleared, redirect to `menu.html#order=<id>`, banner shows. |
| Page reload after network failure | Same `bp-submit-token` retained (verifiable in DevTools → Session Storage). User retries with same token. |
| Same form resubmitted within 24h | App SELECT finds the existing order → silent redirect to its confirmation banner. No error message, no new order row. |
| Tab closed and reopened | Fresh `bp-submit-token`; previous order still in DB but no dedup relationship. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **SELECT-vs-INSERT race** — two parallel inserts with the same token both pass the SELECT and both commit. | Low (single user, single tab; sessionStorage isolates tokens). | The existing `submitting` boolean still gates double-clicks in the same page-load. Race window is bounded by network latency; in the worst case, the second insert sees its own duplicate on next reload and silently redirects. |
| **Old broken index exists in prod** — operator hand-applied an edited version, or a future migration carried it. | Very low (PG would have rejected original). | `DROP INDEX IF EXISTS` makes the new migration safe to re-run. |
| **RLS rejects `submit_token`** — existing INSERT policy may not whitelist this column. | Low. | Verify `003_rls.sql` whitelists `submit_token` in the design phase; if not, extend the same migration (still safe — `DROP POLICY IF EXISTS … CREATE POLICY` pattern). |
| **Token lost on tab close** — user expects retry to dedup. | By design (per round-1). | Documented in spec delta "Token persistence" requirement. |
| **`admin-panel` archived files touched by mistake.** | Low. | Hard invariant + the archived folder is dated and clearly labelled. |

## Rollback Plan

1. Revert the `checkout.html` edit → token behavior returns to in-memory; `submit_token` column is unused again (same state as today).
2. Keep the `DROP INDEX` migration committed (no-op forward; removing it would not restore broken behavior).
3. Sync the spec delta out of `customer-checkout/spec.md` on next archive — or simply do not archive this change if the team prefers to leave the spec at its current (broken-promise) wording.

## Dependencies

- `orders.submit_token` column (already exists from `001_orders.sql`).
- RLS INSERT policy (verify whitelists `submit_token`).
- `bp-cart-v1` localStorage (unchanged).
- `menu.html` confirmation banner (unchanged; receives the silent redirect).

## Success Criteria

- [ ] `orders_submit_token_24h_uidx` no longer exists in the database (verifiable via `\d orders`).
- [ ] Re-running `001_drop_broken_index.sql` produces no error.
- [ ] Submitting checkout, then reloading and resubmitting with the same token within 24h produces ONE order row; user lands on its confirmation banner; no error toast.
- [ ] `bp-submit-token` appears in `sessionStorage` after first checkout.html mount and persists across reloads but not across tab close.
- [ ] `admin.html` and `index.html` byte-for-byte unchanged.
- [ ] `openspec/changes/admin-panel/**` and `openspec/changes/archive/2026-07-05-admin-panel/**` byte-for-byte unchanged.

## Binding Invariants

1. `openspec/changes/admin-panel/**` and the dated archive folder are immutable audit trail — MUST NOT be modified.
2. `openspec/specs/admin-orders/**`, `openspec/specs/customer-cart-bridge/**`, `openspec/specs/cart/**` MUST NOT be modified. Only `customer-checkout/spec.md` receives a delta in this change's `specs/` folder.
3. `burger-site-draft/admin.html` MUST NOT be modified.
4. `burger-site-draft/index.html` MUST NOT be modified.
5. `burger-site-draft/menu.html` MUST NOT be modified.
6. The new SQL migration MUST be a NEW file under `openspec/changes/submit-token-idempotency-fix/sql/`, not an edit to `001_orders.sql`.
7. No new build tooling, no new dependencies, no `package.json`. Stay vanilla inline HTML/CSS/JS.
8. No new tests added (`openspec/config.yaml` `apply.tdd: false`).
9. Publishable key only in browser-loaded files. No new credentials introduced anywhere.
10. The existing `submitting` boolean double-submit guard MUST be preserved unchanged.