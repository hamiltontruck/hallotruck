begin;

-- HALLO Mobile Google onboarding + CRM identity foundation.
-- Public onboarding can create Customer/Driver roles only. Leadership roles remain database-controlled.

create sequence if not exists public.customer_public_id_seq;
create sequence if not exists public.driver_public_id_seq;

alter table public.customers
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists customer_code text,
  add column if not exists customer_level text not null default 'standard',
  add column if not exists level_updated_at timestamptz,
  add column if not exists level_updated_by uuid references auth.users(id) on delete set null;

alter table public.profiles
  add column if not exists driver_code text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.customers'::regclass
      and conname = 'customers_customer_level_check'
  ) then
    alter table public.customers
      add constraint customers_customer_level_check
      check (customer_level in ('standard','silver','gold','vip'));
  end if;
end;
$$;

create unique index if not exists customers_auth_user_id_key
  on public.customers(auth_user_id);
create unique index if not exists customers_customer_code_key
  on public.customers(customer_code);
create unique index if not exists profiles_driver_code_key
  on public.profiles(driver_code)
  where driver_code is not null;

update public.customers
set customer_code = 'HC-C-' || lpad(nextval('public.customer_public_id_seq')::text, 8, '0')
where customer_code is null;

update public.profiles
set driver_code = 'HC-D-' || lpad(nextval('public.driver_public_id_seq')::text, 8, '0')
where role::text = 'driver'
  and driver_code is null;

alter table public.customers
  alter column customer_code set not null;

create or replace function private.assign_customer_public_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.customer_code is null or btrim(new.customer_code) = '' then
    new.customer_code := 'HC-C-' || lpad(nextval('public.customer_public_id_seq')::text, 8, '0');
  end if;
  return new;
end;
$function$;

revoke all on function private.assign_customer_public_code()
  from public, anon, authenticated;

drop trigger if exists customers_assign_public_code on public.customers;
create trigger customers_assign_public_code
before insert on public.customers
for each row execute function private.assign_customer_public_code();

create or replace function private.assign_driver_public_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.role::text = 'driver'
     and (new.driver_code is null or btrim(new.driver_code) = '') then
    new.driver_code := 'HC-D-' || lpad(nextval('public.driver_public_id_seq')::text, 8, '0');
  elsif new.role::text <> 'driver' then
    new.driver_code := null;
  end if;
  return new;
end;
$function$;

revoke all on function private.assign_driver_public_code()
  from public, anon, authenticated;

drop trigger if exists profiles_assign_driver_public_code on public.profiles;
create trigger profiles_assign_driver_public_code
before insert or update of role, driver_code on public.profiles
for each row execute function private.assign_driver_public_code();

revoke all on sequence public.customer_public_id_seq from public, anon, authenticated;
revoke all on sequence public.driver_public_id_seq from public, anon, authenticated;

create or replace function private.normalize_public_mobile_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_compact text := regexp_replace(
    btrim(coalesce(p_phone, '')),
    '[[:space:]()-]',
    '',
    'g'
  );
begin
  if v_compact !~ '^(\+251|251|0)?[79][0-9]{8}$' then
    raise exception 'Phone must be an Ethiopian mobile number: 09xxxxxxxx, 07xxxxxxxx, +2519xxxxxxxx or +2517xxxxxxxx.'
      using errcode = '22023';
  end if;

  return case
    when v_compact like '+251%' then '0' || substr(v_compact, 5)
    when v_compact like '251%' then '0' || substr(v_compact, 4)
    when v_compact like '7%' or v_compact like '9%' then '0' || v_compact
    else v_compact
  end;
end;
$function$;

revoke all on function private.normalize_public_mobile_phone(text) from public, anon, authenticated;

create or replace function public.handle_new_driver()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role_text text := lower(btrim(coalesce(new.raw_user_meta_data ->> 'role', '')));
  v_role public.user_role;
  v_email text := lower(btrim(coalesce(new.email, '')));
  v_email_local text;
  v_email_domain text;
  v_domain_labels text[];
  v_domain_label text;
  v_phone text;
  v_name text;
