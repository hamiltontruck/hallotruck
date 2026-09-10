import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
import { customerSupabase } from "./auth/customer-supabase";

type DataState =
  | { kind: "loading" }
  | { kind: "ready"; data: CustomerMobileData }
  | { kind: "error"; message: string };

type OrderFilter = "all" | "active" | "payment" | "delivered" | "cancelled";

const activeStatuses = new Set(["assigned", "accepted", "in_transit"]);
const cancellableStatuses = new Set(["quoted", "placed"]);

const pageStyle = {
  minHeight: "100%",
  padding: "18px 12px 104px",
  background: "#f4f7fb",
  color: "#10213d",
} as const;

const cardStyle = {
  border: "1px solid #dfe7f1",
  borderRadius: "22px",
  background: "#fff",
  padding: "16px",
  boxShadow: "0 10px 30px rgba(16,33,61,.06)",
} as const;

const actionStyle = {
  minHeight: 42,
  borderRadius: 13,
  padding: "9px 12px",
  fontWeight: 850,
  fontSize: 12,
  background: "#fff",
  color: "#0b61d8",
  border: "1px solid #cddcf0",
} as const;

function HaloHeader({ right }: { right: ReactNode }) {
  return (
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 20 }}>
      <div>
        <div style={{ color: "#10213d", fontWeight: 950, fontSize: 23, letterSpacing: "-.045em" }}>HALLO<span style={{ color: "#d68e25" }}>TRUCK</span></div>
        <div style={{ marginTop: 2, color: "#68778d", fontSize: 10, fontWeight: 850, textTransform: "uppercase", letterSpacing: ".09em" }}>Customer Mobile</div>
      </div>
      <span style={{ borderRadius: 999, background: "#fff7e8", padding: "7px 10px", color: "#9a6700", fontSize: 11, fontWeight: 900 }}>{right}</span>
    </header>
  );
}

function StatusCard({ title, body, action, onAction }: { title: string; body: string; action?: string; onAction?: () => void }) {
  return (
    <section style={{ ...cardStyle, marginTop: 34, textAlign: "center", padding: "28px 20px" }}>
      <div style={{ width: 48, height: 48, margin: "0 auto", display: "grid", placeItems: "center", borderRadius: 16, background: "#fff7e8", color: "#9a6700", fontSize: 22, fontWeight: 950 }}>H</div>
      <h1 style={{ margin: "16px 0 0", fontSize: 22, lineHeight: 1.2 }}>{title}</h1>
      <p style={{ margin: "10px 0 0", color: "#68778d", fontSize: 13, lineHeight: 1.7 }}>{body}</p>
      {action && onAction && (
        <button type="button" onClick={onAction} style={{ marginTop: 18, minHeight: 46, width: "100%", border: 0, borderRadius: 15, background: "#10213d", color: "#fff", fontWeight: 900 }}>
          {action}
        </button>
      )}
    </section>
  );
}

function useCustomerData(userId: string) {
  const [state, setState] = useState<DataState>({ kind: "loading" });

  const reload = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const data = await loadCustomerMobileData(userId);
      setState({ kind: "ready", data });
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Customer data could not be loaded.",
      });
    }
  }, [userId]);

  useEffect(() => {
    let active = true;
    void loadCustomerMobileData(userId)
      .then((data) => {
        if (active) setState({ kind: "ready", data });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : "Customer data could not be loaded.",
        });
      });
    return () => {
      active = false;
    };
  }, [userId]);

  return { state, reload };
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minHeight: 74, border: "1px solid #dfe7f1", borderRadius: 17, background: "#f8fbff", padding: "13px 14px" }}>
      <small style={{ display: "block", color: "#68778d", fontSize: 10, fontWeight: 900, letterSpacing: ".08em" }}>{label.toUpperCase()}</small>
      <strong style={{ display: "block", marginTop: 7, fontSize: 15, overflowWrap: "anywhere" }}>{value}</strong>
    </div>
  );
}

