import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  getOrderByTrackingId,
  getLatestPosition,
  submitRating,
  getRatingForOrder,
  TrackedOrder,
} from "../services/order.service";
import { formatEtb, formatKm } from "../utils/currency";
import { CargoPlate } from "../components/ui/CargoPlate";
import { Button } from "../components/ui/Button";
import { StarRating } from "../components/ui/StarRating";
import { LiveMap } from "../components/tracking/LiveMap";

const STATUS_STEPS = ["placed", "accepted", "in_transit", "delivered"] as const;

const STATUS_LABEL: Record<string, string> = {
  quoted: "Quoted",
  placed: "Booked",
  accepted: "Driver assigned",
  in_transit: "On the road",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export function Tracking() {
  const navState = useLocation().state as { trackingId?: string; queuedOffline?: boolean } | null;
  const [trackingId, setTrackingId] = useState(navState?.trackingId ?? "");
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [truckPosition, setTruckPosition] = useState<[number, number] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [existingRating, setExistingRating] = useState<{ score: number; comment: string | null } | null>(
    null,
  );
  const [ratingScore, setRatingScore] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);

  async function lookup(id: string) {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getOrderByTrackingId(id);
      setOrder(result);
      if (result.status === "delivered" && result.id) {
        const rating = await getRatingForOrder(result.id);
        setExistingRating(rating);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Shipment not found.");
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (navState?.trackingId) lookup(navState.trackingId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll live position every 8s while in transit
  useEffect(() => {
    if (!order || order.status !== "in_transit" || !order.id) return;
    const orderId = order.id;
    async function poll() {
      try {
        const ping = await getLatestPosition(orderId);
        if (ping) setTruckPosition(ping.location.coordinates);
      } catch {
        // silently retry on next tick — a missed ping isn't worth an error banner
      }
    }
    poll();
    const interval = setInterval(poll, 8000);
    return () => clearInterval(interval);
  }, [order]);

  async function handleSubmitRating() {
    if (!order?.id || ratingScore === 0) return;
    setSubmittingRating(true);
    setError(null);
    try {
      await submitRating(order.id, ratingScore, ratingComment || undefined);
      setExistingRating({ score: ratingScore, comment: ratingComment || null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit rating.");
    } finally {
      setSubmittingRating(false);
    }
  }

  const currentStepIndex = order ? STATUS_STEPS.indexOf(order.status as typeof STATUS_STEPS[number]) : -1;

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="font-display font-bold text-3xl text-asphalt mb-8">Track your shipment</h1>

      {navState?.queuedOffline && (
        <div className="border border-amber bg-amber/10 px-4 py-3 mb-6 font-body text-sm text-asphalt">
          You were offline, so your booking is saved on this device and will be sent the moment
          you're back online. If payment can't complete automatically, you'll be asked to confirm
          it here once the booking syncs.
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          lookup(trackingId);
        }}
        className="flex gap-3 mb-10"
      >
        <input
          value={trackingId}
          onChange={(e) => setTrackingId(e.target.value.toUpperCase())}
          placeholder="HT-20260725-0042"
          className="flex-1 border border-line bg-white px-4 py-3 font-mono focus:outline-none focus:border-route"
        />
        <Button type="submit" disabled={loading}>
          {loading ? "Searching…" : "Track"}
        </Button>
      </form>

      {error && (
        <p className="font-body text-sm text-route border border-route/40 bg-route/5 px-4 py-3 mb-6">
          {error}
        </p>
      )}

      {order && (
        <div className="border border-line bg-white">
          <div className="p-6 border-b border-line flex items-center justify-between flex-wrap gap-4">
            <CargoPlate size="lg">{order.tracking_id}</CargoPlate>
            <span className="font-display font-semibold text-asphalt">
              {STATUS_LABEL[order.status] ?? order.status}
            </span>
          </div>

          {/* Status stepper — reuses the route-line motif from the hero */}
          {order.status !== "cancelled" && (
            <div className="px-6 pt-6">
              <div className="flex items-center">
                {STATUS_STEPS.map((step, i) => (
                  <div key={step} className="flex items-center flex-1 last:flex-none">
                    <div
                      className={`w-3 h-3 rounded-full shrink-0 ${
                        i <= currentStepIndex ? "bg-route" : "bg-line"
                      }`}
                    />
                    {i < STATUS_STEPS.length - 1 && (
                      <div
                        className={`flex-1 h-0.5 mx-1 ${
                          i < currentStepIndex ? "bg-route" : "bg-line"
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-between font-mono text-[10px] text-steel mt-1 uppercase">
                {STATUS_STEPS.map((s) => (
                  <span key={s}>{s.replace("_", " ")}</span>
                ))}
              </div>
            </div>
          )}

          <div className="h-80 mt-6 border-y border-line">
            <LiveMap
              pickup={[38.7469, 9.0192]} // placeholder until GET /orders returns raw coords
              dropoff={[39.2705, 8.5432]}
              truckPosition={truckPosition}
            />
          </div>

          <div className="p-6 grid grid-cols-2 gap-4 font-body text-sm">
            <div>
              <span className="text-steel block">From</span>
              <span className="text-asphalt">{order.pickup_address}</span>
            </div>
            <div>
              <span className="text-steel block">To</span>
              <span className="text-asphalt">{order.dropoff_address}</span>
            </div>
            <div>
              <span className="text-steel block">Distance</span>
              <span className="font-mono text-asphalt">{formatKm(order.distance_km)}</span>
            </div>
            <div>
              <span className="text-steel block">Payment</span>
              <span className="text-asphalt capitalize">{order.payment_status.replace("_", " ")}</span>
            </div>
          </div>

          <div className="px-6 pb-6 flex justify-between items-center">
            <span className="font-body text-sm text-steel">Total</span>
            <CargoPlate>{formatEtb(order.price_etb)}</CargoPlate>
          </div>

          {order.status === "delivered" && order.id && (
            <div className="px-6 pb-6 border-t border-line pt-6">
              {existingRating ? (
                <div>
                  <span className="font-mono text-xs uppercase text-steel block mb-2">
                    Your rating
                  </span>
                  <StarRating value={existingRating.score} onChange={() => {}} readOnly />
                  {existingRating.comment && (
                    <p className="font-body text-sm text-steel mt-2">{existingRating.comment}</p>
                  )}
                </div>
              ) : (
                <div>
                  <span className="font-mono text-xs uppercase text-steel block mb-3">
                    Rate this delivery
                  </span>
                  <StarRating value={ratingScore} onChange={setRatingScore} />
                  <textarea
                    value={ratingComment}
                    onChange={(e) => setRatingComment(e.target.value)}
                    placeholder="Optional comment for the driver"
                    rows={2}
                    className="w-full border border-line px-4 py-3 font-body mt-3 focus:outline-none focus:border-route"
                  />
                  <Button
                    onClick={handleSubmitRating}
                    disabled={ratingScore === 0 || submittingRating}
                    className="mt-3"
                  >
                    {submittingRating ? "Submitting…" : "Submit rating"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
