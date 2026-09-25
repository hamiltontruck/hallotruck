import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { DriverNavigationRoute } from "./driver-active-trip.model";
import {
  buildDriverRouteFeature,
  isVisibleDriverMapViewport,
  updateDriverMarkerAndFollow,
} from "./driver-active-trip-map-runtime";

const mapTilerKey = import.meta.env.VITE_MAPTILER_KEY?.trim();
const openFreeMapStyle = "https://tiles.openfreemap.org/styles/liberty";
const mapStyles: string[] = mapTilerKey
  ? [`https://api.maptiler.com/maps/basic-v2/style.json?key=${encodeURIComponent(mapTilerKey)}`, openFreeMapStyle]
  : [openFreeMapStyle];

type MapRuntimeStatus = "empty" | "loading" | "ready" | "error";

function pointElement(kind: "start" | "end" | "driver") {
  const element = document.createElement("div");
  element.className = kind === "driver"
    ? "h-9 w-9 rounded-full border-4 border-white bg-halo-blue shadow-lg"
    : kind === "start"
      ? "h-5 w-5 rounded-full border-4 border-white bg-emerald-600 shadow"
      : "h-5 w-5 rounded-full border-4 border-white bg-red-500 shadow";
  return element;
}

export function DriverActiveTripMap({
  route,
  driverPosition,
  ariaLabel,
  loadingLabel,
  errorLabel,
  emptyLabel,
}: {
  route: DriverNavigationRoute | null;
  driverPosition: [number, number] | null;
  ariaLabel: string;
  loadingLabel: string;
  errorLabel: string;
  emptyLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const routeRef = useRef<DriverNavigationRoute | null>(route);
  const driverPositionRef = useRef<[number, number] | null>(driverPosition);
  const fallbackIndexRef = useRef(0);
  const mapLoadedRef = useRef(false);
  const initialBoundsFitRef = useRef(false);
  const startMarkerRef = useRef<maplibregl.Marker | null>(null);
  const endMarkerRef = useRef<maplibregl.Marker | null>(null);
  const driverMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [mapStatus, setMapStatus] = useState<MapRuntimeStatus>(
    route?.coordinates[0] || driverPosition ? "loading" : "empty",
  );

  const hasRealAnchor = useMemo(
    () => Boolean(route?.coordinates[0] || driverPosition),
    [route, driverPosition],
  );

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  useEffect(() => {
    driverPositionRef.current = driverPosition;
  }, [driverPosition]);

  useEffect(() => {
    if (!hasRealAnchor) {
      if (!mapRef.current) setMapStatus("empty");
      return;
    }
    if (!containerRef.current || mapRef.current) return;

    setMapStatus("loading");
    let resizeObserver: ResizeObserver | null = null;
    let map: maplibregl.Map | null = null;
    let cancelled = false;

    const resize = () => map?.resize();
    const initialize = () => {
      const container = containerRef.current;
      if (cancelled || !container || mapRef.current) return;
      const rect = container.getBoundingClientRect();
      if (!isVisibleDriverMapViewport({ width: rect.width, height: rect.height })) return;

      const realCenter = routeRef.current?.coordinates[0] ?? driverPositionRef.current;
      if (!realCenter) {
        setMapStatus("empty");
        return;
      }

      fallbackIndexRef.current = 0;
      mapLoadedRef.current = false;
      try {
        map = new maplibregl.Map({
          container,
          style: mapStyles[0],
          center: realCenter,
          zoom: routeRef.current ? 11 : 13,
          attributionControl: false,
        });
      } catch {
        setMapStatus("error");
        return;
      }

      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
      mapRef.current = map;

      const onLoad = () => {
        mapLoadedRef.current = true;
        map?.resize();
        setMapStatus("ready");
      };
      const onStyleData = () => map?.resize();
      const onError = () => {
        if (mapLoadedRef.current || !map) return;
        if (fallbackIndexRef.current < mapStyles.length - 1) {
          fallbackIndexRef.current += 1;
          map.setStyle(mapStyles[fallbackIndexRef.current]);
          return;
        }
        setMapStatus("error");
      };

      map.on("load", onLoad);
      map.on("styledata", onStyleData);
      map.on("error", onError);
    };

    resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          if (mapRef.current) resize();
          else initialize();
        })
      : null;
    resizeObserver?.observe(containerRef.current);
    window.addEventListener("resize", resize);
    initialize();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      window.removeEventListener("resize", resize);
      map?.remove();
      mapRef.current = null;
      mapLoadedRef.current = false;
      initialBoundsFitRef.current = false;
      startMarkerRef.current = null;
      endMarkerRef.current = null;
      driverMarkerRef.current = null;
    };
  }, [hasRealAnchor]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapStatus !== "ready" || !route || route.coordinates.length < 2) return;

    const update = () => {
      if (!map.isStyleLoaded()) return;
      const data = buildDriverRouteFeature(route.coordinates);
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

      if (!initialBoundsFitRef.current) {
        const bounds = route.coordinates.reduce(
          (box, point) => box.extend(point),
          new maplibregl.LngLatBounds(start, start),
        );
        map.fitBounds(bounds, {
          padding: { top: 145, bottom: 250, left: 40, right: 40 },
          maxZoom: 15,
          duration: 650,
        });
        initialBoundsFitRef.current = true;
      }
    };

    update();
    map.on("styledata", update);
    return () => { map.off("styledata", update); };
  }, [route, mapStatus]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapStatus !== "ready" || !driverPosition) return;
    if (!driverMarkerRef.current) {
      driverMarkerRef.current = new maplibregl.Marker({ element: pointElement("driver") })
        .setLngLat(driverPosition)
        .addTo(map);
      return;
    }
    updateDriverMarkerAndFollow(driverMarkerRef.current, map, driverPosition);
  }, [driverPosition, mapStatus]);

  return (
    <div className="absolute inset-0" data-driver-map-shell data-driver-map-status={mapStatus}>
      <div ref={containerRef} aria-label={ariaLabel} className="absolute inset-0" data-driver-real-map />
      {mapStatus === "loading" ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-slate-100/65 px-6 text-center text-xs font-semibold text-slate-600" role="status">
          {loadingLabel}
        </div>
      ) : null}
      {mapStatus === "error" ? (
        <div role="alert" className="pointer-events-none absolute inset-x-4 top-4 rounded-xl bg-white/95 px-3 py-2 text-xs font-semibold text-red-700 shadow">
          {errorLabel}
        </div>
      ) : null}
      {mapStatus === "empty" ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-slate-100 px-6 text-center text-xs font-semibold text-slate-600">
          {emptyLabel}
        </div>
      ) : null}
    </div>
  );
}
