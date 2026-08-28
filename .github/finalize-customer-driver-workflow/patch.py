from pathlib import Path


def replace_once(source: str, before: str, after: str, file: str) -> str:
    if before not in source:
        raise RuntimeError(f"Expected text not found in {file}: {before[:160]}")
    return source.replace(before, after, 1)

migration_path = Path("supabase/migrations/20260828173000_simplified_customer_driver_workflow.sql")
migration = migration_path.read_text()
old_total = """create or replace function private.driver_commission_charged_total(p_driver_id uuid) returns numeric language sql stable security invoker set search_path='' as $$
  select coalesce(sum(charge.commission_etb),0)::numeric from public.driver_commission_charges charge join public.payments payment on payment.id=charge.payment_id where charge.driver_id=p_driver_id and charge.status='active' and lower(replace(btrim(coalesce(payment.provider,'')),' ','_')) in ('cash','cash_to_driver','driver_cash');
$$;
"""
new_total = """create or replace function private.driver_cash_commission_liability_total(p_driver_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(charge.commission_etb), 0)::numeric
  from public.driver_commission_charges charge
  join public.payments payment on payment.id = charge.payment_id
  where charge.driver_id = p_driver_id
    and charge.status = 'active'
    and lower(replace(btrim(coalesce(payment.provider, '')), ' ', '_'))
      in ('cash', 'cash_to_driver', 'driver_cash');
$$;

revoke all on function private.driver_cash_commission_liability_total(uuid)
  from public, anon, authenticated;

create or replace function public.driver_commission_balance(p_driver_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_leadership boolean := false;
  v_cash_liability numeric;
  v_approved numeric;
  v_deposit numeric;
begin
  if v_service then
    v_leadership := true;
  elsif v_uid is not null then
    select exists (
      select 1 from public.profiles profile
      where profile.id = v_uid and profile.role::text in ('admin', 'ceo')
    ) into v_leadership;
  end if;
  if v_uid is null and not v_service then raise exception 'Authentication required'; end if;
  if p_driver_id is distinct from v_uid and not v_leadership then
    raise exception 'You can only view your own commission balance';
  end if;

  v_cash_liability := private.driver_cash_commission_liability_total(p_driver_id);
  select coalesce(sum(amount_etb), 0) into v_approved
  from public.driver_commission_payments
  where driver_id = p_driver_id and status = 'approved';
  select coalesce(sum(amount_etb), 0) into v_deposit
  from public.driver_commission_deposits
  where driver_id = p_driver_id and status = 'active';

  return greatest(0, v_cash_liability - least(v_cash_liability, v_approved) - v_deposit);
end;
$$;

create or replace function public.my_driver_commission_summary()
returns table(balance_etb numeric, charged_etb numeric, approved_paid_etb numeric, pending_etb numeric, blocked boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_cash numeric;
  v_all_charged numeric;
  v_approved numeric;
  v_pending numeric;
  v_deposit numeric;
  v_balance numeric;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  v_cash := private.driver_cash_commission_liability_total(v_uid);
  v_all_charged := private.driver_commission_charged_total(v_uid);
  select coalesce(sum(amount_etb), 0) into v_approved from public.driver_commission_payments where driver_id=v_uid and status='approved';
  select coalesce(sum(amount_etb), 0) into v_pending from public.driver_commission_payments where driver_id=v_uid and status='pending';
  select coalesce(sum(amount_etb), 0) into v_deposit from public.driver_commission_deposits where driver_id=v_uid and status='active';
  v_balance := greatest(0, v_cash - least(v_cash, v_approved) - v_deposit);
  return query select v_balance, v_all_charged, v_approved, v_pending, v_balance > 0.005;
end;
$$;

create or replace function public.driver_financial_summary(p_driver_id uuid)
returns table(
  completed_trips bigint,
  gross_released_etb numeric,
  commission_charged_etb numeric,
  commission_paid_etb numeric,
  admin_deposit_etb numeric,
  available_deposit_etb numeric,
  commission_due_etb numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_leadership boolean := false;
begin
  if v_service then v_leadership := true;
  elsif v_uid is not null then
    select exists(select 1 from public.profiles where id=v_uid and role::text in ('admin','ceo')) into v_leadership;
  end if;
  if v_uid is null and not v_service then raise exception 'Authentication required'; end if;
  if p_driver_id is distinct from v_uid and not v_leadership then raise exception 'You can only view your own financial summary'; end if;

  return query
  with totals as (
    select
      (select count(*) from public.orders o where o.driver_id=p_driver_id and o.status='delivered')::bigint trips,
      coalesce((select sum(p.amount_etb) from public.payments p join public.orders o on o.id=p.order_id where o.driver_id=p_driver_id and p.event='released'),0)::numeric gross,
      private.driver_commission_charged_total(p_driver_id) all_charged,
      private.driver_cash_commission_liability_total(p_driver_id) cash_liability,
      coalesce((select sum(p.amount_etb) from public.driver_commission_payments p where p.driver_id=p_driver_id and p.status='approved'),0)::numeric paid,
      coalesce((select sum(d.amount_etb) from public.driver_commission_deposits d where d.driver_id=p_driver_id and d.status='active'),0)::numeric deposited
  ), applied as (
    select *, greatest(0, cash_liability - least(cash_liability, paid)) unpaid_cash from totals
  )
  select trips, gross, all_charged, paid, deposited,
    greatest(0, deposited - unpaid_cash),
    greatest(0, unpaid_cash - deposited)
  from applied;
end;
$$;

revoke all on function public.driver_commission_balance(uuid) from public, anon;
grant execute on function public.driver_commission_balance(uuid) to authenticated, service_role;
revoke all on function public.my_driver_commission_summary() from public, anon;
grant execute on function public.my_driver_commission_summary() to authenticated, service_role;
revoke all on function public.driver_financial_summary(uuid) from public, anon;
grant execute on function public.driver_financial_summary(uuid) to authenticated, service_role;
"""
migration = replace_once(migration, old_total, new_total, str(migration_path))

