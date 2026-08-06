-- Customer payment submission for smart logistics orders
create or replace function public.customer_submit_payment(
  p_order_id uuid,
  p_provider text,
  p_provider_ref text,
  p_amount_etb numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_price numeric;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select customer_id, price_etb
    into v_customer_id, v_price
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_customer_id <> auth.uid() then
    raise exception 'You can only submit payment for your own order';
  end if;

  if nullif(btrim(p_provider), '') is null then
    raise exception 'Payment provider is required';
  end if;

  if nullif(btrim(p_provider_ref), '') is null then
    raise exception 'Transaction reference is required';
  end if;

  if p_amount_etb <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  if v_price is not null and p_amount_etb > v_price then
    raise exception 'Payment amount cannot exceed the order total';
  end if;

  if exists (
    select 1
    from public.payments
    where order_id = p_order_id
      and provider = btrim(p_provider)
      and provider_ref = btrim(p_provider_ref)
  ) then
    raise exception 'This transaction reference has already been submitted';
  end if;

  insert into public.payments (
    order_id,
    provider,
    provider_ref,
    amount_etb,
    event,
    raw_payload
  ) values (
    p_order_id,
    btrim(p_provider),
    btrim(p_provider_ref),
    p_amount_etb,
    'initiated',
    jsonb_build_object('submitted_by', auth.uid(), 'source', 'customer_portal')
  );

  update public.orders
  set payment_provider = btrim(p_provider),
      payment_ref = btrim(p_provider_ref)
  where id = p_order_id;
end;
$$;

revoke all on function public.customer_submit_payment(uuid,text,text,numeric) from public, anon;
grant execute on function public.customer_submit_payment(uuid,text,text,numeric) to authenticated;
