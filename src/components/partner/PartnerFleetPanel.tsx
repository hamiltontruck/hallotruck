import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { filterFleetVehicles } from "../../domain/fleet-management";
import {
  createFleetBranch,
  createFleetVehicle,
  createMaintenanceRecord,
  getFleetEnterpriseData,
  updateFleetVehicleProfile,
  type FleetEnterpriseData,
  type FleetFuelType,
  type FleetOwnershipType,
  type FleetVehicle,
  type MaintenanceStatus,
  type MaintenanceType,
} from "../../services/fleet-maintenance.service";

const empty: FleetEnterpriseData = { vehicles: [], records: [], branches: [], audit: [], drivers: [], summary: { total: 0, available: 0, assigned: 0, on_trip: 0, maintenance: 0, suspended: 0, inactive: 0, expiry_alerts: 0, service_alerts: 0, dispatch_ready: 0 } };
const fuels: FleetFuelType[] = ["diesel", "petrol", "electric", "hybrid", "cng", "other"];
const maintenanceTypes: MaintenanceType[] = ["scheduled_service", "oil_change", "tyres", "repair", "inspection", "insurance", "permit", "other"];
const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const optionalNumber = (form: FormData, name: string) => { const value = field(form, name); return value ? Number(value) : null; };
const title = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const showDate = (value: string | null) => value ? new Date(`${value}T00:00:00`).toLocaleDateString() : "Not recorded";

