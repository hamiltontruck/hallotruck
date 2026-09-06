import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  formatRouteDistance,
  formatRouteDuration,
  projectRouteToSvg,
  type DriverActiveTripOrder,
  type DriverNavigationRoute,
} from "./driver-active-trip.model";
import {
  fetchDriverActiveTrip,
  fetchDriverNavigation,
  isDriverNetworkFailure,
  sendDriverTrackingPing,
  subscribeToDriverActiveTrip,
  type DriverTrackingPing,
} from "./driver-active-trip.service";
import {
  clearQueuedDriverPings,
  enqueueDriverPing,
  getQueuedDriverPingCount,
  syncQueuedDriverPings,
} from "./driver-gps-queue";
import { DriverDeliveryProofPanel } from "./DriverDeliveryProofPanel";

type GpsState = "idle" | "requesting" | "queued" | "syncing" | "live";

const TRIP_REFRESH_MS = 15_000;
const MIN_PING_INTERVAL_MS = 15_000;

function geolocationErrorMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) return "GPS permission hin kennamne. Phone settings keessaa Location eeyyami.";
  if (error.code === error.POSITION_UNAVAILABLE) return "Bakka GPS argachuun hin danda'amne. Gara iddoo signal gaarii deemi.";
  if (error.code === error.TIMEOUT) return "GPS bakka kee argachuuf yeroo dheeraa fudhate. Irra deebi'ii yaali.";
  return "Bakka GPS dubbisuun hin danda'amne.";
}

function formatEtb(value: number | null): string {
  return value === null ? "—" : `ETB ${Math.round(value).toLocaleString()}`;
}

function statusCopy(state: GpsState, tripStatus: DriverActiveTripOrder["status"], pending: number) {
  if (state === "live") return {
    title: "GPS kallattiin hojjechaa jira",
    help: "Server trip kana In Transit jechuun mirkaneesseera; customer truck hordofuu danda'a.",
  };
  if (state === "queued") return {
    title: "GPS offline keessatti olkaa'ame",
    help: `${pending} GPS update connection deebi'u eeggachaa jira. Trip status server irraa osoo hin mirkanaa'in hin jijjiiramu.`,
  };
  if (state === "syncing") return {
    title: "GPS wal qunnamsiisaa jira…",
    help: "Update offline olkaa'aman servertti ergaa fi trip status database keessaa mirkaneessaa jira.",
  };
  if (state === "requesting") return {
    title: "GPS jalqabaa jira…",
    help: "Bakka kee argatee update jalqabaa servertti ergaa jira.",
  };
  if (tripStatus === "in_transit") return {
    title: "GPS kallattiin dhaabbateera",
    help: "Trip In Transit dha; customer akka hordofuuf GPS qooduu itti fufi.",
  };
  return {
    title: "Imala jalqabuuf qophaa'eera",
    help: "Trip gara In Transit kan ce'u GPS jalqabaa server bira ga'ee erga mirkanaa'ee booda qofa.",
  };
}

