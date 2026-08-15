import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { calculateQuote, createCustomerOrder, getCustomerPortalData, openCustomerPaymentReceipt, openCustomerProof, printCustomerInvoice, type CustomerOrder, type CustomerPayment, type CustomerPortalData } from "../services/customer.service";
import { supabase } from "../services/supabase.client";
import { CustomerQuoteMap, type QuotePoints } from "../components/navigation/CustomerQuoteMap";
import { CustomerLiveTripMap } from "../components/tracking/CustomerLiveTripMap";
import { CustomerDriverAssignmentCard } from "../components/customer/CustomerDriverAssignmentCard";
import { CustomerRatingCard } from "../components/customer/CustomerRatingCard";
import { CustomerProfilePanel } from "../components/customer/CustomerProfilePanel";
import { CustomerPaymentModal } from "../components/customer/CustomerPaymentModal";
import { LanguageSwitcher, useLanguage } from "../i18n/LanguageProvider";
import { getCustomerCopy } from "../i18n/customerCopy";
import { calculatePaymentSummary } from "../utils/paymentSummary";

const emptyData: CustomerPortalData = { orders: [], proofs: [], payments: [], assignments: [], profile: null };

function remainingPayment(order: CustomerOrder, payments: CustomerPayment[]) {
  const relevant = payments.filter((payment) => payment.order_id === order.id);
  return calculatePaymentSummary(order.price_etb, relevant).remainingToSubmit;
}

