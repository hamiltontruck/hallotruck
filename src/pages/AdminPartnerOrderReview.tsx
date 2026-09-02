import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listAdminPartnerOrders,
  quotePartnerOrder,
  startPartnerOrderReview,
  type PartnerOrder,
  type PartnerOrderStatus,
} from "../services/partner-order.service";

type QueueFilter = "all" | "submitted" | "under_review" | "quoted" | "approved";

const queueStatuses: PartnerOrderStatus[] = ["submitted", "under_review", "quoted", "approved", "rejected", "expired"];

function title(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function defaultExpiry() {
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const local = new Date(future.getTime() - future.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function statusTone(status: PartnerOrderStatus) {
  if (status === "approved") return "border-emerald-700/30 bg-emerald-50 text-emerald-900";
  if (status === "quoted") return "border-sky-700/30 bg-sky-50 text-sky-900";
  if (status === "rejected" || status === "expired") return "border-asphalt/10 bg-bone text-asphalt";
  if (status === "under_review") return "border-amber/50 bg-amber/10 text-asphalt";
  return "border-asphalt/15 bg-white text-asphalt";
}

export function AdminPartnerOrderReview() {
  const [orders, setOrders] = useState<PartnerOrder[]>([]);
  const [filter, setFilter] = useState<QueueFilter>("all");
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [expiries, setExpiries] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await listAdminPartnerOrders();
      setOrders(next.filter((order) => queueStatuses.includes(order.status)));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Partner order review queue could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visibleOrders = useMemo(
    () => filter === "all" ? orders : orders.filter((order) => order.status === filter),
    [filter, orders],
  );

  async function startReview(order: PartnerOrder) {
    if (busyKey) return;
    setBusyKey(`review:${order.id}`);
    setError("");
    setNotice("");
    try {
      await startPartnerOrderReview(order.id, notes[order.id] ?? "");
      setNotice(`${order.reference} is now under HALLO review.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Partner order review could not be started.");
    } finally {
      setBusyKey("");
    }
  }

  async function issueQuote(order: PartnerOrder) {
    if (busyKey) return;
    const amount = Number(amounts[order.id] ?? "");
    const expiry = expiries[order.id] || defaultExpiry();
    setBusyKey(`quote:${order.id}`);
    setError("");
    setNotice("");
    try {
      await quotePartnerOrder(order.id, amount, expiry, notes[order.id] ?? "");
      setNotice(`${order.reference} quote issued to the Partner for acceptance.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Partner order quote could not be issued.");
    } finally {
      setBusyKey("");
    }
  }

  return (
    <main className="min-w-0 overflow-x-hidden bg-[#f5f3ed] text-asphalt" data-testid="admin-partner-order-review-page">
      <header className="bg-asphalt px-4 py-6 text-white sm:px-7">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-[.22em] text-amber">PARTNER ORDER CONTROL</p>
            <h1 className="mt-2 break-words font-display text-3xl font-bold sm:text-4xl">Review, quote & approval</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">Review submitted Partner freight, issue an ETB quote with an explicit expiry, and wait for the Partner owner/admin decision before canonical order placement.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="min-h-11 self-start border border-amber/50 px-4 py-3 text-xs font-semibold text-amber disabled:opacity-50">Refresh queue</button>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-5 sm:px-7 sm:py-8">
        {error && <p role="alert" className="mb-4 break-words border border-route/30 bg-route/5 p-4 text-sm text-route">{error}</p>}
        {notice && <p role="status" className="mb-4 break-words border border-emerald-700/25 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Submitted" value={orders.filter((order) => order.status === "submitted").length} />
          <Metric label="Under review" value={orders.filter((order) => order.status === "under_review").length} />
          <Metric label="Awaiting Partner" value={orders.filter((order) => order.status === "quoted").length} />
          <Metric label="Approved" value={orders.filter((order) => order.status === "approved").length} />
        </div>

        <nav className="mt-5 flex gap-2 overflow-x-auto pb-2" aria-label="Partner order review filters">
          {(["all", "submitted", "under_review", "quoted", "approved"] as const).map((value) => (
            <button key={value} type="button" onClick={() => setFilter(value)} className={`min-h-11 shrink-0 whitespace-nowrap border px-4 text-xs font-semibold ${filter === value ? "border-asphalt bg-asphalt text-white" : "border-asphalt/15 bg-white text-asphalt"}`}>{title(value)}</button>
          ))}
        </nav>

        {loading ? (
          <p className="mt-4 border border-asphalt/10 bg-white p-10 text-center font-mono text-xs text-steel">Loading Partner order review queue…</p>
        ) : visibleOrders.length === 0 ? (
          <p className="mt-4 border border-asphalt/10 bg-white p-10 text-center text-sm text-steel">No Partner orders match this review queue.</p>
        ) : (
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {visibleOrders.map((order) => (
              <article key={order.id} className={`min-w-0 border p-4 sm:p-5 ${statusTone(order.status)}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-all font-mono text-xs font-bold text-amber-dim">{order.reference}</p>
                    <h2 className="mt-2 break-words font-display text-xl font-bold">{order.pickup_location.city} → {order.dropoff_location.city}</h2>
                    <p className="mt-1 break-words text-xs text-steel">{order.partner_organizations?.name ?? order.partner_id} {order.partner_organizations?.code ? `· ${order.partner_organizations.code}` : ""}</p>
                  </div>
                  <span className="shrink-0 bg-asphalt px-3 py-2 text-[10px] font-semibold uppercase text-white">{title(order.status)}</span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
                  <Value label="Cargo" value={order.cargo.description || "Not recorded"} />
                  <Value label="Weight" value={`${Number(order.cargo.weight_tons || 0)} ton`} />
                  <Value label="Truck" value={order.vehicle_requirements.truck_type || "Not recorded"} />
                  <Value label="Pickup" value={order.schedule.pickup_date || "Not recorded"} />
                  <Value label="Payment" value={order.payment.method || "Not recorded"} />
                  <Value label="Submitted" value={order.submitted_at ? new Date(order.submitted_at).toLocaleString() : "Not submitted"} />
                </div>

                {order.partner_notes && <p className="mt-4 break-words border-l-2 border-amber pl-3 text-sm text-steel">Partner note: {order.partner_notes}</p>}
                {order.admin_notes && order.status !== "submitted" && <p className="mt-3 break-words border-l-2 border-asphalt/20 pl-3 text-sm text-steel">HALLO note: {order.admin_notes}</p>}

                {order.status === "submitted" && (
                  <div className="mt-5 space-y-3 border-t border-asphalt/10 pt-4">
                    <label className="block text-xs font-semibold">Review note
                      <textarea value={notes[order.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [order.id]: event.target.value }))} rows={3} maxLength={4000} className="mt-2 w-full border border-asphalt/15 bg-white px-3 py-3 font-normal" placeholder="Optional review note" />
                    </label>
                    <button type="button" disabled={Boolean(busyKey)} onClick={() => void startReview(order)} className="min-h-12 w-full bg-asphalt px-4 text-xs font-bold text-white disabled:opacity-40">{busyKey === `review:${order.id}` ? "Starting review…" : "Start HALLO review"}</button>
                  </div>
                )}

                {order.status === "under_review" && (
                  <div className="mt-5 space-y-3 border-t border-asphalt/10 pt-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-xs font-semibold">Quote amount (ETB)
                        <input inputMode="decimal" value={amounts[order.id] ?? ""} onChange={(event) => setAmounts((current) => ({ ...current, [order.id]: event.target.value }))} className="mt-2 min-h-12 w-full min-w-0 border border-asphalt/15 bg-white px-3 font-normal" placeholder="0.00" />
                      </label>
                      <label className="block text-xs font-semibold">Quote expires
                        <input type="datetime-local" value={expiries[order.id] ?? defaultExpiry()} onChange={(event) => setExpiries((current) => ({ ...current, [order.id]: event.target.value }))} className="mt-2 min-h-12 w-full min-w-0 border border-asphalt/15 bg-white px-3 font-normal" />
                      </label>
                    </div>
                    <label className="block text-xs font-semibold">Quote note
                      <textarea value={notes[order.id] ?? order.admin_notes ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [order.id]: event.target.value }))} rows={3} maxLength={4000} className="mt-2 w-full border border-asphalt/15 bg-white px-3 py-3 font-normal" placeholder="Explain the quote or operational conditions" />
                    </label>
                    <button type="button" disabled={Boolean(busyKey)} onClick={() => void issueQuote(order)} className="min-h-12 w-full bg-amber px-4 text-xs font-bold text-asphalt disabled:opacity-40">{busyKey === `quote:${order.id}` ? "Issuing quote…" : "Issue quote to Partner"}</button>
                  </div>
                )}

                {order.quote_amount_etb && ["quoted", "approved", "rejected", "expired"].includes(order.status) && (
                  <div className="mt-5 border-t border-asphalt/10 pt-4">
                    <p className="font-mono text-[9px] uppercase tracking-wide text-steel">HALLO quote</p>
                    <p className="mt-2 font-display text-2xl font-bold">ETB {Number(order.quote_amount_etb).toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                    <p className="mt-1 text-xs text-steel">Version {order.quote_version} · expires {order.quote_expires_at ? new Date(order.quote_expires_at).toLocaleString() : "not recorded"}</p>
                    {order.status === "quoted" && <p className="mt-3 text-sm font-semibold text-sky-800">Awaiting Partner owner/admin decision.</p>}
                    {order.status === "approved" && <p className="mt-3 text-sm font-semibold text-emerald-800">Partner approved the quote. Canonical order placement remains a separate controlled production slice.</p>}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="min-w-0 border border-asphalt/10 bg-white p-4"><p className="break-words font-mono text-[9px] uppercase tracking-wide text-steel">{label}</p><p className="mt-3 font-display text-2xl font-bold">{value}</p></div>;
}

function Value({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="font-mono text-[9px] uppercase tracking-wide text-steel">{label}</p><p className="mt-1 break-words font-semibold">{value}</p></div>;
}
