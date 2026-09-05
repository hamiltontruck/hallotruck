import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage, type HalloLanguage } from "../i18n/LanguageProvider";
import {
  getCustomerPortalData,
  type CustomerDriverAssignment,
  type CustomerOrder,
} from "../services/customer.service";
import { supabase } from "../services/supabase.client";

const LIVE_ORDER_STATUSES = new Set(["quoted", "placed", "assigned", "accepted", "in_transit"]);

const copy: Record<HalloLanguage, {
  eyebrow: string;
  title: string;
  subtitle: string;
  newest: string;
  liveOrders: string;
  noOrders: string;
  noOrdersHelp: string;
  createOrder: string;
  retry: string;
  loading: string;
  route: string;
  truck: string;
  distance: string;
  amount: string;
  payment: string;
  driver: string;
  waitingDriver: string;
  verifiedDriver: string;
  openOrder: string;
  trackGps: string;
  created: string;
  statuses: Record<string, string>;
}> = {
  en: {
    eyebrow: "CUSTOMER LIVE ORDERS",
    title: "Live orders",
    subtitle: "Every current order appears here immediately, including orders still waiting for an assigned driver.",
    newest: "Newest live order",
    liveOrders: "Current orders",
    noOrders: "No live order",
    noOrdersHelp: "Create a transport order and it will remain visible here from placement through delivery.",
    createOrder: "Create transport order",
    retry: "Try again",
    loading: "Loading live orders…",
    route: "Route",
    truck: "Truck",
    distance: "Distance",
    amount: "Trip amount",
    payment: "Payment method",
    driver: "Driver",
    waitingDriver: "Waiting for verified driver assignment",
    verifiedDriver: "Verified driver assigned",
    openOrder: "Open live order",
    trackGps: "Track live GPS",
    created: "Created",
    statuses: {
      quoted: "Quote ready",
      placed: "Order placed",
      assigned: "Driver assigned",
      accepted: "Driver accepted",
      in_transit: "In transit",
    },
  },
  om: {
    eyebrow: "ORDER LIVE CUSTOMER",
    title: "Ajajoota live",
    subtitle: "Order ammaa hundi, driver ramadamuu eegaa jiru dabalatee, as irratti battalumatti mulʼata.",
    newest: "Order live haaraa",
    liveOrders: "Ajajoota hojii irra jiran",
    noOrders: "Order live hin jiru",
    noOrdersHelp: "Order geejjibaa uumi; yeroo uumame irraa hanga geessifamutti as irratti ni mulʼata.",
    createOrder: "Order geejjibaa uumi",
    retry: "Irra deebiʼi",
    loading: "Ajajoota live feʼaa jira…",
    route: "Daandii",
    truck: "Konkolaataa",
    distance: "Fageenya",
    amount: "Gatii imalaa",
    payment: "Mala kaffaltii",
    driver: "Konkolaachisaa",
    waitingDriver: "Driver verified ramadamuu eegaa jira",
    verifiedDriver: "Driver verified ramadameera",
    openOrder: "Order live bani",
    trackGps: "GPS live hordofi",
    created: "Uumame",
    statuses: {
      quoted: "Gatiin qophaaʼe",
      placed: "Order galmaaʼe",
      assigned: "Driver ramadame",
      accepted: "Driver fudhate",
      in_transit: "Daandii irra",
    },
  },
  am: {
    eyebrow: "የደንበኛ ቀጥታ ትዕዛዞች",
    title: "ቀጥታ ትዕዛዞች",
    subtitle: "አሽከርካሪ ምደባን የሚጠብቁ ትዕዛዞችን ጨምሮ ሁሉም የአሁን ትዕዛዞች እዚህ ይታያሉ።",
    newest: "አዲሱ ቀጥታ ትዕዛዝ",
    liveOrders: "የአሁን ትዕዛዞች",
    noOrders: "ቀጥታ ትዕዛዝ የለም",
    noOrdersHelp: "የትራንስፖርት ትዕዛዝ ይፍጠሩ፤ ከተፈጠረበት ጊዜ እስከ ማድረስ ድረስ እዚህ ይታያል።",
    createOrder: "የትራንስፖርት ትዕዛዝ ፍጠር",
    retry: "እንደገና ይሞክሩ",
    loading: "ቀጥታ ትዕዛዞችን በመጫን ላይ…",
    route: "መንገድ",
    truck: "መኪና",
    distance: "ርቀት",
    amount: "የጉዞ ዋጋ",
    payment: "የክፍያ ዘዴ",
    driver: "አሽከርካሪ",
    waitingDriver: "የተረጋገጠ አሽከርካሪ ምደባን በመጠበቅ ላይ",
    verifiedDriver: "የተረጋገጠ አሽከርካሪ ተመድቧል",
    openOrder: "ቀጥታ ትዕዛዝ ክፈት",
    trackGps: "ቀጥታ GPS ተከታተል",
    created: "የተፈጠረ",
    statuses: {
      quoted: "ዋጋ ዝግጁ",
      placed: "ትዕዛዝ ተመዝግቧል",
      assigned: "አሽከርካሪ ተመድቧል",
      accepted: "አሽከርካሪው ተቀብሏል",
      in_transit: "በመንገድ ላይ",
    },
  },
};

