import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { CustomerBottomNav } from "../components/customer/CustomerBottomNav";
import {
  CustomerNearbyTrucksSheet,
  type DispatchOrderSummary,
} from "../components/customer/CustomerNearbyTrucksSheet";
import { CustomerQuoteMap, type QuotePoints } from "../components/navigation/CustomerQuoteMap";
import { LanguageSwitcher, useLanguage, type HalloLanguage } from "../i18n/LanguageProvider";
import { getCustomerCopy } from "../i18n/customerCopy";
import {
  calculateCargoQuote,
  cargoToTons,
  createCustomerCargoOrder,
  vehicleCapacityTons,
  type CargoUnit,
} from "../services/customer-cargo.service";
import { getCustomerPortalData, type CustomerPortalData } from "../services/customer.service";
import { calculatePaymentSummary } from "../utils/paymentSummary";

const emptyData: CustomerPortalData = { orders: [], proofs: [], payments: [], assignments: [], profile: null };
const activeStatuses = new Set(["assigned", "accepted", "in_transit"]);

const copy: Record<HalloLanguage, {
  greeting: string;
  ready: string;
  routeTitle: string;
  routeHelp: string;
  active: string;
  due: string;
  delivered: string;
  truckMatch: string;
  capacity: string;
  load: string;
  unit: string;
  ton: string;
  quintal: string;
  equivalent: string;
  estimate: string;
  chooseRoute: string;
  create: string;
  creating: string;
  viewOrders: string;
  privacy: string;
  required: string;
  exceeds: string;
  pickup: string;
  van: string;
  isuzu5Ton: string;
  dryCargo: string;
  refrigerated: string;
  trailer: string;
  continueMatch: string;
  findTruck: string;
}> = {
  en: {
    greeting: "Ready to move cargo?",
    ready: "Choose pickup and destination on the map. HALLOTRUCK will match the right verified truck after your order is confirmed.",
    routeTitle: "Plan your transport",
    routeHelp: "Search both places or tap the map.",
    active: "Active",
    due: "To pay",
    delivered: "Delivered",
    truckMatch: "Truck match",
    capacity: "Capacity",
    load: "Load amount",
    unit: "Unit",
    ton: "Ton",
    quintal: "Quintal",
    equivalent: "Equivalent",
    estimate: "Estimated quote",
    chooseRoute: "Choose a route",
    create: "Confirm & find nearby trucks",
    creating: "Creating order…",
    viewOrders: "View orders",
    privacy: "Exact driver locations stay private until a verified driver and truck are assigned to your order.",
    required: "Enter a load amount greater than zero.",
    exceeds: "This load exceeds the selected truck capacity.",
    pickup: "Pickup",
    van: "Van",
    isuzu5Ton: "Isuzu 5 Ton",
    dryCargo: "Dry Cargo",
    refrigerated: "Refrigerated",
    trailer: "Trailer",
    continueMatch: "Unassigned order",
    findTruck: "Find nearby truck",
  },
  om: {
    greeting: "Feʼumsa geessuuf qophiidhaa?",
    ready: "Pickup fi bakka geessuu map irratti fili. Order erga mirkanaaʼee booda HALLOTRUCK truck verified fi capacity gahaa qabu siif barbaada.",
    routeTitle: "Geejjiba kee karoorfadhu",
    routeHelp: "Bakka lamaanuu barbaadi ykn map tuqi.",
    active: "Hojii irra",
    due: "Kaffaltii hafe",
    delivered: "Geessifame",
    truckMatch: "Truck filannoo",
    capacity: "Capacity",
    load: "Baayʼina feʼumsaa",
    unit: "Safartuu",
    ton: "Tonii",
    quintal: "Kuntaala",
    equivalent: "Wal-qixa",
    estimate: "Gatii tilmaamaa",
    chooseRoute: "Route fili",
    create: "Mirkaneessi truck naannoo barbaadi",
    creating: "Order uumamaa jira…",
    viewOrders: "Ajajoota ilaali",
    privacy: "GPS driver sirrii orderf driver fi truck verified assign taʼan booda qofa customerf mulʼata.",
    required: "Baayʼina feʼumsaa zeeroo caalu galchi.",
    exceeds: "Feʼiinsi kun capacity truck filatamee caala.",
    pickup: "Pickup",
    van: "Van",
    isuzu5Ton: "Isuzu 5 Ton",
    dryCargo: "Dry Cargo",
    refrigerated: "Refrigerated",
    trailer: "Trailer",
    continueMatch: "Order hin assign taane",
    findTruck: "Truck naannoo barbaadi",
  },
  am: {
    greeting: "ጭነት ለማጓጓዝ ዝግጁ ነዎት?",
    ready: "መነሻና መድረሻውን በካርታ ይምረጡ። ትዕዛዙ ከተረጋገጠ በኋላ HALLOTRUCK ተገቢውን የተረጋገጠ መኪና ያገናኛል።",
    routeTitle: "ትራንስፖርትዎን ያቅዱ",
    routeHelp: "ሁለቱንም ቦታዎች ይፈልጉ ወይም ካርታውን ይንኩ።",
    active: "ንቁ",
    due: "ቀሪ ክፍያ",
    delivered: "ደርሷል",
    truckMatch: "የመኪና ምርጫ",
    capacity: "አቅም",
    load: "የጭነት መጠን",
    unit: "መለኪያ",
    ton: "ቶን",
    quintal: "ኩንታል",
    equivalent: "ተመጣጣኝ",
    estimate: "ግምታዊ ዋጋ",
    chooseRoute: "መንገድ ይምረጡ",
    create: "ያረጋግጡና በአቅራቢያ መኪና ይፈልጉ",
    creating: "ትዕዛዝ እየተፈጠረ ነው…",
    viewOrders: "ትዕዛዞችን ይመልከቱ",
    privacy: "የአሽከርካሪው ትክክለኛ GPS የሚታየው የተረጋገጠ አሽከርካሪና መኪና ከተመደበ በኋላ ብቻ ነው።",
    required: "ከዜሮ በላይ የሆነ የጭነት መጠን ያስገቡ።",
    exceeds: "ጭነቱ የተመረጠውን የመኪና አቅም ይበልጣል።",
    pickup: "Pickup",
    van: "Van",
    isuzu5Ton: "Isuzu 5 Ton",
    dryCargo: "Dry Cargo",
    refrigerated: "Refrigerated",
    trailer: "Trailer",
    continueMatch: "ያልተመደበ ትዕዛዝ",
    findTruck: "በአቅራቢያ መኪና ፈልግ",
  },
};

