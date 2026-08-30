import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getMyActiveOrders,
  getMyAssignedOrder,
  getMyLatestCancelledOrder,
  type MyOrder,
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
import { DriverActiveTripRoute } from "../components/driver/DriverActiveTripRoute";
import { DriverActiveTripOrderBoundary } from "../components/driver/DriverActiveTripOrderBoundary";
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

interface ActiveTripContentProps {
  order: MyOrder;
  onOrderChange: (order: MyOrder) => void;
}

function ActiveTripContent({ order, onOrderChange }: ActiveTripContentProps) {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const c = getDriverTripDocumentsCopy(language).trip;
  const finance = tripFinanceCopy[language];
  const [gpsSharing, setGpsSharing] = useState(false);
  const [driverPosition, setDriverPosition] = useState<[number, number] | null>(null);
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

      <DriverActiveTripGpsControl
        order={order}
        onOrderChange={onOrderChange}
        onPosition={setDriverPosition}
        onSharingChange={setGpsSharing}
      />

      <DriverActiveTripRoute
        orderId={order.id}
        driverPosition={driverPosition}
        gpsSharing={gpsSharing}
        renderMap={(route, position) => (
          <TripMap routeGeometry={route.geometry} driverPosition={position} />
        )}
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

export function ActiveTrip() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const c = getDriverTripDocumentsCopy(language).trip;
  const isCancellationDismissed = useCallback((order: MyOrder) => (
    window.localStorage.getItem(`hallotruck-dismissed-cancellation-${order.id}`) === "1"
  ), []);

  return (
    <DriverActiveTripOrderBoundary
      loadActiveOrders={getMyActiveOrders}
      loadLatestCancellation={getMyLatestCancelledOrder}
      loadAssignedOrder={getMyAssignedOrder}
      isCancellationDismissed={isCancellationDismissed}
      renderCancelled={(cancelledOrder) => (
        <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-16">
          <DriverOrderCancellationNotice order={cancelledOrder} onBrowseJobs={() => {
            window.localStorage.setItem(`hallotruck-dismissed-cancellation-${cancelledOrder.id}`, "1");
            navigate("/driver/jobs");
          }} />
        </div>
      )}
      renderEmpty={() => (
        <div className="text-center">
          <p className="mb-4 font-body text-steel">{c.noTrip}</p>
          <Button onClick={() => navigate("/driver/jobs")}>{c.browseJobs}</Button>
        </div>
      )}
    >
      {({ order, onOrderChange }) => (
        <ActiveTripContent key={order.id} order={order} onOrderChange={onOrderChange} />
      )}
    </DriverActiveTripOrderBoundary>
  );
}
