import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { getCustomerPortalData, openCustomerPaymentReceipt, openCustomerProof, printCustomerInvoice, type CustomerOrder, type CustomerPayment, type CustomerPortalData } from "../services/customer.service";
import { cargoToTons, createCustomerCargoOrder, formatCargoLoad, vehicleCapacityTons, type CargoUnit } from "../services/customer-cargo.service";
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
import { useTransportQuote } from "../hooks/useTransportQuote";

const emptyData: CustomerPortalData = { orders: [], proofs: [], payments: [], assignments: [], profile: null };
const activeStatuses = new Set(["assigned", "accepted", "in_transit"]);

type CargoMeta = {
  cargo_quantity: number | null;
  cargo_unit: CargoUnit | null;
  cargo_description: string | null;
};

type OrderFilter = "all" | "active" | "payment" | "delivered";

const cargoCopy = {
  en: {
    amount: "Load amount",
    unit: "Unit",
    ton: "Ton",
    quintal: "Quintal",
    equivalent: "Equivalent weight",
    capacity: "Selected vehicle capacity",
    required: "Enter a load amount greater than zero.",
    exceeds: "The load exceeds the selected vehicle capacity.",
    pricing: "Quote includes road distance and cargo weight.",
    load: "Load",
    quoteLoading: "Getting latest price…",
    quoteUnavailable: "Latest server price is unavailable. Try again.",
    latestRate: "Current admin-managed Supabase rate.",
  },
  om: {
    amount: "Baay'ina fe'umsaa",
    unit: "Safartuu",
    ton: "Tonii",
    quintal: "Kuntaala",
    equivalent: "Wal-qixa ulfaatina",
    capacity: "Capacity konkolaataa filatamee",
    required: "Baay'ina fe'umsaa zeeroo caalu galchi.",
    exceeds: "Fe'iinsi kun capacity konkolaataa filatamee caala.",
    pricing: "Gatiin fageenya daandii fi ulfaatina fe'umsaa of keessaa qaba.",
    load: "Fe'umsa",
    quoteLoading: "Gatii haaraa database irraa fidaa jira…",
    quoteUnavailable: "Gatiin server yeroo ammaa hin argamne. Irra deebi'i.",
    latestRate: "Gatii Supabase adminiin yeroo ammaa qindeesse.",
  },
  am: {
    amount: "የጭነት መጠን",
    unit: "መለኪያ",
    ton: "ቶን",
    quintal: "ኩንታል",
    equivalent: "ተመጣጣኝ ክብደት",
    capacity: "የተመረጠው ተሽከርካሪ አቅም",
    required: "ከዜሮ በላይ የሆነ የጭነት መጠን ያስገቡ።",
    exceeds: "ጭነቱ የተመረጠውን ተሽከርካሪ አቅም ይበልጣል።",
    pricing: "ዋጋው የመንገድ ርቀትንና የጭነት ክብደትን ያካትታል።",
    load: "ጭነት",
    quoteLoading: "የቅርብ ጊዜውን ዋጋ በማምጣት ላይ…",
    quoteUnavailable: "የአሁኑ የሰርቨር ዋጋ አልተገኘም። እንደገና ይሞክሩ።",
    latestRate: "በአስተዳዳሪ የሚተዳደር የአሁኑ Supabase ዋጋ።",
  },
} as const;

