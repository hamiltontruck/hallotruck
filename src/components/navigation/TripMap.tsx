import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

interface TripMapProps {
  routeGeometry: GeoJSON.LineString | null;
  driverPosition: [number, number] | null;
}

const MAP_STYLE =
  "https://api.maptiler.com/maps/basic-v2/style.json?key=" +
  (import.meta.env.VITE_MAPTILER_KEY as string);

export function TripMap({ routeGeometry, driverPosition }: TripMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const driverMarkerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: driverPosition ?? [39.27, 8.54],
      zoom: 12,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routeGeometry) return;
    const activeMap = map;

    function draw() {
      if (activeMap.getSource("trip-route")) {
        (activeMap.getSource("trip-route") as maplibregl.GeoJSONSource).setData({
          type: "Feature",
          properties: {},
          geometry: routeGeometry!,
        });
        return;
      }
      activeMap.addSource("trip-route", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: routeGeometry! },
      });
      activeMap.addLayer({
        id: "trip-route",
        type: "line",
        source: "trip-route",
        paint: { "line-color": "#FF5A1F", "line-width": 4 },
      });
      const coords = routeGeometry!.coordinates as [number, number][];
      const bounds = coords.reduce(
        (b, c) => b.extend(c),
        new maplibregl.LngLatBounds(coords[0], coords[0]),
      );
      activeMap.fitBounds(bounds, { padding: 50 });
    }

    if (map.isStyleLoaded()) draw();
    else map.once("load", draw);
  }, [routeGeometry]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !driverPosition) return;

    if (!driverMarkerRef.current) {
      const el = document.createElement("div");
      el.style.width = "16px";
      el.style.height = "16px";
      el.style.borderRadius = "50%";
      el.style.background = "#1C2128";
      el.style.border = "3px solid #E8A33D";
      driverMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat(driverPosition)
        .addTo(map);
    } else {
      driverMarkerRef.current.setLngLat(driverPosition);
    }
    map.easeTo({ center: driverPosition });
  }, [driverPosition]);

  return <div ref={containerRef} className="w-full h-full" />;
}
