// QA-only read adapter: Traccar REST -> HALLO truck-shaped live map record.
// Never writes to Supabase, starts trips, or changes Driver V4.
export async function readHalloTruckLocation({ client, truck, now = Date.now() }) {
  if (!client || typeof client.latestAuthorized !== "function") throw new Error("Traccar client required");
  if (!truck || typeof truck.id !== "string" || !truck.id.trim()) throw new Error("Truck ID required");
  if (typeof truck.plate_number !== "string" || !truck.plate_number.trim()) throw new Error("Truck plate required");
  if (truck.gps_provider !== "traccar" || typeof truck.gps_external_id !== "string" || !truck.gps_external_id.trim()) throw new Error("Approved Traccar mapping required");
  if (!Number.isFinite(now)) throw new Error("Invalid clock");
  const point = await client.latestAuthorized({
    deviceUniqueId: truck.gps_external_id,
    truckMapping: { truck_id: truck.id, gps_provider: "traccar", gps_external_id: truck.gps_external_id }
  });
  if (!point) return { truck_id: truck.id, plate_number: truck.plate_number, status: "OFFLINE", location: null, recorded_at: null, source: "traccar" };
  if (point.truck_id !== truck.id || point.device_unique_id !== truck.gps_external_id || point.source !== "traccar") throw new Error("GPS mapping mismatch");
  const timestamp = Date.parse(point.fix_time);
  if (!Number.isFinite(timestamp) || timestamp > now + 300000) throw new Error("Invalid GPS timestamp");
  const lat = Number(point.latitude), lng = Number(point.longitude), speed = Number(point.speed_kmh);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180 || !Number.isFinite(speed) || speed < 0 || speed > 250) throw new Error("Invalid GPS coordinates or speed");
  const age = Math.max(0, now - timestamp);
  return {
    truck_id: truck.id,
    plate_number: truck.plate_number,
    status: age <= 60000 ? "LIVE" : age <= 900000 ? "STALE" : "OFFLINE",
    location: { latitude: lat, longitude: lng, speed_kmh: speed, heading: point.heading ?? null },
    recorded_at: new Date(timestamp).toISOString(),
    source: "traccar"
  };
}
