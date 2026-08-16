import { useEffect, useMemo, useState } from "react";
import { useLanguage, type HalloLanguage } from "../../i18n/LanguageProvider";
import {
  getCustomerDispatchRequest,
  getCustomerTruckCandidates,
  requestCustomerTruck,
  type CustomerDispatchRequest,
  type CustomerTruckCandidate,
} from "../../services/customer-dispatch.service";

export interface DispatchOrderSummary {
  id: string;
  tracking_id: string;
  pickup_address: string;
  dropoff_address: string;
  vehicle_type: string;
}

const copy: Record<HalloLanguage, {
  eyebrow: string;
  title: string;
  subtitle: string;
  refresh: string;
  loading: string;
  noMatch: string;
  noMatchHelp: string;
  nearest: string;
  verified: string;
  newDriver: string;
  trips: string;
  away: string;
  eta: string;
  capacity: string;
  confirm: string;
  confirming: string;
  requested: string;
  requestedHelp: string;
  approved: string;
  approvedHelp: string;
  declined: string;
  privacy: string;
  close: string;
  orders: string;
}> = {
  en: {
    eyebrow: "NEARBY VERIFIED TRUCKS",
    title: "Choose a truck",
    subtitle: "Available matches are ranked by approximate distance to your pickup.",
    refresh: "Refresh",
    loading: "Finding eligible online trucks…",
    noMatch: "No verified truck is online yet",
    noMatchHelp: "Your order is saved. Refresh later when a matching approved driver shares a fresh location.",
    nearest: "Nearest match",
    verified: "Verified",
    newDriver: "New driver",
    trips: "completed trips",
    away: "from pickup",
    eta: "Estimated arrival",
    capacity: "Capacity",
    confirm: "Confirm this truck",
    confirming: "Sending request…",
    requested: "Truck requested",
    requestedHelp: "Dispatch will verify availability and complete the assignment. You can follow the order from Orders.",
    approved: "Truck assigned",
    approvedHelp: "Your verified driver and truck are assigned. Live tracking becomes available when the trip starts.",
    declined: "Previous request changed",
    privacy: "For safety, the driver's exact GPS and phone remain private until assignment is verified.",
    close: "Not now",
    orders: "Open orders",
  },
  om: {
    eyebrow: "TRUCK VERIFIED NAANNOO JIRU",
    title: "Truck filadhu",
    subtitle: "Filannoowwan pickup kee irraa fageenya tilmaamaa irratti tartiibeffamaniiru.",
    refresh: "Haaromsi",
    loading: "Truck online fi seera guutu barbaadaa jira…",
    noMatch: "Truck verified online amma hin jiru",
    noMatchHelp: "Order kee kuufameera. Driver approved truck walsimuun GPS haaraa yeroo qoodu haaromsi.",
    nearest: "Kan dhihoo",
    verified: "Verified",
    newDriver: "Driver haaraa",
    trips: "trip xumurame",
    away: "pickup irraa",
    eta: "Yeroo gahumsa tilmaamaa",
    capacity: "Capacity",
    confirm: "Truck kana mirkaneessi",
    confirming: "Request ergamaa jira…",
    requested: "Truck gaafatameera",
    requestedHelp: "Dispatch availability mirkaneessee assignment xumura. Orders irraa hordofuu dandeessa.",
    approved: "Truck assign taʼeera",
    approvedHelp: "Driver fi truck verified siif assign taʼeera. Trip yeroo jalqabu live tracking banama.",
    declined: "Request durii jijjiirame",
    privacy: "Nageenyaaf GPS fi bilbilli driver assignment verified taʼu dura hin mulʼatu.",
    close: "Amma miti",
    orders: "Orders bani",
  },
  am: {
    eyebrow: "በአቅራቢያ ያሉ የተረጋገጡ መኪናዎች",
    title: "መኪና ይምረጡ",
    subtitle: "ያሉት አማራጮች ከመነሻዎ ባለው ግምታዊ ርቀት ተደርድረዋል።",
    refresh: "አድስ",
    loading: "ብቁ እና ኦንላይን ያሉ መኪናዎችን በመፈለግ ላይ…",
    noMatch: "አሁን ኦንላይን የሆነ የተረጋገጠ መኪና የለም",
    noMatchHelp: "ትዕዛዝዎ ተቀምጧል። ተስማሚ አሽከርካሪ አዲስ GPS ሲያጋራ እንደገና ያድሱ።",
    nearest: "በጣም ቅርብ",
    verified: "የተረጋገጠ",
    newDriver: "አዲስ አሽከርካሪ",
    trips: "የተጠናቀቁ ጉዞዎች",
    away: "ከመነሻው",
    eta: "ግምታዊ መድረሻ",
    capacity: "አቅም",
    confirm: "ይህን መኪና ያረጋግጡ",
    confirming: "ጥያቄው እየተላከ ነው…",
    requested: "መኪና ተጠይቋል",
    requestedHelp: "ዲስፓች መገኘቱን አረጋግጦ ምደባውን ያጠናቅቃል። ከትዕዛዞች ውስጥ መከታተል ይችላሉ።",
    approved: "መኪና ተመድቧል",
    approvedHelp: "የተረጋገጠ አሽከርካሪና መኪና ተመድበዋል። ጉዞው ሲጀምር ቀጥታ ክትትል ይከፈታል።",
    declined: "የቀድሞው ጥያቄ ተቀይሯል",
    privacy: "ለደህንነት የአሽከርካሪው ትክክለኛ GPS እና ስልክ ምደባው እስኪረጋገጥ ድረስ አይታዩም።",
    close: "አሁን አይደለም",
    orders: "ትዕዛዞችን ክፈት",
  },
};

