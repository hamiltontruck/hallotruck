const ROUTABLE_LOCALITY_TYPES = new Set(["municipality", "locality", "place", "region", "subregion", "county"]);
const EXACT_LOCALITY_TYPES = new Set(["municipality", "locality", "place"]);
const DJIBOUTI_CITY_FEATURE_ID = "region.1713";

function normalize(value) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
function isDjiboutiCityIdentity(feature) {
  if (feature.id !== DJIBOUTI_CITY_FEATURE_ID) return false;
  if (!(feature.place_type ?? []).some((type) => ROUTABLE_LOCALITY_TYPES.has(type))) return false;
  const label = normalize(feature.place_name ?? feature.text ?? "");
  const context = (feature.context ?? []).map((item) => normalize(item.place_name ?? item.text ?? ""));
  return label === "djibouti djibouti" || context.some((item) => item === "djibouti" || item.endsWith(" djibouti"));
}
function isExactCityLocalityIdentity(query, feature) {
  const normalizedQuery = normalize(query);
  const normalizedText = normalize(feature.text ?? "");
  const normalizedPrimaryLabel = normalize((feature.place_name ?? "").split(",", 1)[0] ?? "");
  const hasExactLocalityType = (feature.place_type ?? []).some((type) => EXACT_LOCALITY_TYPES.has(type));
  return hasExactLocalityType && (normalizedText === normalizedQuery || normalizedPrimaryLabel === normalizedQuery);
}
export function selectGeocodeCandidates(query, localityFeatures, generalFeatures) {
  const exactCityLocalities = localityFeatures.filter((feature) => isExactCityLocalityIdentity(query, feature));
  if (exactCityLocalities.length > 0) return exactCityLocalities;
  if (normalize(query) === "djibouti") {
    const exactDjiboutiCity = localityFeatures.find(isDjiboutiCityIdentity);
    if (exactDjiboutiCity) return [exactDjiboutiCity];
  }
  return [...localityFeatures, ...generalFeatures];
}
export function featureToPlaceForSelection(feature) {
  if (!Array.isArray(feature.center) || feature.center.length !== 2 || feature.center.some((part) => !Number.isFinite(Number(part)))) return null;
  const label = (feature.place_name ?? feature.text ?? "").trim();
  if (!label) return null;
  return { label, coordinates: [Number(feature.center[0]), Number(feature.center[1])] };
}
export function isCoordinate(value) {
  return Array.isArray(value) && value.length === 2 && value.every((part) => Number.isFinite(Number(part)));
}
export function isRouteCoordinates(value) {
  return Array.isArray(value) && value.length >= 2 && value.every(isCoordinate);
}
