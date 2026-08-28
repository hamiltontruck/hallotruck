import { useCallback, useEffect, useState, type FormEvent } from "react";
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
  cargoToTons,
  createCustomerCargoOrder,
  vehicleCapacityTons,
  type CargoUnit,
} from "../services/customer-cargo.service";
import {
  CARGO_CATEGORIES,
  PACKAGING_TYPES,
  cargoDetailsCopy,
  isContainerPackaging,
  validateCargoDetails,
  type CargoCategory,
  type PackagingType,
} from "../domain/cargo-details";
import { useTransportQuote } from "../hooks/useTransportQuote";

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
  truck22Ton: string;
  truck25Ton: string;
  truck30Ton: string;
  trailer: string;
  continueMatch: string;
  findTruck: string;
  quoteLoading: string;
  quoteUnavailable: string;
  latestRate: string;
  expandSheet: string;
  collapseSheet: string;
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
    truck22Ton: "Truck 22 Ton",
    truck25Ton: "Truck 25 Ton",
    truck30Ton: "Truck 30 Ton",
    trailer: "Trailer",
    continueMatch: "Unassigned order",
    findTruck: "Find nearby truck",
    quoteLoading: "Getting latest price…",
    quoteUnavailable: "The latest price could not be loaded. Try again.",
    latestRate: "Latest admin-managed Supabase rate",
    expandSheet: "Open truck and load options",
    collapseSheet: "Show more map",
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
    truck22Ton: "Truck 22 Ton",
    truck25Ton: "Truck 25 Ton",
    truck30Ton: "Truck 30 Ton",
    trailer: "Trailer",
    continueMatch: "Order hin assign taane",
    findTruck: "Truck naannoo barbaadi",
    quoteLoading: "Gatii haaraa database irraa fidaa jira…",
    quoteUnavailable: "Gatii haaraa fiduun hin danda'amne. Irra deebi'i.",
    latestRate: "Gatii Supabase adminiin yeroo ammaa qindeesse",
    expandSheet: "Filannoo truck fi fe'umsaa bani",
    collapseSheet: "Map bal'inaan agarsiisi",
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
    truck22Ton: "Truck 22 Ton",
    truck25Ton: "Truck 25 Ton",
    truck30Ton: "Truck 30 Ton",
    trailer: "Trailer",
    continueMatch: "ያልተመደበ ትዕዛዝ",
    findTruck: "በአቅራቢያ መኪና ፈልግ",
    quoteLoading: "የቅርብ ጊዜውን ዋጋ በማምጣት ላይ…",
    quoteUnavailable: "የቅርብ ጊዜውን ዋጋ ማምጣት አልተቻለም። እንደገና ይሞክሩ።",
    latestRate: "በአስተዳዳሪ የሚተዳደር የቅርብ ጊዜ Supabase ዋጋ",
    expandSheet: "የመኪናና የጭነት ምርጫዎችን ክፈት",
    collapseSheet: "ተጨማሪ ካርታ አሳይ",
  },
};

const vehicleOptions = [
  "Pickup",
  "Van",
  "Isuzu 5 Ton",
  "Dry Cargo",
  "Refrigerated",
  "Truck 22 Ton",
  "Truck 25 Ton",
  "Truck 30 Ton",
  "Trailer",
] as const;

