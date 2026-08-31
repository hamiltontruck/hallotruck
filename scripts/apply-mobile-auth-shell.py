from __future__ import annotations

import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
app_path = root / "apps/mobile-app/src/App.tsx"
app = app_path.read_text(encoding="utf-8")

old_import = 'import { ReactNode, useMemo, useState } from "react";'
new_import = 'import { ReactNode, useEffect, useMemo, useState } from "react";\nimport { MobileAuthBoundary, type MobileIdentity } from "./auth/MobileAuthBoundary";'
if old_import not in app:
    raise SystemExit("App import contract changed")
app = app.replace(old_import, new_import, 1)

app, removed = re.subn(
    r'\nfunction RoleSwitch\(\{ role, onChange \}: \{ role: Role; onChange: \(role: Role\) => void \}\) \{.*?\n\}\n',
    "\n",
    app,
    count=1,
    flags=re.S,
)
if removed != 1:
    raise SystemExit("RoleSwitch contract changed")

old_start = '''export default function App() {
  const [role, setRole] = useState<Role>("driver");
  const [tab, setTab] = useState<Tab>("home");'''
new_start = '''function MobileWorkspace({
  identity,
  onSignOut,
  signingOut,
}: {
  identity: MobileIdentity;
  onSignOut: () => Promise<void>;
  signingOut: boolean;
}) {
  const role: Role = identity.role;
  const [tab, setTab] = useState<Tab>("home");'''
if old_start not in app:
    raise SystemExit("App start contract changed")
app = app.replace(old_start, new_start, 1)

old_change = '''
  function changeRole(nextRole: Role) {
    setRole(nextRole);
    setTab("home");
  }
'''
new_change = '''
  useEffect(() => {
    setTab("home");
  }, [role]);
'''
if old_change not in app:
    raise SystemExit("Role change contract changed")
app = app.replace(old_change, new_change, 1)

old_header = '<div className="flex items-center gap-2"><RoleSwitch role={role} onChange={changeRole} /><button type="button" className="relative grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-halo-soft text-halo-blue"><Icon name="bell" className="h-5 w-5" /><span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-halo-soft bg-red-500" /></button></div>'
new_header = '''<div className="flex min-w-0 items-center gap-2">
          <span className="hidden max-w-28 truncate rounded-xl bg-halo-soft px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-halo-blue sm:block">{identity.fullName}</span>
          <button type="button" onClick={() => void onSignOut()} disabled={signingOut} aria-label={`Sign out ${identity.fullName}`} className="min-h-10 shrink-0 rounded-xl border border-halo-line px-3 text-xs font-black text-halo-navy disabled:opacity-60">{signingOut ? "…" : "Ba'i"}</button>
          <button type="button" className="relative grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-halo-soft text-halo-blue" aria-label="Notifications"><Icon name="bell" className="h-5 w-5" /><span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-halo-soft bg-red-500" /></button>
        </div>'''
if old_header not in app:
    raise SystemExit("Header contract changed")
app = app.replace(old_header, new_header, 1)

app = app.rstrip() + '''

export default function App() {
  return (
    <MobileAuthBoundary>
      {({ identity, signOut, signingOut }) => (
        <MobileWorkspace
          key={`${identity.userId}:${identity.role}`}
          identity={identity}
          onSignOut={signOut}
          signingOut={signingOut}
        />
      )}
    </MobileAuthBoundary>
  );
}
'''
app_path.write_text(app, encoding="utf-8")

readme_path = root / "apps/mobile-app/README.md"
readme = readme_path.read_text(encoding="utf-8")
readme = readme.replace(
    "This first slice establishes the isolated build and the production-quality responsive UI shell. It intentionally uses display data only. Connecting the screens to the existing authentication, services, Supabase queries, order state machine, payment records, and live GPS must be completed in a separate focused integration slice with role-isolation and regression tests.",
    "The responsive UI shell now includes a secure Supabase authentication boundary. Email/password sessions are restored in isolated mobile storage, and the workspace is selected only from `profiles.role` plus `driver_status` in the database. Operational screens still use display data; orders, payments, wallet records and live GPS remain separate integration slices.",
)
if "## Mobile authentication boundary" not in readme:
    readme += '''

## Mobile authentication boundary

- Requires `VITE_SUPABASE_URL` and the public `VITE_SUPABASE_ANON_KEY`.
- Never accepts a service-role key in the browser bundle.
- Does not trust `user_metadata` or a user-controlled role switch.
- Reads `profiles.role`, `profiles.driver_status` and `profiles.full_name` under the signed-in user's existing RLS policy.
- Allows Customer accounts and approved Driver accounts only.
- Keeps pending/rejected Drivers in onboarding, blocks suspended Drivers, and denies Admin/CEO/Partner accounts.
- Uses a dedicated `hallo-mobile-auth-v1` storage key so the mobile workspace does not inherit a leadership session from the root web portal.
- Covers the role decision contract with deterministic Node tests in Mobile App CI.
'''
readme_path.write_text(readme.rstrip() + "\n", encoding="utf-8")
