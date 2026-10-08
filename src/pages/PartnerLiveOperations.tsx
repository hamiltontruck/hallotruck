import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PartnerLiveOperationsMap } from "../components/partner/PartnerLiveOperationsMap";
import { getCurrentPartnerMemberships, type PartnerMembership } from "../services/partner.service";
import { loadPartnerLiveOperations, type PartnerLiveTrip } from "../services/partner-live-operations.service";

function age(value: string | null) {
  if (!value) return "No GPS received";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

export function PartnerLiveOperations() {
  const [params] = useSearchParams();
  const [memberships, setMemberships] = useState<PartnerMembership[]>([]);
  const [partnerId, setPartnerId] = useState("");
  const [trips, setTrips] = useState<PartnerLiveTrip[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (requested?: string) => {
    setLoading(true); setError("");
    try {
      const nextMemberships = await getCurrentPartnerMemberships();
      setMemberships(nextMemberships);
      const candidate = requested || partnerId || params.get("organization") || "";
      const nextPartnerId = nextMemberships.some((item) => item.partner_id === candidate) ? candidate : nextMemberships[0]?.partner_id || "";
      setPartnerId(nextPartnerId);
      if (!nextPartnerId) {
        setTrips([]);
        setWarnings([]);
      } else {
        const result = await loadPartnerLiveOperations(nextPartnerId);
        setTrips(result.trips);
        setWarnings(result.warnings);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Partner live operations could not be loaded.");
    } finally { setLoading(false); }
  }, [params, partnerId]);

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!partnerId) return;
    const timer = window.setInterval(() => void load(partnerId), 8000);
    return () => window.clearInterval(timer);
  }, [load, partnerId]);

  const counts = useMemo(() => ({
    live: trips.filter((trip) => trip.freshness === "LIVE").length,
    stale: trips.filter((trip) => trip.freshness === "STALE").length,
    offline: trips.filter((trip) => trip.freshness === "OFFLINE").length,
  }), [trips]);

  return <main className="min-h-screen overflow-x-hidden bg-[#f5f3ed] text-asphalt">
    <header className="bg-asphalt px-4 py-6 text-white sm:px-7">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="font-mono text-[10px] tracking-[.22em] text-amber">PARTNER LIVE OPERATIONS</p><h1 className="mt-2 font-display text-3xl font-bold">Real GPS fleet map</h1><p className="mt-2 text-sm text-white/55">Current Partner trips only. GPS freshness is never simulated.</p></div>
        <div className="flex flex-wrap gap-2">
          {memberships.length > 1 && <select value={partnerId} onChange={(event) => void load(event.target.value)} className="border border-white/15 bg-white/5 px-3 py-2 text-sm text-white">{memberships.map((membership) => <option key={membership.partner_id} value={membership.partner_id} className="text-asphalt">{membership.partner_organizations?.name ?? membership.partner_id}</option>)}</select>}
          <Link to={partnerId ? `/partner?organization=${encodeURIComponent(partnerId)}` : "/partner"} className="border border-white/20 px-4 py-3 text-xs font-semibold">Partner workspace</Link>
          <button type="button" onClick={() => void load(partnerId)} className="border border-amber/60 px-4 py-3 text-xs font-semibold text-amber">Refresh</button>
        </div>
      </div>
    </header>

    <section className="mx-auto max-w-6xl space-y-5 px-4 py-5 sm:px-7">
      {error && <p role="alert" className="border border-route/30 bg-route/5 p-4 text-sm text-route">{error}</p>}
      {warnings.map((warning) => <p key={warning} role="alert" className="border border-amber/45 bg-amber/10 p-4 text-sm text-amber-dim"><strong>Live trip hidden:</strong> {warning}</p>)}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Active trips" value={trips.length} /><Metric label="LIVE" value={counts.live} /><Metric label="STALE" value={counts.stale} /><Metric label="OFFLINE" value={counts.offline} />
      </div>
      {loading && trips.length === 0 ? <p className="border border-asphalt/10 bg-white p-10 text-center text-sm text-steel">Loading real fleet telemetry…</p> : <>
        <PartnerLiveOperationsMap trips={trips} />
        {trips.length === 0 ? <p className="border border-asphalt/10 bg-white p-8 text-center text-sm text-steel">No active Partner trips right now.</p> :
          <div className="grid gap-3 lg:grid-cols-2">{trips.map((trip) => <article key={trip.order_id} className="border border-asphalt/10 bg-white p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-all font-mono text-[10px] text-steel">TRIP {trip.reference}</p><h2 className="mt-1 font-display text-xl font-bold">{trip.plate_number}</h2><p className="mt-1 text-xs text-steel">{trip.driver_name} · {trip.status.replaceAll("_", " ")}</p></div><span className="border border-asphalt/10 px-3 py-2 text-[10px] font-bold">{trip.freshness}</span></div><div className="mt-4 grid grid-cols-3 gap-2 text-xs"><Value label="Speed" value={trip.speed_kmh == null ? "—" : `${Math.round(trip.speed_kmh)} km/h`} /><Value label="Heading" value={trip.heading == null ? "—" : `${Math.round(trip.heading)}°`} /><Value label="Last GPS" value={age(trip.recorded_at)} /></div></article>)}</div>}
      </>}
    </section>
  </main>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="border border-asphalt/10 bg-white p-4"><p className="font-mono text-[9px] uppercase text-steel">{label}</p><p className="mt-2 font-display text-2xl font-bold">{value}</p></div>; }
function Value({ label, value }: { label: string; value: string }) { return <div><p className="font-mono text-[9px] uppercase text-steel">{label}</p><p className="mt-1 break-words font-semibold">{value}</p></div>; }
