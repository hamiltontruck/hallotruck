import { useEffect, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./booking-map.css";
import {
  reverseCustomerPlace,
  searchCustomerPlaces,
  type CustomerPlaceOption,
  type CustomerQuotePreview,
} from "./customer-quote.service";

type ActiveField = "pickup" | "dropoff";

type CustomerBookingMapProps = {
  pickup: string;
  dropoff: string;
  pickupPlace: CustomerPlaceOption | null;
  dropoffPlace: CustomerPlaceOption | null;
  routePreview: CustomerQuotePreview | null;
  onPickupChange: (value: string) => void;
  onDropoffChange: (value: string) => void;
  onPickupSelect: (place: CustomerPlaceOption) => void;
  onDropoffSelect: (place: CustomerPlaceOption) => void;
  onBook: () => void;
};

const mapTilerKey = (import.meta.env.VITE_MAPTILER_KEY as string | undefined)?.trim();
const mapStyle = mapTilerKey
  ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(mapTilerKey)}`
  : "https://tiles.openfreemap.org/styles/liberty";

function markerElement(kind: ActiveField) {
  const element = document.createElement("div");
  element.className = `booking-map-marker booking-map-marker-${kind}`;
  element.setAttribute("aria-label", kind === "pickup" ? "Pickup location" : "Drop-off location");
  element.innerHTML = `<span>${kind === "pickup" ? "P" : "D"}</span>`;
  return element;
}

function updateMarker(
  current: Marker | null,
  map: maplibregl.Map,
  coordinates: [number, number] | null,
  kind: ActiveField,
) {
  if (!coordinates) {
    current?.remove();
    return null;
  }
  if (current) {
    current.setLngLat(coordinates);
    return current;
  }
  return new maplibregl.Marker({ element: markerElement(kind), anchor: "bottom" })
    .setLngLat(coordinates)
    .addTo(map);
}

function PlaceSearch({
  field,
  label,
  placeholder,
  value,
  selected,
  onActivate,
  onChange,
  onSelect,
}: {
  field: ActiveField;
  label: string;
  placeholder: string;
  value: string;
  selected: CustomerPlaceOption | null;
  onActivate: (field: ActiveField) => void;
  onChange: (value: string) => void;
  onSelect: (place: CustomerPlaceOption) => void;
}) {
  const [results, setResults] = useState<CustomerPlaceOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (selected?.label === value || value.trim().length < 2) {
      setResults([]);
      setMessage("");
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setMessage("");
      try {
        const places = await searchCustomerPlaces(value, controller.signal);
        setResults(places);
        if (!places.length) setMessage("Bakki wal-simu hin argamne.");
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setResults([]);
          setMessage(error instanceof Error ? error.message : "Bakka barbaaduun hin danda'amne.");
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 280);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [selected?.label, value]);

  return (
    <div className="booking-place-field">
      <label>
        <span><i className={`route-dot ${field === "pickup" ? "route-dot-green" : "route-dot-gold"}`} /> {label}</span>
        <input
          value={value}
          onFocus={() => onActivate(field)}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          aria-autocomplete="list"
        />
      </label>
      {searching && <small className="booking-place-message">Bakkoota barbaadaa jira…</small>}
      {!searching && message && <small className="booking-place-message booking-place-error">{message}</small>}
      {results.length > 0 && (
        <div className="booking-place-results" role="listbox" aria-label={`${label} results`}>
          {results.map((place) => (
            <button
              type="button"
              role="option"
              aria-selected="false"
              key={`${place.label}-${place.coordinates.join(",")}`}
              onClick={() => {
                onSelect(place);
                setResults([]);
                setMessage("");
              }}
            >
              <span className={`place-result-pin ${field}`}>{field === "pickup" ? "P" : "D"}</span>
              <span>{place.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CustomerBookingMap({
  pickup,
  dropoff,
  pickupPlace,
  dropoffPlace,
  routePreview,
  onPickupChange,
  onDropoffChange,
  onPickupSelect,
  onDropoffSelect,
  onBook,
}: CustomerBookingMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const pickupMarkerRef = useRef<Marker | null>(null);
  const dropoffMarkerRef = useRef<Marker | null>(null);
  const activeFieldRef = useRef<ActiveField>("pickup");
  const pickupSelectRef = useRef(onPickupSelect);
  const dropoffSelectRef = useRef(onDropoffSelect);
  const [mapReady, setMapReady] = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapMessage, setMapMessage] = useState("");

  useEffect(() => { pickupSelectRef.current = onPickupSelect; }, [onPickupSelect]);
  useEffect(() => { dropoffSelectRef.current = onDropoffSelect; }, [onDropoffSelect]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: [39.6, 8.8],
      zoom: 5.7,
      attributionControl: false,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
    map.on("load", () => setMapReady(true));
    map.on("click", (event) => {
      const coordinates: [number, number] = [event.lngLat.lng, event.lngLat.lat];
      const field = activeFieldRef.current;
      setMapMessage("Bakka kaartaa irraa filatame mirkaneessaa jira…");
      void reverseCustomerPlace(coordinates)
        .then((place) => {
          if (field === "pickup") {
            pickupSelectRef.current(place);
            activeFieldRef.current = "dropoff";
          } else {
            dropoffSelectRef.current(place);
          }
          setMapMessage("");
        })
        .catch((error: unknown) => {
          setMapMessage(error instanceof Error ? error.message : "Bakka kaartaa irraa filachuun hin danda'amne.");
        });
    });
    mapRef.current = map;

    return () => {
      pickupMarkerRef.current?.remove();
      dropoffMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const pickupCoordinates = routePreview?.pickup ?? pickupPlace?.coordinates ?? null;
    const dropoffCoordinates = routePreview?.dropoff ?? dropoffPlace?.coordinates ?? null;
    pickupMarkerRef.current = updateMarker(pickupMarkerRef.current, map, pickupCoordinates, "pickup");
    dropoffMarkerRef.current = updateMarker(dropoffMarkerRef.current, map, dropoffCoordinates, "dropoff");

    const sourceId = "customer-booking-hgv-route";
    const layerId = "customer-booking-hgv-route-line";
    const coordinates = routePreview?.route_coordinates ?? [];
    const source = map.getSource(sourceId) as GeoJSONSource | undefined;

    if (coordinates.length >= 2) {
      const data = {
        type: "Feature" as const,
        properties: {},
        geometry: { type: "LineString" as const, coordinates },
      };
      if (source) {
        source.setData(data);
      } else {
        map.addSource(sourceId, { type: "geojson", data });
        map.addLayer({
          id: layerId,
          type: "line",
          source: sourceId,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#0759c7", "line-width": 5, "line-opacity": 0.84 },
        });
      }
    } else if (source) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      map.removeSource(sourceId);
    }

    const points = coordinates.length >= 2
      ? coordinates
      : [pickupCoordinates, dropoffCoordinates].filter((point): point is [number, number] => point !== null);
    if (points.length) {
      const bounds = points.slice(1).reduce(
        (current, point) => current.extend(point),
        new maplibregl.LngLatBounds(points[0], points[0]),
      );
      map.fitBounds(bounds, { padding: { top: 210, right: 42, bottom: 150, left: 42 }, maxZoom: 13, duration: 500 });
    }
  }, [dropoffPlace, mapReady, pickupPlace, routePreview]);

  function useMyLocation() {
    if (locating) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setMapMessage("Device location hin deeggaramu.");
      return;
    }

    setLocating(true);
    setMapMessage("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coordinates: [number, number] = [position.coords.longitude, position.coords.latitude];
        void reverseCustomerPlace(coordinates)
          .then((place) => {
            onPickupSelect(place);
            activeFieldRef.current = "dropoff";
            mapRef.current?.easeTo({ center: coordinates, zoom: 12, duration: 450 });
          })
          .catch((error: unknown) => {
            setMapMessage(error instanceof Error ? error.message : "Bakka ati jirtu dubbisuun hin danda'amne.");
          })
          .finally(() => setLocating(false));
      },
      () => {
        setLocating(false);
        setMapMessage("Location permission hin argamne. Hayyama browser/device ilaali.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  }

  const routeSelected = Boolean(pickupPlace && dropoffPlace);

  return (
    <section className="map-surface real-booking-map" aria-label="Real Customer booking map">
      <div ref={containerRef} className="booking-map-canvas" />

      <div className="route-card real-route-card">
        <PlaceSearch
          field="pickup"
          label="PICKUP PLACE"
          placeholder="Bakka fe'umsaa barbaadi"
          value={pickup}
          selected={pickupPlace}
          onActivate={(field) => { activeFieldRef.current = field; }}
          onChange={onPickupChange}
          onSelect={onPickupSelect}
        />
        <div className="route-divider" />
        <PlaceSearch
          field="dropoff"
          label="DROP-OFF PLACE"
          placeholder="Bakka geessuu barbaadi"
          value={dropoff}
          selected={dropoffPlace}
          onActivate={(field) => { activeFieldRef.current = field; }}
          onChange={onDropoffChange}
          onSelect={onDropoffSelect}
        />
      </div>

      <button type="button" className="my-location real-location-button" onClick={useMyLocation} disabled={locating}>
        <span aria-hidden="true">⌖</span> {locating ? "Locating…" : "My Location"}
      </button>

      {routePreview && (
        <div className="real-route-summary" aria-label="HGV route summary">
          <strong>{routePreview.distance_km.toFixed(1)} km</strong>
          <span>{Math.round(routePreview.duration_minutes)} min · {routePreview.vehicle_type} HGV route</span>
        </div>
      )}
      {mapMessage && <div className="booking-map-message" role="status">{mapMessage}</div>}

      <div className="start-sheet real-start-sheet">
        <span className="sheet-handle" />
        <div>
          <strong>{routePreview ? "Truck route ready" : routeSelected ? "Route selected" : "Start your booking"}</strong>
          <small>{routePreview ? "Real HGV route is shown on the map." : routeSelected ? "Choose truck and cargo to calculate the secure quote." : "Search or tap the map to choose pickup and drop-off."}</small>
        </div>
        <button type="button" onClick={onBook} disabled={!routeSelected}>Book Now <span aria-hidden="true">→</span></button>
      </div>
    </section>
  );
}
