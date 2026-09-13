import { useState, type FormEvent } from "react";
import { DRIVER_VEHICLE_TYPES } from "../../domain/driver-vehicle-types";
import { supabase } from "../../services/supabase.client";

type Driver = { id: string; full_name: string };
type Truck = { id: string; vehicle_type: string; model?: string | null };
export function DriverReviewFields({ driver, truck, onSaved }: { driver: Driver; truck?: Truck; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(driver.full_name ?? "");
  const [type, setType] = useState(truck?.vehicle_type ?? "");
  const [model, setModel] = useState(truck?.model ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!name.trim()) { setMessage("Enter the driver name."); return; }
    if (truck && !DRIVER_VEHICLE_TYPES.some((value) => value === type.trim())) { setMessage("Choose a supported truck type."); return; }
    setBusy(true); setMessage("");
    try {
      const { error } = await supabase.rpc("admin_save_driver_review_fields", {
        p_driver_id: driver.id, p_truck_id: truck?.id ?? null,
        p_full_name: name.trim(), p_vehicle_type: truck ? type.trim() : null, p_model: truck ? model.trim() : null,
        p_expected_name: driver.full_name, p_expected_type: truck?.vehicle_type ?? null, p_expected_model: truck?.model ?? null,
      });
      if (error) throw error;
      await onSaved();
      setMessage("Saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save. Refresh and try again."); }
    finally { setBusy(false); }
  }
  return <form className="driver-review-fields" onSubmit={(event) => void save(event)} aria-label="Driver and truck details">
    <label>Driver name<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} disabled={busy} autoComplete="name" /></label>
    <div><label>Truck type<input value={type} onChange={(event) => setType(event.target.value)} required={Boolean(truck)} disabled={busy || !truck} list={`truck-types-${driver.id}`} maxLength={50} /></label>
      <datalist id={`truck-types-${driver.id}`}>{DRIVER_VEHICLE_TYPES.map((value) => <option key={value} value={value} />)}</datalist>
      <label>Truck model<input value={model} onChange={(event) => setModel(event.target.value)} disabled={busy || !truck} maxLength={120} placeholder="e.g. FSR" /></label></div>
    {!truck && <p>Assign a truck to edit its type and model.</p>}
    <footer><p role="status">{message}</p><button type="submit" disabled={busy}>{busy ? "Saving…" : "Save details"}</button></footer>
  </form>;
}
