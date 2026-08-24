import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase.client";

type ReviewFilter = "pending" | "rejected" | "escrow" | "released" | "all";
type PaymentEvent = "initiated" | "failed" | "held_escrow" | "released";

type PaymentPayload = {
  source?: string;
  collection_method?: string;
  collected_by?: string;
  direct_to_driver?: boolean;
  note?: string;
  tracking_id?: string;
  payment_terms?: string;
};

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
  raw_payload: PaymentPayload | null;
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
  driver_id: string | null;
}

interface DriverRow {
  id: string;
  full_name: string | null;
  phone: string | null;
}

interface AuditRow {
  id: string;
  payment_id: string;
  action: "verified" | "rejected" | "resubmitted";
  actor_id: string | null;
  reason: string | null;
  created_at: string;
}

function money(value: number | string | null | undefined) {
  return Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function isDriverCollection(payment: PaymentReviewRow) {
  return payment.raw_payload?.source === "driver_collection";
}

function isCashCollection(payment: PaymentReviewRow) {
  return isDriverCollection(payment) && payment.raw_payload?.collection_method === "cash";
}

export function AdminPaymentReview() {
  const [payments, setPayments] = useState<PaymentReviewRow[]>([]);
  const [orders, setOrders] = useState<ReviewOrderRow[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
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
        .select("id,order_id,provider,provider_ref,amount_etb,event,receipt_path,rejection_reason,reviewed_by,reviewed_at,raw_payload,created_at")
        .in("event", ["initiated", "failed", "held_escrow", "released"])
        .order("created_at", { ascending: false })
        .limit(1000);

      if (paymentError) throw paymentError;
      const nextPayments = (paymentData ?? []) as PaymentReviewRow[];
      const orderIds = [...new Set(nextPayments.map((payment) => payment.order_id))];
      const paymentIds = nextPayments.map((payment) => payment.id);

      const orderResult = orderIds.length
        ? await supabase
            .from("orders")
            .select("id,tracking_id,customer_name,customer_phone,pickup_address,dropoff_address,price_etb,status,driver_id")
            .in("id", orderIds)
        : { data: [], error: null };

      if (orderResult.error) throw orderResult.error;
      const nextOrders = (orderResult.data ?? []) as ReviewOrderRow[];
      const driverIds = [...new Set(nextOrders.map((order) => order.driver_id).filter((value): value is string => Boolean(value)))];

      const [driverResult, auditResult] = await Promise.all([
        driverIds.length
          ? supabase.from("profiles").select("id,full_name,phone").in("id", driverIds)
          : Promise.resolve({ data: [], error: null }),
        paymentIds.length
          ? supabase
              .from("payment_review_audit")
              .select("id,payment_id,action,actor_id,reason,created_at")
              .in("payment_id", paymentIds)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (driverResult.error) throw driverResult.error;
      if (auditResult.error) throw auditResult.error;

      setPayments(nextPayments);
      setOrders(nextOrders);
      setDrivers((driverResult.data ?? []) as DriverRow[]);
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
  const driversById = useMemo(() => new Map(drivers.map((driver) => [driver.id, driver])), [drivers]);
  const latestAudit = useMemo(() => {
    const result = new Map<string, AuditRow>();
    for (const entry of audit) if (!result.has(entry.payment_id)) result.set(entry.payment_id, entry);
    return result;
  }, [audit]);

  const filteredPayments = payments.filter((payment) => {
    if (filter === "all") return true;
    if (filter === "pending") return payment.event === "initiated";
    if (filter === "rejected") return payment.event === "failed";
    if (filter === "escrow") return payment.event === "held_escrow";
    return payment.event === "released";
  });

  const pending = payments.filter((payment) => payment.event === "initiated");
  const rejected = payments.filter((payment) => payment.event === "failed");
  const escrow = payments.filter((payment) => payment.event === "held_escrow");
  const released = payments.filter((payment) => payment.event === "released");

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
            Cash reports are verified from the driver declaration. Bank and mobile-money reports require a receipt and transaction reference. Escrow and released funds are shown separately.
          </p>
        </header>

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Summary label="Pending review" value={pending.length} amount={pending.reduce((sum, row) => sum + Number(row.amount_etb || 0), 0)} />
          <Summary label="Rejected" value={rejected.length} amount={rejected.reduce((sum, row) => sum + Number(row.amount_etb || 0), 0)} />
          <Summary label="Held in escrow" value={escrow.length} amount={escrow.reduce((sum, row) => sum + Number(row.amount_etb || 0), 0)} />
          <Summary label="Released" value={released.length} amount={released.reduce((sum, row) => sum + Number(row.amount_etb || 0), 0)} />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {(["pending", "rejected", "escrow", "released", "all"] as ReviewFilter[]).map((item) => (
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
            const driver = order?.driver_id ? driversById.get(order.driver_id) : null;
            const lastAudit = latestAudit.get(payment.id);
            const busy = busyPayment === payment.id;
            const driverCollected = isDriverCollection(payment);
            const cashCollection = isCashCollection(payment);
            const collectionMethod = payment.raw_payload?.collection_method?.replace(/_/g, " ") ?? "payment";
            const evidenceRequired = !cashCollection;
            const canApprove = !evidenceRequired || Boolean(payment.receipt_path);
            const badge = payment.event === "initiated"
              ? "Pending review"
              : payment.event === "failed"
                ? "Rejected"
                : payment.event === "released"
                  ? driverCollected ? "Verified · driver received" : "Released"
                  : "Verified · held escrow";
            const badgeClass = payment.event === "initiated"
              ? "bg-amber/15 text-amber-dim"
              : payment.event === "failed"
                ? "bg-route/10 text-route"
                : "bg-emerald-100 text-emerald-800";

            return (
              <article key={payment.id} className={`border bg-white p-5 sm:p-6 ${driverCollected ? "border-amber/45" : "border-asphalt/10"}`}>
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-mono text-xs font-semibold">{order?.tracking_id ?? payment.order_id}</p>
                      {driverCollected && <span className="bg-asphalt px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-amber">Driver collected · {collectionMethod}</span>}
                    </div>
                    <h2 className="mt-2 font-display text-2xl font-bold">ETB {money(payment.amount_etb)}</h2>
                    <p className="mt-2 text-sm text-steel">{order ? `${order.pickup_address} → ${order.dropoff_address}` : "Order details unavailable"}</p>
                    <p className="mt-2 text-xs text-steel">Customer: <strong className="text-asphalt">{order?.customer_name ?? "Customer"}</strong>{order?.customer_phone ? ` · ${order.customer_phone}` : ""}</p>
                    <p className="mt-1 text-xs text-steel">Driver: <strong className="text-asphalt">{driver?.full_name ?? driver?.phone ?? (order?.driver_id ? "Driver profile unavailable" : "Unassigned")}</strong></p>
                    <p className="mt-1 text-xs text-steel">Invoice: ETB {money(order?.price_etb)} · Order: <span className="capitalize">{order?.status?.replace(/_/g, " ") ?? "—"}</span></p>
                  </div>
                  <span className={`self-start px-3 py-2 text-xs font-semibold ${badgeClass}`}>{badge}</span>
                </div>

                {driverCollected && (
                  <div className="mt-5 border border-amber/35 bg-amber/10 p-4 text-sm">
                    <p className="font-semibold text-asphalt">Direct-to-driver collection report</p>
                    <p className="mt-2 text-xs leading-5 text-steel">
                      The driver reported receiving the full invoice by <strong className="capitalize text-asphalt">{collectionMethod}</strong>. Admin verification releases the ledger amount and creates the 2% HALLO Smart commission charge.
                    </p>
                    {cashCollection && <p className="mt-3 border-l-4 border-emerald-600 bg-white/70 p-3 text-xs text-emerald-800"><strong>Cash declaration:</strong> no receipt file is required. Verify only when the driver declaration and order details are correct.</p>}
                    {payment.raw_payload?.note && <p className="mt-3 border-l-4 border-amber bg-white/70 p-3 text-xs"><strong>Driver note:</strong> {payment.raw_payload.note}</p>}
                  </div>
                )}

                <div className="mt-5 grid gap-3 border-y border-asphalt/10 py-4 text-xs sm:grid-cols-3">
                  <p><span className="block text-steel">Provider</span><strong className="mt-1 block capitalize">{payment.provider.replace(/_/g, " ")}</strong></p>
                  <p><span className="block text-steel">Transaction ID</span><strong className="mt-1 block break-all">{payment.provider_ref ?? (cashCollection ? "Cash · no bank reference" : "Not supplied")}</strong></p>
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
                    ? <button type="button" onClick={() => void openReceipt(payment.receipt_path!)} className="border border-emerald-700 px-4 py-3 text-sm font-semibold text-emerald-800">Open payment evidence</button>
                    : cashCollection
                      ? <span className="border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">Cash declaration · no file required</span>
                      : <span className="border border-route/30 bg-route/5 px-4 py-3 text-sm text-route">Evidence required</span>}
                  {payment.event === "initiated" && (
                    <button type="button" disabled={busy || !canApprove} onClick={() => void review(payment.id, true)} className="bg-emerald-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">
                      {busy ? "Saving…" : cashCollection ? "Verify cash received" : driverCollected ? "Verify received money" : "Verify payment"}
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
                        placeholder={cashCollection ? "Example: driver declaration does not match the order or customer confirmation." : "Example: receipt is unclear or transaction amount does not match."}
                        className="mt-2 block w-full border border-asphalt/15 bg-white p-3 text-sm font-normal outline-none focus:border-route"
                      />
                    </label>
                    <button type="button" disabled={busy || (reasons[payment.id]?.trim().length ?? 0) < 5} onClick={() => void review(payment.id, false)} className="mt-3 border border-route bg-white px-5 py-3 text-sm font-semibold text-route disabled:opacity-40">
                      {busy ? "Saving…" : cashCollection ? "Reject cash report" : "Reject payment evidence"}
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
