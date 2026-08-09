import { FormEvent, useEffect, useMemo, useState } from "react";
import { CustomerLiveTripMap } from "../tracking/CustomerLiveTripMap";
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
} from "../../services/admin.service";
import { supabase } from "../../services/supabase.client";

interface Props {
  order: AdminOrder;
  allOrders: AdminOrder[];
  trucks: Truck[];
  drivers: Driver[];
  onClose: () => void;
}

function money(value: number) {
  return `ETB ${Math.max(0, Number(value || 0)).toLocaleString()}`;
}

function label(value: string) {
  return value.replaceAll("_", " ");
}

function dateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

export function AdminOperationsControl({ order, allOrders, trucks, drivers, onClose }: Props) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [proof, setProof] = useState<DeliveryProof | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const currentTruck = order.truck_id ? trucks.find((item) => item.id === order.truck_id) : undefined;
  const currentDriver = order.driver_id ? drivers.find((item) => item.id === order.driver_id) : undefined;

  const activeDriverIds = useMemo(
    () => new Set(allOrders.filter((item) => item.id !== order.id && ["accepted", "in_transit"].includes(item.status) && item.driver_id).map((item) => item.driver_id as string)),
    [allOrders, order.id],
  );

  const eligibleTrucks = trucks.filter(
    (truck) =>
      truck.vehicle_type.toLowerCase() === order.vehicle_type.toLowerCase() &&
      (truck.status === "available" || truck.id === order.truck_id),
  );
  const eligibleDrivers = drivers.filter((driver) => !activeDriverIds.has(driver.id) || driver.id === order.driver_id);

  const released = payments
    .filter((payment) => payment.event === "released")
    .reduce((sum, payment) => sum + Number(payment.amount_etb || 0), 0);
  const creditRefunded = payments
    .filter((payment) => payment.event === "refunded" && payment.provider === "credit_refund")
    .reduce((sum, payment) => sum + Number(payment.amount_etb || 0), 0);
  const verifiedPaid = Math.max(0, released - creditRefunded);
  const invoiceTotal = Number(order.price_etb ?? 0);
  const balance = Math.max(0, invoiceTotal - verifiedPaid);
  const committed = payments
    .filter((payment) => ["initiated", "held_escrow", "released"].includes(payment.event))
    .reduce((sum, payment) => sum + Number(payment.amount_etb || 0), 0) - creditRefunded;
  const remainingToRecord = Math.max(0, invoiceTotal - committed);
  const activeTrip = ["accepted", "in_transit"].includes(order.status);

  async function loadDetails() {
    setLoading(true);
    const [paymentsResult, proofResult, distanceResult] = await Promise.all([
      supabase
        .from("payments")
        .select("id,order_id,provider,provider_ref,amount_etb,event,created_at")
        .eq("order_id", order.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("delivery_proofs")
        .select("id,order_id,recipient_name,delivery_note,photo_path,signature_path,delivered_at")
        .eq("order_id", order.id)
        .maybeSingle(),
      supabase.from("orders").select("distance_km").eq("id", order.id).single(),
    ]);
    const queryError = paymentsResult.error || proofResult.error || distanceResult.error;
    if (queryError) setError(queryError.message);
    else {
      setPayments((paymentsResult.data ?? []) as Payment[]);
      setProof((proofResult.data ?? null) as DeliveryProof | null);
      const value = Number(distanceResult.data?.distance_km ?? 0);
      setDistanceKm(value > 0 ? value : null);
      setError("");
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadDetails();
  }, [order.id]);

  async function handleAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (order.status !== "placed") return;
    const form = new FormData(event.currentTarget);
    const truckId = String(form.get("truckId") ?? "");
    const driverId = String(form.get("driverId") ?? "");
    if (!truckId || !driverId) {
      setError("Select both a matching truck and an available driver.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await assignOrder(order.id, truckId, driverId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assignment failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const provider = String(form.get("provider") ?? "");
    const providerRef = String(form.get("providerRef") ?? "").trim();
    const amountEtb = Number(form.get("amountEtb") ?? 0);
    if (!provider || amountEtb <= 0) {
      setError("Enter a valid payment method and amount.");
      return;
    }
    if (provider !== "cash" && !providerRef) {
      setError("Transaction ID / reference is required for non-cash payments.");
      return;
    }
    if (amountEtb > remainingToRecord) {
      setError(`Amount exceeds the remaining unrecorded invoice value of ${money(remainingToRecord)}.`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await recordPayment({ orderId: order.id, provider, providerRef, amountEtb, event: "initiated" });
      event.currentTarget.reset();
      await loadDetails();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment could not be recorded.");
    } finally {
      setSaving(false);
    }
  }

  const timeline = [
    { title: "Order placed", detail: dateTime(order.created_at), done: true },
    { title: "Truck & driver assigned", detail: order.accepted_at ? dateTime(order.accepted_at) : "Waiting for dispatch", done: Boolean(order.accepted_at) },
    { title: "Trip in transit", detail: order.status === "in_transit" ? "Live GPS active" : order.status === "delivered" ? "Completed" : "Waiting for driver GPS", done: ["in_transit", "delivered"].includes(order.status) },
    { title: "Proof of delivery", detail: proof ? `${proof.recipient_name} · ${dateTime(proof.delivered_at)}` : "Pending", done: Boolean(proof) },
    { title: "Delivered", detail: order.delivered_at ? dateTime(order.delivered_at) : "Pending", done: order.status === "delivered" },
  ];

  return (
    <div className="fixed inset-0 z-[70] bg-asphalt/70 p-0 sm:p-5">
      <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden bg-[#f5f3ed] shadow-2xl sm:h-[calc(100vh-40px)]">
        <header className="flex items-start justify-between gap-4 border-b border-asphalt/10 bg-asphalt px-5 py-5 text-white sm:px-7">
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-[.2em] text-amber">OPERATIONS CONTROL</p>
            <h2 className="mt-2 font-display text-2xl font-bold">{order.tracking_id}</h2>
            <p className="mt-1 truncate text-xs text-white/55">{order.pickup_address} → {order.dropoff_address}</p>
          </div>
          <button type="button" onClick={onClose} className="border border-white/20 px-3 py-2 text-sm">Close ×</button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-7">
          {error && <div className="mb-5 border border-route/35 bg-route/5 px-4 py-3 text-sm text-route">{error}</div>}
          {loading ? (
            <div className="py-16 text-center font-mono text-sm text-steel">Loading operation…</div>
          ) : (
            <div className="space-y-5">
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric label="Trip status" value={label(order.status)} />
                <Metric label="Payment" value={label(order.payment_status)} />
                <Metric label="Invoice balance" value={money(balance)} />
                <Metric label="Vehicle" value={currentTruck?.plate_number ?? order.vehicle_type} />
              </section>

              <section className="grid gap-5 xl:grid-cols-[1.3fr_.7fr]">
                <div className="border border-asphalt/10 bg-white p-5 sm:p-6">
                  <h3 className="font-display text-lg font-semibold">Shipment</h3>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2 text-sm">
                    <Info label="Customer" value={order.customer_name ?? "Customer"} detail={order.customer_phone ?? undefined} />
                    <Info label="Cargo" value={order.cargo_description ?? "General cargo"} detail={order.vehicle_type} />
                    <Info label="Pickup" value={order.pickup_address} />
                    <Info label="Drop-off" value={order.dropoff_address} />
                    <Info label="Driver" value={currentDriver?.full_name ?? currentDriver?.phone ?? "Unassigned"} />
                    <Info label="Truck" value={currentTruck?.plate_number ?? "Unassigned"} detail={currentTruck ? `${currentTruck.vehicle_type} · ${currentTruck.capacity_tons ?? "—"} tons` : order.vehicle_type} />
                  </div>
                </div>
                <div className="border border-asphalt/10 bg-white p-5 sm:p-6">
                  <h3 className="font-display text-lg font-semibold">Invoice</h3>
                  <div className="mt-4 space-y-3 text-sm">
                    <MoneyRow label="Invoice total" value={invoiceTotal} />
                    <MoneyRow label="Verified paid" value={verifiedPaid} />
                    <MoneyRow label="Balance" value={balance} strong />
                  </div>
                  <button type="button" onClick={() => printInvoice(order, currentTruck, currentDriver, payments)} className="mt-5 w-full bg-asphalt px-4 py-3 text-sm font-semibold text-white">Invoice / receipt</button>
                </div>
              </section>

              {activeTrip && (
                <section className="border border-asphalt/10 bg-white p-4 sm:p-6">
                  <div className="mb-4">
                    <p className="font-mono text-[10px] tracking-[.18em] text-amber-dim">LIVE OPERATIONS</p>
                    <h3 className="mt-1 font-display text-lg font-semibold">GPS, remaining distance & ETA</h3>
                  </div>
                  <CustomerLiveTripMap orderId={order.id} totalDistanceKm={distanceKm} />
                </section>
              )}

              <section className="grid gap-5 xl:grid-cols-2">
                <div className="border border-asphalt/10 bg-white p-5 sm:p-6">
                  <h3 className="font-display text-lg font-semibold">Dispatch</h3>
                  {order.status === "placed" ? (
                    <form onSubmit={handleAssign} className="mt-5 space-y-4">
                      <label className="block text-xs font-semibold">Matching truck
                        <select name="truckId" defaultValue="" className="mt-2 w-full border border-asphalt/20 bg-white p-3 text-sm" required>
                          <option value="" disabled>Select {order.vehicle_type}</option>
                          {eligibleTrucks.map((truck) => <option key={truck.id} value={truck.id}>{truck.plate_number} · {truck.vehicle_type} · {truck.capacity_tons ?? "—"} tons</option>)}
                        </select>
                      </label>
                      <label className="block text-xs font-semibold">Available driver
                        <select name="driverId" defaultValue="" className="mt-2 w-full border border-asphalt/20 bg-white p-3 text-sm" required>
                          <option value="" disabled>Select driver</option>
                          {eligibleDrivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.full_name ?? driver.phone ?? driver.id}</option>)}
                        </select>
                      </label>
                      <button disabled={saving || !eligibleTrucks.length || !eligibleDrivers.length} className="w-full bg-asphalt px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{saving ? "Assigning…" : "Assign truck & driver"}</button>
                      {(!eligibleTrucks.length || !eligibleDrivers.length) && <p className="text-xs text-route">A matching available truck and a free driver are required.</p>}
                    </form>
                  ) : (
                    <div className="mt-5 border border-asphalt/10 bg-bone p-4 text-sm">
                      <p className="font-semibold">Dispatch locked after trip acceptance</p>
                      <p className="mt-1 text-xs text-steel">Truck/driver reassignment is intentionally blocked here while a trip is active or completed.</p>
                    </div>
                  )}
                </div>

                <div className="border border-asphalt/10 bg-white p-5 sm:p-6">
                  <h3 className="font-display text-lg font-semibold">Record customer payment</h3>
                  <p className="mt-1 text-xs text-steel">New payments enter Finance as Initiated. Escrow/release remains a Finance action.</p>
                  {remainingToRecord > 0 ? (
                    <form onSubmit={handlePayment} className="mt-5 space-y-3">
                      <select name="provider" defaultValue="telebirr" className="w-full border border-asphalt/20 bg-white p-3 text-sm">
                        <option value="telebirr">telebirr</option><option value="cbe">CBE</option><option value="bank">Bank</option><option value="cash">Cash</option>
                      </select>
                      <input name="providerRef" placeholder="Transaction ID / reference" className="w-full border border-asphalt/20 p-3 text-sm" />
                      <input name="amountEtb" type="number" min="1" max={remainingToRecord} step="0.01" placeholder={`Amount · max ${remainingToRecord.toLocaleString()}`} className="w-full border border-asphalt/20 p-3 text-sm" required />
                      <button disabled={saving} className="w-full border border-asphalt bg-white px-4 py-3 text-sm font-semibold disabled:opacity-40">{saving ? "Saving…" : "Record as initiated"}</button>
                    </form>
                  ) : <p className="mt-5 text-sm text-emerald-700">Invoice value is fully recorded in the payment ledger.</p>}
                </div>
              </section>

              <section className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
                <div className="border border-asphalt/10 bg-white p-5 sm:p-6">
                  <h3 className="font-display text-lg font-semibold">Proof of delivery</h3>
                  {proof ? (
                    <div className="mt-4 space-y-3 text-sm">
                      <Info label="Recipient" value={proof.recipient_name} detail={dateTime(proof.delivered_at)} />
                      {proof.delivery_note && <Info label="Delivery note" value={proof.delivery_note} />}
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => openDeliveryProof(proof.photo_path)} className="border border-asphalt px-3 py-3 text-xs font-semibold">Open photo</button>
                        <button type="button" onClick={() => openDeliveryProof(proof.signature_path)} className="border border-asphalt px-3 py-3 text-xs font-semibold">Open signature</button>
                      </div>
                    </div>
                  ) : <p className="mt-4 text-sm text-steel">Pending driver photo, recipient name and signature.</p>}
                </div>
                <div className="border border-asphalt/10 bg-white p-5 sm:p-6">
                  <h3 className="font-display text-lg font-semibold">Operational timeline</h3>
                  <div className="mt-5 space-y-4">
                    {timeline.map((item) => <TimelineItem key={item.title} {...item} />)}
                  </div>
                </div>
              </section>

              <section className="border border-asphalt/10 bg-white">
                <div className="border-b border-asphalt/10 p-5 sm:px-6">
                  <h3 className="font-display text-lg font-semibold">Payment history</h3>
                </div>
                {payments.length ? payments.map((payment) => (
                  <div key={payment.id} className="grid gap-2 border-b border-asphalt/10 p-4 text-sm last:border-0 sm:grid-cols-[1fr_auto_auto] sm:px-6">
                    <div><p className="font-semibold">{payment.provider} · {payment.provider_ref ?? "No reference"}</p><p className="mt-1 text-xs text-steel">{dateTime(payment.created_at)}</p></div>
                    <span className="font-mono text-xs">{money(Number(payment.amount_etb))}</span>
                    <span className="text-xs font-semibold capitalize text-amber-dim">{label(payment.event)}</span>
                  </div>
                )) : <p className="p-6 text-sm text-steel">No payment records yet.</p>}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label: text, value }: { label: string; value: string }) {
  return <div className="border border-asphalt/10 bg-white p-4"><p className="text-[11px] text-steel">{text}</p><p className="mt-2 font-display text-xl font-semibold capitalize">{value}</p></div>;
}

function Info({ label: text, value, detail }: { label: string; value: string; detail?: string }) {
  return <div><p className="text-[11px] font-semibold uppercase tracking-wide text-steel">{text}</p><p className="mt-1 font-medium">{value}</p>{detail && <p className="mt-1 text-xs text-steel">{detail}</p>}</div>;
}

function MoneyRow({ label: text, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return <div className={`flex items-center justify-between border-b border-asphalt/10 pb-3 ${strong ? "font-semibold" : ""}`}><span>{text}</span><span>{money(value)}</span></div>;
}

function TimelineItem({ title, detail, done }: { title: string; detail: string; done: boolean }) {
  return <div className="flex gap-3"><span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${done ? "bg-emerald-600" : "bg-asphalt/15"}`} /><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-steel">{detail}</p></div></div>;
}