export function PartnerFleetPanel({ partnerId, canManage, fixture, executeAction = (action) => action() }: { partnerId: string; canManage: boolean; fixture?: FleetEnterpriseData; executeAction?: (action: () => Promise<unknown>) => Promise<unknown> }) {
  const [data, setData] = useState<FleetEnterpriseData>(empty);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeAction, setActiveAction] = useState<null | { key: string; message: string }>(null);
  const saving = activeAction !== null;
  const busyMessage = activeAction?.message ?? "";
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(fixture ?? await getFleetEnterpriseData(partnerId)); setError(""); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Partner fleet could not be loaded."); }
    finally { setLoading(false); }
  }, [fixture, partnerId]);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => filterFleetVehicles(data.vehicles, { query, status: "all", health: "all", branchId: "all" }), [data.vehicles, query]);

  async function run(actionKey: string, message: string, action: () => Promise<unknown>, success: string) {
    if (activeAction) return;
    setActiveAction({ key: actionKey, message }); setError(""); setNotice("");
    try { await executeAction(action); setNotice(success); await load(); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Fleet action could not be completed."); }
    finally { setActiveAction(null); }
  }

  function submitVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void run("register_vehicle", "Registering a Partner vehicle. Other fleet actions are temporarily locked until this update finishes.", () => createFleetVehicle({ partnerId, plateNumber: field(form, "plate"), vehicleType: field(form, "vehicleType"), capacityTons: optionalNumber(form, "capacity"), ownershipType: field(form, "ownership") as FleetOwnershipType, fuelType: (field(form, "fuel") || null) as FleetFuelType | null, branchId: field(form, "branch") || null }), "Partner vehicle registered.");
  }

  function submitBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void run("create_branch", "Creating a Partner fleet branch. Other fleet actions are temporarily locked until this update finishes.", () => createFleetBranch(partnerId, field(form, "name"), field(form, "code"), field(form, "address")), "Partner fleet branch created.");
  }

  return <section className="space-y-5" data-testid="partner-fleet-panel" aria-busy={saving} aria-describedby={saving ? "partner-fleet-action-guidance" : undefined}>
    {saving && <p id="partner-fleet-action-guidance" role="status" aria-live="polite" className="break-words border border-sky-700/25 bg-sky-50 p-4 text-sm font-semibold text-sky-900">{busyMessage}</p>}
    {error && <div role="alert" className="flex flex-col gap-3 border border-route/30 bg-route/5 p-4 text-sm text-route sm:flex-row sm:items-center sm:justify-between"><span>{error}</span><button onClick={() => void load()} className="min-h-11 border border-route px-4 font-semibold">Retry</button></div>}
    {notice && <p role="status" className="border border-emerald-700/25 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <FleetMetric label="Total fleet" value={data.summary.total} detail="Organization vehicles" />
      <FleetMetric label="Dispatch ready" value={data.summary.dispatch_ready} detail="Available and compliant" />
      <FleetMetric label="On trip" value={data.summary.on_trip} detail="Active freight" />
      <FleetMetric label="Service alerts" value={data.summary.service_alerts} detail="Maintenance due" danger={data.summary.service_alerts > 0} />
      <FleetMetric label="Expiry alerts" value={data.summary.expiry_alerts} detail="Within 30 days" danger={data.summary.expiry_alerts > 0} />
    </div>

    {canManage && <div className="grid gap-4 lg:grid-cols-2">
      <details className="rounded-2xl border border-asphalt/10 bg-white p-4 sm:p-5"><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Register Partner vehicle</summary><form onSubmit={submitVehicle} aria-busy={activeAction?.key === "register_vehicle"} className="mt-4 grid gap-3 sm:grid-cols-2"><Input name="plate" label="Plate number" required /><Input name="vehicleType" label="Truck type" required /><Input name="capacity" label="Capacity (tons)" type="number" step="0.01" /><Select name="ownership" label="Ownership" values={["partner", "leased", "owner_operator"]} /><Select name="fuel" label="Fuel" values={fuels} /><label className="text-xs font-semibold">Branch<select name="branch" className="mt-2 min-h-12 w-full rounded-xl border border-asphalt/15 bg-white px-3 font-normal"><option value="">No branch</option>{data.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><button disabled={saving} aria-describedby={saving ? "partner-fleet-action-guidance" : undefined} title={saving ? busyMessage : "Register Partner vehicle"} className="min-h-12 bg-asphalt px-4 text-sm font-semibold text-white disabled:opacity-40 sm:col-span-2">{activeAction?.key === "register_vehicle" ? "Registering vehicle…" : "Register vehicle"}</button></form></details>
      <details className="rounded-2xl border border-asphalt/10 bg-white p-4 sm:p-5"><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Create fleet branch</summary><form onSubmit={submitBranch} aria-busy={activeAction?.key === "create_branch"} className="mt-4 grid gap-3 sm:grid-cols-2"><Input name="name" label="Branch name" required /><Input name="code" label="Branch code" required pattern="[A-Za-z0-9_-]{2,30}" /><Input name="address" label="Address" span /><button disabled={saving} aria-describedby={saving ? "partner-fleet-action-guidance" : undefined} title={saving ? busyMessage : "Create Partner fleet branch"} className="min-h-12 bg-asphalt px-4 text-sm font-semibold text-white disabled:opacity-40 sm:col-span-2">{activeAction?.key === "create_branch" ? "Creating branch…" : "Create branch"}</button></form></details>
    </div>}

    <div className="rounded-2xl border border-asphalt/10 bg-white p-4 sm:p-5"><label className="text-xs font-semibold">Search Partner fleet<input value={query} onChange={(event) => setQuery(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-asphalt/15 px-4 font-normal" placeholder="Plate, truck, driver or branch" /></label><p className="mt-3 text-xs text-steel">{visible.length} vehicles</p></div>

    {loading ? <p className="border border-asphalt/10 bg-white p-10 text-center font-mono text-xs text-steel">Loading Partner fleet…</p> : visible.length ? <div className="grid gap-4 md:grid-cols-2">{visible.map((vehicle) => <PartnerVehicle key={vehicle.vehicle_id} vehicle={vehicle} data={data} canManage={canManage} activeAction={activeAction} busyMessage={busyMessage} run={run} />)}</div> : <p className="border border-asphalt/10 bg-white p-10 text-center text-sm text-steel">No Partner fleet vehicles match this search.</p>}

    <div className="overflow-hidden rounded-2xl border border-asphalt/10 bg-white"><div className="border-b border-asphalt/10 p-4 sm:p-5"><h3 className="font-display text-xl font-semibold">Fleet activity</h3><p className="mt-1 text-xs text-steel">Immutable organization-scoped audit history</p></div>{data.audit.length ? <div className="divide-y divide-asphalt/10">{data.audit.slice(0, 30).map((event) => <article key={event.id} className="p-4"><p className="text-sm font-semibold">{title(event.event_type)}</p><p className="mt-1 break-words text-xs text-steel">{event.reason ?? "System-recorded fleet event"} · {new Date(event.created_at).toLocaleString()}</p></article>)}</div> : <p className="p-8 text-center text-sm text-steel">No fleet activity yet.</p>}</div>
  </section>;
}

function PartnerVehicle({ vehicle, data, canManage, activeAction, busyMessage, run }: { vehicle: FleetVehicle; data: FleetEnterpriseData; canManage: boolean; activeAction: { key: string; message: string } | null; busyMessage: string; run: (actionKey: string, message: string, action: () => Promise<unknown>, success: string) => Promise<void> }) {
  const saving = activeAction !== null;
  function profile(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); void run(`profile:${vehicle.vehicle_id}`, "Saving the vehicle compliance profile. Other fleet actions are temporarily locked until this update finishes.", () => updateFleetVehicleProfile({ truckId: vehicle.vehicle_id, ownershipType: field(form, "ownership") as FleetOwnershipType, fuelType: (field(form, "fuel") || null) as FleetFuelType | null, branchId: field(form, "branch") || null, currentOdometerKm: optionalNumber(form, "odometer"), insuranceExpiry: field(form, "insurance") || null, licenseExpiry: field(form, "license") || null, roadworthinessExpiry: field(form, "roadworthiness") || null, reason: field(form, "reason") }), `${vehicle.plate_number} profile updated.`); }
  function maintenance(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); void run(`maintenance:${vehicle.vehicle_id}`, "Recording vehicle maintenance. Other fleet actions are temporarily locked until this update finishes.", () => createMaintenanceRecord({ truckId: vehicle.vehicle_id, maintenanceType: field(form, "type") as MaintenanceType, status: field(form, "status") as MaintenanceStatus, serviceDate: field(form, "serviceDate"), odometerKm: optionalNumber(form, "odometer"), costEtb: optionalNumber(form, "cost") ?? 0, vendor: field(form, "vendor"), notes: field(form, "notes"), nextServiceDate: field(form, "nextDate"), nextServiceOdometerKm: optionalNumber(form, "nextOdometer") }), `${vehicle.plate_number} maintenance recorded.`); }
  return <article className={`min-w-0 rounded-2xl border p-4 sm:p-5 ${vehicle.health_status === "critical" ? "border-route/30 bg-route/5" : vehicle.health_status === "attention" ? "border-amber/40 bg-amber/5" : "border-asphalt/10 bg-white"}`} data-testid="partner-fleet-card"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-all font-mono text-sm font-bold">{vehicle.plate_number}</p><p className="mt-1 break-words text-xs text-steel">{vehicle.vehicle_type} · {vehicle.capacity_tons ?? "—"} ton</p></div><span className="shrink-0 rounded-full bg-bone px-3 py-1 text-[9px] font-semibold uppercase">{title(vehicle.status)}</span></div><div className="mt-4 grid grid-cols-2 gap-2 text-xs"><Value label="Health" value={title(vehicle.health_status)} /><Value label="Branch" value={vehicle.branch_name ?? "Unassigned"} /><Value label="Driver" value={vehicle.assigned_driver_name ?? "Unassigned"} /><Value label="Odometer" value={vehicle.current_odometer_km === null ? "Not recorded" : `${Number(vehicle.current_odometer_km).toLocaleString()} km`} /><Value label="Insurance" value={showDate(vehicle.insurance_expiry)} /><Value label="Roadworthy" value={showDate(vehicle.roadworthiness_expiry)} /></div>{vehicle.active_trip_id && <p className="mt-3 rounded-xl bg-sky-50 p-3 text-xs font-semibold text-sky-800">Active trip: {vehicle.active_trip_reference ?? vehicle.active_trip_id}</p>}<p className="mt-3 text-xs text-steel">Next service: {showDate(vehicle.next_service_date)}</p>{canManage && <div className="mt-4 space-y-3 border-t border-asphalt/10 pt-4"><details><summary className="min-h-11 cursor-pointer py-2 text-xs font-semibold">Edit compliance profile</summary><form onSubmit={profile} aria-busy={activeAction?.key === `profile:${vehicle.vehicle_id}`} className="mt-3 grid gap-3"><Select name="ownership" label="Ownership" values={["partner", "leased", "owner_operator"]} defaultValue={vehicle.ownership_type} /><Select name="fuel" label="Fuel" values={fuels} defaultValue={vehicle.fuel_type ?? "diesel"} /><label className="text-xs font-semibold">Branch<select name="branch" defaultValue={vehicle.branch_id ?? ""} className="mt-2 min-h-12 w-full rounded-xl border border-asphalt/15 bg-white px-3"><option value="">No branch</option>{data.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><Input name="odometer" label="Odometer (km)" type="number" step="0.1" defaultValue={vehicle.current_odometer_km?.toString()} /><Input name="insurance" label="Insurance expiry" type="date" defaultValue={vehicle.insurance_expiry ?? undefined} /><Input name="license" label="License expiry" type="date" defaultValue={vehicle.license_expiry ?? undefined} /><Input name="roadworthiness" label="Roadworthiness expiry" type="date" defaultValue={vehicle.roadworthiness_expiry ?? undefined} /><Input name="reason" label="Change reason" required /><button disabled={saving} aria-describedby={saving ? "partner-fleet-action-guidance" : undefined} title={saving ? busyMessage : `Save ${vehicle.plate_number} compliance profile`} className="min-h-12 bg-emerald-700 px-4 text-xs font-semibold text-white disabled:opacity-40">{activeAction?.key === `profile:${vehicle.vehicle_id}` ? "Saving profile…" : "Save profile"}</button></form></details><details><summary className="min-h-11 cursor-pointer py-2 text-xs font-semibold">Add maintenance</summary><form onSubmit={maintenance} aria-busy={activeAction?.key === `maintenance:${vehicle.vehicle_id}`} className="mt-3 grid gap-3"><Select name="type" label="Maintenance type" values={maintenanceTypes} /><Select name="status" label="Work status" values={["scheduled", "in_progress", "completed", "cancelled"]} /><Input name="serviceDate" label="Service date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /><Input name="odometer" label="Odometer" type="number" step="0.1" /><Input name="cost" label="Cost ETB" type="number" step="0.01" defaultValue="0" /><Input name="vendor" label="Vendor" /><Input name="nextDate" label="Next service" type="date" /><Input name="nextOdometer" label="Next odometer" type="number" step="0.1" /><Input name="notes" label="Notes" /><button disabled={saving} aria-describedby={saving ? "partner-fleet-action-guidance" : undefined} title={saving ? busyMessage : `Save ${vehicle.plate_number} maintenance record`} className="min-h-12 bg-asphalt px-4 text-xs font-semibold text-white disabled:opacity-40">{activeAction?.key === `maintenance:${vehicle.vehicle_id}` ? "Saving maintenance…" : "Save maintenance"}</button></form></details></div>}</article>;
}

