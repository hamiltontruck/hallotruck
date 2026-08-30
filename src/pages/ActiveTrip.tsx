import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getMyActiveOrders,
  getMyAssignedOrder,
  getMyLatestCancelledOrder,
  getNavigation,
  MyOrder,
  NavigationRoute,
} from "../services/driver.service";
import { formatEtb } from "../utils/currency";
import { Button } from "../components/ui/Button";
import { CargoPlate } from "../components/ui/CargoPlate";
import { TripMap } from "../components/navigation/TripMap";
import { DriverDeliveryProofForm } from "../components/driver/DriverDeliveryProofForm";
import { DriverCustomerContact } from "../components/driver/DriverCustomerContact";
import { DriverPaymentConfirmation } from "../components/driver/DriverPaymentConfirmation";
import { DriverOrderCancellationNotice } from "../components/driver/DriverOrderCancellationNotice";
import { DriverActiveTripGpsControl } from "../components/driver/DriverActiveTripGpsControl";
import { useLanguage } from "../i18n/LanguageProvider";
import { getDriverTripDocumentsCopy } from "../i18n/driverTripDocumentsCopy";

const AUTO_ADVANCE_METERS = 45;

const tripFinanceCopy = {
  en: {
    grossFare: "Gross trip fare",
    commission: "HALLO Smart commission (2%)",
    expectedNet: "Expected driver net (98%)",
    netHelp: "This is the amount expected after the customer payment is released.",
  },
  om: {
    grossFare: "Gatii trip guutuu",
    commission: "Komishinii HALLO Smart (2%)",
    expectedNet: "Galii driver eegamu (98%)",
    netHelp: "Kaffaltiin customer erga release taʼe booda galiin eegamu kana.",
  },
  am: {
    grossFare: "ጠቅላላ የጉዞ ዋጋ",
    commission: "የHALLO Smart ኮሚሽን (2%)",
    expectedNet: "የሚጠበቀው የአሽከርካሪ ገቢ (98%)",
    netHelp: "የደንበኛው ክፍያ ከተለቀቀ በኋላ የሚጠበቀው መጠን ይህ ነው።",
  },
} as const;

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

