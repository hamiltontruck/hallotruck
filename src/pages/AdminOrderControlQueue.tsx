import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ADMIN_ORDER_STATUSES, type AdminOrderPageSize } from "../services/admin-orders.service";
import {
  ADMIN_ORDER_CONTROL_QUEUES,
  getAdminOrderControlQueuePage,
  type AdminOrderControlQueue as QueueName,
  type AdminOrderControlQueuePageResult,
} from "../services/admin-order-control-queue.service";
import { supabase } from "../services/supabase.client";

const queueLabels: Record<QueueName, { title: string; description: string }> = {
  delayed: { title: "Delayed trips", description: "Accepted or in-transit orders running for more than 48 hours." },
  unassigned: { title: "Unassigned orders", description: "Open orders still missing a driver or truck assignment." },
  "delayed-or-unassigned": { title: "Delayed or unassigned", description: "One bounded queue for orders needing immediate operations attention." },
  "missing-evidence": { title: "Missing delivery evidence", description: "Delivered orders without proof, excluding legitimate legacy completions." },
  "unreported-payment": { title: "Driver payment report missing", description: "Delivered pay-on-delivery orders still waiting for the assigned driver payment report." },
};

function parseQueue(value: string | null): QueueName {
  return ADMIN_ORDER_CONTROL_QUEUES.includes(value as QueueName) ? value as QueueName : "delayed-or-unassigned";
}

function formatMoney(value: number | null) {
  if (value == null) return "—";
  return `ETB ${Math.round(value).toLocaleString()}`;
}

