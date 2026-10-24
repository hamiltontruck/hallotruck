import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PartnerLiveOperationsMap } from "../components/partner/PartnerLiveOperationsMap";
import { PartnerOperationsNav, PartnerOrganizationSelect } from "../components/partner/PartnerOperationsNav";
import { usePartnerResource, usePartnerScope } from "../components/partner/usePartnerOperations";
import { loadPartnerLiveOperations } from "../services/partner-live-operations.service";
import { isLocatedTrip } from "../domain/partner-operations";

function age(value: string | null) {
  const seconds = value ? Math.round((Date.now() - new Date(value).getTime()) / 1000) : NaN;
  if (!Number.isFinite(seconds) || seconds < 0) return "No valid GPS received";
  if (seconds < 60) return `${seconds}s ago`;
  return seconds < 3600 ? `${Math.round(seconds / 60)}m ago` : `${Math.round(seconds / 3600)}h ago`;
}
export function PartnerLiveOperations() {
  const scope = usePartnerScope();
  const [params, setParams] = useSearchParams();
  const resource = usePartnerResource(scope.partnerId, loadPartnerLiveOperations, 8000);
  const trips = resource.data?.trips ?? [];
  const [selection, setSelection] = useState<{ organization: string; trip: string | null; focus: number }>({ organization: "", trip: null, focus: 0 });
  const selected = selection.organization === scope.partnerId && trips.some(trip => trip.order_id === selection.trip) ? selection.trip : null;
  const selectTrip = useCallback((id: string) => {
    setSelection(previous => ({ organization: scope.partnerId, trip: id, focus: previous.organization === scope.partnerId ? previous.focus + 1 : 1 }));
    setParams(previous => { const next = new URLSearchParams(previous); next.set("organization", scope.partnerId); next.set("trip", id); return next; }, { replace: true });
  }, [scope.partnerId, setParams]);
  const requestedTrip = params.get("trip");
  useEffect(() => {
    if (!requestedTrip) {
      setSelection(previous => previous.organization === scope.partnerId && previous.trip == null ? previous : { organization: scope.partnerId, trip: null, focus: 0 });
      return;
    }
    if (!resource.data) return;
    if (resource.data.trips.some(trip => trip.order_id === requestedTrip)) {
      setSelection(previous => previous.organization === scope.partnerId && previous.trip === requestedTrip ? previous : { organization: scope.partnerId, trip: requestedTrip, focus: 0 });
    } else {
      setSelection({ organization: scope.partnerId, trip: null, focus: 0 });
      setParams(previous => { const next = new URLSearchParams(previous); if (next.get("trip") === requestedTrip) next.delete("trip"); return next; }, { replace: true });
    }
  }, [requestedTrip, resource.data, scope.partnerId, setParams]);
  const counts = useMemo(() => ({ live: trips.filter(trip => trip.freshness === "LIVE").length, stale: trips.filter(trip => trip.freshness === "STALE").length, offline: trips.filter(trip => trip.freshness === "OFFLINE").length }), [trips]);
  return <main className="partner-mobile-touch-safe min-h-screen overflow-x-hidden bg-[#f5f3ed] text-asphalt">
    <PartnerOperationsNav partnerId={scope.partnerId} canManageDrivers={scope.canManageDrivers} />
    <header className="bg-asphalt px-4 py-6 text-white sm:px-7"><div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-[10px] tracking-[.22em] text-amber">PARTNER LIVE OPERATIONS</p><h1 className="mt-2 font-display text-3xl font-bold">Real GPS fleet map</h1><p className="mt-2 text-sm text-white/60">Confirmed Partner trips only. Select a trip to locate its vehicle.</p></div><button type="button" onClick={() => void resource.refresh()} disabled={resource.loading || !scope.partnerId} className="min-h-11 border border-amber px-4 py-3 text-sm text-amber disabled:opacity-50">Refresh</button></div></header>
    <section className="mx-auto max-w-6xl space-y-5 p-4 sm:p-7">
      <PartnerOrganizationSelect memberships={scope.memberships} partnerId={scope.partnerId} onChange={scope.selectOrganization} />
      {(scope.error || resource.error) && <p role="alert" className="break-words border border-route/30 bg-white p-4 text-sm text-route">{scope.error || resource.error}</p>}
      {resource.data?.warnings.map(warning => <p key={warning} role="alert" className="border border-amber bg-white p-4 text-sm"><strong>Live trip hidden:</strong> {warning}</p>)}
      <p className="text-xs text-steel">{resource.loading ? "Refreshing fleet telemetry…" : resource.updatedAt ? `Updated ${new Date(resource.updatedAt).toLocaleTimeString()}` : "No successful GPS refresh yet"}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Active trips" value={resource.data ? trips.length : null} /><Metric label="LIVE" value={resource.data ? counts.live : null} /><Metric label="STALE" value={resource.data ? counts.stale : null} /><Metric label="OFFLINE" value={resource.data ? counts.offline : null} /></div>
      {scope.loading ? <p role="status">Loading real fleet telemetry…</p> : !scope.partnerId ? <p>No active Partner organization.</p> : <>
        {resource.loading && !resource.data && <p role="status">Loading real fleet telemetry…</p>}
        <PartnerLiveOperationsMap key={scope.partnerId} trips={trips} selectedTripId={selected} focusRequest={selection.organization === scope.partnerId ? selection.focus : 0} onSelectTrip={selectTrip} />
        {resource.data && !trips.length && <p className="border bg-white p-6 text-sm">No active Partner trips right now.</p>}
        <div className="grid gap-3 lg:grid-cols-2">{trips.map(trip => <article key={trip.order_id} className={`min-w-0 border bg-white p-4 ${selected === trip.order_id ? "border-amber ring-1 ring-amber" : "border-asphalt/15"}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-all font-mono text-[10px] text-steel">TRIP {trip.reference}</p><h2 className="mt-1 font-display text-xl font-bold">{trip.plate_number}</h2><p className="mt-1 break-words text-xs text-steel">{trip.driver_name} · {trip.status.replaceAll("_", " ")}</p></div><span className="border px-3 py-2 text-[10px] font-bold">{trip.freshness}</span></div><div className="mt-4 grid grid-cols-3 gap-2 text-xs"><Value label="Speed" value={trip.speed_kmh == null ? "—" : `${Math.round(trip.speed_kmh)} km/h`} /><Value label="Heading" value={trip.heading == null ? "—" : `${Math.round(trip.heading)}°`} /><Value label="Last GPS" value={age(trip.recorded_at)} /></div><button className="mt-4 min-h-11 border px-4 text-xs font-semibold" aria-label={`Select trip ${trip.reference}`} aria-pressed={selected === trip.order_id} onClick={() => selectTrip(trip.order_id)}>Select trip</button>{!isLocatedTrip(trip) && <p className="mt-2 text-xs text-steel">No valid GPS position for this trip yet.</p>}</article>)}</div>
      </>}
    </section>
  </main>;
}
function Metric({ label, value }: { label: string; value: number | null }) { return <div className="border border-asphalt/15 bg-white p-4"><p className="font-mono text-[9px] uppercase text-steel">{label}</p><p className="mt-2 font-display text-2xl font-bold">{value ?? "—"}</p></div>; }
function Value({ label, value }: { label: string; value: string }) { return <div><p className="font-mono text-[9px] uppercase text-steel">{label}</p><p className="mt-1 break-words font-semibold">{value}</p></div>; }
