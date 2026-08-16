create table if not exists public.customer_dispatch_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  driver_id uuid not null references public.profiles(id),
  truck_id uuid not null references public.trucks(id),
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'declined', 'expired', 'cancelled')),
  distance_km numeric,
  eta_minutes integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_dispatch_requests_customer_idx
  on public.customer_dispatch_requests(customer_id, created_at desc);
create index if not exists customer_dispatch_requests_driver_truck_idx
  on public.customer_dispatch_requests(driver_id, truck_id, status);

alter table public.customer_dispatch_requests enable row level security;

drop policy if exists "customer dispatch request participants read" on public.customer_dispatch_requests;
create policy "customer dispatch request participants read"
on public.customer_dispatch_requests
for select
to authenticated
using (
  customer_id = (select auth.uid())
  or coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') in ('admin', 'ceo')
);

grant select on public.customer_dispatch_requests to authenticated;

create or replace function public.customer_order_assignment_candidates(p_order_id uuid)
returns table(
  driver_id uuid,
  driver_name text,
  driver_rating numeric,
  completed_trips bigint,
  truck_id uuid,
  plate_number text,
  vehicle_type text,
  capacity_tons numeric,
  distance_km numeric,
  eta_minutes integer,
  is_requested boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid := auth.uid();
begin
  if v_customer_id is null then
    raise exception 'Customer sign-in required';
  end if;

  if not exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and o.customer_id = v_customer_id
      and o.status = 'placed'::public.order_status
      and o.driver_id is null
      and o.pickup is not null
  ) then
    raise exception 'A placed order that belongs to this customer is required';
  end if;

  return query
  with requested as (
    select
      o.id,
      o.pickup,
      o.vehicle_type,
      o.cargo_weight_tons
    from public.orders o
    where o.id = p_order_id
      and o.customer_id = v_customer_id
  ), ranked as (
    select
      p.id as driver_id,
      p.full_name as driver_name,
      (
        select round(avg(r.score)::numeric, 1)
        from public.ratings r
        where r.driver_id = p.id
      ) as driver_rating,
      (
        select count(*)
        from public.orders delivered_order
        where delivered_order.driver_id = p.id
          and delivered_order.status = 'delivered'::public.order_status
      ) as completed_trips,
      best_truck.id as truck_id,
      best_truck.plate_number,
      best_truck.vehicle_type,
      best_truck.capacity_tons,
      round((public.st_distance(dp.location, requested.pickup) / 1000)::numeric, 0) as distance_km,
      greatest(
        5,
        ceil(((public.st_distance(dp.location, requested.pickup) / 1000) / 35.0) * 60.0)::integer
      ) as eta_minutes
    from requested
    join public.driver_presence dp
      on dp.is_available = true
     and dp.location is not null
     and dp.updated_at >= now() - interval '30 minutes'
    join public.profiles p
      on p.id = dp.driver_id
     and p.role::text = 'driver'
     and p.driver_status::text = 'approved'
    join lateral (
      select t.*
      from public.trucks t
      where lower(btrim(t.vehicle_type)) = lower(btrim(requested.vehicle_type))
        and (
          requested.cargo_weight_tons is null
          or t.capacity_tons is null
          or t.capacity_tons >= requested.cargo_weight_tons
        )
        and (
          (t.driver_id = p.id and t.status in ('available', 'assigned'))
          or (t.driver_id is null and t.status = 'available')
        )
        and not exists (
          select 1
          from public.orders active_order
          where active_order.truck_id = t.id
            and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
        )
        and not exists (
          select 1
          from unnest(array[
            'vehicle_registration',
            'insurance',
            'transport_permit',
            'truck_front',
            'truck_back',
            'truck_side',
            'truck_loading_area'
          ]::text[]) required_key
          where not exists (
            select 1
            from public.driver_verification_files vf
            where vf.driver_id = p.id
              and vf.truck_id = t.id
              and vf.document_key = required_key
              and vf.status = 'verified'
              and (vf.expiry_date is null or vf.expiry_date >= current_date)
          )
        )
      order by
        case when t.driver_id = p.id then 0 else 1 end,
        t.capacity_tons asc nulls last,
        t.updated_at asc nulls first
      limit 1
    ) best_truck on true
    where not exists (
      select 1
      from public.orders active_order
      where active_order.driver_id = p.id
        and active_order.status in ('accepted'::public.order_status, 'in_transit'::public.order_status)
    )
    and not exists (
      select 1
      from unnest(array[
        'driver_photo',
        'license_front',
        'license_back',
        'national_id_front',
        'national_id_back'
      ]::text[]) required_key
      where not exists (
        select 1
        from public.driver_verification_files vf
        where vf.driver_id = p.id
          and vf.truck_id is null
          and vf.document_key = required_key
          and vf.status = 'verified'
          and (vf.expiry_date is null or vf.expiry_date >= current_date)
      )
    )
  )
  select
    ranked.driver_id,
    ranked.driver_name,
    ranked.driver_rating,
    ranked.completed_trips,
    ranked.truck_id,
    ranked.plate_number,
    ranked.vehicle_type,
    ranked.capacity_tons,
    ranked.distance_km,
    ranked.eta_minutes,
    exists (
      select 1
      from public.customer_dispatch_requests request
      where request.order_id = p_order_id
        and request.driver_id = ranked.driver_id
        and request.truck_id = ranked.truck_id
        and request.status = 'requested'
    ) as is_requested
  from ranked
  order by
    is_requested desc,
    ranked.distance_km asc,
    ranked.capacity_tons asc nulls last,
    ranked.driver_name asc
  limit 12;