migration = replace_once(migration,
"""    update public.orders set payment_status='unpaid' where id=p_order_id;
    return v_id;""",
"""    update public.orders set payment_status='unpaid' where id=p_order_id;
    insert into public.driver_commission_audit(driver_id,action,actor_id,details)
    values(v_driver,'trip_completed_payment_outstanding',v_actor,jsonb_build_object('order_id',p_order_id,'result_id',v_id,'completed_at',v_delivered_at,'payment_status','outstanding'));
    return v_id;""", str(migration_path))

migration = replace_once(migration,
"""    insert into public.driver_trip_payment_results(order_id,assigned_driver_id,payment_id,result_type,amount_collected,payment_method,collected_at,completed_at,actor_id,note,commission_etb,driver_gross_etb,driver_net_etb,deposit_before_etb,deposit_consumed_etb,deposit_after_etb,commission_due_after_etb) values(p_order_id,v_driver,v_payment,'cash_received',v_total,'cash',now(),v_delivered_at,v_actor,nullif(btrim(coalesce(p_note,'')),''),v_commission,v_total,v_total-v_commission,v_deposit+v_consumed,v_consumed,v_deposit,v_due) returning id into v_id;
    perform public.recompute_order_payment_status(p_order_id); return v_id;""",
"""    insert into public.driver_trip_payment_results(order_id,assigned_driver_id,payment_id,result_type,amount_collected,payment_method,collected_at,completed_at,actor_id,note,commission_etb,driver_gross_etb,driver_net_etb,deposit_before_etb,deposit_consumed_etb,deposit_after_etb,commission_due_after_etb) values(p_order_id,v_driver,v_payment,'cash_received',v_total,'cash',now(),v_delivered_at,v_actor,nullif(btrim(coalesce(p_note,'')),''),v_commission,v_total,v_total-v_commission,v_deposit+v_consumed,v_consumed,v_deposit,v_due) returning id into v_id;
    insert into public.driver_commission_audit(driver_id,action,actor_id,details)
    values(v_driver,'trip_completed_cash_received',v_actor,jsonb_build_object('order_id',p_order_id,'payment_id',v_payment,'result_id',v_id,'gross_etb',v_total,'commission_etb',v_commission,'deposit_consumed_etb',v_consumed,'available_deposit_etb',v_deposit,'commission_due_etb',v_due));
    perform public.recompute_order_payment_status(p_order_id); return v_id;""", str(migration_path))

