create or replace function public.normalize_customer_contact()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  compact_phone text;
  normalized_email text;
begin
  compact_phone := regexp_replace(
    trim(coalesce(new.phone, '')),
    '[[:space:]()-]',
    '',
    'g'
  );

  if compact_phone !~ '^(\+251|251|0)?9[0-9]{8}$' then
    raise exception using
      errcode = '22023',
      message = 'Phone must be an Ethiopian mobile number: 09xxxxxxxx or +2519xxxxxxxx.';
  end if;

  if compact_phone like '+251%' then
    new.phone := '0' || substr(compact_phone, 5);
  elsif compact_phone like '251%' then
    new.phone := '0' || substr(compact_phone, 4);
  elsif compact_phone like '9%' then
    new.phone := '0' || compact_phone;
  else
    new.phone := compact_phone;
  end if;

  normalized_email := lower(trim(coalesce(new.email, '')));

  if normalized_email = '' then
    new.email := null;
  elsif length(normalized_email) > 254
    or normalized_email !~ '^[^[:space:]@]{1,64}@[^[:space:]@.]{1,190}\.[A-Za-z]{2,63}$' then
    raise exception using
      errcode = '22023',
      message = 'Enter a valid email address, for example name@example.com.';
  else
    new.email := normalized_email;
  end if;

  return new;
end;
$$;

drop trigger if exists customers_normalize_contact on public.customers;

create trigger customers_normalize_contact
before insert or update of phone, email on public.customers
for each row
execute function public.normalize_customer_contact();

revoke all on function public.normalize_customer_contact() from public, anon, authenticated;
