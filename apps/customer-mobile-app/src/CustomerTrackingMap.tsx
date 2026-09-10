import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type LngLatLike, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { CustomerLiveTrip } from "./customer-tracking.service";
import { classifyTrackingFreshness, type TrackingFreshness } from "./tracking-freshness";

const mapTilerKey = (import.meta.env.VITE_MAPTILER_KEY as string | undefined)?.trim();
const mapStyle = mapTilerKey ? `https://api.maptiler.com/maps/basic-v2/style.json?key=${encodeURIComponent(mapTilerKey)}` : "https://tiles.openfreemap.org/styles/liberty";
const ROUTE_SOURCE_ID = "customer-mobile-trip-route";
const ROUTE_LAYER_ID = "customer-mobile-trip-route-line";

type RouteResult = { coordinates: [number, number][]; distanceM: number; durationS: number };

function validCoordinate(lng: number | null | undefined, lat: number | null | undefined) {
  return lng != null && lat != null && Number.isFinite(Number(lng)) && Number.isFinite(Number(lat));
}

async function fetchRoute(from: [number, number], to: [number, number], signal: AbortSignal): Promise<RouteResult> {
  const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson`, { signal });
  if (!response.ok) throw new Error(`Route service returned ${response.status}.`);
  const payload = await response.json() as { routes?: Array<{ distance?: number; duration?: number; geometry?: { coordinates?: [number, number][] } }> };
  const route = payload.routes?.[0];
  if (!route?.geometry?.coordinates?.length) throw new Error("Route geometry is unavailable.");
  return { coordinates: route.geometry.coordinates, distanceM: Number(route.distance || 0), durationS: Number(route.duration || 0) };
}

function applyTruckFreshness(element: HTMLElement, freshness: TrackingFreshness) {
  element.dataset.trackingFreshness = freshness;
  element.setAttribute("aria-label", freshness === "LIVE" ? "Live truck location" : `Last known truck location, GPS ${freshness.toLowerCase()}`);
  element.style.opacity = freshness === "LIVE" ? "1" : ".68";
}

function applyTruckHeading(element: HTMLElement, heading?: number | null) {
  const arrow = element.querySelector<HTMLElement>("[data-truck-arrow]");
  if (!arrow) return;
  arrow.style.transform = heading != null && Number.isFinite(Number(heading)) ? `rotate(${Number(heading)}deg)` : "";
}

function createMarkerElement(kind: "pickup" | "dropoff" | "truck", heading?: number | null, freshness: TrackingFreshness = "OFFLINE") {
  const element = document.createElement("div");
  element.style.display = "grid"; element.style.placeItems = "center"; element.style.boxSizing = "border-box"; element.style.border = "3px solid #fff"; element.style.boxShadow = "0 5px 15px rgba(16,33,61,.25)";
  if (kind === "pickup" || kind === "dropoff") {
    element.style.width = "20px"; element.style.height = "20px"; element.style.borderRadius = "50%"; element.style.background = kind === "pickup" ? "#10213d" : "#d68e25";
    element.setAttribute("aria-label", kind === "pickup" ? "Pickup location" : "Drop-off location");
  } else {
    element.style.width = "34px"; element.style.height = "34px"; element.style.borderRadius = "12px"; element.style.background = "#10213d"; element.style.color = "#f5b400"; element.style.fontSize = "17px"; element.style.fontWeight = "900"; element.innerHTML = '<span data-truck-arrow aria-hidden="true">➤</span>';
    applyTruckHeading(element, heading); applyTruckFreshness(element, freshness);
  }
  return element;
}

function setMarker(current: Marker | null, map: maplibregl.Map, position: LngLatLike, kind: "pickup" | "dropoff" | "truck", heading?: number | null, freshness: TrackingFreshness = "OFFLINE") {
  if (current) {
    current.setLngLat(position);
    if (kind === "truck") { applyTruckHeading(current.getElement(), heading); applyTruckFreshness(current.getElement(), freshness); }
    return current;
  }
  return new maplibregl.Marker({ element: createMarkerElement(kind, heading, freshness), anchor: "center" }).setLngLat(position).addTo(map);
}

function timelineIndex(status: string | null | undefined) {
  if (status === "delivered") return 3;
  if (status === "in_transit") return 2;
  if (status === "accepted" || status === "assigned") return 1;
  return 0;
}

export function CustomerTrackingMap({ trip, totalDistanceKm }: { trip: CustomerLiveTrip | undefined; totalDistanceKm?: number | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const pickupMarkerRef = useRef<Marker | null>(null);
  const dropoffMarkerRef = useRef<Marker | null>(null);
  const truckMarkerRef = useRef<Marker | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [remaining, setRemaining] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");

  const hasTruck = Boolean(trip && validCoordinate(trip.truck_lng, trip.truck_lat));
  const freshness = classifyTrackingFreshness(hasTruck ? trip?.recorded_at : null);
  const gpsLive = hasTruck && freshness === "LIVE";

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({ container: containerRef.current, style: mapStyle, center: [39.6, 8.8], zoom: 6, dragPan: true, scrollZoom: true, touchZoomRotate: true, doubleClickZoom: true });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    return () => { pickupMarkerRef.current?.remove(); dropoffMarkerRef.current?.remove(); truckMarkerRef.current?.remove(); map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !trip) return;
    const pickup = validCoordinate(trip.pickup_lng, trip.pickup_lat) ? [Number(trip.pickup_lng), Number(trip.pickup_lat)] as [number, number] : null;
    const dropoff = validCoordinate(trip.dropoff_lng, trip.dropoff_lat) ? [Number(trip.dropoff_lng), Number(trip.dropoff_lat)] as [number, number] : null;
    const truck = validCoordinate(trip.truck_lng, trip.truck_lat) ? [Number(trip.truck_lng), Number(trip.truck_lat)] as [number, number] : null;
    if (pickup) pickupMarkerRef.current = setMarker(pickupMarkerRef.current, map, pickup, "pickup"); else { pickupMarkerRef.current?.remove(); pickupMarkerRef.current = null; }
    if (dropoff) dropoffMarkerRef.current = setMarker(dropoffMarkerRef.current, map, dropoff, "dropoff"); else { dropoffMarkerRef.current?.remove(); dropoffMarkerRef.current = null; }
    if (truck) truckMarkerRef.current = setMarker(truckMarkerRef.current, map, truck, "truck", trip.heading, freshness); else { truckMarkerRef.current?.remove(); truckMarkerRef.current = null; }
    const points = [pickup, dropoff, truck].filter((point): point is [number, number] => point !== null);
    if (points.length) {
      const bounds = points.slice(1).reduce((current, point) => current.extend(point), new maplibregl.LngLatBounds(points[0], points[0]));
      map.fitBounds(bounds, { padding: 46, maxZoom: 13, duration: 450 });
    }
  }, [freshness, trip]);

  useEffect(() => {
    const pickup = trip && validCoordinate(trip.pickup_lng, trip.pickup_lat) ? [Number(trip.pickup_lng), Number(trip.pickup_lat)] as [number, number] : null;
    const dropoff = trip && validCoordinate(trip.dropoff_lng, trip.dropoff_lat) ? [Number(trip.dropoff_lng), Number(trip.dropoff_lat)] as [number, number] : null;
    const truck = trip && validCoordinate(trip.truck_lng, trip.truck_lat) ? [Number(trip.truck_lng), Number(trip.truck_lat)] as [number, number] : null;
    const controller = new AbortController();
    if (!pickup || !dropoff) { setRoute(null); setRemaining(null); return () => controller.abort(); }
    setRouteLoading(true); setRouteError("");
    void fetchRoute(pickup, dropoff, controller.signal).then(setRoute).catch((caught: unknown) => { if (!controller.signal.aborted) setRouteError(caught instanceof Error ? caught.message : "Route could not be loaded."); }).finally(() => { if (!controller.signal.aborted) setRouteLoading(false); });
    if (truck && gpsLive) void fetchRoute(truck, dropoff, controller.signal).then(setRemaining).catch(() => { if (!controller.signal.aborted) setRemaining(null); });
    else setRemaining(null);
    return () => controller.abort();
  }, [gpsLive, trip?.dropoff_lat, trip?.dropoff_lng, trip?.pickup_lat, trip?.pickup_lng, trip?.truck_lat, trip?.truck_lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const render = () => {
      const source = map.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      const data = { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: route?.coordinates ?? [] } };
      if (source) source.setData(data);
      else if (route?.coordinates.length) { map.addSource(ROUTE_SOURCE_ID, { type: "geojson", data }); map.addLayer({ id: ROUTE_LAYER_ID, type: "line", source: ROUTE_SOURCE_ID, paint: { "line-color": "#0759c7", "line-width": 5, "line-opacity": .8 } }); }
    };
    if (map.isStyleLoaded()) render(); else map.once("load", render);
  }, [route]);

  const status = trip?.status || "accepted";
  const step = timelineIndex(status);
  const remainingKm = remaining ? remaining.distanceM / 1000 : null;
  const eta = remaining && gpsLive ? new Date(Date.now() + remaining.durationS * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
  const routeDistance = route ? route.distanceM / 1000 : Number(totalDistanceKm || 0);
  const completedPercent = status === "delivered" ? 100 : remainingKm != null && routeDistance > 0 ? Math.max(0, Math.min(99, Math.round((1 - remainingKm / routeDistance) * 100))) : step * 28;
  const gpsText = !hasTruck ? "Waiting for GPS" : freshness === "LIVE" ? `Live${trip?.speed_kmh != null ? ` · ${Math.round(Number(trip.speed_kmh))} km/h` : ""}` : `${freshness} · last known`;
  const timeline = ["Assigned", "Pickup", "On route", "Delivered"];
  const lastUpdate = trip?.recorded_at ? new Date(trip.recorded_at).toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" }) : "Waiting for GPS update";

  return (
    <section className="customer-track-v4" data-tracking-freshness={freshness}>
      <div className="customer-track-v4__timeline" aria-label="Trip progress">{timeline.map((label, index) => <div key={label} className={index <= step ? "is-done" : ""}><span>{index + 1}</span><small>{label}</small></div>)}</div>
      <div className="customer-track-v4__progress"><span style={{ width: `${completedPercent}%` }}/></div>
      <div className="customer-track-v4__metrics"><Metric label="Trip status" value={(status || "pending").replaceAll("_", " ")}/><Metric label="Truck GPS status" value={gpsText}/><Metric label="Remaining distance" value={status === "delivered" ? "0 km" : remainingKm == null ? "—" : `${remainingKm.toFixed(1)} km`}/><Metric label="ETA" value={status === "delivered" ? "Delivered" : eta}/></div>
      <div className="customer-track-v4__map-shell">
        <div className="customer-track-v4__map-head"><div><small>LIVE TRIP MAP</small><strong>Pickup → Drop-off → Truck</strong></div><b className={gpsLive ? "is-live" : ""}>{gpsLive ? "GPS LIVE" : `GPS ${freshness}`}</b></div>
        <div ref={containerRef} className="customer-track-v4__map" aria-label="Trip tracking map"/>
        {routeLoading && <p className="customer-track-v4__message">Loading route…</p>}
        {routeError && <p className="customer-track-v4__message">Route line unavailable: {routeError}</p>}
        {!hasTruck && <p className="customer-track-v4__message">Waiting for the assigned Driver's first GPS location.</p>}
        {hasTruck && !gpsLive && <p className="customer-track-v4__message customer-track-v4__message--warn">{freshness} — truck marker is historical last-known data, not a current/live position.</p>}
        <div className="customer-track-v4__legend"><span>● Pickup</span><span>● Drop-off</span><span>▣ Truck</span></div>
      </div>
      <div className="customer-track-v4__last-update"><span>Latest location timestamp</span><strong>{lastUpdate}</strong></div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div><small>{label}</small><strong>{value}</strong></div>; }
