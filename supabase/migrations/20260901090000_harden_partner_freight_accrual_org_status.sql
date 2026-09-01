-- Keep Partner freight accruals aligned with Partner finance access.
-- Admin/CEO can review inactive organizations, but new accruals require an active organization.

create or replace function public.admin_record_partner_freight(
  p_partner_id uuid,
  p_order_id uuid,
  p_vehicle_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (select private.is_admin_or_ceo()) then
    raise exception using errcode = '42501', message = 'Admin or CEO access required';
  end if;

  if p_partner_id is null then
    raise exception using errcode = '22023', message = 'Partner organization is required';
  end if;

  if not exists (
    select 1
    from public.partner_organizations organization
    where organization.id = p_partner_id
      and organization.status::text = 'active'
  ) then
    raise exception using errcode = '22023', message = 'Active Partner organization not found';
  end if;

  return private.record_partner_freight_internal(
    p_partner_id,
    p_order_id,
    p_vehicle_id,
    null
  );
end;
$$;

create or replace function public.admin_record_partner_freight(
  p_partner_id uuid,
  p_order_id uuid,
  p_vehicle_id uuid,
  p_project_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (select private.is_admin_or_ceo()) then
    raise exception using errcode = '42501', message = 'Admin or CEO access required';
  end if;

  if p_partner_id is null then
    raise exception using errcode = '22023', message = 'Partner organization is required';
  end if;

  if not exists (
    select 1
    from public.partner_organizations organization
    where organization.id = p_partner_id
      and organization.status::text = 'active'
  ) then
    raise exception using errcode = '22023', message = 'Active Partner organization not found';
  end if;

  return private.record_partner_freight_internal(
    p_partner_id,
    p_order_id,
    p_vehicle_id,
    p_project_id
  );
end;
$$;

revoke all on function public.admin_record_partner_freight(uuid, uuid, uuid)
  from public, anon;
revoke all on function public.admin_record_partner_freight(uuid, uuid, uuid, uuid)
  from public, anon;
grant execute on function public.admin_record_partner_freight(uuid, uuid, uuid)
  to authenticated;
grant execute on function public.admin_record_partner_freight(uuid, uuid, uuid, uuid)
  to authenticated;
