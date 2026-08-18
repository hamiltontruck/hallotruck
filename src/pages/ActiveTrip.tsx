import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getMyActiveOrders,
  getNavigation,
  MyOrder,
  NavigationRoute,
} from "../services/driver.service";
import { sendOrQueuePing } from "../services/offline.service";
import { formatEtb } from "../utils/currency";
import { Button } from "../components/ui/Button";
import { CargoPlate } from "../components/ui/CargoPlate";
import { TripMap } from "../components/navigation/TripMap";
import { DriverDeliveryProofForm } from "../components/driver/DriverDeliveryProofForm";
import { useLanguage } from "../i18n/LanguageProvider";
import { getDriverTripDocumentsCopy } from "../i18n/driverTripDocumentsCopy";

const AUTO_ADVANCE_METERS = 45;

const tripActionCopy = {
  en: {
    ready: "Ready to start",
    readyHelp: "Tap Start Trip. The first successful GPS update changes this order to In Transit.",
    starting: "Starting trip…",
    startingHelp: "Finding your GPS position and sending the first live update.",
    started: "Trip started",
    startedHelp: "This order is In Transit. The customer can follow the truck while live GPS is active.",
    startTrip: "Start trip & share GPS",
    resumeGps: "Resume live GPS",
    gpsLive: "Live GPS is active",
    gpsPaused: "The trip is In Transit, but live GPS is paused. Resume sharing so the customer can follow the truck.",
    gpsPausedTitle: "Live GPS paused",
    grossFare: "Gross trip fare",
    commission: "HALLO Smart commission (2%)",
    expectedNet: "Expected driver net (98%)",
    netHelp: "This is the amount expected after the customer payment is released.",
  },
  om: {
    ready: "Imala jalqabuuf qophaa'eera",
    readyHelp: "Imala Jalqabi tuqi. GPS jalqabaa milkaa'inaan ergame order gara Daandii irraatti ce'a.",
    starting: "Imala jalqabaa jira…",
    startingHelp: "Bakka GPS kee barbaadaa fi odeeffannoo kallattii jalqabaa ergaa jira.",
    started: "Imalli jalqabameera",
    startedHelp: "Order kun Daandii irra jira. GPS kallattiin yeroo baname maamilaan truck hordofuu danda'a.",
    startTrip: "Imala jalqabi & GPS qoodi",
    resumeGps: "GPS kallattii itti fufi",
    gpsLive: "GPS kallattiin hojii irra jira",
    gpsPaused: "Imalli Daandii irra jira; garuu GPS kallattiin dhaabbateera. Maamilaan akka hordofuuf qooduu itti fufi.",
    gpsPausedTitle: "GPS kallattiin dhaabbateera",
    grossFare: "Gatii trip guutuu",
    commission: "Komishinii HALLO Smart (2%)",
    expectedNet: "Galii driver eegamu (98%)",
    netHelp: "Kaffaltiin customer erga release taʼe booda galiin eegamu kana.",
  },
  am: {
    ready: "ጉዞውን ለመጀመር ዝግጁ",
    readyHelp: "ጉዞ ጀምርን ይጫኑ። የመጀመሪያው የGPS ማሻሻያ ትዕዛዙን ወደ In Transit ያስገባል።",
    starting: "ጉዞው እየተጀመረ ነው…",
    startingHelp: "የGPS ቦታዎን በመፈለግ የመጀመሪያውን ቀጥታ ማሻሻያ እየላከ ነው።",
    started: "ጉዞው ተጀምሯል",
    startedHelp: "ትዕዛዙ In Transit ላይ ነው። ቀጥታ GPS ሲሰራ ደንበኛው መኪናውን መከታተል ይችላል።",
    startTrip: "ጉዞ ጀምር እና GPS አጋራ",
    resumeGps: "ቀጥታ GPS ቀጥል",
    gpsLive: "ቀጥታ GPS እየሰራ ነው",
    gpsPaused: "ጉዞው In Transit ላይ ነው፣ ግን ቀጥታ GPS ቆሟል። ደንበኛው እንዲከታተል ማጋራትን ይቀጥሉ።",
    gpsPausedTitle: "ቀጥታ GPS ቆሟል",
    grossFare: "ጠቅላላ የጉዞ ዋጋ",
    commission: "የHALLO Smart ኮሚሽን (2%)",
    expectedNet: "የሚጠበቀው የአሽከርካሪ ገቢ (98%)",
    netHelp: "የደንበኛው ክፍያ ከተለቀቀ በኋላ የሚጠበቀው መጠን ይህ ነው።",
  },
} as const;

function distanceMeters(a: [number, number], b: [number, number]) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusM = 6_371_000;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusM * Math.asin(Math.sqrt(h));
}