migration = replace_once(migration,
"""  insert into public.driver_payment_confirmation_events(order_id,assigned_driver_id,payment_id,confirmation_type,confirmed_amount_etb,provider,provider_ref,actor_id) select p_order_id,v_driver,p.id,'payment_confirmed',p.amount_etb,p.provider,p.provider_ref,v_actor from public.payments p where p.id=v_payment on conflict(payment_id,confirmation_type) do nothing;
  perform public.recompute_order_payment_status(p_order_id); return v_id;""",
"""  insert into public.driver_payment_confirmation_events(order_id,assigned_driver_id,payment_id,confirmation_type,confirmed_amount_etb,provider,provider_ref,actor_id) select p_order_id,v_driver,p.id,'payment_confirmed',p.amount_etb,p.provider,p.provider_ref,v_actor from public.payments p where p.id=v_payment on conflict(payment_id,confirmation_type) do nothing;
  insert into public.driver_commission_audit(driver_id,action,actor_id,details)
  values(v_driver,'trip_completed_bank_telebirr',v_actor,jsonb_build_object('order_id',p_order_id,'payment_id',v_payment,'result_id',v_id,'gross_etb',v_total,'commission_etb',v_commission,'deposit_consumed_etb',0,'available_deposit_etb',v_deposit,'commission_due_etb',0));
  perform public.recompute_order_payment_status(p_order_id); return v_id;""", str(migration_path))

report_sql = r'''
create or replace function public.admin_customer_driver_reconciliation()
returns table(
  order_id uuid,
  tracking_id text,
  route text,
  customer_shipper text,
  assigned_driver text,
  trip_amount_etb numeric,
  payment_method text,
  cash_collected_etb numeric,
  bank_telebirr_received_etb numeric,
  hallo_commission_etb numeric,
  driver_gross_etb numeric,
  driver_net_etb numeric,
  deposit_consumed_etb numeric,
  remaining_available_deposit_etb numeric,
  commission_due_etb numeric,
  completed_at timestamptz,
  payment_status text,
  rating_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin_or_ceo()) then raise exception 'Admin or CEO access required'; end if;
  return query
  with latest_result as (
    select distinct on (result.order_id) result.*
    from public.driver_trip_payment_results result
    order by result.order_id,
      case when result.result_type in ('cash_received','bank_telebirr') then 0 else 1 end,
      result.created_at desc
  )
  select
    trip_order.id,
    trip_order.tracking_id,
    trip_order.pickup_address || ' → ' || trip_order.dropoff_address,
    coalesce(nullif(trip_order.customer_name,''), trip_order.customer_phone, 'Customer'),
    coalesce(nullif(driver.full_name,''), driver.phone, 'Assigned driver'),
    coalesce(trip_order.price_etb,0)::numeric,
    result.payment_method,
    case when result.result_type='cash_received' then result.amount_collected else 0 end,
    case when result.result_type='bank_telebirr' then result.amount_collected else 0 end,
    result.commission_etb,
    result.driver_gross_etb,
    result.driver_net_etb,
    result.deposit_consumed_etb,
    result.deposit_after_etb,
    result.commission_due_after_etb,
    result.completed_at,
    trip_order.payment_status::text,
    case when rating.id is null then 'not_rated' else 'rated' end
  from latest_result result
  join public.orders trip_order on trip_order.id=result.order_id
  left join public.profiles driver on driver.id=result.assigned_driver_id
  left join public.ratings rating on rating.order_id=result.order_id
  order by result.completed_at desc;
end;
$$;
revoke all on function public.admin_customer_driver_reconciliation() from public, anon;
grant execute on function public.admin_customer_driver_reconciliation() to authenticated;
'''
migration = replace_once(migration, "\nnotify pgrst,'reload schema';", "\n" + report_sql + "\nnotify pgrst,'reload schema';", str(migration_path))
migration_path.write_text(migration)

