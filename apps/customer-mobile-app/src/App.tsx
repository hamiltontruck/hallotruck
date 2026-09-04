import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { CustomerIdentity } from "./auth/CustomerAuthBoundary";
import { CustomerBookingMap } from "./CustomerBookingMap";
import { CustomerOrdersPage, CustomerProfilePage } from "./CustomerDataPages";
import { CustomerPaymentsPage } from "./CustomerPaymentsPage";
import { CustomerTrackingPage } from "./CustomerTrackingPage";
import {
  loadCustomerQuotePreview,
  loadCustomerRoutePreview,
  type CustomerPlaceOption,
  type CustomerQuotePreview,
  type CustomerRoutePreview,
} from "./customer-quote.service";

type Tab = "home" | "orders" | "track" | "payments" | "profile";
type IconName = "home" | "orders" | "track" | "payments" | "profile" | "arrow" | "box" | "clock";

type TruckOption = {
  key: string;
  label: string;
  capacity: string;
  maxTons: number;
  body: "pickup" | "van" | "box" | "dry";
};

const TRUCKS: TruckOption[] = [
  { key: "pickup", label: "Pickup", capacity: "Max load: 3 Ton", maxTons: 3, body: "pickup" },
  { key: "van", label: "Van", capacity: "Max load: 5 Ton", maxTons: 5, body: "van" },
  { key: "isuzu", label: "Isuzu 5 Ton", capacity: "Max load: 5 Ton", maxTons: 5, body: "box" },
  { key: "dry-cargo", label: "Dry Cargo", capacity: "Max load: 10 Ton", maxTons: 10, body: "dry" },
];

const ICONS: Record<IconName, ReactNode> = {
  home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9 20v-6h6v6"/></>,
  orders: <><rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 4V2h6v2M8 9h8M8 13h8M8 17h5"/></>,
  track: <><path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3Z"/><path d="M8 3v15M16 6v15"/></>,
  payments: <><path d="M4 7h16v12H4z"/><path d="M4 10h16M15 14h3"/></>,
  profile: <><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
  box: <><path d="m4 7 8-4 8 4-8 4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
};

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </svg>
  );
}

function HaloLogo() {
  return (
    <div className="halo-logo" aria-label="HALLOTRUCK Customer Mobile">
      <div className="halo-wordmark">HALLO<span style={{ color: "var(--gold)", marginLeft: ".08em" }}>TRUCK</span></div>
      <div className="halo-brand-copy"><strong>Customer</strong><small>Smart Logistics</small></div>
    </div>
  );
}

function TruckArtwork({ body }: { body: TruckOption["body"] }) {
  const longBody = body === "van" || body === "dry";
  const boxBody = body === "box" || body === "dry";
  return (
    <svg className="truck-art" viewBox="0 0 170 82" role="img" aria-label="Truck illustration">
      <ellipse cx="87" cy="68" rx="67" ry="6" fill="#dfe5eb" />
      {boxBody && <rect x={body === "dry" ? 60 : 67} y="18" width={body === "dry" ? 86 : 72} height="39" rx="3" fill="#f8fafc" stroke="#b6c0ca" />}
      {body === "pickup" && <path d="M58 37h50l18 17H48l10-17Z" fill="#f8fafc" stroke="#a9b4bf" />}
      {body === "van" && <path d="M46 25h80c11 0 20 9 20 20v12H40V35c0-6 2-10 6-10Z" fill="#f8fafc" stroke="#a9b4bf" />}
      <path d={longBody ? "M24 43h31l9-21h27v35H24Z" : "M31 41h37l9-21h24v37H31Z"} fill="#ffffff" stroke="#9aa6b2" />
      <path d={longBody ? "M61 25h20v14H55Z" : "M75 24h18v15H69Z"} fill="#d8e5ef" />
      <rect x="25" y="54" width="121" height="7" rx="3" fill="#475467" />
      <circle cx="54" cy="62" r="10" fill="#26323e" /><circle cx="54" cy="62" r="4" fill="#cbd5df" />
      <circle cx="124" cy="62" r="10" fill="#26323e" /><circle cx="124" cy="62" r="4" fill="#cbd5df" />
    </svg>
  );
}

function formatQuoteEtb(amount: number) {
  return `ETB ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount)}`;
}

