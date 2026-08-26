-- Finance Dashboard V3 must authorize leadership from the database profile,
-- matching AdminGate. Existing participant policies remain unchanged.

grant select on table public.driver_payment_confirmations to authenticated;
revoke all on table public.driver_payment_confirmations from anon;

alter policy "payments admin manage"
on public.payments
using ((select private.is_admin_or_ceo()));

alter policy "orders admin manage"
on public.orders
using ((select private.is_admin_or_ceo()));

alter policy "profiles admin manage"
on public.profiles
using ((select private.is_admin_or_ceo()));

alter policy "profiles self or admin read"
on public.profiles
using (((select auth.uid()) = id) or (select private.is_admin_or_ceo()));

alter policy "driver_commission_deposits_read"
on public.driver_commission_deposits
using ((driver_id = (select auth.uid())) or (select private.is_admin_or_ceo()));

alter policy "drivers read own commission charges"
on public.driver_commission_charges
using ((driver_id = (select auth.uid())) or (select private.is_admin_or_ceo()));

alter policy "drivers read own commission payments"
on public.driver_commission_payments
using ((driver_id = (select auth.uid())) or (select private.is_admin_or_ceo()));

drop policy if exists "finance dashboard leadership read" on public.driver_payment_confirmations;
create policy "finance dashboard leadership read"
on public.driver_payment_confirmations
for select
to authenticated
using ((select private.is_admin_or_ceo()));

