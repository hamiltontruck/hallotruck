import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useLanguage, type HalloLanguage } from "../../i18n/LanguageProvider";
import { getTruckRoadRoute, type TruckRoadRoute } from "../../services/routing.service";

export interface QuotePoints {
  pickup: [number, number];
  dropoff: [number, number];
  pickupAddress: string;
  dropoffAddress: string;
  distanceKm: number;
  durationMinutes: number;
  provider: "openrouteservice";
  profile: "driving-hgv";
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

const routeCopy: Record<HalloLanguage, {
  pickup: string;
  pickupPlaceholder: string;
  dropoff: string;
  dropoffPlaceholder: string;
  finding: string;
  noPlaces: string;
  searchFailed: string;
  place: string;
  choosePickup: string;
  chooseDropoff: string;
  calculating: string;
  unavailable: string;
  selected: string;
  useLocation: string;
  locating: string;
  locationFailed: string;
  swap: string;
  reset: string;
  mapMissing: string;
  distance: string;
  drivingTime: string;
  routeFailed: string;
  retry: string;
  hint: string;
  truckRoute: string;
}> = {
  en: {
    pickup: "Pickup place",
    pickupPlaceholder: "Find pickup place",
    dropoff: "Drop-off place",
    dropoffPlaceholder: "Find delivery place",
    finding: "Finding places…",
    noPlaces: "No matching places found.",
    searchFailed: "Could not search places.",
    place: "Place",
    choosePickup: "Search, use your location or tap the pickup point",
    chooseDropoff: "Now search or tap the drop-off point",
    calculating: "Calculating a truck-safe route…",
    unavailable: "Truck route unavailable",
    selected: "Truck route selected",
    useLocation: "My location",
    locating: "Locating…",
    locationFailed: "Your location could not be read. Check browser location permission.",
    swap: "Swap",
    reset: "Reset",
    mapMissing: "Map key is not configured. Add VITE_MAPTILER_KEY to enable place search and mapping.",
    distance: "Truck-road distance",
    drivingTime: "estimated driving time",
    routeFailed: "No safe truck route could be calculated for those places.",
    retry: "Choose another nearby place or retry.",
    hint: "P = pickup · D = drop-off · drag either marker to refine the route. Distance follows a live heavy-truck road route.",
    truckRoute: "HGV route",
  },
  om: {
    pickup: "Bakka fe'umsaa",
    pickupPlaceholder: "Bakka fe'umsaa barbaadi",
    dropoff: "Bakka geessuu",
    dropoffPlaceholder: "Bakka geessuu barbaadi",
    finding: "Bakkoota barbaadaa jira…",
    noPlaces: "Bakki wal-simu hin argamne.",
    searchFailed: "Bakka barbaaduun hin danda'amne.",
    place: "Bakka",
    choosePickup: "Barbaadi, bakka jirtu fayyadami ykn bakka fe'umsaa kaartaa tuqi",
    chooseDropoff: "Amma bakka geessuu barbaadi ykn kaartaa tuqi",
    calculating: "Daandii truck nageenya qabu shallagaa jira…",
    unavailable: "Daandiin truck hin argamne",
    selected: "Daandiin truck filatameera",
    useLocation: "Bakka ani jiru",
    locating: "Bakka barbaadaa…",
    locationFailed: "Bakki ati jirtu hin argamne. Hayyama location browser keetii ilaali.",
    swap: "Wal-jijjiiri",
    reset: "Haari godhi",
    mapMissing: "Map key hin qindaa'in. Kaartaa fi barbaacha bakkaaf VITE_MAPTILER_KEY galchi.",
    distance: "Fageenya daandii truck",
    drivingTime: "yeroo geejjibaa tilmaamaa",
    routeFailed: "Bakkoota kana gidduutti daandii truck nageenya qabu shallaguun hin danda'amne.",
    retry: "Bakka biraa dhihoo fili ykn irra deebi'i.",
    hint: "P = bakka fe'umsaa · D = bakka geessuu · route sirreessuuf mallattoo harkisi. Fageenyi daandii truck guddaa hordofa.",
    truckRoute: "Daandii HGV",
  },
  am: {
    pickup: "የመጫኛ ቦታ",
    pickupPlaceholder: "የመጫኛ ቦታ ይፈልጉ",
    dropoff: "የማድረሻ ቦታ",
    dropoffPlaceholder: "የማድረሻ ቦታ ይፈልጉ",
    finding: "ቦታዎችን በመፈለግ ላይ…",
    noPlaces: "ተዛማጅ ቦታ አልተገኘም።",
    searchFailed: "ቦታዎችን መፈለግ አልተቻለም።",
    place: "ቦታ",
    choosePickup: "ይፈልጉ፣ ያሉበትን ቦታ ይጠቀሙ ወይም መጫኛውን በካርታ ይንኩ",
    chooseDropoff: "አሁን የማድረሻ ቦታውን ይፈልጉ ወይም ካርታውን ይንኩ",
    calculating: "ለከባድ መኪና ተስማሚ መንገድ በማስላት ላይ…",
    unavailable: "የከባድ መኪና መንገድ አልተገኘም",
    selected: "የከባድ መኪና መንገድ ተመርጧል",
    useLocation: "ያለሁበት ቦታ",
    locating: "ቦታዎን በመፈለግ ላይ…",
    locationFailed: "ቦታዎን ማንበብ አልተቻለም። የአሳሹን የቦታ ፈቃድ ይፈትሹ።",
    swap: "ቀይር",
    reset: "ዳግም ጀምር",
    mapMissing: "የካርታ ቁልፍ አልተዋቀረም። የቦታ ፍለጋና ካርታ ለማስቻል VITE_MAPTILER_KEY ያክሉ።",
    distance: "የከባድ መኪና የመንገድ ርቀት",
    drivingTime: "ግምታዊ የመንዳት ጊዜ",
    routeFailed: "በእነዚህ ቦታዎች መካከል ለከባድ መኪና ተስማሚ መንገድ ማስላት አልተቻለም።",
    retry: "ሌላ ቅርብ ቦታ ይምረጡ ወይም እንደገና ይሞክሩ።",
    hint: "P = መጫኛ · D = ማድረሻ · መንገዱን ለማስተካከል ምልክቱን ይጎትቱ። ርቀቱ የከባድ መኪና መንገድን ይከተላል።",
    truckRoute: "የHGV መንገድ",
  },
};

const mapTilerKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;
const mapStyle = `https://api.maptiler.com/maps/basic-v2/style.json?key=${mapTilerKey ?? ""}`;

async function geocode(query: string, language: HalloLanguage, signal?: AbortSignal) {
  if (!mapTilerKey || query.trim().length < 2) return [] as GeocodingFeature[];
  const url = new URL(`https://api.maptiler.com/geocoding/${encodeURIComponent(query.trim())}.json`);
  url.searchParams.set("key", mapTilerKey);
  url.searchParams.set("autocomplete", "true");
  url.searchParams.set("limit", "6");
  url.searchParams.set("language", language);
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("Place search is temporarily unavailable.");
  const result = await response.json() as { features?: GeocodingFeature[] };
  return (result.features ?? []).filter((feature) => Array.isArray(feature.center) && feature.center.length === 2);
}

async function reverseGeocode(coordinates: [number, number], language: HalloLanguage) {
  const fallback = `${coordinates[1].toFixed(5)}, ${coordinates[0].toFixed(5)}`;
  if (!mapTilerKey) return fallback;
  const url = new URL(`https://api.maptiler.com/geocoding/${coordinates[0]},${coordinates[1]}.json`);
  url.searchParams.set("key", mapTilerKey);
  url.searchParams.set("limit", "1");
  url.searchParams.set("language", language);
  const response = await fetch(url);
  if (!response.ok) return fallback;
  const result = await response.json() as { features?: GeocodingFeature[] };
  return result.features?.[0]?.place_name ?? result.features?.[0]?.text ?? fallback;
}

function PlaceSearch({
  label,
  placeholder,
  value,
  selected,
  language,
  onValueChange,
  onSelect,
}: {
  label: string;
  placeholder: string;
  value: string;
  selected: SelectedPlace | null;
  language: HalloLanguage;
  onValueChange: (value: string) => void;
  onSelect: (place: SelectedPlace) => void;
}) {
  const t = routeCopy[language];
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
        const features = await geocode(value, language, controller.signal);
        setResults(features);
        if (!features.length) setMessage(t.noPlaces);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setMessage(t.searchFailed);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [language, selected?.label, t.noPlaces, t.searchFailed, value]);

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
      {searching && <p className="mt-1 text-[11px] text-steel">{t.finding}</p>}
      {!searching && message && <p className="mt-1 text-[11px] text-route">{message}</p>}
      {results.length > 0 && (
        <div className="absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-y-auto border border-line bg-white shadow-lg">
          {results.map((feature) => {
            const featureLabel = feature.place_name ?? feature.text ?? t.place;
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

export function CustomerQuoteMap({
  onChange,
  vehicleType = "Dry Cargo",
}: {
  onChange: (points: QuotePoints | null) => void;
  vehicleType?: string;
}) {
  const { language } = useLanguage();
  const t = routeCopy[language];
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const pickupRef = useRef<SelectedPlace | null>(null);
  const dropoffRef = useRef<SelectedPlace | null>(null);
  const languageRef = useRef(language);
  const [mapReady, setMapReady] = useState(false);
  const [pickup, setPickup] = useState<SelectedPlace | null>(null);
  const [dropoff, setDropoff] = useState<SelectedPlace | null>(null);
  const [pickupQuery, setPickupQuery] = useState("");
  const [dropoffQuery, setDropoffQuery] = useState("");
  const [roadRoute, setRoadRoute] = useState<TruckRoadRoute | null>(null);
  const [routing, setRouting] = useState(false);
  const [routingError, setRoutingError] = useState("");
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");

  useEffect(() => { languageRef.current = language; }, [language]);

  const choosePickup = useCallback((place: SelectedPlace) => {
    pickupRef.current = place;
    setPickup(place);
    setPickupQuery(place.label);
    map.current?.flyTo({ center: place.coordinates, zoom: 10 });
  }, []);

  const chooseDropoff = useCallback((place: SelectedPlace) => {
    dropoffRef.current = place;
    setDropoff(place);
    setDropoffQuery(place.label);
    map.current?.flyTo({ center: place.coordinates, zoom: 10 });
  }, []);

  useEffect(() => {
    if (!container.current || map.current || !mapTilerKey) return;
    const instance = new maplibregl.Map({ container: container.current, style: mapStyle, center: [39.6, 8.8], zoom: 5 });
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    instance.on("load", () => setMapReady(true));
    instance.on("click", (event) => {
      const coordinates: [number, number] = [event.lngLat.lng, event.lngLat.lat];
      void reverseGeocode(coordinates, languageRef.current).then((label) => {
        const place: SelectedPlace = { coordinates, label };
        if (!pickupRef.current) {
          choosePickup(place);
        } else if (!dropoffRef.current) {
          chooseDropoff(place);
        } else {
          dropoffRef.current = null;
          setDropoff(null);
          setDropoffQuery("");
          choosePickup(place);
        }
      });
    });
    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
      setMapReady(false);
    };
  }, [chooseDropoff, choosePickup]);

  useEffect(() => {
    if (!pickup || !dropoff) {
      setRoadRoute(null);
      setRouting(false);
      setRoutingError("");
      onChange(null);
      return;
    }

    const controller = new AbortController();
    setRoadRoute(null);
    setRouting(true);
    setRoutingError("");
    onChange(null);

    void getTruckRoadRoute({
      pickup: pickup.coordinates,
      dropoff: dropoff.coordinates,
      vehicleType,
      signal: controller.signal,
    })
      .then((route) => {
        setRoadRoute(route);
        onChange({
          pickup: pickup.coordinates,
          dropoff: dropoff.coordinates,
          pickupAddress: pickup.label,
          dropoffAddress: dropoff.label,
          distanceKm: route.distanceKm,
          durationMinutes: route.durationMinutes,
          provider: route.provider,
          profile: route.profile,
        });
      })
      .catch((error) => {
        if ((error as Error).name === "AbortError") return;
        setRoutingError(t.routeFailed);
        onChange(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setRouting(false);
      });

    return () => controller.abort();
  }, [dropoff, onChange, pickup, t.routeFailed, vehicleType]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !mapReady) return;

    markers.current.forEach((marker) => marker.remove());
    markers.current = [];
    ([pickup, dropoff] as const).forEach((place, index) => {
      if (!place) return;
      const element = document.createElement("div");
      element.className = "customer-quote-map__marker grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-asphalt font-mono text-xs font-bold text-amber shadow-lg";
      element.textContent = index === 0 ? "P" : "D";
      element.setAttribute("aria-label", index === 0 ? t.pickup : t.dropoff);
      const marker = new maplibregl.Marker({ element, draggable: true }).setLngLat(place.coordinates).addTo(instance);
      marker.on("dragend", () => {
        const position = marker.getLngLat();
        const coordinates: [number, number] = [position.lng, position.lat];
        void reverseGeocode(coordinates, languageRef.current).then((label) => {
          const updated = { coordinates, label };
          if (index === 0) choosePickup(updated);
          else chooseDropoff(updated);
        });
      });
      markers.current.push(marker);
    });

    const sourceId = "quote-route";
    if (instance.getLayer(sourceId)) instance.removeLayer(sourceId);
    if (instance.getSource(sourceId)) instance.removeSource(sourceId);

    if (pickup && dropoff) {
      const coordinates = roadRoute?.coordinates ?? [pickup.coordinates, dropoff.coordinates];
      instance.addSource(sourceId, {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates },
        },
      });
      instance.addLayer({
        id: sourceId,
        type: "line",
        source: sourceId,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": routingError ? "#c65d3b" : "#d68e25",
          "line-width": roadRoute ? 5 : 3,
          "line-opacity": roadRoute ? 0.9 : 0.45,
          "line-dasharray": roadRoute ? [1, 0] : [2, 2],
        },
      });

      const bounds = coordinates.reduce(
        (current, point) => current.extend(point),
        new maplibregl.LngLatBounds(coordinates[0], coordinates[0]),
      );
      instance.fitBounds(bounds, { padding: 55 });
    }
  }, [chooseDropoff, choosePickup, dropoff, mapReady, pickup, roadRoute, routingError, t.dropoff, t.pickup]);

  function reset() {
    pickupRef.current = null;
    dropoffRef.current = null;
    setPickup(null);
    setDropoff(null);
    setPickupQuery("");
    setDropoffQuery("");
    setRoadRoute(null);
    setRouting(false);
    setRoutingError("");
    setLocationError("");
    onChange(null);
  }

  function swapPlaces() {
    if (!pickup || !dropoff) return;
    pickupRef.current = dropoff;
    dropoffRef.current = pickup;
    setPickup(dropoff);
    setDropoff(pickup);
    setPickupQuery(dropoff.label);
    setDropoffQuery(pickup.label);
  }

  function useCurrentLocation() {
    setLocationError("");
    if (!("geolocation" in navigator)) {
      setLocationError(t.locationFailed);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coordinates: [number, number] = [position.coords.longitude, position.coords.latitude];
        void reverseGeocode(coordinates, languageRef.current)
          .then((label) => choosePickup({ coordinates, label }))
          .catch(() => choosePickup({ coordinates, label: `${coordinates[1].toFixed(5)}, ${coordinates[0].toFixed(5)}` }))
          .finally(() => setLocating(false));
      },
      () => {
        setLocationError(t.locationFailed);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  }

  const routeHours = roadRoute ? Math.floor(roadRoute.durationMinutes / 60) : 0;
  const routeMinutes = roadRoute ? roadRoute.durationMinutes % 60 : 0;

  return (
    <div className="customer-quote-map">
      <div className="grid gap-4 sm:grid-cols-2">
        <PlaceSearch
          label={t.pickup}
          placeholder={t.pickupPlaceholder}
          value={pickupQuery}
          selected={pickup}
          language={language}
          onValueChange={(value) => {
            setPickupQuery(value);
            if (value !== pickup?.label) {
              pickupRef.current = null;
              setPickup(null);
            }
          }}
          onSelect={choosePickup}
        />
        <PlaceSearch
          label={t.dropoff}
          placeholder={t.dropoffPlaceholder}
          value={dropoffQuery}
          selected={dropoff}
          language={language}
          onValueChange={(value) => {
            setDropoffQuery(value);
            if (value !== dropoff?.label) {
              dropoffRef.current = null;
              setDropoff(null);
            }
          }}
          onSelect={chooseDropoff}
        />
      </div>

      <div className="customer-quote-map__status mb-2 mt-4 flex items-center justify-between gap-3" aria-live="polite">
        <p className="text-xs text-steel">
          {!pickup ? t.choosePickup : !dropoff ? t.chooseDropoff : routing ? t.calculating : routingError ? t.unavailable : t.selected}
        </p>
        <div className="customer-quote-map__actions">
          <button type="button" onClick={useCurrentLocation} disabled={locating}>{locating ? t.locating : `⌖ ${t.useLocation}`}</button>
          {pickup && dropoff && <button type="button" onClick={swapPlaces}>⇄ {t.swap}</button>}
          {(pickup || dropoff) && <button type="button" onClick={reset}>{t.reset}</button>}
        </div>
      </div>

      {mapTilerKey
        ? <div ref={container} className="h-64 w-full border border-line bg-[#e9e5da]" />
        : <div className="grid h-64 place-items-center border border-route/30 bg-route/5 p-6 text-center text-sm text-route">{t.mapMissing}</div>}

      {locationError && <p className="customer-quote-map__error mt-2 text-[11px] font-semibold text-route">{locationError}</p>}
      {routing && <p className="customer-quote-map__routing mt-2 text-[11px] font-semibold text-amber-dim">{t.calculating}</p>}
      {routingError && <p className="customer-quote-map__error mt-2 text-[11px] font-semibold text-route">{routingError} {t.retry}</p>}
      {roadRoute && (
        <p className="customer-quote-map__result mt-2 text-[11px] font-semibold text-emerald-700">
          <span>{t.truckRoute}</span> {t.distance}: {roadRoute.distanceKm.toLocaleString()} km · {t.drivingTime}: {routeHours > 0 ? `${routeHours}h ` : ""}{routeMinutes}m
        </p>
      )}
      <p className="customer-quote-map__hint mt-2 text-[11px] text-steel">{t.hint}</p>
    </div>
  );
}
