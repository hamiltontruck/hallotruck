import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage, type HalloLanguage } from "../../i18n/LanguageProvider";
import {
  getMyDriverPresence,
  setDriverPresence,
  type DriverPresence,
} from "../../services/driver-presence.service";
import { getMyActiveOrders } from "../../services/driver.service";

const copy: Record<HalloLanguage, {
  kicker: string;
  title: string;
  help: string;
  online: string;
  offline: string;
  goOnline: string;
  goOffline: string;
  locating: string;
  live: string;
  stale: string;
  updated: string;
  accuracy: string;
  unsupported: string;
  denied: string;
  activeKicker: string;
  activeTitle: string;
  activeHelp: string;
  resumeTrip: string;
}> = {
  en: {
    kicker: "DRIVER AVAILABILITY",
    title: "Go online for nearby loads",
    help: "Share your current GPS while you are available. Dispatch ranks approved drivers by pickup distance, truck type and cargo capacity.",
    online: "Available for jobs",
    offline: "Not available",
    goOnline: "Go online & share location",
    goOffline: "Go offline",
    locating: "Finding GPS…",
    live: "Location is fresh",
    stale: "Location needs refresh",
    updated: "Updated",
    accuracy: "Accuracy",
    unsupported: "This browser does not support location.",
    denied: "Location permission is required to go online.",
    activeKicker: "ACTIVE DELIVERY",
    activeTitle: "Trip in progress",
    activeHelp: "Job availability is paused while this trip is active. Resume live GPS so the customer can follow the truck.",
    resumeTrip: "Resume live GPS",
  },
  om: {
    kicker: "ARGAMA KONKOLAACHISAA",
    title: "Fe'umsa dhihoo argachuuf online ta'i",
    help: "Yeroo hojii fudhachuuf qophooftu GPS kee qoodi. Dispatch fageenya pickup, gosa truck fi capacity fe'umsaa irratti konkolaachisaa filata.",
    online: "Hojii fudhachuuf qophaa'eera",
    offline: "Amma hojii hin fudhadhu",
    goOnline: "Online ta'i & location qoodi",
    goOffline: "Offline ta'i",
    locating: "GPS barbaadaa jira…",
    live: "Location haaraa dha",
    stale: "Location haaromsuu qaba",
    updated: "Haaromfame",
    accuracy: "Sirrummaa",
    unsupported: "Browser kun location hin deeggaru.",
    denied: "Online ta'uuf location hayyamuu qabda.",
    activeKicker: "IMALA HOJII IRRA JIRU",
    activeTitle: "Trip itti fufaa jira",
    activeHelp: "Trip kun yeroo hojjetu hojii haaraa fudhachuun dhaabbata. Maamilaan akka hordofuuf GPS kallattii itti fufi.",
    resumeTrip: "GPS kallattii itti fufi",
  },
  am: {
    kicker: "የአሽከርካሪ ተገኝነት",
    title: "በአቅራቢያ ያሉ ጭነቶችን ለማግኘት ኦንላይን ይሁኑ",
    help: "ለሥራ ዝግጁ ሲሆኑ GPS ቦታዎን ያጋሩ። Dispatch በpickup ርቀት፣ በመኪና ዓይነትና በጭነት አቅም ይደርድራል።",
    online: "ለሥራ ዝግጁ",
    offline: "አሁን አልተገኘም",
    goOnline: "ኦንላይን ይሁኑ እና ቦታ ያጋሩ",
    goOffline: "ኦፍላይን ይሁኑ",
    locating: "GPS በመፈለግ ላይ…",
    live: "ቦታው ወቅታዊ ነው",
    stale: "ቦታው መታደስ ያስፈልገዋል",
    updated: "የታደሰው",
    accuracy: "ትክክለኛነት",
    unsupported: "ይህ ብራውዘር location አይደግፍም።",
    denied: "ኦንላይን ለመሆን location ፈቃድ ያስፈልጋል።",
    activeKicker: "ንቁ ጉዞ",
    activeTitle: "ጉዞው በሂደት ላይ ነው",
    activeHelp: "ይህ ጉዞ ንቁ በሆነበት ጊዜ አዲስ ሥራ መቀበል ቆሟል። ደንበኛው እንዲከታተል ቀጥታ GPS ይቀጥሉ።",
    resumeTrip: "ቀጥታ GPS ቀጥል",
  },
};

