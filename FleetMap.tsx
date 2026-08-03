import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { FleetPosition } from "../../services/admin.service";

const MAP_STYLE =
  "https://api.maptiler.com/maps/basic-v2/style.json?key=" +
  (import.meta.env.VITE_MAPTILER_KEY as string);

interface FleetMapProps {
  trucks: FleetPosition[];
}

export function FleetMap({ trucks }: FleetMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [39.27, 8.54], // Adama
      zoom: 6.5,
    });
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const activeIds = new Set(trucks.map((t) => t.order_id));

    // remove markers for trucks no longer active
    for (const [id, marker] of markersRef.current) {
      if (!activeIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    trucks.forEach((truck) => {
      if (truck.lng == null || truck.lat == null) return;
      const lngLat: [number, number] = [truck.lng, truck.lat];
      const existing = markersRef.current.get(truck.order_id);

      const popupHtml = `
        <div style="font-family:'JetBrains Mono',monospace;font-size:12px">
          <strong>${truck.tracking_id}</strong><br/>
          ${truck.driver_name ?? "Unassigned"}<br/>
          ${truck.status.replace("_", " ")}
        </div>`;

      if (existing) {
        existing.setLngLat(lngLat);
      } else {
        const el = document.createElement("div");
        el.style.width = "14px";
        el.style.height = "14px";
        el.style.borderRadius = "3px";
        el.style.background = truck.status === "in_transit" ? "#FF5A1F" : "#E8A33D";
        el.style.border = "2px solid #1C2128";
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat(lngLat)
          .setPopup(new maplibregl.Popup({ offset: 12 }).setHTML(popupHtml))
          .addTo(map);
        markersRef.current.set(truck.order_id, marker);
      }
    });
  }, [trucks]);

  return <div ref={containerRef} className="w-full h-full" />;
}