admin_path = Path("src/pages/AdminPaymentReview.tsx")
admin = admin_path.read_text()
admin = replace_once(admin,
"""export interface PaymentCorrectionRow {
  id: string;
  source_payment_id: string;
  amount_etb: number | string;
  correction_type: string;
  reason: string;
  created_at: string;
}
""",
"""export interface PaymentCorrectionRow {
  id: string;
  source_payment_id: string;
  amount_etb: number | string;
  correction_type: string;
  reason: string;
  created_at: string;
}

export interface TripReconciliationRow {
  order_id: string;
  tracking_id: string;
  route: string;
  customer_shipper: string;
  assigned_driver: string;
  trip_amount_etb: number | string;
  payment_method: string;
  cash_collected_etb: number | string;
  bank_telebirr_received_etb: number | string;
  hallo_commission_etb: number | string;
  driver_gross_etb: number | string;
  driver_net_etb: number | string;
  deposit_consumed_etb: number | string;
  remaining_available_deposit_etb: number | string;
  commission_due_etb: number | string;
  completed_at: string;
  payment_status: string;
  rating_status: string;
}
""", str(admin_path))
admin = replace_once(admin,
"""  confirmations?: DriverConfirmationEventRow[];
  corrections?: PaymentCorrectionRow[];
}""",
"""  confirmations?: DriverConfirmationEventRow[];
  corrections?: PaymentCorrectionRow[];
  reconciliation?: TripReconciliationRow[];
}""", str(admin_path))
admin = replace_once(admin,
"""  const [corrections, setCorrections] = useState<PaymentCorrectionRow[]>(fixture?.corrections ?? []);
  const [filter,""",
"""  const [corrections, setCorrections] = useState<PaymentCorrectionRow[]>(fixture?.corrections ?? []);
  const [reconciliation, setReconciliation] = useState<TripReconciliationRow[]>(fixture?.reconciliation ?? []);
  const [filter,""", str(admin_path))
admin = replace_once(admin,
"""      setCorrections(fixture.corrections ?? []);
      setLoading(false);""",
"""      setCorrections(fixture.corrections ?? []);
      setReconciliation(fixture.reconciliation ?? []);
      setLoading(false);""", str(admin_path))
admin = replace_once(admin,
"""      setCorrections(correctionResults.flatMap((result) => (result.data ?? []) as PaymentCorrectionRow[]));
      setError("");""",
"""      setCorrections(correctionResults.flatMap((result) => (result.data ?? []) as PaymentCorrectionRow[]));
      const reconciliationResult = await supabase.rpc("admin_customer_driver_reconciliation");
      if (reconciliationResult.error) throw reconciliationResult.error;
      setReconciliation((reconciliationResult.data ?? []) as TripReconciliationRow[]);
      setError("");""", str(admin_path))
admin = replace_once(admin,
"""      .on("postgres_changes", { event: "INSERT", schema: "public", table: "financial_corrections" }, () => void load())
      .subscribe();""",
"""      .on("postgres_changes", { event: "INSERT", schema: "public", table: "financial_corrections" }, () => void load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "driver_trip_payment_results" }, () => void load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ratings" }, () => void load())
      .subscribe();""", str(admin_path))
report_ui = '''
      {reconciliation.length > 0 && <section className="mt-4 min-w-0 border border-asphalt/10 bg-white p-4 sm:p-5">
        <div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-emerald-700">CUSTOMER–DRIVER RECONCILIATION</p><h2 className="mt-1 font-display text-xl font-bold">Completed trip finance and rating report</h2><p className="mt-1 text-xs text-steel">Immutable completion results with cash, platform payment, commission, deposit and rating status.</p></div>
        <div className="mt-4 grid gap-3">
          {reconciliation.map((row) => <article key={row.order_id} className="min-w-0 border border-asphalt/10 bg-bone p-4">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="break-all font-mono text-xs font-semibold">{row.tracking_id}</p><p className="mt-2 break-words text-sm font-semibold">{row.route}</p><p className="mt-1 text-xs text-steel">Customer / shipper: <strong className="text-asphalt">{row.customer_shipper}</strong> · Assigned Driver: <strong className="text-asphalt">{row.assigned_driver}</strong></p></div><span className="bg-white px-3 py-2 text-[10px] font-semibold uppercase text-steel">{row.payment_status.replace(/_/g, " ")}</span></div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
              <ReconciliationValue label="Trip amount" value={`ETB ${money(row.trip_amount_etb)}`} />
              <ReconciliationValue label="Payment method" value={row.payment_method.replace(/_/g, " ")} />
              <ReconciliationValue label="Cash collected" value={`ETB ${money(row.cash_collected_etb)}`} />
              <ReconciliationValue label="HALLO Bank / Telebirr" value={`ETB ${money(row.bank_telebirr_received_etb)}`} />
              <ReconciliationValue label="HALLO commission" value={`ETB ${money(row.hallo_commission_etb)}`} />
              <ReconciliationValue label="Driver gross" value={`ETB ${money(row.driver_gross_etb)}`} />
              <ReconciliationValue label="Driver net" value={`ETB ${money(row.driver_net_etb)}`} />
              <ReconciliationValue label="Deposit consumed" value={`ETB ${money(row.deposit_consumed_etb)}`} />
              <ReconciliationValue label="Available deposit" value={`ETB ${money(row.remaining_available_deposit_etb)}`} />
              <ReconciliationValue label="Commission due" value={`ETB ${money(row.commission_due_etb)}`} />
              <ReconciliationValue label="Completed" value={new Date(row.completed_at).toLocaleString()} />
              <ReconciliationValue label="Rating" value={row.rating_status.replace(/_/g, " ")} />
            </div>
          </article>)}
        </div>
      </section>}
'''
admin = replace_once(admin,
"""      <section className="mt-4 min-w-0 border border-asphalt/10 bg-white p-3 min-[360px]:p-4">""",
report_ui + "\n      <section className=\"mt-4 min-w-0 border border-asphalt/10 bg-white p-3 min-[360px]:p-4\">", str(admin_path))
admin += '''

function ReconciliationValue({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><span className="block text-[9px] font-semibold uppercase tracking-wide text-steel">{label}</span><strong className="mt-1 block break-words text-asphalt">{value}</strong></div>;
}
'''
admin_path.write_text(admin)

