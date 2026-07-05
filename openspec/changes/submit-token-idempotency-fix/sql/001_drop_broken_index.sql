-- 001_drop_broken_index.sql — Migration: drop the structurally invalid
-- partial unique index from admin-panel/001_orders.sql and replace with
-- an IMMUTABLE-safe index that supports the application-layer dedup SELECT.
-- Idempotent: safe to re-run.
--
-- REQUIRES: admin-panel/sql/001_orders.sql + 002_order_items.sql + 003_rls.sql
--   (provides public.orders table, submit_token column, RLS enabled)
-- Run AFTER the admin-panel migrations.

-- 1. Drop the broken index. PG would have rejected it at creation time
--    (now() is STABLE, partial index predicates must be IMMUTABLE).
DROP INDEX IF EXISTS public.orders_submit_token_24h_uidx;

-- 2. Add a non-unique partial btree on submit_token only. No time predicate.
--    The application-layer RPC still filters created_at >= now() - 24h server-side;
--    the index makes the equality lookup O(log n), the time filter applies
--    to a 0-1 row result.
CREATE INDEX IF NOT EXISTS orders_submit_token_idx
  ON public.orders (submit_token)
  WHERE submit_token IS NOT NULL;