export function CustomerPortal() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const c = getCustomerCopy(language);
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
      setError(err instanceof Error ? err.message : c.loadError);
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
      if (!routePoints) throw new Error(c.routeMissing);
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
      setError(err instanceof Error ? err.message : c.orderCreateError);
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-bone text-asphalt">
      <header className="border-b border-asphalt/10 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-5">
          <div><p className="font-display text-xl font-bold">HALLO<span className="text-amber">TRUCK</span></p><p className="font-mono text-[9px] tracking-[.22em] text-emerald-700">{c.portalLabel}</p></div>
          <div className="flex items-center gap-2"><LanguageSwitcher /><button onClick={() => setShowOrder(true)} className="bg-emerald-700 px-4 py-3 text-sm font-semibold text-white">{c.newOrder}</button></div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-9">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="font-mono text-xs tracking-[.2em] text-amber-dim">{c.myLogistics}</p><h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">{c.title}</h1><p className="mt-2 text-sm text-steel">{c.subtitle}</p></div>
          <button onClick={async () => { await supabase.auth.signOut(); navigate("/", { replace: true }); }} className="self-start text-sm text-route">{c.signOut}</button>
        </div>

        <CustomerProfilePanel profile={data.profile} onSaved={load} />
        {error && <p className="mt-6 border border-route/30 bg-route/5 p-3 text-sm text-route">{error}</p>}

        {busy && !data.orders.length ? <p className="py-16 text-center font-mono text-sm text-steel">{c.loading}</p> :
          <div className="mt-8 grid gap-4">
            {data.orders.length === 0 && <div className="border border-asphalt/10 bg-white p-10 text-center"><p className="font-display text-xl font-semibold">{c.noOrders}</p><p className="mt-2 text-sm text-steel">{c.noOrdersText}</p></div>}
            {data.orders.map((order) => {
              const proof = data.proofs.find((item) => item.order_id === order.id);
              const assignment = data.assignments.find((item) => item.order_id === order.id);
              const orderPayments = data.payments.filter((item) => item.order_id === order.id);
              const paymentSummary = calculatePaymentSummary(order.price_etb, orderPayments);
              const pending = paymentSummary.pendingVerification > 0;
              const trackable = ["accepted", "in_transit"].includes(order.status);
              const remaining = paymentSummary.remainingToSubmit;
              return <article key={order.id} className="border border-asphalt/10 bg-white p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-sm font-semibold">{order.tracking_id}</p><p className="mt-2 text-sm">{order.pickup_address} <span className="text-steel">→</span> {order.dropoff_address}</p></div><span className="bg-amber/15 px-3 py-2 text-xs font-semibold capitalize text-amber-dim">{order.status.replace("_", " ")}</span></div>
                <div className="mt-5 grid grid-cols-2 gap-4 border-t border-asphalt/10 pt-5 text-sm sm:grid-cols-4"><Info label={c.quote} value={`ETB ${Number(order.price_etb ?? 0).toLocaleString()}`} /><Info label={c.distance} value={order.distance_km ? `${order.distance_km} km` : c.pending} /><Info label={c.payment} value={pending ? c.pendingVerification : order.payment_status.replace("_", " ")} /><Info label={c.vehicle} value={order.vehicle_type} /></div>

                {assignment && <CustomerDriverAssignmentCard
                  assignment={assignment}
                  order={order}
                  labels={{
                    assigned: c.assigned,
                    verifiedDriver: c.verifiedDriver,
                    verificationPending: c.verificationPending,
                    license: c.license,
                    nationalId: c.nationalId,
                    truckPlate: c.truckPlate,
                    truck: c.truck,
                    verified: c.verified,
                    pending: c.pending,
                    viewTruckPhoto: c.viewTruckPhoto,
                    privacy: c.privacy,
                  }}
                />}

                <div className="mt-5 flex flex-wrap gap-3 border-t border-asphalt/10 pt-5">
                  {trackable && <button onClick={() => setTrackingOrder(order)} className="bg-emerald-700 px-4 py-3 text-xs font-semibold text-white">{c.liveTracking}</button>}
                  {order.status === "delivered" && <span className="self-center bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">{c.deliveryComplete}</span>}
                  {remaining > 0 ? <button onClick={() => setPaymentOrder(order)} className="bg-asphalt px-4 py-3 text-xs font-semibold text-white">{c.submitPayment} · ETB {remaining.toLocaleString()}</button> : <span className="self-center bg-emerald-700 px-4 py-3 text-xs font-semibold text-white">{pending ? c.pendingVerification : c.paymentRecorded}</span>}
                  <button onClick={() => printCustomerInvoice(order, orderPayments)} className="border border-asphalt px-4 py-3 text-xs font-semibold">{c.invoice}</button>
                </div>

                {orderPayments.length > 0 && <div className="mt-4 border border-asphalt/10 bg-bone p-4"><p className="font-mono text-[10px] tracking-[.16em] text-steel">{c.paymentHistory}</p><div className="mt-3 grid gap-2">{orderPayments.map((payment) => <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 bg-white px-3 py-2 text-xs"><span><strong>{payment.provider.replace(/_/g, " ")}</strong> · ETB {Number(payment.amount_etb).toLocaleString()} · <span className="capitalize">{payment.event.replace(/_/g, " ")}</span></span>{payment.receipt_path && <button onClick={() => void openCustomerPaymentReceipt(payment.receipt_path!)} className="font-semibold text-emerald-800">{c.viewReceipt}</button>}</div>)}</div></div>}
                {proof && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 bg-emerald-50 p-4 text-sm"><span>{c.deliveredTo} <strong>{proof.recipient_name}</strong></span><div className="flex gap-4"><button onClick={() => void openCustomerProof(proof.photo_path)} className="font-semibold text-emerald-800">{c.photo}</button><button onClick={() => void openCustomerProof(proof.signature_path)} className="font-semibold text-emerald-800">{c.signature}</button></div></div>}
                {order.status === "delivered" && assignment && <CustomerRatingCard orderId={order.id} driverName={assignment.driver_name} />}
              </article>;
            })}
          </div>}
      </section>

      {trackingOrder && <div className="fixed inset-0 z-50 grid place-items-center bg-asphalt/70 p-4"><div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto bg-white p-6 sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="font-mono text-[10px] tracking-[.2em] text-emerald-700">{c.liveTrip}</p><h2 className="mt-2 font-display text-2xl font-bold">{trackingOrder.tracking_id}</h2><p className="mt-2 text-sm text-steel">{trackingOrder.pickup_address} → {trackingOrder.dropoff_address}</p></div><button type="button" onClick={() => setTrackingOrder(null)} className="text-2xl">×</button></div><div className="mt-6"><CustomerLiveTripMap orderId={trackingOrder.id} totalDistanceKm={trackingOrder.distance_km} /></div></div></div>}

      {showOrder && <div className="fixed inset-0 z-50 grid place-items-center bg-asphalt/70 p-4"><form onSubmit={create} className="max-h-[94vh] w-full max-w-xl overflow-y-auto bg-white p-6 sm:p-8"><div className="flex justify-between"><div><p className="font-mono text-[10px] tracking-[.2em] text-emerald-700">{c.smartQuote}</p><h2 className="mt-2 font-display text-2xl font-bold">{c.newTransport}</h2></div><button type="button" onClick={() => setShowOrder(false)} className="text-2xl">×</button></div><div className="mt-6"><CustomerQuoteMap onChange={updateRoute} /></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm">{c.vehicleLabel}<select value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="mt-2 block w-full border border-line bg-white px-4 py-3"><option>Pickup</option><option>Van</option><option>Dry Cargo</option><option>Refrigerated</option><option>Trailer</option></select></label><div className="flex items-end border border-line bg-bone px-4 py-3"><div><p className="text-xs text-steel">{c.estimatedDistance}</p><p className="mt-1 font-mono font-semibold">{distance ? `${distance} km` : c.findRoute}</p></div></div></div><div className="mt-6 bg-asphalt p-5 text-white"><p className="font-mono text-[10px] tracking-widest text-white/45">{c.estimatedQuote}</p><p className="mt-2 font-display text-3xl font-bold text-amber">{quote ? `ETB ${quote.toLocaleString()}` : c.selectRoute}</p><p className="mt-2 text-xs text-white/45">{c.quoteNote}</p></div><button disabled={busy || !routePoints} className="mt-5 w-full bg-emerald-700 py-4 font-semibold text-white disabled:opacity-50">{busy ? c.creating : c.confirmCreate}</button></form></div>}

      {paymentOrder && <CustomerPaymentModal order={paymentOrder} maxAmount={remainingPayment(paymentOrder, data.payments)} onClose={() => setPaymentOrder(null)} onSubmitted={load} />}
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-steel">{label}</p><p className="mt-1 font-semibold capitalize">{value}</p></div>; }
