create or replace function public.enforce_delivery_proof_before_delivered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transitioning_to_delivered boolean := false;
begin
  if new.status = 'delivered'::public.order_status then
    if tg_op = 'INSERT' then
      v_transitioning_to_delivered := true;
    elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
      v_transitioning_to_delivered := true;
    end if;
  end if;

  if v_transitioning_to_delivered and not exists (
    select 1
    from public.delivery_proofs proof
    where proof.order_id = new.id
      and nullif(btrim(proof.recipient_name), '') is not null
      and nullif(btrim(proof.photo_path), '') is not null
      and nullif(btrim(proof.signature_path), '') is not null
  ) then
    raise exception 'Delivery proof with receiver name, photo and signature is required before marking an order delivered.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_delivery_proof_before_delivered()
from public, anon, authenticated;

drop trigger if exists orders_require_delivery_proof_before_delivered on public.orders;
create trigger orders_require_delivery_proof_before_delivered
before insert or update of status on public.orders
for each row
execute function public.enforce_delivery_proof_before_delivered();

create or replace function public.admin_transition_order(
  p_order_id uuid,
  p_status public.order_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.order_status;
  v_truck uuid;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') not in ('admin', 'ceo') then
    raise exception 'Admin or CEO role required';
  end if;

  if p_status = 'delivered'::public.order_status then
    raise exception 'Use the proof-of-delivery workflow to complete this order.';
  end if;

  select status, truck_id
  into v_current, v_truck
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if not (
    (v_current = 'placed'::public.order_status and p_status = 'accepted'::public.order_status)
    or (v_current = 'accepted'::public.order_status and p_status = 'in_transit'::public.order_status)
  ) then
    raise exception 'Invalid status transition: % to %', v_current, p_status;
  end if;

  if p_status = 'accepted'::public.order_status and v_truck is null then
    raise exception 'Assign a truck and driver first';
  end if;

  update public.orders
  set
    status = p_status,
    accepted_at = case
      when p_status = 'accepted'::public.order_status then coalesce(accepted_at, now())
      else accepted_at
    end
  where id = p_order_id;
end;
$$;

create or replace function public.complete_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  raise exception 'Direct completion is disabled. Submit receiver name, delivery photo and signature.';
end;
$$;

revoke all on function public.complete_order(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
