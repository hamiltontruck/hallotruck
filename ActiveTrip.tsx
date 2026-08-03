import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getMyActiveOrders,
  markDelivered,
  getNavigation,
  MyOrder,
  NavigationRoute,
} from "../services/driver.service";
import { sendOrQueuePing } from "../services/offline.service";
import { formatEtb } from "../utils/currency";
import { Button } from "../components/ui/Button";
import { CargoPlate } from "../components/ui/CargoPlate";
import { TripMap } from "../components/navigation/TripMap";

const STATUS_LABEL: Record<string, string> = {
  accepted: "Assigned — head to pickup",
  in_transit: "On the road",
};

export function ActiveTrip() {
  const navigate = useNavigate();
  const [order, setOrder] = useState<MyOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [gpsSharing, setGpsSharing] = useState(false);
  const [lastPing, setLastPing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
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
    getNavigation(order.id)
      .then(setRoute)
      .catch((err) => setRouteError(err instanceof Error ? err.message : "Couldn't load route."));
  }, [order]);

  function startSharing() {
    if (!order || !navigator.geolocation) {
      setError("GPS isn't available on this device.");
      return;
    }
    setGpsSharing(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const coords: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        setDriverPosition(coords);
        try {
          await sendOrQueuePing({
            orderId: order.id,
            lng: coords[0],
            lat: coords[1],
            heading: pos.coords.heading ?? undefined,
            speedKmh: pos.coords.speed ? pos.coords.speed * 3.6 : undefined,
          });
          setLastPing(new Date().toLocaleTimeString());
        } catch (err) {
          setError(err instanceof Error ? err.message : "GPS ping failed.");
        }
      },
      () => setError("Location permission denied. Enable GPS to share your position."),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
  }

  function stopSharing() {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    setGpsSharing(false);
  }

  useEffect(() => () => stopSharing(), []);

  async function handleDeliver() {
    if (!order) return;
    setFinishing(true);
    try {
      await markDelivered(order.id);
      stopSharing();
      navigate("/jobs");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't mark delivered.");
    } finally {
      setFinishing(false);
    }
  }

  if (loading) return <div className="max-w-2xl mx-auto px-6 py-16 font-body text-steel">Loading…</div>;

  if (!order) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <p className="font-body text-steel mb-4">You don't have an active trip.</p>
        <Button onClick={() => navigate("/jobs")}>Browse the job board →</Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <div className="flex items-center justify-between mb-8">
        <CargoPlate size="lg">{order.tracking_id}</CargoPlate>
        <span className="font-display font-semibold text-asphalt">
          {STATUS_LABEL[order.status] ?? order.status}
        </span>
      </div>

      <div className="border border-line bg-white p-6 mb-6 space-y-3 font-body text-sm">
        <div>
          <span className="text-steel">Pickup</span>
          <div className="text-asphalt">{order.pickup_address}</div>
        </div>
        <div>
          <span className="text-steel">Drop-off</span>
          <div className="text-asphalt">{order.dropoff_address}</div>
        </div>
        <div className="flex justify-between pt-3 border-t border-line items-center">
          <span className="text-steel">You'll earn</span>
          <CargoPlate>{formatEtb(order.price_etb)}</CargoPlate>
        </div>
      </div>

      {error && (
        <p className="font-body text-sm text-route border border-route/40 bg-route/5 px-4 py-3 mb-6">
          {error}
        </p>
      )}

      {routeError && (
        <p className="font-body text-xs text-steel border border-line px-4 py-3 mb-6">
          Turn-by-turn directions unavailable: {routeError}
        </p>
      )}

      {route && (
        <div className="border border-line bg-white mb-6">
          <div className="h-56">
            <TripMap routeGeometry={route.geometry} driverPosition={driverPosition} />
          </div>
          <div className="p-5 flex items-center justify-between gap-4">
            <div>
              <span className="font-mono text-xs uppercase text-steel block mb-1">
                Step {currentStepIndex + 1} of {route.steps.length}
              </span>
              <p className="font-display font-semibold text-asphalt">
                {route.steps[currentStepIndex]?.instruction ?? "Arrived"}
              </p>
              {route.steps[currentStepIndex] && (
                <span className="font-mono text-xs text-steel">
                  {Math.round(route.steps[currentStepIndex].distanceM)} m
                </span>
              )}
            </div>
            <button
              onClick={() => setCurrentStepIndex((i) => Math.min(i + 1, route.steps.length - 1))}
              disabled={currentStepIndex >= route.steps.length - 1}
              className="font-body text-sm text-route underline disabled:text-steel disabled:no-underline"
            >
              Next step →
            </button>
          </div>
        </div>
      )}

      <div className="border border-line bg-white p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <span className="font-mono text-xs uppercase text-steel">Live location</span>
          <span className={`w-2 h-2 rounded-full ${gpsSharing ? "bg-route animate-pulse" : "bg-steel"}`} />
        </div>
        {!gpsSharing ? (
          <Button onClick={startSharing} className="w-full">
            Start sharing my location
          </Button>
        ) : (
          <>
            <p className="font-body text-xs text-steel mb-3">
              {lastPing ? `Last update: ${lastPing}` : "Waiting for GPS…"} — the customer can see
              your truck moving live.
            </p>
            <Button variant="ghost" onClick={stopSharing} className="w-full">
              Stop sharing
            </Button>
          </>
        )}
      </div>

      <Button onClick={handleDeliver} disabled={finishing} className="w-full">
        {finishing ? "Confirming…" : "Mark as delivered"}
      </Button>
    </div>
  );
}