export function CustomerNearbyTrucksSheet({
  order,
  onClose,
  onOpenOrders,
}: {
  order: DispatchOrderSummary;
  onClose: () => void;
  onOpenOrders: () => void;
}) {
  const { language } = useLanguage();
  const t = copy[language];
  const [candidates, setCandidates] = useState<CustomerTruckCandidate[]>([]);
  const [request, setRequest] = useState<CustomerDispatchRequest | null>(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [matches, currentRequest] = await Promise.all([
        getCustomerTruckCandidates(order.id),
        getCustomerDispatchRequest(order.id),
      ]);
      setCandidates(matches);
      setRequest(currentRequest);
      const requested = matches.find((candidate) => candidate.is_requested)
        ?? matches.find((candidate) => currentRequest && candidate.driver_id === currentRequest.driver_id && candidate.truck_id === currentRequest.truck_id)
        ?? matches[0];
      setSelectedKey(requested ? keyFor(requested) : "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not find nearby trucks.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [order.id]);

  const selected = useMemo(
    () => candidates.find((candidate) => keyFor(candidate) === selectedKey) ?? null,
    [candidates, selectedKey],
  );

  async function confirm() {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      await requestCustomerTruck(order.id, selected.driver_id, selected.truck_id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Truck request failed.");
    } finally {
      setSaving(false);
    }
  }

  const requestComplete = request?.status === "requested" || request?.status === "approved";

  return (
    <div className="customer-nearby-sheet" role="dialog" aria-modal="true" aria-label={t.title}>
      <button type="button" className="customer-nearby-sheet__backdrop" onClick={onClose} aria-label={t.close} />
      <section className="customer-nearby-sheet__panel">
        <div className="customer-nearby-sheet__handle" aria-hidden="true" />
        <header className="customer-nearby-sheet__header">
          <div>
            <p>{t.eyebrow}</p>
            <h2>{t.title}</h2>
            <span>{order.tracking_id} · {order.vehicle_type}</span>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </header>

        <div className="customer-nearby-sheet__route">
          <span className="is-pickup" />
          <div><strong>{order.pickup_address}</strong><small>Pickup</small></div>
          <span className="is-dropoff" />
          <div><strong>{order.dropoff_address}</strong><small>Drop-off</small></div>
        </div>

        <div className="customer-nearby-sheet__toolbar">
          <p>{t.subtitle}</p>
          <button type="button" onClick={() => void load()} disabled={loading || saving}>↻ {t.refresh}</button>
        </div>

        {error && <p className="customer-nearby-sheet__error">{error}</p>}

        {requestComplete && request && (
          <div className={`customer-nearby-sheet__request is-${request.status}`}>
            <div className="customer-nearby-sheet__request-icon">{request.status === "approved" ? "✓" : "⌖"}</div>
            <div>
              <strong>{request.status === "approved" ? t.approved : t.requested}</strong>
              <p>{request.status === "approved" ? t.approvedHelp : t.requestedHelp}</p>
              <small>{request.driver_name ?? "Verified driver"} · {request.plate_number} · {request.eta_minutes ?? "—"} min</small>
            </div>
          </div>
        )}

        {request && ["declined", "expired", "cancelled"].includes(request.status) && (
          <p className="customer-nearby-sheet__notice">{t.declined}. {t.noMatchHelp}</p>
        )}

        <div className="customer-nearby-sheet__list">
          {loading ? (
            <div className="customer-nearby-sheet__empty"><div className="customer-nearby-sheet__spinner" /><p>{t.loading}</p></div>
          ) : candidates.length ? candidates.map((candidate, index) => {
            const key = keyFor(candidate);
            const selectedCandidate = key === selectedKey;
            const initials = initialsFor(candidate.driver_name);
            return (
              <button
                type="button"
                key={key}
                onClick={() => setSelectedKey(key)}
                className={`customer-nearby-card${selectedCandidate ? " is-selected" : ""}`}
              >
                <div className="customer-nearby-card__top">
                  <div className="customer-nearby-card__avatar">{initials}</div>
                  <div className="customer-nearby-card__identity">
                    <div>
                      {index === 0 && <span className="customer-nearby-card__nearest">{t.nearest}</span>}
                      <span className="customer-nearby-card__verified">✓ {t.verified}</span>
                    </div>
                    <strong>{candidate.driver_name ?? "Approved driver"}</strong>
                    <small>
                      {candidate.driver_rating === null ? t.newDriver : `★ ${candidate.driver_rating.toFixed(1)}`}
                      {candidate.completed_trips > 0 ? ` · ${candidate.completed_trips} ${t.trips}` : ""}
                    </small>
                  </div>
                  <div className="customer-nearby-card__distance">
                    <strong>{candidate.distance_km.toLocaleString()} km</strong>
                    <small>{t.away}</small>
                  </div>
                </div>
                <div className="customer-nearby-card__truck">
                  <div><span>▰</span><p><strong>{candidate.vehicle_type}</strong><small>{candidate.plate_number}</small></p></div>
                  <p><span>{t.capacity}</span><strong>{candidate.capacity_tons === null ? "—" : `${candidate.capacity_tons} t`}</strong></p>
                  <p><span>{t.eta}</span><strong>{candidate.eta_minutes} min</strong></p>
                </div>
                <span className="customer-nearby-card__radio" aria-hidden="true" />
              </button>
            );
          }) : (
            <div className="customer-nearby-sheet__empty">
              <div className="customer-nearby-sheet__empty-icon">⌖</div>
              <h3>{t.noMatch}</h3>
              <p>{t.noMatchHelp}</p>
            </div>
          )}
        </div>

        <p className="customer-nearby-sheet__privacy">🔒 {t.privacy}</p>

        <footer className="customer-nearby-sheet__footer">
          <button type="button" className="is-secondary" onClick={requestComplete ? onOpenOrders : onClose}>
            {requestComplete ? t.orders : t.close}
          </button>
          {!requestComplete && candidates.length > 0 && (
            <button type="button" className="is-primary" onClick={() => void confirm()} disabled={!selected || saving}>
              {saving ? t.confirming : t.confirm}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

function keyFor(candidate: Pick<CustomerTruckCandidate, "driver_id" | "truck_id">) {
  return `${candidate.driver_id}:${candidate.truck_id}`;
}

function initialsFor(name: string | null) {
  const parts = (name ?? "Driver").trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "DR";
}
