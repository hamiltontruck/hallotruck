import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  getNavigation,
  type NavigationRoute,
} from "../../services/driver.service";
import { useLanguage, type HalloLanguage } from "../../i18n/LanguageProvider";
import { getDriverTripDocumentsCopy } from "../../i18n/driverTripDocumentsCopy";

const AUTO_ADVANCE_METERS = 45;

const routeActionCopy: Record<HalloLanguage, {
  loading: string;
  retry: string;
  retrying: string;
}> = {
  en: {
    loading: "Loading turn-by-turn directions…",
    retry: "Retry directions",
    retrying: "Retrying…",
  },
  om: {
    loading: "Qajeelfama daandii fe'aa jira…",
    retry: "Qajeelfama irra deebi'ii yaali",
    retrying: "Irra deebi'ee yaalaa jira…",
  },
  am: {
    loading: "የመንገድ መመሪያውን በመጫን ላይ…",
    retry: "መመሪያውን እንደገና ሞክር",
    retrying: "እንደገና በመሞከር ላይ…",
  },
};

type RouteServices = {
  getNavigation: typeof getNavigation;
};

const defaultServices: RouteServices = {
  getNavigation,
};

function distanceMeters(a: [number, number], b: [number, number]) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusM = 6_371_000;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusM * Math.asin(Math.sqrt(h));
}

export function DriverActiveTripRoute({
  orderId,
  driverPosition,
  gpsSharing,
  renderMap,
  services = defaultServices,
}: {
  orderId: string;
  driverPosition: [number, number] | null;
  gpsSharing: boolean;
  renderMap: (route: NavigationRoute, driverPosition: [number, number] | null) => ReactNode;
  services?: RouteServices;
}) {
  const { language } = useLanguage();
  const c = getDriverTripDocumentsCopy(language).trip;
  const actionCopy = routeActionCopy[language];
  const [route, setRoute] = useState<NavigationRoute | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeLoading, setRouteLoading] = useState(true);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const requestIdRef = useRef(0);
  const inFlightRequestIdRef = useRef<number | null>(null);

  const loadRoute = useCallback(async () => {
    if (inFlightRequestIdRef.current !== null) return;
    const requestId = ++requestIdRef.current;
    inFlightRequestIdRef.current = requestId;
    setRouteLoading(true);
    setRouteError(null);

    try {
      const nextRoute = await services.getNavigation(orderId);
      if (requestIdRef.current !== requestId) return;
      setRoute(nextRoute);
      setCurrentStepIndex(0);
    } catch (navigationError) {
      if (requestIdRef.current !== requestId) return;
      setRouteError(navigationError instanceof Error ? navigationError.message : c.routeLoadError);
    } finally {
      if (requestIdRef.current === requestId) setRouteLoading(false);
      if (inFlightRequestIdRef.current === requestId) inFlightRequestIdRef.current = null;
    }
  }, [c.routeLoadError, orderId, services]);

  useEffect(() => {
    setRoute(null);
    setRouteError(null);
    setCurrentStepIndex(0);
    inFlightRequestIdRef.current = null;
    void loadRoute();
    return () => {
      requestIdRef.current += 1;
      inFlightRequestIdRef.current = null;
    };
  }, [loadRoute]);

  useEffect(() => {
    if (!route || !driverPosition || route.steps.length < 2) return;
    const nextStepIndex = Math.min(currentStepIndex + 1, route.steps.length - 1);
    if (nextStepIndex === currentStepIndex) return;
    const nextManeuver = route.steps[nextStepIndex]?.location;
    if (!nextManeuver) return;
    if (distanceMeters(driverPosition, nextManeuver) <= AUTO_ADVANCE_METERS) {
      setCurrentStepIndex(nextStepIndex);
    }
  }, [route, driverPosition, currentStepIndex]);

  return (
    <section
      data-driver-route-control
      aria-busy={routeLoading}
      className="mb-6 min-w-0"
    >
      {routeLoading && !route && !routeError && (
        <p
          role="status"
          aria-live="polite"
          className="border border-line bg-white px-4 py-3 font-body text-xs text-steel"
        >
          {actionCopy.loading}
        </p>
      )}

      {routeError && (
        <div className="flex min-w-0 flex-col gap-3 border border-route/30 bg-route/5 px-4 py-4 min-[390px]:flex-row min-[390px]:items-center min-[390px]:justify-between">
          <p role="alert" className="min-w-0 break-words font-body text-xs leading-5 text-route">
            {c.directionsUnavailable}: {routeError}
          </p>
          <button
            type="button"
            data-route-retry-action
            onClick={() => void loadRoute()}
            disabled={routeLoading}
            className="inline-flex min-h-11 shrink-0 items-center justify-center border border-route/30 bg-white px-4 py-2 font-body text-xs font-semibold text-route disabled:cursor-not-allowed disabled:opacity-60"
          >
            {routeLoading ? actionCopy.retrying : actionCopy.retry}
          </button>
        </div>
      )}

      {route && (
        <div className="overflow-hidden border border-line bg-white">
          <div className="h-56">{renderMap(route, driverPosition)}</div>
          <div className="flex min-w-0 items-center justify-between gap-4 p-5">
            <div className="min-w-0">
              <span className="mb-1 block font-mono text-xs uppercase text-steel">
                {route.steps.length ? `${c.step} ${currentStepIndex + 1} ${c.of} ${route.steps.length}` : c.routeOverview}
              </span>
              <p className="break-words font-display font-semibold text-asphalt">
                {route.steps[currentStepIndex]?.instruction ?? c.arrived}
              </p>
              {route.steps[currentStepIndex] && (
                <span className="font-mono text-xs text-steel">
                  {Math.round(route.steps[currentStepIndex].distanceM)} m
                </span>
              )}
              {gpsSharing && route.steps.length > 1 && (
                <span className="mt-2 block font-mono text-[10px] uppercase text-steel">
                  {c.autoAdvance}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setCurrentStepIndex((index) => Math.min(index + 1, route.steps.length - 1))}
              disabled={route.steps.length <= 1 || currentStepIndex >= route.steps.length - 1}
              className="shrink-0 font-body text-sm text-route underline disabled:cursor-not-allowed disabled:text-steel disabled:no-underline"
            >
              {c.skipStep}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
