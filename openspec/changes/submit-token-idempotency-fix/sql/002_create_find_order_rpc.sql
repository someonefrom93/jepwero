-- 002_create_find_order_rpc.sql — SECURITY DEFINER RPC used by
-- burger-site-draft/checkout.html to perform the idempotency dedup check.
-- Bypasses RLS so anon can call it; returns at most one row's (id, created_at)
-- filtered to a 24h window and excluding cancelled/archived orders.
-- Idempotent: CREATE OR REPLACE.
--
-- REQUIRES: admin-panel/sql/001_orders.sql + 002_order_items.sql + 003_rls.sql
--   (provides public.orders table, submit_token column, RLS enabled)
-- Run AFTER 001_drop_broken_index.sql in this change.

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