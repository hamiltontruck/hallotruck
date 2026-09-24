import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { DriverNavigationRoute } from "./driver-active-trip.model";

const mapTilerKey = import.meta.env.VITE_MAPTILER_KEY?.trim();
const openFreeMapStyle = "https://tiles.openfreemap.org/styles/liberty";
const osmRasterStyle: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    "osm-raster": {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm-raster", type: "raster", source: "osm-raster" }],
};
const mapStyles: Array<string | maplibregl.StyleSpecification> = mapTilerKey
  ? [`https://api.maptiler.com/maps/basic-v2/style.json?key=${encodeURIComponent(mapTilerKey)}`, openFreeMapStyle, osmRasterStyle]
  : [openFreeMapStyle, osmRasterStyle];

function pointElement(kind: "start" | "end" | "driver") {
  const element = document.createElement("div");
  element.className = kind === "driver"
    ? "h-9 w-9 rounded-full border-4 border-white bg-halo-blue shadow-lg"
    : kind === "start"
      ? "h-5 w-5 rounded-full border-4 border-white bg-emerald-600 shadow"
      : "h-5 w-5 rounded-full border-4 border-white bg-red-500 shadow";
  return element;
}

export function DriverActiveTripMap({ route, driverPosition, ariaLabel }: {
  route: DriverNavigationRoute | null;
  driverPosition: [number, number] | null;
  ariaLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const routeRef = useRef<DriverNavigationRoute | null>(route);
  const fallbackIndexRef = useRef(0);
  const startMarkerRef = useRef<maplibregl.Marker | null>(null);
  const endMarkerRef = useRef<maplibregl.Marker | null>(null);
  const driverMarkerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const fallback = routeRef.current?.coordinates[0] ?? driverPosition ?? [38.7578, 9.0222];
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyles[0],
      center: fallback,
      zoom: routeRef.current ? 11 : 6,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    const resize = () => map.resize();
    const observer = typeof ResizeObserver !== "undefined" && containerRef.current
      ? new ResizeObserver(resize)
      : null;
    observer?.observe(containerRef.current);
    window.addEventListener("resize", resize);
    map.on("load", resize);
    map.on("styledata", resize);

    const onError = () => {
      if (fallbackIndexRef.current >= mapStyles.length - 1) return;
      fallbackIndexRef.current += 1;
      map.setStyle(mapStyles[fallbackIndexRef.current]);
    };
    map.on("error", onError);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      map.off("error", onError);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !route || route.coordinates.length < 2) return;

    const update = () => {
      if (!map.isStyleLoaded()) return;
      const data: GeoJSON.Feature<GeoJSON.LineString> = {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: route.coordinates },
      };
      const source = map.getSource("driver-route") as maplibregl.GeoJSONSource | undefined;
      if (source) source.setData(data);
      else {
        map.addSource("driver-route", { type: "geojson", data });
        map.addLayer({
          id: "driver-route",
          type: "line",
          source: "driver-route",
          paint: { "line-color": "#0759c7", "line-width": 6, "line-opacity": 0.95 },
          layout: { "line-cap": "round", "line-join": "round" },
        });
      }
      const start = route.coordinates[0];
      const end = route.coordinates[route.coordinates.length - 1];
      startMarkerRef.current?.remove();
      endMarkerRef.current?.remove();
      startMarkerRef.current = new maplibregl.Marker({ element: pointElement("start") }).setLngLat(start).addTo(map);
      endMarkerRef.current = new maplibregl.Marker({ element: pointElement("end") }).setLngLat(end).addTo(map);
      const bounds = route.coordinates.reduce(
        (box, point) => box.extend(point),
        new maplibregl.LngLatBounds(start, start),
      );
      map.fitBounds(bounds, { padding: { top: 145, bottom: 250, left: 40, right: 40 }, maxZoom: 15, duration: 650 });
    };

    update();
    map.on("styledata", update);
    return () => { map.off("styledata", update); };
  }, [route]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !driverPosition) return;
    if (!driverMarkerRef.current) {
      driverMarkerRef.current = new maplibregl.Marker({ element: pointElement("driver") })
        .setLngLat(driverPosition)
        .addTo(map);
    } else {
      driverMarkerRef.current.setLngLat(driverPosition);
    }
  }, [driverPosition]);

  return <div ref={containerRef} aria-label={ariaLabel} className="absolute inset-0" data-driver-real-map />;
}
