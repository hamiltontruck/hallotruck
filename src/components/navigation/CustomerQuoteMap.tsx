import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export interface QuotePoints {
  pickup: [number, number];
  dropoff: [number, number];
  pickupAddress: string;
  dropoffAddress: string;
  distanceKm: number;
}

interface SelectedPlace {
  label: string;
  coordinates: [number, number];
}

interface GeocodingFeature {
  id: string;
  place_name?: string;
  text?: string;
  center?: [number, number];
}

const mapTilerKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;
const style = `https://api.maptiler.com/maps/basic-v2/style.json?key=${mapTilerKey ?? ""}`;

function distanceKm(a: [number, number], b: [number, number]) {
  const radians = (value: number) => value * Math.PI / 180;
  const lat1 = radians(a[1]);
  const lat2 = radians(b[1]);
  const dLat = radians(b[1] - a[1]);
  const dLng = radians(b[0] - a[0]);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

async function geocode(query: string, signal?: AbortSignal) {
  if (!mapTilerKey || query.trim().length < 2) return [] as GeocodingFeature[];
  const url = new URL(`https://api.maptiler.com/geocoding/${encodeURIComponent(query.trim())}.json`);
  url.searchParams.set("key", mapTilerKey);
  url.searchParams.set("autocomplete", "true");
  url.searchParams.set("limit", "6");
  url.searchParams.set("language", "en");
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("Place search is temporarily unavailable.");
  const result = await response.json() as { features?: GeocodingFeature[] };
  return (result.features ?? []).filter((feature) => Array.isArray(feature.center) && feature.center.length === 2);
}

async function reverseGeocode(coordinates: [number, number]) {
  if (!mapTilerKey) return `${coordinates[1].toFixed(5)}, ${coordinates[0].toFixed(5)}`;
  const query = `${coordinates[0]},${coordinates[1]}`;
  const url = new URL(`https://api.maptiler.com/geocoding/${query}.json`);
  url.searchParams.set("key", mapTilerKey);
  url.searchParams.set("limit", "1");
  url.searchParams.set("language", "en");
  const response = await fetch(url);
  if (!response.ok) return `${coordinates[1].toFixed(5)}, ${coordinates[0].toFixed(5)}`;
  const result = await response.json() as { features?: GeocodingFeature[] };
  return result.features?.[0]?.place_name ?? result.features?.[0]?.text ?? `${coordinates[1].toFixed(5)}, ${coordinates[0].toFixed(5)}`;
}

function PlaceSearch({
  label,
  placeholder,
  value,
  selected,
  onValueChange,
  onSelect,
}: {
  label: string;
  placeholder: string;
  value: string;
  selected: SelectedPlace | null;
  onValueChange: (value: string) => void;
  onSelect: (place: SelectedPlace) => void;
}) {
  const [results, setResults] = useState<GeocodingFeature[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (selected?.label === value || value.trim().length < 2) {
      setResults([]);
      setMessage("");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setMessage("");
      try {
        const features = await geocode(value, controller.signal);
        setResults(features);
        if (!features.length) setMessage("No matching places found.");
      } catch (error) {
        if ((error as Error).name !== "AbortError") setMessage(error instanceof Error ? error.message : "Could not search places.");
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [selected?.label, value]);

  return (
    <div className="relative">
      <label className="block text-sm">
        {label}
        <input
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="mt-2 block w-full border border-line bg-white px-4 py-3 outline-none focus:border-amber"
        />
      </label>
      {searching && <p className="mt-1 text-[11px] text-steel">Finding places…</p>}
      {!searching && message && <p className="mt-1 text-[11px] text-route">{message}</p>}
      {results.length > 0 && (
        <div className="absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-y-auto border border-line bg-white shadow-lg">
          {results.map((feature) => {
            const featureLabel = feature.place_name ?? feature.text ?? "Place";
            return (
              <button
                key={feature.id}
                type="button"
                onClick={() => {
                  if (!feature.center) return;
                  onSelect({ label: featureLabel, coordinates: feature.center });
                  setResults([]);
                  setMessage("");
                }}
                className="block w-full border-b border-line px-4 py-3 text-left text-sm last:border-0 hover:bg-bone"
              >
                {featureLabel}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CustomerQuoteMap({ onChange }: { onChange: (points: QuotePoints | null) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [pickup, setPickup] = useState<SelectedPlace | null>(null);
  const [dropoff, setDropoff] = useState<SelectedPlace | null>(null);
  const [pickupQuery, setPickupQuery] = useState("");
  const [dropoffQuery, setDropoffQuery] = useState("");

  const choosePickup = useCallback((place: SelectedPlace) => {
    setPickup(place);
    setPickupQuery(place.label);
    map.current?.flyTo({ center: place.coordinates, zoom: 10 });
  }, []);

  const chooseDropoff = useCallback((place: SelectedPlace) => {
    setDropoff(place);
    setDropoffQuery(place.label);
    map.current?.flyTo({ center: place.coordinates, zoom: 10 });
  }, []);

  useEffect(() => {
    if (!container.current || map.current || !mapTilerKey) return;
    const instance = new maplibregl.Map({ container: container.current, style, center: [39.6, 8.8], zoom: 5 });
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    instance.on("load", () => setMapReady(true));
    instance.on("click", async (event) => {
      const coordinates: [number, number] = [event.lngLat.lng, event.lngLat.lat];
      const place: SelectedPlace = { coordinates, label: await reverseGeocode(coordinates) };
      setPickup((currentPickup) => {
        if (!currentPickup) {
          setPickupQuery(place.label);
          return place;
        }
        setDropoff((currentDropoff) => {
          if (!currentDropoff) {
            setDropoffQuery(place.label);
            return place;
          }
          setPickupQuery(place.label);
          setDropoffQuery("");
          return null;
        });
        return currentPickup;
      });
    });
    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !mapReady) return;

    markers.current.forEach((marker) => marker.remove());
    markers.current = [];
    [pickup, dropoff].forEach((place, index) => {
      if (!place) return;
      const element = document.createElement("div");
      element.className = "grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-asphalt font-mono text-xs font-bold text-amber shadow-lg";
      element.textContent = index === 0 ? "P" : "D";
      markers.current.push(new maplibregl.Marker({ element }).setLngLat(place.coordinates).addTo(instance));
    });

    const sourceId = "quote-route";
    if (instance.getLayer(sourceId)) instance.removeLayer(sourceId);
    if (instance.getSource(sourceId)) instance.removeSource(sourceId);

    if (pickup && dropoff) {
      const route = {
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "LineString" as const,
          coordinates: [pickup.coordinates, dropoff.coordinates],
        },
      };
      instance.addSource(sourceId, { type: "geojson", data: route });
      instance.addLayer({
        id: sourceId,
        type: "line",
        source: sourceId,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#d68e25", "line-width": 5, "line-opacity": 0.85 },
      });
      const km = distanceKm(pickup.coordinates, dropoff.coordinates);
      onChange({
        pickup: pickup.coordinates,
        dropoff: dropoff.coordinates,
        pickupAddress: pickup.label,
        dropoffAddress: dropoff.label,
        distanceKm: Number((km * 1.18).toFixed(1)),
      });
      instance.fitBounds(new maplibregl.LngLatBounds(pickup.coordinates, dropoff.coordinates), { padding: 55 });
    } else {
      onChange(null);
    }
  }, [dropoff, mapReady, onChange, pickup]);

  function reset() {
    setPickup(null);
    setDropoff(null);
    setPickupQuery("");
    setDropoffQuery("");
    onChange(null);
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2">
        <PlaceSearch
          label="Pickup place"
          placeholder="Find pickup place"
          value={pickupQuery}
          selected={pickup}
          onValueChange={(value) => {
            setPickupQuery(value);
            if (value !== pickup?.label) setPickup(null);
          }}
          onSelect={choosePickup}
        />
        <PlaceSearch
          label="Drop-off place"
          placeholder="Find delivery place"
          value={dropoffQuery}
          selected={dropoff}
          onValueChange={(value) => {
            setDropoffQuery(value);
            if (value !== dropoff?.label) setDropoff(null);
          }}
          onSelect={chooseDropoff}
        />
      </div>
      <div className="mb-2 mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-steel">{!pickup ? "Search or tap the pickup location" : !dropoff ? "Now search or tap the drop-off location" : "Pickup, drop-off and route selected"}</p>
        {(pickup || dropoff) && <button type="button" onClick={reset} className="text-xs font-semibold text-route">Reset route</button>}
      </div>
      {mapTilerKey ? <div ref={container} className="h-64 w-full border border-line bg-[#e9e5da]" /> : <div className="grid h-64 place-items-center border border-route/30 bg-route/5 p-6 text-center text-sm text-route">Map key is not configured. Add VITE_MAPTILER_KEY to enable place search and mapping.</div>}
      <p className="mt-2 text-[11px] text-steel">P = pickup · D = drop-off · line shows the selected route corridor. Distance uses the existing estimated-road factor until live road routing is connected.</p>
    </div>
  );
}
