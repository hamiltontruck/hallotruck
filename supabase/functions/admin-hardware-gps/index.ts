import { createClient } from 'npm:@supabase/supabase-js@2.112.0';
import { createHardwareGpsHandler } from './core.ts';
const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
const origin = 'https://traccar-qa-qa.up.railway.app';
const configuredToken = Deno.env.get('TRACCAR_API_TOKEN') ?? '';
const tokenFormat = !configuredToken ? 'missing' : /^https?:/i.test(configuredToken.trim()) ? 'url' : /^Bearer\s/i.test(configuredToken.trim()) ? 'bearer_prefix' : /^['"]/.test(configuredToken.trim()) ? 'quoted' : /\s/.test(configuredToken) ? 'whitespace' : 'raw';
console.info(`hardware_gps:token_format:${tokenFormat}`);
async function read(path: string) {
  const token = Deno.env.get('TRACCAR_API_TOKEN');
  if (!token) { console.warn('hardware_gps:missing_token'); throw new Error('Unavailable'); }
  try {
  const response = await fetch(`${origin}/api/${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000), redirect: 'error' });
  if (!response.ok) { console.warn(`hardware_gps:upstream_http:${path}:${response.status}`); throw new Error('Unavailable'); }
  const text = await response.text();
  if (text.length > 2000000) throw new Error('Oversized');
  return JSON.parse(text);
  } catch (error) { console.warn(`hardware_gps:upstream_failure:${path}:${error instanceof Error ? error.name : "Unknown"}`); throw new Error("Unavailable"); }
}
Deno.serve(createHardwareGpsHandler({
  async authorize(token) {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return null;
    const profile = await client.from('profiles').select('role, driver_status').eq('id', data.user.id).single();
    return profile.error ? null : profile.data;
  },
  async loadTrucks(ids) {
    if (!ids.length) return [];
    const result = await client.from('trucks').select('id, plate_number, gps_provider, gps_external_id').in('id', ids).eq('gps_provider', 'traccar');
    if (result.error) { console.warn(`hardware_gps:mapping:${result.error.code}`); throw new Error('Unavailable'); }
    return result.data;
  },
  async readSnapshot() {
    const [devices, positions] = await Promise.all([read('devices'), read('positions')]);
    return { devices, positions };
  },
  now: Date.now,
}));
