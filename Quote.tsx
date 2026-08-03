import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getQuote, QuoteResult } from "../services/order.service";
import { VEHICLE_TYPES, VehicleType } from "../utils/vehicles";
import { formatEtb, formatKm } from "../utils/currency";
import { Button } from "../components/ui/Button";
import { CargoPlate } from "../components/ui/CargoPlate";

// NOTE: in production, pickup/dropoff inputs should be an address autocomplete
// (e.g. wrapping OpenRouteService's /geocode/search) that resolves to [lng, lat].
// Wired here as plain text + coordinate stand-ins to keep this page functional
// without an external geocoding key.
export function Quote() {
  const navigate = useNavigate();
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [pickup, setPickup] = useState<[number, number] | null>(null);
  const [dropoff, setDropoff] = useState<[number, number] | null>(null);
  const [vehicleType, setVehicleType] = useState<VehicleType>("box_truck");
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pickup || !dropoff) {
      setError("Choose pickup and drop-off locations from the map first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getQuote({ pickup, dropoff, vehicleType });
      setQuote(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't calculate a quote.");
    } finally {
      setLoading(false);
    }
  }

  function proceedToOrder() {
    if (!quote || !pickup || !dropoff) return;
    navigate("/order", {
      state: {
        pickup,
        pickupAddress,
        dropoff,
        dropoffAddress,
        vehicleType,
        distanceKm: quote.distanceKm,
        priceEtb: quote.priceEtb,
      },
    });
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <h1 className="font-display font-bold text-3xl text-asphalt mb-2">Get an instant quote</h1>
      <p className="font-body text-steel mb-10">
        We price by real driving distance on a truck-safe route — no surprises at drop-off.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block font-mono text-xs text-steel uppercase mb-2">Pickup</label>
          <input
            type="text"
            required
            value={pickupAddress}
            onChange={(e) => setPickupAddress(e.target.value)}
            onBlur={() => !pickup && setPickup([39.2705, 8.5432])} // Adama fallback for demo
            placeholder="e.g. Franko Tower, Adama"
            className="w-full border border-line bg-white px-4 py-3 font-body focus:outline-none focus:border-route"
          />
        </div>

        <div>
          <label className="block font-mono text-xs text-steel uppercase mb-2">Drop-off</label>
          <input
            type="text"
            required
            value={dropoffAddress}
            onChange={(e) => setDropoffAddress(e.target.value)}
            onBlur={() => !dropoff && setDropoff([38.7469, 9.0192])} // Addis fallback for demo
            placeholder="e.g. Merkato, Addis Ababa"
            className="w-full border border-line bg-white px-4 py-3 font-body focus:outline-none focus:border-route"
          />
        </div>

        <div>
          <label className="block font-mono text-xs text-steel uppercase mb-3">Vehicle</label>
          <div className="grid sm:grid-cols-2 gap-3">
            {VEHICLE_TYPES.map((v) => (
              <button
                type="button"
                key={v.value}
                onClick={() => setVehicleType(v.value)}
                className={`text-left border px-4 py-3 transition-colors ${
                  vehicleType === v.value
                    ? "border-route bg-route/5"
                    : "border-line hover:border-steel"
                }`}
              >
                <div className="font-display font-semibold text-asphalt">{v.label}</div>
                <div className="font-body text-xs text-steel mt-1">{v.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="font-body text-sm text-route border border-route/40 bg-route/5 px-4 py-3">
            {error}
          </p>
        )}

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Calculating…" : "Calculate price"}
        </Button>
      </form>

      {quote && (
        <div className="mt-10 border border-asphalt bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-xs text-steel uppercase">Estimated price</span>
            <CargoPlate>{formatEtb(quote.priceEtb)}</CargoPlate>
          </div>
          <div className="grid grid-cols-2 gap-4 font-body text-sm text-steel mb-6">
            <div>
              Distance <span className="block font-mono text-asphalt">{formatKm(quote.distanceKm)}</span>
            </div>
            <div>
              Est. duration{" "}
              <span className="block font-mono text-asphalt">{quote.durationMin} min</span>
            </div>
          </div>
          <Button onClick={proceedToOrder} className="w-full">
            Book this truck →
          </Button>
        </div>
      )}
    </div>
  );
}
