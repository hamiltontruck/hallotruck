
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  calculateRouteProgressPct,
  distanceBetweenCoordinatesM,
  formatRouteDistance,
  formatRouteDuration,
  localizeRouteInstruction,
  resolveNavigationStep,
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
import { DriverActiveTripMap } from "./DriverActiveTripMap";
import { resolveDriverMapViewportPadding, resolveDriverTripSheetGesture } from "./driver-active-trip-map-runtime";
import { DriverDeliveryProofPanel } from "./DriverDeliveryProofPanel";
import { DriverCustomerChatLauncher } from "./DriverCustomerChatLauncher";
import { DriverTripCustomerPaymentPanel } from "./DriverTripCustomerPaymentPanel";
import { getDriverV4Copy, type DriverLanguage } from "./driver-v4-i18n";
import { driverGpsBlockReason } from "./driver-runtime-resilience";

type GpsState = "idle" | "requesting" | "queued" | "syncing" | "live";
const TRIP_REFRESH_MS = 15_000;
const MIN_PING_INTERVAL_MS = 15_000;

function geolocationErrorMessage(error: GeolocationPositionError, copy: ReturnType<typeof getDriverV4Copy>["trip"]): string {
  if (error.code === error.PERMISSION_DENIED) return copy.gpsPermission;
  if (error.code === error.POSITION_UNAVAILABLE) return copy.gpsUnavailable;
  if (error.code === error.TIMEOUT) return copy.gpsTimeout;
  return copy.gpsReadError;
}
function formatEtb(value: number | null): string {
  return value === null ? "—" : `ETB ${Math.round(value).toLocaleString()}`;
}
function concisePlace(value: string): string {
  const [place] = value.split(",");
  return place?.trim() || value.trim();
}
function statusCopy(state: GpsState, tripStatus: DriverActiveTripOrder["status"], pending: number, copy: ReturnType<typeof getDriverV4Copy>["trip"]) {
  if (state === "live") return { title: copy.liveTitle, help: copy.liveHelp };
  if (state === "queued") return { title: copy.queuedTitle, help: `${pending} · ${copy.queuedHelp}` };
  if (state === "syncing") return { title: copy.syncingTitle, help: copy.syncingHelp };
  if (state === "requesting") return { title: copy.requestingTitle, help: copy.requestingHelp };
  if (tripStatus === "in_transit") return { title: copy.pausedTitle, help: copy.pausedHelp };
  return { title: copy.readyTitle, help: copy.readyHelp };
}