export function ActiveTrip() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const c = getDriverTripDocumentsCopy(language).trip;
  const finance = tripFinanceCopy[language];
  const [order, setOrder] = useState<MyOrder | null>(null);
  const [cancelledOrder, setCancelledOrder] = useState<MyOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [gpsSharing, setGpsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<NavigationRoute | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [driverPosition, setDriverPosition] = useState<[number, number] | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  useEffect(() => {
    Promise.all([getMyActiveOrders(), getMyLatestCancelledOrder()])
      .then(([orders, latestCancellation]) => {
        const activeOrder = orders[0] ?? null;
        setOrder(activeOrder);
        if (!activeOrder && latestCancellation) {
          const dismissed = window.localStorage.getItem(`hallotruck-dismissed-cancellation-${latestCancellation.id}`) === "1";
          setCancelledOrder(dismissed ? null : latestCancellation);
        }
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : c.noTrip))
      .finally(() => setLoading(false));
  }, [c.noTrip]);

  useEffect(() => {
    if (!order) return;
    let disposed = false;
    const activeOrderId = order.id;
    const activeOrderStatus = order.status;

    async function refreshOrderStatus() {
      try {
        const current = await getMyAssignedOrder(activeOrderId);
        if (disposed || !current) return;
        if (current.status === "cancelled") {
          setCancelledOrder(current);
          setOrder(null);
          setError(null);
          return;
        }
        if (current.status !== activeOrderStatus) setOrder(current);
      } catch (refreshError) {
        if (!disposed) setError(refreshError instanceof Error ? refreshError.message : c.noTrip);
      }
    }

    void refreshOrderStatus();
    const interval = window.setInterval(() => void refreshOrderStatus(), 5000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [order?.id, order?.status, c.noTrip]);

  useEffect(() => {
    if (!order) return;
    setCurrentStepIndex(0);
    setRouteError(null);
    getNavigation(order.id)
      .then(setRoute)
      .catch((navigationError) => setRouteError(navigationError instanceof Error ? navigationError.message : c.routeLoadError));
  }, [order?.id, c.routeLoadError]);

  useEffect(() => {
    if (!route || !driverPosition || route.steps.length < 2) return;
    const nextStepIndex = Math.min(currentStepIndex + 1, route.steps.length - 1);
    if (nextStepIndex === currentStepIndex) return;
    const nextManeuver = route.steps[nextStepIndex]?.location;
    if (!nextManeuver) return;
    if (distanceMeters(driverPosition, nextManeuver) <= AUTO_ADVANCE_METERS) setCurrentStepIndex(nextStepIndex);
  }, [route, driverPosition, currentStepIndex]);

  if (loading) return <div className="mx-auto max-w-2xl px-6 py-16 font-body text-steel">{c.loading}</div>;

  if (cancelledOrder) {
    return <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-16"><DriverOrderCancellationNotice order={cancelledOrder} onBrowseJobs={() => {
      window.localStorage.setItem(`hallotruck-dismissed-cancellation-${cancelledOrder.id}`, "1");
      navigate("/driver/jobs");
    }} /></div>;
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        {error && <p role="alert" className="mb-4 border border-route/40 bg-route/5 px-4 py-3 text-sm text-route">{error}</p>}
        <p className="mb-4 font-body text-steel">{c.noTrip}</p>
        <Button onClick={() => navigate("/driver/jobs")}>{c.browseJobs}</Button>
      </div>
    );
  }

  const tripStarted = order.status === "in_transit";
  const statusLabel = order.status === "accepted" ? c.assigned : tripStarted ? c.onRoad : order.status;
  const grossFare = Number(order.price_etb ?? 0);
  const platformCommission = Math.round(grossFare * 0.02 * 100) / 100;
  const driverNet = Math.max(0, Math.round((grossFare - platformCommission) * 100) / 100);

  return (
    <div className="mx-auto max-w-2xl px-4 pb-32 pt-8 sm:px-6 sm:py-16">
      <div className="mb-8 flex items-center justify-between gap-3">
        <CargoPlate size="lg">{order.tracking_id}</CargoPlate>
        <span className="break-words text-right font-display font-semibold text-asphalt">{statusLabel}</span>
      </div>

      <div className="mb-6 border border-line bg-white p-5 font-body text-sm sm:p-6">
        <div className="space-y-3">
          <div><span className="text-steel">{c.pickup}</span><div className="break-words text-asphalt">{order.pickup_address}</div></div>
          <div><span className="text-steel">{c.dropoff}</span><div className="break-words text-asphalt">{order.dropoff_address}</div></div>
        </div>

        <div className="mt-5 grid gap-2 border-t border-line pt-5">
          <div className="flex items-center justify-between gap-4">
            <span className="text-steel">{finance.grossFare}</span>
            <strong className="font-display text-asphalt">{formatEtb(grossFare)}</strong>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-steel">{finance.commission}</span>
            <strong className="font-display text-route">− {formatEtb(platformCommission)}</strong>
          </div>
          <div className="mt-1 flex items-center justify-between gap-4 bg-emerald-50 px-4 py-4">
            <span className="font-semibold text-emerald-900">{finance.expectedNet}</span>
            <CargoPlate>{formatEtb(driverNet)}</CargoPlate>
          </div>
          <p className="text-[11px] leading-5 text-steel">{finance.netHelp}</p>
        </div>
      </div>

      <DriverCustomerContact orderId={order.id} />
      <DriverPaymentConfirmation orderId={order.id} />

      {error && <p role="alert" className="mb-6 border border-route/40 bg-route/5 px-4 py-3 font-body text-sm text-route">{error}</p>}
      {routeError && <p role="alert" className="mb-6 border border-line px-4 py-3 font-body text-xs text-steel">{c.directionsUnavailable}: {routeError}</p>}

      <DriverActiveTripGpsControl
        order={order}
        onOrderChange={setOrder}
        onPosition={setDriverPosition}
        onSharingChange={setGpsSharing}
      />

      {route && (
        <div className="mb-6 overflow-hidden border border-line bg-white">
          <div className="h-56"><TripMap routeGeometry={route.geometry} driverPosition={driverPosition} /></div>
          <div className="flex items-center justify-between gap-4 p-5">
            <div className="min-w-0">
              <span className="mb-1 block font-mono text-xs uppercase text-steel">
                {route.steps.length ? `${c.step} ${currentStepIndex + 1} ${c.of} ${route.steps.length}` : c.routeOverview}
              </span>
              <p className="break-words font-display font-semibold text-asphalt">{route.steps[currentStepIndex]?.instruction ?? c.arrived}</p>
              {route.steps[currentStepIndex] && <span className="font-mono text-xs text-steel">{Math.round(route.steps[currentStepIndex].distanceM)} m</span>}
              {gpsSharing && route.steps.length > 1 && <span className="mt-2 block font-mono text-[10px] uppercase text-steel">{c.autoAdvance}</span>}
            </div>
            <button
              type="button"
              onClick={() => setCurrentStepIndex((index) => Math.min(index + 1, route.steps.length - 1))}
              disabled={route.steps.length <= 1 || currentStepIndex >= route.steps.length - 1}
              className="shrink-0 font-body text-sm text-route underline disabled:text-steel disabled:no-underline"
            >{c.skipStep}</button>
          </div>
        </div>
      )}

      {tripStarted ? (
        <DriverDeliveryProofForm orderId={order.id} tripAmountEtb={grossFare} onDelivered={() => {
          navigate("/driver/earnings");
        }} />
      ) : (
        <div className="border border-line bg-white px-5 py-4 text-center">
          <p className="font-display font-semibold text-asphalt">{c.deliveryLocked}</p>
          <p className="mt-1 font-body text-xs text-steel">{c.deliveryLockedHelp}</p>
        </div>
      )}
    </div>
  );
}
