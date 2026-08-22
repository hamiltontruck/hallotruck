create or replace function public.customer_submit_payment(
  p_order_id uuid,
  p_provider text,
  p_provider_ref text,
  p_amount_etb numeric,
  p_receipt_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_price numeric;
  v_committed numeric := 0;
  v_remaining numeric := 0;
  v_existing_id uuid;
  v_existing_order_id uuid;
  v_existing_event public.payment_event;
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

  if nullif(btrim(p_receipt_path), '') is null then
    raise exception 'Payment receipt is required';
  end if;

  if split_part(btrim(p_receipt_path), '/', 1) <> auth.uid()::text then
    raise exception 'Invalid payment receipt path';
  end if;

  if not exists (
    select 1 from storage.objects so
    where so.bucket_id = 'payment-receipts'
      and so.name = btrim(p_receipt_path)
  ) then
    raise exception 'Payment receipt upload was not found';
  end if;

  select p.id, p.order_id, p.event
    into v_existing_id, v_existing_order_id, v_existing_event
  from public.payments p
  where lower(btrim(p.provider)) = lower(btrim(p_provider))
    and lower(btrim(coalesce(p.provider_ref, ''))) = lower(btrim(p_provider_ref))
  order by p.created_at desc
  limit 1
  for update;

  select coalesce(sum(
    case
      when p.event in ('initiated', 'held_escrow', 'released') then p.amount_etb
      when p.event = 'refunded' then -p.amount_etb
      else 0
    end
  ), 0)
  into v_committed
  from public.payments p
  where p.order_id = p_order_id
    and (v_existing_id is null or p.id <> v_existing_id);

  v_remaining := greatest(0, coalesce(v_price, 0) - v_committed);

  if p_amount_etb > v_remaining + 0.005 then
    raise exception 'Payment amount exceeds the remaining invoice balance of ETB %', v_remaining;
  end if;

  if v_existing_id is not null then
    if v_existing_order_id = p_order_id and v_existing_event = 'failed' then
      update public.payments
      set amount_etb = p_amount_etb,
          receipt_path = btrim(p_receipt_path),
          event = 'initiated',
          raw_payload = jsonb_build_object(
            'submitted_by', auth.uid(),
            'source', 'customer_portal',
            'receipt_path', btrim(p_receipt_path),
            'resubmitted_at', now()
          ),
          created_at = now()
      where id = v_existing_id;

      update public.orders
      set payment_provider = btrim(p_provider),
          payment_ref = btrim(p_provider_ref)
      where id = p_order_id;
      return;
    end if;

    raise exception 'Transaction ID already exists for this provider: %', btrim(p_provider_ref);
  end if;

  insert into public.payments (
    order_id,
    provider,
    provider_ref,
    amount_etb,
    event,
    receipt_path,
    raw_payload
  ) values (
    p_order_id,
    btrim(p_provider),
    btrim(p_provider_ref),
    p_amount_etb,
    'initiated',
    btrim(p_receipt_path),
    jsonb_build_object(
      'submitted_by', auth.uid(),
      'source', 'customer_portal',
      'receipt_path', btrim(p_receipt_path)
    )
  );

  update public.orders
  set payment_provider = btrim(p_provider),
      payment_ref = btrim(p_provider_ref)
  where id = p_order_id;
end;
$$;

revoke all on function public.customer_submit_payment(uuid, text, text, numeric) from public, anon, authenticated;
revoke all on function public.customer_submit_payment(uuid, text, text, numeric, text) from public, anon;
grant execute on function public.customer_submit_payment(uuid, text, text, numeric, text) to authenticated;
