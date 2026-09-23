import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { DriverNavigationRoute } from "./driver-active-trip.model";

const mapTilerKey = import.meta.env.VITE_MAPTILER_KEY?.trim();
const mapStyle = mapTilerKey
  ? `https://api.maptiler.com/maps/basic-v2/style.json?key=${encodeURIComponent(mapTilerKey)}`
  : "https://tiles.openfreemap.org/styles/liberty";

function pointElement(kind: "start" | "end" | "driver") {
  const element = document.createElement("div");
  element.className = kind === "driver" ? "h-9 w-9 rounded-full border-4 border-white bg-halo-blue shadow-lg" : kind === "start" ? "h-5 w-5 rounded-full border-4 border-white bg-emerald-600 shadow" : "h-5 w-5 rounded-full border-4 border-white bg-red-500 shadow";
  return element;
}

export function DriverActiveTripMap({ route, driverPosition, ariaLabel }: { route: DriverNavigationRoute | null; driverPosition: [number, number] | null; ariaLabel: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const routeReadyRef = useRef(false);
  const startMarkerRef = useRef<maplibregl.Marker | null>(null);
  const endMarkerRef = useRef<maplibregl.Marker | null>(null);
  const driverMarkerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const fallback = route?.coordinates[0] ?? driverPosition ?? [38.7578, 9.0222];
    const map = new maplibregl.Map({ container: containerRef.current, style: mapStyle, center: fallback, zoom: route ? 11 : 6, attributionControl: false });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    const onLoad = () => { routeReadyRef.current = true; };
    map.on("load", onLoad);
    return () => { routeReadyRef.current = false; map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !route || route.coordinates.length < 2) return;
    const update = () => {
      const data: GeoJSON.Feature<GeoJSON.LineString> = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route.coordinates } };
      const source = map.getSource("driver-route") as maplibregl.GeoJSONSource | undefined;
      if (source) source.setData(data);
      else { map.addSource("driver-route", { type: "geojson", data }); map.addLayer({ id: "driver-route", type: "line", source: "driver-route", paint: { "line-color": "#0759c7", "line-width": 6, "line-opacity": 0.95 }, layout: { "line-cap": "round", "line-join": "round" } }); }
      const start = route.coordinates[0]; const end = route.coordinates[route.coordinates.length - 1];
      startMarkerRef.current?.remove(); endMarkerRef.current?.remove();
      startMarkerRef.current = new maplibregl.Marker({ element: pointElement("start") }).setLngLat(start).addTo(map);
      endMarkerRef.current = new maplibregl.Marker({ element: pointElement("end") }).setLngLat(end).addTo(map);
      const bounds = route.coordinates.reduce((box, point) => box.extend(point), new maplibregl.LngLatBounds(start, start));
      map.fitBounds(bounds, { padding: { top: 145, bottom: 250, left: 40, right: 40 }, maxZoom: 15, duration: 650 });
    };
    if (routeReadyRef.current) update(); else map.once("load", update);
  }, [route]);

  useEffect(() => {
    const map = mapRef.current; if (!map || !driverPosition) return;
    if (!driverMarkerRef.current) driverMarkerRef.current = new maplibregl.Marker({ element: pointElement("driver") }).setLngLat(driverPosition).addTo(map);
    else driverMarkerRef.current.setLngLat(driverPosition);
  }, [driverPosition]);

  return <div ref={containerRef} aria-label={ariaLabel} className="absolute inset-0" data-driver-real-map />;
}
