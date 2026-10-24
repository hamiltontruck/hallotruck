import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { PartnerLiveTrip } from "../../services/partner-live-operations.service";
import { isLocatedTrip } from "../../domain/partner-operations";

const mapTilerKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;
const style = `https://api.maptiler.com/maps/basic-v2/style.json?key=${mapTilerKey ?? ""}`;

export function PartnerLiveOperationsMap({ trips, selectedTripId = null, focusRequest = 0, onSelectTrip }: { trips: PartnerLiveTrip[]; selectedTripId?: string | null; focusRequest?: number; onSelectTrip?: (id: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const initiallyFitted = useRef(false);
  const focused = useRef<string | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!container.current || !mapTilerKey) return;
    let map: maplibregl.Map | null = null;
    try {
      map = new maplibregl.Map({ container: container.current, style, center: [39.6, 8.8], zoom: 6 });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.on("error", () => setError("Map tiles could not be loaded. Check your connection or retry the map."));
      map.on("load", () => setError(""));
      mapRef.current = map;
    } catch { setError("The map could not start on this device. Trip details remain available below."); }
    return () => {
      markers.current.forEach(marker => marker.remove()); markers.current = [];
      map?.remove(); mapRef.current = null; initiallyFitted.current = false; focused.current = null;
    };
  }, [version]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markers.current.forEach(marker => marker.remove()); markers.current = [];
    const located = trips.filter(isLocatedTrip);
    const bounds = new maplibregl.LngLatBounds();
    for (const trip of located) {
      const position: [number, number] = [trip.truck_lng as number, trip.truck_lat as number];
      const element = document.createElement("button");
      element.type = "button"; element.textContent = "🚚";
      element.className = `grid h-11 w-11 place-items-center rounded-full border-2 border-white text-lg shadow-lg ${trip.order_id === selectedTripId ? "bg-amber text-asphalt" : "bg-asphalt text-white"}`;
      element.dataset.trackingFreshness = trip.freshness;
      element.setAttribute("aria-label", `${trip.plate_number}, GPS ${trip.freshness}`);
      element.setAttribute("aria-pressed", String(trip.order_id === selectedTripId));
      element.addEventListener("click", event => { event.stopPropagation(); onSelectTrip?.(trip.order_id); });
      const content = document.createElement("div");
      const name = document.createElement("strong"); name.textContent = trip.plate_number; content.append(name);
      for (const label of [trip.driver_name, `Trip ${trip.reference}`, `GPS ${trip.freshness}`, `Speed ${trip.speed_kmh == null ? "—" : `${Math.round(trip.speed_kmh)} km/h`}`]) {
        const line = document.createElement("p"); line.textContent = label; content.append(line);
      }
      const popup = new maplibregl.Popup({ offset: 24 }).setDOMContent(content);
      markers.current.push(new maplibregl.Marker({ element, anchor: "center" }).setLngLat(position).setPopup(popup).addTo(map));
      bounds.extend(position);
    }
    if (located.length && !initiallyFitted.current) { map.fitBounds(bounds, { padding: 55, maxZoom: 12 }); initiallyFitted.current = true; }
  }, [trips, selectedTripId, onSelectTrip, version]);
  useEffect(() => {
    const trip = trips.find(row => row.order_id === selectedTripId && isLocatedTrip(row));
    if (!trip) { focused.current = null; return; }
    const requestKey = `${selectedTripId}:${focusRequest}`;
    if (focused.current !== requestKey) {
      mapRef.current?.easeTo({ center: [trip.truck_lng as number, trip.truck_lat as number], zoom: 12 });
      focused.current = requestKey;
    }
  }, [trips, selectedTripId, focusRequest, version]);
  if (!mapTilerKey) return <p role="alert" className="border border-route/30 bg-white p-4 text-sm text-route">Map key is not configured. Trip details remain available.</p>;
  return <section className="space-y-2">{error && <div role="alert" className="border border-route/30 bg-white p-3 text-sm text-route"><p>{error}</p><button className="mt-2 min-h-11 border px-3" onClick={() => { setError(""); setVersion(value => value + 1); }}>Retry map</button></div>}<div ref={container} className="h-[420px] min-h-72 w-full border border-asphalt/10 bg-bone" aria-label="Partner live fleet map" /></section>;
}
