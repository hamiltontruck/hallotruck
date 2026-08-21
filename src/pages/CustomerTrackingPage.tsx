import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CustomerCancelOrderModal } from "../components/customer/CustomerCancelOrderModal";
import { CustomerLiveTripMap } from "../components/tracking/CustomerLiveTripMap";
import { useLanguage, type HalloLanguage } from "../i18n/LanguageProvider";
import {
  getCustomerPortalData,
  type CustomerDriverAssignment,
  type CustomerOrder,
} from "../services/customer.service";

const copy: Record<HalloLanguage, {
  eyebrow: string;
  live: string;
  back: string;
  call: string;
  pickup: string;
  dropoff: string;
  waiting: string;
  waitingHelp: string;
  notFound: string;
  loadError: string;
  verified: string;
  cancelled: string;
  cancelledHelp: string;
  reason: string;
  cancelledAt: string;
  cancelOrder: string;
}> = {
  en: {
    eyebrow: "LIVE CARGO TRACKING",
    live: "Live",
    back: "Back to orders",
    call: "Call driver",
    pickup: "Pickup",
    dropoff: "Drop-off",
    waiting: "Waiting for verified assignment",
    waitingHelp: "Dispatch is confirming an eligible driver and truck. Live GPS appears here after assignment and trip start.",
    notFound: "This order could not be found in your account.",
    loadError: "Live tracking could not be loaded.",
    verified: "Verified driver & truck",
    cancelled: "Cancelled",
    cancelledHelp: "Live tracking has stopped. The assigned driver and Admin can see your cancellation reason.",
    reason: "Cancellation reason",
    cancelledAt: "Cancelled",
    cancelOrder: "Cancel this order",
  },
  om: {
    eyebrow: "HORDOFFII FEʼUMSAA LIVE",
    live: "Live",
    back: "Gara orders deebiʼi",
    call: "Driver bilbili",
    pickup: "Pickup",
    dropoff: "Drop-off",
    waiting: "Assignment verified eegamaa jira",
    waitingHelp: "Dispatch driver fi truck seera guutan mirkaneessaa jira. Assignment fi trip erga jalqabee booda GPS live as irratti mulʼata.",
    notFound: "Order kun account kee keessatti hin argamne.",
    loadError: "Live tracking feʼuun hin dandaʼamne.",
    verified: "Driver fi truck verified",
    cancelled: "Dhiifame",
    cancelledHelp: "Hordoffiin kallattii dhaabbateera. Konkolaachisaa ramadamee fi Admin sababaa dhiisuu kee ni argu.",
    reason: "Sababa ajaja dhiisuu",
    cancelledAt: "Yeroo dhiifame",
    cancelOrder: "Ajaja kana dhiisi",
  },
  am: {
    eyebrow: "ቀጥታ የጭነት ክትትል",
    live: "ቀጥታ",
    back: "ወደ ትዕዛዞች ተመለስ",
    call: "ለአሽከርካሪው ይደውሉ",
    pickup: "መነሻ",
    dropoff: "መድረሻ",
    waiting: "የተረጋገጠ ምደባ በመጠበቅ ላይ",
    waitingHelp: "ዲስፓች ብቁ አሽከርካሪና መኪና እያረጋገጠ ነው። ከምደባና ከጉዞ መጀመር በኋላ ቀጥታ GPS እዚህ ይታያል።",
    notFound: "ይህ ትዕዛዝ በመለያዎ ውስጥ አልተገኘም።",
    loadError: "ቀጥታ ክትትሉን መጫን አልተቻለም።",
    verified: "የተረጋገጠ አሽከርካሪና መኪና",
    cancelled: "ተሰርዟል",
    cancelledHelp: "ቀጥታ ክትትሉ ቆሟል። የተመደበው አሽከርካሪና Admin የስረዛ ምክንያትዎን ማየት ይችላሉ።",
    reason: "የስረዛ ምክንያት",
    cancelledAt: "የተሰረዘበት ጊዜ",
    cancelOrder: "ይህን ትዕዛዝ ሰርዝ",
  },
};

