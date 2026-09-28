export type DriverMapPoint = [number, number];

export type DriverMapViewport = {
  width: number;
  height: number;
};

export type DriverMapViewportPadding = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type DriverTripOverlayState = {
  dispatchExpanded: boolean;
  sheetExpanded: boolean;
};

export type DriverMarkerLike = {
  setLngLat(position: DriverMapPoint): DriverMarkerLike;
};

export type DriverMapCameraLike = {
  easeTo(options: { center: DriverMapPoint; duration?: number }): unknown;
};

export type DriverStyleReadyMapLike = {
  isStyleLoaded(): boolean | void;
  once(event: "load", listener: () => void): unknown;
  off(event: "load", listener: () => void): unknown;
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

export function resolveDriverMapViewportPadding({
  dispatchExpanded,
  sheetExpanded,
}: DriverTripOverlayState): DriverMapViewportPadding {
  return {
    top: dispatchExpanded ? 174 : 112,
    bottom: sheetExpanded ? 430 : 210,
    left: 32,
    right: 32,
  };
}

export function resolveDriverTripSheetGesture(
  startY: number,
  endY: number,
  expanded: boolean,
) {
  const delta = endY - startY;
  if (delta <= -32) return true;
  if (delta >= 32) return false;
  return expanded;
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

export function runWhenDriverMapStyleReady(
  map: DriverStyleReadyMapLike,
  render: () => void,
) {
  let cancelled = false;
  const run = () => {
    if (!cancelled && map.isStyleLoaded()) render();
  };

  if (Boolean(map.isStyleLoaded())) run();
  else map.once("load", run);

  return () => {
    cancelled = true;
    map.off("load", run);
  };
}
