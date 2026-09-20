import { useCallback, useEffect, useState } from "react";
import { CustomerAssignmentCard } from "./CustomerAssignmentCard";
import { CustomerTrackingMap } from "./CustomerTrackingMap";
import { CustomerDriverChat } from "./CustomerDriverChat";
import { classifyTrackingFreshness } from "./tracking-freshness";
import { loadCustomerTrackingData, subscribeCustomerTracking, type CustomerLiveTrip, type CustomerTrackingData } from "./customer-tracking.service";

import "./customer-tracking-v4.css";

type TrackingState = { kind: "loading" } | { kind: "ready"; data: CustomerTrackingData } | { kind: "error"; message: string };

function labelStatus(value: string | null | undefined) {
  const clean = value?.trim().replaceAll("_", " ") || "pending";
  return clean.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function CustomerTrackingPage({ userId, initialOrderId, onHome, onOrders }: { userId: string; initialOrderId?: string | null; onHome: () => void; onOrders: () => void }) {
  const [state, setState] = useState<TrackingState>({ kind: "loading" });
  const [selectedOrderId, setSelectedOrderId] = useState(initialOrderId || "");
  const [refreshing, setRefreshing] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const reload = useCallback(async (showLoading = false) => {
    if (showLoading) setState({ kind: "loading" }); else setRefreshing(true);
    try {
      const preferred = initialOrderId || null;
      const data = await loadCustomerTrackingData(userId, preferred);
      setState({ kind: "ready", data });
      setSelectedOrderId((current) => current && data.orders.some((order) => order.id === current) ? current : data.orders[0]?.id ?? "");
    } catch (caught) {
      setState({ kind: "error", message: caught instanceof Error ? caught.message : "Tracking data could not be loaded." });
    } finally {
      setRefreshing(false);
    }
  }, [initialOrderId, userId]);

  useEffect(() => { void reload(true); }, [reload]);

  const selectedOrder = state.kind === "ready" ? state.data.orders.find((order) => order.id === selectedOrderId) ?? state.data.orders[0] : undefined;

  useEffect(() => {
    if (!selectedOrder?.id) return;
    let active = true;
    let cleanup: (() => void) | undefined;
    void subscribeCustomerTracking(userId, selectedOrder.id, () => { if (active) void reload(false); })
      .then((unsubscribe) => { if (active) cleanup = unsubscribe; else unsubscribe(); })
      .catch(() => { /* Manual refresh remains available if a Realtime channel is unavailable. */ });
    return () => { active = false; cleanup?.(); };
  }, [reload, selectedOrder?.id, userId]);

  if (state.kind === "loading") return <main className="customer-track-page"><TrackingHeader right="Loading"/><StateCard title="Loading live tracking…" body="Reading your order, secure assignment and latest Driver GPS snapshot."/></main>;
  if (state.kind === "error") return <main className="customer-track-page"><TrackingHeader right="Error"/><StateCard title="Live tracking could not be loaded" body={state.message} action="Try again" onAction={() => void reload(true)}/></main>;
  if (!state.data.orders.length) return <main className="customer-track-page"><TrackingHeader right="Secure"/><StateCard title={initialOrderId ? "Tracking is not available for this order" : "No active trip"} body={initialOrderId ? "The order is not Customer-owned/trackable, or its tracking lifecycle is no longer available." : "Accepted and in-transit Customer orders appear here automatically."} action={initialOrderId ? "Back to Orders" : "Go to Home"} onAction={initialOrderId ? onOrders : onHome}/></main>;

  const order = selectedOrder ?? state.data.orders[0];
  const assignment = state.data.assignments.find((item) => item.order_id === order.id);
  const trip = state.data.liveTrips.find((item) => item.order_id === order.id);
  const hasGps = Boolean(trip?.truck_lat != null && trip?.truck_lng != null);
  const freshness = classifyTrackingFreshness(hasGps ? trip?.recorded_at : null);
  const gpsLive = hasGps && freshness === "LIVE";
  const gpsRecordedAt = trip?.recorded_at ? new Date(trip.recorded_at).toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" }) : "Waiting for GPS update";

  return (
    <main className="customer-track-page">
      <TrackingHeader right={labelStatus(order.status)}/>
      <section className="customer-track-route">
        <div className="customer-track-route__top"><div><small>TRACKING / ORDER ID</small><strong>{order.tracking_id || order.id}</strong></div><button type="button" onClick={onOrders} aria-label="Close live tracking">×</button></div>
        <div className="customer-track-route__path"><div><small>Pickup</small><strong>{order.pickup_address || "Pickup pending"}</strong></div><span>→</span><div><small>Drop-off</small><strong>{order.dropoff_address || "Drop-off pending"}</strong></div></div>
        {state.data.orders.length > 1 && !initialOrderId && <label className="customer-track-route__select"><span>Choose active trip</span><select value={order.id} onChange={(event) => setSelectedOrderId(event.target.value)}>{state.data.orders.map((item) => <option key={item.id} value={item.id}>{item.tracking_id || labelStatus(item.status)}</option>)}</select></label>}
      </section>

      <div className="customer-track-full-map" data-gps-live={gpsLive ? "true" : "false"} aria-label={`Last GPS update ${gpsRecordedAt}`}><CustomerTrackingMap trip={trip} totalDistanceKm={order.distance_km}/></div>
      <CustomerAssignmentCard userId={userId} assignment={assignment} orderVehicleType={order.vehicle_type}/>
      {assignment && <section className="customer-track-contact"><div><strong>{assignment.driver_name || "Assigned Driver"}</strong><span>Verified driver & truck · {assignment.plate_number || "plate pending"}</span></div><div className="customer-track-contact__actions">{assignment.driver_phone ? <a href={`tel:${assignment.driver_phone}`} aria-label={`Call ${assignment.driver_name || "Driver"}`}>Call</a> : <span className="is-disabled">Call</span>}<button type="button" onClick={()=>setChatOpen(true)}>💬 Chat</button></div></section>}
      {chatOpen && assignment && <CustomerDriverChat userId={userId} orderId={order.id} driverName={assignment.driver_name || "Assigned Driver"} onClose={()=>setChatOpen(false)}/>}

      <button type="button" className="customer-track-refresh" onClick={() => void reload(false)} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh tracking"}</button>
      <p className="customer-track-security">Read-only Customer tracking. GPS writes remain Driver-only; assignment and trip access stay bound to this signed-in Customer's order.</p>
    </main>
  );
}

function TrackingHeader({ right }: { right: string }) { return <header className="customer-track-header"><div><strong>HALLO<span>TRUCK</span></strong><small>LIVE TRIP TRACKING</small></div><b>{right}</b></header>; }
function StateCard({ title, body, action, onAction }: { title: string; body: string; action?: string; onAction?: () => void }) { return <section className="customer-track-state"><strong>{title}</strong><span>{body}</span>{action && onAction && <button type="button" onClick={onAction}>{action}</button>}</section>; }
