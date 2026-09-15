import { Link } from "react-router-dom";
import { ADMIN_ORDER_PAGE_SIZES, ADMIN_ORDER_STATUSES } from "../../services/admin-orders.service";
import type { AdminOrder } from "../../services/admin.service";

export type AdminOrdersExceptionCounts = {
  delayed?: number;
  unassigned?: number;
  missingEvidence?: number;
  unreportedPayment?: number;
};

type Props = {
  orders: AdminOrder[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: 50 | 100;
  statusCounts: Record<string, number>;
  searchQuery: string;
  status: string;
  today: boolean;
  loading: boolean;
  error: string;
  exceptionCounts?: AdminOrdersExceptionCounts;
  onSearch: (value: string) => void;
  onStatus: (value: string) => void;
  onToday: (today: boolean) => void;
  onPageSize: (value: 50 | 100) => void;
  onPage: (value: number) => void;
  onManage: (order: AdminOrder) => void;
  onRetry: () => void;
};

const statusTone: Record<string, string> = {
  quoted: "border-slate-200 bg-slate-50 text-slate-700",
  placed: "border-blue-200 bg-blue-50 text-blue-800",
  accepted: "border-sky-200 bg-sky-50 text-sky-800",
  in_transit: "border-amber-200 bg-amber-50 text-amber-800",
  delivered: "border-emerald-200 bg-emerald-50 text-emerald-800",
  cancelled: "border-red-200 bg-red-50 text-red-800",
};

const paymentTone: Record<string, string> = {
  initiated: "border-amber-200 bg-amber-50 text-amber-800",
  held_escrow: "border-blue-200 bg-blue-50 text-blue-800",
  released: "border-emerald-200 bg-emerald-50 text-emerald-800",
  refunded: "border-violet-200 bg-violet-50 text-violet-800",
  failed: "border-red-200 bg-red-50 text-red-800",
};

function displayStatus(value: string) {
  return value.replaceAll("_", " ");
}

function money(value: number | null) {
  return `ETB ${Number(value ?? 0).toLocaleString()}`;
}

function when(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function isUnassigned(order: AdminOrder) {
  return !["delivered", "cancelled"].includes(order.status) && (!order.driver_id || !order.truck_id);
}

function isDelayed(order: AdminOrder) {
  if (!["accepted", "in_transit"].includes(order.status)) return false;
  const started = new Date(order.accepted_at || order.created_at).getTime();
  return Number.isFinite(started) && Date.now() - started > 48 * 60 * 60 * 1000;
}

function Badge({ value, kind = "status" }: { value: string; kind?: "status" | "payment" }) {
  const tone = kind === "payment" ? paymentTone[value] : statusTone[value];
  return <span className={`inline-flex min-h-7 items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.04em] ${tone ?? "border-asphalt/10 bg-asphalt/[.04] text-steel"}`}>{displayStatus(value || "unknown")}</span>;
}

function Kpi({ label, value, note }: { label: string; value: number; note: string }) {
  return <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.04)] sm:p-5">
    <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-slate-500">{label}</p>
    <p className="mt-3 font-display text-2xl font-bold tracking-tight text-[#10233f] sm:text-3xl">{value.toLocaleString()}</p>
    <p className="mt-1 text-xs text-slate-500">{note}</p>
  </div>;
}

