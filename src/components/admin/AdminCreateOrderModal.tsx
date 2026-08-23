import { FormEvent, useEffect, useMemo, useState } from "react";
import { CustomerQuoteMap, QuotePoints } from "../navigation/CustomerQuoteMap";
import { createAdminSmartOrder } from "../../services/admin-order.service";
import {
  cargoToTons,
  vehicleCapacityTons,
  type CargoUnit,
} from "../../services/customer-cargo.service";
import {
  CARGO_CATEGORIES,
  PACKAGING_TYPES,
  cargoDetailsCopy,
  isContainerPackaging,
  validateCargoDetails,
  type CargoCategory,
  type PackagingType,
} from "../../domain/cargo-details";
import { AdminOrder, Driver, Truck, assignOrder, getDashboardData } from "../../services/admin.service";
import { useTransportQuote } from "../../hooks/useTransportQuote";
import { useLanguage } from "../../i18n/LanguageProvider";

const vehicleOptions = ["Pickup", "Van", "Isuzu 5 Ton", "Dry Cargo", "Refrigerated", "Truck 22 Ton", "Truck 25 Ton", "Truck 30 Ton", "Trailer"];
const ethiopianMobilePattern = /^(?:09\d{8}|\+2519\d{8})$/;

export function AdminCreateOrderModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { selectedLanguage } = useLanguage();
  const cargoCopy = cargoDetailsCopy[selectedLanguage];
  const [route, setRoute] = useState<QuotePoints | null>(null);
  const [vehicleType, setVehicleType] = useState("");
  const [cargoQuantity, setCargoQuantity] = useState("1");
  const [cargoUnit, setCargoUnit] = useState<CargoUnit>("ton");
  const [cargoCategory, setCargoCategory] = useState<CargoCategory>("general_goods");
  const [packagingType, setPackagingType] = useState<PackagingType>("loose_bulk");
  const [cargoNotes, setCargoNotes] = useState("");
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [assignmentLoading, setAssignmentLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createdTrackingId, setCreatedTrackingId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void getDashboardData()
      .then((data) => {
        if (!active) return;
        setOrders(data.orders);
        setTrucks(data.trucks);
        setDrivers(data.drivers);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Could not load assignment options.");
      })
      .finally(() => {
        if (active) setAssignmentLoading(false);
      });
    return () => { active = false; };
  }, []);

  const cargoAmount = Number(cargoQuantity);
  const cargoTons = cargoToTons(cargoAmount, cargoUnit);
  const selectedCapacity = vehicleCapacityTons[vehicleType.toLowerCase()] ?? 0;
  const loadValidation = !Number.isFinite(cargoAmount) || cargoAmount <= 0
    ? "Enter a load amount greater than zero."
    : selectedCapacity > 0 && cargoTons > selectedCapacity
      ? `${vehicleType} supports up to ${selectedCapacity} tons. Reduce the load or choose a larger vehicle.`
      : "";
  const cargoDetailsErrorCode = validateCargoDetails({
    category: cargoCategory,
    packagingType,
    vehicleType,
    notes: cargoNotes,
  });
  const cargoDetailsValidation = cargoDetailsErrorCode ? cargoCopy.errors[cargoDetailsErrorCode] : "";
  const cargoValidation = loadValidation || cargoDetailsValidation;

  const {
    quote: quoteBreakdown,
    loading: quoteLoading,
    error: quoteError,
  } = useTransportQuote({
    distanceKm: route?.distanceKm ?? 0,
    vehicleType,
    cargoTons,
    enabled: Boolean(route && vehicleType && !cargoValidation),
  });
  const quote = quoteBreakdown?.total_quote_etb ?? null;

  const busyDriverIds = useMemo(
    () => new Set(orders.filter((order) => ["accepted", "in_transit"].includes(order.status)).map((order) => order.driver_id).filter(Boolean)),
    [orders],
  );

  const approvedDrivers = useMemo(
    () => drivers.filter((driver) => driver.driver_status === "approved"),
    [drivers],
  );

  const availableDrivers = useMemo(
    () => approvedDrivers.filter((driver) => !busyDriverIds.has(driver.id)),
    [approvedDrivers, busyDriverIds],
  );

  const matchingTrucks = useMemo(
    () => trucks.filter((truck) => {
      const exactType = !vehicleType || truck.vehicle_type.trim().toLowerCase() === vehicleType.trim().toLowerCase();
      const truckCapacity = truck.capacity_tons == null ? null : Number(truck.capacity_tons);
      const enoughCapacity = truckCapacity == null || cargoTons <= 0 || truckCapacity >= cargoTons;
      return truck.status === "available" && exactType && enoughCapacity;
    }),
    [cargoTons, trucks, vehicleType],
  );

  const assignmentReady = Boolean(vehicleType && !cargoValidation && matchingTrucks.length > 0 && availableDrivers.length > 0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (createdTrackingId) return;
    if (!route) {
      setError("Select pickup and drop-off places and wait for the road distance.");
      return;
    }
    if (!vehicleType) {
      setError("Select a vehicle type.");
      return;
    }
    if (cargoValidation) {
      setError(cargoValidation);
      return;
    }
    if (!quoteBreakdown) {
      setError(quoteError || "The latest server price is unavailable. Try again.");
      return;
    }

    const form = new FormData(event.currentTarget);
    const customerPhone = String(form.get("customerPhone") ?? "").trim();
    const truckId = String(form.get("truckId") ?? "");
    const driverId = String(form.get("driverId") ?? "");

    if (!ethiopianMobilePattern.test(customerPhone)) {
      setError("Phone must be 09xxxxxxxx or +2519xxxxxxxx.");
      return;
    }
    if ((truckId && !driverId) || (!truckId && driverId)) {
      setError("To assign now, select both a truck and an approved free driver. Otherwise leave both as Assign later.");
      return;
    }

    setSaving(true);
    try {
      const created = await createAdminSmartOrder({
        customerName: String(form.get("customerName") ?? ""),
        customerPhone,
        cargoDescription: cargoNotes,
        cargoCategory,
        packagingType,
        cargoQuantity: cargoAmount,
        cargoUnit,
        vehicleType,
        pickupAddress: route.pickupAddress,
        dropoffAddress: route.dropoffAddress,
        pickup: route.pickup,
        dropoff: route.dropoff,
        distanceKm: route.distanceKm,
      });

      if (truckId && driverId) {
        try {
          await assignOrder(created.id, truckId, driverId);
        } catch (assignError) {
          setCreatedTrackingId(created.tracking_id);
          setError(`Order ${created.tracking_id} was created, but assignment failed: ${assignError instanceof Error ? assignError.message : "Unknown assignment error"}. Close this form and assign it from Orders when a matching truck and approved driver are free.`);
          setSaving(false);
          return;
        }
      }

      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create order.");
      setSaving(false);
    }
  }

  const driverAvailabilityMessage = approvedDrivers.length === 0
    ? "No approved drivers. Verify a driver in Driver & vehicle compliance first."
    : availableDrivers.length === 0
      ? "All approved drivers are currently on active trips."
      : matchingTrucks.length === 0 && vehicleType
        ? "No available matching truck has enough registered capacity for this load."
        : "";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-asphalt/70 p-3 sm:p-4">
      <form onSubmit={submit} className="max-h-[94vh] w-full max-w-3xl overflow-y-auto bg-white p-5 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] tracking-[.2em] text-amber-dim">SMART ORDER</p>
            <h2 className="mt-1 font-display text-2xl font-bold">New order</h2>
            <p className="mt-2 text-xs text-steel">Road distance and cargo weight use the same freight formula as the customer portal.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-3xl leading-none text-steel">×</button>
        </div>

        {error && <p className="mt-4 border border-route/30 bg-route/10 p-3 text-sm text-route">{error}</p>}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field name="customerName" label="Customer name" />
          <PhoneField />
        </div>

        <div className="mt-5 border border-asphalt/10 p-4 sm:p-5">
          <div className="mb-4">
            <h3 className="font-semibold">Pickup & delivery route</h3>
            <p className="mt-1 text-[11px] text-steel">Use place search or tap the map. The saved order keeps both coordinates and the road distance.</p>
          </div>
          <CustomerQuoteMap onChange={setRoute} vehicleType={vehicleType || "Dry Cargo"} />
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
          <label className="text-xs font-semibold">
            {cargoCopy.category}
            <select
              value={cargoCategory}
              onChange={(event) => setCargoCategory(event.target.value as CargoCategory)}
              className="mt-2 block w-full border border-asphalt/20 bg-white px-3 py-3 text-sm outline-none focus:border-amber"
            >
              {CARGO_CATEGORIES.map((category) => <option key={category} value={category}>{cargoCopy.categories[category]}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold">
            {cargoCopy.packaging}
            <select
              value={packagingType}
              onChange={(event) => {
                const next = event.target.value as PackagingType;
                setPackagingType(next);
                if (isContainerPackaging(next)) setVehicleType("Trailer");
              }}
              className="mt-2 block w-full border border-asphalt/20 bg-white px-3 py-3 text-sm outline-none focus:border-amber"
            >
              {PACKAGING_TYPES.map((packaging) => <option key={packaging} value={packaging}>{cargoCopy.packagingTypes[packaging]}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold">
            {cargoCopy.notes}
            <textarea
              value={cargoNotes}
              onChange={(event) => setCargoNotes(event.target.value)}
              required={cargoCategory === "other"}
              maxLength={500}
              rows={3}
              placeholder={cargoCopy.notesPlaceholder}
              className="mt-2 block w-full border border-asphalt/20 px-3 py-3 text-sm font-normal outline-none focus:border-amber"
            />
          </label>
          <label className="text-xs font-semibold">
            Load amount
            <input
              value={cargoQuantity}
              onChange={(event) => setCargoQuantity(event.target.value)}
              type="number"
              inputMode="decimal"
              min="0.1"
              step="0.1"
              required
              className="mt-2 block w-full border border-asphalt/20 px-3 py-3 text-sm font-normal outline-none focus:border-amber"
            />
          </label>
          <label className="text-xs font-semibold">
            Unit
            <select value={cargoUnit} onChange={(event) => setCargoUnit(event.target.value as CargoUnit)} className="mt-2 block w-full border border-asphalt/20 bg-white px-3 py-3 text-sm outline-none focus:border-amber">
              <option value="ton">Ton</option>
              <option value="quintal">Quintal</option>
            </select>
          </label>
        </div>

        <div className={`mt-3 border p-3 text-xs ${cargoValidation ? "border-route/30 bg-route/10 text-route" : "border-asphalt/10 bg-[#f5f3ed] text-steel"}`}>
          {cargoValidation || (vehicleType
            ? `${cargoCopy.categories[cargoCategory]} · ${cargoCopy.packagingTypes[packagingType]} · ${cargoTons.toLocaleString(undefined, { maximumFractionDigits: 3 })} tons · ${vehicleType} policy capacity ${selectedCapacity || "—"} tons`
            : "Select a vehicle to check load capacity.")}
        </div>

        <div className="mt-5 border border-asphalt/10 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">Truck & driver assignment</h3>
              <p className="mt-1 text-[11px] text-steel">Optional. Assignment requires an exact vehicle-type match, enough registered truck capacity and an approved free driver.</p>
            </div>
            {!assignmentLoading && <span className="bg-[#f5f3ed] px-3 py-2 font-mono text-[10px] text-steel">{matchingTrucks.length} trucks · {availableDrivers.length} free drivers · {busyDriverIds.size} busy</span>}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold">
              Truck
              <select name="truckId" defaultValue="" disabled={assignmentLoading || !vehicleType || Boolean(cargoValidation) || matchingTrucks.length === 0} className="mt-2 block w-full border border-asphalt/20 bg-white px-3 py-3 text-sm disabled:opacity-50">
                <option value="">Assign later</option>
                {matchingTrucks.map((truck) => <option key={truck.id} value={truck.id}>{truck.plate_number} · {truck.vehicle_type} · {truck.capacity_tons ?? "—"} tons</option>)}
              </select>
              {!assignmentLoading && vehicleType && matchingTrucks.length === 0 && <span className="mt-1 block text-[11px] text-route">No available exact-match {vehicleType} truck with enough capacity.</span>}
            </label>
            <label className="text-xs font-semibold">
              Approved free driver
              <select name="driverId" defaultValue="" disabled={assignmentLoading || !assignmentReady} className="mt-2 block w-full border border-asphalt/20 bg-white px-3 py-3 text-sm disabled:opacity-50">
                <option value="">Assign later</option>
                {availableDrivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.full_name ?? driver.phone ?? "Driver"}</option>)}
              </select>
              {!assignmentLoading && driverAvailabilityMessage && <span className="mt-1 block text-[11px] text-route">{driverAvailabilityMessage}</span>}
            </label>
          </div>
          {!assignmentLoading && !assignmentReady && (
            <div className="mt-4 border border-amber/30 bg-amber/10 p-3 text-xs leading-relaxed text-asphalt">
              Dispatch stays on <strong>Assign later</strong> until an exact matching truck has enough capacity and an approved driver is free.
            </div>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 border border-asphalt/10 bg-[#f5f3ed] p-4 sm:grid-cols-4">
          <Summary label="Road distance" value={route ? `${route.distanceKm.toLocaleString()} km` : "Select route"} />
          <Summary label="Load" value={cargoTons > 0 ? `${cargoTons.toLocaleString(undefined, { maximumFractionDigits: 3 })} t` : "Enter load"} />
          <Summary label="Vehicle" value={vehicleType || "Select vehicle"} />
          <Summary label="Freight quote" value={quoteLoading ? "Loading…" : quote != null ? `ETB ${quote.toLocaleString()}` : "Waiting"} emphasis />
        </div>

        <p className={`mt-3 text-[11px] ${quoteError ? "text-route" : "text-steel"}`}>{quoteError ? `Latest price unavailable: ${quoteError}` : "Final freight uses the latest admin-managed Supabase pricing rule. HALLO's 2% share is included inside that amount, not added on top."}</p>
        <button disabled={saving || quoteLoading || !quoteBreakdown || Boolean(createdTrackingId) || !route || !vehicleType || Boolean(cargoValidation)} className="mt-6 w-full bg-asphalt py-4 font-semibold text-white disabled:opacity-40">
          {createdTrackingId ? `Order ${createdTrackingId} created` : saving ? "Creating order…" : quoteLoading ? "Getting latest price…" : quote != null ? `Create order · ETB ${quote.toLocaleString()}` : "Create order"}
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

function PhoneField() {
  return (
    <label className="text-xs font-semibold">
      Phone
      <input
        name="customerPhone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required
        maxLength={13}
        pattern="(?:09[0-9]{8}|\+2519[0-9]{8})"
        placeholder="09xxxxxxxx or +2519xxxxxxxx"
        title="Use 09xxxxxxxx or +2519xxxxxxxx"
        className="mt-2 block w-full border border-asphalt/20 px-3 py-3 text-sm font-normal outline-none focus:border-amber"
      />
      <span className="mt-1 block text-[11px] font-normal text-steel">10 digits with 09, or +251 followed by 9 and 8 digits.</span>
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