function FleetMetric({ label, value, detail, danger = false }: { label: string; value: number; detail: string; danger?: boolean }) { return <article className={`min-w-0 border p-4 ${danger ? "border-route/30 bg-route/5" : "border-asphalt/10 bg-white"}`}><p className="break-words font-mono text-[9px] uppercase tracking-wide text-steel">{label}</p><p className={`mt-3 font-display text-2xl font-bold ${danger ? "text-route" : "text-asphalt"}`}>{value}</p><p className="mt-2 break-words text-[11px] text-steel">{detail}</p></article>; }
function Value({ label, value }: { label: string; value: string }) { return <div className="min-w-0 rounded-xl bg-white p-3"><p className="text-[9px] uppercase tracking-wide text-steel">{label}</p><p className="mt-1 break-words font-semibold">{value}</p></div>; }
function Input({ name, label, type = "text", required = false, step, pattern, defaultValue, span = false }: { name: string; label: string; type?: string; required?: boolean; step?: string; pattern?: string; defaultValue?: string; span?: boolean }) { return <label className={`text-xs font-semibold ${span ? "sm:col-span-2" : ""}`}>{label}<input name={name} type={type} required={required} step={step} pattern={pattern} defaultValue={defaultValue} min={type === "number" ? 0 : undefined} className="mt-2 min-h-12 w-full rounded-xl border border-asphalt/15 px-3 font-normal" /></label>; }
function Select({ name, label, values, defaultValue }: { name: string; label: string; values: readonly string[]; defaultValue?: string }) { return <label className="text-xs font-semibold">{label}<select name={name} defaultValue={defaultValue ?? values[0]} className="mt-2 min-h-12 w-full rounded-xl border border-asphalt/15 bg-white px-3 font-normal">{values.map((value) => <option key={value} value={value}>{title(value)}</option>)}</select></label>; }
