import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "../../services/supabase.client";

interface LiveTripRow {
  order_id: string;
  status: string;
  pickup_lng: number;
  pickup_lat: number;
  dropoff_lng: number;
  dropoff_lat: number;
  truck_lng: number | null;
  truck_lat: number | null;
  heading: number | null;
  speed_kmh: number | null;
  recorded_at: string | null;
}

interface RouteResult {
  geometry: { type: "LineString"; coordinates: [number, number][] };
  distance: number;
  duration: number;
}

const mapTilerKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;
const style = `https://api.maptiler.com/maps/basic-v2/style.json?key=${mapTilerKey ?? ""}`;
const timelineSteps = ["Assigned", "Pickup", "On route", "Delivered"] as const;
const LIVE_GPS_FRESH_MS = 2 * 60 * 1000;

async function fetchRoute(from: [number, number], to: [number, number]): Promise<RouteResult | null> {
  const url = `https://router.project-osrm.org/route/v1/driving/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson&steps=false`;
  const response = await fetch(url);
  if (!response.ok) return null;
  const data = await response.json() as { routes?: RouteResult[] };
  return data.routes?.[0] ?? null;
}

function formatDuration(seconds: number) {
  const minutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours ? `${hours}h ${mins}m` : `${mins}m`;
}

function formatGpsAge(recordedAt: string) {
  const ageSeconds = Math.max(0, Math.round((Date.now() - new Date(recordedAt).getTime()) / 1000));
  if (ageSeconds < 60) return `${ageSeconds}s ago`;
  const ageMinutes = Math.round(ageSeconds / 60);
  if (ageMinutes < 60) return `${ageMinutes}m ago`;
  return `${Math.round(ageMinutes / 60)}h ago`;
}

function timelinePosition(status: string | undefined) {
  if (status === "delivered") return 3;
  if (status === "in_transit") return 2;
  if (status === "accepted" || status === "assigned") return 1;
  return 0;
}