begin
  -- OAuth providers do not supply HALLO's phone/role metadata. Let auth succeed
  -- without a profile, then the signed-in app completes a public role through
  -- complete_public_mobile_profile(). Never default an unknown OAuth identity to Driver.
  if v_role_text not in ('customer', 'driver') then
    return new;
  end if;

  v_role := v_role_text::public.user_role;

  if v_email = ''
     or length(v_email) > 254
     or length(v_email) - length(replace(v_email, '@', '')) <> 1 then
    raise exception 'Enter a valid email address, for example name@example.com.';
  end if;

  v_email_local := split_part(v_email, '@', 1);
  v_email_domain := split_part(v_email, '@', 2);

  if length(v_email_local) < 1
     or length(v_email_local) > 64
     or v_email_local !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+$'
     or v_email_local like '.%'
     or v_email_local like '%.'
     or position('..' in v_email_local) > 0 then
    raise exception 'Enter a valid email address, for example name@example.com.';
  end if;

  if length(v_email_domain) < 1
     or length(v_email_domain) > 253
     or v_email_domain like '.%'
     or v_email_domain like '%.'
     or position('..' in v_email_domain) > 0
     or v_email_domain !~ '^[A-Za-z0-9.-]+$' then
    raise exception 'Enter a valid email address, for example name@example.com.';
  end if;

  v_domain_labels := string_to_array(v_email_domain, '.');
  if coalesce(array_length(v_domain_labels, 1), 0) < 2
     or v_domain_labels[array_length(v_domain_labels, 1)] !~ '^[A-Za-z]{2,63}$' then
    raise exception 'Enter a valid email address, for example name@example.com.';
  end if;

  foreach v_domain_label in array v_domain_labels loop
    if length(v_domain_label) < 1
       or length(v_domain_label) > 63
       or v_domain_label !~ '^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$' then
      raise exception 'Enter a valid email address, for example name@example.com.';
    end if;
  end loop;

  v_phone := private.normalize_public_mobile_phone(new.raw_user_meta_data ->> 'phone');
  v_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    v_email_local
  );

  insert into public.profiles (
    id, role, full_name, phone, driver_status, email, driver_code
  )
  values (
    new.id,
    v_role,
    v_name,
    v_phone,
    case when v_role_text = 'driver' then 'pending'::public.driver_status else null end,
    v_email,
    case
      when v_role_text = 'driver'
        then 'HC-D-' || lpad(nextval('public.driver_public_id_seq')::text, 8, '0')
      else null
    end
  )
  on conflict (id) do nothing;

  if v_role_text = 'customer' then
    update public.customers c
    set auth_user_id = new.id,
        full_name = v_name,
        email = coalesce(nullif(c.email, ''), v_email)
    where c.auth_user_id is null
      and private.normalize_public_mobile_phone(c.phone) = v_phone
      and not exists (
        select 1 from public.customers linked where linked.auth_user_id = new.id
      );

    insert into public.customers (
      auth_user_id, full_name, phone, email, created_by
    )
    select new.id, v_name, v_phone, v_email, new.id
    where not exists (
      select 1 from public.customers c where c.auth_user_id = new.id
    );
  end if;

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', v_role_text)
  where id = new.id;

  return new;
end;
$function$;

revoke all on function public.handle_new_driver() from public, anon, authenticated;

