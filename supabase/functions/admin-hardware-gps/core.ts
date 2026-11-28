type Row = Record<string, unknown>;
interface Dependencies {
  authorize(token: string): Promise<{ role?: string; driver_status?: string | null } | null>;
  loadTrucks(ids: string[]): Promise<Row[]>;
  readSnapshot(): Promise<{ devices: Row[]; positions: Row[] }>;
  now(): number;
}
const allowedOrigins = new Set(['https://hamiltontruck.github.io', 'https://hallotruck.netlify.app', 'http://localhost:5173']);
function allowed(origin: string) { return allowedOrigins.has(origin); }
function time(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value)) return NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(Date.parse(value.slice(0, 19) + 'Z')).toISOString().slice(0, 19) === value.slice(0, 19) ? parsed : NaN;
}
function number(value: unknown, min: number, max: number) { return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max; }
export function createHardwareGpsHandler(deps: Dependencies): (request: Request) => Promise<Response> {
  return async request => {
    const origin = request.headers.get('Origin');
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin', ...(origin && allowed(origin) ? { 'Access-Control-Allow-Origin': origin } : {}), 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
    const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
    if (origin && !allowed(origin)) return reply(403, { error: 'Origin denied' });
    if (request.method === 'OPTIONS') return reply(200, {});
    if (request.method !== 'POST') return reply(405, { error: 'POST required' });
    let phase = "authentication";
    try {
      const token = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
      if (!token) return reply(401, { error: 'Authentication required' });
      const user = await deps.authorize(token);
      if (!user) return reply(401, { error: 'Authentication required' });
      if (!['admin', 'ceo'].includes(user.role ?? '') || user.driver_status === 'suspended') return reply(403, { error: 'Admin access required' });
      const text = await request.text();
      if (text.length > 4096) return reply(400, { error: 'Invalid request' });
      let body;
      try { body = JSON.parse(text); } catch { return reply(400, { error: 'Invalid request' }); }
      if (!body || Object.keys(body).length !== 1 || !Array.isArray(body.truckIds) || body.truckIds.length > 20 || !body.truckIds.every((id: unknown) => typeof id === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id))) return reply(400, { error: 'Invalid request' });
      const ids: string[] = [...new Set<string>(body.truckIds)];
      phase = "mapping";
      const trucks = (await deps.loadTrucks(ids)).filter(t => ids.includes(String(t.id)) && t.gps_provider === 'traccar' && typeof t.gps_external_id === 'string' && /^\d{15}$/.test(t.gps_external_id));
      if (!trucks.length) return reply(200, { positions: [] });
      phase = "upstream";
      const { devices, positions } = await deps.readSnapshot();
      phase = "validation";
      if (!Array.isArray(devices) || !Array.isArray(positions) || devices.length > 1000 || positions.length > 1000) throw new Error('Invalid snapshot');
      const now = deps.now();
      const result = trucks.map(truck => {
        const base = { truck_id: truck.id, plate_number: truck.plate_number, source: 'traccar', recorded_at: null as string | null, status: 'OFFLINE', location: null as { latitude: number; longitude: number; speed_kmh: number; heading: number | null } | null };
        const matches = devices.filter(d => d.uniqueId === truck.gps_external_id);
        if (matches.length !== 1 || typeof matches[0].id !== 'number') return base;
        const candidates = positions.filter(p => p.deviceId === matches[0].id);
        // An invalid latest report must never promote an older report to LIVE.
        const fix = candidates.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0))[0];
        if (!fix) return base;
        const timestamp = time(fix.fixTime);
        if (fix.valid !== true || !['gt06', 'h02'].includes(String(fix.protocol)) || !number(fix.latitude, -90, 90) || !number(fix.longitude, -180, 180) || !number(fix.speed, 0, 250 / 1.852) || (fix.course != null && !number(fix.course, 0, 359.999999)) || !Number.isFinite(timestamp) || timestamp > now) return base;
        const age = now - timestamp;
        return { ...base, recorded_at: new Date(timestamp).toISOString(), status: age <= 120000 ? 'LIVE' : age <= 1800000 ? 'STALE' : 'OFFLINE', location: { latitude: fix.latitude as number, longitude: fix.longitude as number, speed_kmh: Math.round((fix.speed as number) * 1852) / 1000, heading: (fix.course as number | null) ?? null } };
      });
      return reply(200, { positions: result });
    } catch { console.warn(`hardware_gps:failed_phase:${phase}`); return reply(503, { error: 'Hardware GPS unavailable. Retry shortly.' }); }
  };
}
