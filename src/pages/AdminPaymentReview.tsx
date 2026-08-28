import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  getPaymentLedgerIndicators,
  getPaymentLedgerPage,
  isLegacyCompletedLedgerPayment,
  matchesPaymentLedgerDate,
  matchesPaymentLedgerSearch,
  matchesPaymentLedgerStatus,
  type PaymentLedgerDateFilter,
  type PaymentLedgerEvent,
  type PaymentLedgerStatusFilter,
} from "../domain/payment-ledger";
import { supabase } from "../services/supabase.client";

type PaymentPayload = {
  source?: string;
  collection_method?: string;
  collected_by?: string;
  direct_to_driver?: boolean;
  note?: string;
  tracking_id?: string;
  payment_terms?: string;
  legacy_completed?: boolean;
};

export interface PaymentReviewRow {
  id: string;
  order_id: string;
  provider: string;
  provider_ref: string | null;
  amount_etb: number | string;
  event: PaymentLedgerEvent;
  receipt_path: string | null;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  raw_payload: PaymentPayload | null;
  created_at: string;
}

export interface ReviewOrderRow {
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

export interface DriverRow {
  id: string;
  full_name: string | null;
  phone: string | null;
}

export interface AuditRow {
  id: string;
  payment_id: string;
  action: "verified" | "rejected" | "resubmitted";
  actor_id: string | null;
  reason: string | null;
  created_at: string;
}

export interface DriverConfirmationEventRow {
  id: string;
  order_id: string;
  assigned_driver_id: string;
  payment_id: string;
  confirmation_type: "payment_confirmed" | "payment_not_received";
  confirmed_amount_etb: number | string;
  provider: string;
  provider_ref: string | null;
  reason: string | null;
  confirmed_at: string;
  actor_id: string;
}

const PAGE_SIZE = 12;
const QUERY_BATCH_SIZE = 100;

export interface AdminPaymentReviewFixture {
  payments: PaymentReviewRow[];
  orders: ReviewOrderRow[];
  drivers: DriverRow[];
  audit: AuditRow[];
  confirmations?: DriverConfirmationEventRow[];
}

function amount(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number | string | null | undefined) {
  return amount(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function batches<T>(values: T[]) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += QUERY_BATCH_SIZE) {
    result.push(values.slice(index, index + QUERY_BATCH_SIZE));
  }
  return result;
}

function isDriverCollection(payment: PaymentReviewRow) {
  return payment.raw_payload?.source === "driver_collection";
}

function isCashCollection(payment: PaymentReviewRow) {
  return isDriverCollection(payment) && payment.raw_payload?.collection_method === "cash";
}

function initialHashQuery() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("q") ?? "";
}