create or replace function public.complete_public_mobile_profile(
  p_role text,
  p_full_name text,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_role_text text := lower(btrim(coalesce(p_role, '')));
  v_role public.user_role;
  v_phone text;
  v_name text := regexp_replace(btrim(coalesce(p_full_name, '')), '[[:space:]]+', ' ', 'g');
  v_email text;
  v_metadata jsonb;
  v_existing_role text;
  v_driver_status text;
  v_customer_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if v_role_text not in ('customer', 'driver') then
    raise exception 'Public onboarding may create only Customer or Driver accounts.'
      using errcode = '42501';
  end if;

  v_role := v_role_text::public.user_role;
  v_phone := private.normalize_public_mobile_phone(p_phone);

  select lower(btrim(coalesce(u.email, ''))), coalesce(u.raw_user_meta_data, '{}'::jsonb)
    into v_email, v_metadata
  from auth.users u
  where u.id = v_user_id
  for update;

  if not found then
    raise exception 'Authenticated user not found.' using errcode = 'P0002';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    v_name := coalesce(
      nullif(btrim(v_metadata ->> 'full_name'), ''),
      nullif(btrim(v_metadata ->> 'name'), ''),
      nullif(split_part(v_email, '@', 1), '')
    );
  end if;

  if char_length(coalesce(v_name, '')) < 2 or char_length(v_name) > 120 then
    raise exception 'Full name must contain 2-120 characters.' using errcode = '22023';
  end if;

  select p.role::text, p.driver_status::text
    into v_existing_role, v_driver_status
  from public.profiles p
  where p.id = v_user_id
  for update;

  if found and v_existing_role <> v_role_text then
    raise exception 'This account already belongs to the % workspace.', v_existing_role
      using errcode = '42501';
  end if;

  if found then
    update public.profiles
    set full_name = v_name,
        phone = v_phone,
        email = nullif(v_email, '')
    where id = v_user_id;
  else
    insert into public.profiles (
      id, role, full_name, phone, driver_status, email, driver_code
    )
    values (
      v_user_id,
      v_role,
      v_name,
      v_phone,
      case when v_role_text = 'driver' then 'pending'::public.driver_status else null end,
      nullif(v_email, ''),
      case
        when v_role_text = 'driver'
          then 'HC-D-' || lpad(nextval('public.driver_public_id_seq')::text, 8, '0')
        else null
      end
    );
    v_driver_status := case when v_role_text = 'driver' then 'pending' else null end;
  end if;

  if v_role_text = 'customer' then
    update public.customers c
    set auth_user_id = v_user_id,
        full_name = v_name,
        email = coalesce(nullif(c.email, ''), nullif(v_email, ''))
    where c.auth_user_id is null
      and private.normalize_public_mobile_phone(c.phone) = v_phone
      and not exists (
        select 1 from public.customers linked where linked.auth_user_id = v_user_id
      );

    insert into public.customers (
      auth_user_id, full_name, phone, email, created_by
    )
    select v_user_id, v_name, v_phone, nullif(v_email, ''), v_user_id
    where not exists (
      select 1 from public.customers c where c.auth_user_id = v_user_id
    );

    select c.id into v_customer_id
    from public.customers c
    where c.auth_user_id = v_user_id;
  end if;

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', v_role_text)
  where id = v_user_id;

  return jsonb_build_object(
    'role', v_role_text,
    'driverStatus', v_driver_status,
    'customerRecordId', v_customer_id
  );
end;
$function$;

revoke all on function public.complete_public_mobile_profile(text, text, text)
  from public, anon;
grant execute on function public.complete_public_mobile_profile(text, text, text)
  to authenticated;

-- Link existing authenticated Customer profiles to CRM rows deterministically.
update public.customers c
set auth_user_id = p.id,
    full_name = coalesce(nullif(c.full_name, ''), p.full_name),
    email = coalesce(nullif(c.email, ''), nullif(p.email, ''), nullif(u.email, ''))
from public.profiles p
left join auth.users u on u.id = p.id
where p.role::text = 'customer'
  and c.auth_user_id is null
  and private.normalize_public_mobile_phone(c.phone) = private.normalize_public_mobile_phone(p.phone)
  and not exists (
    select 1 from public.customers linked where linked.auth_user_id = p.id
  );

insert into public.customers (
  auth_user_id, full_name, phone, email, company_name, created_by, created_at
)
select
  p.id,
  coalesce(nullif(p.full_name, ''), split_part(coalesce(nullif(p.email, ''), u.email), '@', 1), 'Customer'),
  p.phone,
  coalesce(nullif(p.email, ''), nullif(u.email, '')),
  nullif(p.company_name, ''),
  p.id,
  p.created_at
from public.profiles p
left join auth.users u on u.id = p.id
where p.role::text = 'customer'
  and not exists (
    select 1 from public.customers c where c.auth_user_id = p.id
  )
on conflict (phone) do nothing;

-- Backfill the canonical CRM link for orders whose authenticated Customer is known.
update public.orders o
set customer_record_id = c.id
from public.customers c
where o.customer_record_id is null
  and o.customer_id is not null
  and c.auth_user_id = o.customer_id;

create or replace function private.sync_order_customer_record_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.customer_record_id is null and new.customer_id is not null then
    select c.id into new.customer_record_id
    from public.customers c
    where c.auth_user_id = new.customer_id;
  end if;
  return new;
end;
$function$;

revoke all on function private.sync_order_customer_record_id()
  from public, anon, authenticated;

drop trigger if exists orders_sync_customer_record_id on public.orders;
create trigger orders_sync_customer_record_id
before insert or update of customer_id, customer_record_id
on public.orders
for each row
execute function private.sync_order_customer_record_id();

create table if not exists public.customer_level_audit (
  id bigint generated by default as identity primary key,
  customer_id uuid not null references public.customers(id) on delete cascade,
  previous_level text not null,
  next_level text not null,
  reason text not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.customer_level_audit enable row level security;

drop policy if exists customer_level_audit_leadership_read
  on public.customer_level_audit;
create policy customer_level_audit_leadership_read
  on public.customer_level_audit
  for select
  to authenticated
  using ((select private.is_admin_or_ceo()));

revoke all on table public.customer_level_audit from public, anon, authenticated;
grant select on table public.customer_level_audit to authenticated;

create or replace function public.admin_set_customer_level(
  p_customer_id uuid,
  p_level text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_level text := lower(btrim(coalesce(p_level, '')));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_previous text;
begin
  perform private.require_active_leadership('admin_set_customer_level');

  if v_level not in ('standard','silver','gold','vip') then
    raise exception 'Customer level must be Standard, Silver, Gold or VIP.'
      using errcode = '22023';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'A reason of 3-500 characters is required.'
      using errcode = '22023';
  end if;

  select customer_level into v_previous
  from public.customers
  where id = p_customer_id
  for update;

  if not found then
    raise exception 'Customer not found.' using errcode = 'P0002';
  end if;

  if v_previous = v_level then
    return;
  end if;

  update public.customers
  set customer_level = v_level,
      level_updated_at = now(),
      level_updated_by = auth.uid()
  where id = p_customer_id;

  insert into public.customer_level_audit (
    customer_id, previous_level, next_level, reason, actor_id
  )
  values (p_customer_id, v_previous, v_level, v_reason, auth.uid());
end;
$function$;

revoke all on function public.admin_set_customer_level(uuid, text, text)
  from public, anon;
grant execute on function public.admin_set_customer_level(uuid, text, text)
  to authenticated;

create or replace function public.admin_customer_registry_report()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  perform private.require_active_leadership('admin_customer_registry_report');

  with metrics as (
    select
      c.id,
      count(o.id)::bigint as order_count,
      count(o.id) filter (where o.status::text = 'delivered')::bigint as delivered_count,
      coalesce(sum(o.price_etb), 0)::numeric as lifetime_order_etb,
      coalesce(max(o.price_etb), 0)::numeric as largest_order_etb,
      max(o.created_at) as last_order_at
    from public.customers c
    left join public.orders o
      on o.customer_record_id = c.id
      or (o.customer_record_id is null and c.auth_user_id is not null and o.customer_id = c.auth_user_id)
    group by c.id
  ),
  rows as (
    select jsonb_build_object(
      'id', c.id,
      'customerCode', c.customer_code,
      'authUserId', c.auth_user_id,
      'fullName', c.full_name,
      'phone', c.phone,
      'email', c.email,
      'companyName', c.company_name,
      'level', c.customer_level,
      'isCreditCustomer', c.is_credit_customer,
      'creditLimitEtb', c.credit_limit_etb,
      'orderCount', m.order_count,
      'deliveredCount', m.delivered_count,
      'lifetimeOrderEtb', m.lifetime_order_etb,
      'largestOrderEtb', m.largest_order_etb,
      'lastOrderAt', m.last_order_at,
      'createdAt', c.created_at
    ) as row
    from public.customers c
    join metrics m on m.id = c.id
    order by m.lifetime_order_etb desc, m.order_count desc, c.created_at desc
  )
  select jsonb_build_object(
    'totalCustomers', (select count(*) from public.customers),
    'vipCustomers', (select count(*) from public.customers where customer_level = 'vip'),
    'newCustomers30d', (select count(*) from public.customers where created_at >= now() - interval '30 days'),
    'customers', coalesce((select jsonb_agg(row) from rows), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$function$;

revoke all on function public.admin_customer_registry_report()
  from public, anon;
grant execute on function public.admin_customer_registry_report()
  to authenticated;

create or replace function public.admin_driver_registry_report()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  perform private.require_active_leadership('admin_driver_registry_report');

  with driver_rows as (
    select
      p.id,
      p.driver_code,
      p.full_name,
      p.phone,
      p.email,
      p.driver_status::text as driver_status,
      p.rating_avg,
      p.created_at,
      t.id as truck_id,
      t.plate_number,
      t.vehicle_type,
      t.model,
      t.status as truck_status,
      coalesce(v.required_submitted, 0) as required_documents_submitted,
      coalesce(v.required_verified, 0) as required_documents_verified,
      coalesce(o.order_count, 0) as order_count,
      o.last_order_at
    from public.profiles p
    left join lateral (
      select t.*
      from public.trucks t
      where t.driver_id = p.id
      order by t.updated_at desc
      limit 1
    ) t on true
    left join lateral (
      select
        count(*) filter (
          where
            (
              vf.truck_id is null
              and vf.document_key in (
                'driver_photo','license_front','license_back',
                'national_id_front','national_id_back'
              )
            )
            or (
              t.id is not null
              and vf.truck_id = t.id
              and vf.document_key in (
                'vehicle_registration','truck_front','truck_side'
              )
            )
        )::bigint as required_submitted,
        count(*) filter (
          where
            vf.status = 'verified'
            and (
              vf.document_key not in ('license_front','national_id_front')
              or (vf.expiry_date is not null and vf.expiry_date >= current_date)
            )
            and (
              (
                vf.truck_id is null
                and vf.document_key in (
                  'driver_photo','license_front','license_back',
                  'national_id_front','national_id_back'
                )
              )
              or (
                t.id is not null
                and vf.truck_id = t.id
                and vf.document_key in (
                  'vehicle_registration','truck_front','truck_side'
                )
              )
            )
        )::bigint as required_verified
      from public.driver_verification_files vf
      where vf.driver_id = p.id
    ) v on true
    left join lateral (
      select count(*)::bigint as order_count, max(created_at) as last_order_at
      from public.orders o
      where o.driver_id = p.id
    ) o on true
    where p.role::text = 'driver'
  )
  select jsonb_build_object(
    'totalDrivers', (select count(*) from driver_rows),
    'approvedDrivers', (select count(*) from driver_rows where driver_status = 'approved'),
    'pendingDrivers', (select count(*) from driver_rows where driver_status = 'pending'),
    'drivers', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'driverCode', driver_code,
          'fullName', full_name,
          'phone', phone,
          'email', email,
          'status', driver_status,
          'rating', rating_avg,
          'truckId', truck_id,
          'plateNumber', plate_number,
          'vehicleType', vehicle_type,
          'model', model,
          'truckStatus', truck_status,
          'requiredDocumentsSubmitted', required_documents_submitted,
          'requiredDocumentsVerified', required_documents_verified,
          'orderCount', order_count,
          'lastOrderAt', last_order_at,
          'createdAt', created_at
        )
        order by
          case when driver_status = 'pending' then 0 when driver_status = 'approved' then 1 else 2 end,
          created_at desc
      )
      from driver_rows
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$function$;

revoke all on function public.admin_driver_registry_report()
  from public, anon;
grant execute on function public.admin_driver_registry_report()
  to authenticated;

commit;
notify pgrst, 'reload schema';
