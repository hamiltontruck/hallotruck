import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getCurrentPartnerMemberships, type PartnerMembership } from "../services/partner.service";
import {
  loadPartnerDispatchData,
  respondToPartnerJob,
  type PartnerJobRequest,
} from "../services/partner-dispatch.service";
import type { FleetVehicle } from "../services/fleet-maintenance.service";

function title(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function requestTone(status: PartnerJobRequest["status"]) {
  if (status === "confirmed") return "border-emerald-700/30 bg-emerald-50";
  if (status === "accepted") return "border-sky-700/30 bg-sky-50";
  if (status === "rejected" || status === "cancelled") return "border-asphalt/10 bg-bone";
  return "border-amber/40 bg-white";
}

export function PartnerDispatch() {
  const [params] = useSearchParams();
  const [memberships, setMemberships] = useState<PartnerMembership[]>([]);
  const [partnerId, setPartnerId] = useState("");
  const [requests, setRequests] = useState<PartnerJobRequest[]>([]);
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [truckByRequest, setTruckByRequest] = useState<Record<string, string>>({});
  const [noteByRequest, setNoteByRequest] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (requestedPartnerId?: string) => {
    setLoading(true);
    setError("");
    try {
      const nextMemberships = await getCurrentPartnerMemberships();
      setMemberships(nextMemberships);
      const candidate = requestedPartnerId || partnerId || params.get("organization") || "";
      const nextPartnerId = nextMemberships.some((membership) => membership.partner_id === candidate)
        ? candidate
        : nextMemberships[0]?.partner_id || "";
      setPartnerId(nextPartnerId);
      if (!nextPartnerId) {
        setRequests([]);
        setVehicles([]);
        return;
      }
      const next = await loadPartnerDispatchData(nextPartnerId);
      setRequests(next.requests);
      setVehicles(next.vehicles);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Partner jobs could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [params, partnerId]);

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const organization = memberships.find((membership) => membership.partner_id === partnerId)?.partner_organizations;
  const canManage = ["owner", "admin"].includes(memberships.find((membership) => membership.partner_id === partnerId)?.member_role ?? "");
  const dispatchReady = useMemo(
    () => vehicles.filter((vehicle) => vehicle.dispatch_ready && vehicle.status === "available" && Boolean(vehicle.assigned_driver_id)),
    [vehicles],
  );

  async function respond(event: FormEvent, request: PartnerJobRequest, action: "accept" | "reject") {
    event.preventDefault();
    if (busyKey) return;
    const truckId = truckByRequest[request.id] || null;
    if (action === "accept" && !truckId) {
      setError("Choose a dispatch-ready Partner truck.");
      return;
    }
    setBusyKey(`${action}:${request.id}`);
    setError("");
    setNotice("");
    try {
      await respondToPartnerJob(request.id, action, truckId, noteByRequest[request.id] ?? "");
      setNotice(action === "accept" ? "Job accepted and sent to HALLO Admin for final confirmation." : "Job request rejected.");
      await load(partnerId);
    } catch (responseError) {
      setError(responseError instanceof Error ? responseError.message : "Partner job response failed.");
    } finally {
      setBusyKey("");
    }
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f5f3ed] text-asphalt" data-testid="partner-dispatch-page">
      <header className="bg-asphalt px-4 py-6 text-white sm:px-7">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-[.22em] text-amber">PARTNER DISPATCH</p>
            <h1 className="mt-2 break-words font-display text-3xl font-bold sm:text-4xl">{organization?.name ?? "Partner jobs"}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">Review HALLO freight requests, choose a driver-bound dispatch-ready truck, and send the assignment for Admin confirmation.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={`/partner?organization=${encodeURIComponent(partnerId)}`} className="min-h-11 border border-white/20 px-4 py-3 text-xs font-semibold">← Workspace</Link>
            <button type="button" onClick={() => void load(partnerId)} disabled={loading} className="min-h-11 border border-amber/50 px-4 py-3 text-xs font-semibold text-amber disabled:opacity-50">Refresh</button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-5 sm:px-7 sm:py-8">
        {memberships.length > 1 && (
          <label className="mb-5 block max-w-md text-xs font-semibold">Organization
            <select value={partnerId} onChange={(event) => void load(event.target.value)} className="mt-2 min-h-12 w-full border border-asphalt/15 bg-white px-3 text-sm">
              {memberships.map((membership) => <option key={membership.partner_id} value={membership.partner_id}>{membership.partner_organizations?.name ?? membership.partner_id}</option>)}
            </select>
          </label>
        )}
        {error && <p role="alert" className="mb-4 break-words border border-route/30 bg-route/5 p-4 text-sm text-route">{error}</p>}
        {notice && <p role="status" className="mb-4 break-words border border-emerald-700/25 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
        {!canManage && memberships.length > 0 && <p className="mb-4 border border-amber/35 bg-amber/10 p-4 text-sm">Only Partner owners and admins can accept or reject freight requests.</p>}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Pending requests" value={requests.filter((request) => request.status === "pending").length} />
          <Metric label="Awaiting HALLO" value={requests.filter((request) => request.status === "accepted").length} />
          <Metric label="Confirmed" value={requests.filter((request) => request.status === "confirmed").length} />
          <Metric label="Dispatch-ready trucks" value={dispatchReady.length} />
        </div>

        {loading ? <p className="mt-5 border border-asphalt/10 bg-white p-10 text-center font-mono text-xs text-steel">Loading Partner dispatch…</p> : requests.length === 0 ? (
          <p className="mt-5 border border-asphalt/10 bg-white p-10 text-center text-sm text-steel">No HALLO Partner job requests yet.</p>
        ) : (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {requests.map((request) => {
              const order = request.order;
              const pending = request.status === "pending";
              return (
                <article key={request.id} className={`min-w-0 border p-4 sm:p-5 ${requestTone(request.status)}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-all font-mono text-xs font-bold text-amber-dim">{order?.tracking_id ?? request.order_id}</p>
                      <h2 className="mt-2 break-words font-display text-xl font-bold">{order ? `${order.pickup_address} → ${order.dropoff_address}` : "Order details unavailable"}</h2>
                    </div>
                    <span className="shrink-0 bg-asphalt px-3 py-2 text-[10px] font-semibold uppercase text-white">{title(request.status)}</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <Value label="Truck type" value={order?.vehicle_type ?? "Unknown"} />
                    <Value label="Cargo weight" value={order?.cargo_weight_tons ? `${Number(order.cargo_weight_tons)} ton` : "Not recorded"} />
                    <Value label="Cargo" value={order?.cargo_description ?? "Not recorded"} />
                    <Value label="Offered" value={new Date(request.offered_at).toLocaleString()} />
                  </div>
                  {request.offer_note && <p className="mt-4 break-words border-l-2 border-amber pl-3 text-sm text-steel">{request.offer_note}</p>}
                  {request.selected_truck_id && <p className="mt-4 rounded-xl bg-white/70 p-3 text-xs font-semibold">{request.truck_label} · {request.driver_label}</p>}
                  {pending && canManage && (
                    <form className="mt-5 space-y-3 border-t border-asphalt/10 pt-4">
                      <label className="block text-xs font-semibold">Dispatch-ready truck and driver
                        <select value={truckByRequest[request.id] ?? ""} onChange={(event) => setTruckByRequest((current) => ({ ...current, [request.id]: event.target.value }))} className="mt-2 min-h-12 w-full border border-asphalt/15 bg-white px-3 font-normal">
                          <option value="">Choose truck</option>
                          {dispatchReady.map((vehicle) => <option key={vehicle.vehicle_id} value={vehicle.vehicle_id}>{vehicle.plate_number} · {vehicle.vehicle_type} · {vehicle.assigned_driver_name ?? "Driver"}</option>)}
                        </select>
                      </label>
                      {dispatchReady.length === 0 && <p className="text-xs leading-5 text-route">No driver-bound compliant truck is ready. HALLO Admin must assign an approved driver and clear fleet compliance first.</p>}
                      <label className="block text-xs font-semibold">Response note
                        <textarea value={noteByRequest[request.id] ?? ""} onChange={(event) => setNoteByRequest((current) => ({ ...current, [request.id]: event.target.value }))} rows={3} maxLength={1000} className="mt-2 w-full border border-asphalt/15 bg-white px-3 py-3 font-normal" />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" disabled={Boolean(busyKey) || dispatchReady.length === 0} onClick={(event) => void respond(event, request, "accept")} className="min-h-12 bg-emerald-700 px-3 text-xs font-semibold text-white disabled:opacity-40">{busyKey === `accept:${request.id}` ? "Accepting…" : "Accept job"}</button>
                        <button type="button" disabled={Boolean(busyKey)} onClick={(event) => void respond(event, request, "reject")} className="min-h-12 border border-route/35 px-3 text-xs font-semibold text-route disabled:opacity-40">{busyKey === `reject:${request.id}` ? "Rejecting…" : "Reject"}</button>
                      </div>
                    </form>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="min-w-0 border border-asphalt/10 bg-white p-4"><p className="break-words font-mono text-[9px] uppercase tracking-wide text-steel">{label}</p><p className="mt-3 font-display text-2xl font-bold">{value}</p></div>;
}

function Value({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="font-mono text-[9px] uppercase tracking-wide text-steel">{label}</p><p className="mt-1 break-words font-semibold">{value}</p></div>;
}