export function CustomerLiveTripMap({
  orderId,
  totalDistanceKm,
  standalone = false,
  showCustomerDetailsLink = true,
}: {
  orderId: string;
  totalDistanceKm: number | null;
  standalone?: boolean;
  showCustomerDetailsLink?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const truckMarker = useRef<maplibregl.Marker | null>(null);
  const endpointMarkers = useRef<maplibregl.Marker[]>([]);
  const [trip, setTrip] = useState<LiveTripRow | null>(null);
  const [remainingKm, setRemainingKm] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  const progress = useMemo(() => {
    const total = Number(totalDistanceKm ?? 0);
    if (!total || remainingKm == null) return null;
    return Math.min(100, Math.max(0, Math.round((1 - remainingKm / total) * 100)));
  }, [remainingKm, totalDistanceKm]);

  const activeStep = timelinePosition(trip?.status);
  const hasTruckLocation = trip?.truck_lng != null && trip?.truck_lat != null;
  const gpsAgeMs = trip?.recorded_at ? Date.now() - new Date(trip.recorded_at).getTime() : null;
  const gpsFresh = hasTruckLocation && gpsAgeMs !== null && gpsAgeMs >= 0 && gpsAgeMs <= LIVE_GPS_FRESH_MS;
  const speedValue = !hasTruckLocation
    ? "Waiting for GPS"
    : !gpsFresh
      ? "GPS paused"
      : trip?.speed_kmh != null
        ? `${Math.round(Number(trip.speed_kmh))} km/h`
        : "Location received";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error: rpcError } = await supabase.rpc("customer_get_live_trip", { p_order_id: orderId });
      if (cancelled) return;
      if (rpcError) {
        setError(rpcError.message);
        return;
      }
      setError("");
      const row = (data?.[0] ?? null) as LiveTripRow | null;
      setTrip(row);
    }
    void load();
    const interval = window.setInterval(() => void load(), 8000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [orderId, retryKey]);

  useEffect(() => {
    if (!container.current || mapRef.current || !mapTilerKey) return;
    const map = new maplibregl.Map({ container: container.current, style, center: [39.6, 8.8], zoom: 6 });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    return () => {
      endpointMarkers.current.forEach((marker) => marker.remove());
      truckMarker.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const currentMap = mapRef.current;
    if (!currentMap || !trip) return;
    const activeMap: maplibregl.Map = currentMap;
    const pickup: [number, number] = [trip.pickup_lng, trip.pickup_lat];
    const dropoff: [number, number] = [trip.dropoff_lng, trip.dropoff_lat];
    const truck = trip.truck_lng != null && trip.truck_lat != null ? [trip.truck_lng, trip.truck_lat] as [number, number] : null;

    async function render() {
      if (!activeMap.isStyleLoaded()) {
        await new Promise<void>((resolve) => activeMap.once("load", () => resolve()));
      }

      endpointMarkers.current.forEach((marker) => marker.remove());
      endpointMarkers.current = [
        new maplibregl.Marker({ color: "#1d222a" }).setLngLat(pickup).addTo(activeMap),
        new maplibregl.Marker({ color: "#d68e25" }).setLngLat(dropoff).addTo(activeMap),
      ];

      const route = await fetchRoute(pickup, dropoff);
      const sourceId = "customer-live-route";
      if (activeMap.getLayer(sourceId)) activeMap.removeLayer(sourceId);
      if (activeMap.getSource(sourceId)) activeMap.removeSource(sourceId);
      if (route) {
        activeMap.addSource(sourceId, {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: route.geometry },
        });
        activeMap.addLayer({
          id: sourceId,
          type: "line",
          source: sourceId,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#d68e25", "line-width": 5, "line-opacity": 0.8 },
        });
      }

      const bounds = new maplibregl.LngLatBounds(pickup, pickup).extend(dropoff);
      if (truck) bounds.extend(truck);
      activeMap.fitBounds(bounds, { padding: 55, maxZoom: 12 });

      if (truck) {
        if (!truckMarker.current) {
          const element = document.createElement("div");
          element.className = "grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-emerald-700 font-mono text-[10px] font-bold text-white shadow-lg";
          element.textContent = "TRK";
          truckMarker.current = new maplibregl.Marker({ element }).setLngLat(truck).addTo(activeMap);
        } else {
          truckMarker.current.setLngLat(truck);
        }

        const remaining = await fetchRoute(truck, dropoff);
        if (remaining) {
          setRemainingKm(Number((remaining.distance / 1000).toFixed(1)));
          setRemainingSeconds(remaining.duration);
        }
      } else {
        truckMarker.current?.remove();
        truckMarker.current = null;
        setRemainingKm(null);
        setRemainingSeconds(null);
      }
    }

    void render();
  }, [trip]);

  if (!mapTilerKey) return <p className="border border-route/30 bg-route/5 p-4 text-sm text-route">Map key is not configured.</p>;

  return (
    <div className="customer-live-map">
      {error && (
        <div className="mb-3 flex flex-col gap-3 border border-route/30 bg-route/5 p-3 text-xs text-route min-[390px]:flex-row min-[390px]:items-center min-[390px]:justify-between">
          <p role="alert" className="min-w-0 break-words">{error}</p>
          <button
            type="button"
            onClick={() => setRetryKey((key) => key + 1)}
            className="min-h-11 shrink-0 border border-route/30 bg-white px-4 py-2 font-semibold"
          >
            Retry tracking
          </button>
        </div>
      )}

      <div className="customer-live-map__timeline" aria-label="Trip progress">
        {timelineSteps.map((step, index) => (
          <div key={step} className={`customer-live-map__step${index < activeStep ? " is-done" : index === activeStep ? " is-active" : ""}`}>
            <span>{index < activeStep ? "✓" : index + 1}</span>
            <small>{step}</small>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <Metric label="Trip status" value={trip?.status?.replace("_", " ") ?? "Loading"} />
        <Metric label="Truck GPS" value={speedValue} />
        <Metric label="Remaining" value={remainingKm != null ? `${remainingKm} km` : "Waiting for GPS"} />
        <Metric label="ETA" value={remainingSeconds != null ? formatDuration(remainingSeconds) : "Waiting for GPS"} />
      </div>
      {progress != null && (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs"><span>Trip progress</span><strong>{progress}%</strong></div>
          <div className="h-2 overflow-hidden rounded-full bg-asphalt/10"><div className="h-full bg-emerald-700" style={{ width: `${progress}%` }} /></div>
        </div>
      )}
      <div ref={container} className="customer-live-map__canvas mt-4 h-72 w-full border border-line bg-bone" />
      <p className={`mt-2 text-[11px] ${gpsFresh ? "text-emerald-800" : "text-steel"}`}>
        {gpsFresh
          ? "Live GPS is active and refreshes every 8 seconds. Orange line = road route · TRK = latest driver location."
          : hasTruckLocation
            ? "Live GPS is paused. The map, remaining distance and ETA use the last known driver location."
            : "Waiting for the driver to share the first GPS location."}
      </p>
      {trip?.recorded_at && (
        <p className="mt-1 text-[11px] text-steel">
          Last GPS update: {new Date(trip.recorded_at).toLocaleString()} · {formatGpsAge(trip.recorded_at)}
        </p>
      )}
      {!standalone && showCustomerDetailsLink && <Link to={`/customer/tracking/${orderId}`} className="customer-live-map__open-page">Open full live tracking →</Link>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="border border-asphalt/10 bg-bone p-3"><p className="text-steel">{label}</p><p className="mt-1 font-semibold capitalize">{value}</p></div>;
}
