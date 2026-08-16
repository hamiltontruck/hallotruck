import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  createMaintenanceRecord,
  getFleetMaintenanceData,
  setTruckOperationalStatus,
  updateMaintenanceStatus,
  type FleetMaintenanceData,
  type MaintenanceStatus,
  type MaintenanceTruck,
  type MaintenanceType,
  type TruckMaintenanceRecord,
  type TruckOperationalStatus,
} from "../services/fleet-maintenance.service";

const emptyData: FleetMaintenanceData = { trucks: [], records: [] };
type FleetFilter = "all" | "attention" | "maintenance" | "available" | "out_of_service";

const maintenanceLabels: Record<MaintenanceType, string> = {
  scheduled_service: "Scheduled service",
  oil_change: "Oil change",
  tyres: "Tyres",
  repair: "Repair",
  inspection: "Inspection",
  insurance: "Insurance",
  permit: "Transport permit",
  other: "Other",
};

const maintenanceTypes = Object.keys(maintenanceLabels) as MaintenanceType[];
const today = () => new Date().toISOString().slice(0, 10);

function formatDate(value: string | null) {
  return value ? new Date(`${value}T00:00:00`).toLocaleDateString() : "Not scheduled";
}

function formatMoney(value: number) {
  return `ETB ${Number(value || 0).toLocaleString()}`;
}

function isDateDue(value: string | null, days = 30) {
  if (!value) return false;
  const deadline = new Date();
  deadline.setHours(23, 59, 59, 999);
  deadline.setDate(deadline.getDate() + days);
  return new Date(`${value}T00:00:00`) <= deadline;
}

function latestRecord(records: TruckMaintenanceRecord[]) {
  return [...records].sort((a, b) => {
    const date = b.service_date.localeCompare(a.service_date);
    return date || b.created_at.localeCompare(a.created_at);
  })[0] ?? null;
}

function nextServiceRecord(records: TruckMaintenanceRecord[]) {
  return records
    .filter((record) => record.status !== "cancelled" && (record.next_service_date || record.next_service_odometer_km !== null))
    .sort((a, b) => b.service_date.localeCompare(a.service_date))[0] ?? null;
}

function needsAttention(truck: MaintenanceTruck, records: TruckMaintenanceRecord[]) {
  if (["maintenance", "out_of_service"].includes(truck.status)) return true;
  const next = nextServiceRecord(records);
  if (!next) return false;
  const dateDue = isDateDue(next.next_service_date);
  const odometerDue = next.next_service_odometer_km !== null
    && truck.current_odometer_km !== null
    && truck.current_odometer_km >= next.next_service_odometer_km;
  return dateDue || odometerDue;
}

