# SQL Migrations — Admin Panel Slice 1

Run these three files in order via the Supabase SQL Editor (SQL Editor → New Query → paste → Run).
All migrations are **idempotent** — safe to re-run.

## Step-by-step paste instructions

### Step 1 — Open Supabase Studio SQL Editor

1. Open your Supabase project dashboard: `https://ouhwfkxqpxikqhwcqioc.supabase.co`
2. Go to **SQL Editor** in the left sidebar
3. Click **New Query** (top-right button)

---

### Step 2 — Run 001_orders.sql

Paste the contents of `001_orders.sql` into the editor and click **Run**.

This creates:
- `public.orders` table with all columns, CHECK constraints, and indexes
- Enables RLS on `orders`

---

### Step 3 — Run 002_order_items.sql

Click **New Query** again, paste `002_order_items.sql`, click **Run**.

This creates:
- `public.order_items` table with FK to `orders(id)`
- Index on `order_id`
- Enables RLS on `order_items`

---

### Step 4 — Run 003_rls.sql

Click **New Query** again, paste `003_rls.sql`, click **Run**.

This creates:
- RLS policies on `orders` (anon INSERT, admin SELECT, admin UPDATE)
- RLS policies on `order_items` (anon INSERT, admin SELECT)
- `set_archived_at_on_complete()` trigger function
- `trg_orders_set_archived_at` trigger on `orders(status)`

---

### Step 5 — Elevate a chef user to admin (one-time setup)

In the SQL Editor (new query), replace `<chef-email>` with the chef's email address and run:

```sql
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb
WHERE email = '<chef-email>';
```

Example:
```sql
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb
WHERE email = 'chef@jochos.com';
```

> **Note:** You can also do this via Supabase Studio → Authentication → Users → select user → "Raw App Meta Data" field.

---

### Step 6 — Confirm the schema is correct

Run this to verify (should return empty, not an error):

```sql
SELECT * FROM public.orders LIMIT 1;
```

Run this to confirm `order_items` exists:

```sql
SELECT * FROM public.order_items LIMIT 1;
```

Run this to confirm RLS is enabled:

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('orders', 'order_items');
```
Both rows should show `rowsecurity = true`.

Run this to confirm the trigger exists:

```sql
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'orders';
```

---

### Step 7 — Set up local environment

1. Copy `.env.example` to `.env` at the project root:
   ```bash
   cp .env.example .env
   ```

2. Fill in your real Supabase values in `.env`:
   - `SUPABASE_URL` — from Dashboard → Settings → API → "Project URL"
   - `SUPABASE_PUBLISHABLE_KEY` — from Dashboard → Settings → API → "Publishable key"
   - `SUPABASE_JWKS_URL` — from Dashboard → Settings → API → "JWT Settings" → "JWKS URL"

3. Edit `burger-site-draft/supabase-config.js` and replace the placeholder values:
   ```js
   window.__bpSupabase = {
     url: 'https://your-project-ref.supabase.co',
     publishableKey: 'sb_publishable_your_real_key_here',
     jwksUrl: 'https://your-project-ref.supabase.co/auth/v1/.well-known/jwks.json'
   };
   ```

---

## Rollback

If you need to undo these migrations (full cleanup):

```sql
-- Drop in reverse dependency order
DROP TRIGGER IF EXISTS trg_orders_set_archived_at ON public.orders;
DROP FUNCTION IF EXISTS public.set_archived_at_on_complete();
DROP TABLE IF EXISTS public.order_items;
DROP TABLE IF EXISTS public.orders;
```

> Note: The `DROP TABLE` commands will fail if other objects depend on these tables. Use `CASCADE` only if you are sure there are no other dependent objects.

---

<!--
========================================================
Slice 1 verification (manual browser checks)
========================================================

1. Open Supabase Studio SQL Editor, run 001_orders.sql → confirm `public.orders`
   table exists with all columns and indexes.

2. Run 002_order_items.sql → confirm `public.order_items` table exists with FK
   referencing `orders(id)`.

3. Run 003_rls.sql → confirm RLS is enabled on both tables and the
   `trg_orders_set_archived_at` trigger exists on `orders`.

4. Open `https://ouhwfkxqpxikqhwcqioc.supabase.co` → Authentication → Users →
   confirm at least one user exists (chef account for later elevation to admin).

5. Open `burger-site-draft/admin.html` in a browser → console shows no 404
   errors, `window.supabase` is defined in the DevTools console.

6. Run `grep -r "sb_secret_" burger-site-draft/` → zero matches.
   (No secret key strings should appear in any browser-loaded file.)
========================================================
-->