function BookingSheet({
  pickup,
  dropoff,
  pickupPlace,
  dropoffPlace,
  userId,
  selectedTruck,
  routePreview,
  routeLoading,
  routeError,
  onTruckChange,
  onClose,
  onRouteResolved,
}: {
  pickup: string;
  dropoff: string;
  pickupPlace: CustomerPlaceOption | null;
  dropoffPlace: CustomerPlaceOption | null;
  userId: string;
  selectedTruck: string;
  routePreview: CustomerRoutePreview | null;
  routeLoading: boolean;
  routeError: string;
  onTruckChange: (truckKey: string) => void;
  onClose: () => void;
  onRouteResolved: (route: CustomerRoutePreview) => void;
}) {
  const [cargo, setCargo] = useState("General goods");
  const [loadType, setLoadType] = useState("Loose / bulk");
  const [cargoQuantity, setCargoQuantity] = useState("");
  const [cargoUnit, setCargoUnit] = useState<"ton" | "quintal">("ton");
  const [quote, setQuote] = useState<CustomerQuotePreview | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const truck = TRUCKS.find((item) => item.key === selectedTruck) ?? TRUCKS[0];
  const rawCargoAmount = Number(cargoQuantity);
  const cargoTons = Number.isFinite(rawCargoAmount) && rawCargoAmount > 0
    ? (cargoUnit === "quintal" ? rawCargoAmount / 10 : rawCargoAmount)
    : 0;
  const cargoReady = cargoTons > 0 && cargoTons <= truck.maxTons;
  const routeReady = Boolean(routePreview && !routeLoading && !routeError);

  useEffect(() => {
    setQuote(null);
    setQuoteError("");
  }, [pickupPlace, dropoffPlace, selectedTruck]);

  async function calculateQuote() {
    if (!pickupPlace || !dropoffPlace || !routeReady) {
      setQuoteError("Choose a valid pickup and drop-off route first.");
      return;
    }
    if (!cargoTons) {
      setQuoteError("Enter a load amount greater than zero.");
      return;
    }
    if (cargoTons > truck.maxTons) {
      setQuoteError(`The load exceeds ${truck.label} capacity of ${truck.maxTons} Ton.`);
      return;
    }

    setQuoteLoading(true);
    setQuoteError("");
    setQuote(null);
    try {
      const result = await loadCustomerQuotePreview(userId, {
        pickupQuery: pickup,
        dropoffQuery: dropoff,
        pickupPlace,
        dropoffPlace,
        vehicleType: truck.label,
        cargoTons,
      });
      setQuote(result);
      onRouteResolved(result);
    } catch (error) {
      setQuoteError(error instanceof Error ? error.message : "Quote could not be calculated.");
    } finally {
      setQuoteLoading(false);
    }
  }

  function invalidateQuote() {
    setQuote(null);
    setQuoteError("");
  }

  return (
    <section className="booking-screen" aria-label="Choose truck and cargo">
      <div className="booking-topbar">
        <button type="button" className="round-button" onClick={onClose} aria-label="Back">‹</button>
        <div><small>02 · BOOK YOUR TRIP</small><strong>Choose truck &amp; cargo</strong></div>
        <button type="button" className="round-button" aria-label="More">•••</button>
      </div>

      <div className="booking-body">
        <p className="booking-subtitle">Select the best vehicle and load details for your delivery.</p>
        <div className="step-row" aria-label="Booking progress">
          <span className={routeReady ? "done" : ""}>✓ Route</span>
          <span className="active">✓ Truck</span>
          <span>Cargo</span>
          <span className={cargoReady ? "done" : ""}>Load</span>
          <span className={quote ? "done" : ""}>Quote</span>
        </div>

        {routePreview && (
          <div style={{ margin: "0 0 14px", border: "1px solid #dce6f2", borderRadius: 16, background: "#f8fbff", padding: 12, color: "#10213d", fontSize: 11, lineHeight: 1.55 }}>
            <small style={{ color: "#9a6700", fontWeight: 900 }}>AUTO ROUTE</small>
            <strong style={{ display: "block", marginTop: 3, fontSize: 12 }}>{routePreview.pickup_label} → {routePreview.dropoff_label}</strong>
            <span style={{ display: "block", marginTop: 4 }}>{routePreview.distance_km.toFixed(1)} km · {Math.round(routePreview.duration_minutes)} min · {truck.label}</span>
          </div>
        )}
        {routeLoading && <p style={{ margin: "0 0 12px", color: "#66758c", fontSize: 11, fontWeight: 750 }}>Recalculating the HGV route for {truck.label}…</p>}
        {routeError && <p role="alert" style={{ margin: "0 0 12px", color: "#b42318", fontSize: 11, fontWeight: 800 }}>{routeError}</p>}

        <h2>Choose truck type</h2>
        <div className="truck-grid">
          {TRUCKS.map((option) => (
            <button type="button" key={option.key} className={`truck-card ${selectedTruck === option.key ? "selected" : ""}`} onClick={() => { onTruckChange(option.key); invalidateQuote(); }}>
              <div className="truck-art-wrap"><TruckArtwork body={option.body}/></div>
              <strong>{option.label}</strong>
              <small>{option.capacity}</small>
              {selectedTruck === option.key && <span className="truck-check">✓</span>}
            </button>
          ))}
        </div>

        <div className="cargo-grid">
          <label><span>Cargo category</span><select value={cargo} onChange={(event) => { setCargo(event.target.value); invalidateQuote(); }}><option>General goods</option><option>Food &amp; beverage</option><option>Construction material</option><option>Other cargo</option></select></label>
          <label><span>Packaging / load type</span><select value={loadType} onChange={(event) => { setLoadType(event.target.value); invalidateQuote(); }}><option>Loose / bulk</option><option>Boxed</option><option>Palletized</option><option>Bagged</option></select></label>
        </div>

        <div className="cargo-grid">
          <label><span>Load amount</span><input type="number" min="0" step="0.1" inputMode="decimal" value={cargoQuantity} onChange={(event) => { setCargoQuantity(event.target.value); invalidateQuote(); }} placeholder="e.g. 5" /></label>
          <label><span>Unit</span><select value={cargoUnit} onChange={(event) => { setCargoUnit(event.target.value as "ton" | "quintal"); invalidateQuote(); }}><option value="ton">Ton</option><option value="quintal">Quintal</option></select></label>
        </div>

        <button type="button" className="details-row">Additional cargo details <span>⌄</span></button>

        {quoteError && <p role="alert" style={{ margin: "0 0 12px", color: "#b42318", fontSize: 12, fontWeight: 700 }}>{quoteError}</p>}

        {quote && (
          <div style={{ margin: "0 0 12px", border: "1px solid #dce6f2", borderRadius: 16, background: "#f8fbff", padding: 12, color: "#10213d", fontSize: 11, lineHeight: 1.55 }}>
            <strong style={{ display: "block", fontSize: 12 }}>{quote.pickup_label} → {quote.dropoff_label}</strong>
            <span style={{ display: "block", marginTop: 4 }}>{quote.distance_km.toFixed(1)} km · {Math.round(quote.duration_minutes)} min · {quote.cargo_tons.toFixed(1)} Ton · {quote.vehicle_type}</span>
          </div>
        )}

        <div className="quote-panel">
          <div><small>Estimated quote</small><strong>{quote ? formatQuoteEtb(quote.total_quote_etb) : "—"}</strong><span>{quote ? "Current Admin-managed transport rate." : "Automatic HGV distance + existing secure pricing RPC."}</span></div>
          <button type="button" onClick={() => void calculateQuote()} disabled={quoteLoading || !routeReady || !cargoReady}>{quoteLoading ? "Calculating…" : "Calculate Quote"} <Icon name="arrow" size={18}/></button>
        </div>
        <p style={{ margin: "10px 2px 0", color: "#68778d", fontSize: 10, lineHeight: 1.5 }}>Order creation is not enabled yet. This screen remains a read-only quote preview.</p>
      </div>
    </section>
  );
}

