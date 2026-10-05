export type DriverAccess = 'signed-out' | 'not-approved' | 'approved';
export type DriverAuthResult = { access: DriverAccess; user?: { id: string; email?: string | null }; profile?: { id: string; role: string | null; driver_status: string | null; is_active: boolean | null } | null; };
async function readJson(response: Response) { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`); return data; }
export function createDriverApiAdapter(fetcher: typeof fetch = fetch) { return {
  async login(email: string, password: string): Promise<DriverAuthResult> { return readJson(await fetcher('/_api/driver-v6/auth/login', { method:'POST', headers:{'content-type':'application/json'}, credentials:'include', body:JSON.stringify({email,password}) })); },
  async session(): Promise<DriverAuthResult> { return readJson(await fetcher('/_api/driver-v6/auth/session', { method:'GET', credentials:'include' })); },
  async logout(): Promise<{ok:true}> { return readJson(await fetcher('/_api/driver-v6/auth/logout', { method:'POST', credentials:'include' })); },
}; }