export function CustomerMapHome() {
  const navigate = useNavigate();
  const { language, selectedLanguage } = useLanguage();
  const c = getCustomerCopy(language);
  const t = copy[language];
  const cargoCopy = cargoDetailsCopy[selectedLanguage];
  const [routePoints, setRoutePoints] = useState<QuotePoints | null>(null);
  const [vehicle, setVehicle] = useState<(typeof vehicleOptions)[number]>("Dry Cargo");
  const [cargoQuantity, setCargoQuantity] = useState("1");
  const [cargoUnit, setCargoUnit] = useState<CargoUnit>("ton");
  const [cargoCategory, setCargoCategory] = useState<CargoCategory>("general_goods");
  const [packagingType, setPackagingType] = useState<PackagingType>("loose_bulk");
  const [cargoNotes, setCargoNotes] = useState("");
  const [matchingOrder, setMatchingOrder] = useState<DispatchOrderSummary | null>(null);
  const [sheetExpanded, setSheetExpanded] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const updateRoute = useCallback((points: QuotePoints | null) => setRoutePoints(points), []);
  const cargoAmount = Number(cargoQuantity);
  const cargoTons = cargoToTons(cargoAmount, cargoUnit);
  const selectedCapacity = vehicleCapacityTons[vehicle.toLowerCase()] ?? 0;
  const loadValidation = !Number.isFinite(cargoAmount) || cargoAmount <= 0
    ? t.required
    : selectedCapacity > 0 && cargoTons > selectedCapacity
      ? `${t.exceeds} ${vehicle}: ${selectedCapacity} ${t.ton}.`
      : "";
  const cargoDetailsErrorCode = validateCargoDetails({
    category: cargoCategory,
    packagingType,
    vehicleType: vehicle,
    notes: cargoNotes,
  });
  const cargoDetailsValidation = cargoDetailsErrorCode ? cargoCopy.errors[cargoDetailsErrorCode] : "";
  const validation = loadValidation || cargoDetailsValidation;
  const {
    quote: quoteBreakdown,
    loading: quoteLoading,
    error: quoteError,
  } = useTransportQuote({
    distanceKm: routePoints?.distanceKm ?? 0,
    vehicleType: vehicle,
    cargoTons,
    enabled: Boolean(routePoints && !validation),
  });
  const quote = quoteBreakdown?.total_quote_etb ?? 0;

  useEffect(() => {
    if (routePoints) setSheetExpanded(true);
  }, [routePoints]);

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
    if (!quoteBreakdown) {
      setError(quoteError || t.quoteUnavailable);
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
        cargoCategory,
        packagingType,
        cargoNotes,
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
        <div className="customer-map-home__map-shell">
          <div className="customer-map-home__map-title">
            <div><span>01</span><div><h2>{t.routeTitle}</h2><p>{t.routeHelp}</p></div></div>
          </div>
          <div className="customer-map-home__map">
            <CustomerQuoteMap onChange={updateRoute} vehicleType={vehicle} />
          </div>
        </div>

        <form onSubmit={createOrder} className={`customer-map-home__sheet ${sheetExpanded ? "is-expanded" : "is-collapsed"}`}>
          <button
            type="button"
            className="customer-map-home__handle"
            onClick={() => setSheetExpanded((current) => !current)}
            aria-expanded={sheetExpanded}
            aria-label={sheetExpanded ? t.collapseSheet : t.expandSheet}
          ><span aria-hidden="true" /></button>
          <div className="customer-map-home__sheet-heading">
            <div><p className="customer-eyebrow">02 · {t.truckMatch}</p><h2>{routePoints ? `${routePoints.distanceKm.toLocaleString()} km · ${Math.floor(routePoints.durationMinutes / 60)}h ${routePoints.durationMinutes % 60}m` : t.chooseRoute}</h2></div>
            <div className="customer-map-home__quote"><span>{t.estimate}</span><strong>{quoteLoading ? "…" : quote ? `ETB ${quote.toLocaleString()}` : "—"}</strong><small>{t.latestRate}</small></div>
            <button type="button" className="customer-map-home__sheet-toggle" onClick={() => setSheetExpanded((current) => !current)} aria-label={sheetExpanded ? t.collapseSheet : t.expandSheet}>{sheetExpanded ? "⌄" : "⌃"}</button>
          </div>

          {sheetExpanded && <div className="customer-map-home__sheet-body">
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
              <label>
                {cargoCopy.category}
                <select value={cargoCategory} onChange={(event) => setCargoCategory(event.target.value as CargoCategory)}>
                  {CARGO_CATEGORIES.map((category) => <option key={category} value={category}>{cargoCopy.categories[category]}</option>)}
                </select>
              </label>
              <label>
                {cargoCopy.packaging}
                <select
                  value={packagingType}
                  onChange={(event) => {
                    const next = event.target.value as PackagingType;
                    setPackagingType(next);
                    if (isContainerPackaging(next)) setVehicle("Trailer");
                  }}
                >
                  {PACKAGING_TYPES.map((packaging) => <option key={packaging} value={packaging}>{cargoCopy.packagingTypes[packaging]}</option>)}
                </select>
              </label>
              <label className="sm:col-span-2">
                {cargoCopy.notes}
                <textarea
                  value={cargoNotes}
                  onChange={(event) => setCargoNotes(event.target.value)}
                  maxLength={500}
                  rows={2}
                  required={cargoCategory === "other"}
                  placeholder={cargoCopy.notesPlaceholder}
                />
              </label>
            </div>

            <div className="customer-map-home__load-grid">
              <label>{t.load}<input value={cargoQuantity} onChange={(event) => setCargoQuantity(event.target.value)} type="number" inputMode="decimal" min="0.1" step="0.1" required /></label>
              <label>{t.unit}<select value={cargoUnit} onChange={(event) => setCargoUnit(event.target.value as CargoUnit)}><option value="ton">{t.ton}</option><option value="quintal">{t.quintal}</option></select></label>
              <div><span>{t.equivalent}</span><strong>{cargoTons > 0 ? `${cargoTons.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${t.ton}` : "—"}</strong></div>
              <div><span>{t.capacity}</span><strong>{selectedCapacity ? `${selectedCapacity} ${t.ton}` : "—"}</strong></div>
            </div>

            {error && <p className="customer-map-home__error">{error}</p>}
            {validation && <p className="customer-map-home__error">{validation}</p>}
            {quoteLoading && <p className="customer-map-home__quote-state">{t.quoteLoading}</p>}
            {quoteError && <p className="customer-map-home__error">{t.quoteUnavailable} {quoteError}</p>}
            <p className="customer-map-home__privacy">{t.privacy}</p>

            <button type="submit" disabled={busy || quoteLoading || !quoteBreakdown || !routePoints || Boolean(validation)} className="customer-map-home__confirm">
              {busy ? t.creating : quoteLoading ? t.quoteLoading : t.create}
            </button>
          </div>}
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

function vehicleKey(vehicle: (typeof vehicleOptions)[number]):
  | "pickup"
  | "van"
  | "isuzu5Ton"
  | "dryCargo"
  | "refrigerated"
  | "truck22Ton"
  | "truck25Ton"
  | "truck30Ton"
  | "trailer" {
  if (vehicle === "Dry Cargo") return "dryCargo";
  if (vehicle === "Isuzu 5 Ton") return "isuzu5Ton";
  if (vehicle === "Truck 22 Ton") return "truck22Ton";
  if (vehicle === "Truck 25 Ton") return "truck25Ton";
  if (vehicle === "Truck 30 Ton") return "truck30Ton";
  return vehicle.toLowerCase() as "pickup" | "van" | "refrigerated" | "trailer";
}