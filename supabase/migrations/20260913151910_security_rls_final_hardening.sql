begin;

-- Orders: preserve existing leadership/customer/driver/partner visibility while
-- collapsing overlapping permissive policies and caching auth lookups.
drop policy if exists "orders admin manage" on public.orders;
drop policy if exists "orders: customer creates" on public.orders;
drop policy if exists "orders: read relevant or available" on public.orders;
drop policy if exists orders_partner_job_read on public.orders;

create policy "orders select authorized"
on public.orders for select
to authenticated
using (
  (select private.is_admin_or_ceo())
  or customer_id = (select auth.uid())
  or driver_id = (select auth.uid())
  or (
    status = 'placed'::public.order_status
    and driver_id is null
    and public.driver_can_view_available_order(id, vehicle_type, cargo_weight_tons)
  )
  or exists (
    select 1
    from public.partner_job_requests request
    where request.order_id = orders.id
      and private.is_partner_member(request.partner_id)
  )
);

create policy "orders insert authorized"
on public.orders for insert
to authenticated
with check (
  (select private.is_admin_or_ceo())
  or customer_id = (select auth.uid())
);

create policy "orders leadership update"
on public.orders for update
to authenticated
using ((select private.is_admin_or_ceo()))
with check ((select private.is_admin_or_ceo()));

create policy "orders leadership delete"
on public.orders for delete
to authenticated
using ((select private.is_admin_or_ceo()));

-- Profiles: remove legacy duplicate policy and collapse leadership/self overlap.
drop policy if exists "profiles admin manage" on public.profiles;
drop policy if exists "profiles self or admin read" on public.profiles;
drop policy if exists "profiles: self or admin read" on public.profiles;
drop policy if exists "profiles self update" on public.profiles;
drop policy if exists "profiles: leadership driver status update" on public.profiles;

create policy "profiles select authorized"
on public.profiles for select
to authenticated
using (
  id = (select auth.uid())
  or (select private.is_admin_or_ceo())
);

create policy "profiles update authorized"
on public.profiles for update
to authenticated
using (
  id = (select auth.uid())
  or (select private.is_admin_or_ceo())
)
with check (
  id = (select auth.uid())
  or (select private.is_admin_or_ceo())
);

create policy "profiles leadership insert"
on public.profiles for insert
to authenticated
with check ((select private.is_admin_or_ceo()));

create policy "profiles leadership delete"
on public.profiles for delete
to authenticated
using ((select private.is_admin_or_ceo()));

-- Driver documents: cache auth checks and use the canonical DB-backed leadership guard.
drop policy if exists "docs: driver own or admin" on public.driver_documents;
create policy "docs: driver own or leadership"
on public.driver_documents for all
to authenticated
using (
  driver_id = (select auth.uid())
  or (select private.is_admin_or_ceo())
)
with check (
  driver_id = (select auth.uid())
  or (select private.is_admin_or_ceo())
);

-- Tracking: preserve participant and leadership access with initPlan-safe auth calls.
drop policy if exists "tracking: driver inserts own" on public.tracking_pings;
drop policy if exists "tracking: participants or admin read" on public.tracking_pings;

create policy "tracking: driver inserts own"
on public.tracking_pings for insert
to authenticated
with check (driver_id = (select auth.uid()));

create policy "tracking: participants or leadership read"
on public.tracking_pings for select
to authenticated
using (
  (select private.is_admin_or_ceo())
  or exists (
    select 1
    from public.orders o
    where o.id = tracking_pings.order_id
      and (
        o.customer_id = (select auth.uid())
        or o.driver_id = (select auth.uid())
      )
  )
);

-- Driver verification: combine overlapping read policies.
drop policy if exists "driver verification leadership read" on public.driver_verification_files;
drop policy if exists "driver verification own read" on public.driver_verification_files;
create policy "driver verification authorized read"
on public.driver_verification_files for select
to authenticated
using (
  (select private.is_admin_or_ceo())
  or (
    driver_id = (select auth.uid())
    and (
      truck_id is null
      or truck_id = coalesce(
        (
          select t.id
          from public.trucks t
          where t.driver_id = (select auth.uid())
          order by t.updated_at desc, t.created_at desc
          limit 1
        ),
        (
          select o.truck_id
          from public.orders o
          where o.driver_id = (select auth.uid())
            and o.truck_id is not null
          order by o.accepted_at desc nulls last, o.created_at desc
          limit 1
        )
      )
    )
  )
);

drop policy if exists "driver verification history leadership read" on public.driver_verification_history;
drop policy if exists "driver verification history own read" on public.driver_verification_history;
create policy "driver verification history authorized read"
on public.driver_verification_history for select
to authenticated
using (
  (select private.is_admin_or_ceo())
  or driver_id = (select auth.uid())
);

-- Notifications: collapse leadership + owner read policies.
drop policy if exists "notifications: admin reads all" on public.notifications;
drop policy if exists "notifications: user reads own" on public.notifications;
create policy "notifications: authorized read"
on public.notifications for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_admin_or_ceo())
);

-- Mobile/push leadership checks must use the current DB role, not stale JWT role claims.
drop policy if exists mobile_devices_select_own_or_admin on public.mobile_devices;
create policy mobile_devices_select_own_or_leadership
on public.mobile_devices for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_admin_or_ceo())
);

drop policy if exists "push outbox: admin reads" on public.push_notification_outbox;
create policy "push outbox: leadership reads"
on public.push_notification_outbox for select
to authenticated
using ((select private.is_admin_or_ceo()));

drop policy if exists "push deliveries: admin reads" on public.push_notification_deliveries;
create policy "push deliveries: leadership reads"
on public.push_notification_deliveries for select
to authenticated
using ((select private.is_admin_or_ceo()));

-- Partner requests: combine equivalent leadership/member visibility.
drop policy if exists partner_job_requests_leadership_read on public.partner_job_requests;
drop policy if exists partner_job_requests_partner_read on public.partner_job_requests;
create policy partner_job_requests_authorized_read
on public.partner_job_requests for select
to authenticated
using (
  (select private.is_admin_or_ceo())
  or (select private.is_partner_member(partner_job_requests.partner_id))
);

-- Trucks: combine driver/leadership/partner visibility without changing row scope.
drop policy if exists trucks_driver_read on public.trucks;
drop policy if exists trucks_leadership_read on public.trucks;
drop policy if exists trucks_partner_read on public.trucks;
create policy trucks_authorized_read
on public.trucks for select
to authenticated
using (
  (select private.is_admin_or_ceo())
  or driver_id = (select auth.uid())
  or exists (
    select 1
    from public.orders active_order
    where active_order.truck_id = trucks.id
      and active_order.driver_id = (select auth.uid())
  )
  or (
    partner_id is not null
    and (select private.is_partner_member(trucks.partner_id))
  )
);

-- API roles never need schema-maintenance/table-structure privileges.
revoke truncate, references, trigger, maintain on table
  public.orders,
  public.profiles,
  public.driver_documents,
  public.driver_verification_files,
  public.driver_verification_history,
  public.tracking_pings,
  public.mobile_devices,
  public.notifications,
  public.push_notification_outbox,
  public.push_notification_deliveries,
  public.partner_job_requests,
  public.trucks
from anon, authenticated;

commit;
