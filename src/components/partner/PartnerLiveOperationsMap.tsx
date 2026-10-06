import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { PartnerLiveTrip } from "../../services/partner-live-operations.service";

const mapTilerKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;
const style = `https://api.maptiler.com/maps/basic-v2/style.json?key=${mapTilerKey ?? ""}`;

function markerElement(trip: PartnerLiveTrip) {
  const element = document.createElement("div");
  element.className = "relative grid h-10 w-10 place-items-center rounded-full border-2 border-white bg-asphalt text-xs font-bold text-white shadow-lg";
  element.dataset.trackingFreshness = trip.freshness;
  element.setAttribute("aria-label", `${trip.plate_number}, GPS ${trip.freshness}`);
  element.innerHTML = `<span aria-hidden="true">🚚</span>`;
  return element;
}

export function PartnerLiveOperationsMap({ trips }: { trips: PartnerLiveTrip[] }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!container.current || mapRef.current || !mapTilerKey) return;
    const map = new maplibregl.Map({ container: container.current, style, center: [39.6, 8.8], zoom: 6 });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    return () => {
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];
    const located = trips.filter((trip) => trip.truck_lng != null && trip.truck_lat != null);
    if (!located.length) return;

    const bounds = new maplibregl.LngLatBounds();
    located.forEach((trip) => {
      const lngLat: [number, number] = [trip.truck_lng as number, trip.truck_lat as number];
      const popup = new maplibregl.Popup({ offset: 24 }).setHTML(
        `<strong>${trip.plate_number}</strong><br/>${trip.driver_name}<br/>Trip ${trip.reference}<br/>GPS ${trip.freshness}<br/>Speed ${trip.speed_kmh == null ? "—" : Math.round(trip.speed_kmh) + " km/h"} · Heading ${trip.heading == null ? "—" : Math.round(trip.heading) + "°"}`,
      );
      markers.current.push(new maplibregl.Marker({ element: markerElement(trip), anchor: "center" }).setLngLat(lngLat).setPopup(popup).addTo(map));
      bounds.extend(lngLat);
    });
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 55, maxZoom: 12 });
  }, [trips]);

  if (!mapTilerKey) return <p className="border border-route/30 bg-route/5 p-4 text-sm text-route">Map key is not configured.</p>;
  return <div ref={container} className="h-[420px] min-h-72 w-full border border-asphalt/10 bg-bone" aria-label="Partner live fleet map" />;
}
