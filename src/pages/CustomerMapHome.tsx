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
import { getVehiclePresentation } from "../domain/vehicle-presentation";
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
  routeTitle: string;
  routeHelp: string;
  truckMatch: string;
  capacity: string;
  maxCapacity: string;
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
  quoteLoading: string;
  quoteUnavailable: string;
  latestRate: string;
  expandSheet: string;
  collapseSheet: string;
  formProgress: string;
  routeStep: string;
  truckStep: string;
  cargoStep: string;
  loadStep: string;
  quoteStep: string;
  confirmLocked: string;
  confirmReady: string;
  paymentMethod: string;
  cash: string;
  bankTelebirr: string;
}> = {
  en: {
    routeTitle: "Plan your transport",
    routeHelp: "Search both places or tap the map.",
    truckMatch: "Choose truck",
    capacity: "Selected capacity",
    maxCapacity: "Maximum load",
    load: "Load amount",
    unit: "Unit",
    ton: "Ton",
    quintal: "Quintal",
    equivalent: "Equivalent weight",
    estimate: "Estimated quote",
    chooseRoute: "Choose pickup and destination",
    create: "Confirm order",
    creating: "Creating order…",
    viewOrders: "View orders",
    privacy: "The driver's exact live location appears only after a verified driver and truck are assigned.",
    required: "Enter a load amount greater than zero.",
    exceeds: "The load exceeds this truck's capacity.",
    pickup: "Pickup",
    van: "Van",
    isuzu5Ton: "Isuzu 5 Ton",
    dryCargo: "Dry Cargo",
    refrigerated: "Refrigerated",
    truck22Ton: "Truck 22 Ton",
    truck25Ton: "Truck 25 Ton",
    truck30Ton: "Truck 30 Ton",
    trailer: "Trailer",
    quoteLoading: "Calculating current price…",
    quoteUnavailable: "The current price could not be loaded. Try again.",
    latestRate: "Current Admin-managed rate",
    expandSheet: "Open order form",
    collapseSheet: "Show more map",
    formProgress: "Order readiness",
    routeStep: "Route",
    truckStep: "Truck",
    cargoStep: "Cargo",
    loadStep: "Load",
    quoteStep: "Quote",
    confirmLocked: "Complete every required field to activate Confirm Order.",
    confirmReady: "Order details complete — ready to confirm.",
    paymentMethod: "Payment method",
    cash: "Cash to driver",
    bankTelebirr: "Bank / Telebirr",
  },
  om: {
    routeTitle: "Geejjiba kee karoorfadhu",
    routeHelp: "Pickup fi bakka geessuu barbaadi ykn map tuqi.",
    truckMatch: "Konkolaataa fili",
    capacity: "Capacity filatame",
    maxCapacity: "Feʼumsa olaanaa",
    load: "Baayʼina feʼumsaa",
    unit: "Safartuu",
    ton: "Tonii",
    quintal: "Kuntaala",
    equivalent: "Ulfaatina wal-qixa",
    estimate: "Gatii tilmaamaa",
    chooseRoute: "Pickup fi bakka geessuu fili",
    create: "Order mirkaneessi",
    creating: "Order uumamaa jira…",
    viewOrders: "Ajajoota ilaali",
    privacy: "GPS live driver sirrii driver fi truck verified erga ramadamanii booda qofa mulʼata.",
    required: "Baayʼina feʼumsaa zeeroo caalu sirriitti galchi.",
    exceeds: "Feʼiinsi kun capacity konkolaataa kanaa caala.",
    pickup: "Pickup",
    van: "Van",
    isuzu5Ton: "Isuzu 5 Ton",
    dryCargo: "Dry Cargo",
    refrigerated: "Refrigerated",
    truck22Ton: "Truck 22 Ton",
    truck25Ton: "Truck 25 Ton",
    truck30Ton: "Truck 30 Ton",
    trailer: "Trailer",
    quoteLoading: "Gatii ammaa shallagaa jira…",
    quoteUnavailable: "Gatii ammaa fiduun hin dandaʼamne. Irra deebiʼi.",
    latestRate: "Gatii Admin yeroo ammaa qindeesse",
    expandSheet: "Order form bani",
    collapseSheet: "Map balʼinaan agarsiisi",
    formProgress: "Qophii order",
    routeStep: "Daandii",
    truckStep: "Truck",
    cargoStep: "Feʼumsa",
    loadStep: "Baayʼina",
    quoteStep: "Gatii",
    confirmLocked: "Confirm Order active gochuuf dirree barbaachisu hunda sirriitti guuti.",
    confirmReady: "Ibsi order guutameera — mirkaneessuuf qophaaʼeera.",
    paymentMethod: "Mala kaffaltii",
    cash: "Cash driverʼtti",
    bankTelebirr: "Bank / Telebirr",
  },
  am: {
    routeTitle: "ትራንስፖርትዎን ያቅዱ",
    routeHelp: "መነሻና መድረሻውን ይፈልጉ ወይም ካርታውን ይንኩ።",
    truckMatch: "መኪና ይምረጡ",
    capacity: "የተመረጠ አቅም",
    maxCapacity: "ከፍተኛ ጭነት",
    load: "የጭነት መጠን",
    unit: "መለኪያ",
    ton: "ቶን",
    quintal: "ኩንታል",
    equivalent: "ተመጣጣኝ ክብደት",
    estimate: "ግምታዊ ዋጋ",
    chooseRoute: "መነሻና መድረሻ ይምረጡ",
    create: "ትዕዛዝ ያረጋግጡ",
    creating: "ትዕዛዝ እየተፈጠረ ነው…",
    viewOrders: "ትዕዛዞችን ይመልከቱ",
    privacy: "የአሽከርካሪው ቀጥታ GPS የሚታየው የተረጋገጠ አሽከርካሪና መኪና ከተመደበ በኋላ ብቻ ነው።",
    required: "ከዜሮ በላይ የሆነ ትክክለኛ የጭነት መጠን ያስገቡ።",
    exceeds: "ጭነቱ የዚህን መኪና አቅም ይበልጣል።",
    pickup: "Pickup",
    van: "Van",
    isuzu5Ton: "Isuzu 5 Ton",
    dryCargo: "Dry Cargo",
    refrigerated: "Refrigerated",
    truck22Ton: "Truck 22 Ton",
    truck25Ton: "Truck 25 Ton",
    truck30Ton: "Truck 30 Ton",
    trailer: "Trailer",
    quoteLoading: "የአሁኑን ዋጋ በማስላት ላይ…",
    quoteUnavailable: "የአሁኑን ዋጋ ማምጣት አልተቻለም። እንደገና ይሞክሩ።",
    latestRate: "አሁን በAdmin የተዘጋጀ ዋጋ",
    expandSheet: "የትዕዛዝ ቅጽ ክፈት",
    collapseSheet: "ተጨማሪ ካርታ አሳይ",
    formProgress: "የትዕዛዝ ዝግጁነት",
    routeStep: "መንገድ",
    truckStep: "መኪና",
    cargoStep: "ጭነት",
    loadStep: "መጠን",
    quoteStep: "ዋጋ",
    confirmLocked: "Confirm Order እንዲሰራ ሁሉንም አስፈላጊ መረጃ በትክክል ይሙሉ።",
    confirmReady: "የትዕዛዙ መረጃ ተሟልቷል — ለማረጋገጥ ዝግጁ ነው።",
    paymentMethod: "የክፍያ ዘዴ",
    cash: "ጥሬ ገንዘብ ለአሽከርካሪ",
    bankTelebirr: "ባንክ / ቴሌብር",
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

type VehicleOption = (typeof vehicleOptions)[number];

export function CustomerMapHome() {
  const navigate = useNavigate();
  const { language, selectedLanguage } = useLanguage();
  const c = getCustomerCopy(language);
  const t = copy[language];
  const cargoCopy = cargoDetailsCopy[selectedLanguage];
  const [routePoints, setRoutePoints] = useState<QuotePoints | null>(null);
  const [vehicle, setVehicle] = useState<VehicleOption>("Dry Cargo");
  const [cargoQuantity, setCargoQuantity] = useState("");
  const [cargoUnit, setCargoUnit] = useState<CargoUnit>("ton");
  const [cargoCategory, setCargoCategory] = useState<CargoCategory>("general_goods");
  const [packagingType, setPackagingType] = useState<PackagingType>("loose_bulk");
  const [cargoNotes, setCargoNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank_telebirr">("cash");
  const [matchingOrder, setMatchingOrder] = useState<DispatchOrderSummary | null>(null);
  const [sheetExpanded, setSheetExpanded] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const updateRoute = useCallback((points: QuotePoints | null) => setRoutePoints(points), []);
  const cleanCargoQuantity = cargoQuantity.trim();
  const cargoAmount = cleanCargoQuantity ? Number(cleanCargoQuantity) : 0;
  const cargoTons = cargoToTons(cargoAmount, cargoUnit);
  const selectedCapacity = vehicleCapacityTons[vehicle.toLowerCase()] ?? 0;
  const loadValidation = !cleanCargoQuantity || !Number.isFinite(cargoAmount) || cargoAmount <= 0
    ? t.required
    : selectedCapacity <= 0
      ? t.chooseRoute
      : cargoTons > selectedCapacity
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
  const routeReady = Boolean(routePoints?.pickupAddress && routePoints?.dropoffAddress && routePoints.distanceKm > 0);
  const truckReady = selectedCapacity > 0;
  const cargoReady = !cargoDetailsValidation;
  const loadReady = Boolean(cleanCargoQuantity && !loadValidation && cargoTons > 0 && cargoTons <= selectedCapacity);
  const quoteReady = Boolean(quoteBreakdown && quote > 0 && !quoteLoading && !quoteError);
  const isFormReady = routeReady && truckReady && cargoReady && loadReady && quoteReady;

  useEffect(() => {
    if (routePoints) setSheetExpanded(true);
  }, [routePoints]);

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!isFormReady || !routePoints || !quoteBreakdown) {
      setError(validation || quoteError || t.confirmLocked);
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
        paymentMethod,
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

        <form onSubmit={createOrder} className={`customer-map-home__sheet ${sheetExpanded ? "is-expanded" : "is-collapsed"}`} noValidate>
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
            <div className="customer-map-home__readiness" aria-label={t.formProgress}>
              <ReadinessStep label={t.routeStep} ready={routeReady} />
              <ReadinessStep label={t.truckStep} ready={truckReady} />
              <ReadinessStep label={t.cargoStep} ready={cargoReady} />
              <ReadinessStep label={t.loadStep} ready={loadReady} />
              <ReadinessStep label={t.quoteStep} ready={quoteReady} />
            </div>

            <div className="customer-map-home__vehicles" role="group" aria-label={t.truckMatch}>
              {vehicleOptions.map((option) => {
                const capacity = vehicleCapacityTons[option.toLowerCase()] ?? 0;
                const presentation = getVehiclePresentation(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setVehicle(option)}
                    className={vehicle === option ? "is-active" : ""}
                    aria-pressed={vehicle === option}
                  >
                    {presentation && (
                      <img
                        src={presentation.image}
                        alt={presentation.alt}
                        loading="lazy"
                        decoding="async"
                        width="900"
                        height="600"
                      />
                    )}
                    <strong>{t[vehicleKey(option)]}</strong>
                    <small>{t.maxCapacity}: {capacity} {t.ton}</small>
                  </button>
                );
              })}
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
                  aria-invalid={Boolean(cargoDetailsValidation)}
                  placeholder={cargoCopy.notesPlaceholder}
                />
              </label>
            </div>

            <div className="customer-map-home__load-grid">
              <label>
                {t.load}
                <input
                  value={cargoQuantity}
                  onChange={(event) => setCargoQuantity(event.target.value)}
                  type="number"
                  inputMode="decimal"
                  min="0.1"
                  step="0.1"
                  required
                  aria-invalid={Boolean(loadValidation)}
                  placeholder="0.0"
                />
              </label>
              <label>{t.unit}<select value={cargoUnit} onChange={(event) => setCargoUnit(event.target.value as CargoUnit)}><option value="ton">{t.ton}</option><option value="quintal">{t.quintal}</option></select></label>
              <div><span>{t.equivalent}</span><strong>{cargoTons > 0 ? `${cargoTons.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${t.ton}` : "—"}</strong></div>
              <div><span>{t.capacity}</span><strong>{selectedCapacity ? `${selectedCapacity} ${t.ton}` : "—"}</strong></div>
            </div>

            <fieldset className="customer-map-home__payment-method">
              <legend>{t.paymentMethod}</legend>
              <label className={paymentMethod === "cash" ? "is-active" : ""}><input type="radio" name="payment-method" checked={paymentMethod === "cash"} onChange={() => setPaymentMethod("cash")} />{t.cash}</label>
              <label className={paymentMethod === "bank_telebirr" ? "is-active" : ""}><input type="radio" name="payment-method" checked={paymentMethod === "bank_telebirr"} onChange={() => setPaymentMethod("bank_telebirr")} />{t.bankTelebirr}</label>
            </fieldset>

            {error && <p className="customer-map-home__error" role="alert">{error}</p>}
            {validation && <p className="customer-map-home__error" role="status">{validation}</p>}
            {quoteLoading && <p className="customer-map-home__quote-state">{t.quoteLoading}</p>}
            {quoteError && <p className="customer-map-home__error">{t.quoteUnavailable} {quoteError}</p>}
            <p className="customer-map-home__privacy">{t.privacy}</p>

            <div className={`customer-map-home__confirm-dock ${isFormReady ? "is-ready" : "is-locked"}`}>
              <p>{isFormReady ? t.confirmReady : t.confirmLocked}</p>
              <button
                type="submit"
                disabled={busy || !isFormReady}
                data-ready={isFormReady}
                className="customer-map-home__confirm"
              >
                {busy ? t.creating : t.create}
              </button>
            </div>
          </div>}
        </form>
      </section>

      {matchingOrder && (
        <CustomerNearbyTrucksSheet
          order={matchingOrder}
          onClose={() => setMatchingOrder(null)}
          onOpenOrders={() => navigate("/customer/track")}
        />
      )}
    </main>
  );
}

function ReadinessStep({ label, ready }: { label: string; ready: boolean }) {
  return <span className={ready ? "is-ready" : ""}><b aria-hidden="true">{ready ? "✓" : "○"}</b>{label}</span>;
}

function vehicleKey(vehicle: VehicleOption):
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
