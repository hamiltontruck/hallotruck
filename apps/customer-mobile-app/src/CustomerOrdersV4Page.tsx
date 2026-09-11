import { useEffect, useMemo, useState } from "react";
import { CustomerAssignmentCard } from "./CustomerAssignmentCard";
import { loadCustomerAssignments, type CustomerMobileAssignment } from "./customer-assignment.service";
import {
  calculateCustomerMobilePaymentSummary,
  cancelCustomerMobileOrder,
  createCustomerPaymentReceiptUrl,
  formatCustomerLoad,
  formatEtb,
  formatOrderStatus,
  loadCustomerMobileData,
  printCustomerMobileInvoice,
  type CustomerMobileData,
  type CustomerMobileOrder,
  type CustomerMobilePayment,
} from "./customer-data.service";

export const CUSTOMER_ACTIVE_STATUSES = new Set(["assigned", "accepted", "in_transit"]);
export const CUSTOMER_CANCELLABLE_STATUSES = new Set(["quoted", "placed", "accepted", "in_transit"]);
export const CUSTOMER_TRACKABLE_STATUSES = new Set(["assigned", "accepted", "in_transit", "delivered"]);

type OrderFilter = "all" | "active" | "payment" | "delivered" | "cancelled";
type PageState = { kind: "loading" } | { kind: "ready"; data: CustomerMobileData } | { kind: "error"; message: string };

