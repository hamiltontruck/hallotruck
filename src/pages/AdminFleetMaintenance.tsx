import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { filterFleetVehicles } from "../domain/fleet-management";
import {
  assignFleetDriver,
  createFleetBranch,
  createFleetVehicle,
  createMaintenanceRecord,
  getFleetEnterpriseData,
  setTruckOperationalStatus,
  updateFleetVehicleProfile,
  updateMaintenanceStatus,
  type FleetBranch,
  type FleetEnterpriseData,
  type FleetFuelType,
  type FleetHealthStatus,
  type FleetOwnershipType,
  type FleetVehicle,
  type MaintenanceStatus,
  type MaintenanceType,
  type TruckOperationalStatus,
} from "../services/fleet-maintenance.service";

const emptyData: FleetEnterpriseData = {
  vehicles: [], records: [], branches: [], audit: [], drivers: [],
  summary: { total: 0, available: 0, assigned: 0, on_trip: 0, maintenance: 0, suspended: 0, inactive: 0, expiry_alerts: 0, service_alerts: 0, dispatch_ready: 0 },
};
const statuses: TruckOperationalStatus[] = ["available", "assigned", "on_trip", "maintenance", "suspended", "inactive"];
const fuels: FleetFuelType[] = ["diesel", "petrol", "electric", "hybrid", "cng", "other"];
const maintenanceTypes: MaintenanceType[] = ["scheduled_service", "oil_change", "tyres", "repair", "inspection", "insurance", "permit", "other"];
const today = () => new Date().toISOString().slice(0, 10);
const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const numberOrNull = (form: FormData, name: string) => { const value = text(form, name); return value ? Number(value) : null; };
const dateOrNull = (form: FormData, name: string) => text(form, name) || null;

