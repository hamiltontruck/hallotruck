begin;

-- Public Customer/Driver signup contact validation must not rely on browser checks.
-- This replaces the existing auth.users trigger function for future signups only.
create or replace function public.handle_new_driver()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role public.user_role;
  normalized_email text := lower(btrim(coalesce(new.email, '')));
  email_local text;
  email_domain text;
  domain_labels text[];
  domain_label text;
  compact_phone text := regexp_replace(
    btrim(coalesce(new.raw_user_meta_data ->> 'phone', '')),
    '[[:space:]()-]',
    '',
    'g'
  );
  normalized_phone text;
begin
  requested_role := case
    when new.raw_user_meta_data ->> 'role' = 'customer'
      then 'customer'::public.user_role
    else 'driver'::public.user_role
  end;

  if normalized_email = ''
     or length(normalized_email) > 254
     or length(normalized_email) - length(replace(normalized_email, '@', '')) <> 1 then
    raise exception 'Enter a valid email address, for example name@example.com.';
  end if;

  email_local := split_part(normalized_email, '@', 1);
  email_domain := split_part(normalized_email, '@', 2);

  if length(email_local) < 1
     or length(email_local) > 64
     or email_local !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+$'
     or email_local like '.%'
     or email_local like '%.'
     or position('..' in email_local) > 0 then
    raise exception 'Enter a valid email address, for example name@example.com.';
  end if;

  if length(email_domain) < 1
     or length(email_domain) > 253
     or email_domain like '.%'
     or email_domain like '%.'
     or position('..' in email_domain) > 0
     or email_domain !~ '^[A-Za-z0-9.-]+$' then
    raise exception 'Enter a valid email address, for example name@example.com.';
  end if;

  domain_labels := string_to_array(email_domain, '.');
  if coalesce(array_length(domain_labels, 1), 0) < 2
     or domain_labels[array_length(domain_labels, 1)] !~ '^[A-Za-z]{2,63}$' then
    raise exception 'Enter a valid email address, for example name@example.com.';
  end if;

  foreach domain_label in array domain_labels loop
    if length(domain_label) < 1
       or length(domain_label) > 63
       or domain_label !~ '^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$' then
      raise exception 'Enter a valid email address, for example name@example.com.';
    end if;
  end loop;

  -- Ethiopia mobile: Ethio telecom 09... and Safaricom Ethiopia 07...;
  -- accept national/international forms and normalize profiles.phone to 0xxxxxxxxx.
  if compact_phone !~ '^(\+251|251|0)?[79][0-9]{8}$' then
    raise exception 'Phone must be an Ethiopian mobile number: 09xxxxxxxx, 07xxxxxxxx, +2519xxxxxxxx or +2517xxxxxxxx.';
  end if;

  normalized_phone := case
    when compact_phone like '+251%' then '0' || substr(compact_phone, 5)
    when compact_phone like '251%' then '0' || substr(compact_phone, 4)
    when compact_phone like '7%' or compact_phone like '9%' then '0' || compact_phone
    else compact_phone
  end;

  insert into public.profiles (
    id,
    role,
    full_name,
    phone,
    driver_status
  )
  values (
    new.id,
    requested_role,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(normalized_email, '@', 1)
    ),
    normalized_phone,
    case
      when requested_role = 'driver'::public.user_role
        then 'pending'::public.driver_status
      else null
    end
  )
  on conflict (id) do nothing;

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', requested_role::text)
  where id = new.id;

  return new;
end;
$$;

revoke all on function public.handle_new_driver() from public, anon, authenticated;

commit;
