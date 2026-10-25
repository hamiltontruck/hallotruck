import { selectGeocodeCandidates, type GeocodeFeature } from "../../shared/geocoder-routing.js";

export type PartnerRoutePlace = {
  label: string;
  coordinates: [number, number];
  location?: { country: string; region: string; city: string; address: string };
};

function selectedLocation(feature: GeocodeFeature, label: string) {
  const text = feature.text?.trim() ?? "";
  const kinds = feature.place_type ?? [];
  const context = (kind: string) => feature.context?.find(item => item.id?.startsWith(`${kind}.`))?.text?.trim() ?? "";
  return {
    country: context("country") || (kinds.includes("country") ? text : ""),
    region: context("region") || (kinds.includes("region") ? text : ""),
    city: context("municipality") || context("place") || context("locality")
      || (kinds.some(kind => ["municipality", "place", "locality"].includes(kind)) || feature.id === "region.1713" ? text : ""),
    address: label,
  };
}
const mapTilerKey = (import.meta.env.VITE_MAPTILER_KEY as string | undefined)?.trim() ?? "";
const localityTypes = "municipality,locality,place,region,subregion,county";

async function geocode(query: string, types: string, excludeTypes: boolean, signal?: AbortSignal) {
  if (!mapTilerKey) throw new Error("Map search is not configured.");
  const url = new URL(`https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json`);
  url.searchParams.set("key", mapTilerKey);
  url.searchParams.set("limit", "6");
  url.searchParams.set("country", "et,dj,so");
  url.searchParams.set("autocomplete", "true");
  url.searchParams.set("types", types);
  if (excludeTypes) url.searchParams.set("excludeTypes", "true");
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
  // Keep cities first while allowing a more precise neighborhood or landmark choice.
  const precise = general.filter(feature => feature.place_type?.some(kind => ["address", "street", "poi", "neighbourhood", "neighborhood"].includes(kind)));
  for (const feature of [...selectGeocodeCandidates(clean, localities, general), ...precise]) {
    const center = feature.center;
    const label = (feature.place_name ?? feature.text ?? "").trim();
    if (!label || center?.length !== 2 || !center.every(Number.isFinite)
      || Math.abs(center[0]) > 180 || Math.abs(center[1]) > 90) continue;
    const id = `${label}:${center.join(",")}`;
    if (!unique.has(id)) unique.set(id, { label, coordinates: [center[0], center[1]], location: selectedLocation(feature, label) });
  }
  return [...unique.values()];
}