function label(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function date(value: string | null) { return value ? new Date(`${value}T00:00:00`).toLocaleDateString() : "Not recorded"; }
function dateTime(value: string) { return new Date(value).toLocaleString(); }
function money(value: number) { return `ETB ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`; }

export function AdminFleetMaintenance({ fixture }: { fixture?: FleetEnterpriseData } = {}) {
  const [data, setData] = useState<FleetEnterpriseData>(emptyData);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | TruckOperationalStatus>("all");
  const [health, setHealth] = useState<"all" | FleetHealthStatus>("all");
  const [branch, setBranch] = useState("all");
  const [modal, setModal] = useState<"vehicle" | "branch" | "maintenance" | "profile" | null>(null);
  const [selected, setSelected] = useState<FleetVehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(fixture ?? await getFleetEnterpriseData()); setError(""); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Fleet control data could not be loaded."); }
    finally { setLoading(false); }
  }, [fixture]);
  useEffect(() => { void load(); }, [load]);

  const recordsByTruck = useMemo(() => {
    const result = new Map<string, FleetEnterpriseData["records"]>();
    data.records.forEach((record) => result.set(record.truck_id, [...(result.get(record.truck_id) ?? []), record]));
    return result;
  }, [data.records]);

  const visible = useMemo(() => filterFleetVehicles(data.vehicles, { query, status, health, branchId: branch }), [branch, data.vehicles, health, query, status]);

  async function run(action: () => Promise<unknown>, success: string) {
    setSaving(true); setError(""); setNotice("");
    try { await action(); setNotice(success); setModal(null); setSelected(null); await load(); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Fleet action could not be completed."); }
    finally { setSaving(false); }
  }

  function openProfile(vehicle: FleetVehicle) { setSelected(vehicle); setModal("profile"); }
  function openMaintenance(vehicle?: FleetVehicle) { setSelected(vehicle ?? null); setModal("maintenance"); }
  function changeMaintenanceStatus(recordId: string, nextStatus: MaintenanceStatus) {
    const reason = window.prompt(`Reason for changing maintenance to ${label(nextStatus)}:`)?.trim();
    if (!reason) return;
    void run(() => updateMaintenanceStatus(recordId, nextStatus, reason), "Maintenance status updated.");
  }

  return (
    <main className="mx-auto max-w-[1500px] overflow-x-hidden px-3 py-6 sm:px-7 lg:px-10 lg:py-10" data-testid="fleet-enterprise-page">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[.2em] text-amber-dim">FLEET MANAGEMENT ENTERPRISE</p>
          <h1 className="mt-2 break-words font-display text-3xl font-bold text-asphalt sm:text-4xl">Fleet control center</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-steel">Availability, assignments, active trips, maintenance, expiry compliance and immutable fleet audit in one operational view.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <button type="button" onClick={() => void load()} disabled={loading} className="min-h-12 border border-asphalt px-4 py-3 text-xs font-semibold disabled:opacity-50">{loading ? "Refreshing…" : "Refresh"}</button>
          <button type="button" onClick={() => setModal("branch")} className="min-h-12 border border-asphalt px-4 py-3 text-xs font-semibold">Add branch</button>
          <button type="button" onClick={() => setModal("vehicle")} className="col-span-2 min-h-12 bg-asphalt px-5 py-3 text-xs font-semibold text-white sm:col-auto">Add vehicle</button>
        </div>
      </header>

      {error && <div role="alert" className="mt-5 flex flex-col gap-3 border border-route/30 bg-route/5 p-4 text-sm text-route sm:flex-row sm:items-center sm:justify-between"><span>{error}</span><button onClick={() => void load()} className="min-h-11 border border-route px-4 font-semibold">Retry</button></div>}
      {notice && <p role="status" className="mt-5 border border-emerald-700/25 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}

      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Fleet summary">
        <Metric label="Total fleet" value={data.summary.total} detail="Registered vehicles" />
        <Metric label="Dispatch ready" value={data.summary.dispatch_ready} detail="Available and compliant" tone="good" />
        <Metric label="On trip" value={data.summary.on_trip} detail="Active freight" />
        <Metric label="Maintenance" value={data.summary.maintenance} detail={`${data.summary.service_alerts} service alerts`} tone={data.summary.service_alerts ? "warn" : "plain"} />
        <Metric label="Expiry alerts" value={data.summary.expiry_alerts} detail="Due within 30 days" tone={data.summary.expiry_alerts ? "danger" : "plain"} />
      </section>

      <section className="mt-6 rounded-2xl border border-asphalt/10 bg-white p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-semibold">Search fleet<input value={query} onChange={(event) => setQuery(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-asphalt/15 px-4 font-normal" placeholder="Plate, truck, driver or branch" /></label>
          <Select label="Status" value={status} onChange={setStatus} options={["all", ...statuses]} />
          <Select label="Health" value={health} onChange={setHealth} options={["all", "healthy", "attention", "critical"]} />
          <label className="text-xs font-semibold">Branch<select value={branch} onChange={(event) => setBranch(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-asphalt/15 bg-white px-4 font-normal"><option value="all">All branches</option>{data.branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </div>
        <p className="mt-4 text-xs text-steel">Showing {visible.length} of {data.vehicles.length} vehicles</p>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-asphalt/10 bg-white">
        <div className="border-b border-asphalt/10 p-5"><p className="font-mono text-[10px] tracking-[.18em] text-emerald-700">AVAILABILITY BOARD</p><h2 className="mt-1 font-display text-xl font-semibold">Vehicle health and assignment</h2></div>
        {loading ? <p className="p-12 text-center font-mono text-xs text-steel">Loading fleet…</p> : visible.length ? (
          <div className="grid gap-4 p-3 sm:p-5 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((vehicle) => <VehicleCard key={vehicle.vehicle_id} vehicle={vehicle} drivers={data.drivers} saving={saving} records={recordsByTruck.get(vehicle.vehicle_id) ?? []} onProfile={() => openProfile(vehicle)} onMaintenance={() => openMaintenance(vehicle)} onStatus={(next, reason) => run(() => setTruckOperationalStatus(vehicle.vehicle_id, next, reason), `${vehicle.plate_number} status updated.`)} onAssign={(driverId, reason) => run(() => assignFleetDriver(vehicle.vehicle_id, driverId, reason), `${vehicle.plate_number} driver assignment updated.`)} />)}
          </div>
        ) : <p className="p-10 text-center text-sm text-steel">No vehicles match the selected filters.</p>}
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-asphalt/10 bg-white">
        <div className="flex flex-col gap-3 border-b border-asphalt/10 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-mono text-[10px] tracking-[.18em] text-amber-dim">MAINTENANCE SCHEDULE</p><h2 className="mt-1 font-display text-xl font-semibold">Service ledger</h2></div><button type="button" onClick={() => openMaintenance()} className="min-h-11 bg-asphalt px-4 text-xs font-semibold text-white">Add record</button></div>
        {data.records.length ? <div className="divide-y divide-asphalt/10">{data.records.slice(0, 50).map((record) => { const vehicle = data.vehicles.find((item) => item.vehicle_id === record.truck_id); return <article key={record.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="break-all font-mono text-xs font-bold">{vehicle?.plate_number ?? "Unknown vehicle"}</p><Pill value={record.status} /></div><p className="mt-2 break-words text-sm font-semibold">{label(record.maintenance_type)} · {date(record.service_date)} · {money(record.cost_etb)}</p><p className="mt-1 break-words text-xs text-steel">{record.vendor ?? "Vendor not recorded"}{record.next_service_date ? ` · Next ${date(record.next_service_date)}` : ""}</p></div><div className="grid grid-cols-2 gap-2 sm:flex">{record.status === "scheduled" && <button disabled={saving} onClick={() => changeMaintenanceStatus(record.id, "in_progress")} className="min-h-11 border border-amber-dim px-3 text-xs font-semibold text-amber-dim disabled:opacity-40">Start work</button>}{record.status === "in_progress" && <button disabled={saving} onClick={() => changeMaintenanceStatus(record.id, "completed")} className="min-h-11 bg-emerald-700 px-3 text-xs font-semibold text-white disabled:opacity-40">Complete</button>}{!(["completed", "cancelled"] as MaintenanceStatus[]).includes(record.status) && <button disabled={saving} onClick={() => changeMaintenanceStatus(record.id, "cancelled")} className="min-h-11 border border-route px-3 text-xs font-semibold text-route disabled:opacity-40">Cancel</button>}</div></article>; })}</div> : <p className="p-8 text-center text-sm text-steel">No maintenance records yet.</p>}
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-asphalt/10 bg-white">
        <div className="border-b border-asphalt/10 p-5"><p className="font-mono text-[10px] tracking-[.18em] text-amber-dim">IMMUTABLE HISTORY</p><h2 className="mt-1 font-display text-xl font-semibold">Recent fleet audit</h2></div>
        {data.audit.length ? <div className="divide-y divide-asphalt/10">{data.audit.slice(0, 40).map((event) => <article key={event.id} className="grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5"><div className="min-w-0"><p className="break-words text-sm font-semibold">{label(event.event_type)} · {event.source}</p><p className="mt-1 break-words text-xs text-steel">{event.reason ?? "System-recorded fleet event"}</p></div><time className="text-xs text-steel">{dateTime(event.created_at)}</time></article>)}</div> : <p className="p-8 text-center text-sm text-steel">No fleet audit events yet.</p>}
      </section>

      {modal === "vehicle" && <VehicleModal branches={data.branches} saving={saving} onClose={() => setModal(null)} onSubmit={(form) => run(() => createFleetVehicle({ plateNumber: text(form, "plate"), vehicleType: text(form, "vehicleType"), capacityTons: numberOrNull(form, "capacity"), ownershipType: text(form, "ownership") as FleetOwnershipType, fuelType: (text(form, "fuel") || null) as FleetFuelType | null, branchId: text(form, "branch") || null }), "Fleet vehicle registered.")} />}
      {modal === "branch" && <BranchModal saving={saving} onClose={() => setModal(null)} onSubmit={(form) => run(() => createFleetBranch(null, text(form, "name"), text(form, "code"), text(form, "address")), "Fleet branch created.")} />}
      {modal === "maintenance" && <MaintenanceModal vehicles={data.vehicles} selected={selected} saving={saving} onClose={() => { setModal(null); setSelected(null); }} onSubmit={(form) => run(() => createMaintenanceRecord({ truckId: text(form, "truck"), maintenanceType: text(form, "type") as MaintenanceType, status: text(form, "status") as MaintenanceStatus, serviceDate: text(form, "serviceDate"), odometerKm: numberOrNull(form, "odometer"), costEtb: numberOrNull(form, "cost") ?? 0, vendor: text(form, "vendor"), notes: text(form, "notes"), nextServiceDate: text(form, "nextDate"), nextServiceOdometerKm: numberOrNull(form, "nextOdometer") }), "Maintenance record created.")} />}
      {modal === "profile" && selected && <ProfileModal vehicle={selected} branches={data.branches} saving={saving} onClose={() => { setModal(null); setSelected(null); }} onSubmit={(form) => run(() => updateFleetVehicleProfile({ truckId: selected.vehicle_id, ownershipType: text(form, "ownership") as FleetOwnershipType, fuelType: (text(form, "fuel") || null) as FleetFuelType | null, branchId: text(form, "branch") || null, currentOdometerKm: numberOrNull(form, "odometer"), insuranceExpiry: dateOrNull(form, "insurance"), licenseExpiry: dateOrNull(form, "license"), roadworthinessExpiry: dateOrNull(form, "roadworthiness"), reason: text(form, "reason") }), `${selected.plate_number} profile updated.`)} />}
    </main>
  );
}

function VehicleCard({ vehicle, drivers, saving, records, onProfile, onMaintenance, onStatus, onAssign }: { vehicle: FleetVehicle; drivers: FleetEnterpriseData["drivers"]; saving: boolean; records: FleetEnterpriseData["records"]; onProfile: () => void; onMaintenance: () => void; onStatus: (status: TruckOperationalStatus, reason: string) => Promise<unknown>; onAssign: (driverId: string | null, reason: string) => Promise<unknown> }) {
  const [nextStatus, setNextStatus] = useState<TruckOperationalStatus>(vehicle.status);
  const [driver, setDriver] = useState(vehicle.assigned_driver_id ?? "");
  const [reason, setReason] = useState("");
  const latest = records[0];
  const disabled = saving || reason.trim().length < 3 || Boolean(vehicle.active_trip_id);
  return <article className={`min-w-0 rounded-2xl border p-4 sm:p-5 ${vehicle.health_status === "critical" ? "border-route/35 bg-route/5" : vehicle.health_status === "attention" ? "border-amber/45 bg-amber/5" : "border-asphalt/10 bg-bone/35"}`} data-testid="fleet-vehicle-card">
    <div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><p className="break-all font-mono text-sm font-bold">{vehicle.plate_number}</p><p className="mt-1 break-words text-xs text-steel">{vehicle.vehicle_type} · {vehicle.capacity_tons ?? "—"} ton</p></div><div className="flex shrink-0 flex-col items-end gap-2"><Pill value={vehicle.status} /><Pill value={vehicle.health_status} /></div></div>
    <div className="mt-4 grid grid-cols-2 gap-2 text-xs"><Info name="Branch" value={vehicle.branch_name ?? "Unassigned"} /><Info name="Driver" value={vehicle.assigned_driver_name ?? "Unassigned"} /><Info name="Odometer" value={vehicle.current_odometer_km === null ? "Not recorded" : `${Number(vehicle.current_odometer_km).toLocaleString()} km`} /><Info name="Ownership" value={label(vehicle.ownership_type)} /><Info name="Insurance" value={date(vehicle.insurance_expiry)} /><Info name="Roadworthy" value={date(vehicle.roadworthiness_expiry)} /></div>
    {vehicle.active_trip_id && <p className="mt-3 rounded-xl bg-sky-50 p-3 text-xs font-semibold text-sky-800">Active trip: {vehicle.active_trip_reference ?? vehicle.active_trip_id}</p>}
    <p className="mt-3 text-xs text-steel">Last service: {date(vehicle.last_service_date)} · Next: {date(vehicle.next_service_date)}</p>
    <p className="mt-1 text-xs text-steel">GPS: {vehicle.gps_provider ? `${vehicle.gps_provider} · ${vehicle.last_location_at ? dateTime(vehicle.last_location_at) : "No recent ping"}` : "Integration ready; provider not connected"}</p>
    <div className="mt-4 grid grid-cols-2 gap-2"><button onClick={onProfile} className="min-h-11 border border-asphalt px-3 text-xs font-semibold">Edit profile</button><button onClick={onMaintenance} className="min-h-11 bg-asphalt px-3 text-xs font-semibold text-white">Maintenance</button></div>
    <div className="mt-4 border-t border-asphalt/10 pt-4"><label className="text-[10px] font-semibold uppercase tracking-wide text-steel">Reason<input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} className="mt-2 min-h-11 w-full rounded-xl border border-asphalt/15 bg-white px-3 text-xs normal-case tracking-normal" placeholder="Required for audited changes" /></label><div className="mt-2 grid gap-2 sm:grid-cols-2"><select value={nextStatus} onChange={(event) => setNextStatus(event.target.value as TruckOperationalStatus)} className="min-h-11 min-w-0 rounded-xl border border-asphalt/15 bg-white px-2 text-xs">{statuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select><button disabled={disabled || nextStatus === vehicle.status} onClick={() => void onStatus(nextStatus, reason)} className="min-h-11 bg-emerald-700 px-3 text-xs font-semibold text-white disabled:opacity-35">Apply status</button><select value={driver} onChange={(event) => setDriver(event.target.value)} className="min-h-11 min-w-0 rounded-xl border border-asphalt/15 bg-white px-2 text-xs"><option value="">No driver</option>{drivers.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select><button disabled={disabled || driver === (vehicle.assigned_driver_id ?? "")} onClick={() => void onAssign(driver || null, reason)} className="min-h-11 border border-emerald-700 px-3 text-xs font-semibold text-emerald-800 disabled:opacity-35">Apply driver</button></div></div>
    {latest && <p className="mt-3 text-[11px] text-steel">Latest record: {label(latest.maintenance_type)} · {date(latest.service_date)} · {money(latest.cost_etb)}</p>}
  </article>;
}

function Modal({ title, detail, saving, onClose, onSubmit, children }: { title: string; detail: string; saving: boolean; onClose: () => void; onSubmit: (form: FormData) => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-asphalt/75 p-3" role="dialog" aria-modal="true" aria-label={title}><form onSubmit={(event) => { event.preventDefault(); onSubmit(new FormData(event.currentTarget)); }} className="my-auto max-h-[95vh] w-full max-w-3xl overflow-y-auto rounded-[24px] bg-white p-5 shadow-2xl sm:p-8"><div className="flex items-start justify-between gap-4"><div><h2 className="font-display text-2xl font-bold">{title}</h2><p className="mt-2 text-xs leading-5 text-steel">{detail}</p></div><button type="button" onClick={onClose} className="grid min-h-11 min-w-11 place-items-center rounded-full text-2xl" aria-label="Close">×</button></div><div className="mt-6 grid gap-4 sm:grid-cols-2">{children}</div><div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="min-h-12 border border-asphalt px-5 font-semibold">Cancel</button><button disabled={saving} className="min-h-12 bg-emerald-700 px-6 font-semibold text-white disabled:opacity-40">{saving ? "Saving…" : "Save"}</button></div></form></div>;
}

function VehicleModal({ branches, saving, onClose, onSubmit }: { branches: FleetBranch[]; saving: boolean; onClose: () => void; onSubmit: (form: FormData) => void }) { return <Modal title="Register fleet vehicle" detail="Plate numbers are normalized and unique across HALLO and Partner fleets." saving={saving} onClose={onClose} onSubmit={onSubmit}><Field name="plate" label="Plate number" required /><Field name="vehicleType" label="Truck type" required /><Field name="capacity" label="Capacity (tons)" type="number" step="0.01" /><Choice name="ownership" label="Ownership" defaultValue="company" values={["company", "leased", "owner_operator"]} /><Choice name="fuel" label="Fuel type" defaultValue="diesel" values={fuels} /><BranchChoice branches={branches} /></Modal>; }
function BranchModal({ saving, onClose, onSubmit }: { saving: boolean; onClose: () => void; onSubmit: (form: FormData) => void }) { return <Modal title="Create fleet branch" detail="Branch codes are unique within the HALLO company fleet." saving={saving} onClose={onClose} onSubmit={onSubmit}><Field name="name" label="Branch name" required /><Field name="code" label="Branch code" required pattern="[A-Za-z0-9_-]{2,30}" /><Field name="address" label="Address" span /></Modal>; }
function MaintenanceModal({ vehicles, selected, saving, onClose, onSubmit }: { vehicles: FleetVehicle[]; selected: FleetVehicle | null; saving: boolean; onClose: () => void; onSubmit: (form: FormData) => void }) { return <Modal title="Add maintenance record" detail="Service history stays immutable; status changes are recorded in fleet audit." saving={saving} onClose={onClose} onSubmit={onSubmit}><label className="text-xs font-semibold">Vehicle<select name="truck" required defaultValue={selected?.vehicle_id ?? ""} className="mt-2 min-h-12 w-full rounded-xl border border-asphalt/15 bg-white px-4 font-normal"><option value="" disabled>Select vehicle</option>{vehicles.map((item) => <option key={item.vehicle_id} value={item.vehicle_id}>{item.plate_number} · {item.vehicle_type}</option>)}</select></label><Choice name="type" label="Maintenance type" defaultValue="scheduled_service" values={maintenanceTypes} /><Choice name="status" label="Work status" defaultValue="scheduled" values={["scheduled", "in_progress", "completed", "cancelled"]} /><Field name="serviceDate" label="Service date" type="date" required defaultValue={today()} /><Field name="odometer" label="Odometer (km)" type="number" step="0.1" /><Field name="cost" label="Cost (ETB)" type="number" step="0.01" defaultValue="0" /><Field name="vendor" label="Workshop / vendor" /><Field name="nextDate" label="Next service date" type="date" /><Field name="nextOdometer" label="Next service odometer" type="number" step="0.1" /><label className="text-xs font-semibold sm:col-span-2">Work notes<textarea name="notes" maxLength={1000} rows={3} className="mt-2 w-full rounded-xl border border-asphalt/15 px-4 py-3 font-normal" /></label></Modal>; }
function ProfileModal({ vehicle, branches, saving, onClose, onSubmit }: { vehicle: FleetVehicle; branches: FleetBranch[]; saving: boolean; onClose: () => void; onSubmit: (form: FormData) => void }) { return <Modal title={`Edit ${vehicle.plate_number}`} detail="Expiry, ownership, branch and odometer changes require an audit reason." saving={saving} onClose={onClose} onSubmit={onSubmit}><Choice name="ownership" label="Ownership" defaultValue={vehicle.ownership_type} values={["company", "leased", "owner_operator"]} /><Choice name="fuel" label="Fuel type" defaultValue={vehicle.fuel_type ?? "diesel"} values={fuels} /><BranchChoice branches={branches} defaultValue={vehicle.branch_id ?? ""} /><Field name="odometer" label="Current odometer (km)" type="number" step="0.1" defaultValue={vehicle.current_odometer_km?.toString()} /><Field name="insurance" label="Insurance expiry" type="date" defaultValue={vehicle.insurance_expiry ?? undefined} /><Field name="license" label="License expiry" type="date" defaultValue={vehicle.license_expiry ?? undefined} /><Field name="roadworthiness" label="Roadworthiness expiry" type="date" defaultValue={vehicle.roadworthiness_expiry ?? undefined} /><Field name="reason" label="Change reason" required span /></Modal>; }

function Field({ name, label: fieldLabel, type = "text", required = false, step, defaultValue, pattern, span = false }: { name: string; label: string; type?: string; required?: boolean; step?: string; defaultValue?: string; pattern?: string; span?: boolean }) { return <label className={`text-xs font-semibold ${span ? "sm:col-span-2" : ""}`}>{fieldLabel}<input name={name} type={type} required={required} step={step} defaultValue={defaultValue} pattern={pattern} min={type === "number" ? 0 : undefined} className="mt-2 min-h-12 w-full rounded-xl border border-asphalt/15 px-4 font-normal" /></label>; }
function Choice({ name, label: choiceLabel, values, defaultValue }: { name: string; label: string; values: readonly string[]; defaultValue: string }) { return <label className="text-xs font-semibold">{choiceLabel}<select name={name} defaultValue={defaultValue} className="mt-2 min-h-12 w-full rounded-xl border border-asphalt/15 bg-white px-4 font-normal">{values.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label>; }
function BranchChoice({ branches, defaultValue = "" }: { branches: FleetBranch[]; defaultValue?: string }) { return <label className="text-xs font-semibold">Branch<select name="branch" defaultValue={defaultValue} className="mt-2 min-h-12 w-full rounded-xl border border-asphalt/15 bg-white px-4 font-normal"><option value="">No branch</option>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>; }
function Select<T extends string>({ label: selectLabel, value, onChange, options }: { label: string; value: T; onChange: (value: T) => void; options: readonly T[] }) { return <label className="text-xs font-semibold">{selectLabel}<select value={value} onChange={(event) => onChange(event.target.value as T)} className="mt-2 min-h-12 w-full rounded-xl border border-asphalt/15 bg-white px-4 font-normal">{options.map((option) => <option key={option} value={option}>{label(option)}</option>)}</select></label>; }
function Metric({ label: metricLabel, value, detail, tone = "plain" }: { label: string; value: number; detail: string; tone?: "plain" | "good" | "warn" | "danger" }) { const style = tone === "danger" ? "border-route/30 bg-route/5 text-route" : tone === "warn" ? "border-amber/40 bg-amber/5 text-amber-dim" : tone === "good" ? "border-emerald-700/25 bg-emerald-50 text-emerald-800" : "border-asphalt/10 bg-white text-asphalt"; return <article className={`min-w-0 border p-4 ${style}`}><p className="break-words font-mono text-[9px] uppercase tracking-wide">{metricLabel}</p><p className="mt-3 font-display text-2xl font-bold">{value}</p><p className="mt-2 break-words text-[11px] text-steel">{detail}</p></article>; }
function Pill({ value }: { value: string }) { const style = value === "healthy" || value === "available" ? "bg-emerald-50 text-emerald-800" : value === "critical" || value === "suspended" || value === "inactive" ? "bg-route/10 text-route" : value === "attention" || value === "maintenance" ? "bg-amber/15 text-amber-dim" : "bg-sky-50 text-sky-800"; return <span className={`max-w-28 break-words rounded-full px-2.5 py-1 text-right text-[9px] font-semibold uppercase ${style}`}>{label(value)}</span>; }
function Info({ name, value }: { name: string; value: string }) { return <div className="min-w-0 rounded-xl bg-white p-3"><p className="text-[9px] uppercase tracking-wide text-steel">{name}</p><p className="mt-1 break-words font-semibold text-asphalt">{value}</p></div>; }
