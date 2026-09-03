export const HALLO_GEOCODING_COUNTRIES = ["et", "dj", "so"] as const;

interface OperatingBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

// Customer booking currently operates on the Ethiopia–Djibouti–Somalia corridor.
// Keep this list explicit so adding a new country is a deliberate product change.
const HALLO_OPERATING_BOUNDS: readonly OperatingBounds[] = [
  { west: 32.8, south: 3.0, east: 48.1, north: 15.2 }, // Ethiopia
  { west: 41.6, south: 10.8, east: 43.6, north: 12.9 }, // Djibouti
  { west: 40.8, south: -1.9, east: 51.7, north: 12.3 }, // Somalia
];

export function isHalloOperatingCoordinate(coordinates: [number, number]): boolean {
  const [longitude, latitude] = coordinates;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return false;

  return HALLO_OPERATING_BOUNDS.some(({ west, south, east, north }) => (
    longitude >= west
    && longitude <= east
    && latitude >= south
    && latitude <= north
  ));
}

export function isMapTilerGeocodingUrl(url: URL): boolean {
  return url.origin === "https://api.maptiler.com" && url.pathname.startsWith("/geocoding/");
}
