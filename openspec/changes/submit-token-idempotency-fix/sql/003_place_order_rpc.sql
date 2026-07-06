-- 003_place_order_rpc.sql
-- Fix: `.insert(...).select().single()` from anon hits RLS on the follow-up SELECT
-- (admin_select_orders is authenticated-only), so PostgREST reports the whole
-- op as 42501 "new row violates RLS" even though the INSERT itself passes.
--
-- Replacing the two-call JS flow with a single SECURITY DEFINER RPC that does
-- both inserts atomically. Bypasses RLS entirely (the function owner is the
-- invoker's session role, not anon). Returns the new order_id.
--
-- See: openspec/changes/submit-token-idempotency-fix/design.md (this commit)

CREATE OR REPLACE FUNCTION public.place_order(p_order jsonb, p_items jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
  item   jsonb;
BEGIN
  -- 1. Insert parent order.
  INSERT INTO public.orders (
    customer_name, customer_email, customer_phone,
    fulfillment, pickup_time, notes,
    subtotal_cents, total_cents, submit_token
  )
  VALUES (
    (p_order->>'customer_name')::text,
    (p_order->>'customer_email')::text,
    (p_order->>'customer_phone')::text,
    (p_order->>'fulfillment')::text,
    NULLIF(p_order->>'pickup_time', '')::timestamptz,
    NULLIF(p_order->>'notes', ''),
    (p_order->>'subtotal_cents')::bigint,
    (p_order->>'total_cents')::bigint,
    NULLIF(p_order->>'submit_token', '')::uuid
  )
  RETURNING id INTO new_id;

  -- 2. Insert line items. jsonb_array_elements handles empty arrays fine.
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.order_items (
      order_id, catalog_id, name_snapshot, qty,
      unit_price_cents, line_total_cents
    )
    VALUES (
      new_id,
      (item->>'catalog_id')::text,
      (item->>'name_snapshot')::text,
      (item->>'qty')::integer,
      (item->>'unit_price_cents')::bigint,
      (item->>'line_total_cents')::bigint
    );
  END LOOP;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.place_order(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb, jsonb) TO anon, authenticated;

COMMENT ON FUNCTION public.place_order(jsonb, jsonb) IS
  'Atomic insert of an order + its line items. Bypasses RLS (SECURITY DEFINER). '
  'Returns the new order id. Used by checkout.html to avoid the anon RLS round-trip '
  'on .insert(...).select().single().';