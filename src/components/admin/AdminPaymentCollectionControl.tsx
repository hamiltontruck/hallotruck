import { useEffect, useMemo, useState } from "react";
import type { AdminOrder, Payment } from "../../services/admin.service";
import { supabase } from "../../services/supabase.client";
import { calculatePaymentSummary, type PaymentSummary } from "../../utils/paymentSummary";

type PaymentFilter = "action" | "all" | "paid" | "partial" | "pending" | "unpaid" | "overpaid";
type PaymentState = "paid" | "partial" | "pending" | "unpaid" | "overpaid";

type OrderFinancialRow = {
  order: AdminOrder;
  summary: PaymentSummary;
  state: PaymentState;
  deliveredAction: boolean;
};

export function AdminPaymentCollectionControl({
  orders,
  onOpenControl,
}: {
  orders: AdminOrder[];
  onOpenControl: (orderId: string) => void;
}) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [filter, setFilter] = useState<PaymentFilter>("action");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadPayments() {
    const { data, error: paymentError } = await supabase
      .from("payments")
      .select("id,order_id,provider,provider_ref,amount_etb,event,receipt_path,created_at")
      .order("created_at", { ascending: false })
      .limit(500);

    if (paymentError) {
      setError(paymentError.message);
      setLoading(false);
      return;
    }

    setPayments((data ?? []) as Payment[]);
    setError("");
    setLoading(false);
  }

  useEffect(() => {
    void loadPayments();

    const channel = supabase
      .channel("admin-payment-collection-control")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments" },
        () => { void loadPayments(); },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, []);

  const rows = useMemo<OrderFinancialRow[]>(() => {
    return orders
      .map((order) => {
        const orderPayments = payments.filter((payment) => payment.order_id === order.id);
        const summary = calculatePaymentSummary(order.price_etb, orderPayments);
        const state = financialState(summary);
        const deliveredAction = order.status === "delivered" && summary.balanceToPay > 0;
        return { order, summary, state, deliveredAction };
      })
      .sort((a, b) => {
        if (a.deliveredAction !== b.deliveredAction) return a.deliveredAction ? -1 : 1;
        const actionA = a.state === "pending" || a.state === "partial" || a.state === "unpaid";
        const actionB = b.state === "pending" || b.state === "partial" || b.state === "unpaid";
        if (actionA !== actionB) return actionA ? -1 : 1;
        return new Date(b.order.created_at).getTime() - new Date(a.order.created_at).getTime();
      });
  }, [orders, payments]);

  const deliveredDueRows = rows.filter((row) => row.deliveredAction);
  const paidRows = rows.filter((row) => row.state === "paid");
  const partialRows = rows.filter((row) => row.state === "partial");
  const pendingRows = rows.filter((row) => row.state === "pending");
  const unpaidRows = rows.filter((row) => row.state === "unpaid");
  const overpaidRows = rows.filter((row) => row.state === "overpaid");
  const outstandingEtb = deliveredDueRows.reduce((sum, row) => sum + row.summary.balanceToPay, 0);

  const visibleRows = rows.filter((row) => {
    if (filter === "all") return true;
    if (filter === "action") return row.deliveredAction;
    return row.state === filter;
  });

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-asphalt/10 bg-white shadow-sm">
      <header className="border-b border-asphalt/10 bg-asphalt p-5 text-white sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-mono text-[10px] tracking-[.2em] text-amber">PAYMENT COLLECTION CONTROL</p>
            <h2 className="mt-2 font-display text-xl font-bold sm:text-2xl">Paid and unpaid orders</h2>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-white/55">
              Delivery status and payment status are tracked separately. Completed delivery does not hide an unpaid invoice.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadPayments()}
            disabled={loading}
            className="min-h-11 shrink-0 rounded-xl border border-white/20 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "↻ Refresh ledger"}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:p-6 xl:grid-cols-6">
        <SummaryCard label="Delivered · payment due" value={deliveredDueRows.length} tone="danger" detail={`ETB ${outstandingEtb.toLocaleString()} outstanding`} />
        <SummaryCard label="Paid" value={paidRows.length} tone="success" detail="Verified balance cleared" />
        <SummaryCard label="Partially paid" value={partialRows.length} tone="warning" detail="Balance remains" />
        <SummaryCard label="Verify receipt" value={pendingRows.length} tone="pending" detail="Customer submission pending" />
        <SummaryCard label="Unpaid" value={unpaidRows.length} tone="neutral" detail="No verified payment" />
        <SummaryCard label="Overpaid" value={overpaidRows.length} tone="credit" detail="Refund or credit due" />
      </div>

      {deliveredDueRows.length > 0 && (
        <div className="mx-4 mb-4 rounded-2xl border border-route/35 bg-route/5 p-4 sm:mx-6 sm:mb-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-route text-lg font-bold text-white">!</span>
            <div>
              <p className="font-semibold text-route">{deliveredDueRows.length} delivered order{deliveredDueRows.length === 1 ? "" : "s"} still need financial action.</p>
              <p className="mt-1 text-xs leading-5 text-steel">
                Verify a submitted receipt, record a missing payment, or collect the remaining balance. These orders stay visible until the verified balance reaches zero.
              </p>
            </div>
          </div>
        </div>
      )}

      {error && <p className="mx-4 mb-4 border border-route/30 bg-route/5 p-3 text-xs text-route sm:mx-6">{error}</p>}

      <div className="flex gap-2 overflow-x-auto border-y border-asphalt/10 bg-[#f8f7f2] px-4 py-3 sm:px-6">
        <FilterButton active={filter === "action"} onClick={() => setFilter("action")} label={`Collection due ${deliveredDueRows.length}`} danger={deliveredDueRows.length > 0} />
        <FilterButton active={filter === "all"} onClick={() => setFilter("all")} label={`All ${rows.length}`} />
        <FilterButton active={filter === "paid"} onClick={() => setFilter("paid")} label={`Paid ${paidRows.length}`} />
        <FilterButton active={filter === "partial"} onClick={() => setFilter("partial")} label={`Partial ${partialRows.length}`} />
        <FilterButton active={filter === "pending"} onClick={() => setFilter("pending")} label={`Verify ${pendingRows.length}`} />
        <FilterButton active={filter === "unpaid"} onClick={() => setFilter("unpaid")} label={`Unpaid ${unpaidRows.length}`} />
        <FilterButton active={filter === "overpaid"} onClick={() => setFilter("overpaid")} label={`Overpaid ${overpaidRows.length}`} />
      </div>

      {loading ? (
        <p className="p-10 text-center font-mono text-xs text-steel">Loading payment ledger…</p>
      ) : visibleRows.length ? (
        <div className="divide-y divide-asphalt/10">
          {visibleRows.map((row) => (
            <PaymentOrderRow key={row.order.id} row={row} onOpen={() => onOpenControl(row.order.id)} />
          ))}
        </div>
      ) : (
        <div className="p-8 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-700">✓</div>
          <p className="mt-4 font-display text-lg font-semibold">No orders in this payment group</p>
          <p className="mt-1 text-xs text-steel">Choose another filter to review the complete ledger.</p>
        </div>
      )}
    </section>
  );
}