const vehicleOptions = ["Pickup", "Van", "Isuzu 5 Ton", "Dry Cargo", "Refrigerated", "Trailer"] as const;

export function CustomerMapHome() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const c = getCustomerCopy(language);
  const t = copy[language];
  const [data, setData] = useState<CustomerPortalData>(emptyData);
  const [routePoints, setRoutePoints] = useState<QuotePoints | null>(null);
  const [vehicle, setVehicle] = useState<(typeof vehicleOptions)[number]>("Dry Cargo");
  const [cargoQuantity, setCargoQuantity] = useState("1");
  const [cargoUnit, setCargoUnit] = useState<CargoUnit>("ton");
  const [matchingOrder, setMatchingOrder] = useState<DispatchOrderSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const updateRoute = useCallback((points: QuotePoints | null) => setRoutePoints(points), []);
  const cargoAmount = Number(cargoQuantity);
  const cargoTons = cargoToTons(cargoAmount, cargoUnit);
  const selectedCapacity = vehicleCapacityTons[vehicle.toLowerCase()] ?? 0;
  const validation = !Number.isFinite(cargoAmount) || cargoAmount <= 0
    ? t.required
    : selectedCapacity > 0 && cargoTons > selectedCapacity
      ? `${t.exceeds} ${vehicle}: ${selectedCapacity} ${t.ton}.`
      : "";
  const quote = useMemo(
    () => routePoints && !validation
      ? calculateCargoQuote(routePoints.distanceKm, vehicle, cargoAmount, cargoUnit)
      : 0,
    [cargoAmount, cargoUnit, routePoints, validation, vehicle],
  );

  const summary = useMemo(() => {
    const active = data.orders.filter((order) => activeStatuses.has(order.status)).length;
    const delivered = data.orders.filter((order) => order.status === "delivered").length;
    const due = data.orders.reduce((total, order) => {
      const payments = data.payments.filter((payment) => payment.order_id === order.id);
      return total + calculatePaymentSummary(order.price_etb, payments).remainingToSubmit;
    }, 0);
    return { active, delivered, due };
  }, [data.orders, data.payments]);

  const latestPlacedOrder = useMemo(
    () => data.orders.find((order) => order.status === "placed") ?? null,
    [data.orders],
  );

  useEffect(() => {
    let cancelled = false;
    void getCustomerPortalData()
      .then((result) => { if (!cancelled) setData(result); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : c.loadError); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [c.loadError]);

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!routePoints) {
      setError(c.routeMissing);
      return;
    }
    if (validation) {
      setError(validation);
      return;
    }

    setBusy(true);
    try {
      const order = await createCustomerCargoOrder({
        pickupAddress: routePoints.pickupAddress,
        dropoffAddress: routePoints.dropoffAddress,
        vehicleType: vehicle,
        distanceKm: routePoints.distanceKm,
        pickup: routePoints.pickup,
        dropoff: routePoints.dropoff,
        cargoQuantity: cargoAmount,
        cargoUnit,
      });
      setMatchingOrder({
        id: order.id,
        tracking_id: order.trackingId,
        pickup_address: order.pickupAddress,
        dropoff_address: order.dropoffAddress,
        vehicle_type: order.vehicleType,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : c.orderCreateError);
    } finally {
      setBusy(false);
    }
  }

  const firstName = data.profile?.full_name?.trim().split(/\s+/)[0] ?? "Customer";

  return (
    <main className="customer-map-home min-h-screen bg-bone text-asphalt">
      <header className="customer-main-header customer-map-home__header">
        <div className="customer-header-inner mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="customer-brand">
            <p className="font-display text-xl font-bold">HALLO<span className="text-amber">TRUCK</span></p>
            <p className="font-mono text-[9px] tracking-[.22em]">{c.portalLabel}</p>
          </div>
          <div className="customer-header-actions flex items-center gap-2">
            <LanguageSwitcher />
            <button type="button" onClick={() => navigate("/customer/orders")} className="customer-map-home__orders-button">{t.viewOrders}</button>
          </div>
        </div>
      </header>

      <CustomerBottomNav />

      <section className="customer-map-home__stage">
        <div className="customer-map-home__welcome">
          <div>
            <p className="customer-eyebrow">{firstName}</p>
            <h1>{t.greeting}</h1>
            <p>{t.ready}</p>
            {latestPlacedOrder && (
              <button
                type="button"
                className="customer-map-home__continue-match"
                onClick={() => setMatchingOrder({
                  id: latestPlacedOrder.id,
                  tracking_id: latestPlacedOrder.tracking_id,
                  pickup_address: latestPlacedOrder.pickup_address,
                  dropoff_address: latestPlacedOrder.dropoff_address,
                  vehicle_type: latestPlacedOrder.vehicle_type,
                })}
              >
                <span>{t.continueMatch} · {latestPlacedOrder.tracking_id}</span>
                <strong>{t.findTruck} →</strong>
              </button>
            )}
          </div>
          <div className="customer-map-home__summary" aria-label="Customer logistics summary">
            <Summary label={t.active} value={loading ? "…" : summary.active.toLocaleString()} />
            <Summary label={t.due} value={loading ? "…" : `ETB ${summary.due.toLocaleString()}`} />
            <Summary label={t.delivered} value={loading ? "…" : summary.delivered.toLocaleString()} />
          </div>
        </div>

        <div className="customer-map-home__map-shell">
          <div className="customer-map-home__map-title">
            <div><span>01</span><div><h2>{t.routeTitle}</h2><p>{t.routeHelp}</p></div></div>
          </div>
          <div className="customer-map-home__map">
            <CustomerQuoteMap onChange={updateRoute} />
          </div>
        </div>

        <form onSubmit={createOrder} className="customer-map-home__sheet">
          <div className="customer-map-home__handle" aria-hidden="true" />
          <div className="customer-map-home__sheet-heading">
            <div><p className="customer-eyebrow">02 · {t.truckMatch}</p><h2>{routePoints ? `${routePoints.distanceKm.toLocaleString()} km` : t.chooseRoute}</h2></div>
            <div className="customer-map-home__quote"><span>{t.estimate}</span><strong>{quote ? `ETB ${quote.toLocaleString()}` : "—"}</strong></div>
          </div>

          <div className="customer-map-home__vehicles" role="group" aria-label={t.truckMatch}>
            {vehicleOptions.map((option) => (
              <button key={option} type="button" onClick={() => setVehicle(option)} className={vehicle === option ? "is-active" : ""}>
                <span className="customer-map-home__vehicle-icon" aria-hidden="true">▰</span>
                <strong>{t[vehicleKey(option)]}</strong>
                <small>{vehicleCapacityTons[option.toLowerCase()] ?? "—"} {t.ton}</small>
              </button>
            ))}
          </div>

          <div className="customer-map-home__load-grid">
            <label>{t.load}<input value={cargoQuantity} onChange={(event) => setCargoQuantity(event.target.value)} type="number" inputMode="decimal" min="0.1" step="0.1" required /></label>
            <label>{t.unit}<select value={cargoUnit} onChange={(event) => setCargoUnit(event.target.value as CargoUnit)}><option value="ton">{t.ton}</option><option value="quintal">{t.quintal}</option></select></label>
            <div><span>{t.equivalent}</span><strong>{cargoTons > 0 ? `${cargoTons.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${t.ton}` : "—"}</strong></div>
            <div><span>{t.capacity}</span><strong>{selectedCapacity ? `${selectedCapacity} ${t.ton}` : "—"}</strong></div>
          </div>

          {error && <p className="customer-map-home__error">{error}</p>}
          {validation && <p className="customer-map-home__error">{validation}</p>}
          <p className="customer-map-home__privacy">{t.privacy}</p>

          <button type="submit" disabled={busy || !routePoints || Boolean(validation)} className="customer-map-home__confirm">
            {busy ? t.creating : t.create}
          </button>
        </form>
      </section>

      {matchingOrder && (
        <CustomerNearbyTrucksSheet
          order={matchingOrder}
          onClose={() => setMatchingOrder(null)}
          onOpenOrders={() => navigate("/customer/orders")}
        />
      )}
    </main>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function vehicleKey(vehicle: (typeof vehicleOptions)[number]): "pickup" | "van" | "isuzu5Ton" | "dryCargo" | "refrigerated" | "trailer" {
  if (vehicle === "Dry Cargo") return "dryCargo";
  if (vehicle === "Isuzu 5 Ton") return "isuzu5Ton";
  return vehicle.toLowerCase() as "pickup" | "van" | "refrigerated" | "trailer";
}
