import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createCustomerPaymentReceiptUrl,
  formatEtb,
  formatOrderStatus,
  loadCustomerMobileData,
  type CustomerMobileData,
  type CustomerMobilePayment,
} from "./customer-data.service";

type State =
  | { kind: "loading" }
  | { kind: "ready"; data: CustomerMobileData }
  | { kind: "error"; message: string };

const pageStyle = {
  minHeight: "100%",
  padding: "18px 16px 104px",
  background: "#f4f7fb",
  color: "#10213d",
} as const;

const cardStyle = {
  border: "1px solid #dfe7f1",
  borderRadius: 22,
  background: "#fff",
  padding: 16,
  boxShadow: "0 10px 30px rgba(16,33,61,.06)",
} as const;

function Header({ count }: { count: number | null }) {
  return (
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 18 }}>
      <div>
        <div style={{ color: "#10213d", fontWeight: 950, fontSize: 23, letterSpacing: "-.045em" }}>HALLO<span style={{ color: "#d68e25" }}>TRUCK</span></div>
        <div style={{ color: "#68778d", marginTop: 2, fontSize: 10, fontWeight: 850, letterSpacing: ".09em", textTransform: "uppercase" }}>Customer Payments</div>
      </div>
      <span style={{ borderRadius: 999, background: "#fff7e8", color: "#9a6700", padding: "7px 10px", fontSize: 11, fontWeight: 900 }}>
        {count === null ? "Secure DB" : `${count} Records`}
      </span>
    </header>
  );
}

function StatusCard({ title, body, action, onAction }: { title: string; body: string; action?: string; onAction?: () => void }) {
  return (
    <section style={{ ...cardStyle, marginTop: 34, textAlign: "center", padding: "28px 20px" }}>
      <div style={{ width: 48, height: 48, margin: "0 auto", display: "grid", placeItems: "center", borderRadius: 16, background: "#fff7e8", color: "#9a6700", fontSize: 22, fontWeight: 950 }}>₿</div>
      <h1 style={{ margin: "16px 0 0", fontSize: 22 }}>{title}</h1>
      <p style={{ margin: "10px 0 0", color: "#68778d", fontSize: 13, lineHeight: 1.7 }}>{body}</p>
      {action && onAction && (
        <button type="button" onClick={onAction} style={{ marginTop: 18, minHeight: 46, width: "100%", border: 0, borderRadius: 15, background: "#10213d", color: "#fff", fontWeight: 900 }}>
          {action}
        </button>
      )}
    </section>
  );
}

function PaymentCard({
  payment,
  trackingId,
  userId,
}: {
  payment: CustomerMobilePayment;
  trackingId: string;
  userId: string;
}) {
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);

  async function openReceipt() {
    if (!payment.receipt_path || receiptBusy) return;
    setReceiptBusy(true);
    setReceiptError(null);
    try {
      const url = await createCustomerPaymentReceiptUrl(userId, payment.receipt_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setReceiptError(error instanceof Error ? error.message : "Receipt could not be opened.");
    } finally {
      setReceiptBusy(false);
    }
  }

  return (
    <article style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <small style={{ color: "#68778d", fontWeight: 850 }}>ORDER</small>
          <strong style={{ display: "block", marginTop: 4, overflowWrap: "anywhere" }}>{trackingId}</strong>
        </div>
        <span style={{ flex: "0 0 auto", borderRadius: 999, background: "#fff7e8", color: "#9a6700", padding: "6px 9px", fontSize: 11, fontWeight: 900 }}>
          {formatOrderStatus(payment.event)}
        </span>
      </div>

      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr auto", gap: "8px 12px", alignItems: "center" }}>
        <span style={{ color: "#68778d", fontSize: 12 }}>Amount</span>
        <strong>{formatEtb(payment.amount_etb)}</strong>
        <span style={{ color: "#68778d", fontSize: 12 }}>Provider</span>
        <strong style={{ textAlign: "right", fontSize: 13 }}>{payment.provider || "—"}</strong>
        <span style={{ color: "#68778d", fontSize: 12 }}>Reference</span>
        <strong style={{ textAlign: "right", fontSize: 13, overflowWrap: "anywhere" }}>{payment.provider_ref || "—"}</strong>
        <span style={{ color: "#68778d", fontSize: 12 }}>Recorded</span>
        <strong style={{ textAlign: "right", fontSize: 12 }}>{payment.created_at ? new Date(payment.created_at).toLocaleString() : "—"}</strong>
      </div>

      {payment.receipt_path && (
        <button
          type="button"
          onClick={() => void openReceipt()}
          disabled={receiptBusy}
          style={{ marginTop: 14, minHeight: 42, width: "100%", border: "1px solid #cddcf0", borderRadius: 13, background: "#fff", color: "#10213d", fontWeight: 900 }}
        >
          {receiptBusy ? "Preparing receipt…" : "Open receipt"}
        </button>
      )}
      {receiptError && <p role="alert" style={{ margin: "10px 0 0", color: "#b42318", fontSize: 11 }}>{receiptError}</p>}
    </article>
  );
}

