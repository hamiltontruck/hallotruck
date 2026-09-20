import { useEffect, useState, type ReactNode } from "react";
import type { CustomerIdentity } from "./auth/CustomerAuthBoundary";
import { CustomerBookingJourney } from "./CustomerBookingJourney";
import { CustomerHomePage } from "./CustomerHomePage";
import { CustomerOrdersV4Page as CustomerOrdersPage } from "./CustomerOrdersV4Page";
import { CustomerOrderDetailsPage } from "./CustomerOrderDetailsPage";
import { CustomerProfileV4Page as CustomerProfilePage } from "./CustomerProfileV4Page";
import { CustomerPaymentsPage } from "./CustomerPaymentsPage";
import { CustomerTrackingPage } from "./CustomerTrackingPage";
import { CustomerSavedLocationsPage, CustomerHelpPage, CustomerSettingsPage } from "./CustomerUtilityPages";
import { useCustomerLanguage } from "./customer-language";
import { loadCustomerRoutePreview, type CustomerPlaceOption, type CustomerRoutePreview } from "./customer-quote.service";
import type { CreatedCustomerOrder } from "./customer-order.service-v2";
import { customerTruckByKey } from "./customer-vehicle-catalog";
import "./customer-v4-parity.css";

type Page = "home" | "orders" | "order" | "track" | "payments" | "profile" | "saved" | "help" | "settings";
type NavPage = "home" | "orders" | "payments" | "profile";

function NavIcon({ name }: { name: NavPage | "book" }) {
  const icons: Record<NavPage | "book", ReactNode> = {
    home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9 20v-6h6v6"/></>,
    orders: <><rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 4V2h6v2M8 9h8M8 13h8M8 17h5"/></>,
    payments: <><path d="M4 7h16v12H4z"/><path d="M4 10h16M15 14h3"/></>,
    profile: <><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></>,
    book: <><path d="M12 5v14M5 12h14"/></>,
  };
  return <svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icons[name]}</svg>;
}

function BottomNav({ page, setPage, onBook }: { page: Page; setPage: (page: NavPage) => void; onBook: () => void }) {
  const { ui } = useCustomerLanguage();
  const items: Array<{ page: NavPage; label: string }> = [
    { page: "home", label: ui.home },
    { page: "orders", label: ui.orders },
    { page: "payments", label: ui.payments },
    { page: "profile", label: ui.profile },
  ];
  return <nav className="customer-final-bottom-nav" aria-label="Customer navigation">
    {items.slice(0,2).map((item) => <button type="button" key={item.page} className={page === item.page ? "active" : ""} onClick={() => setPage(item.page)}><NavIcon name={item.page}/><small>{item.label}</small></button>)}
    <button type="button" className="customer-final-nav-book" onClick={onBook} aria-label="Book a Truck"><NavIcon name="book"/></button>
    {items.slice(2).map((item) => <button type="button" key={item.page} className={page === item.page ? "active" : ""} onClick={() => setPage(item.page)}><NavIcon name={item.page}/><small>{item.label}</small></button>)}
  </nav>;
}

