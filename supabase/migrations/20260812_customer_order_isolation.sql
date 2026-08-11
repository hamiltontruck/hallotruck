-- Close a customer data-isolation hole caused by old broad placed-order test policies.
-- Approved drivers can still see unassigned placed loads through the existing
-- `orders: read relevant or available` policy, while customers only see their own orders.

drop policy if exists "orders available to authenticated" on public.orders;
drop policy if exists "orders: authenticated available test" on public.orders;

-- Keep the intended participant/driver/admin policy as the single authenticated SELECT rule.
-- Existing policy `orders: read relevant or available` already enforces:
--   customer_id = auth.uid()
--   OR driver_id = auth.uid()
--   OR admin
--   OR placed/unassigned AND is_approved_driver()

notify pgrst, 'reload schema';
