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

function createMarkerElement(kind: "pickup" | "dropoff" | "truck", heading?: number | null) {
  const element = document.createElement("div");
  element.className = `customer-tracking-map__marker customer-tracking-map__marker--${kind}`;
  element.setAttribute("aria-label", kind === "pickup" ? "Pickup location" : kind === "dropoff" ? "Drop-off location" : "Truck location");

  if (kind === "truck") {
    element.innerHTML = '<span aria-hidden="true">➤</span>';
    if (heading != null && Number.isFinite(Number(heading))) {
      element.style.transform = `rotate(${Number(heading)}deg)`;
    }
  } else {
    element.innerHTML = '<span aria-hidden="true"></span>';
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
    if (kind === "truck") {
      current.getElement().style.transform = heading != null && Number.isFinite(Number(heading))
        ? `rotate(${Number(heading)}deg)`
        : "";
    }
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
      attributionControl: true,
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

  return (
    <section className="customer-tracking-map-card" aria-label="Live trip map">
      <div className="customer-tracking-map-card__head">
        <div>
          <small>REAL MAP</small>
          <strong>Pickup → Drop-off → Truck</strong>
        </div>
        <span>{trip?.truck_lat != null && trip?.truck_lng != null ? "GPS live" : "Waiting GPS"}</span>
      </div>
      <div ref={containerRef} className="customer-tracking-map" />
      {!hasEndpoints && (
        <p className="customer-tracking-map-card__note">Pickup/drop-off coordinates secure live-trip RPC irraa yeroo argaman map irratti mul'atu.</p>
      )}
      <div className="customer-tracking-map-card__legend" aria-label="Map legend">
        <span><i className="pickup" /> Pickup</span>
        <span><i className="dropoff" /> Drop-off</span>
        <span><i className="truck" /> Truck</span>
      </div>
    </section>
  );
}