function PaymentOrderRow({ row, onOpen }: { row: OrderFinancialRow; onOpen: () => void }) {
  const { order, summary, state, deliveredAction } = row;
  const actionLabel = deliveredAction
    ? summary.pendingVerification > 0
      ? "Verify payment"
      : summary.verifiedPaid > 0
        ? "Collect balance"
        : "Record payment"
    : "Open control";

  return (
    <article className={`p-4 sm:px-6 sm:py-5 ${deliveredAction ? "bg-route/[.025]" : "bg-white"}`}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(330px,.85fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-xs font-semibold text-asphalt">{order.tracking_id}</p>
            <DeliveryPill status={order.status} />
            <PaymentPill state={state} deliveredAction={deliveredAction} pending={summary.pendingVerification > 0} />
          </div>
          <p className="mt-3 text-sm font-semibold text-asphalt">{order.customer_name ?? "Customer"}</p>
          <p className="mt-1 text-xs text-steel">{order.customer_phone ?? "No phone"} · {order.pickup_address} → {order.dropoff_address}</p>
          {deliveredAction && (
            <p className={`mt-2 text-xs font-semibold ${summary.pendingVerification > 0 ? "text-amber-dim" : "text-route"}`}>
              {summary.pendingVerification > 0
                ? "Delivery is complete, but the customer payment still needs verification."
                : "Delivery is complete, but the verified invoice balance is not cleared."}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
          <MoneyCell label="Invoice" value={summary.invoiceTotal} />
          <MoneyCell label="Verified" value={summary.verifiedPaid} positive={summary.verifiedPaid > 0} />
          <MoneyCell label="Pending" value={summary.pendingVerification} pending={summary.pendingVerification > 0} />
          <MoneyCell label={summary.customerCredit > 0 ? "Credit" : "Balance"} value={summary.customerCredit > 0 ? summary.customerCredit : summary.balanceToPay} danger={summary.balanceToPay > 0 && order.status === "delivered"} />
        </div>

        <button
          type="button"
          onClick={onOpen}
          className={`min-h-12 rounded-xl px-5 py-3 text-xs font-semibold ${deliveredAction ? "bg-route text-white" : "border border-asphalt bg-white text-asphalt"}`}
        >
          {actionLabel} →
        </button>
      </div>
    </article>
  );
}

function financialState(summary: PaymentSummary): PaymentState {
  if (summary.customerCredit > 0) return "overpaid";
  if (summary.balanceToPay <= 0) return "paid";
  if (summary.pendingVerification > 0) return "pending";
  if (summary.verifiedPaid > 0) return "partial";
  return "unpaid";
}

function SummaryCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  tone: "danger" | "success" | "warning" | "pending" | "neutral" | "credit";
}) {
  const tones = {
    danger: "border-route/35 bg-route/5 text-route",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-amber/35 bg-amber/10 text-amber-dim",
    pending: "border-sky-200 bg-sky-50 text-sky-800",
    neutral: "border-asphalt/10 bg-[#f5f3ed] text-asphalt",
    credit: "border-violet-200 bg-violet-50 text-violet-800",
  } as const;

  return (
    <div className={`min-w-0 rounded-xl border p-3 sm:p-4 ${tones[tone]}`}>
      <p className="font-mono text-[8px] uppercase tracking-wider opacity-75 sm:text-[9px]">{label}</p>
      <p className="mt-2 font-display text-2xl font-bold">{value}</p>
      <p className="mt-1 truncate text-[9px] opacity-70">{detail}</p>
    </div>
  );
}

function FilterButton({
  label,
  active,
  danger = false,
  onClick,
}: {
  label: string;
  active: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-2 text-[10px] font-semibold ${active
        ? danger
          ? "border-route bg-route text-white"
          : "border-asphalt bg-asphalt text-white"
        : danger
          ? "border-route/30 bg-white text-route"
          : "border-asphalt/10 bg-white text-steel"
      }`}
    >
      {label}
    </button>
  );
}

function DeliveryPill({ status }: { status: string }) {
  const delivered = status === "delivered";
  return <span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold capitalize ${delivered ? "bg-emerald-50 text-emerald-800" : "bg-asphalt/5 text-steel"}`}>{status.replace(/_/g, " ")}</span>;
}

function PaymentPill({
  state,
  deliveredAction,
  pending,
}: {
  state: PaymentState;
  deliveredAction: boolean;
  pending: boolean;
}) {
  let label = state.replace(/_/g, " ");
  let className = "bg-asphalt/5 text-steel";

  if (state === "paid") className = "bg-emerald-50 text-emerald-800";
  if (state === "partial") className = "bg-amber/10 text-amber-dim";
  if (state === "pending") className = "bg-sky-50 text-sky-800";
  if (state === "overpaid") className = "bg-violet-50 text-violet-800";
  if (state === "unpaid") className = "bg-route/10 text-route";

  if (deliveredAction) {
    label = pending ? "delivered · verify payment" : state === "partial" ? "delivered · partial" : "delivered · unpaid";
    className = pending ? "bg-amber/15 text-amber-dim" : "bg-route text-white";
  }

  return <span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold capitalize ${className}`}>{label}</span>;
}

function MoneyCell({
  label,
  value,
  positive = false,
  pending = false,
  danger = false,
}: {
  label: string;
  value: number;
  positive?: boolean;
  pending?: boolean;
  danger?: boolean;
}) {
  const className = danger
    ? "border-route/25 bg-route/5 text-route"
    : pending
      ? "border-sky-200 bg-sky-50 text-sky-800"
      : positive
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : "border-asphalt/10 bg-[#f8f7f2] text-asphalt";

  return (
    <div className={`min-w-0 rounded-xl border p-2.5 ${className}`}>
      <p className="font-mono text-[8px] uppercase tracking-wider opacity-65">{label}</p>
      <p className="mt-1 truncate text-xs font-bold">ETB {value.toLocaleString()}</p>
    </div>
  );
}
