import { useCallback, useEffect, useState } from "react";
import { CustomerTrackingMap } from "./CustomerTrackingMap";
import { loadCustomerTrackingData, subscribeCustomerTracking, type CustomerLiveTrip } from "./customer-tracking.service";
import "./customer-tracking-v4.css";

type PreviewState =
  | { kind: "loading" }
  | { kind: "ready"; trip: CustomerLiveTrip }
  | { kind: "error"; message: string };

export function CustomerOrderLiveTrackingPreview({ userId, orderId, totalDistanceKm }: { userId: string; orderId: string; totalDistanceKm?: number | null }) {
  const [state, setState] = useState<PreviewState>({ kind: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async (showLoading = false) => {
    if (showLoading) setState({ kind: "loading" });
    else setRefreshing(true);
    try {
      const data = await loadCustomerTrackingData(userId, orderId);
      const trip = data.liveTrips.find((item) => item.order_id === orderId);
      if (!trip) throw new Error("Live trip data is not available for this order yet.");
      setState({ kind: "ready", trip });
    } catch (caught) {
      setState({ kind: "error", message: caught instanceof Error ? caught.message : "Live tracking could not be loaded." });
    } finally {
      setRefreshing(false);
    }
  }, [orderId, userId]);

  useEffect(() => {
    void reload(true);
    let active = true;
    let cleanup: (() => void) | undefined;
    void subscribeCustomerTracking(userId, orderId, () => { if (active) void reload(false); })
      .then((unsubscribe) => { if (active) cleanup = unsubscribe; else unsubscribe(); })
      .catch(() => { /* Manual refresh remains available. */ });
    return () => { active = false; cleanup?.(); };
  }, [orderId, reload, userId]);

  if (state.kind === "loading") return <section className="customer-order-live-preview"><p>Loading live trip tracking…</p></section>;
  if (state.kind === "error") return <section className="customer-order-live-preview"><p role="alert">{state.message}</p><button type="button" onClick={() => void reload(true)}>Retry live tracking</button></section>;

  return (
    <section className="customer-order-live-preview" aria-label="Live trip tracking preview">
      <div className="customer-order-live-preview__header"><strong>LIVE TRIP TRACKING</strong><button type="button" disabled={refreshing} onClick={() => void reload(false)}>{refreshing ? "Refreshing…" : "Refresh"}</button></div>
      <CustomerTrackingMap trip={state.trip} totalDistanceKm={totalDistanceKm} compact/>
    </section>
  );
}
