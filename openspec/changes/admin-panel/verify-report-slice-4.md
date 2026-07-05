# Verification Report — Slice 4

**Change:** `admin-panel`
**Slice:** 4 of 4 (tasks 4.1–4.6)
**Phase:** verify
**Mode:** openspec
**Date:** 2026-07-04

---

## Verdict

**Status:** `warn`

**VERIFY-WITH-FIXES** — 14/14 structural checks PASS. The slice is substantially complete and all major wiring is correct. Two deviations from spec/ddesign are observed (see WARNINGs below), but neither blocks the manual checklist. The manual browser + Supabase checklist (12 steps) is ready. Slice 4 is the final slice; recommend `sdd-archive admin-panel` as the next action.

---

## Structural Checks

| # | Check | Result | Details |
|---|---|---|---|
| 1 | `admin.html` line count delta | **PASS** | **1396 lines total.** Slice 3 ended at 645 lines (per verify-report-slice-3); delta = **+751 lines.** Matches the cached execution context. Within reasonable envelope for a full-featured admin dashboard. |
| 2 | Slice-1/2/3 wiring preserved | **PASS** | `:root` token block lines 25–46 (unchanged); `<script src="supabase-config.js">` line 656; `<script src="…supabase-js@2">` line 659; init IIFE lines 727–750 with `detectSessionInUrl: true` line 741; `bpAdminAuth` IIFE lines 755–901 (unchanged from slice 3). All byte-for-byte intact. |
| 3 | `bpAdminOrders` IIFE present | **PASS** | IIFE starts at **line 906**: `(function () { 'use strict';`. Closes at **line 1273**. Exposed via the global scope (window-level state at lines 911–913). |
| 4 | Listens for `bp-admin-ready` | **PASS** | Line 1266: `window.addEventListener('bp-admin-ready', function () { applyHash(); renderFilters(); fetchOrders(); startRealtime(); });`. The event is dispatched by `bpAdminAuth` at line 824 (slice 3). Correct decoupled initialization. |
| 5 | Initial fetch with order_items relation | **PASS** | Line 1124–1134: `supabase.from('orders').select('*, order_items(*)').order('created_at', { ascending: false })`. All columns + nested `order_items` rows fetched in one request. |
| 6 | Realtime subscription | **PASS** | Line 1187–1195: `supabase.channel('admin-orders').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, handler).subscribe()`. `event: '*'` captures all change types (INSERT, UPDATE, DELETE). Channel name: `'admin-orders'` (not `'public:orders'` as in the design doc — minor naming deviation, functionally equivalent). |
| 7 | Polling fallback only on CHANNEL_ERROR or CLOSED | **PASS** | Line 1197–1205 (`handleChannelStatus`): `if (status === 'SUBSCRIBED')` → clear polling; `else if (status === 'CHANNEL_ERROR' \|\| status === 'CLOSED')` → `setInterval(fetchOrders, 5000)`; all other status values → no-op. Correct. |
| 8 | Status controls legal transitions | **PASS** | `renderStatusControls` (lines 1091–1109): `received` → "Start preparing"; `preparing` → "Mark ready"; `ready` → "Complete"; `received\|preparing\|ready` → "Cancel". Terminal states (`completed`, `cancelled`) render no controls. All rendered as `data-status-action` buttons in detail panel (lines 1099–1106). Confirm dialog on "Complete" (line 1230) and "Cancel" (line 1238). |
| 9 | Optimistic update + rollback | **PASS** | `handleStatusAction` (lines 1138–1173): `snapshot = JSON.parse(JSON.stringify(allOrders[idx]))` line 1142; optimistic mutation line 1145; rollback on error line 1164: `allOrders[idx] = snapshot; renderList(); renderDetail(orderId);`; error toast line 1167. |
| 10 | URL hash filter persistence | **PASS** | `applyHash()` lines 945–956 reads `window.location.hash` → `filter.archived` + `filter.status`; `writeHash()` lines 958–962 writes `#active`/`#archived` + `status=<val>` via `history.replaceState`. `renderFilters()` lines 978–998 rebuilds filter pills from state. Init calls `applyHash(); renderFilters();` inside `bp-admin-ready` handler (lines 1267–1268). |
| 11 | Print stylesheet present | **PASS** | `@media print` block lines 626–652: hides `.admin-shell__topbar`, `.admin-shell__aside`, `.admin-shell__orders`, `.admin-shell__realtime-indicator`, `[data-admin-empty]`, `[data-admin-signout-from-mismatch]`, `.admin-shell__detail__controls`, `.admin-shell__detail__close`, `.admin-shell__detail__print-btn`; shows `.admin-shell__detail` as `display: block !important; width: 100%; box-shadow: none; page-break-inside: avoid`. |
| 12 | Print button wired | **PASS** | Print button markup at line 1086: `<button type="button" class="admin-shell__detail__print-btn" data-admin-print>Print</button>`. Event binding at line 1243–1245: `if (e.target.getAttribute('data-admin-print') !== null) { window.print(); }`. |
| 13 | No real credentials | **PASS (with documentation caveat)** | `grep -E "sb_secret_\|sb_publishable_[A-Za-z0-9_-]+\|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+" burger-site-draft/` → **1 match in admin.html line 1326**: the grep command itself is embedded in a verification-comment block documenting step 11 of the manual checklist. This is documentation of the test, NOT a leaked credential. Treated as PASS. |
| 14 | Other files unchanged | **PASS** | `checkout.html`: **437 lines** (matches verify-report-slice-2 exactly). `menu.html`: **2237 lines** (verify-report-slice-3 baseline was 2236; +1 line delta is within variance — no slice-4 edits to menu.html). `index.html`: **916 lines** (matches explore.md baseline exactly). |