function assignmentFor(order: CustomerOrder, assignments: CustomerDriverAssignment[]) {
  return assignments.find((item) => item.order_id === order.id) ?? null;
}

export function CustomerLiveOrders() {
  const { language } = useLanguage();
  const t = copy[language];
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [assignments, setAssignments] = useState<CustomerDriverAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await getCustomerPortalData();
      setOrders(data.orders.filter((order) => LIVE_ORDER_STATUSES.has(order.status)));
      setAssignments(data.assignments);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Live orders could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel("customer-live-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void load())
      .subscribe();
    const interval = window.setInterval(() => void load(), 15000);
    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const newestOrder = orders[0] ?? null;
  const remainingOrders = useMemo(() => newestOrder ? orders.slice(1) : orders, [newestOrder, orders]);

  if (loading) {
    return <main className="customer-live-orders"><p className="customer-live-orders__loading">{t.loading}</p></main>;
  }

  return (
    <main className="customer-live-orders">
      <header className="customer-live-orders__hero">
        <div>
          <p>{t.eyebrow}</p>
          <h1>{t.title}</h1>
          <span>{t.subtitle}</span>
        </div>
        <strong>{orders.length}</strong>
      </header>

      {error && (
        <section className="customer-live-orders__error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void load()}>{t.retry}</button>
        </section>
      )}

      {!error && !orders.length && (
        <section className="customer-live-orders__empty">
          <div aria-hidden="true">⌖</div>
          <h2>{t.noOrders}</h2>
          <p>{t.noOrdersHelp}</p>
          <Link to="/customer">{t.createOrder}</Link>
        </section>
      )}

      {newestOrder && (
        <section className="customer-live-orders__section">
          <h2>{t.newest}</h2>
          <LiveOrderCard order={newestOrder} assignment={assignmentFor(newestOrder, assignments)} labels={t} primary />
        </section>
      )}

      {remainingOrders.length > 0 && (
        <section className="customer-live-orders__section">
          <h2>{t.liveOrders}</h2>
          <div className="customer-live-orders__grid">
            {remainingOrders.map((order) => (
              <LiveOrderCard key={order.id} order={order} assignment={assignmentFor(order, assignments)} labels={t} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function LiveOrderCard({
  order,
  assignment,
  labels,
  primary = false,
}: {
  order: CustomerOrder;
  assignment: CustomerDriverAssignment | null;
  labels: (typeof copy)[HalloLanguage];
  primary?: boolean;
}) {
  const gpsReady = Boolean(assignment && order.status === "in_transit");
  const paymentLabel = order.selected_payment_method === "bank_telebirr" ? "Bank / Telebirr" : "Cash";
  const statusLabel = labels.statuses[order.status] ?? order.status.replace(/_/g, " ");

  return (
    <article className={`customer-live-order-card${primary ? " is-primary" : ""}`}>
      <div className="customer-live-order-card__top">
        <div>
          <p>{order.tracking_id}</p>
          <h3>{order.pickup_address} <span>→</span> {order.dropoff_address}</h3>
        </div>
        <span className={`customer-live-order-card__status is-${order.status}`}>● {statusLabel}</span>
      </div>

      <div className="customer-live-order-card__driver">
        <span aria-hidden="true">{assignment ? "✓" : "…"}</span>
        <div>
          <small>{labels.driver}</small>
          <strong>{assignment?.driver_name ?? labels.waitingDriver}</strong>
          {assignment && <p>{labels.verifiedDriver} · {assignment.plate_number ?? order.vehicle_type}</p>}
        </div>
      </div>

      <dl className="customer-live-order-card__facts">
        <div><dt>{labels.truck}</dt><dd>{assignment?.vehicle_type ?? order.vehicle_type}</dd></div>
        <div><dt>{labels.distance}</dt><dd>{order.distance_km ? `${Number(order.distance_km).toLocaleString()} km` : "—"}</dd></div>
        <div><dt>{labels.amount}</dt><dd>ETB {Number(order.price_etb ?? 0).toLocaleString()}</dd></div>
        <div><dt>{labels.payment}</dt><dd>{paymentLabel}</dd></div>
      </dl>

      <div className="customer-live-order-card__footer">
        <time>{labels.created}: {new Date(order.created_at).toLocaleString()}</time>
        <Link to={`/customer/tracking/${order.id}`}>{gpsReady ? labels.trackGps : labels.openOrder}</Link>
      </div>
    </article>
  );
}

