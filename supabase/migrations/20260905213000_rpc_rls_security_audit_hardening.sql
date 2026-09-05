-- RPC/RLS security audit hardening.
-- Authorization-only migration: no application data is changed.
-- Keep established application flows while closing two execute-boundary regressions
-- and replacing stale JWT leadership checks in the remaining mobile/push RLS slice.

begin;

-- 20260902065000 recreated this helper and unintentionally re-granted authenticated
-- execution after 20260901054500 had established it as an internal dispatch helper.
-- Existing application call-site audit shows it is consumed by database-side guards,
-- not by authenticated browser/mobile RPC calls.
revoke all on function public.order_payment_ready_for_dispatch(uuid)
  from public, anon, authenticated;
grant execute on function public.order_payment_ready_for_dispatch(uuid)
  to service_role;

-- Trigger-only helper. A null ACL left PostgreSQL's default PUBLIC EXECUTE in place.
-- Trigger execution does not require direct client EXECUTE privilege.
revoke all on function private.reject_driver_trip_payment_result_mutation()
  from public, anon, authenticated, service_role;

-- RLS init-plan hardening. These rewrites preserve policy semantics and allow auth
-- helpers to be evaluated once per statement instead of once per row.
alter policy "orders: customer creates"
  on public.orders
  with check (customer_id = (select auth.uid()));

alter policy "tracking: driver inserts own"
  on public.tracking_pings
  with check (driver_id = (select auth.uid()));

alter policy "profiles: self or admin read"
  on public.profiles
  using (
    id = (select auth.uid())
    or (select public.is_admin())
  );

alter policy "docs: driver own or admin"
  on public.driver_documents
  using (
    driver_id = (select auth.uid())
    or (select public.is_admin())
  )
  with check (
    driver_id = (select auth.uid())
    or (select public.is_admin())
  );

alter policy "tracking: participants or admin read"
  on public.tracking_pings
  using (
    exists (
      select 1
      from public.orders order_row
      where order_row.id = tracking_pings.order_id
        and (
          order_row.customer_id = (select auth.uid())
          or order_row.driver_id = (select auth.uid())
        )
    )
    or (select public.is_admin())
  );

alter policy "driver verification history own read"
  on public.driver_verification_history
  using (driver_id = (select auth.uid()));

-- Remaining leadership reads must use current database profile state so a stale JWT
-- cannot retain access after a leadership demotion or suspension.
alter policy mobile_devices_select_own_or_admin
  on public.mobile_devices
  using (
    user_id = (select auth.uid())
    or (select private.is_admin_or_ceo())
  );

alter policy "notifications: user reads own"
  on public.notifications
  using (user_id = (select auth.uid()));

alter policy "push outbox: admin reads"
  on public.push_notification_outbox
  using ((select private.is_admin_or_ceo()));

alter policy "push deliveries: admin reads"
  on public.push_notification_deliveries
  using ((select private.is_admin_or_ceo()));

notify pgrst, 'reload schema';

commit;
