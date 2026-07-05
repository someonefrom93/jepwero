-- 002_order_items.sql — Migration 2: order_items table + FK + index
-- Idempotent: safe to re-run.
-- Run this AFTER 001_orders.sql and BEFORE 003_rls.sql.

CREATE TABLE IF NOT EXISTS public.order_items (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid    NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  catalog_id        text    NOT NULL,
  name_snapshot     text    NOT NULL,
  qty               integer NOT NULL CHECK (qty > 0),
  unit_price_cents  bigint  NOT NULL CHECK (unit_price_cents >= 0),
  line_total_cents  bigint  NOT NULL CHECK (line_total_cents >= 0)
);

CREATE INDEX IF NOT EXISTS order_items_order_id_idx
  ON public.order_items (order_id);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
