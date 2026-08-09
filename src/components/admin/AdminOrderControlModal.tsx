import { FormEvent, PointerEvent, useMemo, useRef, useState } from "react";
import {
  AdminOrder,
  DeliveryProof,
  Driver,
  Payment,
  Truck,
  assignOrder,
  openDeliveryProof,
  printInvoice,
  recordPayment,
  submitDeliveryProof,
  transitionOrder,
} from "../../services/admin.service";

interface Props {
  order: AdminOrder;
  orders: AdminOrder[];
  trucks: Truck[];
  drivers: Driver[];
  payments: Payment[];
  proof?: DeliveryProof;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

const stages = ["placed", "accepted", "in_transit", "delivered"] as const;

export function AdminOrderControlModal({ order, orders, trucks, drivers, payments, proof, onClose, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const currentStage = Math.max(0, stages.indexOf(order.status as (typeof stages)[number]));
  const activeStatuses = new Set(["accepted", "in_transit"]);
  const busyDriverIds = useMemo(
    () => new Set(orders.filter((item) => item.id !== order.id && activeStatuses.has(item.status) && item.driver_id).map((item) => item.driver_id as string)),
    [orders, order.id],
  );
  const compatibleTrucks = trucks.filter(
    (truck) =>
      (truck.status === "available" || truck.id === order.truck_id) &&
      truck.vehicle_type.trim().toLowerCase() === order.vehicle_type.trim().toLowerCase(),
  );
  const assignableDrivers = drivers.filter(
    (driver) => driver.id === order.driver_id || (!busyDriverIds.has(driver.id) && driver.driver_status !== "blocked"),
  );

  const orderPayments = payments.filter((payment) => payment.order_id === order.id);
  const invoiceTotal = Number(order.price_etb ?? 0);
  const releasedGross = orderPayments.filter((payment) => payment.event === "released").reduce((sum, payment) => sum + Number(payment.amount_etb || 0), 0);
  const creditRefunded = orderPayments
    .filter((payment) => payment.event === "refunded" && payment.provider === "credit_refund")
    .reduce((sum, payment) => sum + Number(payment.amount_etb || 0), 0);
  const verifiedPaid = Math.max(0, releasedGross - creditRefunded);
  const heldEscrow = orderPayments.filter((payment) => payment.event === "held_escrow").reduce((sum, payment) => sum + Number(payment.amount_etb || 0), 0);
  const balance = Math.max(0, invoiceTotal - verifiedPaid);
  const truck = trucks.find((item) => item.id === order.truck_id);
  const driver = drivers.find((item) => item.id === order.driver_id);
  const assignmentOpen = order.status === "placed" || order.status === "accepted";

  async function run(action: () => Promise<void>) {
    setSaving(true);
    setError("");
    try {
      await action();
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
      setSaving(false);
    }
  }

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(() => assignOrder(order.id, String(form.get("truckId")), String(form.get("driverId"))));
  }

  async function pay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(() =>
      recordPayment({
        orderId: order.id,
        provider: String(form.get("provider")),
        providerRef: String(form.get("providerRef") || ""),
        amountEtb: Number(form.get("amountEtb")),
        event: String(form.get("event")) as "initiated" | "held_escrow" | "released" | "refunded" | "failed",
      }),
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-asphalt/75 p-2 sm:p-4">
      <div className="max-h-[96vh] w-full max-w-5xl overflow-y-auto bg-[#f5f3ed] shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-asphalt px-5 py-5 text-white sm:px-7">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-xs tracking-[.12em] text-amber">{order.tracking_id}</p>
              <StatusBadge status={order.status} />
              <PaymentBadge status={order.payment_status} />
            </div>
            <h2 className="mt-2 font-display text-2xl font-bold sm:text-3xl">Operations control</h2>
            <p className="mt-1 text-xs text-white/50">Dispatch, trip, payment and delivery records for one shipment.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close order control" className="grid h-10 w-10 shrink-0 place-items-center border border-white/20 text-2xl text-white/70">×</button>
        </header>

        <div className="p-4 sm:p-6">
          {error && <p className="mb-5 border border-route/30 bg-route/10 p-3 text-sm text-route">{error}</p>}

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Customer" value={order.customer_name || "Walk-in customer"} meta={order.customer_phone || "No phone"} />
            <SummaryCard label="Vehicle" value={order.vehicle_type} meta={truck ? `${truck.plate_number}${truck.capacity_tons ? ` · ${truck.capacity_tons} tons` : ""}` : "Truck not assigned"} />
            <SummaryCard label="Driver" value={driver?.full_name || driver?.phone || "Not assigned"} meta={driver?.driver_status ? `Status: ${driver.driver_status}` : "Dispatch pending"} />
            <SummaryCard label="Invoice" value={`ETB ${invoiceTotal.toLocaleString()}`} meta={`Balance ETB ${balance.toLocaleString()}`} />
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
            <div className="border border-asphalt/10 bg-white p-5 sm:p-6">
              <p className="font-mono text-[10px] tracking-[.18em] text-amber-dim">ROUTE & CARGO</p>
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-steel">Pickup</p>
                  <p className="mt-1 text-sm font-semibold">{order.pickup_address}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-steel">Drop-off</p>
                  <p className="mt-1 text-sm font-semibold">{order.dropoff_address}</p>
                </div>
              </div>
              <div className="mt-5 border-t border-asphalt/10 pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-steel">Cargo</p>
                <p className="mt-1 text-sm">{order.cargo_description || "No cargo description recorded."}</p>
              </div>
            </div>

            <div className="border border-asphalt/10 bg-white p-5 sm:p-6">
              <p className="font-mono text-[10px] tracking-[.18em] text-amber-dim">KEY TIMES</p>
              <TimeRow label="Created" value={order.created_at} />
              <TimeRow label="Accepted" value={order.accepted_at} />
              <TimeRow label="Delivered" value={order.delivered_at} />
            </div>
          </section>

          <section className="mt-5 border border-asphalt/10 bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] tracking-[.18em] text-amber-dim">SHIPMENT WORKFLOW</p>
                <h3 className="mt-1 font-display text-xl font-semibold">Status timeline</h3>
              </div>
              {order.status === "accepted" && (
                <button disabled={saving} onClick={() => run(() => transitionOrder(order.id, "in_transit"))} className="bg-asphalt px-4 py-3 text-xs font-semibold text-white disabled:opacity-40">
                  {saving ? "Updating…" : "Start transit"}
                </button>
              )}
            </div>
            <div className="mt-5 grid grid-cols-4 gap-1 sm:gap-3">
              {stages.map((stage, index) => {
                const done = index <= currentStage;
                const current = index === currentStage;
                return (
                  <div key={stage} className="min-w-0">
                    <div className={`h-1.5 ${done ? "bg-emerald-700" : "bg-asphalt/10"}`} />
                    <p className={`mt-2 truncate text-[10px] font-semibold capitalize sm:text-xs ${current ? "text-asphalt" : done ? "text-emerald-700" : "text-steel"}`}>{stage.replace("_", " ")}</p>
                    {current && <p className="mt-1 hidden text-[10px] text-amber-dim sm:block">Current stage</p>}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="mt-5 grid gap-5 xl:grid-cols-2">
            <div className="border border-asphalt/10 bg-white p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-[10px] tracking-[.18em] text-amber-dim">DISPATCH</p>
                  <h3 className="mt-1 font-display text-xl font-semibold">Truck & driver</h3>
                </div>
                {truck && driver && <span className="bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">ASSIGNED</span>}
              </div>

              {assignmentOpen ? (
                <form onSubmit={assign} className="mt-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SelectField name="truckId" label="Compatible truck" defaultValue={order.truck_id ?? ""} options={compatibleTrucks.map((item) => [item.id, `${item.plate_number} · ${item.vehicle_type} · ${item.status}`])} />
                    <SelectField name="driverId" label="Available driver" defaultValue={order.driver_id ?? ""} options={assignableDrivers.map((item) => [item.id, item.full_name || item.phone || "Driver"])} />
                  </div>
                  {!compatibleTrucks.length && <p className="mt-3 text-xs text-route">No available {order.vehicle_type} truck is ready for this order.</p>}
                  {!assignableDrivers.length && <p className="mt-3 text-xs text-route">No free approved driver is available right now.</p>}
                  <p className="mt-3 text-[11px] text-steel">Only trucks matching this order's vehicle type are shown. Drivers already on another active trip are hidden.</p>
                  <button disabled={saving || !compatibleTrucks.length || !assignableDrivers.length} className="mt-4 w-full bg-asphalt py-3.5 text-sm font-semibold text-white disabled:opacity-35">
                    {saving ? "Assigning…" : order.status === "placed" ? "Assign & accept order" : "Update assignment"}
                  </button>
                </form>
              ) : (
                <div className="mt-4 border border-asphalt/10 bg-bone p-4 text-sm">
                  <p><span className="text-steel">Truck:</span> <strong>{truck?.plate_number || "Not assigned"}</strong></p>
                  <p className="mt-2"><span className="text-steel">Driver:</span> <strong>{driver?.full_name || driver?.phone || "Not assigned"}</strong></p>
                  <p className="mt-3 text-[11px] text-steel">Assignment is locked while a shipment is in transit or delivered.</p>
                </div>
              )}
            </div>

            <div className="border border-asphalt/10 bg-white p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-[10px] tracking-[.18em] text-amber-dim">FINANCE</p>
                  <h3 className="mt-1 font-display text-xl font-semibold">Invoice balance</h3>
                </div>
                <button type="button" onClick={() => printInvoice(order, truck, driver, orderPayments)} className="border border-asphalt px-3 py-2 text-xs font-semibold">Invoice / PDF</button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <MoneyBox label="Invoice total" value={invoiceTotal} />
                <MoneyBox label="Verified paid" value={verifiedPaid} />
                <MoneyBox label="Held escrow" value={heldEscrow} />
                <MoneyBox label="Balance" value={balance} strong />
              </div>
              {creditRefunded > 0 && <p className="mt-3 bg-emerald-50 p-3 text-xs text-emerald-800">Credit refunded: ETB {creditRefunded.toLocaleString()}</p>}
            </div>
          </section>

          {order.status === "in_transit" && <DeliveryProofForm orderId={order.id} saving={saving} onSubmit={(input) => run(() => submitDeliveryProof(input))} />}

          {proof && (
            <section className="mt-5 border border-emerald-700/30 bg-emerald-50 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] tracking-[.18em] text-emerald-700">DELIVERY COMPLETE</p>
                  <h3 className="mt-1 font-display text-xl font-semibold text-emerald-900">Proof of delivery recorded</h3>
                  <p className="mt-2 text-sm text-emerald-900">Received by {proof.recipient_name} · {new Date(proof.delivered_at).toLocaleString()}</p>
                  {proof.delivery_note && <p className="mt-2 text-xs text-emerald-900/70">{proof.delivery_note}</p>}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => openDeliveryProof(proof.photo_path)} className="border border-emerald-700 px-3 py-2 text-xs font-semibold text-emerald-800">Photo</button>
                  <button type="button" onClick={() => openDeliveryProof(proof.signature_path)} className="border border-emerald-700 px-3 py-2 text-xs font-semibold text-emerald-800">Signature</button>
                </div>
              </div>
            </section>
          )}

          <section className="mt-5 border border-asphalt/10 bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] tracking-[.18em] text-amber-dim">PAYMENT LEDGER</p>
                <h3 className="mt-1 font-display text-xl font-semibold">Record payment event</h3>
                <p className="mt-1 text-[11px] text-steel">New payments start as initiated by default. Release remains subject to delivery and invoice-balance guards.</p>
              </div>
              <span className="font-mono text-xs text-steel">{orderPayments.length} records</span>
            </div>

            <form onSubmit={pay} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <InputField name="provider" label="Provider" placeholder="telebirr / bank" />
              <InputField name="providerRef" label="Transaction ID" required={false} placeholder="Reference" />
              <InputField name="amountEtb" label="Amount ETB" type="number" />
              <SelectField name="event" label="Payment event" defaultValue="initiated" options={[
                ["initiated", "Initiated"],
                ["held_escrow", "Held in escrow"],
                ["released", "Verified / released"],
                ["refunded", "Refunded"],
                ["failed", "Failed"],
              ]} />
              <button disabled={saving} className="bg-asphalt py-3.5 text-sm font-semibold text-white disabled:opacity-40 sm:col-span-2 lg:col-span-4">{saving ? "Saving…" : "Save payment event"}</button>
            </form>

            {orderPayments.length > 0 && (
              <div className="mt-5 overflow-x-auto border border-asphalt/10">
                <table className="w-full min-w-[620px] text-left text-xs">
                  <thead className="bg-bone text-steel"><tr><th className="p-3">Date</th><th className="p-3">Provider</th><th className="p-3">Transaction ID</th><th className="p-3">Event</th><th className="p-3 text-right">Amount</th></tr></thead>
                  <tbody className="divide-y divide-asphalt/10">
                    {orderPayments.map((payment) => (
                      <tr key={payment.id}>
                        <td className="p-3 whitespace-nowrap">{new Date(payment.created_at).toLocaleString()}</td>
                        <td className="p-3">{payment.provider}</td>
                        <td className="p-3 font-mono">{payment.provider_ref || "—"}</td>
                        <td className="p-3 capitalize">{payment.event.replace("_", " ")}</td>
                        <td className="p-3 text-right font-semibold">ETB {Number(payment.amount_etb).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const live = ["accepted", "in_transit"].includes(status);
  return <span className={`px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${status === "delivered" ? "bg-emerald-700 text-white" : live ? "bg-amber text-asphalt" : "bg-white/10 text-white/70"}`}>{status.replace("_", " ")}</span>;
}

function PaymentBadge({ status }: { status: string }) {
  return <span className="bg-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/70">Payment: {status.replace("_", " ")}</span>;
}

function SummaryCard({ label, value, meta }: { label: string; value: string; meta: string }) {
  return <div className="border border-asphalt/10 bg-white p-4"><p className="text-[10px] font-semibold uppercase tracking-wide text-steel">{label}</p><p className="mt-2 truncate text-sm font-semibold">{value}</p><p className="mt-1 truncate text-[11px] text-steel">{meta}</p></div>;
}

function TimeRow({ label, value }: { label: string; value: string | null }) {
  return <div className="flex justify-between gap-4 border-b border-asphalt/10 py-3 text-xs last:border-0"><span className="text-steel">{label}</span><strong className="text-right">{value ? new Date(value).toLocaleString() : "Pending"}</strong></div>;
}

function MoneyBox({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return <div className={`border p-3 ${strong ? "border-amber bg-amber/10" : "border-asphalt/10 bg-bone"}`}><p className="text-[10px] uppercase tracking-wide text-steel">{label}</p><p className={`mt-1 ${strong ? "font-display text-xl font-bold" : "text-sm font-semibold"}`}>ETB {value.toLocaleString()}</p></div>;
}

function InputField({ name, label, type = "text", required = true, placeholder }: { name: string; label: string; type?: string; required?: boolean; placeholder?: string }) {
  return <label className="text-xs font-semibold">{label}<input name={name} type={type} required={required} min={type === "number" ? 0.01 : undefined} step={type === "number" ? "0.01" : undefined} placeholder={placeholder} className="mt-2 block w-full border border-asphalt/20 bg-white px-3 py-3 text-sm font-normal outline-none focus:border-amber" /></label>;
}

function SelectField({ name, label, options, defaultValue }: { name: string; label: string; options: string[][]; defaultValue: string }) {
  return <label className="text-xs font-semibold">{label}<select name={name} required defaultValue={defaultValue} className="mt-2 block w-full border border-asphalt/20 bg-white px-3 py-3 text-sm"><option value="" disabled>Select {label.toLowerCase()}</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>;
}

function DeliveryProofForm({ orderId, saving, onSubmit }: { orderId: string; saving: boolean; onSubmit: (input: { orderId: string; recipientName: string; deliveryNote: string; photo: File; signature: Blob }) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [signed, setSigned] = useState(false);
  const [error, setError] = useState("");

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const target = canvas.current!;
    const rect = target.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * (target.width / rect.width), y: (event.clientY - rect.top) * (target.height / rect.height) };
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const context = canvas.current?.getContext("2d");
    const p = point(event);
    context?.beginPath();
    context?.moveTo(p.x, p.y);
    setSigned(true);
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const context = canvas.current?.getContext("2d");
    const p = point(event);
    if (context) {
      context.lineWidth = 3;
      context.lineCap = "round";
      context.strokeStyle = "#1d222a";
      context.lineTo(p.x, p.y);
      context.stroke();
    }
  }

  function clear() {
    const target = canvas.current;
    target?.getContext("2d")?.clearRect(0, 0, target.width, target.height);
    setSigned(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const photo = form.get("photo");
    if (!(photo instanceof File) || !photo.size) {
      setError("Delivery photo is required.");
      return;
    }
    if (!signed || !canvas.current) {
      setError("Recipient signature is required.");
      return;
    }
    canvas.current.toBlob((blob) => {
      if (!blob) {
        setError("Could not save signature.");
        return;
      }
      onSubmit({ orderId, recipientName: String(form.get("recipientName")), deliveryNote: String(form.get("deliveryNote") || ""), photo, signature: blob });
    }, "image/png");
  }

  return (
    <form onSubmit={submit} className="mt-5 border-2 border-emerald-700/30 bg-white p-5 sm:p-6">
      <p className="font-mono text-[10px] tracking-[.18em] text-emerald-700">PROOF OF DELIVERY</p>
      <h3 className="mt-1 font-display text-xl font-semibold">Complete delivery</h3>
      <p className="mt-1 text-xs text-steel">Photo, recipient name and signature are required before the shipment can close.</p>
      {error && <p className="mt-3 bg-route/10 p-2 text-xs text-route">{error}</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <InputField name="recipientName" label="Received by" />
        <label className="text-xs font-semibold">Delivery photo<input name="photo" type="file" accept="image/*" capture="environment" required className="mt-2 block w-full border border-asphalt/20 px-3 py-3 text-sm" /></label>
      </div>
      <label className="mt-3 block text-xs font-semibold">Delivery note<textarea name="deliveryNote" rows={3} className="mt-2 block w-full border border-asphalt/20 px-3 py-3 text-sm" placeholder="Package condition, recipient comment…" /></label>
      <div className="mt-3">
        <div className="flex justify-between"><span className="text-xs font-semibold">Recipient signature</span><button type="button" onClick={clear} className="text-xs text-route">Clear</button></div>
        <canvas ref={canvas} width={600} height={180} onPointerDown={start} onPointerMove={move} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} className="mt-2 h-36 w-full touch-none border border-asphalt/20 bg-white" />
      </div>
      <button disabled={saving} className="mt-4 w-full bg-emerald-700 py-4 font-semibold text-white disabled:opacity-40">{saving ? "Uploading proof…" : "Submit proof & mark delivered"}</button>
    </form>
  );
}
