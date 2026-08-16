create or replace function public.customer_update_profile(
  p_full_name text,
  p_phone text,
  p_email text default null,
  p_home_address text default null,
  p_customer_type text default 'individual',
  p_company_name text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_full_name text := btrim(coalesce(p_full_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
  v_home_address text := nullif(btrim(coalesce(p_home_address, '')), '');
  v_customer_type text := lower(btrim(coalesce(p_customer_type, 'individual')));
  v_company_name text := nullif(btrim(coalesce(p_company_name, '')), '');
begin
  if v_user_id is null then
    raise exception 'Customer session expired.' using errcode = '28000';
  end if;

  if char_length(v_full_name) < 2 then
    raise exception 'Enter your full name.' using errcode = '22023';
  end if;

  if v_phone !~ '^(09[0-9]{8}|\+2519[0-9]{8})$' then
    raise exception 'Phone must be 09xxxxxxxx or +2519xxxxxxxx.' using errcode = '22023';
  end if;

  if v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;

  if v_customer_type not in ('individual', 'business') then
    raise exception 'Invalid customer type.' using errcode = '22023';
  end if;

  if v_customer_type = 'business' and v_company_name is null then
    raise exception 'Company name is required for a business account.' using errcode = '22023';
  end if;

  update public.profiles
  set
    full_name = v_full_name,
    phone = v_phone,
    email = v_email,
    home_address = v_home_address,
    customer_type = v_customer_type,
    company_name = case when v_customer_type = 'business' then v_company_name else null end
  where id = v_user_id
    and role::text = 'customer';

  if not found then
    raise exception 'Customer profile not found.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.customer_update_profile(text, text, text, text, text, text) from public;
revoke all on function public.customer_update_profile(text, text, text, text, text, text) from anon;
grant execute on function public.customer_update_profile(text, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
