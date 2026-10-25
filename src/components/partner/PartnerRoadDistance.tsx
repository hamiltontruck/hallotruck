import { useEffect, useRef, useState } from "react";
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

  return <fieldset className="space-y-3 rounded-xl border border-asphalt/10 bg-white p-3 sm:p-4">
    <legend className="px-1 font-display text-base font-bold">Automatic road distance</legend>
    <p className="text-sm text-steel">Choose pickup and destination to calculate the truck road distance.</p>
    <Place endpoint="pickup" label="Pickup map location" value={pickup} onChange={setPickup} />
    <Place endpoint="dropoff" label="Destination map location" value={dropoff} onChange={setDropoff} />
    {loading && <p role="status">Calculating truck road distance…</p>}
    {error && <div role="alert" className="text-route"><p>{error}</p><button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-2 min-h-11 border px-4">Retry route</button></div>}
    {route && <dl className="grid grid-cols-2 gap-4"><div><dt>Road distance</dt><dd className="text-xl font-bold">{route.distanceKm.toFixed(1)} km</dd></div><div><dt>Estimated travel time</dt><dd className="text-xl font-bold">{Math.ceil(route.durationMinutes)} min</dd></div></dl>}
  </fieldset>;
}

function Place({ endpoint, label, value, onChange }: { endpoint: "pickup" | "dropoff"; label: string; value: PartnerRoutePlace | null; onChange: (value: PartnerRoutePlace | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [searched, setSearched] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<PartnerRoutePlace[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    setOptions([]); setError(""); setSearched(false);
    if (value || query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void searchPartnerRoutePlaces(query, controller.signal)
        .then((items) => { if (!controller.signal.aborted) { setOptions(items); setSearched(true); } })
        .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Place search failed."); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, value]);
  return <div><label className="block text-sm font-semibold">{label}<input ref={inputRef} name={`partner-${endpoint}-place-search`} type="search" value={query} autoComplete="off" placeholder="Search a city, area or landmark" onChange={(event) => { onChange(null); setQuery(event.target.value); }} className="mt-1 min-h-11 w-full min-w-0 rounded-lg border px-3 text-base" /></label>
    {error && <p role="alert" className="text-sm text-route">{error}</p>}
    {searched && !error && !value && options.length === 0 && <p role="status" className="mt-2 text-xs text-steel">No matching place. Search a nearby town, then add the landmark in pickup / delivery instructions.</p>}
    {options.length > 0 && <ul aria-label={`${label} suggestions`}>{options.map((place) => <li key={`${place.label}:${place.coordinates.join(",")}`}><button type="button" className="min-h-12 w-full border p-3 text-left" onClick={() => { setQuery(place.label); setOptions([]); onChange(place); inputRef.current?.focus(); }}>{place.label}</button></li>)}</ul>}
  </div>;
}