export default function App({ identity }: { identity: CustomerIdentity }) {
  const [page, setPage] = useState<Page>("home");
  const [previousPage, setPreviousPage] = useState<Page>("home");
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [pickupPlace, setPickupPlace] = useState<CustomerPlaceOption | null>(null);
  const [dropoffPlace, setDropoffPlace] = useState<CustomerPlaceOption | null>(null);
  const [selectedTruck, setSelectedTruck] = useState("dry-cargo");
  const [routePreview, setRoutePreview] = useState<CustomerRoutePreview | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");

  const truck = customerTruckByKey(selectedTruck);

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
    }).then((route) => {
      if (!controller.signal.aborted) setRoutePreview(route);
    }).catch((error: unknown) => {
      if (controller.signal.aborted || (error as Error).name === "AbortError") return;
      setRouteError(error instanceof Error ? error.message : "Truck route could not be calculated.");
    }).finally(() => {
      if (!controller.signal.aborted) setRouteLoading(false);
    });
    return () => controller.abort();
  }, [dropoffPlace, identity.userId, pickupPlace, truck.label]);

  function changePickup(value: string) {
    setPickup(value);
    if (pickupPlace?.label !== value) setPickupPlace(null);
  }
  function changeDropoff(value: string) {
    setDropoff(value);
    if (dropoffPlace?.label !== value) setDropoffPlace(null);
  }
  function selectPickup(place: CustomerPlaceOption) { setPickup(place.label); setPickupPlace(place); }
  function selectDropoff(place: CustomerPlaceOption) { setDropoff(place.label); setDropoffPlace(place); }
  function swapPlaces() {
    if (!pickupPlace || !dropoffPlace) return;
    setPickup(dropoffPlace.label); setPickupPlace(dropoffPlace);
    setDropoff(pickupPlace.label); setDropoffPlace(pickupPlace);
  }
  function resetRoute() {
    setPickup(""); setDropoff(""); setPickupPlace(null); setDropoffPlace(null); setRoutePreview(null); setRouteError("");
  }
  function navigate(next: Page) {
    setPreviousPage(page);
    if (next !== "track") setTrackingOrderId(null);
    setPage(next);
  }
  function openOrder(orderId: string) {
    setSelectedOrderId(orderId);
    setPreviousPage(page);
    setPage("order");
  }
  function openTracking(orderId?: string | null) {
    if (orderId) setTrackingOrderId(orderId);
    setPreviousPage(page);
    setPage("track");
  }
  function handleOrderCreated(_order: CreatedCustomerOrder) {
    // The booking journey owns the confirmation screen. Orders refresh from the
    // production source when the user opens Orders or Order Details.
  }

  let content: ReactNode;
  if (page === "home") {
    content = <CustomerHomePage userId={identity.userId} fullName={identity.fullName} onBook={() => setBookingOpen(true)} onOrders={() => navigate("orders")} onTrack={() => openTracking()} onPayments={() => navigate("payments")} onSaved={() => navigate("saved")} onSupport={() => navigate("help")} onOrder={openOrder}/>;
  } else if (page === "orders") {
    content = <CustomerOrdersPage userId={identity.userId} onHome={() => navigate("home")} onNewOrder={() => setBookingOpen(true)} onTrackOrder={(orderId) => openTracking(orderId)} onOpenOrder={openOrder}/>;
  } else if (page === "order" && selectedOrderId) {
    content = <CustomerOrderDetailsPage userId={identity.userId} orderId={selectedOrderId} onBack={() => setPage(previousPage === "order" ? "orders" : previousPage)} onTrack={() => openTracking(selectedOrderId)}/>;
  } else if (page === "track") {
    content = <CustomerTrackingPage userId={identity.userId} initialOrderId={trackingOrderId} onHome={() => navigate("home")} onOrders={() => navigate("orders")}/>;
  } else if (page === "payments") {
    content = <CustomerPaymentsPage userId={identity.userId} onHome={() => navigate("home")}/>;
  } else if (page === "saved") {
    content = <CustomerSavedLocationsPage userId={identity.userId} onBack={() => setPage(previousPage)} onProfile={() => navigate("profile")}/>;
  } else if (page === "help") {
    content = <CustomerHelpPage onBack={() => setPage(previousPage)} onOrders={() => navigate("orders")}/>;
  } else if (page === "settings") {
    content = <CustomerSettingsPage onBack={() => setPage(previousPage)}/>;
  } else {
    content = <CustomerProfilePage userId={identity.userId} onSavedLocations={() => navigate("saved")} onHelp={() => navigate("help")} onSettings={() => navigate("settings")}/>;
  }

  return <div className="customer-app-shell customer-final-shell"><div className="phone-stage customer-final-stage">
    {content}
    {!bookingOpen && page !== "track" && <BottomNav page={page} setPage={(next) => navigate(next)} onBook={() => setBookingOpen(true)}/>}
    {bookingOpen && <CustomerBookingJourney
      userId={identity.userId}
      pickup={pickup}
      dropoff={dropoff}
      pickupPlace={pickupPlace}
      dropoffPlace={dropoffPlace}
      selectedTruck={selectedTruck}
      routePreview={routePreview}
      routeLoading={routeLoading}
      routeError={routeError}
      onPickupChange={changePickup}
      onDropoffChange={changeDropoff}
      onPickupSelect={selectPickup}
      onDropoffSelect={selectDropoff}
      onSwap={swapPlaces}
      onReset={resetRoute}
      onTruckChange={setSelectedTruck}
      onClose={() => setBookingOpen(false)}
      onCreated={handleOrderCreated}
      onViewOrder={(orderId) => { setBookingOpen(false); openOrder(orderId); }}
    />}
  </div></div>;
}
