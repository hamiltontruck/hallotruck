-- Complete the ratings security model. RLS was enabled on ratings from the initial
-- schema, but no policies were ever created.

-- Participants can read only ratings tied to them. Admin/CEO can read all ratings
-- for support, audit and reporting.
create policy "ratings: participants and leadership read"
  on public.ratings
  for select
  to authenticated
  using (
    customer_id = auth.uid()
    or driver_id = auth.uid()
    or coalesce(auth.jwt()->'app_metadata'->>'role', '') in ('admin', 'ceo')
  );

-- A customer may rate only their own delivered order, only for the driver that
-- actually completed that order. The table's unique(order_id) constraint keeps
-- one rating per order.
create policy "ratings: customer rates delivered own order"
  on public.ratings
  for insert
  to authenticated
  with check (
    customer_id = auth.uid()
    and exists (
      select 1
      from public.orders o
      where o.id = order_id
        and o.customer_id = auth.uid()
        and o.driver_id = driver_id
        and o.status = 'delivered'::public.order_status
    )
  );

-- Ratings are immutable through the client API after submission. Corrections, if
-- ever required, should use an explicit audited Admin workflow rather than broad
-- UPDATE/DELETE policies.
