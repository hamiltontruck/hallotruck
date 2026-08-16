import { useEffect, useState } from "react";
import { assignOrder, type AdminOrder } from "../../services/admin.service";
import {
  getAdminCustomerDispatchPreference,
  getOrderAssignmentCandidates,
  type AdminCustomerDispatchPreference,
  type AssignmentCandidate,
} from "../../services/admin-dispatch.service";

export function AdminDispatchMatchModal({
  order,
  onClose,
  onAssigned,
}: {
  order: AdminOrder;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [candidates, setCandidates] = useState<AssignmentCandidate[]>([]);
  const [preference, setPreference] = useState<AdminCustomerDispatchPreference | null>(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [rows, customerPreference] = await Promise.all([
        getOrderAssignmentCandidates(order.id),
        getAdminCustomerDispatchPreference(order.id),
      ]);
      const ordered = customerPreference?.status === "requested"
        ? [...rows].sort((left, right) => Number(isPreferred(right, customerPreference)) - Number(isPreferred(left, customerPreference)))
        : rows;
      setCandidates(ordered);
      setPreference(customerPreference);
      const preferredCandidate = ordered.find((candidate) => customerPreference && isPreferred(candidate, customerPreference));
      const selected = preferredCandidate ?? ordered[0];
      setSelectedKey(selected ? `${selected.driver_id}:${selected.truck_id}` : "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not find matching drivers.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [order.id]);

  async function assign() {
    const candidate = candidates.find((item) => `${item.driver_id}:${item.truck_id}` === selectedKey);
    if (!candidate) {
      setError("Choose a driver and truck match first.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await assignOrder(order.id, candidate.truck_id, candidate.driver_id);
      onAssigned();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assignment failed.");
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] bg-asphalt/75 p-0 sm:p-5">
      <div className="mx-auto flex h-full max-w-3xl flex-col overflow-hidden bg-[#f5f3ed] shadow-2xl sm:h-[calc(100vh-40px)] sm:rounded-2xl">
        <header className="flex items-start justify-between gap-4 bg-asphalt px-5 py-5 text-white sm:px-7">
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-[.2em] text-amber">SMART DISPATCH MATCH</p>
            <h2 className="mt-2 font-display text-2xl font-bold">Nearest eligible driver</h2>
            <p className="mt-1 truncate text-xs text-white/55">{order.tracking_id} · {order.pickup_address}</p>
          </div>
          <button type="button" onClick={onClose} className="border border-white/20 px-3 py-2 text-sm">Close ×</button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-7">
          <section className="grid gap-3 sm:grid-cols-3">
            <Summary label="Cargo" value={order.cargo_description ?? "General cargo"} />
            <Summary label="Required truck" value={order.vehicle_type} />
            <Summary label="Pickup" value={order.pickup_address} />
          </section>

          <div className="mt-5 rounded-xl border border-amber/30 bg-amber/10 p-4 text-xs leading-5 text-amber-dim">
            Candidates must be approved, fully documented, online within the last 30 minutes, free from another active trip, and paired with a truck that matches the vehicle type and cargo tonnage.
          </div>

          {preference?.status === "requested" && (
            <div className="mt-4 rounded-xl border border-emerald-700/20 bg-emerald-50 p-4 text-xs leading-5 text-emerald-900">
              <strong>Customer preferred a verified match.</strong> The requested driver and truck are ranked first when still eligible.
              {preference.distance_km !== null && <span> Approximate pickup distance: {preference.distance_km} km.</span>}
              {preference.eta_minutes !== null && <span> Estimated arrival: {preference.eta_minutes} min.</span>}
            </div>
          )}

          {error && <p className="mt-5 border border-route/30 bg-route/5 p-4 text-sm text-route">{error}</p>}

          <div className="mt-6 flex items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] tracking-[.18em] text-emerald-700">RANKED BY PICKUP DISTANCE</p>
              <h3 className="mt-1 font-display text-xl font-semibold">Available matches</h3>
            </div>
            <button type="button" onClick={() => void load()} disabled={loading || saving} className="text-xs font-semibold text-amber-dim disabled:opacity-50">↻ Refresh</button>
          </div>

          {loading ? (
            <div className="mt-4 border border-asphalt/10 bg-white p-10 text-center text-sm text-steel">Finding eligible drivers and trucks…</div>
          ) : candidates.length ? (
            <div className="mt-4 grid gap-3">
              {candidates.map((candidate, index) => {
                const key = `${candidate.driver_id}:${candidate.truck_id}`;
                const selected = key === selectedKey;
                const preferred = preference?.status === "requested" && isPreferred(candidate, preference);
                return (
                  <label key={key} className={`block cursor-pointer rounded-2xl border p-4 transition sm:p-5 ${selected ? "border-emerald-600 bg-emerald-50 shadow-sm" : "border-asphalt/10 bg-white hover:border-amber"}`}>
                    <input type="radio" name="dispatchCandidate" value={key} checked={selected} onChange={() => setSelectedKey(key)} className="sr-only" />
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {preferred && <span className="rounded-full bg-amber px-3 py-1 text-[9px] font-semibold uppercase text-asphalt">Customer preferred</span>}
                          {index === 0 && !preferred && <span className="rounded-full bg-emerald-700 px-3 py-1 text-[9px] font-semibold uppercase text-white">Nearest match</span>}
                          <span className="font-mono text-[10px] text-steel">GPS {new Date(candidate.presence_updated_at).toLocaleTimeString()}</span>
                        </div>
                        <p className="mt-2 font-display text-xl font-bold text-asphalt">{candidate.driver_name ?? "Approved driver"}</p>
                        <p className="mt-1 text-sm font-semibold text-emerald-800">{candidate.driver_phone ?? "Phone unavailable"}</p>
                      </div>
                      <div className="rounded-xl bg-asphalt px-4 py-3 text-right text-white">
                        <p className="font-display text-2xl font-bold text-amber">{candidate.distance_km.toLocaleString()} km</p>
                        <p className="mt-1 text-[9px] uppercase tracking-wider text-white/50">from pickup</p>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                      <CandidateInfo label="Plate" value={candidate.plate_number} />
                      <CandidateInfo label="Truck" value={candidate.vehicle_type} />
                      <CandidateInfo label="Capacity" value={candidate.capacity_tons === null ? "Not set" : `${candidate.capacity_tons} ton`} />
                      <CandidateInfo label="GPS accuracy" value={candidate.location_accuracy_m === null ? "—" : `±${Math.round(candidate.location_accuracy_m)} m`} />
                    </div>
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-asphalt/20 bg-white p-7 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-amber/10 text-xl">⌖</div>
              <h4 className="mt-4 font-display text-lg font-semibold">No eligible online match yet</h4>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-steel">Ask an approved driver with a matching verified truck to open Driver Jobs and tap “Go online & share location.” The candidate appears here after GPS is received.</p>
            </div>
          )}
        </div>

        <footer className="flex flex-col-reverse gap-3 border-t border-asphalt/10 bg-white p-4 sm:flex-row sm:justify-end sm:px-7">
          <button type="button" onClick={onClose} className="min-h-12 border border-asphalt px-5 py-3 text-sm font-semibold">Cancel</button>
          <button type="button" onClick={() => void assign()} disabled={saving || !selectedKey} className="min-h-12 bg-emerald-700 px-6 py-3 text-sm font-semibold text-white disabled:opacity-40">
            {saving ? "Assigning securely…" : "Assign selected driver & truck"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function isPreferred(candidate: AssignmentCandidate, preference: AdminCustomerDispatchPreference) {
  return candidate.driver_id === preference.driver_id && candidate.truck_id === preference.truck_id;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 border border-asphalt/10 bg-white p-4"><p className="font-mono text-[9px] uppercase tracking-[.14em] text-steel">{label}</p><p className="mt-2 truncate text-sm font-semibold text-asphalt">{value}</p></div>;
}

function CandidateInfo({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-white/70 p-3"><p className="text-[9px] uppercase tracking-wider text-steel">{label}</p><p className="mt-1 font-semibold text-asphalt">{value}</p></div>;
}