export function CustomerOrdersV4Page({ userId, onHome, onNewOrder, onTrackOrder }: { userId: string; onHome: () => void; onNewOrder: () => void; onTrackOrder: (orderId: string) => void }) {
  const [state, setState] = useState<PageState>({ kind: "loading" });
  const [assignments, setAssignments] = useState<CustomerMobileAssignment[]>([]);
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);

  async function load(showLoading = false) {
    if (showLoading) setState({ kind: "loading" });
    else setRefreshing(true);
    try {
      const data = await loadCustomerMobileData(userId);
      const ownedOrderIds = data.orders.map((order) => order.id);
      const assignmentRows = await loadCustomerAssignments(userId, ownedOrderIds);
      setAssignments(assignmentRows);
      setState({ kind: "ready", data });
    } catch (caught) {
      setState({ kind: "error", message: caught instanceof Error ? caught.message : "Orders could not be loaded." });
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let active = true;
    void Promise.all([loadCustomerMobileData(userId)]).then(async ([data]) => {
      const assignmentRows = await loadCustomerAssignments(userId, data.orders.map((order) => order.id));
      if (!active) return;
      setAssignments(assignmentRows);
      setState({ kind: "ready", data });
    }).catch((caught: unknown) => {
      if (active) setState({ kind: "error", message: caught instanceof Error ? caught.message : "Orders could not be loaded." });
    });
    return () => { active = false; };
  }, [userId]);

  if (state.kind === "loading") return <main className="customer-v4-page"><PageHeader right="Secure DB"/><StateCard title="Loading orders…" body="Loading your Customer-owned orders and secure assignment cards."/></main>;
  if (state.kind === "error") return <main className="customer-v4-page"><PageHeader right="Secure DB"/><StateCard title="Orders could not be loaded" body={state.message} action="Retry" onAction={() => void load(true)}/></main>;
  if (!state.data.orders.length) return <main className="customer-v4-page"><PageHeader right="0 Orders"/><StateCard title="No orders yet" body="Start a new transport order from Home." action="New order" onAction={onNewOrder}/></main>;

  const data = state.data;
  const metrics = {
    active: data.orders.filter((order) => CUSTOMER_ACTIVE_STATUSES.has(order.status || "")).length,
    delivered: data.orders.filter((order) => order.status === "delivered").length,
    due: data.orders.reduce((total, order) => order.status === "cancelled" ? total : total + calculateCustomerMobilePaymentSummary(order, data.payments.filter((payment) => payment.order_id === order.id)).remainingToSubmit, 0),
  };
  const filtered = data.orders.filter((order) => filterOrder(order, data.payments, filter));

  return (
    <main className="customer-v4-page">
      <PageHeader right={`${data.orders.length} Orders`}/>
      <section className="customer-v4-card customer-v4-overview">
        <div className="customer-v4-section-heading"><div><small>HALLOTRUCK</small><h1>Logistics overview</h1></div><button className="customer-v4-new-order" type="button" onClick={onNewOrder}>+ New order</button></div>
        <div className="customer-v4-summary-grid"><Summary label="Orders" value={String(data.orders.length)}/><Summary label="Active" value={String(metrics.active)}/><Summary label="To pay" value={formatEtb(metrics.due)}/><Summary label="Delivered" value={String(metrics.delivered)}/></div>
        <div className="customer-v4-filter-row" role="group" aria-label="Order filters">{(["all","active","payment","delivered","cancelled"] as OrderFilter[]).map((item) => <button type="button" key={item} className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
      </section>
      <button className="customer-v4-refresh" type="button" onClick={() => void load(false)} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh"}</button>
      <section className="customer-v4-orders-list">
        {filtered.length ? filtered.map((order) => {
          const orderPayments = data.payments.filter((payment) => payment.order_id === order.id);
          const assignment = assignments.find((item) => item.order_id === order.id);
          return <OrderCard key={order.id} userId={userId} order={order} payments={orderPayments} assignment={assignment} expanded={Boolean(expanded[order.id])} onToggle={() => setExpanded((current) => ({ ...current, [order.id]: !current[order.id] }))} onReload={() => load(false)} onTrack={() => onTrackOrder(order.id)}/>;
        }) : <StateCard title="No matching orders" body="No orders match this filter." action="Show all" onAction={() => setFilter("all")}/>} 
      </section>
      <button type="button" className="customer-v4-link" onClick={onHome}>Back to Home</button>
    </main>
  );
}

function filterOrder(order: CustomerMobileOrder, payments: CustomerMobilePayment[], filter: OrderFilter) {
  if (filter === "active") return CUSTOMER_ACTIVE_STATUSES.has(order.status || "");
  if (filter === "delivered") return order.status === "delivered";
  if (filter === "cancelled") return order.status === "cancelled";
  if (filter === "payment") {
    if (order.status === "cancelled") return false;
    const summary = calculateCustomerMobilePaymentSummary(order, payments.filter((payment) => payment.order_id === order.id));
    return summary.remainingToSubmit > 0 || summary.pendingVerification > 0;
  }
  return true;
}

function OrderCard({ userId, order, payments, assignment, expanded, onToggle, onReload, onTrack }: { userId: string; order: CustomerMobileOrder; payments: CustomerMobilePayment[]; assignment?: CustomerMobileAssignment; expanded: boolean; onToggle: () => void; onReload: () => Promise<void>; onTrack: () => void }) {
  const [actionError, setActionError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const summary = useMemo(() => calculateCustomerMobilePaymentSummary(order, payments), [order, payments]);
  const cancellable = CUSTOMER_CANCELLABLE_STATUSES.has(order.status || "");
  const trackable = CUSTOMER_TRACKABLE_STATUSES.has(order.status || "") && order.status !== "cancelled";
  const paymentLabel = summary.pendingVerification > 0 ? "Pending verification" : formatOrderStatus(order.payment_status);

  async function cancelOrder() {
    if (!cancellable || cancelling) return;
    const reason = window.prompt("Why are you cancelling this order? Enter at least 5 characters.", "");
    if (reason === null) return;
    setCancelling(true); setActionError("");
    try { await cancelCustomerMobileOrder(userId, order.id, reason); await onReload(); }
    catch (caught) { setActionError(caught instanceof Error ? caught.message : "Order could not be cancelled."); }
    finally { setCancelling(false); }
  }

  async function openReceipt(payment: CustomerMobilePayment) {
    if (!payment.receipt_path) return;
    try { const url = await createCustomerPaymentReceiptUrl(userId, payment.receipt_path); window.open(url, "_blank", "noopener,noreferrer"); }
    catch (caught) { setActionError(caught instanceof Error ? caught.message : "Receipt could not be opened."); }
  }

  return (
    <article className="customer-v4-card customer-v4-order-card">
      <div className="customer-v4-order-top"><div><strong>{order.tracking_id || "Pending tracking ID"}</strong><p>{order.pickup_address || "Pickup pending"} <span>→</span> {order.dropoff_address || "Drop-off pending"}</p></div><b>{formatOrderStatus(order.status)}</b></div>
      <div className="customer-v4-order-info"><Info label="Quote" value={formatEtb(order.price_etb)}/><Info label="Distance" value={order.distance_km ? `${Number(order.distance_km).toLocaleString(undefined,{maximumFractionDigits:1})} km` : "Pending"}/><Info label="Load" value={formatCustomerLoad(order)}/><Info label="Payment" value={paymentLabel}/><Info label="Vehicle" value={order.vehicle_type || "Pending"} wide/></div>
      {(assignment || CUSTOMER_ACTIVE_STATUSES.has(order.status || "") || order.status === "delivered") && <CustomerAssignmentCard userId={userId} assignment={assignment} orderVehicleType={order.vehicle_type} trackingAvailable={trackable} onTrack={onTrack}/>} 
      <div className="customer-v4-actions"><span>{order.selected_payment_method === "bank_telebirr" ? "Bank / Telebirr" : "Cash"}</span><button type="button" onClick={() => { try { printCustomerMobileInvoice(order, payments); } catch (caught) { setActionError(caught instanceof Error ? caught.message : "Invoice could not be generated."); } }}>Invoice / receipt PDF</button><button type="button" onClick={onToggle}>{expanded ? "Hide details" : "View details"}</button>{trackable && !assignment && <button type="button" onClick={onTrack}>Live trip tracking</button>}{cancellable && <button className="is-danger" type="button" disabled={cancelling} onClick={() => void cancelOrder()}>{cancelling ? "Cancelling…" : "Cancel order"}</button>}</div>
      {actionError && <p className="customer-v4-error" role="alert">{actionError}</p>}
      {expanded && <div className="customer-v4-details"><div className="customer-v4-order-info"><Info label="Verified paid" value={formatEtb(summary.verifiedPaid)}/><Info label="To pay" value={formatEtb(summary.balanceToPay)}/></div>{payments.length ? <div className="customer-v4-payment-history"><small>PAYMENT HISTORY</small>{payments.map((payment) => <div key={payment.id}><span>{formatOrderStatus(payment.provider)} · {formatEtb(payment.amount_etb)} · {formatOrderStatus(payment.event)}</span>{payment.receipt_path && <button type="button" onClick={() => void openReceipt(payment)}>View receipt</button>}</div>)}</div> : <p className="customer-v4-muted">No payment history recorded for this order.</p>}</div>}
    </article>
  );
}

function PageHeader({ right }: { right: string }) { return <header className="customer-v4-page-header"><div><strong>HALLO<span>TRUCK</span></strong><small>CUSTOMER MOBILE</small></div><b>{right}</b></header>; }
function Summary({ label, value }: { label: string; value: string }) { return <div><small>{label}</small><strong>{value}</strong></div>; }
function Info({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) { return <div className={wide ? "is-wide" : ""}><small>{label}</small><strong>{value}</strong></div>; }
function StateCard({ title, body, action, onAction }: { title: string; body: string; action?: string; onAction?: () => void }) { return <section className="customer-v4-card customer-v4-state"><strong>{title}</strong><span>{body}</span>{action && onAction && <button type="button" onClick={onAction}>{action}</button>}</section>; }
