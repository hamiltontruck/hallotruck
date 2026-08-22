-- Keep the driver verification center scoped to the same vehicle selected by
-- getMyVerificationProfile(): the newest self-registered truck, or the most
-- recent trip truck when no owned truck exists. This prevents historical
-- vehicle files from being mixed into the current seven-item checklist.

-- Driver reads: five identity files plus only the current vehicle's seven files.
drop policy if exists "driver verification own read" on public.driver_verification_files;
create policy "driver verification own read"
  on public.driver_verification_files
  for select
  to authenticated
  using (
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
  );

-- Driver inserts: identity files or files for the current verification vehicle.
drop policy if exists "driver verification own insert" on public.driver_verification_files;
create policy "driver verification own insert"
  on public.driver_verification_files
  for insert
  to authenticated
  with check (
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
  );

-- Driver replacements: preserve the pending-review reset and prevent a stale
-- truck document from being replaced through a retained client reference.
drop policy if exists "driver verification own update" on public.driver_verification_files;
create policy "driver verification own update"
  on public.driver_verification_files
  for update
  to authenticated
  using (
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
  with check (
    driver_id = (select auth.uid())
    and status = 'pending'
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
  );

notify pgrst, 'reload schema';
