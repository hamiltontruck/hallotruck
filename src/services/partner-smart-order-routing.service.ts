import { selectGeocodeCandidates, type GeocodeFeature } from "../../shared/geocoder-routing";

export type PartnerRoutePlace = { label: string; coordinates: [number, number] };
const mapTilerKey = (import.meta.env.VITE_MAPTILER_KEY as string | undefined)?.trim() ?? "";
const localityTypes = "municipality,locality,place,region,subregion,county";

async function geocode(query: string, types: string, excludeTypes: boolean, signal?: AbortSignal) {
  if (!mapTilerKey) throw new Error("Map search is not configured.");
  const url = new URL(`https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json`);
  url.searchParams.set("key", mapTilerKey);
  url.searchParams.set("limit", "6");
  url.searchParams.set("country", "et,dj,so");
  url.searchParams.set("autocomplete", "true");
  url.searchParams.set(excludeTypes ? "excludeTypes" : "types", types);
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("Place search is temporarily unavailable.");
  return ((await response.json()) as { features?: GeocodeFeature[] }).features ?? [];
}

export async function searchPartnerRoutePlaces(query: string, signal?: AbortSignal): Promise<PartnerRoutePlace[]> {
  const clean = query.trim();
  if (clean.length < 2) return [];
  const [localities, general] = await Promise.all([
    geocode(clean, localityTypes, false, signal),
    geocode(clean, "continental_marine,country,major_landform", true, signal),
  ]);
  const unique = new Map<string, PartnerRoutePlace>();
  for (const feature of selectGeocodeCandidates(clean, localities, general)) {
    const center = feature.center;
    const label = (feature.place_name ?? feature.text ?? "").trim();
    if (label && center?.length === 2 && center.every(Number.isFinite)) unique.set(label, { label, coordinates: [center[0], center[1]] });
  }
  return [...unique.values()];
}
