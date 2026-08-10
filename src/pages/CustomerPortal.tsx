import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { calculateQuote, createCustomerOrder, getCustomerPortalData, openCustomerPaymentReceipt, openCustomerProof, openCustomerTruckPhoto, printCustomerInvoice, type CustomerOrder, type CustomerPayment, type CustomerPortalData } from "../services/customer.service";
import { supabase } from "../services/supabase.client";
import { CustomerQuoteMap, type QuotePoints } from "../components/navigation/CustomerQuoteMap";
import { CustomerLiveTripMap } from "../components/tracking/CustomerLiveTripMap";
import { CustomerProfilePanel } from "../components/customer/CustomerProfilePanel";
import { CustomerPaymentModal } from "../components/customer/CustomerPaymentModal";

const emptyData: CustomerPortalData = { orders: [], proofs: [], payments: [], assignments: [], profile: null };

function remainingPayment(order: CustomerOrder, payments: CustomerPayment[]) {
  const relevant = payments.filter((payment) => payment.order_id === order.id);
  const committed = relevant.reduce((sum, payment) => {
    if (["initiated", "held_escrow", "released"].includes(payment.event)) return sum + Number(payment.amount_etb || 0);
    if (payment.event === "refunded" && payment.provider === "credit_refund") return sum - Number(payment.amount_etb || 0);
    return sum;
  }, 0);
  return Math.max(0, Number(order.price_etb ?? 0) - committed);
}

