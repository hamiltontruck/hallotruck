import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { CustomerIdentity } from "./auth/CustomerAuthBoundary";
import { CustomerBookingMap } from "./CustomerBookingMap";
import { CustomerBookingFlow } from "./CustomerBookingFlow";
import { CustomerOrdersV4Page as CustomerOrdersPage } from "./CustomerOrdersV4Page";
import { CustomerProfileV4Page as CustomerProfilePage } from "./CustomerProfileV4Page";
import { CustomerPaymentsPage } from "./CustomerPaymentsPage";
import { CustomerTrackingPage } from "./CustomerTrackingPage";
import { CustomerLanguageSwitcher, useCustomerLanguage } from "./customer-language";
import {
  loadCustomerRoutePreview,
  type CustomerPlaceOption,
  type CustomerRoutePreview,
} from "./customer-quote.service";
import type { CreatedCustomerOrder } from "./customer-order.service";
import { customerTruckByKey } from "./customer-vehicle-catalog";
import "./customer-v4-parity.css";

type Tab = "home" | "orders" | "track" | "payments" | "profile";
type IconName = "home" | "orders" | "track" | "payments" | "profile" | "clock";

const ICONS: Record<IconName, ReactNode> = {
  home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9 20v-6h6v6"/></>,
  orders: <><rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 4V2h6v2M8 9h8M8 13h8M8 17h5"/></>,
  track: <><path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3Z"/><path d="M8 3v15M16 6v15"/></>,
  payments: <><path d="M4 7h16v12H4z"/><path d="M4 10h16M15 14h3"/></>,
  profile: <><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
};

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{ICONS[name]}</svg>;
}

function HalloLogo() {
  return <div className="halo-logo" aria-label="HALLOTRUCK Customer Mobile"><div className="halo-wordmark">HALLO<span style={{ color: "var(--gold)", marginLeft: ".08em" }}>TRUCK</span></div><div className="halo-brand-copy"><strong>Customer</strong><small>Smart Logistics</small></div></div>;
}

function BottomNav({ tab, setTab }: { tab: Tab; setTab: (tab: Tab) => void }) {
  const items: Array<{ tab: Tab; label: string; icon: IconName }> = [
    { tab: "home", label: "Home", icon: "home" },
    { tab: "orders", label: "Orders", icon: "orders" },
    { tab: "track", label: "Track", icon: "track" },
    { tab: "payments", label: "Payments", icon: "payments" },
    { tab: "profile", label: "Profile", icon: "profile" },
  ];
  return <nav className="bottom-nav" aria-label="Customer navigation">{items.map((item) => <button type="button" key={item.tab} className={tab === item.tab ? "active" : ""} onClick={() => setTab(item.tab)}><span><Icon name={item.icon} size={20}/></span><small>{item.label}</small></button>)}</nav>;
}

