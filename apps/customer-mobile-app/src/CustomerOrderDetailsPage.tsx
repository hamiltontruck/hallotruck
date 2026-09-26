import { useCallback, useEffect, useState } from "react";
import { CustomerAssignmentCard } from "./CustomerAssignmentCard";
import { CustomerDriverChat } from "./CustomerDriverChat";
import { CustomerRatingCard } from "./CustomerRatingCard";
import { loadCustomerAssignments, type CustomerMobileAssignment } from "./customer-assignment.service";
import {
  calculateCustomerMobilePaymentSummary,
  formatCustomerLoad,
  formatEtb,
  formatOrderStatus,
  loadCustomerMobileData,
  printCustomerMobileInvoice,
  type CustomerMobileOrder,
  type CustomerMobilePayment,
} from "./customer-data.service";
import { useCustomerLanguage } from "./customer-language";
import { getCustomerFinalCopy } from "./customer-final-copy";

type State =
  | { kind: "loading" }
  | { kind: "ready"; order: CustomerMobileOrder; payments: CustomerMobilePayment[]; assignment?: CustomerMobileAssignment }
  | { kind: "error"; message: string };

export function CustomerOrderDetailsPage({
  userId,
  orderId,
  onBack,
  onTrack,
}: {
  userId: string;
  orderId: string;
  onBack: () => void;
  onTrack: () => void;
}) {
  const { language } = useCustomerLanguage();
  const c = getCustomerFinalCopy(language);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [chatOpen, setChatOpen] = useState(false);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const data = await loadCustomerMobileData(userId);
      const order = data.orders.find((item) => item.id === orderId);
      if (!order) throw new Error("This Customer order is no longer available.");
      const assignments = await loadCustomerAssignments(userId, [order.id]);
      setState({
        kind: "ready",
        order,
        payments: data.payments.filter((payment) => payment.order_id === order.id),
        assignment: assignments[0],
      });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "Order details could not be loaded." });
    }
  }, [orderId, userId]);

  useEffect(() => { void load(); }, [load]);

  if (state.kind === "loading") return <main className="customer-final-page"><FinalHeader title={c.orderDetails} onBack={onBack}/><div className="customer-final-state" role="status">{c.loading}</div></main>;
  if (state.kind === "error") return <main className="customer-final-page"><FinalHeader title={c.orderDetails} onBack={onBack}/><div className="customer-final-state"><strong>{state.message}</strong><button type="button" onClick={() => void load()}>{c.retry}</button></div></main>;

  const { order, payments, assignment } = state;
  const payment = calculateCustomerMobilePaymentSummary(order, payments);
  const trackable = ["assigned", "accepted", "in_transit", "delivered"].includes(order.status || "");

  return (
    <main className="customer-final-page customer-final-details-page">
      <FinalHeader title={c.orderDetails} onBack={onBack}/>
      <section className="customer-final-details-id">
        <strong>{order.tracking_id || order.id}</strong>
        <b className="customer-final-status-pill" data-status={order.status || "pending"}>{formatOrderStatus(order.status)}</b>
      </section>
      <section className="customer-final-details-card">
        <Detail icon="⌖" label={c.route} value={`${order.pickup_address || "—"} → ${order.dropoff_address || "—"}`} />
        <Detail icon="▣" label={c.cargo} value={formatCustomerLoad(order)} />
        <Detail icon="🚚" label={c.truck} value={order.vehicle_type || c.pending} />
        <Detail icon="◷" label={c.orderDate} value={order.service_date || c.pending} />
        <Detail icon="◫" label={c.distance} value={order.distance_km ? `${Number(order.distance_km).toLocaleString(undefined,{maximumFractionDigits:1})} km` : c.pending} />
        <div className="customer-final-details-total"><span>{c.totalAmount}</span><strong>{formatEtb(order.price_etb)}</strong></div>
        <div className="customer-final-details-created"><span>{c.payment}</span><strong>{formatEtb(payment.verifiedPaid)} / {formatEtb(payment.invoiceTotal)}</strong></div>
        <div className="customer-final-details-created"><span>{c.created}</span><strong>{order.created_at ? new Date(order.created_at).toLocaleString() : "—"}</strong></div>
      </section>

      {(assignment || ["assigned","accepted","in_transit","delivered"].includes(order.status || "")) && (
        <CustomerAssignmentCard userId={userId} assignment={assignment} orderVehicleType={order.vehicle_type} trackingAvailable={trackable} onTrack={onTrack}/>
      )}

      <div className="customer-final-details-actions">
        {trackable && <button type="button" className="customer-final-primary" onClick={onTrack}>{c.liveTracking}</button>}
        <button type="button" className="customer-final-secondary" onClick={() => printCustomerMobileInvoice(order, payments)}>{c.downloadInvoice}</button>
        {assignment?.driver_phone && <a className="customer-final-primary customer-final-call-link" href={`tel:${assignment.driver_phone}`}>{c.callDriver}</a>}
        {assignment && <button type="button" className="customer-final-secondary" onClick={() => setChatOpen(true)}>💬 Chat with Driver</button>}
      </div>
      {order.status === "delivered" && assignment && <CustomerRatingCard userId={userId} orderId={order.id} driverName={assignment.driver_name || "Assigned Driver"} />}
      {chatOpen && assignment && <CustomerDriverChat userId={userId} orderId={order.id} driverName={assignment.driver_name || "Assigned Driver"} onClose={() => setChatOpen(false)} />}
    </main>
  );
}

function Detail({ icon, label, value }: { icon: string; label: string; value: string }) {
  return <div className="customer-final-detail-row"><span className="customer-final-detail-icon" aria-hidden="true">{icon}</span><p><small>{label}</small><strong>{value}</strong></p></div>;
}

function FinalHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return <header className="customer-final-page-title"><button type="button" onClick={onBack} aria-label="Back">‹</button><h1>{title}</h1><span aria-hidden="true" /></header>;
}