export function CustomerTrackingPage() {
  const { orderId = "" } = useParams();
  const { language } = useLanguage();
  const t = copy[language];
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [assignment, setAssignment] = useState<CustomerDriverAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await getCustomerPortalData();
        if (cancelled) return;
        const currentOrder = data.orders.find((item) => item.id === orderId) ?? null;
        setOrder(currentOrder);
        setAssignment(data.assignments.find((item) => item.order_id === orderId) ?? null);
        setError(currentOrder ? "" : t.notFound);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t.loadError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const channel = window.setInterval(() => void load(), 10000);
    return () => {
      cancelled = true;
      window.clearInterval(channel);
    };
  }, [orderId, t.loadError, t.notFound]);

  useEffect(() => {
    if (!cancelOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [cancelOpen]);

  async function refreshAfterCancellation() {
    setCancelOpen(false);
    const data = await getCustomerPortalData();
    const currentOrder = data.orders.find((item) => item.id === orderId) ?? null;
    setOrder(currentOrder);
    setAssignment(data.assignments.find((item) => item.order_id === orderId) ?? null);
  }

  const initials = useMemo(() => {
    const parts = (assignment?.driver_name ?? "Driver").trim().split(/\s+/).slice(0, 2);
    return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "DR";
  }, [assignment?.driver_name]);

  const trackable = order && ["accepted", "in_transit", "delivered"].includes(order.status);
  const cancellable = order && ["quoted", "placed", "accepted", "in_transit"].includes(order.status);

  return (
    <main className="customer-live-page">
      <header className="customer-live-page__header">
        <Link to="/customer/orders" aria-label={t.back}>←</Link>
        <div>
          <p>{t.eyebrow}</p>
          <h1>{order?.tracking_id ?? (loading ? "Loading…" : "HALLOTRUCK")}</h1>
        </div>
        <span className={`customer-live-page__badge${order?.status === "cancelled" ? " is-cancelled" : ""}`}>{order?.status === "cancelled" ? t.cancelled : `● ${t.live}`}</span>
      </header>

      <section className="customer-live-page__content">
        {error && <p className="customer-nearby-sheet__error">{error}</p>}

        {order && (
          <>
            {assignment && order.status !== "cancelled" && (
              <article className="customer-live-page__driver">
                <div className="customer-live-page__avatar">{initials}</div>
                <div>
                  <h2>{assignment.driver_name}</h2>
                  <p>{t.verified} · {assignment.vehicle_type ?? order.vehicle_type}</p>
                  <small>{assignment.plate_number ?? "Plate pending"} · {assignment.capacity_tons == null ? "Capacity pending" : `${assignment.capacity_tons} ton`}</small>
                </div>
                {assignment.driver_phone && <a href={`tel:${assignment.driver_phone}`}>{t.call}</a>}
              </article>
            )}

            <article className="customer-live-page__route">
              <span />
              <div><strong>{order.pickup_address}</strong><small>{t.pickup}</small></div>
              <span />
              <div><strong>{order.dropoff_address}</strong><small>{t.dropoff}</small></div>
            </article>

            {cancellable && <button type="button" className="customer-live-page__cancel-order" onClick={() => setCancelOpen(true)}>{t.cancelOrder}</button>}

            {order.status === "cancelled" ? (
              <article className="customer-live-page__cancelled">
                <h2>{t.cancelled}</h2>
                <p>{t.cancelledHelp}</p>
                <div><small>{t.reason}</small><strong>{order.cancellation_reason ?? "—"}</strong></div>
                {order.cancelled_at && <time>{t.cancelledAt}: {new Date(order.cancelled_at).toLocaleString()}</time>}
              </article>
            ) : assignment && trackable ? (
              <article className="customer-live-page__map-shell">
                <CustomerLiveTripMap orderId={order.id} totalDistanceKm={order.distance_km} standalone />
              </article>
            ) : (
              <article className="customer-live-page__waiting">
                <h2>{t.waiting}</h2>
                <p>{t.waitingHelp}</p>
              </article>
            )}
          </>
        )}
      </section>

      {cancelOpen && order && <CustomerCancelOrderModal order={order} onClose={() => setCancelOpen(false)} onCancelled={refreshAfterCancellation} />}
    </main>
  );
}
