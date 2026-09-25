export type DriverMapPoint = [number, number];

export type DriverMapViewport = {
  width: number;
  height: number;
};

export type DriverMarkerLike = {
  setLngLat(position: DriverMapPoint): DriverMarkerLike;
};

export type DriverMapCameraLike = {
  easeTo(options: { center: DriverMapPoint; duration?: number }): unknown;
};

export type DriverRouteFeature = {
  type: "Feature";
  properties: Record<string, never>;
  geometry: {
    type: "LineString";
    coordinates: DriverMapPoint[];
  };
};

export function isVisibleDriverMapViewport(viewport: DriverMapViewport) {
  return Number.isFinite(viewport.width)
    && Number.isFinite(viewport.height)
    && viewport.width > 0
    && viewport.height > 0;
}

export function buildDriverRouteFeature(coordinates: DriverMapPoint[]): DriverRouteFeature {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates,
    },
  };
}

export function updateDriverMarkerAndFollow(
  marker: DriverMarkerLike,
  map: DriverMapCameraLike,
  position: DriverMapPoint,
) {
  marker.setLngLat(position);
  map.easeTo({ center: position, duration: 650 });
}
