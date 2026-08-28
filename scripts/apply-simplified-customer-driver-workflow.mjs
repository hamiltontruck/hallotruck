import { readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const write = (file, content) => writeFile(path.join(root, file), content, "utf8");

function replaceOnce(content, before, after, file) {
  if (!content.includes(before)) throw new Error(`Expected text not found in ${file}: ${before.slice(0, 100)}`);
  return content.replace(before, after);
}

async function patch(file, transform) {
  const current = await read(file);
  await write(file, transform(current));
}

await patch("src/services/customer-cargo.service.ts", (content) => {
  content = replaceOnce(content,
`  cargoNotes?: string;
}) {`,
`  cargoNotes?: string;
  paymentMethod: "cash" | "bank_telebirr";
}) {`, "src/services/customer-cargo.service.ts");
  content = replaceOnce(content,
`    price_etb: priceEtb,
    status: "placed",`,
`    price_etb: priceEtb,
    selected_payment_method: input.paymentMethod,
    payment_terms: "pay_driver_on_delivery",
    status: "placed",`, "src/services/customer-cargo.service.ts");
  return content;
});

await patch("src/pages/CustomerPortal.tsx", (content) => {
  content = content.replace('import { CustomerPaymentModal } from "../components/customer/CustomerPaymentModal";\n', "");
  content = replaceOnce(content,
`  const [paymentOrder, setPaymentOrder] = useState<CustomerOrder | null>(null);
  const [trackingOrder, setTrackingOrder] = useState<CustomerOrder | null>(null);`,
`  const [trackingOrder, setTrackingOrder] = useState<CustomerOrder | null>(null);`, "src/pages/CustomerPortal.tsx");
  content = replaceOnce(content,
`  const [cargoUnit, setCargoUnit] = useState<CargoUnit>("ton");
  const [orderFilter, setOrderFilter]`,
`  const [cargoUnit, setCargoUnit] = useState<CargoUnit>("ton");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank_telebirr">("cash");
  const [orderFilter, setOrderFilter]`, "src/pages/CustomerPortal.tsx");
  content = content.replace("if (!showOrder && !trackingOrder && !paymentOrder && !cancelOrder) return;", "if (!showOrder && !trackingOrder && !cancelOrder) return;");
  content = content.replace("}, [cancelOrder, paymentOrder, showOrder, trackingOrder]);", "}, [cancelOrder, showOrder, trackingOrder]);");
  content = replaceOnce(content,
`        cargoQuantity: cargoAmount,
        cargoUnit,
      });`,
`        cargoQuantity: cargoAmount,
        cargoUnit,
        paymentMethod,
      });`, "src/pages/CustomerPortal.tsx");
  content = replaceOnce(content,
`      setCargoUnit("ton");
      await load();`,
`      setCargoUnit("ton");
      setPaymentMethod("cash");
      await load();`, "src/pages/CustomerPortal.tsx");
  content = content.replace("    if (paymentOrder?.id === order.id) setPaymentOrder(null);\n", "");
  content = replaceOnce(content,
`              const canSubmitPayment = order.status !== "cancelled";
              const remaining = paymentSummary.remainingToSubmit;`,
`              const remaining = paymentSummary.remainingToSubmit;`, "src/pages/CustomerPortal.tsx");
  content = replaceOnce(content,
`                  {canSubmitPayment && (remaining > 0 ? <button onClick={() => setPaymentOrder(order)} className="is-payment bg-asphalt px-4 py-3 text-xs font-semibold text-white">{c.submitPayment} · ETB {remaining.toLocaleString()}</button> : <span className="customer-payment-state self-center bg-emerald-700 px-4 py-3 text-xs font-semibold text-white">{pending ? c.pendingVerification : c.paymentRecorded}</span>)}`, 
`                  <span className="customer-payment-state self-center border border-asphalt/15 bg-bone px-4 py-3 text-xs font-semibold text-asphalt">{order.selected_payment_method === "bank_telebirr" ? "Bank / Telebirr" : "Cash"}</span>
                  {remaining <= 0 && <span className="customer-payment-state self-center bg-emerald-700 px-4 py-3 text-xs font-semibold text-white">{pending ? c.pendingVerification : c.paymentRecorded}</span>}`, "src/pages/CustomerPortal.tsx");
  content = replaceOnce(content,
`          <section className="customer-order-step"><div className="customer-order-step__heading"><span>3</span><div><h3>{ui.review}</h3><p>{ui.reviewHelp}</p></div></div><div className="customer-quote-card"><p>{c.estimatedQuote}</p><strong>{quoteLoading ? "…" : quote ? \`ETB ${quote.toLocaleString()}\` : c.selectRoute}</strong><small>{quoteLoading ? cargoText.quoteLoading : quoteError ? \`${cargoText.quoteUnavailable} ${quoteError}\` : \`${cargoText.pricing} ${cargoText.latestRate}\`}</small></div></section>`,
`          <section className="customer-order-step"><div className="customer-order-step__heading"><span>3</span><div><h3>{ui.review}</h3><p>{ui.reviewHelp}</p></div></div><div className="customer-quote-card"><p>{c.estimatedQuote}</p><strong>{quoteLoading ? "…" : quote ? \`ETB ${quote.toLocaleString()}\` : c.selectRoute}</strong><small>{quoteLoading ? cargoText.quoteLoading : quoteError ? \`${cargoText.quoteUnavailable} ${quoteError}\` : \`${cargoText.pricing} ${cargoText.latestRate}\`}</small></div><fieldset className="mt-4"><legend className="text-sm font-semibold">Payment method</legend><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className={\`border p-4 text-sm ${paymentMethod === "cash" ? "border-asphalt bg-asphalt text-white" : "border-asphalt/15 bg-white"}\`}><input type="radio" name="paymentMethod" checked={paymentMethod === "cash"} onChange={() => setPaymentMethod("cash")} className="mr-2" />Cash</label><label className={\`border p-4 text-sm ${paymentMethod === "bank_telebirr" ? "border-asphalt bg-asphalt text-white" : "border-asphalt/15 bg-white"}\`}><input type="radio" name="paymentMethod" checked={paymentMethod === "bank_telebirr"} onChange={() => setPaymentMethod("bank_telebirr")} className="mr-2" />Bank / Telebirr</label></div><p className="mt-2 text-xs text-steel">No receipt or screenshot is required from the customer.</p></fieldset></section>`, "src/pages/CustomerPortal.tsx");
  content = content.replace(`\n      {paymentOrder && <CustomerPaymentModal order={paymentOrder} maxAmount={remainingPayment(paymentOrder, data.payments)} onClose={() => setPaymentOrder(null)} onSubmitted={load} />}`, "");
  return content;
});

await patch("src/services/customer.service.ts", (content) => {
  content = replaceOnce(content,
`  payment_terms: string;
  cancellation_reason: string | null;`,
`  payment_terms: string;
  selected_payment_method: "cash" | "bank_telebirr";
  cancellation_reason: string | null;`, "src/services/customer.service.ts");
  content = content.replace("payment_provider, payment_ref, payment_terms, cancellation_reason", "payment_provider, payment_ref, payment_terms, selected_payment_method, cancellation_reason");
  return content;
});

await patch("src/services/driver-payment-collection.service.ts", (content) => {
  content = replaceOnce(content,
`export type DriverCollectionMethod = "cash" | "bank";`,
`export type DriverCollectionMethod = "cash" | "bank";
export type DriverTripPaymentResult = "cash_received" | "bank_telebirr" | "payment_not_received";`, "src/services/driver-payment-collection.service.ts");
  content += `\nexport async function recordDriverTripPaymentResult(input: {\n  orderId: string;\n  result: DriverTripPaymentResult;\n  amountCollected?: number;\n  note?: string;\n}): Promise<void> {\n  const { error } = await supabase.rpc("driver_record_trip_payment_result", {\n    p_order_id: input.orderId,\n    p_result_type: input.result,\n    p_amount_collected: input.amountCollected ?? null,\n    p_note: input.note?.trim() || null,\n  });\n  if (error) throw new Error(error.message);\n}\n`;
  return content;
});

await patch("src/pages/DriverPaymentCollection.tsx", (content) => {
  content = replaceOnce(content,
`  submitDriverCollectedPayment,
  type DriverCollectionOrder,`,
`  submitDriverCollectedPayment,
  recordDriverTripPaymentResult,
  type DriverCollectionOrder,`, "src/pages/DriverPaymentCollection.tsx");
  content = replaceOnce(content,
`  const [note, setNote] = useState("");
  const [loading, setLoading]`,
`  const [note, setNote] = useState("");
  const [amountCollected, setAmountCollected] = useState("");
  const [loading, setLoading]`, "src/pages/DriverPaymentCollection.tsx");
  content = replaceOnce(content,
`        amountEtb: Number(order.price_etb ?? 0),
        note,
      });`,
`        amountEtb: selectedMethod === "cash" ? Number(amountCollected) : Number(order.price_etb ?? 0),
        note,
      });
      await recordDriverTripPaymentResult({
        orderId: order.id,
        result: selectedMethod === "cash" ? "cash_received" : "bank_telebirr",
        amountCollected: selectedMethod === "cash" ? Number(amountCollected) : Number(order.price_etb ?? 0),
        note,
      });`, "src/pages/DriverPaymentCollection.tsx");
  content = replaceOnce(content,
`  const submissionIssue = getDriverPaymentSubmissionIssue(method, providerRef);`,
`  const submissionIssue = getDriverPaymentSubmissionIssue(method, providerRef) || (method === "cash" && Number(amountCollected) !== amount ? "cash_amount" : null);`, "src/pages/DriverPaymentCollection.tsx");
  content = replaceOnce(content,
`          ) : method === "cash" ? (
            <div className="mt-5 border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">✓ {c.cash} — {formatEtb(amount)}</div>
          ) : null}`, 
`          ) : method === "cash" ? (
            <label className="mt-5 block text-sm">Exact amount collected<input required value={amountCollected} onChange={(event) => setAmountCollected(event.target.value)} type="number" inputMode="decimal" step="0.01" min="0.01" className="mt-2 block w-full border border-asphalt/20 p-3" /><span className="mt-2 block text-xs text-steel">Must equal {formatEtb(amount)}.</span></label>
          ) : null}`, "src/pages/DriverPaymentCollection.tsx");
  content = replaceOnce(content,
`          <button type="button" onClick={() => { setMethod(null); setProviderRef(""); setError(""); setShowUnpaidNotice(true); }} className="mt-3 w-full border border-route px-3 py-3 text-sm font-semibold text-route">{c.notPaid}</button>`,
`          <button type="button" onClick={async () => { if (!order || saving) return; setSaving(true); setError(""); try { await recordDriverTripPaymentResult({ orderId: order.id, result: "payment_not_received", note }); setMethod(null); setProviderRef(""); setShowUnpaidNotice(true); await load(); } catch (reportError) { setError(reportError instanceof Error ? reportError.message : c.invalid); } finally { setSaving(false); } }} className="mt-3 w-full border border-route px-3 py-3 text-sm font-semibold text-route">{c.notPaid}</button>`, "src/pages/DriverPaymentCollection.tsx");
  return content;
});

await patch("src/components/customer/CustomerRatingCard.tsx", (content) => {
  content = replaceOnce(content,
`  star: string;
}> = {`,
`  star: string;
  skip: string;
}> = {`, "src/components/customer/CustomerRatingCard.tsx");
  content = content.replace(`    star: "star",\n  },`, `    star: "star",\n    skip: "Skip",\n  },`);
  content = content.replace(`    star: "urjii",\n  },`, `    star: "urjii",\n    skip: "Darbii",\n  },`);
  content = content.replace(`    star: "ኮከብ",\n  },`, `    star: "ኮከብ",\n    skip: "ዝለል",\n  },`);
  content = replaceOnce(content,
`      {loading ? <p className="mt-4 text-xs text-steel">…</p> : <form onSubmit={submit} className="mt-4 min-w-0">`,
`      {loading ? <p className="mt-4 text-xs text-steel">…</p> : rating ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm"><p className="font-semibold text-emerald-900">{t.saved}: {"★".repeat(rating.score)}</p>{rating.comment && <p className="mt-2 text-steel">{rating.comment}</p>}</div> : <form onSubmit={submit} className="mt-4 min-w-0">`, "src/components/customer/CustomerRatingCard.tsx");
  content = replaceOnce(content,
`        <button
          disabled={busy || score === 0}
          className="mt-4 min-h-11 w-full rounded-xl bg-asphalt px-5 py-3 text-xs font-semibold text-white disabled:opacity-40 sm:w-auto"
        >
          {busy ? t.saving : rating ? t.update : t.save}
        </button>`,
`        <div className="mt-4 grid gap-2 sm:grid-cols-2"><button disabled={busy || score === 0} className="min-h-11 w-full rounded-xl bg-asphalt px-5 py-3 text-xs font-semibold text-white disabled:opacity-40">{busy ? t.saving : t.save}</button><button type="button" onClick={() => setScore(0)} className="min-h-11 w-full rounded-xl border border-asphalt/20 px-5 py-3 text-xs font-semibold text-asphalt">{t.skip}</button></div>`, "src/components/customer/CustomerRatingCard.tsx");
  return content;
});

const migration = `-- Simplified Customer–Driver workflow. Partner finance and Partner settlement logic are unchanged.\nbegin;\n\nalter table public.orders add column if not exists selected_payment_method text;\nupdate public.orders set selected_payment_method = case when lower(replace(coalesce(payment_provider,''),' ','_')) in ('telebirr','cbe','awash_bank','bank_of_abyssinia','dashen_bank','coop_bank_oromia','mpesa','other_bank') then 'bank_telebirr' else 'cash' end where selected_payment_method is null;\nalter table public.orders alter column selected_payment_method set default 'cash', alter column selected_payment_method set not null;\nalter table public.orders drop constraint if exists orders_selected_payment_method_check;\nalter table public.orders add constraint orders_selected_payment_method_check check (selected_payment_method in ('cash','bank_telebirr'));\n\ncreate table if not exists public.driver_trip_payment_results (\n  id uuid primary key default gen_random_uuid(),\n  order_id uuid not null references public.orders(id) on delete restrict,\n  assigned_driver_id uuid not null references public.profiles(id) on delete restrict,\n  payment_id uuid references public.payments(id) on delete restrict,\n  result_type text not null check (result_type in ('cash_received','bank_telebirr','payment_not_received')),\n  amount_collected numeric(14,2) not null default 0 check (amount_collected >= 0),\n  payment_method text not null check (payment_method in ('cash','bank_telebirr','none')),\n  collected_at timestamptz,\n  completed_at timestamptz not null,\n  actor_id uuid not null references public.profiles(id) on delete restrict,\n  note text check (note is null or char_length(note) <= 500),\n  commission_etb numeric(14,2) not null default 0,\n  driver_gross_etb numeric(14,2) not null default 0,\n  driver_net_etb numeric(14,2) not null default 0,\n  deposit_before_etb numeric(14,2) not null default 0,\n  deposit_consumed_etb numeric(14,2) not null default 0,\n  deposit_after_etb numeric(14,2) not null default 0,\n  commission_due_after_etb numeric(14,2) not null default 0,\n  created_at timestamptz not null default now(),\n  constraint driver_trip_payment_result_actor_check check (actor_id = assigned_driver_id)\n);\ncreate unique index if not exists driver_trip_payment_results_positive_once_idx on public.driver_trip_payment_results(order_id) where result_type in ('cash_received','bank_telebirr');\ncreate unique index if not exists driver_trip_payment_results_not_received_once_idx on public.driver_trip_payment_results(order_id) where result_type = 'payment_not_received';\nalter table public.driver_trip_payment_results enable row level security;\nrevoke all on public.driver_trip_payment_results from public, anon, authenticated;\ngrant select on public.driver_trip_payment_results to authenticated;\ngrant all on public.driver_trip_payment_results to service_role;\ndrop policy if exists \"driver trip payment results read\" on public.driver_trip_payment_results;\ncreate policy \"driver trip payment results read\" on public.driver_trip_payment_results for select to authenticated using (assigned_driver_id = (select auth.uid()) or (select private.is_admin_or_ceo()));\n\ncreate or replace function private.reject_driver_trip_payment_result_mutation() returns trigger language plpgsql security definer set search_path='' as $$ begin raise exception 'Trip payment result history is immutable'; end; $$;\ndrop trigger if exists reject_driver_trip_payment_result_mutation on public.driver_trip_payment_results;\ncreate trigger reject_driver_trip_payment_result_mutation before update or delete on public.driver_trip_payment_results for each row execute function private.reject_driver_trip_payment_result_mutation();\n\ncreate or replace function private.driver_commission_charged_total(p_driver_id uuid) returns numeric language sql stable security invoker set search_path='' as $$\n  select coalesce(sum(charge.commission_etb),0)::numeric from public.driver_commission_charges charge join public.payments payment on payment.id=charge.payment_id where charge.driver_id=p_driver_id and charge.status='active' and lower(replace(btrim(coalesce(payment.provider,'')),' ','_')) in ('cash','cash_to_driver','driver_cash');\n$$;\n\ncreate or replace function public.driver_record_trip_payment_result(p_order_id uuid,p_result_type text,p_amount_collected numeric default null,p_note text default null) returns uuid language plpgsql security definer set search_path='' as $$\ndeclare\n  v_actor uuid:=auth.uid(); v_driver uuid; v_status public.order_status; v_total numeric; v_method text; v_delivered_at timestamptz; v_payment uuid; v_commission numeric:=0; v_deposit numeric:=0; v_consumed numeric:=0; v_due numeric:=0; v_id uuid;\nbegin\n  if v_actor is null then raise exception 'Driver sign-in required'; end if;\n  select driver_id,status,coalesce(price_etb,0),selected_payment_method,delivered_at into v_driver,v_status,v_total,v_method,v_delivered_at from public.orders where id=p_order_id for update;\n  if not found then raise exception 'Order not found'; end if;\n  if v_driver is distinct from v_actor then raise exception 'Only the database-assigned driver may report this trip'; end if;\n  if not exists(select 1 from public.profiles where id=v_actor and role::text='driver') then raise exception 'Driver role required'; end if;\n  if v_status <> 'delivered' or v_delivered_at is null then raise exception 'Finish the trip before reporting payment'; end if;\n  if p_result_type not in ('cash_received','bank_telebirr','payment_not_received') then raise exception 'Unsupported payment result'; end if;\n  if exists(select 1 from public.driver_trip_payment_results where order_id=p_order_id and result_type in ('cash_received','bank_telebirr')) then raise exception 'Payment result already confirmed for this order'; end if;\n  if p_result_type='payment_not_received' then\n    if exists(select 1 from public.driver_trip_payment_results where order_id=p_order_id and result_type='payment_not_received') then raise exception 'Payment not received was already recorded'; end if;\n    insert into public.driver_trip_payment_results(order_id,assigned_driver_id,result_type,amount_collected,payment_method,completed_at,actor_id,note) values(p_order_id,v_driver,'payment_not_received',0,'none',v_delivered_at,v_actor,nullif(btrim(coalesce(p_note,'')),'')) returning id into v_id;\n    update public.orders set payment_status='unpaid' where id=p_order_id;\n    return v_id;\n  end if;\n  if p_result_type='cash_received' then\n    if v_method <> 'cash' then raise exception 'Customer selected Bank / Telebirr for this order'; end if;\n    if p_amount_collected is null or abs(p_amount_collected-v_total)>0.005 then raise exception 'Exact collected amount must be ETB %',v_total; end if;\n    insert into public.payments(order_id,provider,amount_etb,event,raw_payload) values(p_order_id,'cash_to_driver',v_total,'released',jsonb_build_object('source','driver_finish_trip','collection_method','cash','collected_by',v_actor,'collected_at',now())) returning id into v_payment;\n    v_commission:=round(v_total*0.02,2);\n    select coalesce(sum(amount_etb),0) into v_deposit from public.driver_commission_deposits where driver_id=v_driver and status='active';\n    select greatest(0,v_deposit-v_commission),least(v_deposit,v_commission),greatest(0,v_commission-v_deposit) into v_deposit,v_consumed,v_due;\n    insert into public.driver_trip_payment_results(order_id,assigned_driver_id,payment_id,result_type,amount_collected,payment_method,collected_at,completed_at,actor_id,note,commission_etb,driver_gross_etb,driver_net_etb,deposit_before_etb,deposit_consumed_etb,deposit_after_etb,commission_due_after_etb) values(p_order_id,v_driver,v_payment,'cash_received',v_total,'cash',now(),v_delivered_at,v_actor,nullif(btrim(coalesce(p_note,'')),''),v_commission,v_total,v_total-v_commission,v_deposit+v_consumed,v_consumed,v_deposit,v_due) returning id into v_id;\n    perform public.recompute_order_payment_status(p_order_id); return v_id;\n  end if;\n  if v_method <> 'bank_telebirr' then raise exception 'Customer selected Cash for this order'; end if;\n  select id into v_payment from public.payments where order_id=p_order_id and event in ('initiated','held_escrow','released') and lower(replace(btrim(provider),' ','_')) not in ('cash','cash_to_driver','driver_cash') order by created_at desc limit 1 for update;\n  if v_payment is null then raise exception 'No HALLO Bank / Telebirr platform payment exists for this order'; end if;\n  update public.payments set event=case when event='initiated' then 'held_escrow'::public.payment_event else event end where id=v_payment;\n  v_commission:=round(v_total*0.02,2);\n  select coalesce(sum(amount_etb),0) into v_deposit from public.driver_commission_deposits where driver_id=v_driver and status='active';\n  insert into public.driver_trip_payment_results(order_id,assigned_driver_id,payment_id,result_type,amount_collected,payment_method,collected_at,completed_at,actor_id,note,commission_etb,driver_gross_etb,driver_net_etb,deposit_before_etb,deposit_consumed_etb,deposit_after_etb,commission_due_after_etb) values(p_order_id,v_driver,v_payment,'bank_telebirr',v_total,'bank_telebirr',now(),v_delivered_at,v_actor,nullif(btrim(coalesce(p_note,'')),''),v_commission,v_total,v_total-v_commission,v_deposit,0,v_deposit,0) returning id into v_id;\n  insert into public.driver_payment_confirmation_events(order_id,assigned_driver_id,payment_id,confirmation_type,confirmed_amount_etb,provider,provider_ref,actor_id) select p_order_id,v_driver,p.id,'payment_confirmed',p.amount_etb,p.provider,p.provider_ref,v_actor from public.payments p where p.id=v_payment on conflict(payment_id,confirmation_type) do nothing;\n  perform public.recompute_order_payment_status(p_order_id); return v_id;\nexception when unique_violation then raise exception 'This trip payment result was already recorded';\nend; $$;\nrevoke all on function public.driver_record_trip_payment_result(uuid,text,numeric,text) from public,anon;\ngrant execute on function public.driver_record_trip_payment_result(uuid,text,numeric,text) to authenticated;\n\ncreate or replace function public.customer_submit_rating(p_order_id uuid,p_score smallint,p_comment text default null) returns public.ratings language plpgsql security definer set search_path='' as $$\ndeclare v_customer uuid:=auth.uid(); v_driver uuid; v_rating public.ratings; begin\n  if v_customer is null then raise exception 'Sign in required'; end if;\n  if p_score<1 or p_score>5 then raise exception 'Rating must be between 1 and 5'; end if;\n  select driver_id into v_driver from public.orders where id=p_order_id and customer_id=v_customer and status='delivered' and driver_id is not null;\n  if v_driver is null then raise exception 'Only the owning customer may rate a completed order'; end if;\n  if exists(select 1 from public.ratings where order_id=p_order_id) then raise exception 'This order was already rated'; end if;\n  insert into public.ratings(order_id,customer_id,driver_id,score,comment) values(p_order_id,v_customer,v_driver,p_score,nullif(left(btrim(coalesce(p_comment,'')),500),'')) returning * into v_rating; return v_rating;\nend; $$;\nrevoke all on function public.customer_submit_rating(uuid,smallint,text) from public,anon;\ngrant execute on function public.customer_submit_rating(uuid,smallint,text) to authenticated;\n\nnotify pgrst,'reload schema';\ncommit;\n`;
await write("supabase/migrations/20260828173000_simplified_customer_driver_workflow.sql", migration);

const test = `import test from "node:test";\nimport assert from "node:assert/strict";\nimport { readFile } from "node:fs/promises";\nconst migration = await readFile(new URL("../../supabase/migrations/20260828173000_simplified_customer_driver_workflow.sql", import.meta.url), "utf8");\nconst customer = await readFile(new URL("../../src/pages/CustomerPortal.tsx", import.meta.url), "utf8");\nconst driver = await readFile(new URL("../../src/pages/DriverPaymentCollection.tsx", import.meta.url), "utf8");\nconst rating = await readFile(new URL("../../src/components/customer/CustomerRatingCard.tsx", import.meta.url), "utf8");\ntest("simplified workflow preserves assignment and duplicate safety", () => { assert.match(migration,/database-assigned driver|v_driver is distinct from v_actor/); assert.match(migration,/Payment result already confirmed/); assert.match(migration,/payment_not_received/); });\ntest("cash commission consumes deposit while bank leaves deposit unchanged", () => { assert.match(migration,/v_commission:=round\(v_total\*0\.02,2\)/); assert.match(migration,/deposit_consumed_etb/); assert.match(migration,/bank_telebirr'[\\s\\S]*v_deposit,0,v_deposit,0/); });\ntest("customer receipt flow is removed and payment method is selected", () => { assert.doesNotMatch(customer,/CustomerPaymentModal/); assert.match(customer,/Bank \/ Telebirr/); assert.match(customer,/No receipt or screenshot/); });\ntest("driver records all three payment outcomes", () => { assert.match(driver,/cash_received/); assert.match(driver,/bank_telebirr/); assert.match(driver,/payment_not_received/); assert.match(driver,/Exact amount collected/); });\ntest("rating is optional and duplicate ratings are insert-only", () => { assert.match(rating,/Skip|Darbii|ዝለል/); assert.match(migration,/already rated/); assert.doesNotMatch(migration,/on conflict \(order_id\) do update/); });\n`;
await write("tests/regression/simplified-customer-driver-workflow.test.ts", test);

await patch("scripts/run-regression-tests.mjs", (content) => replaceOnce(content,
`  ["tests/regression/trip-completion-workflow.test.ts",path.join(outputDirectory,"trip-completion-workflow.test.mjs")],`,
`  ["tests/regression/trip-completion-workflow.test.ts",path.join(outputDirectory,"trip-completion-workflow.test.mjs")],
  ["tests/regression/simplified-customer-driver-workflow.test.ts",path.join(outputDirectory,"simplified-customer-driver-workflow.test.mjs")],`, "scripts/run-regression-tests.mjs"));

await rm(path.join(root, "scripts/apply-simplified-customer-driver-workflow.mjs"), { force: true });
await rm(path.join(root, ".github/workflows/apply-simplified-customer-driver-workflow.yml"), { force: true });