export function CustomerPaymentsPage({ userId, onHome }: { userId: string; onHome: () => void }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      setState({ kind: "ready", data: await loadCustomerMobileData(userId) });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "Payment data could not be loaded." });
    }
  }, [userId]);

  useEffect(() => {
    let active = true;
    void loadCustomerMobileData(userId)
      .then((data) => {
        if (active) setState({ kind: "ready", data });
      })
      .catch((error: unknown) => {
        if (active) setState({ kind: "error", message: error instanceof Error ? error.message : "Payment data could not be loaded." });
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const count = state.kind === "ready" ? state.data.payments.length : null;
  const orderMap = useMemo(() => {
    if (state.kind !== "ready") return new Map<string, string>();
    return new Map(state.data.orders.map((order) => [order.id, order.tracking_id || "Pending tracking ID"]));
  }, [state]);

  if (state.kind === "loading") {
    return <main style={pageStyle}><Header count={null}/><StatusCard title="Loading payments…" body="Payment ledger records are loading only after this Customer's order IDs are resolved under existing RLS."/></main>;
  }

  if (state.kind === "error") {
    return <main style={pageStyle}><Header count={null}/><StatusCard title="Payments could not be loaded" body={state.message} action="Try again" onAction={() => void load()}/></main>;
  }

  if (!state.data.orders.length) {
    return <main style={pageStyle}><Header count={0}/><StatusCard title="No payment history" body="This account has no orders, so there are no real payment records to display." action="Go to Home" onAction={onHome}/></main>;
  }

  if (!state.data.payments.length) {
    return <main style={pageStyle}><Header count={0}/><StatusCard title="No payment records yet" body="Orders exist, but the payment ledger currently has no records for this Customer. No payment is fabricated." action="Refresh" onAction={() => void load()}/></main>;
  }

  return (
    <main style={pageStyle}>
      <Header count={count}/>
      <section style={{ ...cardStyle, marginBottom: 14, background: "linear-gradient(135deg,#10213d,#26364d)", color: "#fff", border: 0 }}>
        <small style={{ color: "#f5b400", fontWeight: 900 }}>PAYMENT HISTORY</small>
        <h1 style={{ margin: "6px 0 0", fontSize: 24 }}>Your payments</h1>
        <p style={{ margin: "8px 0 0", color: "rgba(255,255,255,.78)", fontSize: 12, lineHeight: 1.6 }}>
          Events and amounts are shown exactly as recorded in the database ledger. This app does not calculate a fake balance or alter finance history.
        </p>
      </section>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button type="button" onClick={() => void load()} style={{ border: "1px solid #d8e2ef", borderRadius: 12, background: "#fff", padding: "9px 11px", color: "#10213d", fontWeight: 850 }}>Refresh</button>
      </div>

      <section style={{ display: "grid", gap: 12 }}>
        {state.data.payments.map((payment) => (
          <PaymentCard
            key={payment.id}
            payment={payment}
            userId={userId}
            trackingId={orderMap.get(payment.order_id) || "Customer order"}
          />
        ))}
      </section>

      <p style={{ margin: "14px 4px 0", color: "#68778d", fontSize: 11, lineHeight: 1.6 }}>
        Read-only: payment submission, verification, refund, release and ledger mutation are not included in this screen.
      </p>
    </main>
  );
}
