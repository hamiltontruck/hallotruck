import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { DriverNavigationRoute } from "./driver-active-trip.model";
import { buildDriverRouteFeature, runWhenDriverMapStyleReady, updateDriverMarkerAndFollow } from "./driver-active-trip-map-runtime";
import { nextDriverMapStyleAfterFailure } from "./driver-runtime-resilience";

const mapTilerKey = import.meta.env.VITE_MAPTILER_KEY?.trim();
const openFreeMapStyle = "https://tiles.openfreemap.org/styles/liberty";
const mapLibreDemoStyle = "https://demotiles.maplibre.org/style.json";
const mapStyles: string[] = mapTilerKey
  ? [`https://api.maptiler.com/maps/basic-v2/style.json?key=${encodeURIComponent(mapTilerKey)}`, openFreeMapStyle, mapLibreDemoStyle]
  : [openFreeMapStyle, mapLibreDemoStyle];
type MapRuntimeStatus = "empty" | "loading" | "ready" | "error";
const MAP_LOAD_TIMEOUT_MS = 12_000;

function pointElement(kind: "start" | "end" | "driver") {
  const element = document.createElement("div");
  element.className = kind === "driver"
    ? "h-9 w-9 rounded-full border-4 border-white bg-halo-blue shadow-lg"
    : kind === "start"
      ? "h-5 w-5 rounded-full border-4 border-white bg-emerald-600 shadow"
      : "h-5 w-5 rounded-full border-4 border-white bg-red-500 shadow";
  return element;
}

function keepMapControlsVisible(container: HTMLElement) {
  for (const selector of [".maplibregl-ctrl-top-right", ".maplibregl-ctrl-top-left"]) {
    const corner = container.querySelector<HTMLElement>(selector);
    if (!corner) continue;
    corner.style.top = "148px";
  }
}

