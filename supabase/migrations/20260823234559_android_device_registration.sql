create table if not exists public.mobile_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  android_device_id text not null,
  fcm_token text,
  app_version text not null default 'unknown',
  last_active_at timestamptz not null default now(),
  is_active boolean not null default true,
  token_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mobile_devices_android_device_id_length
    check (char_length(android_device_id) between 8 and 200),
  constraint mobile_devices_fcm_token_length
    check (fcm_token is null or char_length(fcm_token) between 20 and 4096),
  constraint mobile_devices_app_version_length
    check (char_length(app_version) between 1 and 100)
);

create unique index if not exists mobile_devices_android_device_id_uidx
  on public.mobile_devices (android_device_id);

create unique index if not exists mobile_devices_fcm_token_uidx
  on public.mobile_devices (fcm_token)
  where fcm_token is not null;

create index if not exists mobile_devices_user_active_idx
  on public.mobile_devices (user_id, is_active, last_active_at desc);

create index if not exists mobile_devices_last_active_idx
  on public.mobile_devices (last_active_at desc)
  where is_active = true;

alter table public.mobile_devices enable row level security;

revoke all on table public.mobile_devices from public, anon, authenticated;
grant select on table public.mobile_devices to authenticated;
grant select, insert, update, delete on table public.mobile_devices to service_role;

drop policy if exists mobile_devices_select_own_or_admin on public.mobile_devices;
create policy mobile_devices_select_own_or_admin
on public.mobile_devices
for select
to authenticated
using (
  user_id = auth.uid()
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'ceo')
);

create or replace function public.register_android_device(
  p_android_device_id text,
  p_fcm_token text,
  p_app_version text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_device_id text := btrim(coalesce(p_android_device_id, ''));
  v_fcm_token text := nullif(btrim(coalesce(p_fcm_token, '')), '');
  v_app_version text := nullif(btrim(coalesce(p_app_version, '')), '');
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if char_length(v_device_id) < 8 or char_length(v_device_id) > 200 then
    raise exception 'Android device ID must be between 8 and 200 characters' using errcode = '22023';
  end if;

  if v_fcm_token is not null and (char_length(v_fcm_token) < 20 or char_length(v_fcm_token) > 4096) then
    raise exception 'FCM token length is invalid' using errcode = '22023';
  end if;

  if v_app_version is null or char_length(v_app_version) > 100 then
    raise exception 'App version is required and must be 100 characters or fewer' using errcode = '22023';
  end if;

  if v_fcm_token is not null then
    update public.mobile_devices d
    set
      fcm_token = null,
      is_active = false,
      updated_at = now()
    where d.fcm_token = v_fcm_token
      and d.android_device_id <> v_device_id;
  end if;

  insert into public.mobile_devices (
    user_id,
    android_device_id,
    fcm_token,
    app_version,
    last_active_at,
    is_active,
    token_updated_at,
    updated_at
  ) values (
    v_user_id,
    v_device_id,
    v_fcm_token,
    v_app_version,
    now(),
    true,
    case when v_fcm_token is not null then now() else null end,
    now()
  )
  on conflict (android_device_id)
  do update set
    user_id = excluded.user_id,
    fcm_token = excluded.fcm_token,
    app_version = excluded.app_version,
    last_active_at = now(),
    is_active = true,
    token_updated_at = case
      when public.mobile_devices.fcm_token is distinct from excluded.fcm_token then now()
      else public.mobile_devices.token_updated_at
    end,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.touch_android_device(
  p_android_device_id text,
  p_app_version text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_device_id text := btrim(coalesce(p_android_device_id, ''));
  v_app_version text := nullif(btrim(coalesce(p_app_version, '')), '');
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  update public.mobile_devices d
  set
    app_version = coalesce(v_app_version, d.app_version),
    last_active_at = now(),
    is_active = true,
    updated_at = now()
  where d.user_id = v_user_id
    and d.android_device_id = v_device_id;

  return found;
end;
$function$;

create or replace function public.unregister_android_device(
  p_android_device_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_device_id text := btrim(coalesce(p_android_device_id, ''));
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  update public.mobile_devices d
  set
    fcm_token = null,
    is_active = false,
    last_active_at = now(),
    updated_at = now()
  where d.user_id = v_user_id
    and d.android_device_id = v_device_id;

  return found;
end;
$function$;

create or replace function public.my_android_devices()
returns table (
  id uuid,
  android_device_id text,
  app_version text,
  last_active_at timestamptz,
  is_active boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    d.id,
    d.android_device_id,
    d.app_version,
    d.last_active_at,
    d.is_active,
    d.created_at
  from public.mobile_devices d
  where d.user_id = auth.uid()
  order by d.last_active_at desc;
$function$;

revoke all on function public.register_android_device(text, text, text) from public, anon;
revoke all on function public.touch_android_device(text, text) from public, anon;
revoke all on function public.unregister_android_device(text) from public, anon;
revoke all on function public.my_android_devices() from public, anon;

grant execute on function public.register_android_device(text, text, text) to authenticated, service_role;
grant execute on function public.touch_android_device(text, text) to authenticated, service_role;
grant execute on function public.unregister_android_device(text) to authenticated, service_role;
grant execute on function public.my_android_devices() to authenticated, service_role;

comment on table public.mobile_devices is 'Authenticated mobile app installations and their push-notification delivery tokens.';
comment on column public.mobile_devices.android_device_id is 'App-generated installation UUID stored locally by the Android app; never use a hardware serial or IMEI.';
comment on column public.mobile_devices.fcm_token is 'Current Firebase Cloud Messaging registration token. Null when unavailable or unregistered.';
comment on function public.register_android_device(text, text, text) is 'Register or refresh the current authenticated user Android installation and FCM token.';
comment on function public.touch_android_device(text, text) is 'Update last-active time and optional app version for the current user installation.';
comment on function public.unregister_android_device(text) is 'Deactivate the current user installation and remove its push token on logout.';
