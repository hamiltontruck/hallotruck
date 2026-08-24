create or replace function public.order_payment_financial_summary(p_order_id uuid)
returns table(
  invoice_total_etb numeric,
  initiated_etb numeric,
  held_escrow_etb numeric,
  released_etb numeric,
  refunded_etb numeric,
  verified_net_etb numeric,
  pending_verification_etb numeric,
  balance_due_etb numeric,
  customer_credit_etb numeric,
  ledger_anomaly_etb numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() ->> 'role', '');
  v_customer uuid;
  v_driver uuid;
begin
  select o.customer_id, o.driver_id into v_customer, v_driver
  from public.orders o where o.id = p_order_id;
  if not found then raise exception 'Order not found'; end if;
  if v_uid is null and v_role <> 'service_role' then raise exception 'Authentication required'; end if;
  if v_role not in ('admin','ceo','service_role')
    and v_uid is distinct from v_customer
    and v_uid is distinct from v_driver then
    raise exception 'You cannot view this order payment summary';
  end if;

  return query
  with totals as (
    select coalesce(o.price_etb, 0)::numeric as invoice_total,
      coalesce(sum(p.amount_etb) filter (where p.event = 'initiated'), 0)::numeric as initiated,
      coalesce(sum(p.amount_etb) filter (where p.event = 'held_escrow'), 0)::numeric as held,
      coalesce(sum(p.amount_etb) filter (where p.event = 'released'), 0)::numeric as released,
      coalesce(sum(p.amount_etb) filter (where p.event = 'refunded'), 0)::numeric as refunded
    from public.orders o left join public.payments p on p.order_id = o.id
    where o.id = p_order_id group by o.id, o.price_etb
  ), calculated as (
    select *, released + held - refunded as raw_verified from totals
  )
  select invoice_total, initiated, held, released, refunded,
    greatest(0, raw_verified), greatest(0, initiated),
    greatest(0, invoice_total - greatest(0, raw_verified)),
    greatest(0, greatest(0, raw_verified) - invoice_total),
    greatest(0, -raw_verified)
  from calculated;
end;
$$;

grant execute on function public.order_payment_financial_summary(uuid) to authenticated;

