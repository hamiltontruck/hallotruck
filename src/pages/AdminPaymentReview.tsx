import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase.client";

type ReviewFilter = "pending" | "rejected" | "escrow" | "released" | "all";
type PaymentEvent = "initiated" | "failed" | "held_escrow" | "released";
type DateFilter = "all" | "today" | "7d" | "30d";

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

const PAGE_SIZE = 12;

function amount(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number | string | null | undefined) {
  return amount(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function isDriverCollection(payment: PaymentReviewRow) {
  return payment.raw_payload?.source === "driver_collection";
}

function isCashCollection(payment: PaymentReviewRow) {
  return isDriverCollection(payment) && payment.raw_payload?.collection_method === "cash";
}

function isWithinDate(value: string, filter: DateFilter) {
  if (filter === "all") return true;
  const created = new Date(value).getTime();
  const now = Date.now();
  if (filter === "today") {
    const date = new Date(value);
    const current = new Date();
    return date.toDateString() === current.toDateString();
  }
  const days = filter === "7d" ? 7 : 30;
  return now - created <= days * 24 * 60 * 60 * 1000;
}

export function AdminPaymentReview() {
  const [payments, setPayments] = useState<PaymentReviewRow[]>([]);
  const [orders, setOrders] = useState<ReviewOrderRow[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [provider, setProvider] = useState("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyPayment, setBusyPayment] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
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
        ? await supabase.from("orders").select("id,tracking_id,customer_name,customer_phone,pickup_address,dropoff_address,price_etb,status,driver_id").in("id", orderIds)
        : { data: [], error: null };
      if (orderResult.error) throw orderResult.error;

      const nextOrders = (orderResult.data ?? []) as ReviewOrderRow[];
      const driverIds = [...new Set(nextOrders.map((order) => order.driver_id).filter((value): value is string => Boolean(value)))];
      const [driverResult, auditResult] = await Promise.all([
        driverIds.length ? supabase.from("profiles").select("id,full_name,phone").in("id", driverIds) : Promise.resolve({ data: [], error: null }),
        paymentIds.length ? supabase.from("payment_review_audit").select("id,payment_id,action,actor_id,reason,created_at").in("payment_id", paymentIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
      ]);
      if (driverResult.error) throw driverResult.error;
      if (auditResult.error) throw auditResult.error;

      setPayments(nextPayments);
      setOrders(nextOrders);
      setDrivers((driverResult.data ?? []) as DriverRow[]);
      setAudit((auditResult.data ?? []) as AuditRow[]);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Payment ledger could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase.channel("admin-payment-review")
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

  const providerOptions = useMemo(() => [...new Set(payments.map((payment) => payment.provider))].sort(), [payments]);
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
      const matchesStatus = filter === "all" ||
        (filter === "pending" && payment.event === "initiated") ||
        (filter === "rejected" && payment.event === "failed") ||
        (filter === "escrow" && payment.event === "held_escrow") ||
        (filter === "released" && payment.event === "released");
      const matchesProvider = provider === "all" || payment.provider === provider;
      const haystack = [payment.provider_ref, payment.provider, order?.tracking_id, order?.customer_name, order?.customer_phone, order?.pickup_address, order?.dropoff_address, driver?.full_name, driver?.phone].filter(Boolean).join(" ").toLowerCase();
      return matchesStatus && matchesProvider && isWithinDate(payment.created_at, dateFilter) && (!normalized || haystack.includes(normalized));
    });
  }, [payments, ordersById, driversById, filter, provider, dateFilter, query]);

  useEffect(() => { setPage(1); }, [filter, provider, dateFilter, query]);
  const pageCount = Math.max(1, Math.ceil(filteredPayments.length / PAGE_SIZE));
  const visiblePayments = filteredPayments.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
    if (signedError) { setError(signedError.message); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return <main className="min-h-screen overflow-x-hidden bg-[#f5f3ed] p-3 text-asphalt sm:p-7">
    <section className="mx-auto max-w-6xl">
      <header className="border border-asphalt/10 bg-asphalt p-5 text-white sm:p-8">
        <p className="font-mono text-[10px] tracking-[.22em] text-amber">FINANCE CONTROL</p>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><h1 className="font-display text-3xl font-bold">Payment ledger</h1><p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/60">Search, filter, audit and review every customer payment without losing order, driver, receipt or transaction context.</p></div>
          <button type="button" onClick={() => void load()} className="self-start border border-white/20 px-4 py-3 text-sm font-semibold">↻ Refresh ledger</button>
        </div>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Summary label="Pending review" rows={totals.pending} tone="warning" />
        <Summary label="Held in escrow" rows={totals.escrow} tone="warning" />
        <Summary label="Released" rows={totals.released} tone="good" />
        <Summary label="Rejected / failed" rows={totals.rejected} tone="critical" />
      </div>

      <section className="mt-4 border border-asphalt/10 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="md:col-span-2"><span className="text-[10px] font-semibold uppercase tracking-wide text-steel">Search ledger</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tracking, customer, driver, route, transaction…" className="mt-2 w-full min-w-0 border border-asphalt/15 px-3 py-3 text-sm outline-none focus:border-amber" /></label>
          <label><span className="text-[10px] font-semibold uppercase tracking-wide text-steel">Provider</span><select value={provider} onChange={(event) => setProvider(event.target.value)} className="mt-2 w-full border border-asphalt/15 bg-white px-3 py-3 text-sm"><option value="all">All providers</option>{providerOptions.map((item) => <option key={item} value={item}>{item.replace(/_/g, " ")}</option>)}</select></label>
          <label><span className="text-[10px] font-semibold uppercase tracking-wide text-steel">Date</span><select value={dateFilter} onChange={(event) => setDateFilter(event.target.value as DateFilter)} className="mt-2 w-full border border-asphalt/15 bg-white px-3 py-3 text-sm"><option value="all">All dates</option><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select></label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">{(["all", "pending", "escrow", "released", "rejected"] as ReviewFilter[]).map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={`border px-3 py-2 text-xs font-semibold capitalize ${filter === item ? "border-asphalt bg-asphalt text-white" : "border-asphalt/15 bg-white text-steel"}`}>{item}</button>)}</div>
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
          const legacy = payment.raw_payload?.legacy_completed === true;
          const evidenceRequired = !cashCollection && !legacy;
          const canApprove = !evidenceRequired || Boolean(payment.receipt_path);
          const invoice = amount(order?.price_etb);
          const paid = amount(payment.amount_etb);
          const mismatch = invoice > 0 ? paid - invoice : 0;
          const isOpen = expanded === payment.id;
          const busy = busyPayment === payment.id;
          const auditEntry = latestAudit.get(payment.id);
          return <article key={payment.id} className="min-w-0 border border-asphalt/10 bg-white">
            <div className="grid min-w-0 gap-4 p-4 sm:p-5 lg:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-xl font-bold">ETB {money(payment.amount_etb)}</h2><StatusBadge event={payment.event} legacy={legacy} driverCollected={driverCollected} /></div>
                <p className="mt-2 break-all font-mono text-xs font-semibold">{order?.tracking_id ?? payment.order_id}</p>
                <p className="mt-2 break-words text-sm text-steel">{order ? `${order.pickup_address} → ${order.dropoff_address}` : "Order details unavailable"}</p>
                <div className="mt-3 grid gap-1 text-xs text-steel sm:grid-cols-2"><p>Customer: <strong className="text-asphalt">{order?.customer_name ?? "Customer"}</strong>{order?.customer_phone ? ` · ${order.customer_phone}` : ""}</p><p>Driver: <strong className="text-asphalt">{driver?.full_name ?? driver?.phone ?? "Unassigned"}</strong></p><p>Provider: <strong className="capitalize text-asphalt">{payment.provider.replace(/_/g, " ")}</strong></p><p>Submitted: <strong className="text-asphalt">{new Date(payment.created_at).toLocaleString()}</strong></p></div>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold uppercase"><span className="bg-[#f5f3ed] px-2.5 py-1.5">Invoice ETB {money(invoice)}</span>{mismatch !== 0 && <span className={mismatch > 0 ? "bg-amber/15 px-2.5 py-1.5 text-amber-dim" : "bg-route/10 px-2.5 py-1.5 text-route"}>{mismatch > 0 ? `Overpayment ETB ${money(mismatch)}` : `Underpayment ETB ${money(Math.abs(mismatch))}`}</span>}{!payment.receipt_path && evidenceRequired && <span className="bg-route/10 px-2.5 py-1.5 text-route">Missing receipt</span>}</div>
              </div>
              <div className="flex flex-wrap items-start gap-2 lg:max-w-[230px] lg:justify-end"><button type="button" onClick={() => setExpanded(isOpen ? null : payment.id)} className="border border-asphalt/15 px-3 py-2 text-xs font-semibold">{isOpen ? "Hide details" : "View details"}</button>{payment.receipt_path && <button type="button" onClick={() => void openReceipt(payment.receipt_path!)} className="border border-emerald-700 px-3 py-2 text-xs font-semibold text-emerald-800">Open receipt</button>}</div>
            </div>

            {isOpen && <div className="border-t border-asphalt/10 bg-[#faf9f5] p-4 sm:p-5">
              <div className="grid gap-3 text-xs sm:grid-cols-3"><Info label="Transaction ID" value={payment.provider_ref ?? (cashCollection ? "Cash · no bank reference" : "Not supplied")} mono /><Info label="Order status" value={order?.status?.replace(/_/g, " ") ?? "—"} /><Info label="Reviewed" value={payment.reviewed_at ? new Date(payment.reviewed_at).toLocaleString() : "Not reviewed"} /></div>
              {payment.raw_payload?.note && <p className="mt-4 border-l-4 border-amber bg-white p-3 text-xs"><strong>Driver note:</strong> {payment.raw_payload.note}</p>}
              {payment.event === "failed" && <p className="mt-4 border-l-4 border-route bg-route/5 p-3 text-xs"><strong>Rejection reason:</strong> {payment.rejection_reason ?? "No reason recorded"}</p>}
              {auditEntry && <p className="mt-4 text-[11px] text-steel">Latest audit: <strong className="capitalize text-asphalt">{auditEntry.action}</strong> · {new Date(auditEntry.created_at).toLocaleString()}</p>}
              {legacy && <p className="mt-4 border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"><strong>Legacy completed:</strong> historical released payment; receipt warning is suppressed.</p>}
              {payment.event === "initiated" && <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]"><label className="text-xs font-semibold">Rejection reason<textarea value={reasons[payment.id] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [payment.id]: event.target.value }))} rows={3} maxLength={500} placeholder="Explain mismatch, unclear receipt, duplicate transaction or fraud concern." className="mt-2 block w-full border border-asphalt/15 bg-white p-3 text-sm font-normal outline-none focus:border-route" /></label><div className="flex flex-wrap items-end gap-2"><button type="button" disabled={busy || !canApprove} onClick={() => void review(payment.id, true)} className="bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Saving…" : cashCollection ? "Verify cash" : "Verify payment"}</button><button type="button" disabled={busy || (reasons[payment.id]?.trim().length ?? 0) < 5} onClick={() => void review(payment.id, false)} className="border border-route bg-white px-4 py-3 text-sm font-semibold text-route disabled:opacity-40">Reject</button></div></div>}
            </div>}
          </article>;
        })}
      </div>

      {!loading && filteredPayments.length > 0 && <div className="mt-4 flex flex-col gap-3 border border-asphalt/10 bg-white p-4 text-sm sm:flex-row sm:items-center sm:justify-between"><p className="text-steel">Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredPayments.length)} of {filteredPayments.length}</p><div className="flex gap-2"><button disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="border border-asphalt/15 px-4 py-2 font-semibold disabled:opacity-30">Previous</button><span className="px-3 py-2">{page} / {pageCount}</span><button disabled={page === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="border border-asphalt/15 px-4 py-2 font-semibold disabled:opacity-30">Next</button></div></div>}
    </section>
  </main>;
}

