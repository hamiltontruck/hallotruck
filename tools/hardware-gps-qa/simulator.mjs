// Fake Traccar API positions for hardware-free QA; not a raw SinoTrack/H02 encoder.
export const fakeDevices = [{ id: 906, uniqueId: "QA-ST906L-0001" }];
export const fakeMappings = [{ truck_id: "qa-truck-001", gps_provider: "traccar", gps_external_id: "QA-ST906L-0001" }];
export function simulatedPosition({ time = new Date("2026-11-01T10:00:00.000Z"), lat = 8.54, lng = 39.27, knots = 20, ignition = true, deviceId = 906 } = {}) {
  return { deviceId, fixTime: time.toISOString(), latitude: lat, longitude: lng, speed: knots, course: 90, attributes: { ignition } };
}
