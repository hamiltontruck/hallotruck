import { useEffect, useRef, useState } from "react";
import {
  getMyAssignedOrder,
  type MyOrder,
} from "../../services/driver.service";
import {
  getPendingPingCountForOrder,
  sendOrQueuePing,
  syncPendingPings,
} from "../../services/offline.service";
import { useLanguage, type HalloLanguage } from "../../i18n/LanguageProvider";
import { getDriverTripDocumentsCopy } from "../../i18n/driverTripDocumentsCopy";
import { Button } from "../ui/Button";

type GpsWorkflowState = "idle" | "requesting" | "queued" | "syncing" | "live";

export interface DriverActiveTripGpsServices {
  sendOrQueuePing: typeof sendOrQueuePing;
  syncPendingPings: typeof syncPendingPings;
  getPendingPingCountForOrder: typeof getPendingPingCountForOrder;
  getMyAssignedOrder: typeof getMyAssignedOrder;
}

const defaultServices: DriverActiveTripGpsServices = {
  sendOrQueuePing,
  syncPendingPings,
  getPendingPingCountForOrder,
  getMyAssignedOrder,
};

const gpsCopy: Record<HalloLanguage, {
  ready: string;
  readyHelp: string;
  starting: string;
  startingHelp: string;
  started: string;
  startedHelp: string;
  startTrip: string;
  resumeGps: string;
  gpsPausedTitle: string;
  gpsPaused: string;
  queuedTitle: string;
  queuedHelp: string;
  queuedCount: string;
  retryQueued: string;
  syncing: string;
  syncingHelp: string;
}> = {
  en: {
    ready: "Ready to start",
    readyHelp: "The trip changes to In Transit only after the first GPS update reaches the server.",
    starting: "Starting trip…",
    startingHelp: "Finding your GPS position and sending the first live update.",
    started: "Trip started",
    startedHelp: "The server confirmed this trip as In Transit. The customer can follow the truck while GPS remains active.",
    startTrip: "Start trip & share GPS",
    resumeGps: "Resume live GPS",
    gpsPausedTitle: "Live GPS paused",
    gpsPaused: "The trip is In Transit, but live GPS is paused. Resume sharing so the customer can follow the truck.",
    queuedTitle: "GPS update saved offline",
    queuedHelp: "The trip has not been marked In Transit yet. Keep this page open or retry when the connection returns.",
    queuedCount: "Queued GPS updates",
    retryQueued: "Retry queued updates",
    syncing: "Reconnecting GPS…",
    syncingHelp: "Sending saved GPS updates and checking the database trip status.",
  },
  om: {
    ready: "Imala jalqabuuf qophaa'eera",
    readyHelp: "Imalli gara Daandii irraatti kan ce'u GPS jalqabaa server bira ga'ee erga mirkanaa'ee booda qofa.",
    starting: "Imala jalqabaa jira…",
    startingHelp: "Bakka GPS kee barbaadaa fi odeeffannoo kallattii jalqabaa ergaa jira.",
    started: "Imalli jalqabameera",
    startedHelp: "Server imala kana Daandii irra akka jiru mirkaneesseera. GPS hojii irra yeroo jiru maamilaan truck hordofuu danda'a.",
    startTrip: "Imala jalqabi & GPS qoodi",
    resumeGps: "GPS kallattii itti fufi",
    gpsPausedTitle: "GPS kallattiin dhaabbateera",
    gpsPaused: "Imalli Daandii irra jira; garuu GPS kallattiin dhaabbateera. Maamilaan akka hordofuuf qooduu itti fufi.",
    queuedTitle: "GPS offline keessatti olkaa'ame",
    queuedHelp: "Imalli amma iyyuu gara Daandii irraatti hin ceene. Page kana banaa tursiisi ykn connection yeroo deebi'u irra deebi'i.",
    queuedCount: "GPS erguuf eeggatan",
    retryQueued: "GPS eeggatu irra deebi'ii ergi",
    syncing: "GPS wal qunnamsiisaa jira…",
    syncingHelp: "GPS olkaa'ame ergaa fi haala imalaa database keessaa mirkaneessaa jira.",
  },
  am: {
    ready: "ጉዞውን ለመጀመር ዝግጁ",
    readyHelp: "ጉዞው In Transit የሚሆነው የመጀመሪያው GPS ማሻሻያ ሰርቨሩ ላይ ከተረጋገጠ በኋላ ብቻ ነው።",
    starting: "ጉዞው እየተጀመረ ነው…",
    startingHelp: "የGPS ቦታዎን በመፈለግ የመጀመሪያውን ቀጥታ ማሻሻያ እየላከ ነው።",
    started: "ጉዞው ተጀምሯል",
    startedHelp: "ሰርቨሩ ጉዞው In Transit መሆኑን አረጋግጧል። GPS እየሰራ ሳለ ደንበኛው መኪናውን መከታተል ይችላል።",
    startTrip: "ጉዞ ጀምር እና GPS አጋራ",
    resumeGps: "ቀጥታ GPS ቀጥል",
    gpsPausedTitle: "ቀጥታ GPS ቆሟል",
    gpsPaused: "ጉዞው In Transit ላይ ነው፣ ግን ቀጥታ GPS ቆሟል። ደንበኛው እንዲከታተል ማጋራትን ይቀጥሉ።",
    queuedTitle: "የGPS ማሻሻያው ከመስመር ውጭ ተቀምጧል",
    queuedHelp: "ጉዞው እስካሁን In Transit አልሆነም። ይህን ገጽ ክፍት ያድርጉ ወይም ግንኙነቱ ሲመለስ እንደገና ይሞክሩ።",
    queuedCount: "የሚጠባበቁ GPS ማሻሻያዎች",
    retryQueued: "የተቀመጡትን እንደገና ላክ",
    syncing: "GPS እንደገና እየተገናኘ ነው…",
    syncingHelp: "የተቀመጡ GPS ማሻሻያዎችን በመላክ የዳታቤዝ ጉዞ ሁኔታን እያረጋገጠ ነው።",
  },
};

