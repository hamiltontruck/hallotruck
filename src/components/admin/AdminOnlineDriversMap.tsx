import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { classifyTrackingFreshness, type TrackingFreshness } from "../../domain/tracking-freshness";
import { supabase } from "../../services/supabase.client";
import type { AdminOrder, Driver, Truck } from "../../services/admin.service";

type PresenceRow = {
  driver_id: string;
  is_available: boolean;
  accuracy_m: number | null;
  updated_at: string;
  location: { type?: string; coordinates?: number[] } | string | null;
};
type DriverTruckRow = Pick<Truck, "id" | "plate_number" | "vehicle_type"> & { driver_id: string | null };
type TripTelemetry = { recordedAt: string | null; speedKmh: number | null; heading: number | null };
type DriverPoint = PresenceRow & { lng: number; lat: number; freshness: TrackingFreshness; telemetry: TripTelemetry | null };

const mapTilerKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;
const mapStyle = `https://api.maptiler.com/maps/basic-v2/style.json?key=${mapTilerKey ?? ""}`;

function ewkbPoint(value: string): [number, number] | null {
  if (!/^[0-9a-f]+$/i.test(value) || value.length < 42 || value.length % 2 !== 0) return null;
  try {
    const bytes = new Uint8Array(value.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
    const view = new DataView(bytes.buffer);
    const littleEndian = view.getUint8(0) === 1;
    const type = view.getUint32(1, littleEndian);
    if ((type & 0xff) !== 1) return null;
    const hasSrid = (type & 0x20000000) !== 0;
    const offset = hasSrid ? 9 : 5;
    if (bytes.byteLength < offset + 16) return null;
    const lng = view.getFloat64(offset, littleEndian);
    const lat = view.getFloat64(offset + 8, littleEndian);
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
  } catch { return null; }
}

function coordinates(location: PresenceRow["location"]): [number, number] | null {
  if (location && typeof location === "object" && Array.isArray(location.coordinates)) {
    const [lng, lat] = location.coordinates.map(Number);
    if (Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat];
  }
  if (typeof location === "string") {
    const match = location.match(/POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i);
    if (match) return [Number(match[1]), Number(match[2])];
    return ewkbPoint(location);
  }
  return null;
}

function ageLabel(value: string | null) {
  if (!value) return "No GPS received";
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return "Unknown update";
  const seconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function markerElement(freshness: TrackingFreshness) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-asphalt text-xs font-bold text-white shadow-lg";
  element.dataset.trackingFreshness = freshness;
  element.textContent = "🚚";
  return element;
}

function assignedTruck(driverId: string, orders: AdminOrder[], trucks: Truck[], driverTrucks: DriverTruckRow[]) {
  const assignment = orders.find((order) => order.driver_id === driverId && order.truck_id && ["accepted", "in_transit"].includes(order.status));
  if (assignment?.truck_id) return trucks.find((truck) => truck.id === assignment.truck_id);
  return driverTrucks.find((truck) => truck.driver_id === driverId);
}

function activeOrderForDriver(driverId: string, orders: AdminOrder[]) {
  return orders.find((order) => order.driver_id === driverId && ["accepted", "in_transit"].includes(order.status));
}

function telemetryText(telemetry: TripTelemetry | null) {
  if (!telemetry) return "Speed — · Heading —";
  const speed = telemetry.speedKmh == null ? "—" : `${Math.round(telemetry.speedKmh)} km/h`;
  const heading = telemetry.heading == null ? "—" : `${Math.round(telemetry.heading)}°`;
  return `Speed ${speed} · Heading ${heading}`;
}

export function AdminOnlineDriversMap({ drivers, trucks, orders }: { drivers: Driver[]; trucks: Truck[]; orders: AdminOrder[] }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const [presence, setPresence] = useState<PresenceRow[]>([]);
  const [driverTrucks, setDriverTrucks] = useState<DriverTruckRow[]>([]);
  const [telemetryByDriver, setTelemetryByDriver] = useState<Record<string, TripTelemetry>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const activeAssignments = orders.filter((order) => order.driver_id && ["accepted", "in_transit"].includes(order.status));
      const [presenceResult, trucksResult, telemetryResults] = await Promise.all([
        supabase.from("driver_presence").select("driver_id,is_available,accuracy_m,updated_at,location").order("updated_at", { ascending: false }),
        supabase.from("trucks").select("id,plate_number,vehicle_type,driver_id").not("driver_id", "is", null),
        Promise.all(activeAssignments.map(async (order) => {
          const result = await supabase.rpc("customer_get_live_trip", { p_order_id: order.id });
          return { driverId: order.driver_id!, result };
        })),
      ]);
      if (cancelled) return;
      const queryError = presenceResult.error || trucksResult.error;
      if (queryError) { setError(queryError.message); return; }
      setError("");
      setPresence((presenceResult.data ?? []) as PresenceRow[]);
      setDriverTrucks((trucksResult.data ?? []) as DriverTruckRow[]);
      const nextTelemetry: Record<string, TripTelemetry> = {};
      telemetryResults.forEach(({ driverId, result }) => {
        if (result.error) return;
        const row = (result.data?.[0] ?? null) as { recorded_at?: string | null; speed_kmh?: number | null; heading?: number | null } | null;
        if (!row) return;
        nextTelemetry[driverId] = {
          recordedAt: row.recorded_at ?? null,
          speedKmh: row.speed_kmh == null ? null : Number(row.speed_kmh),
          heading: row.heading == null ? null : Number(row.heading),
        };
      });
      setTelemetryByDriver(nextTelemetry);
    }
    void load();
    const interval = window.setInterval(() => void load(), 8000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [orders]);

  const points = useMemo<DriverPoint[]>(() => presence.flatMap((row) => {
    const point = coordinates(row.location);
    if (!point) return [];
    const telemetry = telemetryByDriver[row.driver_id] ?? null;
    const freshnessAt = telemetry?.recordedAt ?? row.updated_at;
    return [{ ...row, lng: point[0], lat: point[1], freshness: classifyTrackingFreshness(freshnessAt), telemetry }];
  }), [presence, telemetryByDriver]);
  const visible = points.filter((point) => point.freshness !== "OFFLINE");
  const liveCount = visible.filter((point) => point.freshness === "LIVE").length;
  const availableCount = visible.filter((point) => point.is_available).length;

  useEffect(() => {
    if (!container.current || mapRef.current || !mapTilerKey) return;
    const map = new maplibregl.Map({ container: container.current, style: mapStyle, center: [39.6, 8.8], zoom: 6 });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    return () => { markers.current.forEach((marker) => marker.remove()); markers.current = []; map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markers.current.forEach((marker) => marker.remove());
    markers.current = visible.map((point) => {
      const driver = drivers.find((item) => item.id === point.driver_id);
      const truck = assignedTruck(point.driver_id, orders, trucks, driverTrucks);
      const activeOrder = activeOrderForDriver(point.driver_id, orders);
      const updateAt = point.telemetry?.recordedAt ?? point.updated_at;
      const popup = new maplibregl.Popup({ offset: 18 }).setHTML(
        `<strong>${driver?.full_name ?? "Driver"}</strong><br/>${driver?.phone ?? "Phone unavailable"}<br/>${truck?.plate_number ?? truck?.vehicle_type ?? "Truck unavailable"}<br/>GPS ${point.freshness} · ${ageLabel(updateAt)}<br/>${telemetryText(point.telemetry)}<br/>${activeOrder ? `Trip ${activeOrder.tracking_id}` : "No active trip"}<br/>${point.is_available ? "Available for dispatch" : "Not available"}`,
      );
      return new maplibregl.Marker({ element: markerElement(point.freshness), anchor: "center" }).setLngLat([point.lng, point.lat]).setPopup(popup).addTo(map);
    });
    if (visible.length) {
      const bounds = new maplibregl.LngLatBounds([visible[0].lng, visible[0].lat], [visible[0].lng, visible[0].lat]);
      visible.slice(1).forEach((point) => bounds.extend([point.lng, point.lat]));
      map.fitBounds(bounds, { padding: 55, maxZoom: 12 });
    }
  }, [visible, drivers, trucks, orders, driverTrucks]);

  return <section className="mb-5 overflow-hidden rounded-2xl border border-asphalt/10 bg-white" aria-label="Online drivers live fleet">
    <div className="flex flex-col gap-3 border-b border-asphalt/10 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div><p className="font-mono text-[10px] tracking-[.18em] text-emerald-700">LIVE FLEET</p><h2 className="mt-1 font-display text-lg font-semibold">Online drivers</h2><p className="mt-1 text-xs text-steel">Current and recently active driver presence. Active-trip speed and heading use the existing secured live-trip telemetry.</p></div>
      <div className="flex flex-wrap gap-2 text-[10px] font-semibold"><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700">{liveCount} LIVE</span><span className="rounded-full bg-amber/15 px-3 py-1.5 text-amber-dim">{availableCount} AVAILABLE</span><span className="rounded-full bg-bone px-3 py-1.5 text-steel">{visible.length} ON MAP</span></div>
    </div>
    {error && <p role="alert" className="border-b border-route/20 bg-route/5 p-4 text-xs text-route">Unable to load driver presence: {error}</p>}
    {!mapTilerKey ? <p className="p-5 text-sm text-route">Map key is not configured.</p> : <div ref={container} className="h-[420px] w-full bg-bone" />}
    <div className="grid gap-2 border-t border-asphalt/10 p-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
      {visible.slice(0, 9).map((point) => {
        const driver = drivers.find((item) => item.id === point.driver_id);
        const truck = assignedTruck(point.driver_id, orders, trucks, driverTrucks);
        const activeOrder = activeOrderForDriver(point.driver_id, orders);
        const updateAt = point.telemetry?.recordedAt ?? point.updated_at;
        return <div key={point.driver_id} className="rounded-xl bg-bone p-3 text-xs"><div className="flex items-center justify-between gap-2"><strong className="truncate">{driver?.full_name ?? driver?.phone ?? "Driver"}</strong><span className={point.freshness === "LIVE" ? "text-emerald-700" : "text-amber-dim"}>{point.freshness}</span></div><p className="mt-1 truncate text-steel">{truck?.plate_number ?? truck?.vehicle_type ?? "Truck unavailable"} · {ageLabel(updateAt)}</p><p className="mt-1 text-steel">{telemetryText(point.telemetry)}</p><p className="mt-1 truncate text-steel">{activeOrder ? `Trip ${activeOrder.tracking_id}` : "No active trip"} · {point.is_available ? "Available for dispatch" : "Not available"}</p></div>;
      })}
      {!visible.length && !error && <p className="text-sm text-steel">No current or recently active driver locations.</p>}
    </div>
  </section>;
}
