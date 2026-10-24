import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { PartnerOperationsNav, PartnerOrganizationSelect, partnerPath } from "../components/partner/PartnerOperationsNav";
import { usePartnerResource, usePartnerScope } from "../components/partner/usePartnerOperations";
import { loadPartnerOperations } from "../services/partner-operations.service";
import { partnerJobStage, partnerStageLabels, isActivePartnerInvitation, type PartnerJobStage } from "../domain/partner-operations";

const stages: PartnerJobStage[] = ["offered", "awaiting_confirmation", "ready", "in_transit", "delivered", "closed", "unknown"];
export function PartnerOperationsDashboard() {
  const scope = usePartnerScope();
  const read = useCallback((id: string) => loadPartnerOperations(id, scope.canManageDrivers), [scope.canManageDrivers]);
  const resource = usePartnerResource(scope.partnerId, read, 8000);
  const [filter, setFilter] = useState("all");
  const data = resource.data;
  const jobs = data?.jobs.data;
  const recent = jobs?.filter(job => filter === "all" || partnerJobStage(job) === filter);
  const attention = data?.fleet.data?.filter(vehicle => ["attention", "critical"].includes(vehicle.health_status) || vehicle.maintenance_status === "overdue").length;
  const approved = data?.drivers?.data?.filter(driver => driver.driver_status === "approved").length;
  return <div className="partner-mobile-touch-safe min-h-screen overflow-x-hidden bg-[#f5f3ed] text-asphalt">
    <PartnerOperationsNav partnerId={scope.partnerId} canManageDrivers={scope.canManageDrivers} />
    <header className="bg-asphalt px-4 py-7 text-white sm:px-7"><div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[.2em] text-amber">{scope.membership?.partner_organizations?.name ?? "Partner operations"}</p><h1 className="mt-2 font-display text-3xl font-bold">Fleet operations</h1><p className="mt-2 max-w-xl text-sm text-white/60">Your fleet, drivers and HALLO freight — from offered work to verified delivery.</p></div><button onClick={() => void resource.refresh()} disabled={resource.loading || !scope.partnerId} className="min-h-11 border border-amber px-5 py-3 text-sm text-amber disabled:opacity-50">Refresh</button></div></header>
    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-7">
      <PartnerOrganizationSelect memberships={scope.memberships} partnerId={scope.partnerId} onChange={scope.selectOrganization} />
      {(scope.error || resource.error) && <p role="alert" className="border border-route/30 bg-white p-4 text-route">{scope.error || resource.error}</p>}
      {scope.loading || (resource.loading && !data) ? <p role="status">Loading fleet operations…</p> : !scope.partnerId ? <p>No active Partner organization is available for this account.</p> : <>
        <p className="text-xs text-steel">{resource.loading ? "Refreshing…" : resource.updatedAt ? `Updated ${new Date(resource.updatedAt).toLocaleTimeString()}` : "No successful refresh yet"}</p>
        <section aria-label="Fleet overview" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric title="Fleet vehicles" value={data?.fleet.data?.length} href={partnerPath("/partner/workspace", scope.partnerId, { tab: "fleet" })} />
          <Metric title="Confirmed active trips" value={data?.live.data?.trips.length} href={partnerPath("/partner/live", scope.partnerId)} />
          {scope.canManageDrivers && <Metric title="Approved drivers" value={approved} href={partnerPath("/partner/drivers", scope.partnerId)} />}
          <Metric title="Fleet attention" value={attention} href={partnerPath("/partner/workspace", scope.partnerId, { tab: "fleet" })} />
        </section>
        {data && Object.entries({ fleet: data.fleet.error, jobs: data.jobs.error, live: data.live.error, drivers: data.drivers?.error, invitations: data.registrations?.error }).map(([name, error]) => error ? <p key={name} role="alert" className="break-words border border-route/20 bg-white p-3 text-sm text-route">{name}: {error}</p> : null)}
        {data?.live.data?.warnings.map(warning => <p role="alert" key={warning} className="border border-amber bg-white p-3 text-sm">{warning}</p>)}
        {scope.canManageDrivers && data?.registrations?.data && <Link to={partnerPath("/partner/drivers", scope.partnerId)} className="block border border-amber/30 bg-white p-4 text-sm">Driver onboarding: {data.registrations.data.filter(row => row.status === "registered" || isActivePartnerInvitation(row)).length} registrations pending completion or HALLO review →</Link>}
        <section className="space-y-4" aria-label="Recent work">
          <div><h2 className="font-display text-2xl font-bold">Recent work</h2><p className="mt-1 text-xs text-steel">Latest 100 requests. Acceptance waits for HALLO confirmation; delivery is shown only from the canonical order.</p></div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">{stages.slice(0, 5).map(stage => <button key={stage} onClick={() => setFilter(filter === stage ? "all" : stage)} aria-pressed={filter === stage} className={`min-h-16 border p-3 text-left text-xs ${filter === stage ? "border-amber bg-amber/10" : "border-asphalt/15 bg-white"}`}><span>{partnerStageLabels[stage]}</span><strong className="mt-2 block text-xl">{jobs ? jobs.filter(job => partnerJobStage(job) === stage).length : "—"}</strong></button>)}</div>
          <label className="block text-xs">Work status<select value={filter} onChange={event => setFilter(event.target.value)} className="ml-2 min-h-11 max-w-full border bg-white px-3"><option value="all">All recent work</option>{stages.map(stage => <option key={stage} value={stage}>{partnerStageLabels[stage]}</option>)}</select></label>
          {jobs ? recent?.length ? <div className="grid gap-3 lg:grid-cols-2">{recent.map(job => <article key={job.id} className="min-w-0 border border-asphalt/15 bg-white p-4"><p className="font-mono text-xs text-amber-dim">{job.order?.tracking_id ?? "Order details unavailable"}</p><h3 className="mt-2 break-words font-bold">{job.order ? `${job.order.pickup_address} → ${job.order.dropoff_address}` : "Verify this request in Jobs & assignments"}</h3><p className="mt-2 text-sm">{partnerStageLabels[partnerJobStage(job)]}</p><div className="mt-3 flex flex-wrap gap-2"><Link className="min-h-11 border px-3 py-3 text-xs" to={partnerPath("/partner/jobs", scope.partnerId)}>Manage assignment</Link>{["ready", "in_transit"].includes(partnerJobStage(job)) && <Link className="min-h-11 border px-3 py-3 text-xs" to={partnerPath("/partner/live", scope.partnerId, { trip: job.order_id })}>Track trip</Link>}</div></article>)}</div> : <p className="border bg-white p-6 text-sm">No work matches this status.</p> : <p className="border bg-white p-6 text-sm">Recent work is unavailable. Refresh to try again.</p>}
        </section>
      </>}
    </main>
  </div>;
}
function Metric({ title, value, href }: { title: string; value: number | undefined; href: string }) { return <Link to={href} className="min-w-0 border border-asphalt/15 bg-white p-4"><p className="text-xs text-steel">{title}</p><strong className="mt-2 block font-display text-3xl">{value ?? "—"}</strong>{value == null && <span className="text-xs text-steel">Unavailable</span>}</Link>; }
