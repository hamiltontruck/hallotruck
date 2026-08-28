from pathlib import Path


def replace_once(source: str, before: str, after: str, file: str) -> str:
    if before not in source:
        raise RuntimeError(f"Expected text not found in {file}: {before[:120]}")
    return source.replace(before, after, 1)

# Make the newly generated regression test resolve files from the repository root.
test = Path("tests/regression/simplified-customer-driver-workflow.test.ts")
source = test.read_text()
source = source.replace('import { readFile } from "node:fs/promises";\n', 'import { readFile } from "node:fs/promises";\nimport path from "node:path";\n')
source = source.replace('await readFile(new URL("../../supabase/migrations/20260828173000_simplified_customer_driver_workflow.sql", import.meta.url), "utf8")', 'await readFile(path.join(process.cwd(), "supabase/migrations/20260828173000_simplified_customer_driver_workflow.sql"), "utf8")')
source = source.replace('await readFile(new URL("../../src/pages/CustomerPortal.tsx", import.meta.url), "utf8")', 'await readFile(path.join(process.cwd(), "src/pages/CustomerPortal.tsx"), "utf8")')
source = source.replace('await readFile(new URL("../../src/pages/DriverPaymentCollection.tsx", import.meta.url), "utf8")', 'await readFile(path.join(process.cwd(), "src/pages/DriverPaymentCollection.tsx"), "utf8")')
source = source.replace('await readFile(new URL("../../src/components/customer/CustomerRatingCard.tsx", import.meta.url), "utf8")', 'await readFile(path.join(process.cwd(), "src/components/customer/CustomerRatingCard.tsx"), "utf8")')
test.write_text(source)

# Driver completion progress: once delivery is complete, commission reconciliation is the
# current next step whenever payment still needs attention or review.
domain = Path("src/domain/trip-completion.ts")
source = domain.read_text()
source = replace_once(
    source,
    '''      state: paymentComplete && summary.commission_charged_etb > 0
        ? "complete"
        : paymentComplete ? "current" : "waiting",''',
    '''      state: paymentComplete && summary.commission_charged_etb > 0
        ? "complete"
        : delivered ? "current" : "waiting",''',
    str(domain),
)
domain.write_text(source)

# The delivery service calls one database transaction that records POD, completion and
# the selected payment result. Uploaded files are still cleaned up if the RPC fails.
service = Path("src/services/delivery-proof.service.ts")
source = service.read_text()
source = replace_once(
    source,
    '''  photo: File;
  signature: Blob;
}''',
    '''  photo: File;
  signature: Blob;
  paymentResult: "cash_received" | "bank_telebirr" | "payment_not_received";
  amountCollected?: number;
  paymentNote?: string;
}''',
    str(service),
)
source = replace_once(
    source,
    '''    const { error } = await supabase.rpc("submit_delivery_proof", {
      p_order_id: input.orderId,
      p_recipient_name: recipientName,
      p_delivery_note: input.deliveryNote.trim() || null,
      p_photo_path: photoPath,
      p_signature_path: signaturePath,
    });''',
    '''    const { error } = await supabase.rpc("driver_finish_trip", {
      p_order_id: input.orderId,
      p_recipient_name: recipientName,
      p_delivery_note: input.deliveryNote.trim() || null,
      p_photo_path: photoPath,
      p_signature_path: signaturePath,
      p_result_type: input.paymentResult,
      p_amount_collected: input.amountCollected ?? null,
      p_payment_note: input.paymentNote?.trim() || null,
    });''',
    str(service),
)
service.write_text(source)

# Add payment result selection to Finish Trip and pass it to the atomic RPC.
form = Path("src/components/driver/DriverDeliveryProofForm.tsx")
source = form.read_text()
source = replace_once(
    source,
    '''  orderId,
  onDelivered,
}: {
  orderId: string;
  onDelivered: () => void;
}) {''',
    '''  orderId,
  tripAmountEtb,
  onDelivered,
}: {
  orderId: string;
  tripAmountEtb: number;
  onDelivered: () => void;
}) {''',
    str(form),
)
source = replace_once(
    source,
    '''  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");''',
    '''  const [saving, setSaving] = useState(false);
  const [completionResult, setCompletionResult] = useState<"cash_received" | "bank_telebirr" | "payment_not_received" | "">("");
  const [amountCollected, setAmountCollected] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [error, setError] = useState("");''',
    str(form),
)
source = replace_once(
    source,
    '''    if (!signed || !canvas.current) return setError(c.signatureRequired);

    const signature = await new Promise<Blob | null>((resolve) => canvas.current?.toBlob(resolve, "image/png"));''',
    '''    if (!signed || !canvas.current) return setError(c.signatureRequired);
    if (!completionResult) return setError("Choose Cash received, Bank / Telebirr, or Payment not received.");
    if (completionResult === "cash_received" && Math.abs(Number(amountCollected) - tripAmountEtb) > 0.005) {
      return setError(`Enter the exact collected amount: ETB ${tripAmountEtb.toLocaleString()}.`);
    }

    const signature = await new Promise<Blob | null>((resolve) => canvas.current?.toBlob(resolve, "image/png"));''',
    str(form),
)
source = replace_once(
    source,
    '''        photo,
        signature,
      });''',
    '''        photo,
        signature,
        paymentResult: completionResult,
        amountCollected: completionResult === "cash_received" ? Number(amountCollected) : undefined,
        paymentNote,
      });''',
    str(form),
)
anchor = '''        <section className={`mt-4 rounded-2xl border p-4 ${completionReady ? "border-emerald-300 bg-emerald-50" : "border-amber/25 bg-amber/5"}`}>
          <StepHeading number={4} label={journey.complete} done={completionReady} ready={journey.ready} waiting={journey.waiting} />'''
