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
    select
      o.id as order_key,
      o.tracking_id as tracking_key,
      coalesce(o.price_etb,0)::numeric as invoice_total,
      coalesce(sum(p.amount_etb) filter(where p.event='initiated'),0)::numeric as initiated_total,
      coalesce(sum(p.amount_etb) filter(where p.event='held_escrow'),0)::numeric as held_total,
      coalesce(sum(p.amount_etb) filter(where p.event='released'),0)::numeric as released_total,
      coalesce(sum(p.amount_etb) filter(where p.event='refunded'),0)::numeric as refunded_total
    from public.orders o
    left join public.payments p on p.order_id=o.id
    group by o.id,o.tracking_id,o.price_etb
  ), calc as (
    select totals.*, released_total+held_total-refunded_total as raw_verified
    from totals
  )
  select
    calc.order_key,
    calc.tracking_key,
    calc.invoice_total,
    greatest(0,calc.raw_verified),
    greatest(0,calc.initiated_total),
    greatest(0,calc.invoice_total-greatest(0,calc.raw_verified)),
    greatest(0,greatest(0,calc.raw_verified)-calc.invoice_total),
    greatest(0,-calc.raw_verified),
    case
      when calc.raw_verified<0 then 'Refunds exceed verified funds'
      when calc.raw_verified>calc.invoice_total+0.005 then 'Verified funds exceed invoice total'
      when calc.initiated_total+greatest(0,calc.raw_verified)>calc.invoice_total+0.005 then 'Pending plus verified funds exceed invoice total'
      else 'OK'
    end
  from calc
  where calc.raw_verified<0
     or calc.raw_verified>calc.invoice_total+0.005
     or calc.initiated_total+greatest(0,calc.raw_verified)>calc.invoice_total+0.005
  order by calc.tracking_key;
end;
$$;

grant execute on function public.admin_payment_integrity_report() to authenticated;
notify pgrst, 'reload schema';
