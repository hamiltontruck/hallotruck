-- Remove receipt/screenshot evidence from the simplified Customer–Driver Bank/Telebirr flow.
-- Existing invoice-total, review metadata, and non-simplified workflow controls remain intact.

begin;

create or replace function public.prepare_payment_review_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order_total numeric;
  v_other_verified numeric;
  v_selected_method text;
  v_actor uuid := auth.uid();
  v_is_verification boolean := false;
  v_is_rejection boolean := false;
  v_is_resubmission boolean := false;
begin
  if tg_op = 'INSERT' then
    v_is_verification := new.event = 'held_escrow';
    v_is_rejection := new.event = 'failed';
  else
    v_is_verification := old.event = 'initiated'
      and new.event = 'held_escrow'
      and old.event is distinct from new.event;
    v_is_rejection := old.event = 'initiated'
      and new.event = 'failed'
      and old.event is distinct from new.event;
    v_is_resubmission := old.event = 'failed'
      and new.event = 'initiated'
      and old.event is distinct from new.event;
  end if;

  if v_is_verification then
    select
      coalesce(trip_order.price_etb, 0),
      trip_order.selected_payment_method,
      coalesce((
        select sum(
          case
            when other.event in ('held_escrow', 'released') then other.amount_etb
            when other.event = 'refunded' then -other.amount_etb
            else 0
          end
        )
        from public.payments other
        where other.order_id = trip_order.id
          and other.id <> new.id
      ), 0)
    into v_order_total, v_selected_method, v_other_verified
    from public.orders trip_order
    where trip_order.id = new.order_id;

    if not found then
      raise exception 'Order not found for payment review';
    end if;

    if lower(replace(btrim(coalesce(new.provider, '')), ' ', '_'))
         not in ('cash', 'cash_to_driver', 'driver_cash')
       and v_selected_method <> 'bank_telebirr'
       and nullif(btrim(coalesce(new.receipt_path, '')), '') is null
    then
      raise exception 'A customer receipt is required for this legacy non-cash workflow';
    end if;

    if v_other_verified + new.amount_etb > v_order_total + 0.005 then
      raise exception 'Verified payment would exceed the invoice total by ETB %',
        round(v_other_verified + new.amount_etb - v_order_total, 2);
    end if;

    if v_selected_method = 'bank_telebirr' then
      new.raw_payload := coalesce(new.raw_payload, '{}'::jsonb)
        || jsonb_build_object(
          'workflow', 'simplified_customer_driver',
          'customer_evidence_required', false
        );
    end if;

    new.reviewed_by := coalesce(new.reviewed_by, v_actor);
    new.reviewed_at := coalesce(new.reviewed_at, now());
    new.rejection_reason := null;
  elsif v_is_rejection then
    if nullif(btrim(coalesce(new.rejection_reason, '')), '') is null then
      raise exception 'A rejection reason is required';
    end if;
    new.rejection_reason := btrim(new.rejection_reason);
    new.reviewed_by := coalesce(new.reviewed_by, v_actor);
    new.reviewed_at := coalesce(new.reviewed_at, now());
  elsif v_is_resubmission then
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.rejection_reason := null;
  end if;

  return new;
end;
$function$;

notify pgrst, 'reload schema';

commit;
