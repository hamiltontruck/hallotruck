import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handle as login } from '../../endpoints/driver-v6/auth/login_POST';
import { handle as session } from '../../endpoints/driver-v6/auth/session_GET';
import { handle as logout } from '../../endpoints/driver-v6/auth/logout_POST';
import { handle as jobs } from '../../endpoints/driver-v6/jobs_GET';
import { handle as trucks } from '../../endpoints/driver-v6/trucks_POST';
import { handle as claim } from '../../endpoints/driver-v6/claim_POST';
const handlers: Record<string, { method: string; run: (request: Request) => Promise<Response> }> = {
  '/api/driver-v6/auth/login': { method: 'POST', run: login },
  '/api/driver-v6/auth/session': { method: 'GET', run: session },
  '/api/driver-v6/auth/logout': { method: 'POST', run: request => logout(request) },
  '/api/driver-v6/jobs': { method: 'GET', run: jobs },
  '/api/driver-v6/trucks': { method: 'POST', run: trucks },
  '/api/driver-v6/claim': { method: 'POST', run: claim },
};
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const rawPath = (req.url || '').split('?')[0];
  const path = rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath;
  const route = handlers[path];
  if (!route) return res.status(404).json({ error: 'HALLO V6 endpoint not found.' });
  if ((req.method || 'GET').toUpperCase() !== route.method) { res.setHeader('Allow', route.method); return res.status(405).json({ error: 'Method not allowed.' }); }
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) headers.set(name, value.join(', '));
    else if (value) headers.set(name, value);
  }
  let body: string | undefined;
  if (route.method !== 'GET' && req.body !== undefined) body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const webRequest = new Request(`https://${req.headers.host || 'localhost'}${path}`, { method: route.method, headers, body });
  const result = await route.run(webRequest);
  const cookieHeaders = (result.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.();
  if (cookieHeaders?.length) res.setHeader('Set-Cookie', cookieHeaders);
  result.headers.forEach((value, name) => { if (name.toLowerCase() !== 'set-cookie') res.setHeader(name, value); });
  return res.status(result.status).send(await result.text());
}
