import { useMemo, useState, type ReactNode } from "react";

type Tab = "home" | "orders" | "track" | "payments" | "profile";
type IconName = "home" | "orders" | "track" | "payments" | "profile" | "pin" | "arrow" | "truck" | "box" | "shield" | "clock";

type TruckOption = {
  key: string;
  label: string;
  capacity: string;
  body: "pickup" | "van" | "box" | "dry";
};

const TRUCKS: TruckOption[] = [
  { key: "pickup", label: "Pickup", capacity: "Max load: 3 Ton", body: "pickup" },
  { key: "van", label: "Van", capacity: "Max load: 5 Ton", body: "van" },
  { key: "isuzu", label: "Isuzu 5 Ton", capacity: "Max load: 5 Ton", body: "box" },
  { key: "dry-cargo", label: "Dry Cargo", capacity: "Max load: 10 Ton", body: "dry" },
];

const ICONS: Record<IconName, ReactNode> = {
  home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9 20v-6h6v6"/></>,
  orders: <><rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 4V2h6v2M8 9h8M8 13h8M8 17h5"/></>,
  track: <><path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3Z"/><path d="M8 3v15M16 6v15"/></>,
  payments: <><path d="M4 7h16v12H4z"/><path d="M4 10h16M15 14h3"/></>,
  profile: <><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></>,
  pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
  truck: <><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></>,
  box: <><path d="m4 7 8-4 8 4-8 4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></>,
  shield: <><path d="M12 3 5 6v5c0 4.8 3 8 7 10 4-2 7-5.2 7-10V6Z"/><path d="m9 12 2 2 4-4"/></>,
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
    <div className="halo-logo" aria-label="HALO Smart Logistics">
      <div className="halo-wordmark">HAL<span className="halo-pin-o"><span /></span></div>
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

function MapSurface({ pickup, dropoff, onPickup, onDropoff, onBook }: {
  pickup: string;
  dropoff: string;
  onPickup: (value: string) => void;
  onDropoff: (value: string) => void;
  onBook: () => void;
}) {
  return (
    <section className="map-surface" aria-label="Booking map preview">
      <div className="map-water map-water-a" />
      <div className="map-water map-water-b" />
      <div className="map-road map-road-one" />
      <div className="map-road map-road-two" />
      <div className="map-road map-road-three" />
      <span className="map-label map-label-ethiopia">ETHIOPIA</span>
      <span className="map-label map-label-addis">Addis Ababa</span>
      <span className="map-label map-label-adama">Adama</span>
      <span className="map-dot map-dot-addis" />
      <span className="map-dot map-dot-adama" />

      <div className="route-card">
        <label>
          <span><i className="route-dot route-dot-green" /> PICKUP PLACE</span>
          <input value={pickup} onChange={(event) => onPickup(event.target.value)} placeholder="Bakka fe'umsaa galchi" />
        </label>
        <div className="route-divider" />
        <label>
          <span><i className="route-dot route-dot-gold" /> DROP-OFF PLACE</span>
          <input value={dropoff} onChange={(event) => onDropoff(event.target.value)} placeholder="Bakka geessuu galchi" />
        </label>
      </div>

      <button type="button" className="my-location"><Icon name="pin" size={16}/> My Location</button>
      <div className="map-zoom" aria-hidden="true"><span>+</span><span>−</span></div>

      <div className="start-sheet">
        <span className="sheet-handle" />
        <div>
          <strong>Start your booking</strong>
          <small>Choose route, cargo and truck to continue.</small>
        </div>
        <button type="button" onClick={onBook}>Book Now <Icon name="arrow" size={17}/></button>
      </div>
    </section>
  );
}

function BookingSheet({ pickup, dropoff, onClose }: { pickup: string; dropoff: string; onClose: () => void }) {
  const [selectedTruck, setSelectedTruck] = useState("dry-cargo");
  const [cargo, setCargo] = useState("General goods");
  const [loadType, setLoadType] = useState("Loose / bulk");
  const routeReady = Boolean(pickup.trim() && dropoff.trim());

  return (
    <section className="booking-screen" aria-label="Choose truck and cargo">
      <div className="booking-topbar">
        <button type="button" className="round-button" onClick={onClose} aria-label="Back">‹</button>
        <div><small>02 · BOOK YOUR TRIP</small><strong>Choose truck &amp; cargo</strong></div>
        <button type="button" className="round-button" aria-label="More">•••</button>
      </div>

      <div className="booking-body">
        <p className="booking-subtitle">Select the best option for your delivery.</p>
        <div className="step-row" aria-label="Booking progress">
          <span className={routeReady ? "done" : ""}>✓ Route</span>
          <span className="active">✓ Truck</span>
          <span>Cargo</span>
          <span>Load</span>
          <span>Quote</span>
        </div>

        <h2>Choose truck type</h2>
        <div className="truck-grid">
          {TRUCKS.map((truck) => (
            <button type="button" key={truck.key} className={`truck-card ${selectedTruck === truck.key ? "selected" : ""}`} onClick={() => setSelectedTruck(truck.key)}>
              <div className="truck-art-wrap"><TruckArtwork body={truck.body}/></div>
              <strong>{truck.label}</strong>
              <small>{truck.capacity}</small>
              {selectedTruck === truck.key && <span className="truck-check">✓</span>}
            </button>
          ))}
        </div>

        <div className="cargo-grid">
          <label><span>Cargo category</span><select value={cargo} onChange={(event) => setCargo(event.target.value)}><option>General goods</option><option>Food &amp; beverage</option><option>Construction material</option><option>Other cargo</option></select></label>
          <label><span>Packaging / load type</span><select value={loadType} onChange={(event) => setLoadType(event.target.value)}><option>Loose / bulk</option><option>Boxed</option><option>Palletized</option><option>Bagged</option></select></label>
        </div>

        <button type="button" className="details-row">Additional cargo details <span>⌄</span></button>

        <div className="quote-panel">
          <div><small>Estimated quote</small><strong>—</strong><span>Pricing backend not connected in this UI-only slice.</span></div>
          <button type="button" disabled>Continue <Icon name="arrow" size={18}/></button>
        </div>
      </div>
    </section>
  );
}

function EmptyPage({ tab, onHome }: { tab: Exclude<Tab, "home">; onHome: () => void }) {
  const content = {
    orders: { icon: "orders" as IconName, eyebrow: "CUSTOMER ORDERS", title: "Ajajni amma hin jiru", body: "Ajaja haaraa Home irraa jalqabi. App haaraan Customer data yeroo backend integration xumuramu qofa agarsiisa." },
    track: { icon: "track" as IconName, eyebrow: "LIVE TRACKING", title: "Geejjibni live hin jiru", body: "Fake driver, ETA ykn route hin agarsiifamu. Active trip dhugaa yeroo backend irraa argamu asitti mul'ata." },
    payments: { icon: "payments" as IconName, eyebrow: "PAYMENTS", title: "Kaffaltiin hin fe'amne", body: "Payment history fi verification existing secure backend waliin yeroo walitti hidhamu asitti mul'ata." },
    profile: { icon: "profile" as IconName, eyebrow: "PROFILE", title: "Customer account connect godhi", body: "Identity fi account details fake data malee existing Customer authorization irraa fe'amuu qabu." },
  }[tab];

  return (
    <main className="standard-page">
      <header className="standard-header"><HaloLogo/><span className="status-badge">Standalone</span></header>
      <section className="empty-card">
        <span className="empty-icon"><Icon name={content.icon} size={30}/></span>
        <small>{content.eyebrow}</small>
        <h1>{content.title}</h1>
        <p>{content.body}</p>
        <button type="button" onClick={onHome}>Home irraa jalqabi</button>
      </section>
      <section className="trust-card">
        <span><Icon name="shield" size={22}/></span>
        <div><strong>Customer-only boundary</strong><small>Portal, Driver, Admin fi Partner UI irraa adda.</small></div>
      </section>
    </main>
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

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [bookingOpen, setBookingOpen] = useState(false);
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const routeLabel = useMemo(() => pickup && dropoff ? `${pickup} → ${dropoff}` : "Route not selected", [pickup, dropoff]);

  return (
    <div className="customer-app-shell">
      <div className="phone-stage">
        {tab === "home" ? (
          <main className="home-page">
            <header className="home-brand"><HaloLogo/><span title={routeLabel}><Icon name="clock" size={16}/> New booking</span></header>
            <MapSurface pickup={pickup} dropoff={dropoff} onPickup={setPickup} onDropoff={setDropoff} onBook={() => setBookingOpen(true)}/>
          </main>
        ) : (
          <EmptyPage tab={tab} onHome={() => setTab("home")}/>
        )}
        {!bookingOpen && <BottomNav tab={tab} setTab={setTab}/>} 
        {bookingOpen && <BookingSheet pickup={pickup} dropoff={dropoff} onClose={() => setBookingOpen(false)}/>} 
      </div>
    </div>
  );
}