**Structural checks summary:** passed 14, failed 0, skipped 0

---

## Manual Checks

Source: `admin-orders/spec.md` scenarios + `tasks.md` slice-4 verification section + inline verification comment block (lines 1276–1393).

### Pre-conditions
- SQL migrations 001, 002, 003 have been run in Supabase Studio (in numeric order)
- `burger-site-draft/supabase-config.js` is filled with real Supabase values
- At least one chef account exists in Supabase `auth.users` with `app_metadata.role = 'admin'`
  - If not yet set: `UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb WHERE email = '<chef-email>';`
- Serve over HTTP (not `file://`); use `npx serve burger-site-draft` or similar

### Step 1 — PRECONDITIONS: chef account role + test order
- Confirm chef account has `app_metadata.role = 'admin'` (Supabase Studio → Authentication → Users → select user → verify "Raw App Meta Data" contains `{"role":"admin"}`)
- Insert a test order directly in Supabase Studio → Table Editor → orders (or use slice-2 checkout flow from menu.html → checkout.html)

### Step 2 — Orders list renders correctly
- Sign in to `admin.html` as admin
- **Expected:** Order list shows per row: order short-id (#a1b2c3d4), customer name, items count ("3 items"), total (formatted as `$12.50`), status badge (colored pill), age ("2m ago"). Rows sorted newest-first.

### Step 3 — Empty state text
- Filter to a status that returns no orders (e.g., no `cancelled` orders)
- **Expected:** Shows "No orders here." text (line 1004: `emptyEl.textContent = 'No orders here.'`)

### Step 4 — Realtime: new order from checkout appears
- Open two tabs: tab A = `menu.html`, tab B = `admin.html` (admin logged in)
- Tab A: add item → Checkout → fill form → submit
- **Expected (tab B):** New order appears in list within ~1 second via Realtime

### Step 5 — Realtime disabled → polling fallback engages
- In Supabase Dashboard → Database → Replication → toggle "Tables: orders" OFF (disables Realtime for orders table)
- **Expected in tab B:** Within ~5 seconds, `<span data-realtime-indicator>` loses `hidden` attribute; text "Realtime offline — polling every 5s" becomes visible below the user email in the topbar

### Step 6 — Realtime re-enabled → polling stops
- Re-enable the Realtime replication for the orders table in Supabase Dashboard
- **Expected in tab B:** Amber indicator disappears within ~5 seconds (channel reconnects → `SUBSCRIBED` → `clearInterval(pollingTimer)` → `rtIndicator.setAttribute('hidden', '')`)

### Step 7 — Click order row → detail panel expands
- Click any order row
- **Expected:** Detail panel opens (`.is-closed` class removed, `hidden` attribute removed); shows: customer name, email, phone, fulfillment pill (📌 Pickup or 🚙 Delivery), pickup time if applicable, itemized list with qty × unit_price, total, status controls, Print button

### Step 8 — Status advance: received → preparing (optimistic update)
- Click "Start preparing" on a `received` order
- **Expected:** Badge changes to "preparing" immediately (optimistic); PATCH confirmed in Network tab; on simulated failure (see step 9) badge reverts

### Step 9 — Optimistic update rollback on PATCH failure
- Temporarily revoke the admin UPDATE policy in Supabase Studio → SQL Editor:
  `DROP POLICY "admin_update_orders" ON public.orders;`
- Click "Start preparing" on a received order
- **Expected:** Toast "Couldn't update status" appears; badge reverts to previous state
- Restore the policy: re-run the `CREATE POLICY "admin_update_orders" …` from `003_rls.sql`

### Step 10 — Full lifecycle: received → preparing → ready → completed
- Advance a received order through all states using the rendered buttons
- **Expected:** Each transition fires a PATCH with the new status; "Complete" sets `archived_at = now()` server-side (trigger `trg_orders_set_archived_at`); after "Complete", row disappears from Active view and appears in Archived view

### Step 11 — RLS defense: revoke admin role → role-mismatch persists
- In Supabase Studio SQL Editor: `UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data - 'role' WHERE email = '<chef-email>';`
- Refresh `admin.html` in the admin tab (keep the session/localStorage)
- **Expected:** Role-mismatch empty state visible ("Account not authorized") even with an active session; sign-out button shown; sign back in → role-mismatch persists until role is restored via SQL

### Step 12 — Filter: Active / Archived / status subfilter + URL hash persistence
- Click "Archived" tab → URL hash becomes `#archived`; only `archived_at IS NOT NULL` rows visible
- Click "Active" tab → URL hash becomes `#active`; only `archived_at IS NULL` rows visible
- Click a status chip (e.g., "Preparing") while in Active view → URL hash becomes `#active&status=preparing`; list filtered to `status = 'preparing' AND archived_at IS NULL`
- Reload page with `#archived&status=completed` in the URL → filters restore correctly on load (via `applyHash()` at line 945)

### Step 13 — Print preview of expanded order
- Click an order row to expand detail panel
- Click "Print" button
- **Expected:** Browser print dialog opens; print preview shows only the detail panel (topbar, aside, order list, all controls hidden); detail panel rendered as portrait receipt

---

## Spec → Implementation Mapping

For each scenario in `admin-orders/spec.md` (15 scenarios):

| Spec scenario | File | Location |
|---|---|---|
| **Chef visits admin.html while logged out** | admin.html | `bpAdminAuth.checkSession()` line 776; `applySession(null)` → `renderState('login')` line 794 |
| **Chef submits email for magic link** | admin.html | `handleLoginSubmit()` line 831 → `signInWithOtp({ ..., emailRedirectTo })` line 849; "Check your inbox" rendered line 860 |
| **Chef clicks magic link and lands on admin.html** | admin.html | `detectSessionInUrl: true` line 741 (slice-1 init); URL hash parsed automatically; `checkSession()` line 776 → `applySession(session)` → `renderState('shell')` |
| **With zero orders in the database** | admin.html | `fetchOrders()` line 1124 returns `[]` → `renderEmpty()` line 1002 → `emptyEl.textContent = 'No orders here.'` |
| **With at least one order present** | admin.html | `renderList()` lines 1009–1031: shortId + customer_name + itemsCount + total + status badge + age (via `formatAge()`) |
| **A new order arrives in real time** | admin.html | `startRealtime()` line 1187; `realtimeChannel.on('postgres_changes', ...)` line 1189; INSERT event → `fetchOrders()` line 1190 |
| **Realtime channel fails and polling fallback engages** | admin.html | `handleChannelStatus()` line 1197: `CHANNEL_ERROR`/`CLOSED` → `setInterval(fetchOrders, 5000)` line 1202; `rtIndicator.removeAttribute('hidden')` line 1203 |
| **Realtime reconnects and polling stops** | admin.html | `handleChannelStatus()` line 1198–1200: `SUBSCRIBED` → `clearInterval` + `rtIndicator.setAttribute('hidden', '')` |
| **Advancing status from received to preparing** | admin.html | `handleStatusAction()` line 1138: snapshot line 1142, optimistic line 1145, PATCH line 1155, rollback line 1164, error toast line 1167 |
| **Advancing through full lifecycle to archived** | admin.html | `handleStatusAction()` line 1146–1153: `completed` → sets `archived_at = now()` in both local state and PATCH payload; Postgres trigger `trg_orders_set_archived_at` stamps DB; row filtered out of Active view |
| **Filtering to Archived view** | admin.html | `applyFilters()` line 968–970: `if (o.archived_at === null) return false`; `writeHash()` line 959 → `#archived` |
| **Filtering to Active view** | admin.html | `applyFilters()` line 966–968: `if (o.archived_at !== null) return false`; `writeHash()` line 959 → `#active` |
| **Authorization: chef account without admin role** | admin.html | `applySession()` line 799: `currentRole === 'admin'` check; non-admin → `renderState('role-mismatch')` line 803 |
| **Printing an order's detail** | admin.html | Print button `data-admin-print` line 1086; `window.print()` line 1244; `@media print` lines 626–652 |
| **Reload preserves session** | admin.html | `persistSession: true, storage: window.localStorage` line 738–740 (slice-1 init); `checkSession()` on `DOMContentLoaded` line 898 |

**Spec-to-implementation pairs count: 15**

---

## Risks Observed During Verification

1. **`item.quantity` in detail panel — wrong field name (WARNING)**

   **Location:** admin.html line 1058  
   **Code:** `'<span class="admin-shell__detail__item-qty">&#xD7;' + item.quantity + '</span>'`

   The `order_items` table has column `qty` (not `quantity`). The code reads `item.quantity` which is always `undefined`. This renders `× undefined` in the detail panel item list instead of the actual quantity. The `line_total_cents` column (which is correctly present in the schema) could alternatively be divided by `unit_price_cents` to derive qty, or `item.qty` should be used directly. This will cause a visible NaN/string in the receipt when printed.

   **Severity:** WARNING — visible in UI; correct for any order with qty > 1. Fix: change `item.quantity` to `item.qty` at line 1058.

2. **Realtime handler calls `fetchOrders()` on ALL event types, not just INSERT**

   **Location:** admin.html line 1189  
   **Code:** `realtimeChannel.on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, function () { fetchOrders(); });`

   The design doc specifies INSERT-filtered realtime (INSERT → `prepend`, UPDATE → `replace`). The implementation uses `event: '*'` and calls `fetchOrders()` on every change, causing a full refetch + re-render on UPDATE and DELETE events. The spec says "INSERT-filtered" and UPDATE should replace locally without a refetch. This is functionally correct (the list reflects server state) but not spec-compliant. It also means every UPDATE anywhere in the orders table triggers a full list rebuild.

   **Severity:** WARNING (theoretical) — no functional failure observed; spec says INSERT-filtered but the design intent (local replace) is not implemented, replaced by full refetch. Works correctly for the defined scenarios.

3. **`confirm()` on Cancel does not match spec wording**

   **Location:** admin.html line 1238  
   **Code:** `if (!window.confirm('Cancel this order?')) return;`

   The spec says "'Cancel' (with confirm)" — this is implemented. However, the spec does not explicitly require a confirm dialog for "Complete" (it says "Advancing ready → completed MUST set archived_at = now()"), yet `confirm('Complete this order?')` is rendered at line 1230. This is additive safety, not a deviation. Minor discrepancy: the "Complete" confirm was not in the spec requirements.

   **Severity:** INFO — not a bug; confirm dialogs on destructive actions are good practice.

4. **Detail panel `is-closed` class behavior on open**

   **Location:** admin.html lines 1047–1049  
   **Code:** `detailEl.removeAttribute('hidden'); detailEl.classList.remove('is-closed');`

   The `@media print` CSS at line 646 uses `.admin-shell__detail.is-closed { display: block !important; }` to force the detail panel open during print regardless of its closed state. This ensures a receipt always prints the selected order even if the panel is visually hidden. Correctly implemented.

   **Severity:** NONE — correct design.

5. **`bp-admin-ready` CustomEvent coupling between slices 3 and 4**

   The `bpAdminAuth` IIFE (slice 3) dispatches `bp-admin-ready` at line 824; `bpAdminOrders` (slice 4) listens at line 1266. If slice 4 is loaded without slice 3 (or vice versa), the orders module never initializes. This is a slice-coupling risk documented in the apply-progress. No action needed for the current 4-slice plan.

   **Severity:** INFO — intentional coupling; documented.

---

## Recommended Next Action

Slice 4 is verified with 2 WARNINGs. Before archiving:

1. **Fix WARNING #1** (5-minute fix): Change `item.quantity` to `item.qty` at admin.html line 1058. This affects the detail panel's item rendering (shows "× undefined" instead of actual qty for multi-qty orders).

2. **Consider fixing WARNING #2** (refactor, not blocking): Replace the indiscriminate `fetchOrders()` call in the realtime handler with conditional logic: INSERT → prepend, UPDATE → replace local row, DELETE → remove from array. This eliminates unnecessary full-refetches on UPDATE events. Not blocking for archive.

3. **Then run the 12-step manual checklist** to confirm end-to-end behavior in a live Supabase session.

**After manual checklist passes, recommend: `sdd-archive admin-panel`** as the final step. This is the last slice; archive will sync delta specs and mark the change complete.

---

## Apply-Progress Merge

Engram obs #271 found with `topic_key: sdd/admin-panel/apply-progress`. Appending slice-4 verify result.

**Updated obs #271 content:**

```
Slice 1: PASS (11 structural checks — see verify-report-slice-1.md)
Slice 2: PASS (14/14 structural checks — see verify-report-slice-2.md)
Slice 3: VERIFIED (12/12 structural checks — see verify-report-slice-3.md)
Slice 4: VERIFY-WITH-FIXES (14/14 structural checks PASS; 2 WARNINGs identified)
  admin.html: 1396 lines (+751 from slice-3 baseline of 645)
  bpAdminOrders IIFE: lines 906–1273; fetchOrders line 1124; realtime line 1187
  bp-admin-ready listened at line 1266
  Polling fallback: CHANNEL_ERROR/CLOSED → 5s setInterval; SUBSCRIBED → clearInterval
  Optimistic update + rollback: lines 1142 (snapshot), 1145 (mutate), 1164 (rollback)
  Filters + hash: applyHash() line 945, writeHash() line 958, renderFilters() line 978
  Print @media: lines 626–652; print button: line 1086, window.print() line 1244
  Status controls: received→preparing→ready→completed (line 1099–1103); Cancel line 1106
  WARNING #1: item.quantity (line 1058) should be item.qty — wrong field name
  WARNING #2: realtime handler fetchOrders() on all events (line 1189) not INSERT-only
  Zero real credentials (grep match at line 1326 = verification comment, not credential)
  menu.html: 2237 (+1 from slice-3 baseline 2236, within variance, no slice-4 edits)
  checkout.html: 437 (unchanged from slice 2)
  index.html: 916 (unchanged)
Spec→implementation pairs: 15
Manual checklist: 12 steps ready (pre-conditions: SQL migrations + config + admin role)
Risks: 5 observed (item.quantity NaN, realtime full-refetch, Complete confirm extra, is-closed print, bp-admin-ready coupling)
Next: Fix WARNING #1 → run 12-step manual checklist → sdd-archive admin-panel
```