export function AdminPaymentReview({ fixture }: { fixture?: AdminPaymentReviewFixture } = {}) {
  const [payments, setPayments] = useState<PaymentReviewRow[]>(fixture?.payments ?? []);
  const [orders, setOrders] = useState<ReviewOrderRow[]>(fixture?.orders ?? []);
  const [drivers, setDrivers] = useState<DriverRow[]>(fixture?.drivers ?? []);
  const [audit, setAudit] = useState<AuditRow[]>(fixture?.audit ?? []);
  const [confirmations, setConfirmations] = useState<DriverConfirmationEventRow[]>(fixture?.confirmations ?? []);
  const [filter, setFilter] = useState<PaymentLedgerStatusFilter>("all");
  const [provider, setProvider] = useState("all");
  const [dateFilter, setDateFilter] = useState<PaymentLedgerDateFilter>("all");
  const [query, setQuery] = useState(initialHashQuery);
  const [page, setPage] = useState(1);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyPayment, setBusyPayment] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(!fixture);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (fixture) {
      setPayments(fixture.payments);
      setOrders(fixture.orders);
      setDrivers(fixture.drivers);
      setAudit(fixture.audit);
      setConfirmations(fixture.confirmations ?? []);
      setLoading(false);
      setError("");
      return;
    }

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
      const orderResults = await Promise.all(batches(orderIds).map((ids) => supabase
        .from("orders")
        .select("id,tracking_id,customer_name,customer_phone,pickup_address,dropoff_address,price_etb,status,driver_id")
        .in("id", ids)));
      for (const result of orderResults) if (result.error) throw result.error;

      const nextOrders = orderResults.flatMap((result) => (result.data ?? []) as ReviewOrderRow[]);
      const driverIds = [...new Set(nextOrders.map((order) => order.driver_id).filter((value): value is string => Boolean(value)))];
      const [driverResults, auditResults, confirmationResults] = await Promise.all([
        Promise.all(batches(driverIds).map((ids) => supabase.from("profiles").select("id,full_name,phone").in("id", ids))),
        Promise.all(batches(paymentIds).map((ids) => supabase.from("payment_review_audit").select("id,payment_id,action,actor_id,reason,created_at").in("payment_id", ids).order("created_at", { ascending: false }))),
        Promise.all(batches(paymentIds).map((ids) => supabase.from("driver_payment_confirmation_events").select("id,order_id,assigned_driver_id,payment_id,confirmation_type,confirmed_amount_etb,provider,provider_ref,reason,confirmed_at,actor_id").in("payment_id", ids).order("confirmed_at", { ascending: false }))),
      ]);
      for (const result of driverResults) if (result.error) throw result.error;
      for (const result of auditResults) if (result.error) throw result.error;
      for (const result of confirmationResults) if (result.error) throw result.error;

      setPayments(nextPayments);
      setOrders(nextOrders);
      setDrivers(driverResults.flatMap((result) => (result.data ?? []) as DriverRow[]));
      setAudit(auditResults.flatMap((result) => (result.data ?? []) as AuditRow[]));
      setConfirmations(confirmationResults.flatMap((result) => (result.data ?? []) as DriverConfirmationEventRow[]));
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Payment ledger could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [fixture]);

  useEffect(() => {
    void load();
    if (fixture) return;
    const channel = supabase.channel("admin-payment-review")
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => void load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "driver_payment_confirmation_events" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [fixture, load]);

  const ordersById = useMemo(() => new Map(orders.map((order) => [order.id, order])), [orders]);
  const driversById = useMemo(() => new Map(drivers.map((driver) => [driver.id, driver])), [drivers]);
  const auditByPayment = useMemo(() => {
    const result = new Map<string, AuditRow[]>();
    for (const entry of audit) {
      const entries = result.get(entry.payment_id) ?? [];
      entries.push(entry);
      result.set(entry.payment_id, entries);
    }
    return result;
  }, [audit]);
  const confirmationsByPayment = useMemo(() => {
    const result = new Map<string, DriverConfirmationEventRow[]>();
    for (const entry of confirmations) {
      const entries = result.get(entry.payment_id) ?? [];
      entries.push(entry);
      result.set(entry.payment_id, entries);
    }
    return result;
  }, [confirmations]);

  const providerOptions = useMemo(() => [...new Set(payments.map((payment) => payment.provider.trim()).filter(Boolean))].sort(), [payments]);
  const totals = useMemo(() => ({
    pending: payments.filter((payment) => payment.event === "initiated"),
    rejected: payments.filter((payment) => payment.event === "failed"),
    escrow: payments.filter((payment) => payment.event === "held_escrow"),
    released: payments.filter((payment) => payment.event === "released"),
  }), [payments]);

  const filteredPayments = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return payments.filter((payment) => {
      const order = ordersById.get(payment.order_id);
      const driver = order?.driver_id ? driversById.get(order.driver_id) : null;
      return matchesPaymentLedgerStatus(payment.event, filter)
        && (provider === "all" || payment.provider.trim() === provider)
        && matchesPaymentLedgerDate(payment.created_at, dateFilter)
        && matchesPaymentLedgerSearch({
          provider: payment.provider,
          transactionId: payment.provider_ref,
          trackingId: order?.tracking_id,
          customerName: order?.customer_name,
          customerPhone: order?.customer_phone,
          pickupAddress: order?.pickup_address,
          dropoffAddress: order?.dropoff_address,
          driverName: driver?.full_name,
          driverPhone: driver?.phone,
        }, normalized);
    });
  }, [payments, ordersById, driversById, filter, provider, dateFilter, query]);

  useEffect(() => { setPage(1); }, [filter, provider, dateFilter, query]);
  const pagination = getPaymentLedgerPage(filteredPayments.length, page, PAGE_SIZE);
  const visiblePayments = filteredPayments.slice(pagination.startIndex, pagination.endIndex);

  useEffect(() => {
    if (page !== pagination.page) setPage(pagination.page);
  }, [page, pagination.page]);

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

  async function release(paymentId: string) {
    setBusyPayment(paymentId);
    setError("");
    try {
      const { error: releaseError } = await supabase.rpc("admin_release_confirmed_driver_payment", {
        p_payment_id: paymentId,
      });
      if (releaseError) throw releaseError;
      await load();
    } catch (releaseError) {
      setError(releaseError instanceof Error ? releaseError.message : "Escrow release failed.");
    } finally {
      setBusyPayment(null);
    }
  }

  async function openReceipt(path: string) {
    setError("");
    const { data, error: signedError } = await supabase.storage.from("payment-receipts").createSignedUrl(path, 300);
    if (signedError) { setError(signedError.message); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return <main className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#f5f3ed] p-3 text-asphalt sm:p-7">
    <section className="mx-auto w-full min-w-0 max-w-6xl">
      <header className="min-w-0 border border-asphalt/10 bg-asphalt p-4 text-white min-[360px]:p-5 sm:p-8">
        <p className="font-mono text-[10px] tracking-[.22em] text-amber">FINANCE CONTROL</p>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0"><h1 className="break-words font-display text-[clamp(1.75rem,9vw,2.25rem)] font-bold leading-tight">Payment ledger</h1><p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/60">Search, filter, audit and release customer payments only after the database-assigned Driver confirms them.</p></div>
          <button type="button" onClick={() => void load()} className="w-full border border-white/20 px-4 py-3 text-sm font-semibold min-[360px]:w-auto lg:self-start">↻ Refresh ledger</button>
        </div>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Summary label="Pending review" rows={totals.pending} tone="warning" />
        <Summary label="Held in escrow" rows={totals.escrow} tone="warning" />
        <Summary label="Released" rows={totals.released} tone="good" />
        <Summary label="Rejected / failed" rows={totals.rejected} tone="critical" />
      </div>

      <section className="mt-4 min-w-0 border border-asphalt/10 bg-white p-3 min-[360px]:p-4">
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 md:grid-cols-4">
          <label className="min-w-0 sm:col-span-2"><span className="text-[10px] font-semibold uppercase tracking-wide text-steel">Search ledger</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tracking, customer, driver, phone, route, transaction…" className="mt-2 block w-full min-w-0 max-w-full border border-asphalt/15 px-3 py-3 text-sm outline-none focus:border-amber" /></label>
          <label className="min-w-0"><span className="text-[10px] font-semibold uppercase tracking-wide text-steel">Provider</span><select value={provider} onChange={(event) => setProvider(event.target.value)} className="mt-2 block w-full min-w-0 max-w-full border border-asphalt/15 bg-white px-3 py-3 text-sm"><option value="all">All providers</option>{providerOptions.map((item) => <option key={item} value={item}>{item.replace(/_/g, " ")}</option>)}</select></label>
          <label className="min-w-0"><span className="text-[10px] font-semibold uppercase tracking-wide text-steel">Date</span><select value={dateFilter} onChange={(event) => setDateFilter(event.target.value as PaymentLedgerDateFilter)} className="mt-2 block w-full min-w-0 max-w-full border border-asphalt/15 bg-white px-3 py-3 text-sm"><option value="all">All dates</option><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select></label>
        </div>
        <div className="mt-4 flex min-w-0 flex-wrap gap-2" aria-label="Payment status filter">{(["all", "pending", "escrow", "released", "rejected"] as PaymentLedgerStatusFilter[]).map((item) => <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)} className={`min-w-[5.25rem] flex-1 whitespace-normal border px-3 py-2 text-xs font-semibold capitalize min-[412px]:flex-none ${filter === item ? "border-asphalt bg-asphalt text-white" : "border-asphalt/15 bg-white text-steel"}`}>{item}</button>)}</div>
      </section>

      {error && <p className="mt-4 border border-route/35 bg-route/5 p-4 text-sm text-route">{error}</p>}

      <div className="mt-4 grid gap-3">
        {loading && <p className="border border-asphalt/10 bg-white p-8 text-center font-mono text-sm text-steel">Loading payment ledger…</p>}
        {!loading && visiblePayments.length === 0 && <p className="border border-asphalt/10 bg-white p-8 text-center text-sm text-steel">No payments match these filters.</p>}
        {visiblePayments.map((payment) => {
          const order = ordersById.get(payment.order_id);
          const driver = order?.driver_id ? driversById.get(order.driver_id) : null;
          const cashCollection = isCashCollection(payment);
          const driverCollected = isDriverCollection(payment);
          const legacy = isLegacyCompletedLedgerPayment(payment.event, payment.raw_payload?.legacy_completed);
          const evidenceRequired = !driverCollected && !legacy;
          const canApprove = !evidenceRequired || Boolean(payment.receipt_path);
          const invoice = amount(order?.price_etb);
          const indicators = getPaymentLedgerIndicators({
            invoiceTotal: order?.price_etb,
            paymentAmount: payment.amount_etb,
            hasOrder: Boolean(order),
            hasReceipt: Boolean(payment.receipt_path),
            evidenceRequired,
          });
          const isOpen = expanded === payment.id;
          const busy = busyPayment === payment.id;
          const auditEntries = auditByPayment.get(payment.id) ?? [];
          const confirmationEntries = confirmationsByPayment.get(payment.id) ?? [];
          const positiveConfirmation = confirmationEntries.find((entry) => entry.confirmation_type === "payment_confirmed");
          const negativeConfirmation = confirmationEntries.find((entry) => entry.confirmation_type === "payment_not_received");
          const canRelease = payment.event === "held_escrow" && order?.status === "delivered" && Boolean(positiveConfirmation);
          const detailsId = `payment-details-${payment.id}`;
          return <article key={payment.id} className="w-full min-w-0 max-w-full overflow-hidden border border-asphalt/10 bg-white">
            <div className="grid min-w-0 gap-4 p-4 sm:p-5 lg:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-xl font-bold">ETB {money(payment.amount_etb)}</h2><StatusBadge event={payment.event} legacy={legacy} driverCollected={driverCollected} /></div>
                <p className="mt-2 break-all font-mono text-xs font-semibold">{order?.tracking_id ?? payment.order_id}</p>
                <p className="mt-2 text-sm text-steel [overflow-wrap:anywhere]">{order ? `${order.pickup_address} → ${order.dropoff_address}` : "Order details unavailable"}</p>
                <div className="mt-3 grid min-w-0 gap-1 text-xs text-steel sm:grid-cols-2">
                  <p className="min-w-0 [overflow-wrap:anywhere]">Customer: <strong className="text-asphalt">{order?.customer_name ?? "Customer"}</strong>{order?.customer_phone ? ` · ${order.customer_phone}` : ""}</p>
                  <p className="min-w-0 [overflow-wrap:anywhere]">Driver: <strong className="text-asphalt">{driver?.full_name ?? driver?.phone ?? "Unassigned"}</strong></p>
                  <p className="min-w-0 [overflow-wrap:anywhere]">Provider: <strong className="capitalize text-asphalt">{payment.provider.replace(/_/g, " ")}</strong></p>
                  <p className="min-w-0 [overflow-wrap:anywhere]">Submitted: <strong className="text-asphalt">{new Date(payment.created_at).toLocaleString()}</strong></p>
                </div>
                <div className="mt-3 flex min-w-0 flex-wrap gap-2 text-[10px] font-semibold uppercase">
                  <Indicator tone="neutral">Invoice ETB {money(invoice)}</Indicator>
                  {indicators.invoiceMismatch && <Indicator tone="critical">Invoice mismatch</Indicator>}
                  {indicators.overpaymentEtb > 0 && <Indicator tone="warning">Overpayment ETB {money(indicators.overpaymentEtb)}</Indicator>}
                  {indicators.underpaymentEtb > 0 && <Indicator tone="critical">Underpayment ETB {money(indicators.underpaymentEtb)}</Indicator>}
                  {indicators.missingReceipt && <Indicator tone="critical">Missing receipt</Indicator>}
                  {driverCollected && <Indicator tone="good">Driver report · receipt exempt</Indicator>}
                  {legacy && <Indicator tone="good">Receipt exempt · legacy completed</Indicator>}
                </div>
              </div>
              <div className="grid w-full min-w-0 grid-cols-1 items-start gap-2 min-[360px]:grid-cols-2 lg:flex lg:w-auto lg:max-w-[240px] lg:flex-wrap lg:justify-end">
                <button type="button" aria-expanded={isOpen} aria-controls={detailsId} onClick={() => setExpanded(isOpen ? null : payment.id)} className="min-w-0 whitespace-normal border border-asphalt/15 px-3 py-2 text-xs font-semibold">{isOpen ? "Hide details" : "View details"}</button>
                {payment.receipt_path && <button type="button" onClick={() => void openReceipt(payment.receipt_path!)} className="min-w-0 whitespace-normal border border-emerald-700 px-3 py-2 text-xs font-semibold text-emerald-800">Open receipt</button>}
                {canRelease && <button type="button" disabled={busy} onClick={() => void release(payment.id)} className="min-w-0 whitespace-normal bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{busy ? "Releasing…" : `Release ETB ${money(payment.amount_etb)}`}</button>}
              </div>
            </div>

            {payment.event === "held_escrow" && <DriverConfirmationStatus positive={positiveConfirmation} negative={negativeConfirmation} />}

            {isOpen && <div id={detailsId} className="min-w-0 border-t border-asphalt/10 bg-[#faf9f5] p-4 sm:p-5">
              <div className="grid gap-3 text-xs sm:grid-cols-3"><Info label="Transaction ID" value={payment.provider_ref ?? (cashCollection ? "Cash · no bank reference" : "Not supplied")} mono /><Info label="Order status" value={order?.status?.replace(/_/g, " ") ?? "—"} /><Info label="Reviewed" value={payment.reviewed_at ? new Date(payment.reviewed_at).toLocaleString() : "Not reviewed"} /></div>
              {payment.raw_payload?.note && <p className="mt-4 border-l-4 border-amber bg-white p-3 text-xs [overflow-wrap:anywhere]"><strong>Driver note:</strong> {payment.raw_payload.note}</p>}
              {payment.event === "failed" && <p className="mt-4 border-l-4 border-route bg-route/5 p-3 text-xs [overflow-wrap:anywhere]"><strong>Rejection reason:</strong> {payment.rejection_reason ?? "No reason recorded"}</p>}
              <AuditHistory entries={auditEntries} />
              <ConfirmationHistory entries={confirmationEntries} />
              {legacy && <p className="mt-4 border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"><strong>Legacy completed:</strong> historical released payment; receipt warning is suppressed.</p>}
              {payment.event === "initiated" && <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto]"><label className="min-w-0 text-xs font-semibold">Rejection reason<textarea value={reasons[payment.id] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [payment.id]: event.target.value }))} rows={3} maxLength={500} placeholder="Explain mismatch, unclear transaction, duplicate reference or fraud concern." className="mt-2 block w-full min-w-0 max-w-full border border-asphalt/15 bg-white p-3 text-sm font-normal outline-none focus:border-route" /></label><div className="flex min-w-0 flex-col items-stretch gap-2 min-[360px]:flex-row min-[360px]:flex-wrap lg:items-end"><button type="button" disabled={busy || !canApprove} onClick={() => void review(payment.id, true)} className="w-full min-w-0 whitespace-normal bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40 min-[360px]:w-auto">{busy ? "Saving…" : cashCollection ? "Verify cash" : "Verify payment"}</button><button type="button" disabled={busy || (reasons[payment.id]?.trim().length ?? 0) < 5} onClick={() => void review(payment.id, false)} className="w-full min-w-0 whitespace-normal border border-route bg-white px-4 py-3 text-sm font-semibold text-route disabled:opacity-40 min-[360px]:w-auto">Reject</button></div></div>}
            </div>}
          </article>;
        })}
      </div>

      {!loading && filteredPayments.length > 0 && <nav aria-label="Payment ledger pagination" className="mt-4 flex min-w-0 flex-col gap-3 border border-asphalt/10 bg-white p-4 text-sm sm:flex-row sm:items-center sm:justify-between"><p className="text-steel">Showing {pagination.startIndex + 1}–{pagination.endIndex} of {filteredPayments.length}</p><div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2"><button type="button" disabled={pagination.page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="min-w-0 whitespace-normal border border-asphalt/15 px-3 py-2 font-semibold disabled:opacity-30 min-[360px]:px-4">Previous</button><span className="whitespace-nowrap px-1 py-2 text-center min-[360px]:px-3">{pagination.page} / {pagination.pageCount}</span><button type="button" disabled={pagination.page === pagination.pageCount} onClick={() => setPage((value) => Math.min(pagination.pageCount, value + 1))} className="min-w-0 whitespace-normal border border-asphalt/15 px-3 py-2 font-semibold disabled:opacity-30 min-[360px]:px-4">Next</button></div></nav>}
    </section>
  </main>;
}

function DriverConfirmationStatus({ positive, negative }: { positive?: DriverConfirmationEventRow; negative?: DriverConfirmationEventRow }) {
  if (positive) {
    return <div className="border-t border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 sm:px-5"><strong>Assigned driver confirmed payment.</strong><span className="mt-1 block text-xs">Confirmed ETB {money(positive.confirmed_amount_etb)} on {new Date(positive.confirmed_at).toLocaleString()}. Admin/CEO may release escrow.</span></div>;
  }
  if (negative) {
    return <div className="border-t border-route/20 bg-route/5 px-4 py-3 text-sm text-route sm:px-5"><strong>Assigned driver reported payment not received / not confirmed.</strong><span className="mt-1 block text-xs text-asphalt">{negative.reason ?? "No reason recorded"} · Escrow remains locked.</span></div>;
  }
  return <div className="border-t border-amber/30 bg-amber/10 px-4 py-3 text-sm text-asphalt sm:px-5"><strong>Assigned driver confirmation is required before releasing this payment.</strong></div>;
}

function Summary({ label, rows, tone }: { label: string; rows: PaymentReviewRow[]; tone: "good" | "warning" | "critical" }) {
  const border = tone === "good" ? "border-emerald-600/50" : tone === "critical" ? "border-route/40" : "border-amber/50";
  return <div className={`min-w-0 border bg-white p-4 ${border}`}><p className="break-words font-mono text-[9px] uppercase tracking-wide text-steel">{label}</p><p className="mt-3 font-display text-2xl font-bold">{rows.length}</p><p className="mt-1 break-words text-xs text-steel">ETB {money(rows.reduce((sum, row) => sum + amount(row.amount_etb), 0))}</p></div>;
}

function StatusBadge({ event, legacy, driverCollected }: { event: PaymentLedgerEvent; legacy: boolean; driverCollected: boolean }) {
  if (legacy) return <span className="bg-emerald-50 px-2.5 py-1.5 text-[10px] font-semibold uppercase text-emerald-800">Legacy completed</span>;
  const label = event === "initiated" ? "Pending review" : event === "failed" ? "Rejected" : event === "held_escrow" ? "Held escrow" : driverCollected ? "Released · driver" : "Released";
  const cls = event === "failed" ? "bg-route/10 text-route" : event === "initiated" || event === "held_escrow" ? "bg-amber/15 text-amber-dim" : "bg-emerald-50 text-emerald-800";
  return <span className={`break-words px-2.5 py-1.5 text-[10px] font-semibold uppercase ${cls}`}>{label}</span>;
}

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <p className="min-w-0"><span className="block text-steel">{label}</span><strong className={`mt-1 block break-all capitalize text-asphalt ${mono ? "font-mono" : ""}`}>{value}</strong></p>;
}

