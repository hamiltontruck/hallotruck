import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase.client";

type ReviewFilter = "pending" | "rejected" | "verified" | "all";

type PaymentEvent = "initiated" | "failed" | "held_escrow";

interface PaymentReviewRow {
  id: string;
  order_id: string;
  provider: string;
  provider_ref: string | null;
  amount_etb: number | string;
  event: PaymentEvent;
  receipt_path: string | null;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

interface ReviewOrderRow {
  id: string;
  tracking_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  pickup_address: string;
  dropoff_address: string;
  price_etb: number | string | null;
  status: string;
}

interface AuditRow {
  id: string;
  payment_id: string;
  action: "verified" | "rejected" | "resubmitted";
  actor_id: string | null;
  reason: string | null;
  created_at: string;
}

const filterEvent: Record<Exclude<ReviewFilter, "all">, PaymentEvent> = {
  pending: "initiated",
  rejected: "failed",
  verified: "held_escrow",
};

function money(value: number | string | null | undefined) {
  return Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function AdminPaymentReview() {
  const [payments, setPayments] = useState<PaymentReviewRow[]>([]);
  const [orders, setOrders] = useState<ReviewOrderRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [filter, setFilter] = useState<ReviewFilter>("pending");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyPayment, setBusyPayment] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const { data: paymentData, error: paymentError } = await supabase
        .from("payments")
        .select("id,order_id,provider,provider_ref,amount_etb,event,receipt_path,rejection_reason,reviewed_by,reviewed_at,created_at")
        .in("event", ["initiated", "failed", "held_escrow"])
        .order("created_at", { ascending: false });

      if (paymentError) throw paymentError;
      const nextPayments = (paymentData ?? []) as PaymentReviewRow[];
      const orderIds = [...new Set(nextPayments.map((payment) => payment.order_id))];
      const paymentIds = nextPayments.map((payment) => payment.id);

      const [orderResult, auditResult] = await Promise.all([
        orderIds.length
          ? supabase
              .from("orders")
              .select("id,tracking_id,customer_name,customer_phone,pickup_address,dropoff_address,price_etb,status")
              .in("id", orderIds)
          : Promise.resolve({ data: [], error: null }),
        paymentIds.length
          ? supabase
              .from("payment_review_audit")
              .select("id,payment_id,action,actor_id,reason,created_at")
              .in("payment_id", paymentIds)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (orderResult.error) throw orderResult.error;
      if (auditResult.error) throw auditResult.error;

      setPayments(nextPayments);
      setOrders((orderResult.data ?? []) as ReviewOrderRow[]);
      setAudit((auditResult.data ?? []) as AuditRow[]);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Payment review data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel("admin-payment-review")
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const ordersById = useMemo(() => new Map(orders.map((order) => [order.id, order])), [orders]);
  const latestAudit = useMemo(() => {
    const result = new Map<string, AuditRow>();
    for (const entry of audit) if (!result.has(entry.payment_id)) result.set(entry.payment_id, entry);
    return result;
  }, [audit]);

  const filteredPayments = filter === "all"
    ? payments
    : payments.filter((payment) => payment.event === filterEvent[filter]);

  const pending = payments.filter((payment) => payment.event === "initiated");
  const rejected = payments.filter((payment) => payment.event === "failed");
  const verified = payments.filter((payment) => payment.event === "held_escrow");

  async function review(paymentId: string, approve: boolean) {
    const reason = reasons[paymentId]?.trim() ?? "";
    if (!approve && reason.length < 5) {
      setError("Write a clear rejection reason of at least 5 characters.");
      return;
    }

    setBusyPayment(paymentId);
    setError("");
    try {
      const { error: reviewError } = await supabase.rpc("admin_review_customer_payment", {
        p_payment_id: paymentId,
        p_approve: approve,
        p_rejection_reason: approve ? null : reason,
      });
      if (reviewError) throw reviewError;
      setReasons((current) => ({ ...current, [paymentId]: "" }));
      await load();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Payment review failed.");
    } finally {
      setBusyPayment(null);
    }
  }

  async function openReceipt(path: string) {
    setError("");
    const { data, error: signedError } = await supabase.storage.from("payment-receipts").createSignedUrl(path, 300);
    if (signedError) {
      setError(signedError.message);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <main className="min-h-screen bg-[#f5f3ed] p-4 text-asphalt sm:p-7">
      <section className="mx-auto max-w-5xl">
        <header className="border border-asphalt/10 bg-asphalt p-6 text-white sm:p-8">
          <p className="font-mono text-[10px] tracking-[.22em] text-amber">FINANCE CONTROL</p>
          <h1 className="mt-3 font-display text-3xl font-bold">Customer payment review</h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/60">
            Open the customer receipt, verify valid funds or reject the submission with a reason. A driver cannot see or accept the load until the invoice is fully verified.
          </p>
        </header>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <Summary label="Pending review" value={pending.length} amount={pending.reduce((sum, row) => sum + Number(row.amount_etb || 0), 0)} />
          <Summary label="Rejected" value={rejected.length} amount={rejected.reduce((sum, row) => sum + Number(row.amount_etb || 0), 0)} />
          <Summary label="Held in escrow" value={verified.length} amount={verified.reduce((sum, row) => sum + Number(row.amount_etb || 0), 0)} />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {(["pending", "rejected", "verified", "all"] as ReviewFilter[]).map((item) => (
            <button
              type="button"
              key={item}
              onClick={() => setFilter(item)}
              className={`border px-4 py-2 text-xs font-semibold capitalize ${filter === item ? "border-asphalt bg-asphalt text-white" : "border-asphalt/15 bg-white text-steel"}`}
            >
              {item}
            </button>
          ))}
          <button type="button" onClick={() => void load()} className="ml-auto border border-amber/40 bg-white px-4 py-2 text-xs font-semibold text-amber-dim">↻ Refresh</button>
        </div>

        {error && <p className="mt-5 border border-route/35 bg-route/5 p-4 text-sm text-route">{error}</p>}

        <div className="mt-5 grid gap-4">
          {loading && <p className="border border-asphalt/10 bg-white p-8 text-center font-mono text-sm text-steel">Loading payment review queue…</p>}
          {!loading && filteredPayments.length === 0 && <p className="border border-asphalt/10 bg-white p-8 text-center text-sm text-steel">No payments in this review state.</p>}
          {filteredPayments.map((payment) => {
            const order = ordersById.get(payment.order_id);
            const lastAudit = latestAudit.get(payment.id);
            const busy = busyPayment === payment.id;
            const badge = payment.event === "initiated"
              ? "Pending review"
              : payment.event === "failed"
                ? "Rejected"
                : "Verified · held escrow";

            return (
              <article key={payment.id} className="border border-asphalt/10 bg-white p-5 sm:p-6">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-semibold">{order?.tracking_id ?? payment.order_id}</p>
                    <h2 className="mt-2 font-display text-2xl font-bold">ETB {money(payment.amount_etb)}</h2>
                    <p className="mt-2 text-sm text-steel">{order ? `${order.pickup_address} → ${order.dropoff_address}` : "Order details unavailable"}</p>
                    <p className="mt-2 text-xs text-steel">Customer: <strong className="text-asphalt">{order?.customer_name ?? "Customer"}</strong>{order?.customer_phone ? ` · ${order.customer_phone}` : ""}</p>
                    <p className="mt-1 text-xs text-steel">Invoice: ETB {money(order?.price_etb)} · Order: <span className="capitalize">{order?.status?.replace(/_/g, " ") ?? "—"}</span></p>
                  </div>
                  <span className={`self-start px-3 py-2 text-xs font-semibold ${payment.event === "initiated" ? "bg-amber/15 text-amber-dim" : payment.event === "failed" ? "bg-route/10 text-route" : "bg-emerald-100 text-emerald-800"}`}>{badge}</span>
                </div>

                <div className="mt-5 grid gap-3 border-y border-asphalt/10 py-4 text-xs sm:grid-cols-3">
                  <p><span className="block text-steel">Provider</span><strong className="mt-1 block capitalize">{payment.provider.replace(/_/g, " ")}</strong></p>
                  <p><span className="block text-steel">Transaction ID</span><strong className="mt-1 block break-all">{payment.provider_ref ?? "Not supplied"}</strong></p>
                  <p><span className="block text-steel">Submitted</span><strong className="mt-1 block">{new Date(payment.created_at).toLocaleString()}</strong></p>
                </div>

                {payment.event === "failed" && (
                  <div className="mt-4 border-l-4 border-route bg-route/5 p-4 text-sm">
                    <p className="font-semibold text-route">Rejection reason</p>
                    <p className="mt-2 whitespace-pre-wrap">{payment.rejection_reason ?? "No reason recorded"}</p>
                  </div>
                )}

                {lastAudit && (
                  <p className="mt-4 text-[11px] text-steel">
                    Audit: <span className="font-semibold capitalize text-asphalt">{lastAudit.action}</span> · {new Date(lastAudit.created_at).toLocaleString()}{lastAudit.actor_id ? ` · reviewer ${lastAudit.actor_id.slice(0, 8)}` : ""}
                  </p>
                )}

                <div className="mt-5 flex flex-wrap gap-3">
                  {payment.receipt_path
                    ? <button type="button" onClick={() => void openReceipt(payment.receipt_path!)} className="border border-emerald-700 px-4 py-3 text-sm font-semibold text-emerald-800">Open receipt</button>
                    : <span className="border border-route/30 bg-route/5 px-4 py-3 text-sm text-route">Receipt missing</span>}
                  {payment.event === "initiated" && (
                    <button type="button" disabled={busy || !payment.receipt_path} onClick={() => void review(payment.id, true)} className="bg-emerald-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">
                      {busy ? "Saving…" : "Verify payment"}
                    </button>
                  )}
                </div>

                {payment.event === "initiated" && (
                  <div className="mt-4 border border-route/25 bg-route/5 p-4">
                    <label className="text-xs font-semibold text-asphalt">Reason required when rejecting
                      <textarea
                        value={reasons[payment.id] ?? ""}
                        onChange={(event) => setReasons((current) => ({ ...current, [payment.id]: event.target.value }))}
                        rows={3}
                        maxLength={500}
                        placeholder="Example: transaction amount does not match the receipt."
                        className="mt-2 block w-full border border-asphalt/15 bg-white p-3 text-sm font-normal outline-none focus:border-route"
                      />
                    </label>
                    <button type="button" disabled={busy || (reasons[payment.id]?.trim().length ?? 0) < 5} onClick={() => void review(payment.id, false)} className="mt-3 border border-route bg-white px-5 py-3 text-sm font-semibold text-route disabled:opacity-40">
                      {busy ? "Saving…" : "Reject payment"}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function Summary({ label, value, amount }: { label: string; value: number; amount: number }) {
  return (
    <div className="border border-asphalt/10 bg-white p-4 sm:p-5">
      <p className="font-mono text-[9px] uppercase tracking-wide text-steel">{label}</p>
      <p className="mt-3 font-display text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-steel">ETB {money(amount)}</p>
    </div>
  );
}