export function AdminOrderControlQueue() {
  const [params, setParams] = useSearchParams();
  const queue = parseQueue(params.get("queue"));
  const page = Math.max(1, Number(params.get("page") || 1) || 1);
  const pageSize: AdminOrderPageSize = Number(params.get("page_size")) === 50 ? 50 : 100;
  const status = params.get("status") || "all";
  const today = params.get("date") === "today";
  const search = params.get("q") || "";
  const fixedDeliveredStatus = queue === "unreported-payment";
  const [draftSearch, setDraftSearch] = useState(search);
  const [result, setResult] = useState<AdminOrderControlQueuePageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);
  const loadRef = useRef<() => Promise<void>>(async () => {});
  const realtimeTimer = useRef<number | undefined>(undefined);

  useEffect(() => setDraftSearch(search), [search]);

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError("");
    try {
      const next = await getAdminOrderControlQueuePage({ queue, page, pageSize, status: fixedDeliveredStatus ? "delivered" : status, search, today });
      if (requestId !== requestSequence.current) return;
      setResult(next);
      if (next.page !== page) {
        const updated = new URLSearchParams(params);
        if (next.page <= 1) updated.delete("page"); else updated.set("page", String(next.page));
        setParams(updated, { replace: true });
      }
    } catch (err) {
      if (requestId !== requestSequence.current) return;
      setError(err instanceof Error ? err.message : "Could not load control queue.");
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [queue, page, pageSize, status, fixedDeliveredStatus, search, today, params, setParams]);

  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const queueRefresh = () => {
      window.clearTimeout(realtimeTimer.current);
      realtimeTimer.current = window.setTimeout(() => void loadRef.current(), 600);
    };
    const channel = supabase.channel("admin-order-control-queue-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, queueRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_proofs" }, queueRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, queueRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_trip_payment_results" }, queueRefresh)
      .subscribe();
    return () => {
      window.clearTimeout(realtimeTimer.current);
      void supabase.removeChannel(channel);
    };
  }, []);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === "all") next.delete(key); else next.set(key, value);
    if (key !== "page") next.delete("page");
    next.delete("section");
    setParams(next, { replace: true });
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    update("q", draftSearch.trim());
  };

  const queueMeta = queueLabels[queue];
  const pageNumbers = useMemo(() => {
    const totalPages = result?.totalPages ?? 1;
    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
    return Array.from({ length: Math.min(5, totalPages) }, (_, index) => start + index).filter((value) => value <= totalPages);
  }, [page, result?.totalPages]);

  return <div className="min-w-0 space-y-6">
    <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[.2em] text-steel">ADMIN OPERATIONS · SERVER QUEUE</p>
        <h1 className="mt-2 break-words font-display text-3xl font-bold text-asphalt sm:text-4xl">{queueMeta.title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-steel">{queueMeta.description} Results are filtered and paginated in PostgreSQL; the browser never preloads the full order/proof/payment history.</p>
      </div>
      <Link to="/admin/operations?section=Orders" className="min-h-11 shrink-0 border border-asphalt/15 bg-white px-4 py-3 text-center text-xs font-semibold text-asphalt">All orders</Link>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {ADMIN_ORDER_CONTROL_QUEUES.map((name) => <Link key={name} to={`/admin/order-queue?queue=${encodeURIComponent(name)}`} className={`min-h-16 border p-4 text-sm font-semibold ${queue === name ? "border-asphalt bg-asphalt text-white" : "border-asphalt/10 bg-white text-asphalt"}`}>{queueLabels[name].title}</Link>)}
    </div>

    <div className="grid gap-3 bg-white p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_180px_150px_120px]">
      <form onSubmit={submitSearch} className="flex min-w-0 gap-2">
        <input value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} aria-label="Search control queue" placeholder="Tracking, customer, route, truck..." className="min-h-11 min-w-0 flex-1 border border-asphalt/15 px-3 text-sm outline-none focus:border-asphalt" />
        <button className="min-h-11 bg-asphalt px-4 text-xs font-semibold text-white">Search</button>
      </form>
      {fixedDeliveredStatus ? <select aria-label="Order status" value="delivered" disabled className="min-h-11 border border-asphalt/15 bg-[#f5f3ed] px-3 text-sm text-steel"><option value="delivered">Delivered ({result?.statusCounts.delivered ?? 0})</option></select> : <select aria-label="Order status" value={status} onChange={(event) => update("status", event.target.value)} className="min-h-11 border border-asphalt/15 bg-white px-3 text-sm">
        {ADMIN_ORDER_STATUSES.map((item) => <option key={item} value={item}>{item === "all" ? "All statuses" : `${item.replaceAll("_", " ")} (${result?.statusCounts[item] ?? 0})`}</option>)}
      </select>}
      <select aria-label="Date filter" value={today ? "today" : "all"} onChange={(event) => update("date", event.target.value)} className="min-h-11 border border-asphalt/15 bg-white px-3 text-sm">
        <option value="all">All dates</option><option value="today">Today</option>
      </select>
      <select aria-label="Rows per page" value={pageSize} onChange={(event) => update("page_size", event.target.value)} className="min-h-11 border border-asphalt/15 bg-white px-3 text-sm">
        <option value="50">50 rows</option><option value="100">100 rows</option>
      </select>
    </div>

    {error && <div role="alert" className="border border-route/30 bg-route/10 p-4 text-sm text-route">{error}</div>}
    {loading ? <div role="status" className="bg-white p-12 text-center font-mono text-sm text-steel">Loading server queue…</div> : <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-steel">
        <span><strong className="text-asphalt">{result?.total ?? 0}</strong> matching orders · Page {result?.page ?? 1} of {result?.totalPages ?? 1}</span>
        {fixedDeliveredStatus ? <span>Unreported invoice total: <strong className="text-asphalt">{formatMoney(result?.invoiceTotal ?? 0)}</strong></span> : <span>Queue total before status filter: <strong className="text-asphalt">{result?.statusCounts.all ?? 0}</strong></span>}
      </div>

      <div className="overflow-hidden border border-asphalt/10 bg-white">
        {(result?.orders.length ?? 0) === 0 ? <div className="p-12 text-center text-sm text-steel">No orders match this queue and filter.</div> : <div className="divide-y divide-asphalt/10">
          {result?.orders.map((order) => <article key={order.id} className="grid min-w-0 gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_180px_130px] lg:items-center">
            <div className="min-w-0"><p className="font-mono text-xs font-semibold text-asphalt">{order.tracking_id}</p><p className="mt-1 truncate text-sm font-semibold text-asphalt">{order.customer_name || order.customer_phone || "Customer"}</p><p className="mt-1 break-words text-xs text-steel">{order.pickup_address} → {order.dropoff_address}</p></div>
            <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-steel">{order.status.replaceAll("_", " ")}</p><p className="mt-1 break-words text-sm text-asphalt">{order.assignment_label}</p><p className="mt-1 text-xs text-steel">{order.cargo_description || order.vehicle_type}</p></div>
            <div><p className="text-xs text-steel">Invoice</p><p className="mt-1 font-display text-lg font-bold text-asphalt">{formatMoney(order.price_etb)}</p></div>
            <Link to={`/admin/operations?section=Orders&q=${encodeURIComponent(order.tracking_id)}`} className="min-h-11 bg-asphalt px-4 py-3 text-center text-xs font-semibold text-white">Manage</Link>
          </article>)}
        </div>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button disabled={(result?.page ?? 1) <= 1} onClick={() => update("page", String(Math.max(1, (result?.page ?? 1) - 1)))} className="min-h-11 border border-asphalt/15 bg-white px-4 text-xs font-semibold disabled:opacity-40">Previous</button>
        <div className="flex flex-wrap gap-2">{pageNumbers.map((number) => <button key={number} onClick={() => update("page", String(number))} aria-current={number === (result?.page ?? 1) ? "page" : undefined} className={`min-h-11 min-w-11 border px-3 text-xs font-semibold ${number === (result?.page ?? 1) ? "border-asphalt bg-asphalt text-white" : "border-asphalt/15 bg-white text-asphalt"}`}>{number}</button>)}</div>
        <button disabled={(result?.page ?? 1) >= (result?.totalPages ?? 1)} onClick={() => update("page", String(Math.min(result?.totalPages ?? 1, (result?.page ?? 1) + 1)))} className="min-h-11 border border-asphalt/15 bg-white px-4 text-xs font-semibold disabled:opacity-40">Next</button>
      </div>
    </>}
  </div>;
}
