import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AdminMobileBottomNav } from "../components/admin/AdminMobileBottomNav";
import type { AdminOrder } from "../services/admin.service";
import { ADMIN_ORDER_STATUSES, ADMIN_ORDERS_PAGE_SIZE, getAdminOrdersPage } from "../services/admin-orders-pagination.service";
import { supabase } from "../services/supabase.client";

function money(value: number | null) {
  return `ETB ${Number(value ?? 0).toLocaleString()}`;
}

function statusClass(status: string) {
  if (status === "cancelled") return "bg-red-100 text-red-800";
  if (status === "delivered") return "bg-emerald-100 text-emerald-800";
  if (status === "in_transit") return "bg-amber/20 text-amber-dim";
  if (status === "accepted") return "bg-sky-100 text-sky-800";
  if (status === "quoted") return "bg-violet-100 text-violet-800";
  return "bg-asphalt/5 text-steel";
}

function OrderCard({ order }: { order: AdminOrder }) {
  const manageUrl = `/admin/operations?section=Orders&mode=manage&q=${encodeURIComponent(order.tracking_id)}`;
  return <article className="border-b border-asphalt/10 p-4 last:border-0 sm:p-5 lg:grid lg:grid-cols-[120px_minmax(0,1fr)_140px_110px] lg:items-center lg:gap-5">
    <div className="flex min-w-0 items-start justify-between gap-3 lg:block">
      <p className="break-all font-mono text-xs font-semibold text-asphalt">{order.tracking_id}</p>
      <span className={`shrink-0 px-2.5 py-1.5 text-[10px] font-semibold capitalize lg:hidden ${statusClass(order.status)}`}>{order.status.replace(/_/g, " ")}</span>
    </div>
    <div className="mt-3 min-w-0 lg:mt-0">
      <p className="break-words text-sm font-semibold text-asphalt">{order.pickup_address} <span className="text-steel">→</span> {order.dropoff_address}</p>
      <p className="mt-1 break-words text-xs text-steel">{order.customer_name || "Customer"}{order.customer_phone ? ` · ${order.customer_phone}` : ""}</p>
      <p className="mt-1 break-words text-xs text-steel">{order.cargo_description || order.vehicle_type}</p>
      <p className="mt-2 break-words text-[11px] font-semibold text-asphalt">Driver / plate: {order.assignment_label}</p>
    </div>
    <div className="mt-4 flex items-center justify-between gap-3 border-t border-asphalt/10 pt-3 lg:mt-0 lg:block lg:border-0 lg:pt-0">
      <span className="font-mono text-xs font-semibold">{money(order.price_etb)}</span>
      <span className={`hidden w-fit px-2.5 py-1.5 text-[10px] font-semibold capitalize lg:block ${statusClass(order.status)}`}>{order.status.replace(/_/g, " ")}</span>
      <Link to={manageUrl} className="min-h-11 shrink-0 border border-asphalt/15 px-4 py-3 text-xs font-semibold text-amber-dim lg:mt-2 lg:inline-flex lg:items-center">Manage</Link>
    </div>
  </article>;
}