function ExceptionLink({ to, label, count, tone }: { to: string; label: string; count?: number; tone: string }) {
  return <Link to={to} className="flex min-h-11 min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-[#10233f] transition hover:border-[#1264d8]/35 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1264d8]">
    <span className="flex min-w-0 items-center gap-2"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone}`} /><span className="truncate">{label}</span></span>
    <span className="shrink-0 font-mono text-[11px] text-slate-500">{count == null ? "Open queue" : count.toLocaleString()}</span>
  </Link>;
}

function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (value: number) => void }) {
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, index) => start + index).filter((value) => value <= totalPages);
  return <nav aria-label="Orders pagination" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3">
    <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="min-h-11 rounded-xl border border-slate-200 px-4 text-xs font-semibold text-[#10233f] disabled:opacity-35">Previous</button>
    <div className="flex flex-wrap justify-center gap-2">{pages.map((value) => <button key={value} type="button" aria-current={value === page ? "page" : undefined} onClick={() => onPage(value)} className={`min-h-11 min-w-11 rounded-xl px-3 text-xs font-semibold ${value === page ? "bg-[#10233f] text-white" : "border border-slate-200 bg-white text-[#10233f]"}`}>{value}</button>)}</div>
    <button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)} className="min-h-11 rounded-xl border border-slate-200 px-4 text-xs font-semibold text-[#10233f] disabled:opacity-35">Next</button>
  </nav>;
}

function MobileOrderCard({ order, onManage }: { order: AdminOrder; onManage: (order: AdminOrder) => void }) {
  const delayed = isDelayed(order);
  const unassigned = isUnassigned(order);
  return <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.045)] min-[360px]:p-5">
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="min-w-0"><p className="break-all font-mono text-[11px] font-bold tracking-[.04em] text-[#1264d8]">{order.tracking_id}</p><p className="mt-1 break-words text-sm font-semibold text-[#10233f]">{order.customer_name || order.customer_phone || "Customer"}</p></div>
      <Badge value={order.status} />
    </div>
    {(delayed || unassigned) && <div className="mt-3 flex flex-wrap gap-2">{delayed && <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-bold uppercase text-red-700">Delayed</span>}{unassigned && <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase text-amber-800">Unassigned</span>}</div>}
    <div className="mt-4 rounded-xl bg-slate-50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[.1em] text-slate-400">Route</p>
      <p className="mt-1 break-words text-sm font-semibold leading-5 text-[#10233f]">{order.pickup_address}</p>
      <div className="my-1.5 flex items-center gap-2 text-[10px] text-[#1264d8]"><span className="h-px flex-1 bg-blue-200"/><span>TO</span><span className="h-px flex-1 bg-blue-200"/></div>
      <p className="break-words text-sm font-semibold leading-5 text-[#10233f]">{order.dropoff_address}</p>
    </div>
    <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 text-xs">
      <div className="min-w-0"><dt className="text-slate-400">Truck / load</dt><dd className="mt-1 break-words font-semibold text-[#10233f]">{order.vehicle_type || "—"}</dd><dd className="mt-0.5 break-words text-slate-500">{order.cargo_description || "No cargo description"}</dd></div>
      <div className="min-w-0"><dt className="text-slate-400">Amount</dt><dd className="mt-1 break-words font-semibold text-[#10233f]">{money(order.price_etb)}</dd><dd className="mt-1"><Badge value={order.payment_status} kind="payment" /></dd></div>
      <div className="col-span-2 min-w-0"><dt className="text-slate-400">Driver assignment</dt><dd className="mt-1 break-words font-semibold text-[#10233f]">{order.assignment_label || "Driver and truck not assigned"}</dd></div>
      <div className="min-w-0"><dt className="text-slate-400">Created</dt><dd className="mt-1 break-words text-[#10233f]">{when(order.created_at)}</dd></div>
      <div className="min-w-0"><dt className="text-slate-400">Delivered</dt><dd className="mt-1 break-words text-[#10233f]">{when(order.delivered_at)}</dd></div>
    </dl>
    <button type="button" onClick={() => onManage(order)} className="mt-5 min-h-11 w-full rounded-xl bg-[#1264d8] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#0d56bb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1264d8]">Manage Order</button>
  </article>;
}

export function AdminOrdersExecutiveConsole({ orders, total, totalPages, page, pageSize, statusCounts, searchQuery, status, today, loading, error, exceptionCounts, onSearch, onStatus, onToday, onPageSize, onPage, onManage, onRetry }: Props) {
  const active = (statusCounts.accepted ?? 0) + (statusCounts.in_transit ?? 0);
  const delivered = statusCounts.delivered ?? 0;
  const waiting = statusCounts.placed ?? 0;
  const anyFilter = Boolean(searchQuery.trim()) || status !== "all" || today;

  return <section className="min-w-0 overflow-x-hidden" data-testid="admin-orders-executive-console">
    <div className="overflow-hidden rounded-[28px] bg-[#10233f] text-white shadow-[0_18px_55px_rgba(15,35,63,0.18)]">
      <div className="relative p-5 min-[360px]:p-6 sm:p-8 lg:p-10">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full border-[44px] border-[#1264d8]/20" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl"><p className="font-mono text-[10px] font-semibold uppercase tracking-[.2em] text-blue-300">Operations / Order Control</p><h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">Orders</h1><p className="mt-3 max-w-xl text-sm leading-6 text-white/60">Search, triage and manage customer freight orders from one server-paginated operations workspace.</p></div>
          <div className="flex flex-wrap gap-2 text-[11px] text-white/65"><span className="rounded-full border border-white/15 bg-white/[.06] px-3 py-2">Ethiopia local-day semantics</span><span className="rounded-full border border-white/15 bg-white/[.06] px-3 py-2">50 / 100 server pagination</span></div>
        </div>
      </div>
    </div>

    <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Kpi label="Matching orders" value={total} note={today ? "Today · Ethiopia local day" : "Current search and date scope"} />
      <Kpi label="Active shipments" value={active} note="Accepted + in transit" />
      <Kpi label="Awaiting dispatch" value={waiting} note="Placed orders" />
      <Kpi label="Delivered" value={delivered} note="Current search and date scope" />
    </div>

    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Order exception queues">
      <ExceptionLink to="/admin/order-queue?queue=delayed" label="Delayed" count={exceptionCounts?.delayed} tone="bg-red-500" />
      <ExceptionLink to="/admin/order-queue?queue=unassigned" label="Unassigned" count={exceptionCounts?.unassigned} tone="bg-amber-500" />
      <ExceptionLink to="/admin/order-queue?queue=missing-evidence" label="Missing evidence" count={exceptionCounts?.missingEvidence} tone="bg-violet-500" />
      <ExceptionLink to="/admin/order-queue?queue=unreported-payment" label="Unreported delivery payment" count={exceptionCounts?.unreportedPayment} tone="bg-rose-500" />
    </div>

    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_8px_30px_rgba(15,23,42,0.04)] min-[360px]:p-4 sm:p-5">
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(280px,1fr)_190px_170px_120px]">
        <label className="min-w-0"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.1em] text-slate-500">Search</span><span className="flex min-h-11 min-w-0 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-[#1264d8] focus-within:ring-2 focus-within:ring-blue-100"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-none stroke-slate-400" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input aria-label="Search orders, customers, routes, trucks or cargo" value={searchQuery} onChange={(event) => onSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent px-2 text-sm text-[#10233f] outline-none" placeholder="Order #, customer, phone, route, truck, cargo…" />{searchQuery && <button type="button" onClick={() => onSearch("")} className="min-h-11 shrink-0 px-2 text-xs font-semibold text-[#1264d8]">Clear</button>}</span></label>
        <label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.1em] text-slate-500">Status</span><select aria-label="Order status filter" value={status} onChange={(event) => onStatus(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#10233f] outline-none focus:border-[#1264d8]">{ADMIN_ORDER_STATUSES.map((value) => <option key={value} value={value}>{value === "all" ? `All statuses (${statusCounts.all ?? total})` : `${displayStatus(value)} (${statusCounts[value] ?? 0})`}</option>)}</select></label>
        <label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.1em] text-slate-500">Date</span><select aria-label="Order date filter" value={today ? "today" : "all"} onChange={(event) => onToday(event.target.value === "today")} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#10233f] outline-none focus:border-[#1264d8]"><option value="all">All dates</option><option value="today">Today</option></select></label>
        <label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.1em] text-slate-500">Rows</span><select aria-label="Orders per page" value={pageSize} onChange={(event) => onPageSize(Number(event.target.value) === 50 ? 50 : 100)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#10233f] outline-none focus:border-[#1264d8]">{ADMIN_ORDER_PAGE_SIZES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      </div>
      <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500"><span><strong className="text-[#10233f]">{total.toLocaleString()}</strong> {anyFilter ? "matching" : "total"} orders · Page {page} of {totalPages}</span><span>Customer and route discovery use the existing server search contract.</span></div>
    </div>

    {error && <div role="alert" className="mt-4 flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between"><span className="break-words">{error}</span><button type="button" onClick={onRetry} className="min-h-11 shrink-0 rounded-xl bg-red-700 px-4 py-3 text-xs font-bold text-white">Retry</button></div>}

    {loading ? <div role="status" className="mt-4 rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">Loading orders…</div> : orders.length === 0 ? <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center sm:p-14"><p className="font-display text-xl font-bold text-[#10233f]">No orders found</p><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">No order matches the current search, status and date scope.</p>{anyFilter && <button type="button" onClick={() => { onSearch(""); onStatus("all"); onToday(false); }} className="mt-5 min-h-11 rounded-xl bg-[#10233f] px-5 py-3 text-sm font-bold text-white">Clear filters</button>}</div> : <>
      <div className="mt-4 grid gap-3 lg:hidden">{orders.map((order) => <MobileOrderCard key={order.id} order={order} onManage={onManage} />)}</div>
      <div className="mt-4 hidden min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)] lg:block">
        <div className="overflow-x-auto"><table className="w-full min-w-[1180px] border-collapse text-left"><thead className="bg-slate-50"><tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-[.09em] text-slate-500"><th className="px-4 py-3.5">Order / customer</th><th className="px-4 py-3.5">Route</th><th className="px-4 py-3.5">Truck / load</th><th className="px-4 py-3.5">Amount / payment</th><th className="px-4 py-3.5">Driver assignment</th><th className="px-4 py-3.5">Order status</th><th className="px-4 py-3.5">Created / delivered</th><th className="px-4 py-3.5 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{orders.map((order) => {
          const delayed = isDelayed(order); const unassigned = isUnassigned(order);
          return <tr key={order.id} className="align-top transition hover:bg-blue-50/25"><td className="px-4 py-4"><p className="font-mono text-[11px] font-bold text-[#1264d8]">{order.tracking_id}</p><p className="mt-1 max-w-[180px] break-words text-sm font-semibold text-[#10233f]">{order.customer_name || order.customer_phone || "Customer"}</p>{order.customer_phone && <p className="mt-1 text-[11px] text-slate-500">{order.customer_phone}</p>}{(delayed || unassigned) && <div className="mt-2 flex flex-wrap gap-1.5">{delayed && <span className="rounded-full bg-red-50 px-2 py-1 text-[9px] font-bold uppercase text-red-700">Delayed</span>}{unassigned && <span className="rounded-full bg-amber-50 px-2 py-1 text-[9px] font-bold uppercase text-amber-800">Unassigned</span>}</div>}</td><td className="max-w-[240px] px-4 py-4"><p className="break-words text-xs font-semibold leading-5 text-[#10233f]">{order.pickup_address}</p><p className="my-1 text-[10px] font-bold text-[#1264d8]">→</p><p className="break-words text-xs font-semibold leading-5 text-[#10233f]">{order.dropoff_address}</p></td><td className="max-w-[170px] px-4 py-4"><p className="break-words text-xs font-semibold text-[#10233f]">{order.vehicle_type || "—"}</p><p className="mt-1 break-words text-[11px] leading-4 text-slate-500">{order.cargo_description || "No cargo description"}</p></td><td className="px-4 py-4"><p className="whitespace-nowrap text-xs font-bold text-[#10233f]">{money(order.price_etb)}</p><div className="mt-2"><Badge value={order.payment_status} kind="payment" /></div></td><td className="max-w-[190px] px-4 py-4"><p className="break-words text-xs font-semibold leading-5 text-[#10233f]">{order.assignment_label || "Driver and truck not assigned"}</p></td><td className="px-4 py-4"><Badge value={order.status} /></td><td className="max-w-[170px] px-4 py-4 text-[11px] leading-5 text-slate-500"><p><span className="font-semibold text-slate-600">Created:</span> {when(order.created_at)}</p><p className="mt-1"><span className="font-semibold text-slate-600">Delivered:</span> {when(order.delivered_at)}</p></td><td className="px-4 py-4 text-right"><button type="button" onClick={() => onManage(order)} className="min-h-11 whitespace-nowrap rounded-xl bg-[#1264d8] px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-[#0d56bb]">Manage Order</button></td></tr>;
        })}</tbody></table></div>
      </div>
      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPage={onPage} />}
    </>}
  </section>;
}
