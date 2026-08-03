import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

interface LiveMapProps {
  pickup?: [number, number];
  dropoff?: [number, number];
  truckPosition?: [number, number] | null;
}

const MAP_STYLE = "https://api.maptiler.com/maps/basic-v2/style.json?key=" +
  (import.meta.env.VITE_MAPTILER_KEY as string);

export function LiveMap({ pickup, dropoff, truckPosition }: LiveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const truckMarkerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: pickup ?? [39.27, 8.54], // Adama default
      zoom: 7,
    });
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pickup || !dropoff) return;

    map.on("load", () => {
      new maplibregl.Marker({ color: "#1C2128" }).setLngLat(pickup).addTo(map);
      new maplibregl.Marker({ color: "#FF5A1F" }).setLngLat(dropoff).addTo(map);

      map.addSource("route-line", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: [pickup, dropoff] },
        },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route-line",
        paint: {
          "line-color": "#E8A33D",
          "line-width": 2,
          "line-dasharray": [2, 2],
        },
      });

      const bounds = new maplibregl.LngLatBounds(pickup, pickup).extend(dropoff);
      map.fitBounds(bounds, { padding: 60 });
    });
  }, [pickup, dropoff]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !truckPosition) return;

    if (!truckMarkerRef.current) {
      const el = document.createElement("div");
      el.style.width = "16px";
      el.style.height = "16px";
      el.style.borderRadius = "3px";
      el.style.background = "#FF5A1F";
      el.style.border = "2px solid #1C2128";
      truckMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat(truckPosition)
        .addTo(map);
    } else {
      truckMarkerRef.current.setLngLat(truckPosition);
    }
    map.easeTo({ center: truckPosition });
  }, [truckPosition]);

  return <div ref={containerRef} className="w-full h-full" />;
}
