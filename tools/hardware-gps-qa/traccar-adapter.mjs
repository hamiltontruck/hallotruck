// QA-only, side-effect-free Traccar position adapter. No Supabase access.
export function normalizeTraccarPosition(position, devices, truckMappings, now = new Date()) {
  if (!position || typeof position !== "object") throw new Error("position_required");
  const device = devices.find((d) => d.id === position.deviceId);
  if (!device || typeof device.uniqueId !== "string") throw new Error("unknown_device");
  const matches = truckMappings.filter((m) => m.gps_provider === "traccar" && m.gps_external_id === device.uniqueId);
  if (matches.length !== 1 || !matches[0].truck_id) throw new Error("invalid_truck_mapping");
  const latitude = Number(position.latitude), longitude = Number(position.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error("invalid_coordinates");
  const fixTime = new Date(position.fixTime);
  if (!Number.isFinite(fixTime.getTime())) throw new Error("invalid_timestamp");
  const ageMs = now.getTime() - fixTime.getTime();
  if (ageMs < -300000 || ageMs > 86400000) throw new Error("timestamp_out_of_range");
  const speedKmh = position.speed == null ? null : Number(position.speed) * 1.852; // Traccar speed is knots
  if (speedKmh !== null && (!Number.isFinite(speedKmh) || speedKmh < 0 || speedKmh > 250)) throw new Error("invalid_speed");
  const heading = position.course == null ? null : Number(position.course);
  if (heading !== null && (!Number.isFinite(heading) || heading < 0 || heading >= 360)) throw new Error("invalid_heading");
  const ignition = position.attributes?.ignition;
  return Object.freeze({
    source: "hardware", provider: "traccar",
    device_id: device.uniqueId, truck_id: matches[0].truck_id,
    latitude, longitude, speed_kmh: speedKmh, heading,
    ignition: typeof ignition === "boolean" ? ignition : null,
    source_recorded_at: fixTime.toISOString(),
    freshness: ageMs <= 60000 ? "LIVE" : ageMs <= 300000 ? "STALE" : "OFFLINE",
  });
}
// Pure QA adapter: deliberately does not create tracking_pings, start trips,
// call record_driver_tracking_ping, or publish any GPS data.