function Info({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div style={{ gridColumn: wide ? "1 / -1" : undefined, minHeight: 72, borderRadius: 16, background: "#f7faff", padding: "13px 14px" }}>
      <small style={{ display: "block", color: "#68778d", fontSize: 10, fontWeight: 900, letterSpacing: ".08em" }}>{label.toUpperCase()}</small>
      <strong style={{ display: "block", marginTop: 7, fontSize: 14, overflowWrap: "anywhere" }}>{value}</strong>
    </div>
  );
}

function OrderCard({
  userId,
  order,
  payments,
  expanded,
  onToggle,
  onReload,
}: {
  userId: string;
  order: CustomerMobileOrder;
  payments: CustomerMobilePayment[];
  expanded: boolean;
  onToggle: () => void;
  onReload: () => Promise<void>;
}) {
  const [actionError, setActionError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const summary = calculateCustomerMobilePaymentSummary(order, payments);
  const cancellable = cancellableStatuses.has(order.status || "");
  const pending = summary.pendingVerification > 0;
  const paymentLabel = pending ? "Pending verification" : formatOrderStatus(order.payment_status);
  const paymentMethod = order.selected_payment_method === "bank_telebirr" ? "Bank / Telebirr" : "Cash";

  async function openReceipt(payment: CustomerMobilePayment) {
    if (!payment.receipt_path) return;
    try {
      setActionError("");
      const url = await createCustomerPaymentReceiptUrl(userId, payment.receipt_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Receipt could not be opened.");
    }
  }

  async function cancelOrder() {
    if (!cancellable || cancelling) return;
    const reason = window.prompt("Why are you cancelling this order? Enter at least 5 characters.", "");
    if (reason === null) return;
    setCancelling(true);
    setActionError("");
    try {
      await cancelCustomerMobileOrder(userId, order.id, reason);
      await onReload();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Order could not be cancelled.");
    } finally {
      setCancelling(false);
    }
  }

  function printInvoice() {
    try {
      setActionError("");
      printCustomerMobileInvoice(order, payments);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Invoice could not be generated.");
    }
  }

  return (
    <article style={{ ...cardStyle, padding: "15px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <strong style={{ display: "block", color: "#61728a", fontSize: 11, fontFamily: "monospace", overflowWrap: "anywhere" }}>{order.tracking_id || "Pending tracking ID"}</strong>
          <div style={{ marginTop: 9, fontSize: 15, lineHeight: 1.45, fontWeight: 650 }}>
            {order.pickup_address || "Pickup pending"} <span style={{ color: "#68778d" }}>→</span> {order.dropoff_address || "Drop-off pending"}
          </div>
        </div>
        <span style={{ flex: "0 0 auto", borderRadius: 999, background: "#fff2dd", padding: "7px 10px", color: "#9a6700", fontSize: 10, fontWeight: 900 }}>{formatOrderStatus(order.status)}</span>
      </div>

      <div style={{ marginTop: 13, padding: 2, borderRadius: 18, background: "#eef1f5", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
        <Info label="Quote" value={formatEtb(order.price_etb)}/>
        <Info label="Distance" value={order.distance_km ? `${Number(order.distance_km).toLocaleString(undefined, { maximumFractionDigits: 1 })} km` : "Pending"}/>
        <Info label="Load" value={formatCustomerLoad(order)}/>
        <Info label="Payment" value={paymentLabel}/>
        <Info label="Vehicle" value={order.vehicle_type || "Pending"} wide/>
      </div>

      <div style={{ marginTop: 13, paddingTop: 12, borderTop: "1px solid #e7edf5", display: "flex", flexWrap: "wrap", gap: 8 }}>
        <span style={{ ...actionStyle, display: "inline-flex", alignItems: "center", color: "#68778d" }}>{paymentMethod}</span>
        <button type="button" onClick={printInvoice} style={actionStyle}>Invoice / receipt PDF</button>
        <button type="button" onClick={onToggle} style={actionStyle}>{expanded ? "Hide details" : "View details"}</button>
        {cancellable && <button type="button" disabled={cancelling} onClick={() => void cancelOrder()} style={{ ...actionStyle, color: "#a5422a", borderColor: "#f0b8aa", background: "#fff9f7", opacity: cancelling ? .6 : 1 }}>{cancelling ? "Cancelling…" : "Cancel order"}</button>}
      </div>

      {actionError && <p role="alert" style={{ margin: "10px 2px 0", color: "#b42318", fontSize: 11, fontWeight: 800 }}>{actionError}</p>}

      {expanded && (
        <div style={{ marginTop: 13, paddingTop: 13, borderTop: "1px solid #e7edf5" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Info label="Verified paid" value={formatEtb(summary.verifiedPaid)}/>
            <Info label="To pay" value={formatEtb(summary.balanceToPay)}/>
          </div>
          {payments.length > 0 ? (
            <div style={{ marginTop: 12, borderRadius: 16, background: "#f7faff", padding: 12 }}>
              <small style={{ color: "#68778d", fontWeight: 900, letterSpacing: ".08em" }}>PAYMENT HISTORY</small>
              <div style={{ marginTop: 8, display: "grid", gap: 7 }}>
                {payments.map((payment) => (
                  <div key={payment.id} style={{ borderRadius: 12, background: "#fff", padding: "9px 10px", fontSize: 11, lineHeight: 1.5 }}>
                    <strong>{formatOrderStatus(payment.provider)}</strong> · {formatEtb(payment.amount_etb)} · {formatOrderStatus(payment.event)}
                    {payment.receipt_path && <button type="button" onClick={() => void openReceipt(payment)} style={{ marginLeft: 8, border: 0, background: "transparent", padding: 0, color: "#0b61d8", fontWeight: 850 }}>View receipt</button>}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p style={{ margin: "12px 2px 0", color: "#68778d", fontSize: 11 }}>No payment history recorded for this order.</p>
          )}
        </div>
      )}
    </article>
  );
}

export function CustomerOrdersPage({ userId, onHome, onNewOrder }: { userId: string; onHome: () => void; onNewOrder: () => void }) {
  const { state, reload } = useCustomerData(userId);
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});

  const readyData = state.kind === "ready" ? state.data : null;
  const metrics = useMemo(() => {
    if (!readyData) return { active: 0, delivered: 0, due: 0 };
    return {
      active: readyData.orders.filter((order) => activeStatuses.has(order.status || "")).length,
      delivered: readyData.orders.filter((order) => order.status === "delivered").length,
      due: readyData.orders.reduce((total, order) => {
        if (order.status === "cancelled") return total;
        const payments = readyData.payments.filter((payment) => payment.order_id === order.id);
        return total + calculateCustomerMobilePaymentSummary(order, payments).remainingToSubmit;
      }, 0),
    };
  }, [readyData]);

  if (state.kind === "loading") {
    return <main style={pageStyle}><HaloHeader right="Secure DB"/><StatusCard title="Loading orders…" body="Your signed-in Customer orders are loading from the existing database."/></main>;
  }
  if (state.kind === "error") {
    return <main style={pageStyle}><HaloHeader right="Secure DB"/><StatusCard title="Orders could not be loaded" body={state.message} action="Try again" onAction={() => void reload()}/></main>;
  }
  if (!state.data.orders.length) {
    return <main style={pageStyle}><HaloHeader right="0 Orders"/><StatusCard title="No orders yet" body="No orders were found for this account. Start a new route from Home." action="New order" onAction={onNewOrder}/></main>;
  }

  const filteredOrders = state.data.orders.filter((order) => {
    if (filter === "active") return activeStatuses.has(order.status || "");
    if (filter === "delivered") return order.status === "delivered";
    if (filter === "cancelled") return order.status === "cancelled";
    if (filter === "payment") {
      if (order.status === "cancelled") return false;
      const payments = state.data.payments.filter((payment) => payment.order_id === order.id);
      const summary = calculateCustomerMobilePaymentSummary(order, payments);
      return summary.remainingToSubmit > 0 || summary.pendingVerification > 0;
    }
    return true;
  });

  const filterLabels: Record<OrderFilter, string> = {
    all: "All",
    active: "Active",
    payment: "Payment",
    delivered: "Delivered",
    cancelled: "Cancelled",
  };

  return (
    <main style={pageStyle}>
      <HaloHeader right={`${state.data.orders.length} Orders`}/>
      <section style={{ ...cardStyle, padding: "15px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div><small style={{ color: "#9a6700", fontSize: 10, fontWeight: 900, letterSpacing: ".16em" }}>HALLOTRUCK</small><h1 style={{ margin: "5px 0 0", fontSize: 22 }}>Logistics overview</h1></div>
          <button type="button" onClick={onNewOrder} style={{ minHeight: 43, border: 0, borderRadius: 14, background: "#0b61d8", color: "#fff", padding: "9px 13px", fontWeight: 900, whiteSpace: "nowrap" }}>+ New order</button>
        </div>
        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <SummaryValue label="Orders" value={state.data.orders.length.toLocaleString()}/>
          <SummaryValue label="Active" value={metrics.active.toLocaleString()}/>
          <SummaryValue label="To pay" value={formatEtb(metrics.due)}/>
          <SummaryValue label="Delivered" value={metrics.delivered.toLocaleString()}/>
        </div>
        <div role="group" aria-label="Order filters" style={{ marginTop: 13, display: "flex", gap: 7, overflowX: "auto", paddingBottom: 1, WebkitOverflowScrolling: "touch" }}>
          {(Object.keys(filterLabels) as OrderFilter[]).map((item) => (
            <button key={item} type="button" onClick={() => setFilter(item)} style={{ minHeight: 40, flex: "0 0 auto", borderRadius: 999, padding: "8px 13px", border: filter === item ? "1px solid #0b61d8" : "1px solid #d8e2ef", background: filter === item ? "#0b61d8" : "#fff", color: filter === item ? "#fff" : "#68778d", fontWeight: 850 }}>{filterLabels[item]}</button>
          ))}
        </div>
      </section>

      <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
        <button type="button" onClick={() => void reload()} style={{ border: "1px solid #d8e2ef", borderRadius: 12, background: "#fff", padding: "8px 11px", color: "#10213d", fontWeight: 850 }}>Refresh</button>
      </div>

      <section style={{ marginTop: 10, display: "grid", gap: 12 }}>
        {filteredOrders.length ? filteredOrders.map((order) => {
          const payments = state.data.payments.filter((payment) => payment.order_id === order.id);
          const expanded = expandedOrders[order.id] ?? false;
          return <OrderCard key={order.id} userId={userId} order={order} payments={payments} expanded={expanded} onToggle={() => setExpandedOrders((current) => ({ ...current, [order.id]: !expanded }))} onReload={reload}/>;
        }) : <StatusCard title="No matching orders" body="No orders match this filter." action="Show all" onAction={() => setFilter("all")}/>} 
      </section>

      <button type="button" onClick={onHome} style={{ marginTop: 14, width: "100%", border: 0, background: "transparent", color: "#68778d", fontWeight: 800 }}>Back to Home</button>
    </main>
  );
}

function ProfileRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(90px,.8fr) 1.2fr", gap: 14, padding: "13px 0", borderBottom: "1px solid #edf1f6" }}>
      <span style={{ color: "#68778d", fontSize: 12 }}>{label}</span>
      <strong style={{ textAlign: "right", overflowWrap: "anywhere", fontSize: 13 }}>{value?.trim() || "—"}</strong>
    </div>
  );
}

export function CustomerProfilePage({ userId }: { userId: string }) {
  const { state, reload } = useCustomerData(userId);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  async function signOutCustomer() {
    if (signingOut) return;
    const client = customerSupabase;
    if (!client) {
      setSignOutError("Customer session client is not configured.");
      return;
    }

    setSigningOut(true);
    setSignOutError("");
    try {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : "Sign-out failed.");
    } finally {
      setSigningOut(false);
    }
  }

  if (state.kind === "loading") {
    return <main style={pageStyle}><HaloHeader right="Secure RPC"/><StatusCard title="Loading profile…" body="Your Customer profile is loading through the secure customer_get_profile RPC."/></main>;
  }
  if (state.kind === "error") {
    return <main style={pageStyle}><HaloHeader right="Secure RPC"/><StatusCard title="Profile could not be loaded" body={state.message} action="Try again" onAction={() => void reload()}/></main>;
  }
  if (!state.data.profile) {
    return <main style={pageStyle}><HaloHeader right="Secure RPC"/><StatusCard title="Customer profile not found" body="A session exists, but customer_get_profile returned no profile. No profile data is guessed."/></main>;
  }

  const profile = state.data.profile;
  const joined = profile.created_at ? new Date(profile.created_at).toLocaleDateString() : "—";
  return (
    <main style={pageStyle}>
      <HaloHeader right="Verified Customer"/>
      <section style={{ ...cardStyle, background: "linear-gradient(135deg,#10213d,#26364d)", color: "#fff", border: 0 }}>
        <div style={{ width: 54, height: 54, display: "grid", placeItems: "center", borderRadius: 18, background: "rgba(245,180,0,.16)", color: "#f5b400", fontSize: 22, fontWeight: 950 }}>{(profile.full_name || "C").trim().slice(0, 1).toUpperCase()}</div>
        <small style={{ display: "block", marginTop: 16, color: "#f5b400", fontWeight: 850 }}>CUSTOMER PROFILE</small>
        <h1 style={{ margin: "5px 0 0", fontSize: 25 }}>{profile.full_name || "Customer"}</h1>
        <p style={{ margin: "7px 0 0", color: "rgba(255,255,255,.75)", fontSize: 12 }}>{profile.customer_type === "business" ? profile.company_name || "Business account" : "Individual account"}</p>
      </section>
      <section style={{ ...cardStyle, marginTop: 14 }}>
        <ProfileRow label="Phone" value={profile.phone}/>
        <ProfileRow label="Email" value={profile.email}/>
        <ProfileRow label="Home address" value={profile.home_address}/>
        <ProfileRow label="Account type" value={profile.customer_type}/>
        {profile.customer_type === "business" && <ProfileRow label="Company" value={profile.company_name}/>} 
        <ProfileRow label="Joined" value={joined}/>
      </section>
      <button type="button" onClick={() => void reload()} style={{ marginTop: 14, minHeight: 46, width: "100%", border: "1px solid #d8e2ef", borderRadius: 15, background: "#fff", color: "#10213d", fontWeight: 900 }}>Refresh profile</button>
      {signOutError && <p role="alert" style={{ margin: "12px 4px 0", color: "#b42318", fontSize: 11, fontWeight: 800 }}>{signOutError}</p>}
      <button type="button" onClick={() => void signOutCustomer()} disabled={signingOut} aria-busy={signingOut} style={{ marginTop: 10, minHeight: 46, width: "100%", border: "1px solid #f0c8c4", borderRadius: 15, background: "#fff", color: "#b42318", fontWeight: 900, opacity: signingOut ? .65 : 1 }}>
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
      <p style={{ margin: "14px 4px 0", color: "#68778d", fontSize: 11, lineHeight: 1.6 }}>Read-only: profile editing is not included. Data comes only from the existing Customer backend, RLS and secure RPC.</p>
    </main>
  );
}