const dashboardCopy = {
  en: {
    overview: "Logistics overview",
    totalOrders: "Orders",
    activeTrips: "Active",
    amountDue: "To pay",
    deliveredCount: "Delivered",
    all: "All",
    active: "Active",
    payment: "Payment",
    delivered: "Delivered",
    details: "View details",
    less: "Hide details",
    route: "Route",
    loadStep: "Load",
    review: "Review",
    routeHelp: "Choose pickup and drop-off places on the live road map.",
    loadHelp: "Select the vehicle and enter Ton or Quintal.",
    reviewHelp: "Review distance, capacity and price before creating the order.",
    noFiltered: "No orders match this filter.",
  },
  om: {
    overview: "Haala loojistikii gabaabaa",
    totalOrders: "Ajajoota",
    activeTrips: "Hojii irra",
    amountDue: "Kaffaltii hafe",
    deliveredCount: "Geessame",
    all: "Hunda",
    active: "Hojii irra",
    payment: "Kaffaltii",
    delivered: "Geessame",
    details: "Bal'inaan ilaali",
    less: "Bal'ina cufi",
    route: "Daandii",
    loadStep: "Fe'umsaa",
    review: "Mirkaneessi",
    routeHelp: "Bakka fe'umsaa fi bakka geessuu kaartaa daandii irratti fili.",
    loadHelp: "Konkolaataa filadhu; Tonii ykn Kuntaala galchi.",
    reviewHelp: "Fageenya, capacity fi gatii ilaalii ajaja mirkaneessi.",
    noFiltered: "Filter kana keessatti ajajni hin jiru.",
  },
  am: {
    overview: "የሎጂስቲክስ አጠቃላይ እይታ",
    totalOrders: "ትዕዛዞች",
    activeTrips: "ንቁ",
    amountDue: "የሚከፈል",
    deliveredCount: "ደርሷል",
    all: "ሁሉም",
    active: "ንቁ",
    payment: "ክፍያ",
    delivered: "ደርሷል",
    details: "ዝርዝር ይመልከቱ",
    less: "ዝርዝር ዝጋ",
    route: "መንገድ",
    loadStep: "ጭነት",
    review: "ማረጋገጫ",
    routeHelp: "መነሻና መድረሻን በቀጥታ የመንገድ ካርታ ይምረጡ።",
    loadHelp: "ተሽከርካሪ ይምረጡና ቶን ወይም ኩንታል ያስገቡ።",
    reviewHelp: "ትዕዛዙን ከመፍጠርዎ በፊት ርቀት፣ አቅምና ዋጋ ያረጋግጡ።",
    noFiltered: "ከዚህ ማጣሪያ ጋር የሚዛመድ ትዕዛዝ የለም።",
  },
} as const;

function remainingPayment(order: CustomerOrder, payments: CustomerPayment[]) {
  const relevant = payments.filter((payment) => payment.order_id === order.id);
  return calculatePaymentSummary(order.price_etb, relevant).remainingToSubmit;
}