smoke_path = Path("scripts/payment-ledger-e2e-smoke.mjs")
smoke = smoke_path.read_text()
smoke = replace_once(smoke,
"""  corrections: [{ id: "correction-4", source_payment_id: "payment-04", amount_etb: 20000, correction_type: "partial_refund", reason: "Verified partial customer refund", created_at: "2026-08-24T09:30:00.000Z" }],
};""",
"""  corrections: [{ id: "correction-4", source_payment_id: "payment-04", amount_etb: 20000, correction_type: "partial_refund", reason: "Verified partial customer refund", created_at: "2026-08-24T09:30:00.000Z" }],
  reconciliation: [{ order_id: "order-01", tracking_id: "HT-2026-F44A0E", route: "Hirna → Dessie", customer_shipper: "Sofi Husse", assigned_driver: "Adil Abdu", trip_amount_etb: 30000, payment_method: "cash", cash_collected_etb: 30000, bank_telebirr_received_etb: 0, hallo_commission_etb: 600, driver_gross_etb: 30000, driver_net_etb: 29400, deposit_consumed_etb: 600, remaining_available_deposit_etb: 9400, commission_due_etb: 0, completed_at: "2026-08-28T12:00:00.000Z", payment_status: "released", rating_status: "not_rated" }],
};""", str(smoke_path))
smoke = replace_once(smoke,
"""      "Payment ledger",
      "HT-2026-F44A0E",""",
"""      "Payment ledger",
      "Completed trip finance and rating report",
      "Cash collected",
      "HALLO commission",
      "ETB 29,400",
      "ETB 9,400",
      "HT-2026-F44A0E",""", str(smoke_path))
smoke_path.write_text(smoke)

test_path = Path("tests/regression/simplified-customer-driver-workflow.test.ts")
test = test_path.read_text()
test += '''
test("bank commission remains reportable without consuming the driver deposit", () => {
  assert.match(migration, /driver_cash_commission_liability_total/);
  assert.match(migration, /private\.driver_commission_charged_total\(p_driver_id\) all_charged/);
  assert.match(migration, /trip_completed_bank_telebirr[\s\S]*deposit_consumed_etb',0/);
});
test("Admin and CEO reconciliation exposes every required completion field", () => {
  assert.match(migration, /admin_customer_driver_reconciliation/);
  for (const field of ["cash_collected_etb", "bank_telebirr_received_etb", "hallo_commission_etb", "driver_gross_etb", "driver_net_etb", "deposit_consumed_etb", "remaining_available_deposit_etb", "commission_due_etb", "rating_status"]) assert.ok(migration.includes(field), field);
});
test("completion payment and commission events are appended to the audit log", () => {
  assert.match(migration, /driver_commission_audit/);
  assert.match(migration, /trip_completed_cash_received/);
  assert.match(migration, /trip_completed_payment_outstanding/);
});
'''
test_path.write_text(test)
