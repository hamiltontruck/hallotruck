import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ADMIN_REPORT_PAGE_SIZES,
  ADMIN_REPORT_RANGES,
  ADMIN_REPORT_STATUSES,
  getAdminReportsV2,
  type AdminReportRange,
  type AdminReportStatus,
  type AdminReportsV2,
} from "../services/admin-reports.service";
import { supabase } from "../services/supabase.client";

const RANGE_LABELS: Record<AdminReportRange, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

function isRange(value: string | null): value is AdminReportRange {
  return ADMIN_REPORT_RANGES.includes(value as AdminReportRange);
}

function isStatus(value: string | null): value is AdminReportStatus {
  return ADMIN_REPORT_STATUSES.includes(value as AdminReportStatus);
}

function money(value: number) {
  return `ETB ${Math.max(0, value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <article className="min-w-0 border border-asphalt/10 bg-white p-4 min-[360px]:p-5 sm:p-6"><p className="text-[10px] font-semibold uppercase tracking-wide text-steel">{label}</p><p className="mt-3 break-words font-display text-xl font-bold min-[360px]:text-2xl">{value}</p><p className="mt-2 break-words text-[11px] text-steel">{note}</p></article>;
}

function Breakdown({ title, rows }: { title: string; rows: AdminReportsV2["topRoutes"] }) {
  return <section className="min-w-0 border border-asphalt/10 bg-white"><div className="border-b border-asphalt/10 p-4"><h2 className="font-display text-lg font-semibold">{title}</h2></div>{rows.length ? <div className="divide-y divide-asphalt/10">{rows.map((row) => <div key={`${title}-${row.label}`} className="flex min-w-0 flex-col gap-2 p-4 min-[430px]:flex-row min-[430px]:items-start min-[430px]:justify-between"><div className="min-w-0"><p className="break-words text-sm font-semibold">{row.label}</p>{row.phone && <p className="mt-1 break-words text-xs text-steel">{row.phone}</p>}<p className="mt-1 text-xs text-steel">{row.delivered.toLocaleString()} delivered</p></div><div className="shrink-0 text-left min-[430px]:text-right"><p className="text-sm font-semibold">{row.orders.toLocaleString()} orders</p><p className="mt-1 text-xs text-steel">{money(row.invoiceEtb)}</p></div></div>)}</div> : <p className="p-6 text-sm text-steel">No matching data.</p>}</section>;
}

export function AdminReports() {
  const [params, setParams] = useSearchParams();
  const range = isRange(params.get("range")) ? params.get("range") as AdminReportRange : "30d";
  const status = isStatus(params.get("status")) ? params.get("status") as AdminReportStatus : "all";
  const customer = params.get("customer") ?? "";
  const route = params.get("route") ?? "";
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const pageSize = Number(params.get("page_size")) === 100 ? 100 : 50;
  const [draftCustomer, setDraftCustomer] = useState(customer);
  const [draftRoute, setDraftRoute] = useState(route);
  const [data, setData] = useState<AdminReportsV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);
  const loadRef = useRef<() => Promise<void>>(async () => {});
  const realtimeTimer = useRef<number | null>(null);

  useEffect(() => setDraftCustomer(customer), [customer]);
  useEffect(() => setDraftRoute(route), [route]);

  const update = useCallback((changes: Partial<{ range: AdminReportRange; status: AdminReportStatus; customer: string; route: string; page: number; pageSize: number }>) => {
    const next = new URLSearchParams(params);
    if (changes.range !== undefined) changes.range === "30d" ? next.delete("range") : next.set("range", changes.range);
    if (changes.status !== undefined) changes.status === "all" ? next.delete("status") : next.set("status", changes.status);
    if (changes.customer !== undefined) changes.customer.trim() ? next.set("customer", changes.customer.trim()) : next.delete("customer");
    if (changes.route !== undefined) changes.route.trim() ? next.set("route", changes.route.trim()) : next.delete("route");
    if (changes.page !== undefined) changes.page <= 1 ? next.delete("page") : next.set("page", String(changes.page));
    if (changes.pageSize !== undefined) changes.pageSize === 50 ? next.delete("page_size") : next.set("page_size", String(changes.pageSize));
    if (changes.range !== undefined || changes.status !== undefined || changes.customer !== undefined || changes.route !== undefined || changes.pageSize !== undefined) next.delete("page");
    setParams(next, { replace: true });
  }, [params, setParams]);

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError("");
    try {
      const next = await getAdminReportsV2({ range, status, customer, route, page, pageSize });
      if (requestId !== requestSequence.current) return;
      setData(next);
      if (next.page.page !== page) update({ page: next.page.page });
    } catch (reason) {
      if (requestId !== requestSequence.current) return;
      setError(reason instanceof Error ? reason.message : "Could not load Admin reports.");
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [range, status, customer, route, page, pageSize, update]);

  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const queueRefresh = () => {
      if (realtimeTimer.current !== null) return;
      realtimeTimer.current = window.setTimeout(() => {
        realtimeTimer.current = null;
        void loadRef.current();
      }, 600);
    };
    const channel = supabase.channel("admin-reports-v2-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, queueRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, queueRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, queueRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, queueRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "trucks" }, queueRefresh)
      .subscribe();
    return () => {
      if (realtimeTimer.current !== null) window.clearTimeout(realtimeTimer.current);
      realtimeTimer.current = null;
      void supabase.removeChannel(channel);
    };
  }, []);

  function applyTextFilters(event: FormEvent) {
    event.preventDefault();
    update({ customer: draftCustomer, route: draftRoute });
  }

  function clearFilters() {
    setDraftCustomer("");
    setDraftRoute("");
    const next = new URLSearchParams(params);
    for (const key of ["range", "status", "customer", "route", "page", "page_size"]) next.delete(key);
    setParams(next, { replace: true });
  }

  function exportCsv() {
    if (!data) return;
    const rows = [["Tracking", "Created", "Customer", "Phone", "Route", "Vehicle", "Status", "Payment status", "Invoice ETB"]];
    for (const row of data.page.rows) rows.push([row.trackingId, row.createdAt, row.customerName ?? "", row.customerPhone ?? "", `${row.pickupAddress} → ${row.dropoffAddress}`, row.vehicleType, row.status, row.paymentStatus, String(row.priceEtb)]);
    download(`hallo-admin-reports-page-${data.page.page}.csv`, rows.map((row) => row.map(csvCell).join(",")).join("\n"), "text/csv;charset=utf-8");
  }

  function exportExcel() {
    if (!data) return;
    const rows = [["Tracking", "Created", "Customer", "Phone", "Route", "Vehicle", "Status", "Payment status", "Invoice ETB"]];
    for (const row of data.page.rows) rows.push([row.trackingId, row.createdAt, row.customerName ?? "", row.customerPhone ?? "", `${row.pickupAddress} → ${row.dropoffAddress}`, row.vehicleType, row.status, row.paymentStatus, String(row.priceEtb)]);
    download(`hallo-admin-reports-page-${data.page.page}.xls`, rows.map((row) => row.join("\t")).join("\n"), "application/vnd.ms-excel;charset=utf-8");
  }

  const summary = data?.summary;
  const releasedNet = summary ? Math.max(0, summary.releasedGrossEtb - summary.refundedEtb) : 0;
  const completionRate = summary && summary.totalOrders ? Math.round(summary.deliveredOrders / summary.totalOrders * 100) : 0;
  const fleetUtilization = summary && summary.totalTrucks ? Math.round(summary.assignedTrucks / summary.totalTrucks * 100) : 0;

  return <main className="min-h-screen overflow-x-hidden bg-[#f5f3ed] p-3 pb-24 text-asphalt min-[360px]:p-4 sm:p-7 lg:p-9"><div className="mx-auto max-w-[1500px]">
    <header className="overflow-hidden bg-asphalt p-5 text-white sm:p-8"><div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"><div className="min-w-0"><p className="font-mono text-[10px] tracking-[.2em] text-amber">ADMIN REPORTS V2 · DB-SIDE</p><h1 className="mt-3 break-words font-display text-3xl font-bold sm:text-4xl">Operational reports at scale</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">Date, status, customer and route filters execute in PostgreSQL. Only the requested 50 or 100 order rows are returned to the browser.</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={!data} onClick={exportCsv} className="min-h-11 border border-white/20 px-4 py-3 text-xs font-semibold disabled:opacity-40">CSV current page</button><button type="button" disabled={!data} onClick={exportExcel} className="min-h-11 border border-white/20 px-4 py-3 text-xs font-semibold disabled:opacity-40">Excel current page</button><button type="button" onClick={() => window.print()} className="min-h-11 bg-amber px-4 py-3 text-xs font-semibold text-asphalt">PDF / Print</button></div></div></header>

    <section className="mt-4 border border-asphalt/10 bg-white p-4 sm:p-5"><div className="grid gap-4 lg:grid-cols-[180px_1fr] lg:items-end"><label className="text-[10px] font-semibold uppercase tracking-wide text-steel">Report period<select value={range} onChange={(event) => update({ range: event.target.value as AdminReportRange })} className="mt-2 min-h-11 w-full border border-asphalt/15 bg-white px-3 text-sm font-semibold text-asphalt">{ADMIN_REPORT_RANGES.map((item) => <option key={item} value={item}>{RANGE_LABELS[item]}</option>)}</select></label><form onSubmit={applyTextFilters} className="grid min-w-0 gap-3 min-[600px]:grid-cols-[1fr_1fr_auto]"><label className="min-w-0 text-[10px] font-semibold uppercase tracking-wide text-steel">Customer<input value={draftCustomer} onChange={(event) => setDraftCustomer(event.target.value)} placeholder="Name or phone" className="mt-2 min-h-11 w-full min-w-0 border border-asphalt/15 px-3 text-sm font-normal normal-case text-asphalt" /></label><label className="min-w-0 text-[10px] font-semibold uppercase tracking-wide text-steel">Route<input value={draftRoute} onChange={(event) => setDraftRoute(event.target.value)} placeholder="Pickup or drop-off" className="mt-2 min-h-11 w-full min-w-0 border border-asphalt/15 px-3 text-sm font-normal normal-case text-asphalt" /></label><button type="submit" className="min-h-11 self-end bg-asphalt px-5 py-3 text-xs font-semibold text-white">Apply filters</button></form></div>
      <div className="mt-4 flex flex-wrap gap-2" aria-label="Report order status">{ADMIN_REPORT_STATUSES.map((item) => <button key={item} type="button" aria-pressed={status === item} onClick={() => update({ status: item })} className={`min-h-11 min-w-[5.4rem] flex-1 border px-3 py-2 text-[11px] font-semibold capitalize min-[430px]:flex-none ${status === item ? "border-asphalt bg-asphalt text-white" : "border-asphalt/10 bg-white text-steel"}`}>{item === "all" ? `All ${data?.statusCounts.all ?? "—"}` : `${item.replace(/_/g, " ")} ${data?.statusCounts[item] ?? 0}`}</button>)}</div>
      {(range !== "30d" || status !== "all" || customer || route || pageSize !== 50) && <button type="button" onClick={clearFilters} className="mt-3 text-xs font-semibold text-route underline underline-offset-4">Clear report filters</button>}
    </section>

    {error && <section role="alert" className="mt-4 border border-route/30 bg-route/10 p-5"><p className="font-display text-lg font-bold text-route">Reports failed to load</p><p className="mt-2 break-words text-sm text-route">{error}</p><button type="button" onClick={() => void load()} className="mt-4 min-h-11 bg-asphalt px-5 py-3 text-sm font-semibold text-white">Retry reports</button></section>}
    {loading && !data && <div role="status" className="mt-4 border border-asphalt/10 bg-white p-10 text-center text-sm text-steel">Loading DB-side reports…</div>}

    {!error && data && summary && <>
      <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Orders" value={summary.totalOrders.toLocaleString()} note={`${money(summary.invoiceEtb)} invoiced`} /><Metric label="Completion" value={`${completionRate}%`} note={`${summary.deliveredOrders.toLocaleString()} delivered`} /><Metric label="Active shipments" value={summary.activeShipments.toLocaleString()} note={`${summary.waitingAssignment.toLocaleString()} waiting assignment`} /><Metric label="Net released revenue" value={money(releasedNet)} note={`${money(summary.refundedEtb)} refunded`} /><Metric label="Held escrow" value={money(summary.heldEscrowEtb)} note="Payments in selected period" /><Metric label="Pending verification" value={money(summary.initiatedEtb)} note={`${summary.paymentsNeedingVerification.toLocaleString()} payment records`} /><Metric label="Fleet utilization" value={`${fleetUtilization}%`} note={`${summary.availableTrucks.toLocaleString()} available trucks`} /><Metric label="Approved drivers" value={summary.approvedDrivers.toLocaleString()} note={`${summary.totalDrivers.toLocaleString()} driver profiles`} /></section>

      <section className="mt-4 grid gap-4 xl:grid-cols-2"><Breakdown title="Top routes" rows={data.topRoutes} /><Breakdown title="Top customers" rows={data.topCustomers} /></section>

      <section className="mt-4 min-w-0 border border-asphalt/10 bg-white"><div className="flex flex-col gap-3 border-b border-asphalt/10 p-4 min-[430px]:flex-row min-[430px]:items-center min-[430px]:justify-between"><div><h2 className="font-display text-lg font-semibold">Filtered order detail</h2><p className="mt-1 text-xs text-steel"><strong className="text-asphalt">{data.page.total.toLocaleString()}</strong> matching orders · Page {data.page.page} of {data.page.totalPages}</p></div><label className="flex items-center gap-2 text-xs font-semibold">Rows<select value={pageSize} onChange={(event) => update({ pageSize: Number(event.target.value) })} className="min-h-11 border border-asphalt/15 bg-white px-3">{ADMIN_REPORT_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label></div>
        {data.page.rows.length ? <div className="divide-y divide-asphalt/10">{data.page.rows.map((row) => <article key={row.id} className="min-w-0 p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Link to={`/admin/operations?section=Orders&q=${encodeURIComponent(row.trackingId)}`} className="break-words font-mono text-xs font-semibold text-asphalt underline underline-offset-4">{row.trackingId}</Link><span className="bg-amber/15 px-2.5 py-1 text-[10px] font-semibold capitalize text-amber-dim">{row.status.replace(/_/g, " ")}</span></div><p className="mt-2 break-words text-sm font-semibold">{row.customerName ?? "Customer"}{row.customerPhone ? ` · ${row.customerPhone}` : ""}</p><p className="mt-1 break-words text-xs text-steel">{row.pickupAddress} → {row.dropoffAddress}</p><p className="mt-1 break-words text-xs text-steel">{row.vehicleType} · {money(row.priceEtb)} · Payment {row.paymentStatus.replace(/_/g, " ")}</p></div><time className="shrink-0 text-[10px] text-steel">{new Date(row.createdAt).toLocaleString()}</time></div></article>)}</div> : <p className="p-8 text-center text-sm text-steel">No orders match the current report filters.</p>}
        {data.page.totalPages > 1 && <nav aria-label="Reports pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-asphalt/10 p-4"><button type="button" disabled={data.page.page <= 1} onClick={() => update({ page: data.page.page - 1 })} className="min-h-11 border border-asphalt/15 px-4 text-xs font-semibold disabled:opacity-35">Previous</button><span className="text-xs text-steel">Page {data.page.page} / {data.page.totalPages}</span><button type="button" disabled={data.page.page >= data.page.totalPages} onClick={() => update({ page: data.page.page + 1 })} className="min-h-11 border border-asphalt/15 px-4 text-xs font-semibold disabled:opacity-35">Next</button></nav>}
      </section>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-steel"><p>Order range uses Ethiopia local-day boundaries; payment totals use the same selected local period.</p><Link to="/admin/intelligence" className="font-semibold text-amber-dim">Open Global Search & Intelligence →</Link></div>
    </>}
  </div></main>;
}
