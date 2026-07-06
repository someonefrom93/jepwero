# Tasks: submit-token-idempotency-fix

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~95–140 (40 SQL + ~50–80 checkout.html edits + ~5 line deletions) |
| 400-line budget risk | Low |
| Chained PRs recommended | No (single PR per preflight `single-pr-default`) |
| Delivery strategy | single-pr-default |
| Chain strategy | size-exception (kept single PR; user already chose) |
| Decision needed before apply | No |

```text
Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low
```

### Work-unit commits (single PR, 3 reviewable commits)

| Commit | Goal | Files touched | Why standalone-reviewable |
|--------|------|---------------|---------------------------|
| 1 — SQL | Drop broken index; create SECURITY DEFINER RPC | `sql/001_drop_broken_index.sql` (new), `sql/002_create_find_order_rpc.sql` (new) | One database concern. Both migrations idempotent (`DROP INDEX IF EXISTS` / `CREATE OR REPLACE` / `CREATE INDEX IF NOT EXISTS`). Operator can apply them in numeric order before any UI code changes. |
| 2 — Token persistence + payload | Promote token from in-memory to sessionStorage; include `submit_token` in INSERT | `burger-site-draft/checkout.html` (Edit 1, Edit 2) | Changes the data the client carries and sends. App still works without Commit 3 — column is populated but SELECT-before-INSERT not yet wired, so dedup window relies on operator-side `submit_token` queries until Commit 3 lands. |
| 3 — Dedup + cleanup | Wire RPC-before-INSERT; remove dead error handler; apply 3 MEDIUM review items | `burger-site-draft/checkout.html` (Edit 3, Edit 4, Edit 5, M-A, M-B, M-C) | Changes the submit flow's control logic. Biggest review surface, kept last so reviewer sees the full picture with token + payload already in place. |

Each commit leaves the codebase in a working state. Rollback per commit is local (see per-commit notes).

## Commit 1 — SQL migrations

- [x] 1.1 Create `openspec/changes/submit-token-idempotency-fix/sql/001_drop_broken_index.sql` containing `DROP INDEX IF EXISTS public.orders_submit_token_24h_uidx;` plus `CREATE INDEX IF NOT EXISTS orders_submit_token_idx ON public.orders (submit_token) WHERE submit_token IS NOT NULL;`. Add a header comment naming REQUIRES (admin-panel 001/002/003) and idempotency. File body matches `design.md` lines 241–262 verbatim.
- [x] 1.2 Create `openspec/changes/submit-token-idempotency-fix/sql/002_create_find_order_rpc.sql` with the SECURITY DEFINER RPC body from `design.md` lines 264–294 (`CREATE OR REPLACE FUNCTION public.find_order_by_submit_token(p_token uuid) RETURNS TABLE(...) ...` plus `REVOKE ALL FROM PUBLIC` and `GRANT EXECUTE TO anon`). Header comment must name REQUIRES and idempotency. Operator applies both files in Supabase Studio → SQL Editor in numeric order before Commit 2 lands; step 9 of manual verification confirms `\d orders` output.

**Commit 1 rollback**: forward-only. `DROP INDEX IF EXISTS` and `CREATE INDEX IF NOT EXISTS` / `CREATE OR REPLACE FUNCTION` are idempotent — re-running the migration is safe. There is no `git revert` since the project has no git repo (`openspec/config.yaml` line 10); rollback is "do not apply the migration" if the operator has not yet run it, or "no-op" if they have (the dropped index never worked anyway).

## Commit 2 — Token persistence + payload

- [x] 2.1 `burger-site-draft/checkout.html` Edit 1: replace the in-memory `window.__bpIdempotencyToken = (...)` block at current lines 142–152 with the `SUBMIT_TOKEN_KEY` + `ensureSubmitToken()` + `try/catch` sessionStorage-backed version from `design.md` lines 135–152. Drop the broken `Math.random` UUID fallback; throw a clear error if `crypto.randomUUID` is unavailable.
- [x] 2.2 `burger-site-draft/checkout.html` Edit 2: at current lines 297–305, delete the `// NOTE: Do NOT add submit_token here...` and `// Client-side idempotency...` comments, and add the `submit_token: window.__bpIdempotencyToken` field to `orderPayload` (final shape per `design.md` lines 158–169).