replacement = '''        <section className="mt-4 rounded-2xl border border-asphalt/10 bg-white p-4">
          <p className="text-sm font-semibold text-asphalt">Payment result</p>
          <p className="mt-1 text-xs text-steel">Choose one result before Finish Trip. The customer does not confirm payment.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {([
              ["cash_received", "Cash received"],
              ["bank_telebirr", "Bank / Telebirr"],
              ["payment_not_received", "Payment not received"],
            ] as const).map(([value, label]) => (
              <label key={value} className={`rounded-xl border p-3 text-xs font-semibold ${completionResult === value ? "border-asphalt bg-asphalt text-white" : "border-asphalt/15 bg-white text-asphalt"}`}>
                <input type="radio" name="completionResult" value={value} checked={completionResult === value} onChange={() => setCompletionResult(value)} className="mr-2" />
                {label}
              </label>
            ))}
          </div>
          {completionResult === "cash_received" && <label className="mt-4 block text-xs font-semibold text-asphalt">Exact amount collected<input value={amountCollected} onChange={(event) => setAmountCollected(event.target.value)} type="number" inputMode="decimal" min="0.01" step="0.01" className="mt-2 block w-full rounded-xl border border-asphalt/15 px-4 py-3 text-sm font-normal" /><span className="mt-2 block font-normal text-steel">Required amount: ETB {tripAmountEtb.toLocaleString()}</span></label>}
          <label className="mt-4 block text-xs font-semibold text-asphalt">Optional payment note<textarea value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} maxLength={500} rows={2} className="mt-2 block w-full rounded-xl border border-asphalt/15 px-4 py-3 text-sm font-normal" /></label>
        </section>

        <section className={`mt-4 rounded-2xl border p-4 ${completionReady && completionResult ? "border-emerald-300 bg-emerald-50" : "border-amber/25 bg-amber/5"}`}>
          <StepHeading number={4} label={journey.complete} done={completionReady && Boolean(completionResult)} ready={journey.ready} waiting={journey.waiting} />'''
source = replace_once(source, anchor, replacement, str(form))
source = source.replace('disabled={saving || !completionReady}', 'disabled={saving || !completionReady || !completionResult}')
form.write_text(source)

# Finish Trip now navigates directly to immutable Trip History after the atomic RPC.
active = Path("src/pages/ActiveTrip.tsx")
source = active.read_text()
source = source.replace('import { getDriverPostDeliveryRoute } from "../domain/trip-completion";\n', '')
source = replace_once(
    source,
    '''<DriverDeliveryProofForm orderId={order.id} onDelivered={() => {
          stopSharing();
          navigate(getDriverPostDeliveryRoute(order.payment_terms, order.id));
        }} />''',
    '''<DriverDeliveryProofForm orderId={order.id} tripAmountEtb={grossFare} onDelivered={() => {
          stopSharing();
          navigate("/driver/earnings");
        }} />''',
    str(active),
)
active.write_text(source)

# Append an atomic wrapper to the generated migration before schema reload/commit.
migration = Path("supabase/migrations/20260828173000_simplified_customer_driver_workflow.sql")
source = migration.read_text()
atomic_sql = r'''
create or replace function public.driver_finish_trip(
  p_order_id uuid,
  p_recipient_name text,
  p_delivery_note text,
  p_photo_path text,
  p_signature_path text,
  p_result_type text,
  p_amount_collected numeric default null,
  p_payment_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_driver uuid;
  v_status public.order_status;
  v_result_id uuid;
begin
  if v_actor is null then raise exception 'Driver sign-in required'; end if;

  select driver_id, status
  into v_driver, v_status
  from public.orders
  where id = p_order_id
  for update;

  if not found then raise exception 'Order not found'; end if;
  if v_driver is distinct from v_actor then
    raise exception 'Only the database-assigned driver may finish this trip';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = v_actor and role::text = 'driver'
  ) then raise exception 'Driver role required'; end if;

  if v_status = 'delivered'
    or exists (select 1 from public.delivery_proofs where order_id = p_order_id)
    or exists (select 1 from public.driver_trip_payment_results where order_id = p_order_id)
  then
    raise exception 'This trip was already completed';
  end if;
  if v_status <> 'in_transit' then raise exception 'Trip must be in transit'; end if;

  perform public.submit_delivery_proof(
    p_order_id,
    p_recipient_name,
    p_delivery_note,
    p_photo_path,
    p_signature_path
  );

  select public.driver_record_trip_payment_result(
    p_order_id,
    p_result_type,
    p_amount_collected,
    p_payment_note
  ) into v_result_id;

  return v_result_id;
end;
$function$;

revoke all on function public.driver_finish_trip(uuid,text,text,text,text,text,numeric,text)
  from public, anon;
grant execute on function public.driver_finish_trip(uuid,text,text,text,text,text,numeric,text)
  to authenticated;
'''
source = replace_once(source, "notify pgrst,'reload schema';\ncommit;", atomic_sql + "\nnotify pgrst,'reload schema';\ncommit;", str(migration))
migration.write_text(source)
