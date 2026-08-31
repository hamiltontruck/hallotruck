-- Root web authentication and role-isolation hardening.
--
-- Replace stale JWT app_metadata leadership checks in root-web RLS and Storage
-- policies with the current database-backed leadership helper. This ensures a
-- suspended Admin/CEO loses protected access immediately without waiting for a
-- token refresh.
--
-- This migration changes authorization policy definitions only. It does not
-- mutate application, financial, order, payment, commission, settlement, or
-- audit data.

begin;

-- Customer dispatch visibility.
drop policy if exists "customer dispatch request participants read"
  on public.customer_dispatch_requests;
create policy "customer dispatch request participants read"
  on public.customer_dispatch_requests
  for select
  to authenticated
  using (
    customer_id = (select auth.uid())
    or (select private.is_admin_or_ceo())
  );

-- Customer administration.
drop policy if exists "customers admin manage"
  on public.customers;
create policy "customers admin manage"
  on public.customers
  for all
  to authenticated
  using ((select private.is_admin_or_ceo()))
  with check ((select private.is_admin_or_ceo()));

-- Delivery-proof metadata visibility.
drop policy if exists "delivery proofs participants read"
  on public.delivery_proofs;
create policy "delivery proofs participants read"
  on public.delivery_proofs
  for select
  to authenticated
  using (
    (select private.is_admin_or_ceo())
    or exists (
      select 1
      from public.orders order_row
      where order_row.id = delivery_proofs.order_id
        and (
          order_row.driver_id = (select auth.uid())
          or order_row.customer_id = (select auth.uid())
        )
    )
  );

-- Driver commission audit visibility.
drop policy if exists "commission audit admin or own driver"
  on public.driver_commission_audit;
create policy "commission audit admin or own driver"
  on public.driver_commission_audit
  for select
  to authenticated
  using (
    driver_id = (select auth.uid())
    or (select private.is_admin_or_ceo())
  );

-- Driver-presence visibility.
drop policy if exists "driver presence participants read"
  on public.driver_presence;
create policy "driver presence participants read"
  on public.driver_presence
  for select
  to authenticated
  using (
    driver_id = (select auth.uid())
    or (select private.is_admin_or_ceo())
  );

-- Leadership notification visibility.
drop policy if exists "notifications: admin reads all"
  on public.notifications;
create policy "notifications: admin reads all"
  on public.notifications
  for select
  to authenticated
  using ((select private.is_admin_or_ceo()));

-- Order administration. Both existing-row and new-row checks use the current
-- database profile so a stale leadership JWT cannot pass WITH CHECK.
drop policy if exists "orders admin manage"
  on public.orders;
create policy "orders admin manage"
  on public.orders
  for all
  to authenticated
  using ((select private.is_admin_or_ceo()))
  with check ((select private.is_admin_or_ceo()));

-- Payment-review audit visibility.
drop policy if exists "payment review audit leadership read"
  on public.payment_review_audit;
create policy "payment review audit leadership read"
  on public.payment_review_audit
  for select
  to authenticated
  using ((select private.is_admin_or_ceo()));

-- Profile administration.
drop policy if exists "profiles admin manage"
  on public.profiles;
create policy "profiles admin manage"
  on public.profiles
  for all
  to authenticated
  using ((select private.is_admin_or_ceo()))
  with check ((select private.is_admin_or_ceo()));

-- Leadership may update only driver approval-state rows through this policy;
-- the existing trigger and column grants retain their narrower constraints.
drop policy if exists "profiles: leadership driver status update"
  on public.profiles;
create policy "profiles: leadership driver status update"
  on public.profiles
  for update
  to authenticated
  using (
    role::text = 'driver'
    and (select private.is_admin_or_ceo())
  )
  with check (
    role::text = 'driver'
    and (select private.is_admin_or_ceo())
    and driver_status = any (
      array[
        'pending'::public.driver_status,
        'approved'::public.driver_status,
        'rejected'::public.driver_status,
        'suspended'::public.driver_status
      ]
    )
  );

-- Rating visibility.
drop policy if exists "ratings participants read"
  on public.ratings;
create policy "ratings participants read"
  on public.ratings
  for select
  to authenticated
  using (
    customer_id = (select auth.uid())
    or driver_id = (select auth.uid())
    or (select private.is_admin_or_ceo())
  );

-- Delivery-proof object cleanup.
drop policy if exists "delivery proof cleanup"
  on storage.objects;
create policy "delivery proof cleanup"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'delivery-proofs'
    and exists (
      select 1
      from public.orders order_row
      where order_row.id::text = (storage.foldername(objects.name))[1]
        and (
          (select private.is_admin_or_ceo())
          or order_row.driver_id = (select auth.uid())
        )
    )
  );

-- Delivery-proof object reads.
drop policy if exists "delivery proof read"
  on storage.objects;
create policy "delivery proof read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'delivery-proofs'
    and exists (
      select 1
      from public.delivery_proofs proof
      join public.orders order_row on order_row.id = proof.order_id
      where (objects.name = proof.photo_path or objects.name = proof.signature_path)
        and (
          (select private.is_admin_or_ceo())
          or order_row.driver_id = (select auth.uid())
          or order_row.customer_id = (select auth.uid())
        )
    )
  );

-- Delivery-proof object uploads.
drop policy if exists "delivery proof upload"
  on storage.objects;
create policy "delivery proof upload"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'delivery-proofs'
    and exists (
      select 1
      from public.orders order_row
      where order_row.id::text = (storage.foldername(objects.name))[1]
        and order_row.status = 'in_transit'::public.order_status
        and (
          (select private.is_admin_or_ceo())
          or order_row.driver_id = (select auth.uid())
        )
    )
  );

-- Driver commission receipt visibility.
drop policy if exists "driver commission receipt read"
  on storage.objects;
create policy "driver commission receipt read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'driver-commission-receipts'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select private.is_admin_or_ceo())
    )
  );

-- Leadership payment-receipt visibility.
drop policy if exists "payment receipts leadership read"
  on storage.objects;
create policy "payment receipts leadership read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'payment-receipts'
    and (select private.is_admin_or_ceo())
  );

commit;
