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

  const statusLabel = order.status === "accepted" ? c.assigned : order.status === "in_transit" ? c.onRoad : order.status;

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <div className="flex items-center justify-between mb-8">
        <CargoPlate size="lg">{order.tracking_id}</CargoPlate>
        <span className="font-display font-semibold text-asphalt">{statusLabel}</span>
      </div>

      <div className="border border-line bg-white p-6 mb-6 space-y-3 font-body text-sm">
        <div><span className="text-steel">{c.pickup}</span><div className="text-asphalt">{order.pickup_address}</div></div>
        <div><span className="text-steel">{c.dropoff}</span><div className="text-asphalt">{order.dropoff_address}</div></div>
        <div className="flex justify-between pt-3 border-t border-line items-center">
          <span className="text-steel">{c.earn}</span><CargoPlate>{formatEtb(order.price_etb)}</CargoPlate>
        </div>
      </div>

      {error && <p className="font-body text-sm text-route border border-route/40 bg-route/5 px-4 py-3 mb-6">{error}</p>}
      {routeError && <p className="font-body text-xs text-steel border border-line px-4 py-3 mb-6">{c.directionsUnavailable}: {routeError}</p>}

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
            {order.status === "accepted" && <p className="font-body text-xs text-steel mb-3">{c.startHelp}</p>}
            <Button onClick={startSharing} className="w-full">{c.startSharing}</Button>
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

      {order.status === "in_transit" ? (
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
