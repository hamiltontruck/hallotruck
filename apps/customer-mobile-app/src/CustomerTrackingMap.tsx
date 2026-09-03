import { useEffect, useRef } from "react";
import maplibregl, { type LngLatLike, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { CustomerLiveTrip } from "./customer-tracking.service";

const mapTilerKey = (import.meta.env.VITE_MAPTILER_KEY as string | undefined)?.trim();
const mapStyle = mapTilerKey
  ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(mapTilerKey)}`
  : "https://tiles.openfreemap.org/styles/liberty";

function validCoordinate(lng: number | null | undefined, lat: number | null | undefined) {
  return lng != null && lat != null && Number.isFinite(Number(lng)) && Number.isFinite(Number(lat));
}

function applyTruckHeading(element: HTMLElement, heading?: number | null) {
  const arrow = element.querySelector<HTMLElement>("[data-truck-arrow]");
  if (!arrow) return;
  arrow.style.display = "inline-block";
  arrow.style.transform = heading != null && Number.isFinite(Number(heading))
    ? `rotate(${Number(heading)}deg)`
    : "";
}

function createMarkerElement(kind: "pickup" | "dropoff" | "truck", heading?: number | null) {
  const element = document.createElement("div");
  element.setAttribute("aria-label", kind === "pickup" ? "Pickup location" : kind === "dropoff" ? "Drop-off location" : "Truck location");
  element.style.display = "grid";
  element.style.placeItems = "center";
  element.style.boxSizing = "border-box";
  element.style.border = "3px solid #fff";
  element.style.boxShadow = "0 5px 15px rgba(16,33,61,.25)";

  if (kind === "pickup") {
    element.style.width = "20px";
    element.style.height = "20px";
    element.style.borderRadius = "50%";
    element.style.background = "#0759c7";
  } else if (kind === "dropoff") {
    element.style.width = "20px";
    element.style.height = "20px";
    element.style.borderRadius = "50%";
    element.style.background = "#f5b400";
  } else {
    element.style.width = "34px";
    element.style.height = "34px";
    element.style.borderRadius = "12px";
    element.style.background = "#10213d";
    element.style.color = "#fff";
    element.style.fontSize = "17px";
    element.style.fontWeight = "900";
    element.innerHTML = '<span data-truck-arrow aria-hidden="true">➤</span>';
    applyTruckHeading(element, heading);
  }

  return element;
}

function setMarker(
  current: Marker | null,
  map: maplibregl.Map,
  position: LngLatLike,
  kind: "pickup" | "dropoff" | "truck",
  heading?: number | null,
) {
  if (current) {
    current.setLngLat(position);
    if (kind === "truck") applyTruckHeading(current.getElement(), heading);
    return current;
  }

  return new maplibregl.Marker({ element: createMarkerElement(kind, heading), anchor: "center" })
    .setLngLat(position)
    .addTo(map);
}

export function CustomerTrackingMap({ trip }: { trip: CustomerLiveTrip | undefined }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const pickupMarkerRef = useRef<Marker | null>(null);
  const dropoffMarkerRef = useRef<Marker | null>(null);
  const truckMarkerRef = useRef<Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: [39.6, 8.8],
      zoom: 6,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    return () => {
      pickupMarkerRef.current?.remove();
      dropoffMarkerRef.current?.remove();
      truckMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !trip) return;

    const pickup = validCoordinate(trip.pickup_lng, trip.pickup_lat)
      ? [Number(trip.pickup_lng), Number(trip.pickup_lat)] as [number, number]
      : null;
    const dropoff = validCoordinate(trip.dropoff_lng, trip.dropoff_lat)
      ? [Number(trip.dropoff_lng), Number(trip.dropoff_lat)] as [number, number]
      : null;
    const truck = validCoordinate(trip.truck_lng, trip.truck_lat)
      ? [Number(trip.truck_lng), Number(trip.truck_lat)] as [number, number]
      : null;

    if (pickup) pickupMarkerRef.current = setMarker(pickupMarkerRef.current, map, pickup, "pickup");
    else { pickupMarkerRef.current?.remove(); pickupMarkerRef.current = null; }

    if (dropoff) dropoffMarkerRef.current = setMarker(dropoffMarkerRef.current, map, dropoff, "dropoff");
    else { dropoffMarkerRef.current?.remove(); dropoffMarkerRef.current = null; }

    if (truck) truckMarkerRef.current = setMarker(truckMarkerRef.current, map, truck, "truck", trip.heading);
    else { truckMarkerRef.current?.remove(); truckMarkerRef.current = null; }

    const points = [pickup, dropoff, truck].filter((point): point is [number, number] => point !== null);
    if (!points.length) return;

    const bounds = points.slice(1).reduce(
      (current, point) => current.extend(point),
      new maplibregl.LngLatBounds(points[0], points[0]),
    );
    map.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: 450 });
  }, [trip]);

  const hasEndpoints = Boolean(
    trip && validCoordinate(trip.pickup_lng, trip.pickup_lat) && validCoordinate(trip.dropoff_lng, trip.dropoff_lat),
  );
  const hasTruck = Boolean(trip && validCoordinate(trip.truck_lng, trip.truck_lat));

  return (
    <section
      aria-label="Live trip map"
      style={{ marginTop: 14, overflow: "hidden", border: "1px solid #dfe7f1", borderRadius: 22, background: "#fff", boxShadow: "0 10px 30px rgba(16,33,61,.06)" }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 15px 12px" }}>
        <div>
          <small style={{ display: "block", color: "#0759c7", fontSize: 10, fontWeight: 900, letterSpacing: ".08em" }}>REAL MAP</small>
          <strong style={{ display: "block", marginTop: 4, color: "#10213d", fontSize: 15 }}>Pickup → Drop-off → Truck</strong>
        </div>
        <span style={{ borderRadius: 999, background: hasTruck ? "#ecfdf3" : "#fff7ed", padding: "6px 9px", color: hasTruck ? "#027a48" : "#b54708", fontSize: 10, fontWeight: 900 }}>
          {hasTruck ? "GPS LIVE" : "WAITING GPS"}
        </span>
      </div>
      <div ref={containerRef} style={{ width: "100%", height: 310, background: "#dfe9f5" }} />
      {!hasEndpoints && (
        <p style={{ margin: 0, padding: "10px 14px 0", color: "#68778d", fontSize: 10, lineHeight: 1.5 }}>
          Pickup/drop-off coordinates secure live-trip RPC irraa yeroo argaman map irratti mul'atu.
        </p>
      )}
      <div aria-label="Map legend" style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: "11px 14px 13px", color: "#68778d", fontSize: 10, fontWeight: 800 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 9, height: 9, borderRadius: 999, background: "#0759c7" }} /> Pickup</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 9, height: 9, borderRadius: 999, background: "#f5b400" }} /> Drop-off</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 9, height: 9, borderRadius: 3, background: "#10213d" }} /> Truck</span>
      </div>
    </section>
  );
}
