-- CEO KPI hardening: exact leadership-only aggregates without browser bulk loading.
create or replace function public.admin_ceo_kpi_v1_report()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
  v_today date := (pg_catalog.timezone('Africa/Addis_Ababa', pg_catalog.now()))::date;
begin
  if auth.uid() is null or not (select private.is_admin_or_ceo()) then
    raise exception 'Admin or CEO access required';
  end if;

  select jsonb_build_object(
    'partnerCommission', coalesce((
      select sum(greatest(
        coalesce(e.hallo_commission_etb, 0) - coalesce(c.partner_commission_reversal_etb, 0),
        0
      ))
      from public.partner_freight_earnings e
      left join lateral (
        select sum(fc.partner_commission_reversal_etb) as partner_commission_reversal_etb
        from public.financial_corrections fc
        where fc.partner_earning_id = e.id
      ) c on true
      where e.status <> 'reversed'
    ), 0),
    'pendingPartnerSettlements', (
      select count(*)
      from public.partner_settlements s
      where s.status in ('pending', 'under_review', 'approved', 'partially_paid')
        and not exists (
          select 1 from public.financial_corrections fc
          where fc.partner_settlement_id = s.id
        )
    ),
    'pendingPartnerSettlementAmount', coalesce((
      select sum(greatest(
        coalesce(s.amount_etb, 0) - coalesce(p.paid_etb, 0),
        0
      ))
      from public.partner_settlements s
      left join lateral (
        select sum(sp.amount_etb) as paid_etb
        from public.partner_settlement_payments sp
        where sp.settlement_id = s.id
      ) p on true
      where s.status in ('pending', 'under_review', 'approved', 'partially_paid')
        and not exists (
          select 1 from public.financial_corrections fc
          where fc.partner_settlement_id = s.id
        )
    ), 0),
    'expiringDocuments', (
      select count(*)
      from public.driver_verification_files d
      where d.expiry_date is not null
        and d.expiry_date >= v_today
        and d.expiry_date <= v_today + 30
    ),
    'topCustomers', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.order_count desc, x.customer_name)
      from (
        select coalesce(nullif(btrim(o.customer_name), ''), 'Unknown') as customer_name,
               count(*) as order_count
        from public.orders o
        group by 1
        order by 2 desc, 1
        limit 5
      ) x
    ), '[]'::jsonb),
    'topRoutes', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.order_count desc, x.pickup_address, x.dropoff_address)
      from (
        select coalesce(nullif(btrim(o.pickup_address), ''), 'Unknown') as pickup_address,
               coalesce(nullif(btrim(o.dropoff_address), ''), 'Unknown') as dropoff_address,
               count(*) as order_count
        from public.orders o
        group by 1, 2
        order by 3 desc, 1, 2
        limit 5
      ) x
    ), '[]'::jsonb),
    'topPartners', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.gross_etb desc, x.partner_id)
      from (
        select e.partner_id,
               coalesce(sum(greatest(coalesce(e.gross_etb, 0) - coalesce(c.partner_gross_reversal_etb, 0), 0)), 0) as gross_etb,
               coalesce(sum(greatest(coalesce(e.hallo_commission_etb, 0) - coalesce(c.partner_commission_reversal_etb, 0), 0)), 0) as hallo_commission_etb,
               count(*) filter (
                 where greatest(coalesce(e.gross_etb, 0) - coalesce(c.partner_gross_reversal_etb, 0), 0) > 0
               ) as freight_count
        from public.partner_freight_earnings e
        left join lateral (
          select
            sum(fc.partner_gross_reversal_etb) as partner_gross_reversal_etb,
            sum(fc.partner_commission_reversal_etb) as partner_commission_reversal_etb
          from public.financial_corrections fc
          where fc.partner_earning_id = e.id
        ) c on true
        where e.status <> 'reversed'
        group by e.partner_id
        order by 2 desc, 1
        limit 5
      ) x
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_ceo_kpi_v1_report() from public, anon;
grant execute on function public.admin_ceo_kpi_v1_report() to authenticated;
