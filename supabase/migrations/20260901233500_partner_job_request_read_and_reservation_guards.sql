-- Partner members may read only orders explicitly offered to their active organization.
-- The existing Partner job request RLS and membership helper remain authoritative.
drop policy if exists orders_partner_job_read on public.orders;
create policy orders_partner_job_read
on public.orders for select to authenticated
using (
  exists (
    select 1
    from public.partner_job_requests request
    where request.order_id = orders.id
      and private.is_partner_member(request.partner_id)
  )
);

-- One truck and one driver may await HALLO confirmation for only one Partner job.
create unique index if not exists partner_job_requests_one_accepted_truck
  on public.partner_job_requests(selected_truck_id)
  where status = 'accepted';
create unique index if not exists partner_job_requests_one_accepted_driver
  on public.partner_job_requests(selected_driver_id)
  where status = 'accepted';
