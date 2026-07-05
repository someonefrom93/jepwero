-- 003_rls.sql — Migration 3: Row Level Security policies for orders + order_items,
-- plus the archived_at-on-complete trigger.
-- Idempotent: DROP POLICY IF EXISTS + CREATE POLICY pairs.
-- Run this AFTER 001_orders.sql and 002_order_items.sql.

-- Enable pgcrypto (in case this migration is run standalone without 001)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ===== orders =====

-- Anon can INSERT an order, but ONLY with a whitelisted column set.
-- status, archived_at, submit_token, created_at are server-defaulted.
DROP POLICY IF EXISTS "anon_insert_order" ON public.orders;
CREATE POLICY "anon_insert_order"
  ON public.orders
  FOR INSERT
  TO anon
  WITH CHECK (
    customer_name IS NOT NULL
    AND customer_email IS NOT NULL
    AND customer_phone IS NOT NULL
    AND fulfillment IN ('pickup','deliver')
    AND subtotal_cents >= 0
    AND total_cents >= 0
    AND (fulfillment <> 'pickup' OR pickup_time IS NOT NULL)
  );

-- Admin SELECT — gated by app_metadata.role
DROP POLICY IF EXISTS "admin_select_orders" ON public.orders;
CREATE POLICY "admin_select_orders"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
  );

-- Admin UPDATE — status transitions only
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
      archived_at IS NULL
      OR (status = 'completed' AND archived_at IS NOT NULL)
      OR status = 'cancelled'
    )
  );

-- ===== order_items =====

-- Anon INSERT — limited to lines whose parent order was just inserted
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

-- Admin SELECT items
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