export function DriverActiveTripMap({ route, driverPosition, ariaLabel, loadingLabel, errorLabel, emptyLabel }: {
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
  const fallbackIndexRef = useRef(0);
  const initialBoundsFitRef = useRef(false);
  const startMarkerRef = useRef<maplibregl.Marker | null>(null);
  const endMarkerRef = useRef<maplibregl.Marker | null>(null);
  const driverMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [mapStatus, setMapStatus] = useState<MapRuntimeStatus>("loading");

  useEffect(() => { routeRef.current = route; }, [route]);
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    setMapStatus("loading");
    let resizeObserver: ResizeObserver | null = null;
    let map: maplibregl.Map | null = null;
    let cancelled = false;
    let loadTimeout: number | null = null;
    let switchingStyle = false;
    let loaded = false;
    const resize = () => map?.resize();
    const clearLoadTimeout = () => {
      if (loadTimeout === null) return;
      window.clearTimeout(loadTimeout);
      loadTimeout = null;
    };
    const failOrFallback = () => {
      if (!map || cancelled || switchingStyle) return;
      const nextIndex = nextDriverMapStyleAfterFailure(fallbackIndexRef.current, mapStyles.length);
      if (nextIndex === null) {
        clearLoadTimeout();
        setMapStatus("error");
        return;
      }
      switchingStyle = true;
      fallbackIndexRef.current = nextIndex;
      setMapStatus("loading");
      map.setStyle(mapStyles[nextIndex]);
      clearLoadTimeout();
      loadTimeout = window.setTimeout(() => {
        switchingStyle = false;
        failOrFallback();
      }, MAP_LOAD_TIMEOUT_MS);
    };
    const armLoadTimeout = () => {
      clearLoadTimeout();
      loadTimeout = window.setTimeout(failOrFallback, MAP_LOAD_TIMEOUT_MS);
    };
    const container = containerRef.current;
    const realCenter = routeRef.current?.coordinates[0] ?? driverPosition ?? [39.27, 8.54];
    fallbackIndexRef.current = 0;
    try {
      map = new maplibregl.Map({
        container,
        style: mapStyles[0],
        center: realCenter,
        zoom: routeRef.current ? 11 : driverPosition ? 13 : 12,
        attributionControl: false,
      });
    } catch {
      setMapStatus("error");
      return;
    }

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "top-left");
    keepMapControlsVisible(container);
    mapRef.current = map;

    const onStyleLoad = () => {
      loaded = true;
      switchingStyle = false;
      clearLoadTimeout();
      map?.resize();
      keepMapControlsVisible(container);
      setMapStatus("ready");
    };
    const onIdle = () => {
      if (!loaded) return;
      setMapStatus("ready");
    };
    const onStyleData = () => map?.resize();
    const onError = () => {
      if (map?.isStyleLoaded()) return;
      if (loaded) return;
      failOrFallback();
    };
    map.on("load", onStyleLoad);
    map.on("style.load", onStyleLoad);
    map.on("idle", onIdle);
    map.on("styledata", onStyleData);
    map.on("error", onError);
    armLoadTimeout();

    resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(resize)
      : null;
    resizeObserver?.observe(container);
    window.addEventListener("resize", resize);
    return () => {
      cancelled = true;
      clearLoadTimeout();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", resize);
      map?.remove();
      mapRef.current = null;
      initialBoundsFitRef.current = false;
      startMarkerRef.current = null;
      endMarkerRef.current = null;
      driverMarkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !route || route.coordinates.length < 2) return;
    const update = () => {
      if (!map.isStyleLoaded()) return;
      const data = buildDriverRouteFeature(route.coordinates);
      const source = map.getSource("driver-route") as maplibregl.GeoJSONSource | undefined;
      if (source) source.setData(data);
      else {
        map.addSource("driver-route", { type: "geojson", data });
        map.addLayer({ id: "driver-route", type: "line", source: "driver-route", paint: { "line-color": "#0759c7", "line-width": 6, "line-opacity": 0.95 }, layout: { "line-cap": "round", "line-join": "round" } });
      }
      const start = route.coordinates[0];
      const end = route.coordinates[route.coordinates.length - 1];
      startMarkerRef.current?.remove();
      endMarkerRef.current?.remove();
      startMarkerRef.current = new maplibregl.Marker({ element: pointElement("start") }).setLngLat(start).addTo(map);
      endMarkerRef.current = new maplibregl.Marker({ element: pointElement("end") }).setLngLat(end).addTo(map);
      if (!initialBoundsFitRef.current) {
        const bounds = route.coordinates.reduce((box, point) => box.extend(point), new maplibregl.LngLatBounds(start, start));
        map.fitBounds(bounds, { padding: { top: 170, bottom: 250, left: 40, right: 40 }, maxZoom: 15, duration: 650 });
        initialBoundsFitRef.current = true;
      }
    };
    const cancelReady = runWhenDriverMapStyleReady(map, update);
    map.on("style.load", update);
    return () => { cancelReady(); map.off("style.load", update); };
  }, [route]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !driverPosition) return;
    return runWhenDriverMapStyleReady(map, () => {
      if (!driverMarkerRef.current) {
        driverMarkerRef.current = new maplibregl.Marker({ element: pointElement("driver") }).setLngLat(driverPosition).addTo(map);
        return;
      }
      updateDriverMarkerAndFollow(driverMarkerRef.current, map, driverPosition);
    });
  }, [driverPosition]);

  return (
    <div className="absolute inset-0 min-h-[420px]" data-driver-map-shell data-driver-map-status={mapStatus}>
      <div ref={containerRef} aria-label={ariaLabel} className="absolute inset-0 h-full w-full" data-driver-real-map />
      {mapStatus === "loading" ? <div className="pointer-events-none absolute inset-0 grid place-items-center bg-slate-100/65 px-6 text-center text-xs font-semibold text-slate-600" role="status">{loadingLabel}</div> : null}
      {mapStatus === "error" ? <div role="alert" className="pointer-events-none absolute inset-x-4 top-4 rounded-xl bg-white/95 px-3 py-2 text-xs font-semibold text-red-700 shadow">{errorLabel}</div> : null}
      {mapStatus === "empty" ? <div className="pointer-events-none absolute inset-0 grid place-items-center bg-slate-100 px-6 text-center text-xs font-semibold text-slate-600">{emptyLabel}</div> : null}
    </div>
  );
}
