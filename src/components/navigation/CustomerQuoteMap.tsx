import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export interface QuotePoints {
  pickup: [number, number];
  dropoff: [number, number];
  distanceKm: number;
}

const style = "https://api.maptiler.com/maps/basic-v2/style.json?key=" + (import.meta.env.VITE_MAPTILER_KEY as string);

function distanceKm(a: [number, number], b: [number, number]) {
  const radians = (value: number) => value * Math.PI / 180;
  const lat1 = radians(a[1]);
  const lat2 = radians(b[1]);
  const dLat = radians(b[1] - a[1]);
  const dLng = radians(b[0] - a[0]);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function CustomerQuoteMap({ onChange }: { onChange: (points: QuotePoints | null) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const [points, setPoints] = useState<[number, number][]>([]);

  useEffect(() => {
    if (!container.current || map.current) return;
    const instance = new maplibregl.Map({ container: container.current, style, center: [39.6, 8.8], zoom: 5 });
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    instance.on("click", (event) => {
      setPoints((current) => current.length >= 2 ? [[event.lngLat.lng, event.lngLat.lat]] : [...current, [event.lngLat.lng, event.lngLat.lat]]);
    });
    map.current = instance;
    return () => { instance.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    markers.current.forEach((marker) => marker.remove());
    markers.current = points.map((point, index) => {
      const element = document.createElement("div");
      element.className = "grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-asphalt font-mono text-xs font-bold text-amber shadow-lg";
      element.textContent = index === 0 ? "P" : "D";
      return new maplibregl.Marker({ element }).setLngLat(point).addTo(instance);
    });

    if (points.length === 2) {
      const km = distanceKm(points[0], points[1]);
      onChange({ pickup: points[0], dropoff: points[1], distanceKm: Number((km * 1.18).toFixed(1)) });
      instance.fitBounds(new maplibregl.LngLatBounds(points[0], points[1]), { padding: 55 });
    } else {
      onChange(null);
    }
  }, [points, onChange]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs text-steel">{points.length === 0 ? "Tap pickup location" : points.length === 1 ? "Now tap drop-off location" : "Route points selected"}</p>
        {points.length > 0 && <button type="button" onClick={() => setPoints([])} className="text-xs font-semibold text-route">Reset map</button>}
      </div>
      <div ref={container} className="h-64 w-full border border-line bg-[#e9e5da]" />
      <p className="mt-2 text-[11px] text-steel">P = pickup · D = drop-off · initial quote includes an estimated road factor.</p>
    </div>
  );
}
