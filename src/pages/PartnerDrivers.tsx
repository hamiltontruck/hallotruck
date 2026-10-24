import { useCallback, useState } from "react";
import { PartnerDriversPanel } from "../components/partner/PartnerDriversPanel";
import { PartnerOperationsNav, PartnerOrganizationSelect } from "../components/partner/PartnerOperationsNav";
import { usePartnerResource, usePartnerScope } from "../components/partner/usePartnerOperations";
import { getPartnerDriverRoster, listPartnerDrivers, partnerDriverJoinUrl } from "../services/partner-driver.service";
import { partnerRead } from "../services/partner-operations.service";
import { filterPartnerDrivers, joinPartnerDrivers, isActivePartnerInvitation } from "../domain/partner-operations";

export function PartnerDrivers() {
  const scope = usePartnerScope();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const read = useCallback(async (id: string) => {
    const [drivers, registrations] = await Promise.all([partnerRead(() => getPartnerDriverRoster(id)), partnerRead(() => listPartnerDrivers(id))]);
    return { drivers, registrations };
  }, []);
  const resource = usePartnerResource(scope.canManageDrivers ? scope.partnerId : "", read);
  const data = resource.data;
  const rows = data ? joinPartnerDrivers(data.drivers.data ?? [], data.registrations.data ?? []) : [];
  const visible = filterPartnerDrivers(rows, query, status);
  return <div className="partner-mobile-touch-safe min-h-screen overflow-x-hidden bg-[#f5f3ed] text-asphalt">
    <PartnerOperationsNav partnerId={scope.partnerId} canManageDrivers={scope.canManageDrivers} />
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-7">
      <div><p className="font-mono text-xs uppercase text-amber-dim">{scope.membership?.partner_organizations?.name ?? "Partner organization"}</p><h1 className="mt-2 font-display text-3xl font-bold">Your Partner drivers</h1><p className="mt-2 text-sm text-steel">Manage your own drivers and invitations. HALLO verifies documents and approves drivers before dispatch.</p></div>
      <PartnerOrganizationSelect memberships={scope.memberships} partnerId={scope.partnerId} onChange={scope.selectOrganization} />
      {scope.error && <p role="alert">{scope.error}</p>}
      {scope.loading ? <p>Verifying organization access…</p> : !scope.canManageDrivers ? <p role="status" className="border bg-white p-6">Active Partner owner or admin access is required to manage drivers.</p> : <>
        <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]"><label className="col-span-2 min-w-0 text-xs font-semibold sm:col-span-1">Search drivers<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, email, phone or plate" className="mt-2 block min-h-12 w-full min-w-0 border bg-white px-3 text-sm" /></label><label className="min-w-0 text-xs font-semibold">Driver status<select value={status} onChange={event => setStatus(event.target.value)} className="mt-2 block min-h-12 w-full min-w-0 max-w-full border bg-white px-3 text-sm">{["all", "approved", "pending", "rejected", "suspended", "invited", "expired"].map(value => <option key={value} value={value}>{value === "all" ? "All drivers & invitations" : value}</option>)}</select></label><button onClick={() => void resource.refresh()} disabled={resource.loading} className="min-h-12 border px-4 text-sm disabled:opacity-50">Refresh drivers</button></div>
        <div className="grid grid-cols-2 gap-3"><div className="border bg-white p-4"><p className="text-xs text-steel">Approved drivers</p><strong className="text-2xl">{data?.drivers.data ? data.drivers.data.filter(row => row.driver_status === "approved").length : "—"}</strong></div><div className="border bg-white p-4"><p className="text-xs text-steel">Active invitations</p><strong className="text-2xl">{data?.registrations.data ? data.registrations.data.filter(row => isActivePartnerInvitation(row)).length : "—"}</strong></div></div>
        {(resource.error || data?.drivers.error || data?.registrations.error) && <p role="alert" className="break-words border border-route/30 bg-white p-4 text-sm text-route">{resource.error || data?.drivers.error || data?.registrations.error} Some driver information is unavailable. Refresh to retry.</p>}
        <PartnerDriversPanel key={scope.partnerId} partnerId={scope.partnerId} showRegistrations={false} onChanged={() => void resource.refresh()} />
        {resource.loading && !data ? <p role="status">Loading drivers…</p> : <section aria-label="Registered Partner drivers" className="grid gap-3 md:grid-cols-2">{visible.map(({ key, driver, registration }) => <article key={key} className="min-w-0 border border-asphalt/15 bg-white p-4"><h2 className="font-display text-xl font-bold">{driver?.full_name ?? registration?.full_name}</h2><p className="mt-2 text-sm">Driver approval: {driver?.driver_status ?? registration?.driver_status ?? "Waiting for signup"}</p><p className="mt-1 text-sm">Vehicle: {driver?.plate_number ?? "Awaiting HALLO vehicle link"}</p><p className="mt-2 break-words text-xs text-steel">{driver?.email ?? registration?.email} · {driver?.phone ?? registration?.phone}</p>{registration && <><p className="mt-3 text-xs">Registration: {registration.status}</p>{registration.review_note && <p className="mt-2 break-words text-sm">HALLO review: {registration.review_note}</p>}{registration.status === "invited" && !registration.driver_id && !isActivePartnerInvitation(registration) && <p className="mt-2 text-sm text-route">Invitation expired or expiry unavailable. Ask HALLO to review this registration.</p>}{registration.token && isActivePartnerInvitation(registration) && <label className="mt-3 block text-xs">Private invitation link<input readOnly value={partnerDriverJoinUrl(registration.token)} onFocus={event => event.currentTarget.select()} className="mt-2 min-h-11 w-full border px-2" /><span className="mt-1 block">Share only with this driver. Expires {new Date(registration.expires_at).toLocaleString()}.</span></label>}</>}</article>)}{data && !visible.length && <p className="border bg-white p-6 text-sm">{data.drivers.error || data.registrations.error ? "No matching drivers in the information currently available." : "No drivers or invitations match your search."}</p>}</section>}
      </>}
    </main>
  </div>;
}