export default function App({ identity }: { identity: CustomerIdentity }) {
  const { text } = useCustomerLanguage();
  const [tab, setTab] = useState<Tab>("home");
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [pickupPlace, setPickupPlace] = useState<CustomerPlaceOption | null>(null);
  const [dropoffPlace, setDropoffPlace] = useState<CustomerPlaceOption | null>(null);
  const [selectedTruck, setSelectedTruck] = useState("dry-cargo");
  const [routePreview, setRoutePreview] = useState<CustomerRoutePreview | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [createdOrder, setCreatedOrder] = useState<CreatedCustomerOrder | null>(null);
  const truck = customerTruckByKey(selectedTruck);

  useEffect(() => {
    if (!pickupPlace || !dropoffPlace) {
      setRoutePreview(null); setRouteLoading(false); setRouteError(""); return;
    }
    const controller = new AbortController();
    setRoutePreview(null); setRouteLoading(true); setRouteError("");
    void loadCustomerRoutePreview(identity.userId, { pickup: pickupPlace, dropoff: dropoffPlace, vehicleType: truck.label, signal: controller.signal })
      .then((route) => { if (!controller.signal.aborted) setRoutePreview(route); })
      .catch((error: unknown) => { if (controller.signal.aborted || (error as Error).name === "AbortError") return; setRouteError(error instanceof Error ? error.message : "Truck route could not be calculated."); })
      .finally(() => { if (!controller.signal.aborted) setRouteLoading(false); });
    return () => controller.abort();
  }, [dropoffPlace, identity.userId, pickupPlace, truck.label]);

  const routeLabel = useMemo(() => routePreview ? `${routePreview.pickup_label} → ${routePreview.dropoff_label} · ${routePreview.distance_km.toFixed(1)} km` : pickup && dropoff ? `${pickup} → ${dropoff}` : "Route not selected", [dropoff, pickup, routePreview]);

  function changePickup(value: string) { setPickup(value); if (pickupPlace?.label !== value) setPickupPlace(null); }
  function changeDropoff(value: string) { setDropoff(value); if (dropoffPlace?.label !== value) setDropoffPlace(null); }
  function selectPickup(place: CustomerPlaceOption) { setPickup(place.label); setPickupPlace(place); }
  function selectDropoff(place: CustomerPlaceOption) { setDropoff(place.label); setDropoffPlace(place); }
  function swapPlaces() { if (!pickupPlace || !dropoffPlace) return; const nextPickup = dropoffPlace; const nextDropoff = pickupPlace; setPickup(nextPickup.label); setDropoff(nextDropoff.label); setPickupPlace(nextPickup); setDropoffPlace(nextDropoff); }
  function resetRoute() { setPickup(""); setDropoff(""); setPickupPlace(null); setDropoffPlace(null); setRoutePreview(null); setRouteError(""); }
  function handleOrderCreated(order: CreatedCustomerOrder) { setCreatedOrder(order); setBookingOpen(false); setTrackingOrderId(null); setTab("orders"); }
  function openTracking(orderId: string) { setTrackingOrderId(orderId); setTab("track"); }
  function changeTab(next: Tab) { setTrackingOrderId(null); setTab(next); }

  let content: ReactNode;
  if (tab === "home") {
    content = <main className="home-page"><header className="home-brand customer-home-brand"><HalloLogo/><div className="customer-home-actions"><CustomerLanguageSwitcher compact/><span className="customer-route-status" title={routeLabel}><Icon name="clock" size={15}/>{routeLoading ? text.findingRoute : routePreview ? `${routePreview.distance_km.toFixed(1)} km` : text.newBooking}</span></div></header><CustomerBookingMap pickup={pickup} dropoff={dropoff} pickupPlace={pickupPlace} dropoffPlace={dropoffPlace} routePreview={routePreview} routeLoading={routeLoading} routeError={routeError} vehicleType={truck.label} onPickupChange={changePickup} onDropoffChange={changeDropoff} onPickupSelect={selectPickup} onDropoffSelect={selectDropoff} onSwap={swapPlaces} onReset={resetRoute} onBook={() => setBookingOpen(true)}/></main>;
  } else if (tab === "orders") {
    content = <CustomerOrdersPage userId={identity.userId} onHome={() => changeTab("home")} onNewOrder={() => setBookingOpen(true)} onTrackOrder={openTracking}/>;
  } else if (tab === "track") {
    content = <CustomerTrackingPage userId={identity.userId} initialOrderId={trackingOrderId} onHome={() => changeTab("home")} onOrders={() => changeTab("orders")}/>;
  } else if (tab === "payments") {
    content = <CustomerPaymentsPage userId={identity.userId} onHome={() => changeTab("home")}/>;
  } else {
    content = <CustomerProfilePage userId={identity.userId}/>;
  }

  return <div className="customer-app-shell"><div className="phone-stage">{content}{createdOrder && <div className="customer-order-success" role="status"><div><strong>Order confirmed</strong><span>{createdOrder.trackingId} · ETB {createdOrder.priceEtb.toLocaleString()}</span></div><button type="button" onClick={() => setCreatedOrder(null)} aria-label="Dismiss order confirmation">×</button></div>}{!bookingOpen && <BottomNav tab={tab} setTab={changeTab}/>} {bookingOpen && <CustomerBookingFlow pickup={pickup} dropoff={dropoff} pickupPlace={pickupPlace} dropoffPlace={dropoffPlace} userId={identity.userId} selectedTruck={selectedTruck} routePreview={routePreview} routeLoading={routeLoading} routeError={routeError} onTruckChange={setSelectedTruck} onClose={() => setBookingOpen(false)} onOrderCreated={handleOrderCreated}/>}</div></div>;
}
