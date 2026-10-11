import { useEffect, useState } from "react";
import { searchPartnerRoutePlaces, type PartnerRoutePlace } from "../../services/partner-smart-order-routing.service";
import { getTruckRoadRoute, type TruckRoadRoute } from "../../services/routing.service";

export type PartnerRoadSelection = { pickup: PartnerRoutePlace; dropoff: PartnerRoutePlace; route: TruckRoadRoute };

export function PartnerRoadDistance({ onChange }: { onChange: (value: PartnerRoadSelection | null) => void }) {
  const [pickup, setPickup] = useState<PartnerRoutePlace | null>(null);
  const [dropoff, setDropoff] = useState<PartnerRoutePlace | null>(null);
  const [route, setRoute] = useState<TruckRoadRoute | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    onChange(null); setRoute(null); setError(""); setLoading(false);
    if (!pickup || !dropoff) return;
    const controller = new AbortController();
    setLoading(true);
    void getTruckRoadRoute({ pickup: pickup.coordinates, dropoff: dropoff.coordinates, vehicleType: "Heavy Truck", signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setRoute(result); onChange({ pickup, dropoff, route: result });
      })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Road route could not be calculated."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [pickup, dropoff, retry, onChange]);

  return <fieldset className="space-y-4 border border-asphalt/10 bg-white p-4 sm:p-6">
    <legend className="px-2 font-display text-xl font-bold">Automatic road distance</legend>
    <p className="text-sm text-steel">Choose the actual pickup and destination. Distance follows the truck road route; HALLO reviews the price separately.</p>
    <Place label="Pickup map location" value={pickup} onChange={setPickup} />
    <Place label="Destination map location" value={dropoff} onChange={setDropoff} />
    {loading && <p role="status">Calculating truck road distance…</p>}
    {error && <div role="alert" className="text-route"><p>{error}</p><button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-2 min-h-11 border px-4">Retry route</button></div>}
    {route && <dl className="grid grid-cols-2 gap-4"><div><dt>Road distance</dt><dd className="text-xl font-bold">{route.distanceKm.toFixed(1)} km</dd></div><div><dt>Estimated travel time</dt><dd className="text-xl font-bold">{Math.ceil(route.durationMinutes)} min</dd></div></dl>}
  </fieldset>;
}

function Place({ label, value, onChange }: { label: string; value: PartnerRoutePlace | null; onChange: (value: PartnerRoutePlace | null) => void }) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<PartnerRoutePlace[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    setOptions([]); setError("");
    if (value || query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void searchPartnerRoutePlaces(query, controller.signal)
        .then((items) => { if (!controller.signal.aborted) setOptions(items); })
        .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Place search failed."); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, value]);
  return <div><label className="block text-sm font-semibold">{label}<input value={query} autoComplete="off" onChange={(event) => { onChange(null); setQuery(event.target.value); }} className="mt-2 min-h-12 w-full border px-3 text-base" /></label>
    {error && <p role="alert" className="text-sm text-route">{error}</p>}
    {options.length > 0 && <ul aria-label={`${label} suggestions`}>{options.map((place) => <li key={`${place.label}:${place.coordinates.join(",")}`}><button type="button" className="min-h-12 w-full border p-3 text-left" onClick={() => { setQuery(place.label); setOptions([]); onChange(place); }}>{place.label}</button></li>)}</ul>}
  </div>;
}
