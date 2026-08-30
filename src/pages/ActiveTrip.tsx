import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getMyActiveOrders,
  getMyAssignedOrder,
  getMyLatestCancelledOrder,
  MyOrder,
} from "../services/driver.service";
import { formatEtb } from "../utils/currency";
import { Button } from "../components/ui/Button";
import { CargoPlate } from "../components/ui/CargoPlate";
import { DriverDeliveryProofForm } from "../components/driver/DriverDeliveryProofForm";
import { DriverCustomerContact } from "../components/driver/DriverCustomerContact";
import { DriverPaymentConfirmation } from "../components/driver/DriverPaymentConfirmation";
import { DriverOrderCancellationNotice } from "../components/driver/DriverOrderCancellationNotice";
import { DriverActiveTripGpsControl } from "../components/driver/DriverActiveTripGpsControl";
import { DriverActiveTripRoute } from "../components/driver/DriverActiveTripRoute";
import { useLanguage } from "../i18n/LanguageProvider";
import { getDriverTripDocumentsCopy } from "../i18n/driverTripDocumentsCopy";

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
  const [driverPosition, setDriverPosition] = useState<[number, number] | null>(null);

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

      <DriverActiveTripGpsControl
        order={order}
        onOrderChange={setOrder}
        onPosition={setDriverPosition}
        onSharingChange={setGpsSharing}
      />

      <DriverActiveTripRoute
        orderId={order.id}
        driverPosition={driverPosition}
        gpsSharing={gpsSharing}
      />

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