export function ActiveTrip() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const c = getDriverTripDocumentsCopy(language).trip;
  const action = tripActionCopy[language];
  const [order, setOrder] = useState<MyOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [gpsSharing, setGpsSharing] = useState(false);
  const [lastPing, setLastPing] = useState<string | null>(null);
  const [speedKmh, setSpeedKmh] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const [route, setRoute] = useState<NavigationRoute | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [driverPosition, setDriverPosition] = useState<[number, number] | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  useEffect(() => {
    getMyActiveOrders()
      .then((orders) => setOrder(orders[0] ?? null))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!order) return;
    setCurrentStepIndex(0);
    getNavigation(order.id)
      .then(setRoute)
      .catch((err) => setRouteError(err instanceof Error ? err.message : c.routeLoadError));
  }, [order?.id, c.routeLoadError]);

  useEffect(() => {
    if (!route || !driverPosition || route.steps.length < 2) return;
    const nextStepIndex = Math.min(currentStepIndex + 1, route.steps.length - 1);
    if (nextStepIndex === currentStepIndex) return;
    const nextManeuver = route.steps[nextStepIndex]?.location;
    if (!nextManeuver) return;
    if (distanceMeters(driverPosition, nextManeuver) <= AUTO_ADVANCE_METERS) setCurrentStepIndex(nextStepIndex);
  }, [route, driverPosition, currentStepIndex]);

  function startSharing() {
    if (!order || !navigator.geolocation) {
      setError(c.gpsUnavailable);
      return;
    }
    if (watchIdRef.current !== null) return;

    setError(null);
    setGpsSharing(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const coords: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        const currentSpeedKmh = pos.coords.speed !== null && Number.isFinite(pos.coords.speed)
          ? Math.max(0, pos.coords.speed * 3.6)
          : null;
        setDriverPosition(coords);
        setSpeedKmh(currentSpeedKmh);
        try {
          await sendOrQueuePing({
            orderId: order.id,
            lng: coords[0],
            lat: coords[1],
            heading: pos.coords.heading ?? undefined,
            speedKmh: currentSpeedKmh ?? undefined,
          });
          setLastPing(new Date().toLocaleTimeString());
          setError(null);
          setOrder((current) => current && current.id === order.id && current.status === "accepted"
            ? { ...current, status: "in_transit" }
            : current);
        } catch (err) {
          setError(err instanceof Error ? err.message : c.gpsPingFailed);
        }
      },
      (geoError) => {
        setGpsSharing(false);
        watchIdRef.current = null;
        if (geoError.code === geoError.PERMISSION_DENIED) return setError(c.permissionDenied);
        if (geoError.code === geoError.POSITION_UNAVAILABLE) return setError(c.positionUnavailable);
        if (geoError.code === geoError.TIMEOUT) return setError(c.timeout);
        setError(c.positionReadError);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
  }

  function stopSharing() {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
    setGpsSharing(false);
  }

  useEffect(() => () => stopSharing(), []);

  if (loading) return <div className="max-w-2xl mx-auto px-6 py-16 font-body text-steel">{c.loading}</div>;

  if (!order) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <p className="font-body text-steel mb-4">{c.noTrip}</p>
        <Button onClick={() => navigate("/driver/jobs")}>{c.browseJobs}</Button>
      </div>
    );
  }

  const tripStarted = order.status === "in_transit";
  const statusLabel = order.status === "accepted" ? c.assigned : tripStarted ? c.onRoad : order.status;
  const grossFare = Number(order.price_etb ?? 0);
  const platformCommission = Math.round(grossFare * 0.02 * 100) / 100;
  const driverNet = Math.max(0, Math.round((grossFare - platformCommission) * 100) / 100);

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <div className="flex items-center justify-between mb-8">
        <CargoPlate size="lg">{order.tracking_id}</CargoPlate>
        <span className="font-display font-semibold text-asphalt">{statusLabel}</span>
      </div>

      <div className="mb-6 border border-line bg-white p-6 font-body text-sm">
        <div className="space-y-3">
          <div><span className="text-steel">{c.pickup}</span><div className="text-asphalt">{order.pickup_address}</div></div>
          <div><span className="text-steel">{c.dropoff}</span><div className="text-asphalt">{order.dropoff_address}</div></div>
        </div>

        <div className="mt-5 grid gap-2 border-t border-line pt-5">
          <div className="flex items-center justify-between gap-4">
            <span className="text-steel">{action.grossFare}</span>
            <strong className="font-display text-asphalt">{formatEtb(grossFare)}</strong>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-steel">{action.commission}</span>
            <strong className="font-display text-route">− {formatEtb(platformCommission)}</strong>
          </div>
          <div className="mt-1 flex items-center justify-between gap-4 bg-emerald-50 px-4 py-4">
            <span className="font-semibold text-emerald-900">{action.expectedNet}</span>
            <CargoPlate>{formatEtb(driverNet)}</CargoPlate>
          </div>
          <p className="text-[11px] leading-5 text-steel">{action.netHelp}</p>
        </div>
      </div>

      {error && <p className="font-body text-sm text-route border border-route/40 bg-route/5 px-4 py-3 mb-6">{error}</p>}
      {routeError && <p className="font-body text-xs text-steel border border-line px-4 py-3 mb-6">{c.directionsUnavailable}: {routeError}</p>}

      <section className={`mb-6 rounded-2xl border p-5 ${tripStarted ? "border-emerald-700/30 bg-emerald-50" : "border-amber/40 bg-amber/10"}`}>
        <div className="flex items-start gap-3">
          <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${gpsSharing ? "bg-emerald-600 animate-pulse" : tripStarted ? "bg-amber" : "bg-steel"}`} />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[.18em] text-steel">
              {tripStarted ? c.onRoad : c.assigned}
            </p>
            <h2 className="mt-1 font-display text-xl font-bold text-asphalt">
              {tripStarted
                ? gpsSharing ? action.started : action.gpsPausedTitle
                : gpsSharing ? action.starting : action.ready}
            </h2>
            <p className="mt-2 font-body text-sm leading-6 text-steel">
              {tripStarted
                ? gpsSharing ? action.startedHelp : action.gpsPaused
                : gpsSharing ? action.startingHelp : action.readyHelp}
            </p>
            {gpsSharing && <p className="mt-3 text-xs font-semibold text-emerald-800">✓ {action.gpsLive}</p>}
          </div>
        </div>
        {!gpsSharing && (
          <Button onClick={startSharing} className="mt-5 w-full">
            {tripStarted ? action.resumeGps : action.startTrip}
          </Button>
        )}
      </section>

      {route && (
        <div className="border border-line bg-white mb-6">
          <div className="h-56"><TripMap routeGeometry={route.geometry} driverPosition={driverPosition} /></div>
          <div className="p-5 flex items-center justify-between gap-4">
            <div>
              <span className="font-mono text-xs uppercase text-steel block mb-1">
                {route.steps.length ? `${c.step} ${currentStepIndex + 1} ${c.of} ${route.steps.length}` : c.routeOverview}
              </span>
              <p className="font-display font-semibold text-asphalt">{route.steps[currentStepIndex]?.instruction ?? c.arrived}</p>
              {route.steps[currentStepIndex] && <span className="font-mono text-xs text-steel">{Math.round(route.steps[currentStepIndex].distanceM)} m</span>}
              {gpsSharing && route.steps.length > 1 && <span className="font-mono text-[10px] uppercase text-steel block mt-2">{c.autoAdvance}</span>}
            </div>
            <button
              onClick={() => setCurrentStepIndex((i) => Math.min(i + 1, route.steps.length - 1))}
              disabled={route.steps.length <= 1 || currentStepIndex >= route.steps.length - 1}
              className="font-body text-sm text-route underline disabled:text-steel disabled:no-underline"
            >{c.skipStep}</button>
          </div>
        </div>
      )}

      <div className="border border-line bg-white p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <span className="font-mono text-xs uppercase text-steel">{c.liveLocation}</span>
          <span className={`w-2 h-2 rounded-full ${gpsSharing ? "bg-route animate-pulse" : "bg-steel"}`} />
        </div>
        {!gpsSharing ? (
          <>
            <p className="font-body text-xs text-steel mb-3">{tripStarted ? action.gpsPaused : c.startHelp}</p>
            <Button onClick={startSharing} className="w-full">{tripStarted ? action.resumeGps : action.startTrip}</Button>
          </>
        ) : (
          <>
            <p className="font-body text-xs text-steel mb-3">
              {lastPing ? <>{c.gpsConnected}: {lastPing}{speedKmh !== null ? ` · ${speedKmh.toFixed(1)} km/h` : ""}</> : c.findingGps}
            </p>
            <p className="font-body text-xs text-steel mb-3">{c.customerWatching}</p>
            <Button variant="ghost" onClick={stopSharing} className="w-full">{c.stopSharing}</Button>
          </>
        )}
      </div>

      {tripStarted ? (
        <DriverDeliveryProofForm orderId={order.id} onDelivered={() => { stopSharing(); navigate("/driver/jobs"); }} />
      ) : (
        <div className="border border-line bg-white px-5 py-4 text-center">
          <p className="font-display font-semibold text-asphalt">{c.deliveryLocked}</p>
          <p className="font-body text-xs text-steel mt-1">{c.deliveryLockedHelp}</p>
        </div>
      )}
    </div>
  );
}