function BottomNav({ tab, setTab }: { tab: Tab; setTab: (tab: Tab) => void }) {
  const items: Array<{ tab: Tab; label: string; icon: IconName }> = [
    { tab: "home", label: "Home", icon: "home" },
    { tab: "orders", label: "Orders", icon: "orders" },
    { tab: "track", label: "Track", icon: "track" },
    { tab: "payments", label: "Payments", icon: "payments" },
    { tab: "profile", label: "Profile", icon: "profile" },
  ];
  return (
    <nav className="bottom-nav" aria-label="Customer navigation">
      {items.map((item) => (
        <button type="button" key={item.tab} className={tab === item.tab ? "active" : ""} onClick={() => setTab(item.tab)}>
          <span><Icon name={item.icon} size={20}/></span><small>{item.label}</small>
        </button>
      ))}
    </nav>
  );
}

export default function App({ identity }: { identity: CustomerIdentity }) {
  const [tab, setTab] = useState<Tab>("home");
  const [bookingOpen, setBookingOpen] = useState(false);
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [pickupPlace, setPickupPlace] = useState<CustomerPlaceOption | null>(null);
  const [dropoffPlace, setDropoffPlace] = useState<CustomerPlaceOption | null>(null);
  const [selectedTruck, setSelectedTruck] = useState("dry-cargo");
  const [routePreview, setRoutePreview] = useState<CustomerRoutePreview | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  const truck = TRUCKS.find((item) => item.key === selectedTruck) ?? TRUCKS[0];

  useEffect(() => {
    if (!pickupPlace || !dropoffPlace) {
      setRoutePreview(null);
      setRouteLoading(false);
      setRouteError("");
      return;
    }

    const controller = new AbortController();
    setRoutePreview(null);
    setRouteLoading(true);
    setRouteError("");

    void loadCustomerRoutePreview(identity.userId, {
      pickup: pickupPlace,
      dropoff: dropoffPlace,
      vehicleType: truck.label,
      signal: controller.signal,
    })
      .then((route) => {
        if (!controller.signal.aborted) setRoutePreview(route);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error as Error).name === "AbortError") return;
        setRouteError(error instanceof Error ? error.message : "Truck route could not be calculated.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setRouteLoading(false);
      });

    return () => controller.abort();
  }, [dropoffPlace, identity.userId, pickupPlace, truck.label]);

  const routeLabel = useMemo(() => routePreview
    ? `${routePreview.pickup_label} → ${routePreview.dropoff_label} · ${routePreview.distance_km.toFixed(1)} km`
    : pickup && dropoff ? `${pickup} → ${dropoff}` : "Route not selected", [dropoff, pickup, routePreview]);

  function changePickup(value: string) {
    setPickup(value);
    if (pickupPlace?.label !== value) setPickupPlace(null);
  }

  function changeDropoff(value: string) {
    setDropoff(value);
    if (dropoffPlace?.label !== value) setDropoffPlace(null);
  }

  function selectPickup(place: CustomerPlaceOption) {
    setPickup(place.label);
    setPickupPlace(place);
  }

  function selectDropoff(place: CustomerPlaceOption) {
    setDropoff(place.label);
    setDropoffPlace(place);
  }

  function swapPlaces() {
    if (!pickupPlace || !dropoffPlace) return;
    const nextPickup = dropoffPlace;
    const nextDropoff = pickupPlace;
    setPickup(nextPickup.label);
    setDropoff(nextDropoff.label);
    setPickupPlace(nextPickup);
    setDropoffPlace(nextDropoff);
  }

  function resetRoute() {
    setPickup("");
    setDropoff("");
    setPickupPlace(null);
    setDropoffPlace(null);
    setRoutePreview(null);
    setRouteError("");
  }

  function acceptRoute(route: CustomerRoutePreview) {
    setPickup(route.pickup_label);
    setDropoff(route.dropoff_label);
    setPickupPlace({ label: route.pickup_label, coordinates: route.pickup });
    setDropoffPlace({ label: route.dropoff_label, coordinates: route.dropoff });
    setRoutePreview(route);
    setRouteError("");
  }

  let content: ReactNode;
  if (tab === "home") {
    content = (
      <main className="home-page">
        <header className="home-brand"><HaloLogo/><span title={routeLabel}><Icon name="clock" size={16}/> {routeLoading ? "Finding route" : routePreview ? `${routePreview.distance_km.toFixed(1)} km` : "New booking"}</span></header>
        <CustomerBookingMap
          pickup={pickup}
          dropoff={dropoff}
          pickupPlace={pickupPlace}
          dropoffPlace={dropoffPlace}
          routePreview={routePreview}
          routeLoading={routeLoading}
          routeError={routeError}
          vehicleType={truck.label}
          onPickupChange={changePickup}
          onDropoffChange={changeDropoff}
          onPickupSelect={selectPickup}
          onDropoffSelect={selectDropoff}
          onSwap={swapPlaces}
          onReset={resetRoute}
          onBook={() => setBookingOpen(true)}
        />
      </main>
    );
  } else if (tab === "orders") {
    content = <CustomerOrdersPage userId={identity.userId} onHome={() => setTab("home")}/>;
  } else if (tab === "track") {
    content = <CustomerTrackingPage userId={identity.userId} onHome={() => setTab("home")}/>;
  } else if (tab === "payments") {
    content = <CustomerPaymentsPage userId={identity.userId} onHome={() => setTab("home")}/>;
  } else {
    content = <CustomerProfilePage userId={identity.userId}/>;
  }

  return (
    <div className="customer-app-shell">
      <div className="phone-stage">
        {content}
        {!bookingOpen && <BottomNav tab={tab} setTab={setTab}/>} 
        {bookingOpen && (
          <BookingSheet
            pickup={pickup}
            dropoff={dropoff}
            pickupPlace={pickupPlace}
            dropoffPlace={dropoffPlace}
            userId={identity.userId}
            selectedTruck={selectedTruck}
            routePreview={routePreview}
            routeLoading={routeLoading}
            routeError={routeError}
            onTruckChange={setSelectedTruck}
            onClose={() => setBookingOpen(false)}
            onRouteResolved={acceptRoute}
          />
        )}
      </div>
    </div>
  );
}