export function AdminFleetMaintenance() {
  const [data, setData] = useState<FleetMaintenanceData>(emptyData);
  const [filter, setFilter] = useState<FleetFilter>("all");
  const [selectedTruckId, setSelectedTruckId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getFleetMaintenanceData());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fleet maintenance data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const recordsByTruck = useMemo(() => {
    const grouped = new Map<string, TruckMaintenanceRecord[]>();
    data.records.forEach((record) => {
      const rows = grouped.get(record.truck_id) ?? [];
      rows.push(record);
      grouped.set(record.truck_id, rows);
    });
    return grouped;
  }, [data.records]);

  const attentionTrucks = data.trucks.filter((truck) => needsAttention(truck, recordsByTruck.get(truck.id) ?? []));
  const maintenanceTrucks = data.trucks.filter((truck) => truck.status === "maintenance");
  const availableTrucks = data.trucks.filter((truck) => truck.status === "available");
  const outOfServiceTrucks = data.trucks.filter((truck) => truck.status === "out_of_service");
  const currentYear = String(new Date().getFullYear());
  const yearlySpend = data.records
    .filter((record) => record.status === "completed" && record.service_date.startsWith(currentYear))
    .reduce((sum, record) => sum + Number(record.cost_etb || 0), 0);

  const visibleTrucks = data.trucks.filter((truck) => {
    if (filter === "all") return true;
    if (filter === "attention") return needsAttention(truck, recordsByTruck.get(truck.id) ?? []);
    return truck.status === filter;
  });

  async function changeTruckStatus(truckId: string, status: TruckOperationalStatus) {
    setSaving(true);
    setError("");
    try {
      await setTruckOperationalStatus(truckId, status);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Truck status could not be updated.");
    } finally {
      setSaving(false);
    }
  }

  async function markRecord(recordId: string, status: MaintenanceStatus) {
    setSaving(true);
    setError("");
    try {
      await updateMaintenanceStatus(recordId, status);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Maintenance record could not be updated.");
    } finally {
      setSaving(false);
    }
  }

  function openRecordForm(truckId = "") {
    setSelectedTruckId(truckId);
    setShowForm(true);
  }

  return (
    <main className="mx-auto max-w-[1500px] px-4 py-8 sm:px-7 lg:px-10 lg:py-10">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] tracking-[.2em] text-amber-dim">FLEET RELIABILITY CONTROL</p>
          <h1 className="mt-2 font-display text-3xl font-bold text-asphalt sm:text-4xl">Truck maintenance</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-steel">
            Control service history, repairs, operating status, odometer readings, maintenance cost and the next scheduled service for every truck.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => void load()} disabled={loading} className="min-h-11 border border-asphalt px-4 py-2.5 text-xs font-semibold disabled:opacity-50">
            {loading ? "Refreshing…" : "↻ Refresh"}
          </button>
          <button type="button" onClick={() => openRecordForm()} className="min-h-11 bg-asphalt px-5 py-2.5 text-xs font-semibold text-white">
            + Add maintenance record
          </button>
        </div>
      </header>

      {error && <p className="mt-6 border border-route/30 bg-route/5 p-4 text-sm text-route">{error}</p>}

      <section className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label="Registered fleet" value={data.trucks.length} note="All trucks" />
        <Metric label="Needs attention" value={attentionTrucks.length} note="Due or unavailable" danger={attentionTrucks.length > 0} />
        <Metric label="In maintenance" value={maintenanceTrucks.length} note="Workshop status" />
        <Metric label="Out of service" value={outOfServiceTrucks.length} note="Dispatch blocked" danger={outOfServiceTrucks.length > 0} />
        <Metric label={`${currentYear} maintenance spend`} value={formatMoney(yearlySpend)} note="Completed records" wide />
      </section>

      <section className="mt-7 overflow-hidden rounded-2xl border border-asphalt/10 bg-white">
        <div className="flex flex-col gap-4 border-b border-asphalt/10 p-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            <p className="font-mono text-[10px] tracking-[.18em] text-emerald-700">OPERATIONAL FLEET</p>
            <h2 className="mt-1 font-display text-xl font-semibold">Truck readiness</h2>
          </div>
          <div className="flex gap-2 overflow-x-auto">
            <FilterButton active={filter === "all"} onClick={() => setFilter("all")} label={`All ${data.trucks.length}`} />
            <FilterButton active={filter === "attention"} onClick={() => setFilter("attention")} label={`Attention ${attentionTrucks.length}`} danger={attentionTrucks.length > 0} />
            <FilterButton active={filter === "available"} onClick={() => setFilter("available")} label={`Available ${availableTrucks.length}`} />
            <FilterButton active={filter === "maintenance"} onClick={() => setFilter("maintenance")} label={`Maintenance ${maintenanceTrucks.length}`} />
            <FilterButton active={filter === "out_of_service"} onClick={() => setFilter("out_of_service")} label={`Out ${outOfServiceTrucks.length}`} />
          </div>
        </div>

        {loading ? <p className="p-12 text-center font-mono text-xs text-steel">Loading fleet maintenance…</p> : visibleTrucks.length ? (
          <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3 sm:p-6">
            {visibleTrucks.map((truck) => (
              <TruckMaintenanceCard
                key={truck.id}
                truck={truck}
                records={recordsByTruck.get(truck.id) ?? []}
                saving={saving}
                onAdd={() => openRecordForm(truck.id)}
                onStatus={(status) => void changeTruckStatus(truck.id, status)}
              />
            ))}
          </div>
        ) : <p className="p-10 text-center text-sm text-steel">No trucks match this maintenance filter.</p>}
      </section>

      <section className="mt-7 overflow-hidden rounded-2xl border border-asphalt/10 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-asphalt/10 p-5 sm:px-6">
          <div>
            <p className="font-mono text-[10px] tracking-[.18em] text-amber-dim">AUDIT HISTORY</p>
            <h2 className="mt-1 font-display text-xl font-semibold">Recent maintenance records</h2>
          </div>
          <span className="font-mono text-xs text-steel">{data.records.length} records</span>
        </div>
        {data.records.length ? <div className="divide-y divide-asphalt/10">
          {data.records.slice(0, 40).map((record) => {
            const truck = data.trucks.find((item) => item.id === record.truck_id);
            return (
              <article key={record.id} className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-6 sm:py-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-xs font-semibold">{truck?.plate_number ?? "Unknown truck"}</p>
                    <StatusPill status={record.status} />
                    <span className="rounded-full bg-bone px-2.5 py-1 text-[10px] font-semibold text-steel">{maintenanceLabels[record.maintenance_type]}</span>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-asphalt">{formatDate(record.service_date)} · {formatMoney(record.cost_etb)}</p>
                  <p className="mt-1 text-xs text-steel">
                    {record.odometer_km === null ? "Odometer not recorded" : `${Number(record.odometer_km).toLocaleString()} km`}
                    {record.vendor ? ` · ${record.vendor}` : ""}
                  </p>
                  {record.notes && <p className="mt-2 text-xs leading-5 text-steel">{record.notes}</p>}
                  {(record.next_service_date || record.next_service_odometer_km !== null) && <p className="mt-2 text-xs font-semibold text-amber-dim">
                    Next: {formatDate(record.next_service_date)}{record.next_service_odometer_km !== null ? ` · ${Number(record.next_service_odometer_km).toLocaleString()} km` : ""}
                  </p>}
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  {record.status === "scheduled" && <button disabled={saving} onClick={() => void markRecord(record.id, "in_progress")} className="min-h-10 border border-amber-dim px-3 py-2 text-xs font-semibold text-amber-dim disabled:opacity-40">Start work</button>}
                  {record.status === "in_progress" && <button disabled={saving} onClick={() => void markRecord(record.id, "completed")} className="min-h-10 bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Mark completed</button>}
                </div>
              </article>
            );
          })}
        </div> : <p className="p-10 text-center text-sm text-steel">No maintenance records yet.</p>}
      </section>

      {showForm && (
        <MaintenanceRecordModal
          trucks={data.trucks}
          initialTruckId={selectedTruckId}
          saving={saving}
          onClose={() => setShowForm(false)}
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setSaving(true);
            setError("");
            try {
              const numberOrNull = (name: string) => {
                const raw = String(form.get(name) ?? "").trim();
                return raw ? Number(raw) : null;
              };
              await createMaintenanceRecord({
                truckId: String(form.get("truckId") ?? ""),
                maintenanceType: String(form.get("maintenanceType")) as MaintenanceType,
                status: String(form.get("status")) as MaintenanceStatus,
                serviceDate: String(form.get("serviceDate") ?? ""),
                odometerKm: numberOrNull("odometerKm"),
                costEtb: Number(form.get("costEtb") ?? 0),
                vendor: String(form.get("vendor") ?? ""),
                notes: String(form.get("notes") ?? ""),
                nextServiceDate: String(form.get("nextServiceDate") ?? ""),
                nextServiceOdometerKm: numberOrNull("nextServiceOdometerKm"),
              });
              setShowForm(false);
              await load();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Maintenance record could not be saved.");
            } finally {
              setSaving(false);
            }
          }}
        />
      )}
    </main>
  );
}