export function CustomerPortal() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const c = getCustomerCopy(language);
  const cargoText = cargoCopy[language];
  const ui = dashboardCopy[language];
  const [data, setData] = useState(emptyData);
  const [cargoMeta, setCargoMeta] = useState<Record<string, CargoMeta>>({});
  const [showOrder, setShowOrder] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState<CustomerOrder | null>(null);
  const [trackingOrder, setTrackingOrder] = useState<CustomerOrder | null>(null);
  const [routePoints, setRoutePoints] = useState<QuotePoints | null>(null);
  const [vehicle, setVehicle] = useState("Dry Cargo");
  const [cargoQuantity, setCargoQuantity] = useState("1");
  const [cargoUnit, setCargoUnit] = useState<CargoUnit>("ton");
  const [orderFilter, setOrderFilter] = useState<OrderFilter>("all");
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const distance = routePoints?.distanceKm ?? 0;
  const cargoAmount = Number(cargoQuantity);
  const cargoTons = cargoToTons(cargoAmount, cargoUnit);
  const selectedCapacity = vehicleCapacityTons[vehicle.toLowerCase()] ?? 0;
  const cargoValidation = !Number.isFinite(cargoAmount) || cargoAmount <= 0
    ? cargoText.required
    : selectedCapacity > 0 && cargoTons > selectedCapacity
      ? `${cargoText.exceeds} ${vehicle}: ${selectedCapacity} ${cargoText.ton}.`
      : "";
  const {
    quote: quoteBreakdown,
    loading: quoteLoading,
    error: quoteError,
  } = useTransportQuote({
    distanceKm: distance,
    vehicleType: vehicle,
    cargoTons,
    enabled: Boolean(distance && !cargoValidation),
  });
  const quote = quoteBreakdown?.total_quote_etb ?? 0;
  const updateRoute = useCallback((points: QuotePoints | null) => setRoutePoints(points), []);

  const activeCount = data.orders.filter((order) => activeStatuses.has(order.status)).length;
  const deliveredCount = data.orders.filter((order) => order.status === "delivered").length;
  const amountDue = data.orders.reduce((total, order) => total + remainingPayment(order, data.payments), 0);
  const filteredOrders = data.orders.filter((order) => {
    if (orderFilter === "active") return activeStatuses.has(order.status);
    if (orderFilter === "delivered") return order.status === "delivered";
    if (orderFilter === "payment") {
      const summary = calculatePaymentSummary(order.price_etb, data.payments.filter((payment) => payment.order_id === order.id));
      return summary.remainingToSubmit > 0 || summary.pendingVerification > 0;
    }
    return true;
  });

  async function load() {
    try {
      const [portalData, cargoResult] = await Promise.all([
        getCustomerPortalData(),
        supabase
          .from("orders")
          .select("id,cargo_quantity,cargo_unit,cargo_description")
          .order("created_at", { ascending: false }),
      ]);
      if (cargoResult.error) throw new Error(cargoResult.error.message);
      setData(portalData);
      setCargoMeta(Object.fromEntries((cargoResult.data ?? []).map((row) => [row.id, {
        cargo_quantity: row.cargo_quantity === null ? null : Number(row.cargo_quantity),
        cargo_unit: row.cargo_unit as CargoUnit | null,
        cargo_description: row.cargo_description,
      }])));
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

  useEffect(() => {
    if (!showOrder && !trackingOrder && !paymentOrder) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [paymentOrder, showOrder, trackingOrder]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!routePoints) throw new Error(c.routeMissing);
      if (cargoValidation) throw new Error(cargoValidation);
      if (!quoteBreakdown) throw new Error(quoteError || cargoText.quoteUnavailable);
      await createCustomerCargoOrder({
        pickupAddress: routePoints.pickupAddress,
        dropoffAddress: routePoints.dropoffAddress,
        vehicleType: vehicle,
        distanceKm: distance,
        pickup: routePoints.pickup,
        dropoff: routePoints.dropoff,
        cargoQuantity: cargoAmount,
        cargoUnit,
      });
      setShowOrder(false);
      setRoutePoints(null);
      setCargoQuantity("1");
      setCargoUnit("ton");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : c.orderCreateError);
      setBusy(false);
    }
  }

  function toggleOrder(orderId: string, currentlyExpanded: boolean) {
    setExpandedOrders((current) => ({ ...current, [orderId]: !currentlyExpanded }));
  }

  return (
    <main className="customer-main min-h-screen bg-bone text-asphalt">
      <header className="customer-main-header border-b border-asphalt/10 bg-white">
        <div className="customer-header-inner mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-5">
          <div className="customer-brand"><p className="font-display text-xl font-bold">HALLO<span className="text-amber">TRUCK</span></p><p className="font-mono text-[9px] tracking-[.22em] text-emerald-700">{c.portalLabel}</p></div>
          <div className="customer-header-actions flex items-center gap-2"><LanguageSwitcher /><button onClick={() => setShowOrder(true)} className="customer-new-order bg-emerald-700 px-4 py-3 text-sm font-semibold text-white">{c.newOrder}</button></div>
        </div>
      </header>

      <section className="customer-content mx-auto max-w-6xl px-5 py-9">
        <div className="customer-hero flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="font-mono text-xs tracking-[.2em] text-amber-dim">{c.myLogistics}</p><h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">{c.title}</h1><p className="mt-2 text-sm text-steel">{c.subtitle}</p></div>
          <button onClick={async () => { await supabase.auth.signOut(); navigate("/", { replace: true }); }} className="customer-sign-out self-start text-sm text-route">{c.signOut}</button>
        </div>

        <div className="customer-profile-slot"><CustomerProfilePanel profile={data.profile} onSaved={load} /></div>

        <section className="customer-orders-overview" aria-label={ui.overview}>
          <div className="customer-overview-heading"><div><p className="customer-eyebrow">HALLOTRUCK</p><h2>{ui.overview}</h2></div><button type="button" onClick={() => setShowOrder(true)}>{c.newOrder}</button></div>
          <div className="customer-kpis">
            <SummaryValue label={ui.totalOrders} value={data.orders.length.toLocaleString()} />
            <SummaryValue label={ui.activeTrips} value={activeCount.toLocaleString()} />
            <SummaryValue label={ui.amountDue} value={`ETB ${amountDue.toLocaleString()}`} />
            <SummaryValue label={ui.deliveredCount} value={deliveredCount.toLocaleString()} />
          </div>
          <div className="customer-order-filters" role="group" aria-label="Order filters">
            {(["all", "active", "payment", "delivered"] as OrderFilter[]).map((filter) => (
              <button key={filter} type="button" onClick={() => setOrderFilter(filter)} className={orderFilter === filter ? "is-active" : ""}>
                {ui[filter]}
              </button>
            ))}
          </div>
        </section>

        {error && <p className="customer-error mt-6 border border-route/30 bg-route/5 p-3 text-sm text-route">{error}</p>}

        {busy && !data.orders.length ? <p className="customer-loading py-16 text-center font-mono text-sm text-steel">{c.loading}</p> :
          <div className="customer-orders-list mt-8 grid gap-4">
            {data.orders.length === 0 && <div className="customer-empty-state border border-asphalt/10 bg-white p-10 text-center"><p className="font-display text-xl font-semibold">{c.noOrders}</p><p className="mt-2 text-sm text-steel">{c.noOrdersText}</p><button type="button" onClick={() => setShowOrder(true)}>{c.newOrder}</button></div>}
            {data.orders.length > 0 && filteredOrders.length === 0 && <div className="customer-empty-state"><p>{ui.noFiltered}</p></div>}
            {filteredOrders.map((order) => {
              const proof = data.proofs.find((item) => item.order_id === order.id);
              const assignment = data.assignments.find((item) => item.order_id === order.id);
              const orderPayments = data.payments.filter((item) => item.order_id === order.id);
              const paymentSummary = calculatePaymentSummary(order.price_etb, orderPayments);
              const pending = paymentSummary.pendingVerification > 0;
              const trackable = ["accepted", "in_transit"].includes(order.status);
              const remaining = paymentSummary.remainingToSubmit;
              const cargo = cargoMeta[order.id];
              const loadValue = cargo?.cargo_quantity && cargo.cargo_unit
                ? formatCargoLoad(cargo.cargo_quantity, cargo.cargo_unit)
                : cargo?.cargo_description || c.pending;
              const expanded = expandedOrders[order.id] ?? trackable;
              return <article key={order.id} className="customer-order-card border border-asphalt/10 bg-white p-5 sm:p-6">
                <div className="customer-order-card__top"><div><p className="customer-order-card__tracking font-mono text-sm font-semibold">{order.tracking_id}</p><p className="customer-order-card__route mt-2 text-sm">{order.pickup_address} <span className="text-steel">→</span> {order.dropoff_address}</p></div><span className={`customer-status customer-status--${order.status}`}>{order.status.replace(/_/g, " ")}</span></div>
                <div className="customer-order-card__stats mt-5 grid grid-cols-2 gap-4 border-t border-asphalt/10 pt-5 text-sm sm:grid-cols-5">
                  <Info label={c.quote} value={`ETB ${Number(order.price_etb ?? 0).toLocaleString()}`} />
                  <Info label={c.distance} value={order.distance_km ? `${order.distance_km} km` : c.pending} />
                  <Info label={cargoText.load} value={loadValue} />
                  <Info label={c.payment} value={pending ? c.pendingVerification : order.payment_status.replace(/_/g, " ")} />
                  <Info label={c.vehicle} value={order.vehicle_type} />
                </div>

                <div className="customer-order-card__actions mt-5 flex flex-wrap gap-3 border-t border-asphalt/10 pt-5">
                  {trackable && <button onClick={() => setTrackingOrder(order)} className="is-primary bg-emerald-700 px-4 py-3 text-xs font-semibold text-white">{c.liveTracking}</button>}
                  {remaining > 0 ? <button onClick={() => setPaymentOrder(order)} className="is-payment bg-asphalt px-4 py-3 text-xs font-semibold text-white">{c.submitPayment} · ETB {remaining.toLocaleString()}</button> : <span className="customer-payment-state self-center bg-emerald-700 px-4 py-3 text-xs font-semibold text-white">{pending ? c.pendingVerification : c.paymentRecorded}</span>}
                  <button onClick={() => printCustomerInvoice(order, orderPayments)} className="is-secondary border border-asphalt px-4 py-3 text-xs font-semibold">{c.invoice}</button>
                  <button type="button" onClick={() => toggleOrder(order.id, expanded)} className="is-details">{expanded ? ui.less : ui.details}</button>
                </div>

                {expanded && <div className="customer-order-card__details">
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
                  {order.status === "delivered" && <span className="customer-delivery-complete">{c.deliveryComplete}</span>}
                  {orderPayments.length > 0 && <div className="customer-payment-history mt-4 border border-asphalt/10 bg-bone p-4"><p className="font-mono text-[10px] tracking-[.16em] text-steel">{c.paymentHistory}</p><div className="mt-3 grid gap-2">{orderPayments.map((payment) => <div key={payment.id} className="customer-payment-row flex flex-wrap items-center justify-between gap-2 bg-white px-3 py-2 text-xs"><span><strong>{payment.provider.replace(/_/g, " ")}</strong> · ETB {Number(payment.amount_etb).toLocaleString()} · <span className="capitalize">{payment.event.replace(/_/g, " ")}</span></span>{payment.receipt_path && <button onClick={() => void openCustomerPaymentReceipt(payment.receipt_path!)} className="font-semibold text-emerald-800">{c.viewReceipt}</button>}</div>)}</div></div>}
                  {proof && <div className="customer-proof mt-5 flex flex-wrap items-center justify-between gap-3 bg-emerald-50 p-4 text-sm"><span>{c.deliveredTo} <strong>{proof.recipient_name}</strong></span><div className="flex gap-4"><button onClick={() => void openCustomerProof(proof.photo_path)} className="font-semibold text-emerald-800">{c.photo}</button><button onClick={() => void openCustomerProof(proof.signature_path)} className="font-semibold text-emerald-800">{c.signature}</button></div></div>}
                  {order.status === "delivered" && assignment && <CustomerRatingCard orderId={order.id} driverName={assignment.driver_name} />}
                </div>}
              </article>;
            })}
          </div>}
      </section>

      {trackingOrder && <div className="customer-modal customer-tracking-modal" role="dialog" aria-modal="true"><div className="customer-tracking-sheet"><div className="customer-sheet-header"><div><p className="font-mono text-[10px] tracking-[.2em] text-emerald-700">{c.liveTrip}</p><h2 className="mt-2 font-display text-2xl font-bold">{trackingOrder.tracking_id}</h2><p className="mt-2 text-sm text-steel">{trackingOrder.pickup_address} → {trackingOrder.dropoff_address}</p></div><button type="button" onClick={() => setTrackingOrder(null)} aria-label="Close">×</button></div><div className="customer-tracking-body"><CustomerLiveTripMap orderId={trackingOrder.id} totalDistanceKm={trackingOrder.distance_km} /></div></div></div>}

      {showOrder && <div className="customer-modal customer-order-modal" role="dialog" aria-modal="true" aria-labelledby="new-order-title"><form onSubmit={create} className="customer-order-sheet">
        <header className="customer-order-sheet__header"><div><p className="customer-eyebrow">{c.smartQuote}</p><h2 id="new-order-title">{c.newTransport}</h2></div><button type="button" onClick={() => setShowOrder(false)} aria-label="Close new order">×</button></header>
        <div className="customer-order-sheet__body">
          <div className="customer-order-steps" aria-label="Order steps"><span><b>1</b>{ui.route}</span><span><b>2</b>{ui.loadStep}</span><span><b>3</b>{ui.review}</span></div>
          <section className="customer-order-step"><div className="customer-order-step__heading"><span>1</span><div><h3>{ui.route}</h3><p>{ui.routeHelp}</p></div></div><CustomerQuoteMap onChange={updateRoute} vehicleType={vehicle} /></section>
          <section className="customer-order-step"><div className="customer-order-step__heading"><span>2</span><div><h3>{ui.loadStep}</h3><p>{ui.loadHelp}</p></div></div><div className="customer-load-grid"><label>{c.vehicleLabel}<select value={vehicle} onChange={(event) => setVehicle(event.target.value)}><option>Pickup</option><option>Van</option><option>Isuzu 5 Ton</option><option>Dry Cargo</option><option>Refrigerated</option><option>Truck 22 Ton</option><option>Truck 25 Ton</option><option>Truck 30 Ton</option><option>Trailer</option></select></label><div className="customer-distance-card"><p>{c.estimatedDistance}</p><strong>{distance ? `${distance} km` : c.findRoute}</strong></div><label>{cargoText.amount}<input value={cargoQuantity} onChange={(event) => setCargoQuantity(event.target.value)} type="number" inputMode="decimal" min="0.1" step="0.1" required /></label><label>{cargoText.unit}<select value={cargoUnit} onChange={(event) => setCargoUnit(event.target.value as CargoUnit)}><option value="ton">{cargoText.ton}</option><option value="quintal">{cargoText.quintal}</option></select></label></div><div className={`customer-capacity-card ${cargoValidation ? "has-error" : ""}`}><div><p>{cargoText.equivalent}</p><strong>{cargoTons > 0 ? `${cargoTons.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${cargoText.ton}` : "—"}</strong></div><div><p>{cargoText.capacity}</p><strong>{selectedCapacity ? `${selectedCapacity} ${cargoText.ton}` : "—"}</strong></div>{cargoValidation && <p className="customer-capacity-error">{cargoValidation}</p>}</div></section>
          <section className="customer-order-step"><div className="customer-order-step__heading"><span>3</span><div><h3>{ui.review}</h3><p>{ui.reviewHelp}</p></div></div><div className="customer-quote-card"><p>{c.estimatedQuote}</p><strong>{quoteLoading ? "…" : quote ? `ETB ${quote.toLocaleString()}` : c.selectRoute}</strong><small>{quoteLoading ? cargoText.quoteLoading : quoteError ? `${cargoText.quoteUnavailable} ${quoteError}` : `${cargoText.pricing} ${cargoText.latestRate}`}</small></div></section>
        </div>
        <footer className="customer-order-sheet__footer"><button disabled={busy || quoteLoading || !quoteBreakdown || !routePoints || Boolean(cargoValidation)}>{busy ? c.creating : quoteLoading ? cargoText.quoteLoading : c.confirmCreate}</button></footer>
      </form></div>}

      {paymentOrder && <CustomerPaymentModal order={paymentOrder} maxAmount={remainingPayment(paymentOrder, data.payments)} onClose={() => setPaymentOrder(null)} onSubmitted={load} />}
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="customer-info"><p>{label}</p><strong>{value}</strong></div>;
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return <div className="customer-summary-value"><p>{label}</p><strong>{value}</strong></div>;
}
