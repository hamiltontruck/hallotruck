export interface HardwareGpsPosition {
  truck_id: string;
  plate_number: string;
  source: 'traccar';
  recorded_at: string | null;
  status: 'LIVE' | 'STALE' | 'OFFLINE';
  location: { latitude: number; longitude: number; speed_kmh: number; heading: number | null } | null;
}
export function preferHardware(position: HardwareGpsPosition | undefined, phoneTime: string | null | undefined): position is HardwareGpsPosition & { location: NonNullable<HardwareGpsPosition['location']>; recorded_at: string } {
  if (!position?.location || !position.recorded_at) return false;
  const timestamp = Date.parse(position.recorded_at);
  const phone = phoneTime ? Date.parse(phoneTime) : NaN;
  return Number.isFinite(timestamp) && timestamp <= Date.now() && (!Number.isFinite(phone) || timestamp >= phone);
}
