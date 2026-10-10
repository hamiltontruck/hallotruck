import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getCurrentPartnerMemberships } from "../services/partner.service";
import { searchPartnerRoutePlaces, type PartnerRoutePlace } from "../services/partner-smart-order-routing.service";

type Endpoint = "pickup" | "dropoff";

export function PartnerSmartOrderV2() {
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState("");
  const [pickup, setPickup] = useState<PartnerRoutePlace | null>(null);
  const [dropoff, setDropoff] = useState<PartnerRoutePlace | null>(null);
  const mapNode = useRef<HTMLDivElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<{ pickup?: maplibregl.Marker; dropoff?: maplibregl.Marker }>({});

  useEffect(() => {
    void getCurrentPartnerMemberships().then((items) => setAllowed(items.some((item) => ["owner", "admin"].includes(item.member_role)))).catch((reason) => setError(reason instanceof Error ? reason.message : "Partner access could not be verified."));
  }, []);

  useEffect(() => {
    const key = (import.meta.env.VITE_MAPTILER_KEY as string | undefined)?.trim();
    if (!allowed || !mapNode.current || map.current || !key) {
      if (allowed && !key) setError("Map is not configured.");
      return;
    }
    const instance = new maplibregl.Map({
      container: mapNode.current,
      style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${key}`,
      center: [42.5, 9.5],
      zoom: 5,
    });
    instance.addControl(new maplibregl.NavigationControl(), "top-right");
    map.current = instance;
    return () => { instance.remove(); map.current = null; };
  }, [allowed]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const sync = (endpoint: Endpoint, place: PartnerRoutePlace | null, color: string, update: (place: PartnerRoutePlace) => void) => {
      markers.current[endpoint]?.remove();
      delete markers.current[endpoint];
      if (!place) return;
      const marker = new maplibregl.Marker({ color, draggable: true }).setLngLat(place.coordinates).addTo(instance);
      marker.on("dragend", () => {
        const point = marker.getLngLat();
        update({ label: `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`, coordinates: [point.lng, point.lat] });
      });
      markers.current[endpoint] = marker;
    };
    sync("pickup", pickup, "#0f9f75", setPickup);
    sync("dropoff", dropoff, "#d83b3b", setDropoff);
    const bounds = [pickup, dropoff].filter((place): place is PartnerRoutePlace => Boolean(place)).map((place) => place.coordinates);
    if (bounds.length === 2) instance.fitBounds(bounds as [[number, number], [number, number]], { padding: 64, maxZoom: 12 });
  }, [pickup, dropoff]);

  return <main className="min-h-screen overflow-x-hidden bg-[#f5f3ed] px-4 py-6 text-asphalt sm:px-7">
    <section className="mx-auto max-w-3xl">
      <p className="font-mono text-[10px] tracking-[.22em] text-amber">PARTNER SMART ORDER V2 · ROUTE</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Choose pickup and destination</h1>
      <p className="mt-2 text-sm text-asphalt/60">Search real locations in the HALLO Ethiopia–Djibouti–Somalia corridor.</p>
      {error && <p role="alert" className="mt-4 border border-route/30 bg-route/5 p-4 text-sm text-route">{error}</p>}
      {!allowed ? <p className="mt-5 border border-amber/30 bg-white p-4 text-sm">Only Partner owners and admins can create orders.</p> :
        <div className="mt-5 grid gap-4">
          <PlaceSearch endpoint="pickup" label="Pickup" value={pickup} onChange={(place) => { setPickup(place); setError(""); }} onError={setError} />
          <PlaceSearch endpoint="dropoff" label="Destination" value={dropoff} onChange={(place) => { setDropoff(place); setError(""); }} onError={setError} />
          <div ref={mapNode} aria-label="Pickup and destination map" className="h-[52vh] min-h-72 w-full overflow-hidden border border-asphalt/10 bg-white" />
        </div>}
    </section>
  </main>;
}

function PlaceSearch({ endpoint, label, value, onChange, onError }: { endpoint: Endpoint; label: string; value: PartnerRoutePlace | null; onChange: (place: PartnerRoutePlace | null) => void; onError: (message: string) => void }) {
  const [query, setQuery] = useState(value?.label ?? "");
  const [options, setOptions] = useState<PartnerRoutePlace[]>([]);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    request.current?.abort();
    onChange(null);
    if (query.trim().length < 2) { setOptions([]); return; }
    const controller = new AbortController(); request.current = controller;
    const timer = window.setTimeout(() => { void searchPartnerRoutePlaces(query, controller.signal).then(setOptions).catch((reason) => { if (reason instanceof DOMException && reason.name === "AbortError") return; onError(reason instanceof Error ? reason.message : "Place search failed."); }); }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);
  return <label className="block text-sm font-semibold">{label}
    <input aria-label={label} value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" className="mt-2 min-h-12 w-full border border-asphalt/15 bg-white px-3 text-base outline-none focus:border-amber" />
    {options.length > 0 && <ul aria-label={`${endpoint} suggestions`} className="border border-asphalt/10 bg-white">{options.map((place) => <li key={place.label}><button type="button" className="min-h-12 w-full px-3 text-left hover:bg-amber/10" onClick={() => { setQuery(place.label); setOptions([]); onChange(place); }}>{place.label}</button></li>)}</ul>}
  </label>;
}
