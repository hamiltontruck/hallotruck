// Real Traccar HTTP API reader. QA only; no writes or mock GPS.
export function createTraccarClient({ baseUrl, token, email, password, fetchImpl = fetch }) {
  const url = new URL(baseUrl);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("Invalid server scheme");
  if (url.protocol !== "https:" && !["localhost","127.0.0.1","::1","[::1]"].includes(url.hostname)) throw new Error("Remote Traccar server must use HTTPS");
  if (url.username || url.password || url.search || url.hash) throw new Error("Use a clean Traccar base URL");
  const auth = token ? "Bearer " + token : email && password ? "Basic " + Buffer.from(email + ":" + password).toString("base64") : null;
  if (!auth) throw new Error("Traccar token or email/password required");
  async function get(path) {
    const target = new URL(path, url.origin + "/");
    if (target.origin !== url.origin || !target.pathname.startsWith("/api/")) throw new Error("Invalid Traccar API target");
    const response = await fetchImpl(target, { headers: { Authorization: auth, Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("Traccar API error: HTTP " + response.status);
    return response.json();
  }
  return {
    async devices() { const rows = await get("/api/devices"); if (!Array.isArray(rows)) throw new Error("Invalid Traccar device response"); return rows; },
    async positions() { const rows = await get("/api/positions"); if (!Array.isArray(rows)) throw new Error("Invalid Traccar position response"); return rows; },
    async latestAuthorized({ deviceUniqueId, truckMapping }) {
      if (!deviceUniqueId || !truckMapping || truckMapping.gps_provider !== "traccar" || truckMapping.gps_external_id !== deviceUniqueId || !truckMapping.truck_id) throw new Error("Unapproved truck mapping");
      const devices = await this.devices();
      const matches = devices.filter(d => d.uniqueId === deviceUniqueId);
      if (matches.length !== 1) throw new Error("Device not found or duplicate");
      const positions = await this.positions();
      const p = positions.filter(p => p.deviceId === matches[0].id && p.valid !== false).sort((a,b)=>Date.parse(b.fixTime)-Date.parse(a.fixTime))[0];
      if (!p) return null;
      const lat=Number(p.latitude),lng=Number(p.longitude),knots=Number(p.speed),course=p.course==null?null:Number(p.course),time=Date.parse(p.fixTime);
      if(!Number.isFinite(lat)||lat < -90||lat > 90||!Number.isFinite(lng)||lng < -180||lng > 180||!Number.isFinite(knots)||knots<0||knots*1.852>250||!Number.isFinite(time)||time>Date.now()+300000||course!==null&&(!Number.isFinite(course)||course<0||course>=360)) throw new Error("Invalid GPS payload");
      return {truck_id:truckMapping.truck_id,device_unique_id:deviceUniqueId,latitude:lat,longitude:lng,speed_kmh:knots*1.852,heading:course,ignition:typeof p.attributes?.ignition==="boolean"?p.attributes.ignition:null,fix_time:new Date(time).toISOString(),source:"traccar",stale:Date.now()-time>60000};
    }
  };
}