function geolocationMessage(error: GeolocationPositionError, copy: ReturnType<typeof getDriverTripDocumentsCopy>["trip"]) {
  if (error.code === error.PERMISSION_DENIED) return copy.permissionDenied;
  if (error.code === error.POSITION_UNAVAILABLE) return copy.positionUnavailable;
  if (error.code === error.TIMEOUT) return copy.timeout;
  return copy.positionReadError;
}

export function DriverActiveTripGpsControl({
  order,
  onOrderChange,
  onPosition,
  onSharingChange,
  services = defaultServices,
}: {
  order: MyOrder;
  onOrderChange: (order: MyOrder) => void;
  onPosition: (position: [number, number]) => void;
  onSharingChange: (sharing: boolean) => void;
  services?: DriverActiveTripGpsServices;
}) {
  const { language } = useLanguage();
  const c = getDriverTripDocumentsCopy(language).trip;
  const action = gpsCopy[language];
  const watchIdRef = useRef<number | null>(null);
  const startingRef = useRef(false);
  const pingInFlightRef = useRef(false);
  const syncingRef = useRef(false);
  const [gpsState, setGpsState] = useState<GpsWorkflowState>("idle");
  const [gpsSharing, setGpsSharing] = useState(false);
  const [lastPing, setLastPing] = useState<string | null>(null);
  const [speedKmh, setSpeedKmh] = useState<number | null>(null);
  const [pendingPingCount, setPendingPingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const tripStarted = order.status === "in_transit";
  const busy = gpsState === "requesting" || gpsState === "syncing";

  function setSharing(next: boolean) {
    setGpsSharing(next);
    onSharingChange(next);
  }

  function clearWatch() {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
    startingRef.current = false;
    pingInFlightRef.current = false;
    setSharing(false);
  }

  function stopSharing() {
    clearWatch();
    setGpsState(pendingPingCount > 0 ? "queued" : "idle");
  }

  function failAndStop(message: string) {
    clearWatch();
    setGpsState(pendingPingCount > 0 ? "queued" : "idle");
    setError(message);
  }

  async function syncQueuedPings() {
    if (syncingRef.current || pendingPingCount === 0) return;
    syncingRef.current = true;
    setGpsState("syncing");
    setError(null);

    try {
      const result = await services.syncPendingPings();
      const remainingForOrder = services.getPendingPingCountForOrder(order.id);
      setPendingPingCount(remainingForOrder);

      let refreshedOrder = order;
      if (result.syncedOrderIds.includes(order.id)) {
        const current = await services.getMyAssignedOrder(order.id);
        if (current) {
          refreshedOrder = current;
          onOrderChange(current);
        }
      }

      if (remainingForOrder > 0) {
        setGpsState("queued");
      } else if (watchIdRef.current !== null && refreshedOrder.status === "in_transit") {
        setGpsState("live");
        setLastPing(new Date().toLocaleTimeString());
      } else {
        setGpsState("idle");
      }
    } catch (syncError) {
      setPendingPingCount(services.getPendingPingCountForOrder(order.id));
      setGpsState("queued");
      setError(syncError instanceof Error ? syncError.message : c.gpsPingFailed);
    } finally {
      syncingRef.current = false;
    }
  }

  function startSharing() {
    if (startingRef.current || watchIdRef.current !== null || syncingRef.current) return;
    if (!navigator.geolocation) {
      setError(c.gpsUnavailable);
      return;
    }

    startingRef.current = true;
    setGpsState("requesting");
    setError(null);
    setSharing(true);

    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        async (position) => {
          if (pingInFlightRef.current) return;
          pingInFlightRef.current = true;
          const coords: [number, number] = [position.coords.longitude, position.coords.latitude];
          const currentSpeedKmh = position.coords.speed !== null && Number.isFinite(position.coords.speed)
            ? Math.max(0, position.coords.speed * 3.6)
            : null;
          onPosition(coords);
          setSpeedKmh(currentSpeedKmh);

          try {
            const delivery = await services.sendOrQueuePing({
              orderId: order.id,
              lng: coords[0],
              lat: coords[1],
              heading: position.coords.heading ?? undefined,
              speedKmh: currentSpeedKmh ?? undefined,
            });

            if (delivery === "queued") {
              setPendingPingCount(services.getPendingPingCountForOrder(order.id));
              setGpsState("queued");
              setError(null);
              return;
            }

            setPendingPingCount(services.getPendingPingCountForOrder(order.id));
            setLastPing(new Date().toLocaleTimeString());
            setGpsState("live");
            setError(null);
            if (order.status === "accepted") {
              onOrderChange({ ...order, status: "in_transit" });
            }
          } catch (pingError) {
            failAndStop(pingError instanceof Error ? pingError.message : c.gpsPingFailed);
          } finally {
            startingRef.current = false;
            pingInFlightRef.current = false;
          }
        },
        (positionError) => {
          failAndStop(geolocationMessage(positionError, c));
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
      );
    } catch (watchError) {
      failAndStop(watchError instanceof Error ? watchError.message : c.positionReadError);
    }
  }

  useEffect(() => {
    const pending = services.getPendingPingCountForOrder(order.id);
    setPendingPingCount(pending);
    if (pending > 0 && watchIdRef.current === null) setGpsState("queued");
  }, [order.id, services]);

  useEffect(() => {
    if (order.status === "in_transit" && gpsSharing && pendingPingCount === 0 && gpsState === "requesting") {
      setGpsState("live");
    }
  }, [order.status, gpsSharing, pendingPingCount, gpsState]);

  useEffect(() => {
    const handleOnline = () => void syncQueuedPings();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  });

  useEffect(() => () => clearWatch(), []);

  const heading = gpsState === "queued" ? action.queuedTitle
    : gpsState === "syncing" ? action.syncing
    : gpsState === "requesting" ? action.starting
    : gpsState === "live" ? action.started
    : tripStarted ? action.gpsPausedTitle
    : action.ready;
  const help = gpsState === "queued" ? action.queuedHelp
    : gpsState === "syncing" ? action.syncingHelp
    : gpsState === "requesting" ? action.startingHelp
    : gpsState === "live" ? action.startedHelp
    : tripStarted ? action.gpsPaused
    : action.readyHelp;
  const tone = gpsState === "live" ? "border-emerald-700/30 bg-emerald-50"
    : gpsState === "queued" || gpsState === "syncing" ? "border-amber/40 bg-amber/10"
    : "border-asphalt/10 bg-white";

  return (
    <section
      className={`mb-6 overflow-hidden rounded-2xl border p-5 ${tone}`}
      aria-busy={busy}
      data-driver-gps-control
      data-gps-state={gpsState}
      data-gps-order-status={order.status}
    >
      {error && <p role="alert" className="mb-4 border border-route/40 bg-route/5 px-4 py-3 text-sm text-route">{error}</p>}

      <div className="flex items-start gap-3">
        <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${gpsState === "live" ? "bg-emerald-600 animate-pulse" : gpsState === "queued" || gpsState === "syncing" ? "bg-amber" : "bg-steel"}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[.18em] text-steel">{c.liveLocation}</p>
          <h2 className="mt-1 break-words font-display text-xl font-bold text-asphalt">{heading}</h2>
          <p id="driver-gps-workflow-status" role="status" aria-live="polite" className="mt-2 text-sm leading-6 text-steel">{help}</p>
          {pendingPingCount > 0 && <p className="mt-3 text-xs font-semibold text-amber-900">{action.queuedCount}: {pendingPingCount}</p>}
          {gpsState === "live" && (
            <p className="mt-3 text-xs font-semibold text-emerald-800">
              {lastPing ? <>{c.gpsConnected}: {lastPing}{speedKmh !== null ? ` · ${speedKmh.toFixed(1)} km/h` : ""}</> : c.customerWatching}
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {gpsState === "queued" ? (
          <>
            <Button
              type="button"
              onClick={() => void syncQueuedPings()}
              disabled={busy}
              aria-describedby="driver-gps-workflow-status"
              data-gps-retry-action
              className="w-full"
            >
              {action.retryQueued}
            </Button>
            {gpsSharing && <Button type="button" variant="ghost" onClick={stopSharing} className="w-full">{c.stopSharing}</Button>}
          </>
        ) : gpsState === "live" ? (
          <Button type="button" variant="ghost" onClick={stopSharing} className="w-full sm:col-span-2">{c.stopSharing}</Button>
        ) : (
          <Button
            type="button"
            onClick={startSharing}
            disabled={busy}
            aria-describedby="driver-gps-workflow-status"
            data-gps-start-action
            className="w-full sm:col-span-2"
          >
            {gpsState === "requesting" ? action.starting : gpsState === "syncing" ? action.syncing : tripStarted ? action.resumeGps : action.startTrip}
          </Button>
        )}
      </div>
    </section>
  );
}
