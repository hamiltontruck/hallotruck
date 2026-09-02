-- Keep the Issue #248 restoration path limited to legacy Bank / Telebirr-style
-- external references. Cash and modern auditable financial-correction refunds are not eligible.

create or replace function public.admin_restore_legacy_excess_refund(
  p_refund_payment_id uuid,
  p_amount_etb numeric,
  p_reason text,
  p_external_evidence_reference text,
  p_request_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_amount numeric := round(coalesce(p_amount_etb, 0), 2);
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_evidence text := nullif(btrim(coalesce(p_external_evidence_reference, '')), '');
  v_order_id uuid;
  v_source_amount numeric;
  v_source_event public.payment_event;
  v_source_provider text;
  v_source_reference text;
  v_source_payload jsonb;
  v_source_restored numeric := 0;
  v_source_remaining numeric := 0;
  v_raw_verified numeric := 0;
  v_existing_restorations numeric := 0;
  v_ledger_anomaly numeric := 0;
  v_correction_id uuid := gen_random_uuid();
begin
  if v_actor is null or not (select private.is_admin_or_ceo()) then
    raise exception 'Admin or CEO access required';
  end if;
  if p_request_key is null then
    raise exception 'Restoration request key is required';
  end if;
  if exists (
    select 1 from public.financial_corrections correction
    where correction.request_key = p_request_key
  ) then
    raise exception 'Restoration request was already processed';
  end if;
  if v_amount <= 0 then
    raise exception 'Restoration amount must be greater than zero';
  end if;
  if v_reason is null or char_length(v_reason) < 5 then
    raise exception 'Restoration reason must be at least 5 characters';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'Restoration reason must be 500 characters or fewer';
  end if;
  if v_evidence is null or char_length(v_evidence) < 3 then
    raise exception 'External evidence reference is required';
  end if;
  if char_length(v_evidence) > 200 then
    raise exception 'External evidence reference must be 200 characters or fewer';
  end if;

  select payment.order_id, payment.amount_etb, payment.event,
         payment.provider, payment.provider_ref, payment.raw_payload
  into v_order_id, v_source_amount, v_source_event,
       v_source_provider, v_source_reference, v_source_payload
  from public.payments payment
  join public.orders payment_order on payment_order.id = payment.order_id
  where payment.id = p_refund_payment_id
  for update of payment, payment_order;

  if not found then raise exception 'Refund payment not found'; end if;
  if v_source_event <> 'refunded' then
    raise exception 'Only a refunded payment can be restored';
  end if;
  if lower(btrim(coalesce(v_source_provider, ''))) = 'financial_correction'
    or coalesce(v_source_payload, '{}'::jsonb) ? 'correction_id' then
    raise exception 'Auditable financial-correction refunds cannot be restored with the legacy workflow';
  end if;
  if not private.is_external_payment_reference(v_source_provider, v_source_reference) then
    raise exception 'Legacy restoration requires an external Bank / Telebirr payment reference';
  end if;

  select coalesce(sum(correction.amount_etb), 0)
  into v_source_restored
  from public.financial_corrections correction
  where correction.source_payment_id = p_refund_payment_id
    and correction.correction_type = 'legacy_refund_restoration';

  v_source_remaining := greatest(round(v_source_amount - v_source_restored, 2), 0);
  if v_source_remaining <= 0 then
    raise exception 'This legacy refund has already been fully restored';
  end if;

  select coalesce(sum(case
    when payment.event in ('held_escrow', 'released') then payment.amount_etb
    when payment.event = 'refunded' then -payment.amount_etb
    else 0 end), 0)
  into v_raw_verified
  from public.payments payment
  where payment.order_id = v_order_id;

  v_existing_restorations := private.legacy_refund_restoration_total(v_order_id);
  v_ledger_anomaly := greatest(round(-(v_raw_verified + v_existing_restorations), 2), 0);

  if v_ledger_anomaly <= 0 then
    raise exception 'This order has no excess-refund ledger anomaly to restore';
  end if;
  if v_amount > v_ledger_anomaly + 0.005 then
    raise exception 'Restoration exceeds the current ledger anomaly by ETB %',
      round(v_amount - v_ledger_anomaly, 2);
  end if;
  if v_amount > v_source_remaining + 0.005 then
    raise exception 'Restoration exceeds the remaining legacy refund amount by ETB %',
      round(v_amount - v_source_remaining, 2);
  end if;

  insert into public.financial_corrections(
    id, request_key, correction_type, source_payment_id, refund_payment_id,
    partner_earning_id, partner_settlement_id, order_id, driver_id, partner_id,
    amount_etb, driver_commission_reversal_etb, partner_gross_reversal_etb,
    partner_commission_reversal_etb, partner_net_reversal_etb,
    reason, actor_id, external_evidence_reference
  ) values (
    v_correction_id, p_request_key, 'legacy_refund_restoration',
    p_refund_payment_id, null, null, null, v_order_id, null, null,
    v_amount, 0, 0, 0, 0,
    v_reason, v_actor, v_evidence
  );

  perform public.recompute_order_payment_status(v_order_id);
  return v_correction_id;
end;
$$;

revoke all on function public.admin_restore_legacy_excess_refund(uuid, numeric, text, text, uuid)
  from public, anon;
grant execute on function public.admin_restore_legacy_excess_refund(uuid, numeric, text, text, uuid)
  to authenticated;

notify pgrst, 'reload schema';