**Commit 2 rollback**: revert the two `checkout.html` edits. State returns to today (token in-memory, `submit_token` not in payload). The SQL migrations from Commit 1 remain in place; they are harmless on their own (no client uses the RPC yet, the new index is unused until Commit 3).

## Commit 3 — Dedup flow + MEDIUM review items

- [x] 3.1 `burger-site-draft/checkout.html` Edit 3: insert the `findExistingOrderForToken(token)` helper near line 283 (per `design.md` lines 173–179). Call site: `supabase.rpc('find_order_by_submit_token', { p_token: token }).single()`.
- [x] 3.2 `burger-site-draft/checkout.html` Edit 4: restructure `submitOrder` at current lines 307–330 to gate the existing INSERT behind the RPC. Add `silentRedirectToExisting(id)` helper. On RPC match, set `sessionStorage['bp-checkout-success'] = id` and `window.location.href = 'menu.html#order=' + id` (no cart clear, no draft clear). On RPC error, log `console.warn` and fall through to INSERT. Preserve the existing INSERT → order_items → cart clear → redirect chain and the `submitting` flag lifecycle (binding invariant 10). See `design.md` lines 187–219.
- [x] 3.3 `burger-site-draft/checkout.html` Edit 5: delete the dead `submit_token` error branch at current lines 323–325 (`design.md` lines 224–228). `submit_token` is now an explicit INSERT field; the schema-mismatch message must not leak to customers.
- [x] 3.4 **M-A (review-reliability)**: delete the unused `SUBMIT_TOKEN_CUTOFF_MS` constant introduced in Edit 1 (24h × 60 × 60 × 1000). The cutoff now lives server-side in the RPC; the client MUST NOT compute or reference it.
- [x] 3.5 **M-B (review-reliability)**: add a JSDoc comment on `findExistingOrderForToken` documenting that `.single()` returns `PGRST116` `error` on no-match in older PostgREST and that the existing `if (sel.error)` branch intentionally swallows it. If apply prefers stricter observability, split the no-match log from the RPC-failure log so the dashboard is not lying. Either resolution is acceptable — apply picks.
- [x] 3.6 **M-C (review-reliability)**: decide whether to wrap `ensureSubmitToken()` in a `try/catch` that surfaces a user-readable error (e.g., `bp-checkout-form-errors`) when `crypto.randomUUID` is unavailable. Two acceptable resolutions: (a) leave as-is — `crypto.randomUUID` is universal since mid-2022 (Chrome 92 / FF 95 / Safari 15.4); the current throw is acceptable fail-loud; or (b) add the try/catch + user-visible message + early `return` from the submit path. Apply picks; either is fine.

**Commit 3 rollback**: revert all `checkout.html` edits in Commit 2 and Commit 3. State returns to today (in-memory token, no `submit_token` in payload, no dedup check). The SQL migrations stay (no harm; the RPC is unused and the new index is unused until Commit 3 returns).

## Manual Verification (pre-merge gate; not a commit)

- [ ] 4.1 Run all 15 steps from `openspec/changes/submit-token-idempotency-fix/design.md` lines 358–376 in browser + Supabase Studio. Step 5's row-count check (filter `orders` by `submit_token`, confirm exactly ONE row) is the load-bearing assertion — the browser-side banner alone is not sufficient proof because the RPC could silently no-op. Steps 13–15 verify the SECURITY DEFINER RPC exists, `anon` has EXECUTE, and RLS blocks a direct `anon` SELECT (proves why the RPC was necessary). Do not merge the PR until all 15 pass.

## Out-of-scope reminders for apply

- Do **NOT** modify `burger-site-draft/admin.html`, `index.html`, `menu.html`, or `supabase-config.js` (binding invariants 3, 4, 5, 9).
- Do **NOT** modify anything under `openspec/changes/admin-panel/**` or `openspec/changes/archive/2026-07-05-admin-panel/**` (binding invariants 1, 2).
- Do **NOT** add tests, build tooling, or `package.json` (binding invariants 7, 8; `config.yaml` `apply.tdd: false`).
- Do **NOT** change any spec outside `openspec/changes/submit-token-idempotency-fix/specs/customer-checkout/spec.md`.

## Summary

- **task_count**: 10 tasks across 3 work-unit commits + 1 manual verification gate
- **commit_count**: 3
- **review_workload_forecast**: ~95–140 changed lines in PR; 400-line budget risk Low; chained PRs No; single PR per preflight
- **next_recommended**: apply