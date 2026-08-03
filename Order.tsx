import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { createOrder, initiatePayment } from "../services/order.service";
import { queuePendingOrder } from "../services/offline.service";
import { formatEtb, formatKm } from "../utils/currency";
import { Button } from "../components/ui/Button";
import { CargoPlate } from "../components/ui/CargoPlate";

interface OrderDraft {
  pickup: [number, number];
  pickupAddress: string;
  dropoff: [number, number];
  dropoffAddress: string;
  vehicleType: string;
  distanceKm: number;
  priceEtb: number;
}

export function Order() {
  const location = useLocation();
  const navigate = useNavigate();
  const draft = location.state as OrderDraft | undefined;

  const [cargoDescription, setCargoDescription] = useState("");
  const [provider, setProvider] = useState<"telebirr" | "mpesa">("telebirr");
  const [step, setStep] = useState<"details" | "paying">("details");
  const [error, setError] = useState<string | null>(null);

  if (!draft) {
    return (
      <div className="max-w-xl mx-auto px-6 py-24 text-center">
        <p className="font-body text-steel">
          No quote to book yet.{" "}
          <button onClick={() => navigate("/quote")} className="text-route underline">
            Start with a quote
          </button>
          .
        </p>
      </div>
    );
  }

  async function handleConfirm() {
    setStep("paying");
    setError(null);
    const orderParams = { ...draft, cargoDescription };

    if (!navigator.onLine) {
      queuePendingOrder(orderParams, provider);
      navigate("/tracking", {
        state: { queuedOffline: true },
      });
      return;
    }

    try {
      const order = await createOrder(orderParams);
      const checkout = await initiatePayment(order.id, provider);
      if (checkout.redirectUrl) {
        window.location.href = checkout.redirectUrl;
      } else {
        navigate("/tracking", { state: { trackingId: order.tracking_id, ussdCode: checkout.ussdCode } });
      }
    } catch (err) {
      // Network failure mid-request (e.g. connection dropped after the
      // online check above) — fall back to the offline queue rather than
      // losing the booking.
      if (err instanceof TypeError) {
        queuePendingOrder(orderParams, provider);
        navigate("/tracking", { state: { queuedOffline: true } });
        return;
      }
      setError(err instanceof Error ? err.message : "Couldn't place the order.");
      setStep("details");
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <h1 className="font-display font-bold text-3xl text-asphalt mb-8">Confirm your shipment</h1>

      <div className="border border-line bg-white p-6 mb-6 space-y-4 font-body text-sm">
        <div className="flex justify-between">
          <span className="text-steel">Pickup</span>
          <span className="text-asphalt text-right">{draft.pickupAddress}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-steel">Drop-off</span>
          <span className="text-asphalt text-right">{draft.dropoffAddress}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-steel">Distance</span>
          <span className="font-mono text-asphalt">{formatKm(draft.distanceKm)}</span>
        </div>
        <div className="flex justify-between items-center pt-2 border-t border-line">
          <span className="text-steel">Total</span>
          <CargoPlate>{formatEtb(draft.priceEtb)}</CargoPlate>
        </div>
      </div>

      <label className="block font-mono text-xs text-steel uppercase mb-2">
        Cargo description (optional)
      </label>
      <textarea
        value={cargoDescription}
        onChange={(e) => setCargoDescription(e.target.value)}
        placeholder="e.g. 40 sacks of teff, 50kg each"
        rows={3}
        className="w-full border border-line bg-white px-4 py-3 font-body mb-6 focus:outline-none focus:border-route"
      />

      <label className="block font-mono text-xs text-steel uppercase mb-3">Pay with</label>
      <div className="grid grid-cols-2 gap-3 mb-8">
        {(["telebirr", "mpesa"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setProvider(p)}
            className={`border px-4 py-4 font-display font-semibold capitalize transition-colors ${
              provider === p ? "border-route bg-route/5 text-asphalt" : "border-line text-steel"
            }`}
          >
            {p === "mpesa" ? "M-PESA" : "Telebirr"}
          </button>
        ))}
      </div>

      <p className="font-body text-xs text-steel mb-6 leading-relaxed">
        Your payment is held securely in escrow and only released to the driver once delivery is
        confirmed.
      </p>

      {error && (
        <p className="font-body text-sm text-route border border-route/40 bg-route/5 px-4 py-3 mb-6">
          {error}
        </p>
      )}

      <Button onClick={handleConfirm} disabled={step === "paying"} className="w-full">
        {step === "paying" ? "Processing…" : `Pay ${formatEtb(draft.priceEtb)} & confirm`}
      </Button>
    </div>
  );
}