export function DriverActiveTripView({ userId, fullName, onOpenWallet = () => undefined, language = "om" }: {
  userId: string;
  fullName: string;
  onOpenWallet?: () => void;
  language?: DriverLanguage;
}) {
  const mountedRef = useRef(false);
  const tripRef = useRef<DriverActiveTripOrder | null>(null);
  const completedTripIdRef = useRef<string | null>(null);
  const refreshInFlightRef = useRef(false);
  const queuedRefreshRef = useRef(false);
  const refreshRequestIdRef = useRef(0);
  const routeRequestIdRef = useRef(0);
  const watchIdRef = useRef<number | null>(null);
  const startingRef = useRef(false);
  const pingInFlightRef = useRef(false);
  const syncInFlightRef = useRef(false);
  const lastPingAttemptRef = useRef(0);
  const tripSheetRef = useRef<HTMLElement | null>(null);
  const sheetPointerStartRef = useRef<number | null>(null);
  const sheetWasDraggedRef = useRef(false);

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
  const [navigationStepIndex, setNavigationStepIndex] = useState(0);
  const [routeProgressPct, setRouteProgressPct] = useState(0);
  const [dispatchExpanded, setDispatchExpanded] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const t = getDriverV4Copy(language);

  useEffect(() => { tripRef.current = trip; }, [trip]);

  const clearWatch = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) navigator.geolocation.clearWatch(watchIdRef.current);
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
    if (refreshInFlightRef.current) { queuedRefreshRef.current = true; return; }
    refreshInFlightRef.current = true;
    const requestId = ++refreshRequestIdRef.current;
    if (!silent && !confirmedSnapshot) setLoading(true);
    try {
      const next = await fetchDriverActiveTrip(userId);
      if (!mountedRef.current || requestId !== refreshRequestIdRef.current) return;
      // Completion can reach the backend before the realtime/active-trip query
      // stops returning the just-delivered row. Do not resurrect its map or
      // delivery-proof panel during that short consistency window.
      if (next?.trackingId === completedTripIdRef.current) return;
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
        setNavigationStepIndex(0);
        setRouteProgressPct(0);
        if (previous) clearQueuedDriverPings(userId, previous.id);
      } else if (!previous || previous.id !== next.id) {
        setCompletedTrackingId(null);
        clearWatch();
        setGpsState("idle");
        setDriverPosition(null);
        setLastPingAt(null);
        setSpeedKmh(null);
        setNavigationStepIndex(0);
        setRouteProgressPct(0);
        setPendingCount(getQueuedDriverPingCount(userId, next.id));
      }
    } catch {
      if (mountedRef.current && requestId === refreshRequestIdRef.current) setError(t.trip.loadError);
    } finally {
      if (mountedRef.current && requestId === refreshRequestIdRef.current) setLoading(false);
      refreshInFlightRef.current = false;
      if (queuedRefreshRef.current && mountedRef.current) {
        queuedRefreshRef.current = false;
        window.setTimeout(() => void refreshTrip(true), 0);
      }
    }
  }, [clearWatch, confirmedSnapshot, t.trip.loadError, userId]);

  const loadRoute = useCallback(async (orderId: string) => {
    const requestId = ++routeRequestIdRef.current;
    setRouteLoading(true);
    setRouteError(null);
    try {
      const next = await fetchDriverNavigation(userId, orderId);
      if (!mountedRef.current || requestId !== routeRequestIdRef.current || tripRef.current?.id !== orderId) return;
      setRoute(next);
      setRouteOrderId(orderId);
      setNavigationStepIndex(0);
      setRouteProgressPct(0);
    } catch {
      if (!mountedRef.current || requestId !== routeRequestIdRef.current || tripRef.current?.id !== orderId) return;
      setRouteError(t.trip.routeError);
      if (routeOrderId !== orderId) setRoute(null);
    } finally {
      if (mountedRef.current && requestId === routeRequestIdRef.current) setRouteLoading(false);
    }
  }, [routeOrderId, t.trip.routeError, userId]);

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
      const result = await syncQueuedDriverPings(userId, current.id, (ping) => sendDriverTrackingPing(userId, ping), isDriverNetworkFailure);
      if (!mountedRef.current || tripRef.current?.id !== current.id) return;
      setPendingCount(result.remainingCount);
      if (result.latestTrip) { setTrip(result.latestTrip); tripRef.current = result.latestTrip; }
      if (result.remainingCount > 0) setGpsState("queued");
      else if (watchIdRef.current !== null && result.latestTrip?.status === "in_transit") {
        setGpsState("live");
        setLastPingAt(new Date().toLocaleTimeString());
      } else setGpsState("idle");
    } catch {
      if (!mountedRef.current) return;
      setPendingCount(getQueuedDriverPingCount(userId, current.id));
      setGpsState("queued");
      setError(t.trip.queueSendError);
    } finally {
      syncInFlightRef.current = false;
    }
  }, [t.trip.queueSendError, userId]);

  const startSharing = useCallback(() => {
    const current = tripRef.current;
    if (!current || startingRef.current || watchIdRef.current !== null || syncInFlightRef.current) return;
    const gpsBlockReason = driverGpsBlockReason({
      hasGeolocation: typeof navigator !== "undefined" && Boolean(navigator.geolocation),
      isSecureContext: typeof window === "undefined" || window.isSecureContext,
    });
    if (gpsBlockReason === "insecure") { setError(t.trip.gpsSecureContext); return; }
    if (gpsBlockReason === "unsupported") { setError(t.trip.browserNoGps); return; }
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
          const nextSpeed = position.coords.speed !== null && Number.isFinite(position.coords.speed) ? Math.max(0, position.coords.speed * 3.6) : null;
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
              if (confirmed.status === "in_transit") { setGpsState("live"); setError(null); }
              else { setGpsState("requesting"); setError(t.trip.serverConfirming); }
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
              setError(t.trip.pingError);
            })
            .finally(() => { startingRef.current = false; pingInFlightRef.current = false; });
        },
        (positionError) => {
          clearWatch();
          setGpsState(pendingCount > 0 ? "queued" : "idle");
          setError(geolocationErrorMessage(positionError, t.trip));
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
      );
    } catch {
      clearWatch();
      setGpsState(pendingCount > 0 ? "queued" : "idle");
      setError(t.trip.gpsReadError);
    }
  }, [clearWatch, pendingCount, t.trip, userId]);

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
    setNavigationStepIndex(0);
    setRouteProgressPct(0);
    completedTripIdRef.current = trackingId;
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
    try { unsubscribe = subscribeToDriverActiveTrip(userId, () => void refreshTrip(true)); }
    catch { setError(t.trip.realtimeError); }
    return () => {
      mountedRef.current = false;
      refreshRequestIdRef.current += 1;
      routeRequestIdRef.current += 1;
      window.clearInterval(interval);
      unsubscribe();
      clearWatch();
    };
  }, [clearWatch, refreshTrip, t.trip.realtimeError, userId]);

  useEffect(() => {
    if (!trip) return;
    setPendingCount(getQueuedDriverPingCount(userId, trip.id));
    if (routeOrderId !== trip.id) void loadRoute(trip.id);
  }, [loadRoute, routeOrderId, trip, userId]);

  useEffect(() => {
    if (!route || !driverPosition || route.steps.length === 0) return;
    setNavigationStepIndex((previous) => resolveNavigationStep(route.steps, driverPosition, previous).index);
    setRouteProgressPct((previous) => Math.max(previous, calculateRouteProgressPct(route.coordinates, driverPosition)));
  }, [driverPosition, route]);

  useEffect(() => {
    const handleOnline = () => void syncQueue();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [syncQueue]);

  if (loading && !confirmedSnapshot) {
    return <div className="grid min-h-[calc(100dvh-137px)] place-items-center bg-halo-canvas px-6 text-center"><div><div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-halo-line border-t-halo-blue"/><p className="mt-4 text-sm font-bold text-halo-muted">{t.trip.loading}</p></div></div>;
  }

  if (!trip) {
    if (completedTrackingId) {
    return <div className="grid min-h-[calc(100dvh-137px)] place-items-center bg-halo-canvas px-5"><section className="w-full max-w-sm rounded-[28px] border border-emerald-200 bg-white p-7 text-center shadow-halo-card" data-mobile-trip-complete><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl text-emerald-700">✓</span><p className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">{completedTrackingId}</p><h1 className="mt-2 text-2xl font-black text-halo-navy">{t.trip.completedTitle}</h1><p className="mt-3 text-sm leading-6 text-halo-muted">{t.trip.completedHelp}</p>{error && <p role="alert" className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">{error}</p>}<div className="mt-6 grid gap-2"><button type="button" onClick={onOpenWallet} className="min-h-12 w-full rounded-2xl bg-emerald-700 px-5 font-black text-white">{t.trip.openWallet}</button><button type="button" onClick={() => { completedTripIdRef.current = null; setCompletedTrackingId(null); void refreshTrip(); }} className="min-h-12 w-full rounded-2xl border border-halo-line bg-white px-5 font-black text-halo-navy">{t.trip.nextWork}</button></div></section></div>;
    }
    return <div className="grid min-h-[calc(100dvh-137px)] place-items-center bg-halo-canvas px-5"><section className="w-full max-w-sm rounded-[28px] border border-halo-line bg-white p-7 text-center shadow-halo-card"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-halo-gold-dark">{t.trip.eyebrow}</p><h1 className="mt-3 text-2xl font-black text-halo-navy">{t.trip.noTripTitle}</h1><p className="mt-3 text-sm leading-6 text-halo-muted">{t.trip.noTripHelp}</p>{error && <p role="alert" className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}<button type="button" onClick={() => void refreshTrip()} className="mt-6 min-h-12 w-full rounded-2xl bg-halo-blue px-5 font-black text-white">{t.trip.checkAgain}</button></section></div>;
  }

  const gps = statusCopy(gpsState, trip.status, pendingCount, t.trip);
  const busy = gpsState === "requesting" || gpsState === "syncing";
  const statusLabel = trip.status === "in_transit" ? t.common.inTransit : t.common.assigned;
  const currentStep = route?.steps[navigationStepIndex] ?? null;
  const maneuverDistanceM = currentStep?.location && driverPosition
    ? distanceBetweenCoordinatesM(driverPosition, currentStep.location)
    : currentStep?.distanceM ?? null;
  const mapViewportPadding = resolveDriverMapViewportPadding({ dispatchExpanded, sheetExpanded });
  const toggleSheet = () => {
    setSheetExpanded((expanded) => {
      const next = !expanded;
      if (!next) window.requestAnimationFrame(() => tripSheetRef.current?.scrollTo({ top: 0, behavior: "smooth" }));
      return next;
    });
  };
  const handleSheetPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    sheetPointerStartRef.current = event.clientY;
    sheetWasDraggedRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handleSheetPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const startY = sheetPointerStartRef.current;
    if (startY !== null && Math.abs(event.clientY - startY) >= 8) sheetWasDraggedRef.current = true;
  };
  const handleSheetPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const startY = sheetPointerStartRef.current;
    sheetPointerStartRef.current = null;
    if (startY === null || !sheetWasDraggedRef.current) return;
    setSheetExpanded((expanded) => resolveDriverTripSheetGesture(startY, event.clientY, expanded));
  };
  const handleSheetClick = () => {
    if (sheetWasDraggedRef.current) {
      sheetWasDraggedRef.current = false;
      return;
    }
    toggleSheet();
  };

  return <div className="relative min-h-[calc(100dvh-137px)] overflow-hidden bg-[#e9f1ec]" data-mobile-driver-active-trip data-gps-state={gpsState}>
    <div className="absolute inset-0 min-h-[420px]" data-driver-trip-map-window>
      <DriverActiveTripMap route={route} driverPosition={driverPosition} viewportPadding={mapViewportPadding} ariaLabel={t.trip.locationTitle} loadingLabel={t.trip.routeLoading} errorLabel={t.trip.routeError} emptyLabel={t.trip.locationUnavailable} />
    </div>
    <button type="button" onClick={() => setDispatchExpanded((expanded) => !expanded)} aria-expanded={dispatchExpanded} data-driver-dispatch-card className={`absolute inset-x-3 top-3 z-10 rounded-[22px] border border-white/70 bg-white/95 text-left shadow-halo-float backdrop-blur-xl transition-[padding] ${dispatchExpanded ? "p-4" : "p-2"}`}>
      <div className="flex items-center justify-between gap-2"><div className="min-w-0 flex-1"><p className="truncate text-[10px] font-black uppercase tracking-[0.16em] text-halo-muted">{fullName} · {trip.trackingId}</p><h1 hidden={!dispatchExpanded} className="mt-1 break-words text-lg font-black text-halo-navy">{concisePlace(trip.pickupAddress)} → {concisePlace(trip.dropoffAddress)}</h1></div><span className={`shrink-0 rounded-full px-3 py-1.5 text-[9px] font-black ${trip.status === "in_transit" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{statusLabel}</span><span aria-hidden="true" className={`text-xs text-halo-muted transition-transform ${dispatchExpanded ? "rotate-180" : ""}`}>⌄</span></div>
    </button>
    <div className={`absolute inset-x-3 z-10 flex items-start gap-2 transition-[top] ${dispatchExpanded ? "top-[118px]" : "top-[68px]"}`}>
      {gpsState === "live" && <span className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-emerald-700/95 px-3 py-2 text-[10px] font-black text-white shadow-halo-card"><span className="h-2 w-2 animate-pulse rounded-full bg-white" />{gps.title}</span>}
      {routeLoading && <span role="status" className="rounded-xl bg-white/95 px-3 py-2 text-[10px] font-black text-halo-blue shadow-halo-card">{t.trip.routeLoading}</span>}
      {routeError && <div className="flex min-w-0 items-center gap-2 rounded-xl bg-white/95 p-2 shadow-halo-card"><span role="alert" className="min-w-0 flex-1 truncate px-1 text-[10px] font-bold text-red-700">{routeError}</span><button type="button" onClick={() => void loadRoute(trip.id)} disabled={routeLoading} className="min-h-9 shrink-0 rounded-lg bg-halo-blue px-3 text-[10px] font-black text-white">{t.common.retry}</button></div>}
    </div>

    <section ref={tripSheetRef} data-driver-trip-sheet className={`absolute inset-x-0 bottom-0 z-10 overflow-y-auto overscroll-contain rounded-t-[30px] border-t border-white bg-white/97 px-4 pb-[calc(18px+env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_50px_rgba(16,33,61,0.16)] backdrop-blur-xl transition-[max-height] sm:px-6 ${sheetExpanded ? "max-h-[72dvh]" : "max-h-[32dvh]"}`}>
      <button type="button" onClick={handleSheetClick} onPointerDown={handleSheetPointerDown} onPointerMove={handleSheetPointerMove} onPointerUp={handleSheetPointerUp} aria-expanded={sheetExpanded} className="sticky top-0 z-10 mx-auto mb-3 grid min-h-8 w-20 touch-none place-items-center rounded-full bg-white/95" aria-label={sheetExpanded ? "Collapse trip controls" : "Expand trip controls"}><span className={`h-1.5 w-12 rounded-full bg-halo-line transition-transform ${sheetExpanded ? "rotate-180" : ""}`} /></button>
      {error && <p role="alert" className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold leading-5 text-red-700">{error}</p>}
      <div className="grid grid-cols-3 divide-x divide-halo-line text-center"><div><p className="text-[10px] font-bold text-halo-muted">{t.trip.distance}</p><p className="mt-1 text-sm font-black text-halo-navy">{formatRouteDistance(route?.distanceKm ?? null)}</p></div><div><p className="text-[10px] font-bold text-halo-muted">{t.trip.duration}</p><p className="mt-1 text-sm font-black text-halo-navy">{formatRouteDuration(route?.durationMin ?? null)}</p></div><div><p className="text-[10px] font-bold text-halo-muted">{t.trip.price}</p><p className="mt-1 truncate px-1 text-sm font-black text-halo-navy">{formatEtb(trip.priceEtb)}</p></div></div>

      <div className={`mt-4 rounded-2xl border p-4 ${gpsState === "live" ? "border-emerald-200 bg-emerald-50" : gpsState === "queued" || gpsState === "syncing" ? "border-amber-200 bg-amber-50" : "border-halo-line bg-halo-soft"}`} aria-busy={busy} data-customer-live-sharing={gpsState === "live" ? "active" : "inactive"}>
        <div className="flex items-start gap-3"><span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${gpsState === "live" ? "animate-pulse bg-emerald-600" : gpsState === "queued" || gpsState === "syncing" ? "bg-amber-500" : "bg-halo-muted"}`}/><div className="min-w-0"><p className="text-sm font-black text-halo-navy">{gps.title}</p><p role="status" aria-live="polite" className="mt-1 text-[11px] leading-5 text-halo-muted">{gps.help}</p>{lastPingAt && <p className="mt-2 text-[10px] font-bold text-emerald-700">{t.trip.lastServerUpdate}: {lastPingAt}{speedKmh !== null ? ` · ${speedKmh.toFixed(1)} km/h` : ""}</p>}</div></div>
      </div>

      <div className="mt-3"><DriverCustomerChatLauncher userId={userId} orderId={trip.id} trackingId={trip.trackingId} language={language} /></div>
      <div hidden={!sheetExpanded}>
      {currentStep && <div className="mt-3 rounded-2xl border border-halo-line bg-white p-3" data-driver-navigation-step>
        <div className="flex items-center justify-between gap-3"><p className="text-[9px] font-black uppercase tracking-[0.14em] text-halo-gold-dark">{t.trip.next}</p><span className="text-[10px] font-black text-halo-blue">{routeProgressPct}%</span></div>
        <p className="mt-1 text-xs font-bold leading-5 text-halo-navy">{localizeRouteInstruction(currentStep.instruction, language)}</p>
        <p className="mt-1 text-[10px] text-halo-muted">{maneuverDistanceM === null ? "—" : `${Math.round(maneuverDistanceM).toLocaleString()} m`}</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-halo-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={routeProgressPct}><div className="h-full rounded-full bg-halo-blue transition-[width] duration-300" style={{ width: `${routeProgressPct}%` }} /></div>
      </div>}

      <div className="mt-4 grid gap-3">
        {gpsState === "queued" ? <><button type="button" onClick={() => void syncQueue()} disabled={busy} className="min-h-13 w-full rounded-2xl bg-halo-blue px-5 text-sm font-black text-white disabled:opacity-60">{t.trip.retryQueue}</button>{watchIdRef.current !== null && <button type="button" onClick={stopSharing} className="min-h-12 w-full rounded-2xl border border-halo-line px-5 text-sm font-black text-halo-navy">{t.trip.stop}</button>}</> : gpsState === "live" ? <button type="button" onClick={stopSharing} className="min-h-13 w-full rounded-2xl border border-halo-line bg-white px-5 text-sm font-black text-halo-navy">{t.trip.stop}</button> : <button type="button" onClick={startSharing} disabled={busy} className="min-h-13 w-full rounded-2xl bg-halo-blue px-5 text-sm font-black text-white shadow-halo-button disabled:opacity-60">{gpsState === "requesting" ? t.trip.requesting : gpsState === "syncing" ? t.trip.syncing : trip.status === "in_transit" ? t.trip.continueGps : t.trip.start}</button>}
      </div>

      <section className="mt-3 rounded-[22px] border border-halo-line bg-white p-4 shadow-halo-card" data-driver-live-location>
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[0.14em] text-halo-gold-dark">{t.trip.locationTitle}</p>{driverPosition ? <p className="mt-2 break-all text-xs font-bold text-halo-navy">{driverPosition[1].toFixed(6)}, {driverPosition[0].toFixed(6)}</p> : <p className="mt-2 text-xs leading-5 text-halo-muted">{t.trip.locationUnavailable}</p>}</div><span className={`shrink-0 rounded-xl px-3 py-2 text-[10px] font-black ${gpsState === "live" ? "bg-emerald-100 text-emerald-800" : "bg-halo-soft text-halo-muted"}`}>{gpsState === "live" ? t.trip.liveTitle : t.trip.shareLocation}</span></div>
      </section>
      <DriverTripCustomerPaymentPanel userId={userId} trip={trip} language={language} />
      {trip.status === "in_transit" && <DriverDeliveryProofPanel trip={trip} userId={userId} onDelivered={handleDelivered} language={language} />}
      </div>
    </section>
  </div>;
}