end;
$$;

revoke all on function public.customer_order_assignment_candidates(uuid) from public, anon;
grant execute on function public.customer_order_assignment_candidates(uuid) to authenticated;

create or replace function public.customer_request_dispatch_candidate(
  p_order_id uuid,
  p_driver_id uuid,
  p_truck_id uuid
)
returns public.customer_dispatch_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid := auth.uid();
  v_candidate record;
  v_request public.customer_dispatch_requests;
begin
  if v_customer_id is null then
    raise exception 'Customer sign-in required';
  end if;

  perform 1
  from public.orders o
  where o.id = p_order_id
    and o.customer_id = v_customer_id
    and o.status = 'placed'::public.order_status
    and o.driver_id is null
  for update;

  if not found then
    raise exception 'Only your unassigned placed order can request a truck';
  end if;

  select candidate.*
  into v_candidate
  from public.customer_order_assignment_candidates(p_order_id) candidate
  where candidate.driver_id = p_driver_id
    and candidate.truck_id = p_truck_id
  limit 1;

  if not found then
    raise exception 'This driver and truck are no longer available. Refresh the list.';
  end if;

  insert into public.customer_dispatch_requests as request(
    order_id,
    customer_id,
    driver_id,
    truck_id,
    status,
    distance_km,
    eta_minutes,
    created_at,
    updated_at
  ) values (
    p_order_id,
    v_customer_id,
    p_driver_id,
    p_truck_id,
    'requested',
    v_candidate.distance_km,
    v_candidate.eta_minutes,
    now(),
    now()
  )
  on conflict (order_id) do update
  set driver_id = excluded.driver_id,
      truck_id = excluded.truck_id,
      status = 'requested',
      distance_km = excluded.distance_km,
      eta_minutes = excluded.eta_minutes,
      updated_at = now()
  where request.customer_id = v_customer_id
  returning * into v_request;

  if v_request.id is null then
    raise exception 'Truck request could not be saved';
  end if;

  return v_request;
end;
$$;

revoke all on function public.customer_request_dispatch_candidate(uuid, uuid, uuid) from public, anon;
grant execute on function public.customer_request_dispatch_candidate(uuid, uuid, uuid) to authenticated;

create or replace function public.customer_get_dispatch_request(p_order_id uuid)
returns table(
  order_id uuid,
  driver_id uuid,
  driver_name text,
  truck_id uuid,
  plate_number text,
  vehicle_type text,
  capacity_tons numeric,
  status text,
  distance_km numeric,
  eta_minutes integer,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid := auth.uid();
begin
  if v_customer_id is null then
    raise exception 'Customer sign-in required';
  end if;

  return query
  select
    request.order_id,
    request.driver_id,
    p.full_name,
    request.truck_id,
    t.plate_number,
    t.vehicle_type,
    t.capacity_tons,
    request.status,
    request.distance_km,
    request.eta_minutes,
    request.updated_at
  from public.customer_dispatch_requests request
  join public.profiles p on p.id = request.driver_id
  join public.trucks t on t.id = request.truck_id
  where request.order_id = p_order_id
    and request.customer_id = v_customer_id;
end;
$$;

revoke all on function public.customer_get_dispatch_request(uuid) from public, anon;
grant execute on function public.customer_get_dispatch_request(uuid) to authenticated;

create or replace function public.admin_get_customer_dispatch_request(p_order_id uuid)
returns table(
  order_id uuid,
  driver_id uuid,
  truck_id uuid,
  status text,
  distance_km numeric,
  eta_minutes integer,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() ->> 'role',
    ''
  );
begin
  if v_role not in ('admin', 'ceo', 'service_role') then
    raise exception 'Admin or CEO role required';
  end if;

  return query
  select
    request.order_id,
    request.driver_id,
    request.truck_id,
    request.status,
    request.distance_km,
    request.eta_minutes,
    request.updated_at
  from public.customer_dispatch_requests request
  where request.order_id = p_order_id;
end;
$$;

revoke all on function public.admin_get_customer_dispatch_request(uuid) from public, anon;
grant execute on function public.admin_get_customer_dispatch_request(uuid) to authenticated, service_role;

create or replace function public.sync_customer_dispatch_request_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.driver_id is not null and new.truck_id is not null then
    update public.customer_dispatch_requests request
    set status = case
          when request.driver_id = new.driver_id and request.truck_id = new.truck_id then 'approved'
          else 'declined'
        end,
        updated_at = now()
    where request.order_id = new.id
      and request.status = 'requested';
  elsif new.status <> 'placed'::public.order_status then
    update public.customer_dispatch_requests request
    set status = 'expired',
        updated_at = now()
    where request.order_id = new.id
      and request.status = 'requested';
  end if;

  return new;
end;
$$;

drop trigger if exists customer_dispatch_request_assignment_sync on public.orders;
create trigger customer_dispatch_request_assignment_sync
after update of driver_id, truck_id, status on public.orders
for each row
execute function public.sync_customer_dispatch_request_assignment();

revoke all on function public.sync_customer_dispatch_request_assignment() from public, anon, authenticated;

notify pgrst, 'reload schema';