export function AdminOrdersScalable() {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get("status") || "all";
  const query = searchParams.get("q") || "";
  const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
  const pageSize = searchParams.get("page_size") === "50" ? 50 : ADMIN_ORDERS_PAGE_SIZE;
  const date = searchParams.get("date") === "today" ? "today" : "all";

  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchDraft, setSearchDraft] = useState(query);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getAdminOrdersPage({ page, pageSize, status, search: query, date });
      setOrders(result.orders);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setStatusCounts(result.statusCounts);
      if (page > result.totalPages) {
        const next = new URLSearchParams(searchParams);
        next.set("page", String(result.totalPages));
        setSearchParams(next, { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Admin orders.");
    } finally {
      setLoading(false);
    }
  }, [date, page, pageSize, query, searchParams, setSearchParams, status]);

  useEffect(() => { setSearchDraft(query); }, [query]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const channel = supabase.channel("admin-orders-scalable-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const firstRecord = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRecord = Math.min(total, page * pageSize);
  const pageWindow = useMemo(() => {
    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
    const end = Math.min(totalPages, start + 4);
    return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
  }, [page, totalPages]);

  function updateParams(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) => {
      if (!value || value === "all") next.delete(key);
      else next.set(key, value);
    });
    if (!("page" in changes)) next.delete("page");
    setSearchParams(next, { replace: true });
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateParams({ q: searchDraft.trim() || null, page: null });
  }

  return <div className="min-h-screen bg-[#f5f3ed] pb-[calc(5rem+env(safe-area-inset-bottom))] text-asphalt lg:pb-8">
    <header className="sticky top-0 z-20 border-b border-asphalt/10 bg-white px-3 py-3 sm:px-6">
      <div className="mx-auto flex max-w-[1500px] min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <Link to="/admin/operations" className="text-[10px] font-semibold uppercase tracking-[.16em] text-amber-dim">← Operations</Link>
          <h1 className="mt-1 truncate font-display text-xl font-bold sm:text-2xl">Admin Orders</h1>
        </div>
        <Link to="/admin/operations?section=Orders&mode=create&action=create-order" className="min-h-11 shrink-0 bg-asphalt px-3 py-3 text-xs font-semibold text-white sm:px-5">+ New order</Link>
      </div>
    </header>

    <main className="mx-auto max-w-[1500px] p-3 min-[360px]:p-4 sm:p-6">
      <section className="mb-4 bg-asphalt p-5 text-white sm:p-7">
        <p className="font-mono text-[10px] tracking-[.18em] text-amber">SERVER-SIDE ORDER CONTROL</p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="font-display text-2xl font-bold sm:text-3xl">Search and manage every order</h2><p className="mt-2 max-w-3xl text-xs leading-5 text-white/55">Only {pageSize} records are fetched for this page. Search, status filters and exact result counts run against Supabase before rows reach the browser.</p></div>
          <div className="font-mono text-xs text-white/70">{total.toLocaleString()} matching</div>
        </div>
      </section>

      <form onSubmit={submitSearch} className="mb-4 flex min-w-0 flex-col gap-2 bg-white p-3 sm:flex-row sm:p-4">
        <input aria-label="Search all orders" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Tracking, customer, phone, route, cargo..." className="min-h-11 min-w-0 flex-1 border border-asphalt/15 px-3 text-sm outline-none focus:border-amber" />
        <button type="submit" className="min-h-11 bg-asphalt px-5 text-sm font-semibold text-white">Search all orders</button>
        {(query || status !== "all" || date !== "all") && <button type="button" onClick={() => { setSearchDraft(""); updateParams({ q: null, status: null, date: null, page: null }); }} className="min-h-11 border border-asphalt/15 px-4 text-xs font-semibold">Clear</button>}
      </form>

      <fieldset className="mb-4 border border-asphalt/10 bg-white p-3 sm:p-4">
        <legend className="px-1 text-[10px] font-semibold uppercase tracking-wide text-steel">Order status</legend>
        <div className="flex min-w-0 flex-wrap gap-2">
          {ADMIN_ORDER_STATUSES.map((value) => <button key={value} type="button" aria-pressed={status === value} onClick={() => updateParams({ status: value === "all" ? null : value, page: null })} className={`min-h-11 min-w-[5.5rem] flex-1 border px-3 py-2 text-[11px] font-semibold capitalize min-[430px]:flex-none ${status === value ? "border-asphalt bg-asphalt text-white" : "border-asphalt/10 bg-white text-steel"}`}>{value.replace(/_/g, " ")} {(statusCounts[value] ?? 0).toLocaleString()}</button>)}
        </div>
      </fieldset>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-asphalt/10 bg-white p-3 text-xs sm:p-4">
        <span>{loading ? "Loading…" : `Showing ${firstRecord.toLocaleString()}–${lastRecord.toLocaleString()} of ${total.toLocaleString()}`}</span>
        <label className="flex items-center gap-2">Rows<select value={pageSize} onChange={(event) => updateParams({ page_size: event.target.value === "50" ? "50" : "100", page: null })} className="min-h-11 border border-asphalt/15 bg-white px-3"><option value="50">50</option><option value="100">100</option></select></label>
      </div>

      {error && <p role="alert" className="mb-4 border border-route/30 bg-route/10 p-3 text-sm text-route">{error}</p>}
      <section className="overflow-hidden border border-asphalt/10 bg-white">
        {loading ? <p role="status" className="p-10 text-center text-sm text-steel">Loading server-side order page…</p> : orders.length ? orders.map((order) => <OrderCard key={order.id} order={order} />) : <p className="p-10 text-center text-sm text-steel">No matching orders.</p>}
      </section>

      <nav aria-label="Orders pagination" className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-3 border border-asphalt/10 bg-white p-3 sm:p-4">
        <button type="button" disabled={page <= 1 || loading} onClick={() => updateParams({ page: String(page - 1) })} className="min-h-11 border border-asphalt/15 px-4 text-xs font-semibold disabled:opacity-35">Previous</button>
        <div className="flex flex-wrap justify-center gap-1">
          {pageWindow.map((value) => <button key={value} type="button" aria-current={page === value ? "page" : undefined} onClick={() => updateParams({ page: String(value) })} className={`min-h-11 min-w-11 border px-3 text-xs font-semibold ${page === value ? "border-asphalt bg-asphalt text-white" : "border-asphalt/15 bg-white"}`}>{value}</button>)}
        </div>
        <button type="button" disabled={page >= totalPages || loading} onClick={() => updateParams({ page: String(page + 1) })} className="min-h-11 border border-asphalt/15 px-4 text-xs font-semibold disabled:opacity-35">Next</button>
      </nav>
    </main>
    <AdminMobileBottomNav />
  </div>;
}