function TruckMaintenanceCard({
  truck,
  records,
  saving,
  onAdd,
  onStatus,
}: {
  truck: MaintenanceTruck;
  records: TruckMaintenanceRecord[];
  saving: boolean;
  onAdd: () => void;
  onStatus: (status: TruckOperationalStatus) => void;
}) {
  const latest = latestRecord(records);
  const next = nextServiceRecord(records);
  const attention = needsAttention(truck, records);
  const spend = records.filter((record) => record.status === "completed").reduce((sum, record) => sum + Number(record.cost_etb || 0), 0);

  return (
    <article className={`rounded-2xl border p-5 ${attention ? "border-amber/45 bg-amber/5" : "border-asphalt/10 bg-bone/40"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-sm font-bold text-asphalt">{truck.plate_number}</p>
          <p className="mt-1 text-xs text-steel">{truck.vehicle_type} · {truck.capacity_tons ?? "—"} ton</p>
        </div>
        <TruckStatusPill status={truck.status} />
      </div>

      {attention && <p className="mt-4 rounded-xl bg-amber/15 px-3 py-2 text-xs font-semibold text-amber-dim">Maintenance attention required</p>}

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <Info label="Current odometer" value={truck.current_odometer_km === null ? "Not recorded" : `${Number(truck.current_odometer_km).toLocaleString()} km`} />
        <Info label="Maintenance spend" value={formatMoney(spend)} />
        <Info label="Last service" value={latest ? formatDate(latest.service_date) : "No history"} />
        <Info label="Next service" value={next ? formatDate(next.next_service_date) : "Not scheduled"} />
      </div>

      {next?.next_service_odometer_km !== null && next?.next_service_odometer_km !== undefined && (
        <p className="mt-3 text-xs font-semibold text-steel">Next odometer: {Number(next.next_service_odometer_km).toLocaleString()} km</p>
      )}

      <div className="mt-5 flex flex-wrap gap-2 border-t border-asphalt/10 pt-4">
        <button type="button" onClick={onAdd} className="min-h-10 bg-asphalt px-3 py-2 text-xs font-semibold text-white">Add record</button>
        {truck.status !== "available" && <button type="button" disabled={saving} onClick={() => onStatus("available")} className="min-h-10 border border-emerald-700 px-3 py-2 text-xs font-semibold text-emerald-800 disabled:opacity-40">Mark available</button>}
        {truck.status !== "maintenance" && <button type="button" disabled={saving} onClick={() => onStatus("maintenance")} className="min-h-10 border border-amber-dim px-3 py-2 text-xs font-semibold text-amber-dim disabled:opacity-40">Maintenance</button>}
        {truck.status !== "out_of_service" && <button type="button" disabled={saving} onClick={() => onStatus("out_of_service")} className="min-h-10 border border-route px-3 py-2 text-xs font-semibold text-route disabled:opacity-40">Out of service</button>}
      </div>
    </article>
  );
}

function MaintenanceRecordModal({
  trucks,
  initialTruckId,
  saving,
  onClose,
  onSubmit,
}: {
  trucks: MaintenanceTruck[];
  initialTruckId: string;
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-asphalt/75 p-3 sm:p-5">
      <form onSubmit={onSubmit} className="max-h-[95vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] tracking-[.2em] text-amber-dim">MAINTENANCE LEDGER</p>
            <h2 className="mt-2 font-display text-2xl font-bold">Add truck maintenance</h2>
            <p className="mt-1 text-xs text-steel">Record service work, cost, odometer and the next maintenance target.</p>
          </div>
          <button type="button" onClick={onClose} className="text-2xl text-steel" aria-label="Close">×</button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <SelectField name="truckId" label="Truck" defaultValue={initialTruckId} required options={trucks.map((truck) => [truck.id, `${truck.plate_number} · ${truck.vehicle_type}`])} />
          <SelectField name="maintenanceType" label="Maintenance type" defaultValue="scheduled_service" required options={maintenanceTypes.map((type) => [type, maintenanceLabels[type]])} />
          <SelectField name="status" label="Work status" defaultValue="completed" required options={[["scheduled", "Scheduled"], ["in_progress", "In progress"], ["completed", "Completed"], ["cancelled", "Cancelled"]]} />
          <Field name="serviceDate" label="Service date" type="date" defaultValue={today()} />
          <Field name="odometerKm" label="Odometer (km)" type="number" required={false} step="0.1" />
          <Field name="costEtb" label="Cost (ETB)" type="number" defaultValue="0" step="0.01" />
          <Field name="vendor" label="Workshop / vendor" required={false} />
          <Field name="nextServiceDate" label="Next service date" type="date" required={false} />
          <Field name="nextServiceOdometerKm" label="Next service odometer (km)" type="number" required={false} step="0.1" />
          <label className="text-xs font-semibold sm:col-span-2">Work notes
            <textarea name="notes" rows={4} maxLength={1000} className="mt-2 block w-full rounded-xl border border-asphalt/15 px-4 py-3 text-sm font-normal outline-none focus:border-amber" placeholder="Parts replaced, inspection result, repair details…" />
          </label>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="min-h-12 border border-asphalt px-5 py-3 text-sm font-semibold">Cancel</button>
          <button disabled={saving || trucks.length === 0} className="min-h-12 bg-emerald-700 px-6 py-3 text-sm font-semibold text-white disabled:opacity-40">{saving ? "Saving…" : "Save maintenance record"}</button>
        </div>
      </form>
    </div>
  );
}

function Metric({ label, value, note, danger = false, wide = false }: { label: string; value: string | number; note: string; danger?: boolean; wide?: boolean }) {
  return <div className={`border p-4 sm:p-5 ${danger ? "border-route/30 bg-route/5" : "border-asphalt/10 bg-white"} ${wide ? "col-span-2 lg:col-span-1" : ""}`}><p className="font-mono text-[9px] uppercase tracking-wide text-steel">{label}</p><p className={`mt-3 font-display text-xl font-bold sm:text-2xl ${danger ? "text-route" : "text-asphalt"}`}>{value}</p><p className="mt-2 text-[11px] text-steel">{note}</p></div>;
}

function FilterButton({ active, label, onClick, danger = false }: { active: boolean; label: string; onClick: () => void; danger?: boolean }) {
  return <button type="button" onClick={onClick} className={`shrink-0 rounded-full border px-3 py-2 text-[10px] font-semibold ${active ? danger ? "border-route bg-route text-white" : "border-asphalt bg-asphalt text-white" : danger ? "border-route/30 bg-route/5 text-route" : "border-asphalt/10 bg-white text-steel"}`}>{label}</button>;
}

function TruckStatusPill({ status }: { status: string }) {
  const style = status === "available" ? "bg-emerald-50 text-emerald-800" : status === "maintenance" ? "bg-amber/15 text-amber-dim" : status === "out_of_service" ? "bg-route/10 text-route" : "bg-sky-50 text-sky-800";
  return <span className={`rounded-full px-3 py-1.5 text-[9px] font-semibold uppercase ${style}`}>{status.replaceAll("_", " ")}</span>;
}

function StatusPill({ status }: { status: MaintenanceStatus }) {
  const style = status === "completed" ? "bg-emerald-50 text-emerald-800" : status === "in_progress" ? "bg-amber/15 text-amber-dim" : status === "cancelled" ? "bg-route/10 text-route" : "bg-sky-50 text-sky-800";
  return <span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase ${style}`}>{status.replaceAll("_", " ")}</span>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-white p-3"><p className="text-[9px] uppercase tracking-wider text-steel">{label}</p><p className="mt-1 font-semibold text-asphalt">{value}</p></div>;
}

function Field({ name, label, type = "text", required = true, defaultValue, step }: { name: string; label: string; type?: string; required?: boolean; defaultValue?: string; step?: string }) {
  return <label className="text-xs font-semibold">{label}<input name={name} type={type} required={required} defaultValue={defaultValue} min={type === "number" ? 0 : undefined} step={step} className="mt-2 block w-full rounded-xl border border-asphalt/15 px-4 py-3 text-sm font-normal outline-none focus:border-amber" /></label>;
}

function SelectField({ name, label, options, defaultValue, required = false }: { name: string; label: string; options: string[][]; defaultValue: string; required?: boolean }) {
  return <label className="text-xs font-semibold">{label}<select name={name} defaultValue={defaultValue} required={required} className="mt-2 block w-full rounded-xl border border-asphalt/15 bg-white px-4 py-3 text-sm font-normal outline-none focus:border-amber"><option value="" disabled>Select {label.toLowerCase()}</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>;
}
