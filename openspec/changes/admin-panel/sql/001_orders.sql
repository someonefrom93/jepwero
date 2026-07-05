-- 001_orders.sql — Migration 1: orders table + indexes + extension enablement
-- Idempotent: safe to re-run.
-- Run this FIRST before 002_order_items.sql and 003_rls.sql.

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- orders table
CREATE TABLE IF NOT EXISTS public.orders (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  customer_name   text        NOT NULL CHECK (length(btrim(customer_name)) BETWEEN 1 AND 100),
  customer_email  text        NOT NULL CHECK (customer_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  customer_phone  text        NOT NULL CHECK (customer_phone ~ '^[+0-9 \-()]{6,}$'),
  fulfillment     text        NOT NULL CHECK (fulfillment IN ('pickup','deliver')),
  pickup_time     timestamptz NULL,
  notes           text        NULL,
  status          text        NOT NULL DEFAULT 'received'
                                CHECK (status IN ('received','preparing','ready','completed','cancelled')),
  archived_at     timestamptz NULL,
  subtotal_cents  bigint      NOT NULL CHECK (subtotal_cents >= 0),
  total_cents     bigint      NOT NULL CHECK (total_cents >= 0),
  submit_token    uuid        NULL,
  CONSTRAINT pickup_time_required_when_pickup
    CHECK (fulfillment <> 'pickup' OR pickup_time IS NOT NULL)
);

-- Index for chronological order listing
CREATE INDEX IF NOT EXISTS orders_created_at_idx
  ON public.orders (created_at DESC);

-- Index for status + archived_at filtering (Active vs Archived views)
CREATE INDEX IF NOT EXISTS orders_status_archived_idx
  ON public.orders (status, archived_at);

-- Case-insensitive email lookup for kitchen queries
CREATE INDEX IF NOT EXISTS orders_customer_email_idx
  ON public.orders (lower(customer_email));

-- Idempotency: at most one order per submit_token within a 24h window
CREATE UNIQUE INDEX IF NOT EXISTS orders_submit_token_24h_uidx
  ON public.orders (submit_token)
  WHERE submit_token IS NOT NULL
    AND created_at > now() - interval '24 hours';

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