export function DriverActiveTripView({
  userId,
  fullName,
}: {
  userId: string;
  fullName: string;
}) {
  const mountedRef = useRef(false);
  const tripRef = useRef<DriverActiveTripOrder | null>(null);
  const refreshInFlightRef = useRef(false);
  const queuedRefreshRef = useRef(false);
  const refreshRequestIdRef = useRef(0);
  const routeRequestIdRef = useRef(0);
  const watchIdRef = useRef<number | null>(null);
  const startingRef = useRef(false);
  const pingInFlightRef = useRef(false);
  const syncInFlightRef = useRef(false);
  const lastPingAttemptRef = useRef(0);

  const [trip, setTrip] = useState<DriverActiveTripOrder | null>(null);
  const [confirmedSnapshot, setConfirmedSnapshot] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<DriverNavigationRoute | null>(null);
  const [routeOrderId, setRouteOrderId] = useState<string | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [driverPosition, setDriverPosition] = useState<[number, number] | null>(null);
  const [gpsState, setGpsState] = useState<GpsState>("idle");
  const [pendingCount, setPendingCount] = useState(0);
  const [lastPingAt, setLastPingAt] = useState<string | null>(null);
  const [speedKmh, setSpeedKmh] = useState<number | null>(null);
  const [completedTrackingId, setCompletedTrackingId] = useState<string | null>(null);

  useEffect(() => {
    tripRef.current = trip;
  }, [trip]);

  const clearWatch = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
    startingRef.current = false;
    pingInFlightRef.current = false;
    lastPingAttemptRef.current = 0;
  }, []);

  const stopSharing = useCallback(() => {
    clearWatch();
    setGpsState(pendingCount > 0 ? "queued" : "idle");
  }, [clearWatch, pendingCount]);

  const refreshTrip = useCallback(async (silent = false) => {
    if (refreshInFlightRef.current) {
      queuedRefreshRef.current = true;
      return;
    }
    refreshInFlightRef.current = true;
    const requestId = ++refreshRequestIdRef.current;
    if (!silent && !confirmedSnapshot) setLoading(true);

    try {
      const next = await fetchDriverActiveTrip(userId);
      if (!mountedRef.current || requestId !== refreshRequestIdRef.current) return;

      const previous = tripRef.current;
      setTrip(next);
      tripRef.current = next;
      setConfirmedSnapshot(true);
      setError(null);
      if (!next) {
        clearWatch();
        setGpsState("idle");
        setPendingCount(0);
        setDriverPosition(null);
        setRoute(null);
        setRouteOrderId(null);
        if (previous) clearQueuedDriverPings(userId, previous.id);
      } else if (!previous || previous.id !== next.id) {
        setCompletedTrackingId(null);
        clearWatch();
        setGpsState("idle");
        setDriverPosition(null);
        setLastPingAt(null);
        setSpeedKmh(null);
        setPendingCount(getQueuedDriverPingCount(userId, next.id));
      }
    } catch (caught) {
      if (!mountedRef.current || requestId !== refreshRequestIdRef.current) return;
      setError(caught instanceof Error ? caught.message : "Active trip fe'uun hin danda'amne.");
    } finally {
      if (mountedRef.current && requestId === refreshRequestIdRef.current) setLoading(false);
      refreshInFlightRef.current = false;
      if (queuedRefreshRef.current && mountedRef.current) {
        queuedRefreshRef.current = false;
        window.setTimeout(() => void refreshTrip(true), 0);
      }
    }
  }, [clearWatch, confirmedSnapshot, userId]);

  const loadRoute = useCallback(async (orderId: string) => {
    const requestId = ++routeRequestIdRef.current;
    setRouteLoading(true);
    setRouteError(null);
    try {
      const next = await fetchDriverNavigation(userId, orderId);
      if (!mountedRef.current || requestId !== routeRequestIdRef.current || tripRef.current?.id !== orderId) return;
      setRoute(next);
      setRouteOrderId(orderId);
    } catch (caught) {
      if (!mountedRef.current || requestId !== routeRequestIdRef.current || tripRef.current?.id !== orderId) return;
      setRouteError(caught instanceof Error ? caught.message : "Route fe'uun hin danda'amne.");
      if (routeOrderId !== orderId) setRoute(null);
    } finally {
      if (mountedRef.current && requestId === routeRequestIdRef.current) setRouteLoading(false);
    }
  }, [routeOrderId, userId]);

  const syncQueue = useCallback(async () => {
    const current = tripRef.current;
    if (!current || syncInFlightRef.current) return;
    const count = getQueuedDriverPingCount(userId, current.id);
    setPendingCount(count);
    if (count === 0) return;

    syncInFlightRef.current = true;
    setGpsState("syncing");
    setError(null);
    try {
      const result = await syncQueuedDriverPings(
        userId,
        current.id,
        (ping) => sendDriverTrackingPing(userId, ping),
        isDriverNetworkFailure,
      );
      if (!mountedRef.current || tripRef.current?.id !== current.id) return;
      setPendingCount(result.remainingCount);
      if (result.latestTrip) {
        setTrip(result.latestTrip);
        tripRef.current = result.latestTrip;
      }
      if (result.remainingCount > 0) {
        setGpsState("queued");
      } else if (watchIdRef.current !== null && result.latestTrip?.status === "in_transit") {
        setGpsState("live");
        setLastPingAt(new Date().toLocaleTimeString());
      } else {
        setGpsState("idle");
      }
    } catch (caught) {
      if (!mountedRef.current) return;
      setPendingCount(getQueuedDriverPingCount(userId, current.id));
      setGpsState("queued");
      setError(caught instanceof Error ? caught.message : "GPS queue erguun hin danda'amne.");
    } finally {
      syncInFlightRef.current = false;
    }
  }, [userId]);

  const startSharing = useCallback(() => {
    const current = tripRef.current;
    if (!current || startingRef.current || watchIdRef.current !== null || syncInFlightRef.current) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Browser kun GPS hin deeggaru.");
      return;
    }

    startingRef.current = true;
    setGpsState("requesting");
    setError(null);

    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const active = tripRef.current;
          if (!active) return;
          const now = Date.now();
          const coordinates: [number, number] = [position.coords.longitude, position.coords.latitude];
          const nextSpeed = position.coords.speed !== null && Number.isFinite(position.coords.speed)
            ? Math.max(0, position.coords.speed * 3.6)
            : null;
          setDriverPosition(coordinates);
          setSpeedKmh(nextSpeed);

          if (pingInFlightRef.current || (lastPingAttemptRef.current > 0 && now - lastPingAttemptRef.current < MIN_PING_INTERVAL_MS)) return;
          pingInFlightRef.current = true;
          lastPingAttemptRef.current = now;
          const ping: DriverTrackingPing = {
            orderId: active.id,
            lng: coordinates[0],
            lat: coordinates[1],
            heading: position.coords.heading ?? undefined,
            speedKmh: nextSpeed ?? undefined,
            accuracyM: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : undefined,
            recordedAt: new Date(position.timestamp || now).toISOString(),
          };

          void sendDriverTrackingPing(userId, ping)
            .then((confirmed) => {
              if (!mountedRef.current || tripRef.current?.id !== active.id) return;
              setTrip(confirmed);
              tripRef.current = confirmed;
              setPendingCount(getQueuedDriverPingCount(userId, active.id));
              setLastPingAt(new Date().toLocaleTimeString());
              if (confirmed.status === "in_transit") {
                setGpsState("live");
                setError(null);
              } else {
                setGpsState("requesting");
                setError("GPS server bira ga'eera; trip status mirkaneeffamaa jira.");
              }
            })
            .catch((caught) => {
              if (!mountedRef.current || tripRef.current?.id !== active.id) return;
              if (isDriverNetworkFailure(caught)) {
                const count = enqueueDriverPing(userId, ping);
                setPendingCount(count);
                setGpsState("queued");
                setError(null);
                return;
              }
              clearWatch();
              setGpsState(getQueuedDriverPingCount(userId, active.id) > 0 ? "queued" : "idle");
              setError(caught instanceof Error ? caught.message : "GPS update erguun hin danda'amne.");
            })
            .finally(() => {
              startingRef.current = false;
              pingInFlightRef.current = false;
            });
        },
        (positionError) => {
          clearWatch();
          setGpsState(pendingCount > 0 ? "queued" : "idle");
          setError(geolocationErrorMessage(positionError));
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
      );
    } catch (caught) {
      clearWatch();
      setGpsState(pendingCount > 0 ? "queued" : "idle");
      setError(caught instanceof Error ? caught.message : "GPS jalqabuun hin danda'amne.");
    }
  }, [clearWatch, pendingCount, userId]);

  const handleDelivered = useCallback((trackingId: string) => {
    const completed = tripRef.current;
    clearWatch();
    if (completed) clearQueuedDriverPings(userId, completed.id);
    setGpsState("idle");
    setPendingCount(0);
    setDriverPosition(null);
    setLastPingAt(null);
    setSpeedKmh(null);
    setRoute(null);
    setRouteOrderId(null);
    setCompletedTrackingId(trackingId);
    setTrip(null);
    tripRef.current = null;
    void refreshTrip(true);
  }, [clearWatch, refreshTrip, userId]);

  useEffect(() => {
    mountedRef.current = true;
    void refreshTrip();
    const interval = window.setInterval(() => void refreshTrip(true), TRIP_REFRESH_MS);
    let unsubscribe: () => void = () => undefined;
    try {
      unsubscribe = subscribeToDriverActiveTrip(userId, () => void refreshTrip(true));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Realtime trip jalqabuun hin danda'amne.");
    }
    return () => {
      mountedRef.current = false;
      refreshRequestIdRef.current += 1;
      routeRequestIdRef.current += 1;
      window.clearInterval(interval);
      unsubscribe();
      clearWatch();
    };
  }, [clearWatch, refreshTrip, userId]);

  useEffect(() => {
    if (!trip) return;
    setPendingCount(getQueuedDriverPingCount(userId, trip.id));
    if (routeOrderId !== trip.id) void loadRoute(trip.id);
  }, [loadRoute, routeOrderId, trip, userId]);

  useEffect(() => {
    const handleOnline = () => void syncQueue();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [syncQueue]);

  const projectedRoute = useMemo(
    () => route ? projectRouteToSvg(route.coordinates, driverPosition) : null,
    [driverPosition, route],
  );

  if (loading && !confirmedSnapshot) {
    return <div className="grid min-h-[calc(100dvh-137px)] place-items-center bg-halo-canvas px-6 text-center"><div><div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-halo-line border-t-halo-blue"/><p className="mt-4 text-sm font-bold text-halo-muted">Active trip fe'aa jira…</p></div></div>;
  }

  if (!trip) {
    if (completedTrackingId) {
      return <div className="grid min-h-[calc(100dvh-137px)] place-items-center bg-halo-canvas px-5">
        <section className="w-full max-w-sm rounded-[28px] border border-emerald-200 bg-white p-7 text-center shadow-halo-card" data-mobile-trip-complete>
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl text-emerald-700">✓</span>
          <p className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">{completedTrackingId}</p>
          <h1 className="mt-2 text-2xl font-black text-halo-navy">Trip milkaa'inaan xumurameera</h1>
          <p className="mt-3 text-sm leading-6 text-halo-muted">Delivery proof fi payment result server irratti olkaa'amaniiru. Trip kun active workspace keessaa haqameera.</p>
          {error && <p role="alert" className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">{error}</p>}
          <button type="button" onClick={() => { setCompletedTrackingId(null); void refreshTrip(); }} className="mt-6 min-h-12 w-full rounded-2xl bg-halo-blue px-5 font-black text-white">Hojii itti aanu ilaali</button>
        </section>
      </div>;
    }
    return <div className="grid min-h-[calc(100dvh-137px)] place-items-center bg-halo-canvas px-5"><section className="w-full max-w-sm rounded-[28px] border border-halo-line bg-white p-7 text-center shadow-halo-card"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-halo-gold-dark">Active trip</p><h1 className="mt-3 text-2xl font-black text-halo-navy">Trip hojii irra jiru hin jiru</h1><p className="mt-3 text-sm leading-6 text-halo-muted">Hojii fudhatte erga jiraate booda route fi GPS controls as irratti mul'atu.</p>{error && <p role="alert" className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}<button type="button" onClick={() => void refreshTrip()} className="mt-6 min-h-12 w-full rounded-2xl bg-halo-blue px-5 font-black text-white">Irra deebi'ii ilaali</button></section></div>;
  }

  const gps = statusCopy(gpsState, trip.status, pendingCount);
  const busy = gpsState === "requesting" || gpsState === "syncing";
  const statusLabel = trip.status === "in_transit" ? "IN TRANSIT" : "ASSIGNED";
  const firstStep = route?.steps[0] ?? null;

  return <div className="relative min-h-[calc(100dvh-137px)] overflow-hidden bg-[#e9f1ec]" data-mobile-driver-active-trip data-gps-state={gpsState}>
    <div className="absolute inset-0 halo-map-grid" />
    <svg viewBox="0 0 420 560" preserveAspectRatio="xMidYMid meet" className="absolute inset-x-0 top-20 h-[58dvh] min-h-[390px] w-full" aria-label="Server route and current Driver GPS position">
      <path d="M20 105 C105 72 115 205 215 215 S310 145 405 188" stroke="#d5dfd9" strokeWidth="14" fill="none" />
      <path d="M-10 330 C80 290 132 382 220 342 S320 290 440 375" stroke="#d5dfd9" strokeWidth="11" fill="none" />
      {projectedRoute ? <>
        <path d={projectedRoute.path} stroke="white" strokeWidth="15" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d={projectedRoute.path} stroke="#0759c7" strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={projectedRoute.start[0]} cy={projectedRoute.start[1]} r="12" fill="#16a36a" stroke="white" strokeWidth="5" />
        <circle cx={projectedRoute.end[0]} cy={projectedRoute.end[1]} r="12" fill="#ef4444" stroke="white" strokeWidth="5" />
        {projectedRoute.driver && <g transform={`translate(${projectedRoute.driver[0]} ${projectedRoute.driver[1]})`}><circle r="22" fill="#0759c7" stroke="white" strokeWidth="5"/><path d="M-11-5h13v10h-13zM2-2h7l5 5v2H2z" fill="white"/><circle cx="-6" cy="8" r="3" fill="white"/><circle cx="8" cy="8" r="3" fill="white"/></g>}
      </> : null}
    </svg>

    <div className="absolute inset-x-3 top-3 z-10 rounded-[22px] border border-white/70 bg-white/95 p-4 shadow-halo-float backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-halo-muted">{trip.trackingId}</p><h1 className="mt-1 break-words text-lg font-black text-halo-navy">{trip.pickupAddress} → {trip.dropoffAddress}</h1></div><span className={`shrink-0 rounded-full px-3 py-1.5 text-[9px] font-black ${trip.status === "in_transit" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{statusLabel}</span></div>
      <div className="mt-3 flex items-center gap-3 text-xs text-halo-muted"><span className="flex min-w-0 items-center gap-1.5"><span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" /><span className="truncate">{trip.pickupAddress}</span></span><span className="h-px flex-1 bg-halo-line"/><span className="flex min-w-0 items-center gap-1.5"><span className="h-2 w-2 shrink-0 rounded-full bg-red-500" /><span className="truncate">{trip.dropoffAddress}</span></span></div>
    </div>

    <div className="absolute inset-x-3 top-[118px] z-10 flex items-start gap-2">
      {routeLoading && <span role="status" className="rounded-xl bg-white/95 px-3 py-2 text-[10px] font-black text-halo-blue shadow-halo-card">Route fe'aa jira…</span>}
      {routeError && <div className="flex min-w-0 items-center gap-2 rounded-xl bg-white/95 p-2 shadow-halo-card"><span role="alert" className="min-w-0 flex-1 truncate px-1 text-[10px] font-bold text-red-700">{routeError}</span><button type="button" onClick={() => void loadRoute(trip.id)} disabled={routeLoading} className="min-h-9 shrink-0 rounded-lg bg-halo-blue px-3 text-[10px] font-black text-white">Retry</button></div>}
    </div>

    <section className="absolute inset-x-0 bottom-0 z-10 max-h-[58dvh] overflow-y-auto rounded-t-[30px] border-t border-white bg-white/97 px-4 pb-[calc(18px+env(safe-area-inset-bottom))] pt-4 shadow-[0_-18px_50px_rgba(16,33,61,0.16)] backdrop-blur-xl sm:px-6">
      <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-halo-line" />
      {error && <p role="alert" className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold leading-5 text-red-700">{error}</p>}
      <div className="grid grid-cols-3 divide-x divide-halo-line text-center"><div><p className="text-[10px] font-bold text-halo-muted">Fageenya</p><p className="mt-1 text-sm font-black text-halo-navy">{formatRouteDistance(route?.distanceKm ?? null)}</p></div><div><p className="text-[10px] font-bold text-halo-muted">Yeroo route</p><p className="mt-1 text-sm font-black text-halo-navy">{formatRouteDuration(route?.durationMin ?? null)}</p></div><div><p className="text-[10px] font-bold text-halo-muted">Gatii trip</p><p className="mt-1 truncate px-1 text-sm font-black text-halo-navy">{formatEtb(trip.priceEtb)}</p></div></div>

      <div className={`mt-4 rounded-2xl border p-4 ${gpsState === "live" ? "border-emerald-200 bg-emerald-50" : gpsState === "queued" || gpsState === "syncing" ? "border-amber-200 bg-amber-50" : "border-halo-line bg-halo-soft"}`} aria-busy={busy}>
        <div className="flex items-start gap-3"><span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${gpsState === "live" ? "animate-pulse bg-emerald-600" : gpsState === "queued" || gpsState === "syncing" ? "bg-amber-500" : "bg-halo-muted"}`}/><div className="min-w-0"><p className="text-sm font-black text-halo-navy">{gps.title}</p><p role="status" aria-live="polite" className="mt-1 text-[11px] leading-5 text-halo-muted">{gps.help}</p>{lastPingAt && <p className="mt-2 text-[10px] font-bold text-emerald-700">Last server update: {lastPingAt}{speedKmh !== null ? ` · ${speedKmh.toFixed(1)} km/h` : ""}</p>}</div></div>
      </div>

      {firstStep && <div className="mt-3 rounded-2xl border border-halo-line bg-white p-3"><p className="text-[9px] font-black uppercase tracking-[0.14em] text-halo-gold-dark">Qajeelfama itti aanu</p><p className="mt-1 text-xs font-bold leading-5 text-halo-navy">{firstStep.instruction}</p><p className="mt-1 text-[10px] text-halo-muted">{Math.round(firstStep.distanceM).toLocaleString()} m</p></div>}

      <div className="mt-4 grid gap-3">
        {gpsState === "queued" ? <>
          <button type="button" onClick={() => void syncQueue()} disabled={busy} className="min-h-13 w-full rounded-2xl bg-halo-blue px-5 text-sm font-black text-white disabled:opacity-60">GPS eeggatu irra deebi'ii ergi</button>
          {watchIdRef.current !== null && <button type="button" onClick={stopSharing} className="min-h-12 w-full rounded-2xl border border-halo-line px-5 text-sm font-black text-halo-navy">GPS qooduu dhaabi</button>}
        </> : gpsState === "live" ? <button type="button" onClick={stopSharing} className="min-h-13 w-full rounded-2xl border border-halo-line bg-white px-5 text-sm font-black text-halo-navy">GPS qooduu dhaabi</button> : <button type="button" onClick={startSharing} disabled={busy} className="min-h-13 w-full rounded-2xl bg-halo-blue px-5 text-sm font-black text-white shadow-halo-button disabled:opacity-60">{gpsState === "requesting" ? "GPS jalqabaa jira…" : gpsState === "syncing" ? "GPS sync godhaa jira…" : trip.status === "in_transit" ? "GPS kallattii itti fufi" : "Imala jalqabi & GPS qoodi"}</button>}
      </div>

      {trip.status === "in_transit" && (
        <DriverDeliveryProofPanel trip={trip} userId={userId} onDelivered={handleDelivered} />
      )}

      <div className="mt-4 flex items-center gap-3 rounded-2xl bg-halo-soft p-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-halo-blue text-sm font-black text-white">{fullName.trim().slice(0, 1).toUpperCase() || "D"}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-halo-navy">{fullName}</p><p className="mt-0.5 text-[10px] text-halo-muted">Assigned Driver · server-authorized trip</p></div></div>
    </section>
  </div>;
}
