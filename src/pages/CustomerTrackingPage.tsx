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
import { supabase } from "../services/supabase.client";

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
  retry: string;
  tripInProgress: string;
  assignedTruck: string;
  truckPlate: string;
  capacity: string;
  truckPhoto: string;
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
    retry: "Retry tracking",
    tripInProgress: "Trip in progress",
    assignedTruck: "Assigned truck",
    truckPlate: "Plate",
    capacity: "Capacity",
    truckPhoto: "Assigned truck photo",
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
    retry: "Hordoffii irra deebiʼii yaali",
    tripInProgress: "Trip hojii irra jira",
    assignedTruck: "Truck ramadame",
    truckPlate: "Lakkoofsa gabatee",
    capacity: "Dandeettii",
    truckPhoto: "Suuraa truck ramadamee",
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
    retry: "ክትትሉን እንደገና ሞክር",
    tripInProgress: "ጉዞ በሂደት ላይ",
    assignedTruck: "የተመደበ መኪና",
    truckPlate: "ሰሌዳ",
    capacity: "አቅም",
    truckPhoto: "የተመደበ መኪና ፎቶ",
  },
};

export function CustomerTrackingPage() {
  const { orderId = "" } = useParams();
  const { language } = useLanguage();
  const t = copy[language];
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [assignment, setAssignment] = useState<CustomerDriverAssignment | null>(null);
  const [truckPhotoUrl, setTruckPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
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
  }, [orderId, retryKey, t.loadError, t.notFound]);

  useEffect(() => {
    let cancelled = false;
    const path = assignment?.truck_photo_path;
    if (!path) {
      setTruckPhotoUrl(null);
      return;
    }

    void supabase.storage
      .from("driver-verification")
      .createSignedUrl(path, 3600)
      .then(({ data, error: photoError }) => {
        if (!cancelled) setTruckPhotoUrl(photoError ? null : data?.signedUrl ?? null);
      });

    return () => { cancelled = true; };
  }, [assignment?.truck_photo_path]);

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
        {error && (
          <div className="customer-nearby-sheet__error" role="alert">
            <p>{error}</p>
            <button type="button" disabled={loading} onClick={() => setRetryKey((key) => key + 1)}>
              {loading ? "Loading…" : t.retry}
            </button>
          </div>
        )}

        {order && (
          <>
            {assignment && order.status !== "cancelled" && (
              <article className="customer-live-page__truck-card">
                <div className="customer-live-page__truck-photo">
                  {truckPhotoUrl ? (
                    <img src={truckPhotoUrl} alt={t.truckPhoto} onError={() => setTruckPhotoUrl(null)} />
                  ) : (
                    <span aria-hidden="true">🚚</span>
                  )}
                </div>
                <div className="customer-live-page__truck-copy">
                  <small>{t.assignedTruck}</small>
                  <h2>{assignment.vehicle_type ?? order.vehicle_type}</h2>
                  <p>{t.truckPlate}: {assignment.plate_number ?? "—"} · {t.capacity}: {assignment.capacity_tons == null ? "—" : `${assignment.capacity_tons} ton`}</p>
                </div>
                <span className={`customer-live-page__truck-state${trackable ? " is-live" : ""}`}>{trackable ? t.tripInProgress : t.assignedTruck}</span>
              </article>
            )}

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