create or replace function public.recompute_order_payment_status(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total numeric;
  v_released numeric;
  v_held numeric;
  v_refunded numeric;
  v_verified numeric;
  v_has_refund boolean;
begin
  select coalesce(price_etb, 0) into v_total
  from public.orders where id = p_order_id for update;
  if not found then return; end if;

  select coalesce(sum(amount_etb) filter (where event = 'released'), 0),
    coalesce(sum(amount_etb) filter (where event = 'held_escrow'), 0),
    coalesce(sum(amount_etb) filter (where event = 'refunded'), 0),
    exists(select 1 from public.payments p2 where p2.order_id = p_order_id and p2.event = 'refunded')
  into v_released, v_held, v_refunded, v_has_refund
  from public.payments where order_id = p_order_id;

  v_verified := greatest(0, v_released + v_held - v_refunded);
  update public.orders
  set payment_status = case
    when v_total > 0 and v_verified >= v_total then 'released'::public.payment_status
    when v_verified > 0 then 'held_escrow'::public.payment_status
    when v_has_refund then 'refunded'::public.payment_status
    else 'unpaid'::public.payment_status
  end
  where id = p_order_id;
end;
$$;

create or replace function public.admin_review_customer_payment(
  p_payment_id uuid,
  p_approve boolean,
  p_rejection_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_event public.payment_event;
  v_order_id uuid;
  v_order_status public.order_status;
  v_order_total numeric;
  v_payment_amount numeric;
  v_source text;
  v_collection_method text;
  v_receipt_path text;
  v_reason text := nullif(btrim(coalesce(p_rejection_reason, '')), '');
  v_driver_collection boolean;
  v_committed_excluding_current numeric;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') not in ('admin', 'ceo') then
    raise exception 'Admin or CEO role required';
  end if;

  select p.event, p.order_id, p.amount_etb,
    coalesce(p.raw_payload ->> 'source', ''),
    lower(coalesce(p.raw_payload ->> 'collection_method', '')),
    p.receipt_path, o.status, coalesce(o.price_etb, 0)
  into v_event, v_order_id, v_payment_amount, v_source,
    v_collection_method, v_receipt_path, v_order_status, v_order_total
  from public.payments p join public.orders o on o.id = p.order_id
  where p.id = p_payment_id for update of p, o;

  if not found then raise exception 'Payment not found'; end if;
  if v_event <> 'initiated' then raise exception 'Only initiated payments can be reviewed'; end if;
  v_driver_collection := v_source = 'driver_collection';

  if p_approve then
    if v_driver_collection and v_order_status <> 'delivered' then
      raise exception 'Driver-collected payment can only be verified after delivery';
    end if;
    if not (v_driver_collection and v_collection_method = 'cash')
      and nullif(btrim(coalesce(v_receipt_path, '')), '') is null then
      raise exception 'Payment evidence is required before approval';
    end if;

    select coalesce(sum(case
      when p.event in ('held_escrow','released') then p.amount_etb
      when p.event = 'refunded' then -p.amount_etb else 0 end), 0)
    into v_committed_excluding_current
    from public.payments p
    where p.order_id = v_order_id and p.id <> p_payment_id;

    if v_committed_excluding_current + v_payment_amount > v_order_total + 0.005 then
      raise exception 'Approval exceeds the remaining invoice balance by ETB %',
        (v_committed_excluding_current + v_payment_amount - v_order_total);
    end if;

    update public.payments
    set event = case when v_driver_collection then 'released'::public.payment_event else 'held_escrow'::public.payment_event end,
      reviewed_by = v_actor, reviewed_at = now(), rejection_reason = null
    where id = p_payment_id;
  else
    if v_reason is null or char_length(v_reason) < 5 then
      raise exception 'Write a rejection reason of at least 5 characters';
    end if;
    if char_length(v_reason) > 500 then
      raise exception 'Rejection reason must be 500 characters or fewer';
    end if;
    update public.payments
    set event = 'failed', reviewed_by = v_actor, reviewed_at = now(), rejection_reason = v_reason
    where id = p_payment_id;
    update public.customer_dispatch_requests
    set status = 'expired', updated_at = now()
    where order_id = v_order_id and status = 'requested';
  end if;

  perform public.recompute_order_payment_status(v_order_id);
end;
$$;

create or replace function public.admin_update_payment_event(p_payment_id uuid, p_event public.payment_event)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_current public.payment_event;
  v_amount numeric;
  v_provider text;
  v_driver_id uuid;
  v_order_total numeric;
  v_order_status public.order_status;
  v_committed_excluding_current numeric;
begin
  if coalesce(auth.jwt()->'app_metadata'->>'role', '') not in ('admin', 'ceo') then
    raise exception 'Admin or CEO role required';
  end if;

  select p.order_id, p.event, p.amount_etb, p.provider, o.driver_id, coalesce(o.price_etb,0), o.status
  into v_order_id, v_current, v_amount, v_provider, v_driver_id, v_order_total, v_order_status
  from public.payments p join public.orders o on o.id = p.order_id
  where p.id = p_payment_id for update of p, o;

  if not found then raise exception 'Payment not found'; end if;
  if not (
    (v_current = 'initiated' and p_event in ('held_escrow', 'failed')) or
    (v_current = 'held_escrow' and p_event in ('released', 'refunded')) or
    (v_current = 'released' and p_event = 'refunded') or
    v_current = p_event
  ) then raise exception 'Invalid payment transition: % to %', v_current, p_event; end if;

  if p_event in ('held_escrow','released') and v_current is distinct from p_event then
    if p_event = 'released' and v_order_status <> 'delivered' then
      raise exception 'Payment can only be released after the order is delivered';
    end if;
    if p_event = 'released'
      and lower(btrim(coalesce(v_provider, ''))) not in ('cash', 'cash_to_driver', 'driver_cash')
      and not exists (
        select 1 from public.driver_payment_confirmations c
        where c.payment_id = p_payment_id and c.order_id = v_order_id and c.driver_id = v_driver_id
      ) then
      raise exception 'Assigned driver confirmation is required before releasing this payment';
    end if;

    select coalesce(sum(case
      when p.event in ('held_escrow','released') then p.amount_etb
      when p.event = 'refunded' then -p.amount_etb else 0 end),0)
    into v_committed_excluding_current
    from public.payments p
    where p.order_id = v_order_id and p.id <> p_payment_id;

    if v_committed_excluding_current + v_amount > v_order_total + 0.005 then
      raise exception 'Payment transition exceeds invoice total by ETB %',
        (v_committed_excluding_current + v_amount - v_order_total);
    end if;
  end if;

  update public.payments set event = p_event where id = p_payment_id;
  if p_event = 'released' then
    update public.driver_payment_confirmations
    set released_at = coalesce(released_at, now())
    where payment_id = p_payment_id;
  end if;
  perform public.recompute_order_payment_status(v_order_id);
end;
$$;

create or replace function public.admin_record_payment(
  p_order_id uuid,
  p_provider text,
  p_provider_ref text,
  p_amount_etb numeric,
  p_event public.payment_event
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id uuid;
  v_order_total numeric;
  v_order_status public.order_status;
  v_committed numeric;
  v_provider text := btrim(coalesce(p_provider,''));
  v_reference text := nullif(btrim(coalesce(p_provider_ref,'')), '');
begin
  if coalesce(auth.jwt()->'app_metadata'->>'role', '') not in ('admin', 'ceo') then
    raise exception 'Admin or CEO role required';
  end if;
  if p_amount_etb is null or p_amount_etb <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  if v_provider = '' then raise exception 'Payment provider is required'; end if;
  if p_event not in ('initiated','held_escrow','released') then
    raise exception 'Use the dedicated refund action for refunds';
  end if;

  select coalesce(price_etb,0), status into v_order_total, v_order_status
  from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;

  select id into v_payment_id
  from public.payments
  where order_id=p_order_id and lower(provider)=lower(v_provider)
    and coalesce(lower(btrim(provider_ref)),'')=coalesce(lower(v_reference),'')
    and amount_etb=p_amount_etb and event in ('initiated','held_escrow')
  order by created_at desc limit 1 for update;
  if v_payment_id is not null then
    perform public.admin_update_payment_event(v_payment_id,p_event);
    return;
  end if;

  if v_reference is not null and exists(
    select 1 from public.payments p
    where lower(btrim(p.provider))=lower(v_provider)
      and lower(btrim(coalesce(p.provider_ref,'')))=lower(v_reference)
  ) then raise exception 'Transaction ID already exists for this provider: %',v_reference; end if;

  if p_event='released' and lower(v_provider) not in ('cash','cash_to_driver','driver_cash') then
    raise exception 'Non-cash payments must be verified and driver-confirmed before release';
  end if;
  if p_event='released' and v_order_status<>'delivered' then
    raise exception 'Payment can only be released after delivery';
  end if;

  select coalesce(sum(case
    when event in ('held_escrow','released') then amount_etb
    when event='refunded' then -amount_etb else 0 end),0)
  into v_committed from public.payments where order_id=p_order_id;

  if p_event in ('held_escrow','released') and v_committed+p_amount_etb>v_order_total+0.005 then
    raise exception 'Payment exceeds remaining invoice balance by ETB %',(v_committed+p_amount_etb-v_order_total);
  end if;

  insert into public.payments(order_id,provider,provider_ref,amount_etb,event)
  values(p_order_id,v_provider,v_reference,p_amount_etb,p_event);
  update public.orders set payment_provider=v_provider,payment_ref=v_reference where id=p_order_id;
  perform public.recompute_order_payment_status(p_order_id);
end;
$$;

create or replace function public.admin_refund_order_credit(p_order_id uuid)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_total numeric;
  v_verified_total numeric;
  v_credit numeric;
  v_ref text;
begin
  if coalesce(auth.jwt()->'app_metadata'->>'role', '') not in ('admin', 'ceo') then
    raise exception 'Admin or CEO role required';
  end if;
  select coalesce(price_etb,0) into v_order_total
  from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;

  select greatest(0,coalesce(sum(case
    when event in ('held_escrow','released') then amount_etb
    when event='refunded' then -amount_etb else 0 end),0))
  into v_verified_total from public.payments where order_id=p_order_id;

  v_credit:=greatest(0,v_verified_total-v_order_total);
  if v_credit<=0 then raise exception 'No overpayment credit is available to refund'; end if;
  v_ref:='REFUND-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  insert into public.payments(order_id,provider,provider_ref,amount_etb,event,raw_payload)
  values(p_order_id,'credit_refund',v_ref,v_credit,'refunded',jsonb_build_object('source','admin_credit_refund','refunded_by',auth.uid()));
  perform public.recompute_order_payment_status(p_order_id);
  return v_credit;
end;
$$;

create or replace function public.admin_payment_integrity_report()
returns table(
  order_id uuid,
  tracking_id text,
  invoice_total_etb numeric,
  verified_net_etb numeric,
  pending_etb numeric,
  balance_due_etb numeric,
  customer_credit_etb numeric,
  ledger_anomaly_etb numeric,
  issue text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt()->'app_metadata'->>'role','') not in ('admin','ceo') then
    raise exception 'Admin or CEO role required';
  end if;
  return query
  with totals as (
    select o.id,o.tracking_id,coalesce(o.price_etb,0)::numeric invoice_total,
      coalesce(sum(p.amount_etb) filter(where p.event='initiated'),0)::numeric initiated,
      coalesce(sum(p.amount_etb) filter(where p.event='held_escrow'),0)::numeric held,
      coalesce(sum(p.amount_etb) filter(where p.event='released'),0)::numeric released,
      coalesce(sum(p.amount_etb) filter(where p.event='refunded'),0)::numeric refunded
    from public.orders o left join public.payments p on p.order_id=o.id
    group by o.id,o.tracking_id,o.price_etb
  ), calc as (
    select *, released+held-refunded raw_verified from totals
  )
  select id,tracking_id,invoice_total,greatest(0,raw_verified),greatest(0,initiated),
    greatest(0,invoice_total-greatest(0,raw_verified)),
    greatest(0,greatest(0,raw_verified)-invoice_total),greatest(0,-raw_verified),
    case
      when raw_verified<0 then 'Refunds exceed verified funds'
      when raw_verified>invoice_total+0.005 then 'Verified funds exceed invoice total'
      when initiated+greatest(0,raw_verified)>invoice_total+0.005 then 'Pending plus verified funds exceed invoice total'
      else 'OK'
    end
  from calc
  where raw_verified<0 or raw_verified>invoice_total+0.005
     or initiated+greatest(0,raw_verified)>invoice_total+0.005
  order by tracking_id;
end;
$$;

grant execute on function public.admin_payment_integrity_report() to authenticated;
notify pgrst, 'reload schema';
