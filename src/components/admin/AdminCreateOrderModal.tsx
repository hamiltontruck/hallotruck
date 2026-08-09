import { FormEvent, useMemo, useState } from "react";
import { CustomerQuoteMap, QuotePoints } from "../navigation/CustomerQuoteMap";
import { createAdminSmartOrder } from "../../services/admin-order.service";
import { calculateQuote } from "../../services/customer.service";

const vehicleOptions = ["Pickup", "Van", "Dry Cargo", "Refrigerated", "Trailer"];

export function AdminCreateOrderModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void | Promise<void> }) {
  const [route, setRoute] = useState<QuotePoints | null>(null);
  const [vehicleType, setVehicleType] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const quote = useMemo(() => {
    if (!route || !vehicleType) return null;
    return calculateQuote(route.distanceKm, vehicleType);
  }, [route, vehicleType]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!route) {
      setError("Select pickup and drop-off places and wait for the road distance.");
      return;
    }
    if (!vehicleType) {
      setError("Select a vehicle type.");
      return;
    }

    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await createAdminSmartOrder({
        customerName: String(form.get("customerName") ?? ""),
        customerPhone: String(form.get("customerPhone") ?? ""),
        cargoDescription: String(form.get("cargoDescription") ?? ""),
        vehicleType,
        pickupAddress: route.pickupAddress,
        dropoffAddress: route.dropoffAddress,
        pickup: route.pickup,
        dropoff: route.dropoff,
        distanceKm: route.distanceKm,
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create order.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-asphalt/70 p-3 sm:p-4">
      <form onSubmit={submit} className="max-h-[94vh] w-full max-w-3xl overflow-y-auto bg-white p-5 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] tracking-[.2em] text-amber-dim">SMART ORDER</p>
            <h2 className="mt-1 font-display text-2xl font-bold">New order</h2>
            <p className="mt-2 text-xs text-steel">Search the route. Road distance and the quote are calculated automatically.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-3xl leading-none text-steel">×</button>
        </div>

        {error && <p className="mt-4 border border-route/30 bg-route/10 p-3 text-sm text-route">{error}</p>}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field name="customerName" label="Customer name" />
          <Field name="customerPhone" label="Phone" />
        </div>

        <div className="mt-5 border border-asphalt/10 p-4 sm:p-5">
          <div className="mb-4">
            <h3 className="font-semibold">Pickup & delivery route</h3>
            <p className="mt-1 text-[11px] text-steel">Use place search or tap the map. The saved order keeps both coordinates and the road distance.</p>
          </div>
          <CustomerQuoteMap onChange={setRoute} />
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold">
            Vehicle type
            <select
              value={vehicleType}
              onChange={(event) => setVehicleType(event.target.value)}
              required
              className="mt-2 block w-full border border-asphalt/20 bg-white px-3 py-3 text-sm outline-none focus:border-amber"
            >
              <option value="" disabled>Select vehicle type</option>
              {vehicleOptions.map((vehicle) => <option key={vehicle} value={vehicle}>{vehicle}</option>)}
            </select>
          </label>
          <Field name="cargoDescription" label="Cargo description" required={false} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 border border-asphalt/10 bg-[#f5f3ed] p-4 sm:grid-cols-3">
          <Summary label="Road distance" value={route ? `${route.distanceKm.toLocaleString()} km` : "Select route"} />
          <Summary label="Vehicle" value={vehicleType || "Select vehicle"} />
          <div className="col-span-2 sm:col-span-1">
            <Summary label="Smart quote" value={quote != null ? `ETB ${quote.toLocaleString()}` : "Waiting"} emphasis />
          </div>
        </div>

        <p className="mt-3 text-[11px] text-steel">Price is calculated with the same rate logic used by the customer portal. Admin no longer needs to type distance or price manually.</p>
        <button disabled={saving || !route || !vehicleType} className="mt-6 w-full bg-asphalt py-4 font-semibold text-white disabled:opacity-40">
          {saving ? "Creating order…" : quote != null ? `Create order · ETB ${quote.toLocaleString()}` : "Create order"}
        </button>
      </form>
    </div>
  );
}

function Field({ name, label, required = true }: { name: string; label: string; required?: boolean }) {
  return (
    <label className="text-xs font-semibold">
      {label}
      <input name={name} required={required} className="mt-2 block w-full border border-asphalt/20 px-3 py-3 text-sm font-normal outline-none focus:border-amber" />
    </label>
  );
}

function Summary({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-steel">{label}</p>
      <p className={`mt-1 ${emphasis ? "font-display text-xl font-bold text-amber-dim" : "text-sm font-semibold"}`}>{value}</p>
    </div>
  );
}
