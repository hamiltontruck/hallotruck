export type GeocodeContext = { id?: string; text?: string; place_name?: string };
export type GeocodeFeature = { id?: string; place_name?: string; text?: string; center?: [number, number]; place_type?: string[]; context?: GeocodeContext[] };
export declare function selectGeocodeCandidates(query: string, localityFeatures: GeocodeFeature[], generalFeatures: GeocodeFeature[]): GeocodeFeature[];
export declare function featureToPlaceForSelection(feature: GeocodeFeature): { label: string; coordinates: [number, number] } | null;
export declare function isCoordinate(value: unknown): value is [number, number];
export declare function isRouteCoordinates(value: unknown): value is [number, number][];
