-- Driver trip dispute workflow used by the native Driver Android support center.
-- Drivers may create immutable dispute records for their own assigned trips.
-- Admin/CEO review happens through a guarded RPC; direct authenticated mutations stay disabled.

begin;

create table if not exists public.driver_trip_disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  driver_id uuid not null references public.profiles(id) on delete restrict,
  category text not null,
  details text not null,
  status text not null default 'open',
  admin_note text,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_trip_disputes_category_check
    check (category in ('payment','delivery','assignment','customer','safety','other')),
  constraint driver_trip_disputes_details_check
    check (char_length(btrim(details)) between 10 and 2000),
  constraint driver_trip_disputes_status_check
    check (status in ('open','under_review','resolved','rejected')),
  constraint driver_trip_disputes_admin_note_check
    check (admin_note is null or char_length(admin_note) <= 2000),
  constraint driver_trip_disputes_review_check
    check (
      (status = 'open' and reviewed_by is null and reviewed_at is null)
      or
      (status <> 'open' and reviewed_by is not null and reviewed_at is not null)
    )
);

create index if not exists driver_trip_disputes_driver_created_idx
  on public.driver_trip_disputes(driver_id, created_at desc);
create index if not exists driver_trip_disputes_order_created_idx
  on public.driver_trip_disputes(order_id, created_at desc);
create index if not exists driver_trip_disputes_status_created_idx
  on public.driver_trip_disputes(status, created_at desc);

alter table public.driver_trip_disputes enable row level security;
revoke all on table public.driver_trip_disputes from anon;
grant select on table public.driver_trip_disputes to authenticated;
revoke insert, update, delete on table public.driver_trip_disputes from authenticated;

drop policy if exists driver_trip_disputes_participant_read on public.driver_trip_disputes;
create policy driver_trip_disputes_participant_read
  on public.driver_trip_disputes
  for select
  to authenticated
  using (
    (select private.is_admin_or_ceo())
    or (
      driver_id = (select auth.uid())
      and (select public.is_approved_driver())
    )
  );

create or replace function public.driver_create_trip_dispute(
  p_order_id uuid,
  p_category text,
  p_details text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_category text := lower(btrim(coalesce(p_category, '')));
  v_details text := btrim(coalesce(p_details, ''));
  v_order_status public.order_status;
  v_id uuid;
begin
  if v_actor is null or not (select public.is_approved_driver()) then
    raise exception 'Approved Driver authorization is required' using errcode = '42501';
  end if;
  if p_order_id is null then
    raise exception 'Order is required' using errcode = '22023';
  end if;
  if v_category not in ('payment','delivery','assignment','customer','safety','other') then
    raise exception 'Unsupported dispute category' using errcode = '22023';
  end if;
  if char_length(v_details) < 10 or char_length(v_details) > 2000 then
    raise exception 'Dispute details must be between 10 and 2000 characters' using errcode = '22023';
  end if;

  select trip_order.status
  into v_order_status
  from public.orders trip_order
  where trip_order.id = p_order_id
    and trip_order.driver_id = v_actor;

  if not found then
    raise exception 'This trip is not assigned to the signed-in Driver' using errcode = '42501';
  end if;
  if v_order_status not in (
    'accepted'::public.order_status,
    'in_transit'::public.order_status,
    'delivered'::public.order_status
  ) then
    raise exception 'Only active or delivered trips can be disputed' using errcode = '23514';
  end if;

  insert into public.driver_trip_disputes(order_id, driver_id, category, details)
  values (p_order_id, v_actor, v_category, v_details)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.admin_review_driver_trip_dispute(
  p_dispute_id uuid,
  p_status text,
  p_admin_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_note text := nullif(btrim(coalesce(p_admin_note, '')), '');
  v_current_status text;
begin
  if v_actor is null or not (select private.is_admin_or_ceo()) then
    raise exception 'Active Admin or CEO authorization is required' using errcode = '42501';
  end if;
  if v_status not in ('under_review','resolved','rejected') then
    raise exception 'Unsupported dispute review status' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 2000 then
    raise exception 'Admin note must be 2000 characters or fewer' using errcode = '22023';
  end if;

  select dispute.status
  into v_current_status
  from public.driver_trip_disputes dispute
  where dispute.id = p_dispute_id
  for update;

  if not found then
    raise exception 'Driver trip dispute not found' using errcode = 'P0002';
  end if;
  if v_current_status in ('resolved','rejected') then
    raise exception 'This dispute is already closed' using errcode = '23514';
  end if;

  update public.driver_trip_disputes
  set status = v_status,
      admin_note = v_note,
      reviewed_by = v_actor,
      reviewed_at = now(),
      updated_at = now()
  where id = p_dispute_id;
end;
$$;

revoke all on function public.driver_create_trip_dispute(uuid,text,text)
  from public, anon, authenticated;
revoke all on function public.admin_review_driver_trip_dispute(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.driver_create_trip_dispute(uuid,text,text)
  to authenticated;
grant execute on function public.admin_review_driver_trip_dispute(uuid,text,text)
  to authenticated;

commit;
