create or replace function public.admin_driver_document_register_page(
  p_page integer default 1,
  p_page_size integer default 25,
  p_search text default null,
  p_status_filter text default 'all'
)
returns table (
  row_id text,
  document_id uuid,
  driver_id uuid,
  driver_name text,
  phone text,
  truck_id uuid,
  plate_number text,
  vehicle_type text,
  document_key text,
  expiry_date date,
  status text,
  updated_at timestamptz,
  reviewer_name text,
  file_path text,
  original_name text,
  mime_type text,
  rejection_reason text,
  reviewed_at timestamptz,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public, private
as $$
with params as (
  select
    greatest(1, coalesce(p_page, 1)) as v_page,
    least(100, greatest(10, coalesce(p_page_size, 25))) as v_page_size,
    nullif(btrim(coalesce(p_search, '')), '') as v_search,
    case lower(coalesce(p_status_filter, 'all'))
      when 'pending' then 'pending'
      when 'verified' then 'verified'
      when 'rejected' then 'rejected'
      when 'missing' then 'missing'
      when 'expiring' then 'expiring'
      when 'expired' then 'expired'
      else 'all'
    end as v_filter
),
leadership as (
  select private.is_admin_or_ceo() as allowed
),
required_slots as (
  select p.id as driver_id, p.full_name as driver_name, p.phone,
    null::uuid as truck_id, null::text as plate_number, null::text as vehicle_type,
    keys.document_key
  from public.profiles p
  cross join (values ('driver_photo'), ('license_front'), ('license_back'), ('national_id_front'), ('national_id_back')) as keys(document_key)
  cross join leadership l
  where p.role = 'driver' and l.allowed
  union all
  select p.id, p.full_name, p.phone,
    t.id, t.plate_number, t.vehicle_type,
    keys.document_key
  from public.profiles p
  join public.trucks t on t.driver_id = p.id
  cross join (values ('vehicle_registration'), ('truck_front'), ('truck_side')) as keys(document_key)
  cross join leadership l
  where p.role = 'driver' and l.allowed
),
enriched as (
  select
    coalesce(vf.id::text, 'missing:' || s.driver_id::text || ':' || coalesce(s.truck_id::text, 'identity') || ':' || s.document_key) as row_id,
    vf.id as document_id,
    s.driver_id,
    s.driver_name,
    s.phone,
    s.truck_id,
    s.plate_number,
    s.vehicle_type,
    s.document_key,
    vf.expiry_date,
    coalesce(vf.status, 'missing') as status,
    vf.updated_at,
    reviewer.full_name as reviewer_name,
    vf.file_path,
    vf.original_name,
    vf.mime_type,
    vf.rejection_reason,
    vf.reviewed_at,
    vf.created_at
  from required_slots s
  left join public.driver_verification_files vf
    on vf.driver_id = s.driver_id
   and vf.truck_id is not distinct from s.truck_id
   and vf.document_key = s.document_key
  left join public.profiles reviewer on reviewer.id = vf.reviewed_by
),
filtered as (
  select e.*
  from enriched e
  cross join params p
  where (
    p.v_search is null
    or lower(concat_ws(' ', e.driver_name, e.phone, e.plate_number)) like '%' || lower(p.v_search) || '%'
  )
  and (
    p.v_filter = 'all'
    or p.v_filter = e.status
    or (p.v_filter = 'expiring' and e.expiry_date >= (now() at time zone 'Africa/Addis_Ababa')::date and e.expiry_date <= (now() at time zone 'Africa/Addis_Ababa')::date + 30)
    or (p.v_filter = 'expired' and e.expiry_date < (now() at time zone 'Africa/Addis_Ababa')::date)
  )
),
counted as (
  select f.*, count(*) over () as total_count
  from filtered f
)
select
  c.row_id, c.document_id, c.driver_id, c.driver_name, c.phone,
  c.truck_id, c.plate_number, c.vehicle_type, c.document_key,
  c.expiry_date, c.status, c.updated_at, c.reviewer_name,
  c.file_path, c.original_name, c.mime_type, c.rejection_reason,
  c.reviewed_at, c.created_at, c.total_count
from counted c
cross join params p
order by
  case when c.expiry_date < (now() at time zone 'Africa/Addis_Ababa')::date then 0
       when c.expiry_date <= (now() at time zone 'Africa/Addis_Ababa')::date + 7 then 1
       when c.expiry_date <= (now() at time zone 'Africa/Addis_Ababa')::date + 14 then 2
       when c.expiry_date <= (now() at time zone 'Africa/Addis_Ababa')::date + 30 then 3
       when c.status = 'pending' then 4
       when c.status = 'rejected' then 5
       when c.status = 'missing' then 6
       else 7 end,
  c.updated_at desc nulls last,
  c.driver_name,
  c.document_key
limit p.v_page_size
offset (p.v_page - 1) * p.v_page_size;
$$;

revoke all on function public.admin_driver_document_register_page(integer, integer, text, text) from public, anon;
grant execute on function public.admin_driver_document_register_page(integer, integer, text, text) to authenticated;