export function CustomerPortal() {
  const navigate = useNavigate();
  const [data, setData] = useState(emptyData);
  const [showOrder, setShowOrder] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState<CustomerOrder | null>(null);
  const [trackingOrder, setTrackingOrder] = useState<CustomerOrder | null>(null);
  const [routePoints, setRoutePoints] = useState<QuotePoints | null>(null);
  const distance = routePoints?.distanceKm ?? 0;
  const [vehicle, setVehicle] = useState("Dry Cargo");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const quote = useMemo(() => distance ? calculateQuote(distance, vehicle) : 0, [distance, vehicle]);
  const updateRoute = useCallback((points: QuotePoints | null) => setRoutePoints(points), []);

  async function load() {
    try {
      setData(await getCustomerPortalData());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load customer orders.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    const channel = supabase.channel("customer-portal")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!routePoints) throw new Error("Find or select both pickup and drop-off places.");
      await createCustomerOrder({
        pickupAddress: routePoints.pickupAddress,
        dropoffAddress: routePoints.dropoffAddress,
        vehicleType: vehicle,
        distanceKm: distance,
        pickup: routePoints.pickup,
        dropoff: routePoints.dropoff,
      });
      setShowOrder(false);
      setRoutePoints(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Order could not be created.");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-bone text-asphalt">
      <header className="border-b border-asphalt/10 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <div><p className="font-display text-xl font-bold">HALLO<span className="text-amber">TRUCK</span></p><p className="font-mono text-[9px] tracking-[.22em] text-emerald-700">CUSTOMER SMART PORTAL</p></div>
          <button onClick={() => setShowOrder(true)} className="bg-emerald-700 px-4 py-3 text-sm font-semibold text-white">+ New order</button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-9">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="font-mono text-xs tracking-[.2em] text-amber-dim">MY LOGISTICS</p><h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Orders, payments & tracking</h1><p className="mt-2 text-sm text-steel">Book transport, upload payment receipts and follow every delivery milestone.</p></div>
          <button onClick={async () => { await supabase.auth.signOut(); navigate("/", { replace: true }); }} className="self-start text-sm text-route">Sign out</button>
        </div>

        <CustomerProfilePanel profile={data.profile} onSaved={load} />
        {error && <p className="mt-6 border border-route/30 bg-route/5 p-3 text-sm text-route">{error}</p>}

        {busy && !data.orders.length ? <p className="py-16 text-center font-mono text-sm text-steel">Loading shipments…</p> :
          <div className="mt-8 grid gap-4">
            {data.orders.length === 0 && <div className="border border-asphalt/10 bg-white p-10 text-center"><p className="font-display text-xl font-semibold">No orders yet</p><p className="mt-2 text-sm text-steel">Create your first smart transport request.</p></div>}
            {data.orders.map((order) => {
              const proof = data.proofs.find((item) => item.order_id === order.id);
              const assignment = data.assignments.find((item) => item.order_id === order.id);
              const orderPayments = data.payments.filter((item) => item.order_id === order.id);
              const pending = orderPayments.some((item) => ["initiated", "held_escrow"].includes(item.event));
              const trackable = ["accepted", "in_transit"].includes(order.status);
              const remaining = remainingPayment(order, data.payments);
              return <article key={order.id} className="border border-asphalt/10 bg-white p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-sm font-semibold">{order.tracking_id}</p><p className="mt-2 text-sm">{order.pickup_address} <span className="text-steel">→</span> {order.dropoff_address}</p></div><span className="bg-amber/15 px-3 py-2 text-xs font-semibold capitalize text-amber-dim">{order.status.replace("_", " ")}</span></div>
                <div className="mt-5 grid grid-cols-2 gap-4 border-t border-asphalt/10 pt-5 text-sm sm:grid-cols-4"><Info label="Quote" value={`ETB ${Number(order.price_etb ?? 0).toLocaleString()}`} /><Info label="Distance" value={order.distance_km ? `${order.distance_km} km` : "Pending"} /><Info label="Payment" value={pending ? "Pending verification" : order.payment_status.replace("_", " ")} /><Info label="Vehicle" value={order.vehicle_type} /></div>

                {assignment && <div className="mt-5 border border-emerald-200 bg-emerald-50 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-[10px] tracking-[.18em] text-emerald-700">ASSIGNED DRIVER & TRUCK</p><p className="mt-1 font-display text-lg font-semibold">{assignment.driver_name}</p><a href={`tel:${assignment.driver_phone}`} className="mt-1 inline-block text-sm font-semibold text-emerald-800">{assignment.driver_phone}</a></div><span className={`px-3 py-2 text-[10px] font-semibold uppercase ${assignment.driver_verified ? "bg-emerald-700 text-white" : "border border-amber/30 bg-amber/10 text-amber-dim"}`}>{assignment.driver_verified ? "✓ Verified driver" : "Verification pending"}</span></div>
                  <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4"><SafeInfo label="License" value={assignment.license_verified ? "Verified" : "Pending"} /><SafeInfo label="National ID" value={assignment.national_id_verified ? "Verified" : "Pending"} /><SafeInfo label="Truck plate" value={assignment.plate_number ?? "Pending"} /><SafeInfo label="Truck" value={`${assignment.vehicle_type ?? order.vehicle_type}${assignment.capacity_tons ? ` · ${assignment.capacity_tons} tons` : ""}`} /></div>
                  {assignment.truck_photo_path && <button onClick={() => void openCustomerTruckPhoto(assignment.truck_photo_path!)} className="mt-4 border border-emerald-700 px-4 py-2.5 text-xs font-semibold text-emerald-800">View verified truck photo</button>}
                  <p className="mt-3 text-[10px] leading-relaxed text-emerald-900/65">For privacy and fraud prevention, license and national-ID files stay private. You see their verified status only.</p>
                </div>}

                <div className="mt-5 flex flex-wrap gap-3 border-t border-asphalt/10 pt-5">
                  {trackable && <button onClick={() => setTrackingOrder(order)} className="bg-emerald-700 px-4 py-3 text-xs font-semibold text-white">Live trip tracking</button>}
                  {order.status === "delivered" && <span className="self-center bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">Delivery complete</span>}
                  {remaining > 0 ? <button onClick={() => setPaymentOrder(order)} className="bg-asphalt px-4 py-3 text-xs font-semibold text-white">Submit payment · ETB {remaining.toLocaleString()}</button> : <span className="self-center bg-emerald-700 px-4 py-3 text-xs font-semibold text-white">Payment fully recorded</span>}
                  <button onClick={() => printCustomerInvoice(order, orderPayments)} className="border border-asphalt px-4 py-3 text-xs font-semibold">Invoice / receipt PDF</button>
                </div>

                {orderPayments.length > 0 && <div className="mt-4 border border-asphalt/10 bg-bone p-4"><p className="font-mono text-[10px] tracking-[.16em] text-steel">PAYMENT HISTORY</p><div className="mt-3 grid gap-2">{orderPayments.map((payment) => <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 bg-white px-3 py-2 text-xs"><span><strong>{payment.provider.replace(/_/g, " ")}</strong> · ETB {Number(payment.amount_etb).toLocaleString()} · <span className="capitalize">{payment.event.replace(/_/g, " ")}</span></span>{payment.receipt_path && <button onClick={() => void openCustomerPaymentReceipt(payment.receipt_path!)} className="font-semibold text-emerald-800">View receipt</button>}</div>)}</div></div>}
                {proof && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 bg-emerald-50 p-4 text-sm"><span>Delivered to <strong>{proof.recipient_name}</strong></span><div className="flex gap-4"><button onClick={() => void openCustomerProof(proof.photo_path)} className="font-semibold text-emerald-800">Photo</button><button onClick={() => void openCustomerProof(proof.signature_path)} className="font-semibold text-emerald-800">Signature</button></div></div>}
              </article>;
            })}
          </div>}
      </section>

      {trackingOrder && <div className="fixed inset-0 z-50 grid place-items-center bg-asphalt/70 p-4"><div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto bg-white p-6 sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="font-mono text-[10px] tracking-[.2em] text-emerald-700">LIVE TRIP</p><h2 className="mt-2 font-display text-2xl font-bold">{trackingOrder.tracking_id}</h2><p className="mt-2 text-sm text-steel">{trackingOrder.pickup_address} → {trackingOrder.dropoff_address}</p></div><button type="button" onClick={() => setTrackingOrder(null)} className="text-2xl">×</button></div><div className="mt-6"><CustomerLiveTripMap orderId={trackingOrder.id} totalDistanceKm={trackingOrder.distance_km} /></div></div></div>}

      {showOrder && <div className="fixed inset-0 z-50 grid place-items-center bg-asphalt/70 p-4"><form onSubmit={create} className="max-h-[94vh] w-full max-w-xl overflow-y-auto bg-white p-6 sm:p-8"><div className="flex justify-between"><div><p className="font-mono text-[10px] tracking-[.2em] text-emerald-700">SMART QUOTE</p><h2 className="mt-2 font-display text-2xl font-bold">New transport order</h2></div><button type="button" onClick={() => setShowOrder(false)} className="text-2xl">×</button></div><div className="mt-6"><CustomerQuoteMap onChange={updateRoute} /></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm">Vehicle<select value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="mt-2 block w-full border border-line bg-white px-4 py-3"><option>Pickup</option><option>Van</option><option>Dry Cargo</option><option>Refrigerated</option><option>Trailer</option></select></label><div className="flex items-end border border-line bg-bone px-4 py-3"><div><p className="text-xs text-steel">Estimated road distance</p><p className="mt-1 font-mono font-semibold">{distance ? `${distance} km` : "Find pickup & drop-off"}</p></div></div></div><div className="mt-6 bg-asphalt p-5 text-white"><p className="font-mono text-[10px] tracking-widest text-white/45">ESTIMATED SMART QUOTE</p><p className="mt-2 font-display text-3xl font-bold text-amber">{quote ? `ETB ${quote.toLocaleString()}` : "Select route"}</p><p className="mt-2 text-xs text-white/45">Quote updates automatically from the selected distance and vehicle. Final price is confirmed after route verification.</p></div><button disabled={busy || !routePoints} className="mt-5 w-full bg-emerald-700 py-4 font-semibold text-white disabled:opacity-50">{busy ? "Creating…" : "Confirm & create order"}</button></form></div>}

      {paymentOrder && <CustomerPaymentModal order={paymentOrder} maxAmount={remainingPayment(paymentOrder, data.payments)} onClose={() => setPaymentOrder(null)} onSubmitted={load} />}
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-steel">{label}</p><p className="mt-1 font-semibold capitalize">{value}</p></div>; }
function SafeInfo({ label, value }: { label: string; value: string }) { return <div className="bg-white/70 p-3"><p className="text-[10px] uppercase tracking-wider text-emerald-900/55">{label}</p><p className="mt-1 font-semibold text-emerald-950">{value}</p></div>; }