function Indicator({ children, tone }: { children: ReactNode; tone: "neutral" | "good" | "warning" | "critical" }) {
  const colors = tone === "good"
    ? "bg-emerald-50 text-emerald-800"
    : tone === "warning"
      ? "bg-amber/15 text-amber-dim"
      : tone === "critical"
        ? "bg-route/10 text-route"
        : "bg-[#f5f3ed] text-asphalt";
  return <span className={`max-w-full px-2.5 py-1.5 [overflow-wrap:anywhere] ${colors}`}>{children}</span>;
}

function AuditHistory({ entries }: { entries: AuditRow[] }) {
  return <section className="mt-4 min-w-0 border border-asphalt/10 bg-white p-3" aria-label="Payment audit history">
    <h3 className="text-[10px] font-semibold uppercase tracking-wide text-steel">Payment review audit</h3>
    {entries.length === 0
      ? <p className="mt-2 text-[11px] text-steel">No review action recorded yet.</p>
      : <ol className="mt-2 grid min-w-0 gap-2">{entries.map((entry) => <li key={entry.id} className="min-w-0 border-l-2 border-asphalt/15 pl-3 text-[11px] text-steel [overflow-wrap:anywhere]"><strong className="capitalize text-asphalt">{entry.action}</strong> · {new Date(entry.created_at).toLocaleString()}{entry.actor_id ? ` · reviewer ${entry.actor_id.slice(0, 8)}` : ""}{entry.reason ? <span className="mt-1 block text-asphalt">{entry.reason}</span> : null}</li>)}</ol>}
  </section>;
}

function ConfirmationHistory({ entries }: { entries: DriverConfirmationEventRow[] }) {
  return <section className="mt-4 min-w-0 border border-asphalt/10 bg-white p-3" aria-label="Assigned driver confirmation history">
    <h3 className="text-[10px] font-semibold uppercase tracking-wide text-steel">Assigned driver confirmation history</h3>
    {entries.length === 0
      ? <p className="mt-2 text-[11px] text-steel">No assigned-driver confirmation recorded.</p>
      : <ol className="mt-2 grid min-w-0 gap-2">{entries.map((entry) => <li key={entry.id} className="min-w-0 border-l-2 border-asphalt/15 pl-3 text-[11px] text-steel [overflow-wrap:anywhere]"><strong className="text-asphalt">{entry.confirmation_type === "payment_confirmed" ? "Payment confirmed" : "Payment not received / not confirmed"}</strong> · {new Date(entry.confirmed_at).toLocaleString()} · actor {entry.actor_id.slice(0, 8)}{entry.reason ? <span className="mt-1 block text-asphalt">{entry.reason}</span> : null}</li>)}</ol>}
  </section>;
}