const UPDATE_INTERVAL_MS = 60_000;

export function DriverAvailabilityCard() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const t = copy[language];
  const [presence, setPresenceState] = useState<DriverPresence | null>(null);
  const [hasActiveTrip, setHasActiveTrip] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const watchId = useRef<number | null>(null);
  const lastSentAt = useRef(0);

  function stopWatch() {
    if (watchId.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current);
    }
    watchId.current = null;
  }

  function startWatch() {
    if (!navigator.geolocation || watchId.current !== null) return;
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (now - lastSentAt.current < UPDATE_INTERVAL_MS) return;
        lastSentAt.current = now;
        void setDriverPresence({
          isAvailable: true,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM: position.coords.accuracy,
        }).then(setPresenceState).catch(() => undefined);
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 20_000, timeout: 20_000 },
    );
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMyDriverPresence(), getMyActiveOrders()])
      .then(([current, activeOrders]) => {
        if (cancelled) return;
        const active = activeOrders.length > 0;
        setPresenceState(current);
        setHasActiveTrip(active);
        if (!active && current?.is_available) startWatch();
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t.denied);
      });
    return () => {
      cancelled = true;
      stopWatch();
    };
  }, []);

  async function goOnline() {
    if (!navigator.geolocation) {
      setError(t.unsupported);
      return;
    }
    setBusy(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const next = await setDriverPresence({
            isAvailable: true,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyM: position.coords.accuracy,
          });
          lastSentAt.current = Date.now();
          setPresenceState(next);
          startWatch();
        } catch (err) {
          setError(err instanceof Error ? err.message : t.denied);
        } finally {
          setBusy(false);
        }
      },
      () => {
        setError(t.denied);
        setBusy(false);
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
  }

  async function goOffline() {
    setBusy(true);
    setError("");
    try {
      stopWatch();
      setPresenceState(await setDriverPresence({ isAvailable: false }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t.denied);
    } finally {
      setBusy(false);
    }
  }

  if (hasActiveTrip) {
    return (
      <section className="my-5 overflow-hidden rounded-2xl border border-amber/40 bg-amber/10">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-[.18em] text-amber-dim">{t.activeKicker}</p>
            <h2 className="mt-2 font-display text-xl font-bold text-asphalt">{t.activeTitle}</h2>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-steel">{t.activeHelp}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/driver/trip")}
            className="min-h-12 shrink-0 rounded-xl bg-asphalt px-5 py-3 text-sm font-semibold text-white"
          >
            {t.resumeTrip} →
          </button>
        </div>
      </section>
    );
  }

  const online = Boolean(presence?.is_available);
  const ageMinutes = presence?.updated_at
    ? Math.max(0, Math.floor((Date.now() - new Date(presence.updated_at).getTime()) / 60_000))
    : null;
  const fresh = online && ageMinutes !== null && ageMinutes < 30;

  return (
    <section className={`my-5 overflow-hidden rounded-2xl border ${online ? "border-emerald-300 bg-emerald-50" : "border-asphalt/10 bg-white"}`}>
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-[10px] tracking-[.18em] text-amber-dim">{t.kicker}</p>
            <span className={`rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase ${online ? "bg-emerald-700 text-white" : "bg-asphalt/5 text-steel"}`}>
              {online ? t.online : t.offline}
            </span>
          </div>
          <h2 className="mt-2 font-display text-xl font-bold text-asphalt">{t.title}</h2>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-steel">{t.help}</p>
          {online && presence && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-steel">
              <span className={fresh ? "font-semibold text-emerald-800" : "font-semibold text-amber-dim"}>● {fresh ? t.live : t.stale}</span>
              <span>{t.updated}: {new Date(presence.updated_at).toLocaleTimeString()}</span>
              {presence.accuracy_m !== null && <span>{t.accuracy}: ±{Math.round(presence.accuracy_m)} m</span>}
            </div>
          )}
          {error && <p className="mt-3 text-xs font-semibold text-route">{error}</p>}
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={online ? goOffline : goOnline}
          className={`min-h-12 shrink-0 rounded-xl px-5 py-3 text-sm font-semibold text-white disabled:opacity-50 ${online ? "bg-route" : "bg-emerald-700"}`}
        >
          {busy ? t.locating : online ? t.goOffline : t.goOnline}
        </button>
      </div>
    </section>
  );
}