function Summary({ label, rows, tone }: { label: string; rows: PaymentReviewRow[]; tone: "good" | "warning" | "critical" }) {
  const border = tone === "good" ? "border-emerald-600/50" : tone === "critical" ? "border-route/40" : "border-amber/50";
  return <div className={`min-w-0 border bg-white p-4 ${border}`}><p className="break-words font-mono text-[9px] uppercase tracking-wide text-steel">{label}</p><p className="mt-3 font-display text-2xl font-bold">{rows.length}</p><p className="mt-1 break-words text-xs text-steel">ETB {money(rows.reduce((sum, row) => sum + amount(row.amount_etb), 0))}</p></div>;
}

function StatusBadge({ event, legacy, driverCollected }: { event: PaymentEvent; legacy: boolean; driverCollected: boolean }) {
  if (legacy) return <span className="bg-emerald-50 px-2.5 py-1.5 text-[10px] font-semibold uppercase text-emerald-800">Legacy completed</span>;
  const label = event === "initiated" ? "Pending review" : event === "failed" ? "Rejected" : event === "held_escrow" ? "Held escrow" : driverCollected ? "Released · driver" : "Released";
  const cls = event === "failed" ? "bg-route/10 text-route" : event === "initiated" || event === "held_escrow" ? "bg-amber/15 text-amber-dim" : "bg-emerald-50 text-emerald-800";
  return <span className={`px-2.5 py-1.5 text-[10px] font-semibold uppercase ${cls}`}>{label}</span>;
}

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <p className="min-w-0"><span className="block text-steel">{label}</span><strong className={`mt-1 block break-all capitalize text-asphalt ${mono ? "font-mono" : ""}`}>{value}</strong></p>;
}
