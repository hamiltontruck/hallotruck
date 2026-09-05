begin;

create or replace function private.enforce_delivery_reconciliation_on_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'delivered'::public.order_status then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  if not exists (
    select 1
    from public.delivery_proofs proof
    where proof.order_id = new.id
      and nullif(btrim(proof.recipient_name), '') is not null
      and nullif(btrim(proof.photo_path), '') is not null
      and nullif(btrim(proof.signature_path), '') is not null
  ) then
    raise exception 'Delivery completion requires receiver name, delivery photo and signature.'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.driver_trip_payment_results result
    where result.order_id = new.id
  ) then
    raise exception 'Delivery completion requires a trip payment result before commit.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_delivery_reconciliation_on_completion()
from public, anon, authenticated;

drop trigger if exists orders_require_delivery_reconciliation_on_completion on public.orders;
create constraint trigger orders_require_delivery_reconciliation_on_completion
after insert or update of status on public.orders
deferrable initially deferred
for each row
execute function private.enforce_delivery_reconciliation_on_completion();

notify pgrst, 'reload schema';

commit;
