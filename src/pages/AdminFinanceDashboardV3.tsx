import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatEtb } from "../utils/currency";
import {
  computeFinanceSummary,
  dailySeries,
  groupAmount,
  inRange,
  numberOf,
  type FinanceDashboardData,
  type FinanceRange,
} from "../domain/finance-dashboard";
import {
  FINANCE_V3_PAGE_SIZES,
  getAdminFinanceV3Report,
  type FinanceV3BreakdownRow,
  type FinanceV3KpiKey,
  type FinanceV3Report,
} from "../services/admin-finance-v3.service";
import { supabase } from "../services/supabase.client";

type Props = { fixture?: FinanceDashboardData };

const EMPTY_REPORT: FinanceV3Report = {
  summary: {
    todayRevenue: 0, weeklyRevenue: 0, monthlyRevenue: 0, releasedPayments: 0, heldEscrow: 0,
    pendingReviews: 0, refundedPayments: 0, failedPayments: 0, commissionEarned: 0, commissionPaid: 0,
    outstandingCommission: 0, driverDeposits: 0, availableDriverDeposits: 0, netPlatformRevenue: 0, activeWallets: 0,
  },
  trend: [],
  breakdowns: { providers: [], routes: [], drivers: [], customers: [], trucks: [] },
  signals: { highValue: 0, oldEscrow: 0, refunds: 0, failed: 0, depositMismatch: false },
  providers: [],
  drilldown: { page: 1, pageSize: 50, total: 0, totalPages: 1, rows: [] },
};

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: unknown) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }

function eventForKpi(kpi: FinanceV3KpiKey | null) {
  if (kpi === "released") return "released";
  if (kpi === "escrow") return "held_escrow";
  if (kpi === "pending") return "initiated";
  if (kpi === "refunds") return "refunded";
  if (kpi === "failed") return "failed";
  return null;
}

function fixtureReport(
  fixture: FinanceDashboardData,
  range: FinanceRange,
  provider: string,
  driver: string,
  customer: string,
  route: string,
  truck: string,
  query: string,
  activeKpi: FinanceV3KpiKey | null,
  page: number,
  pageSize: number,
): FinanceV3Report {
  const profileById = new Map(fixture.profiles.map((profile) => [profile.id, profile]));
  const filteredOrders = fixture.orders.filter((order) => {
    const driverLabel = profileById.get(order.driver_id ?? "")?.full_name ?? "";
    const routeLabel = `${order.pickup_address} → ${order.dropoff_address}`;
    const haystack = [order.tracking_id, order.customer_name, order.pickup_address, order.dropoff_address, order.vehicle_type, driverLabel].join(" ").toLowerCase();
    return (!driver.trim() || driverLabel.toLowerCase().includes(driver.trim().toLowerCase()))
      && (!customer.trim() || String(order.customer_name ?? "").toLowerCase().includes(customer.trim().toLowerCase()))
      && (!route.trim() || routeLabel.toLowerCase().includes(route.trim().toLowerCase()))
      && (!truck.trim() || order.vehicle_type.toLowerCase().includes(truck.trim().toLowerCase()))
      && (!query.trim() || haystack.includes(query.trim().toLowerCase()));
  });
  const orderById = new Map(filteredOrders.map((order) => [order.id, order]));
  const ids = new Set(filteredOrders.map((order) => order.id));
  const payments = fixture.payments.filter((payment) => ids.has(payment.order_id)
    && inRange(payment.created_at, range)
    && (provider === "all" || payment.provider === provider));
  const summary = computeFinanceSummary({ ...fixture, orders: filteredOrders, payments });
  const released = payments.filter((payment) => payment.event === "released");
  const event = eventForKpi(activeKpi);
  const drillPayments = event ? payments.filter((payment) => payment.event === event) : payments;
  const start = (Math.max(1, page) - 1) * pageSize;
  const pageRows = drillPayments.slice(start, start + pageSize);
  const breakdown = (key: (payment: (typeof released)[number]) => string) => groupAmount(released, key, (payment) => numberOf(payment.amount_etb)).slice(0, 8);
  return {
    summary,
    trend: dailySeries(payments, range === "90d" ? 30 : 14).map((item) => ({ date: item.label, revenue: item.revenue, escrow: item.escrow, commission: item.commission })),
    breakdowns: {
      providers: breakdown((payment) => payment.provider || "Unknown"),
      routes: breakdown((payment) => { const order = orderById.get(payment.order_id); return order ? `${order.pickup_address} → ${order.dropoff_address}` : "Unknown route"; }),
      drivers: breakdown((payment) => profileById.get(orderById.get(payment.order_id)?.driver_id ?? "")?.full_name || "Unassigned"),
      customers: breakdown((payment) => orderById.get(payment.order_id)?.customer_name || "Unknown customer"),
      trucks: breakdown((payment) => orderById.get(payment.order_id)?.vehicle_type || "Unknown"),
    },
    signals: {
      highValue: released.filter((payment) => numberOf(payment.amount_etb) >= 100_000).length,
      oldEscrow: payments.filter((payment) => payment.event === "held_escrow" && Date.now() - new Date(payment.created_at).getTime() > 3 * 86400000).length,
      refunds: payments.filter((payment) => payment.event === "refunded").length,
      failed: payments.filter((payment) => payment.event === "failed").length,
      depositMismatch: summary.outstandingCommission > summary.driverDeposits,
    },
    providers: [...new Set(fixture.payments.map((payment) => payment.provider).filter(Boolean))].sort(),
    drilldown: {
      page: Math.max(1, page), pageSize, total: drillPayments.length, totalPages: Math.max(1, Math.ceil(drillPayments.length / pageSize)),
      rows: pageRows.map((payment) => {
        const order = orderById.get(payment.order_id);
        return {
          id: payment.id, order_id: payment.order_id, provider: payment.provider, provider_ref: payment.provider_ref,
          amount_etb: numberOf(payment.amount_etb), event: payment.event, created_at: payment.created_at, reviewed_at: payment.reviewed_at ?? null,
          tracking_id: order?.tracking_id ?? payment.order_id, customer_name: order?.customer_name ?? null,
          driver_name: profileById.get(order?.driver_id ?? "")?.full_name ?? null,
          pickup_address: order?.pickup_address ?? "", dropoff_address: order?.dropoff_address ?? "", vehicle_type: order?.vehicle_type ?? "",
        };
      }),
    },
  };
}

export function AdminFinanceDashboardV3({ fixture }: Props) {
  const [report, setReport] = useState<FinanceV3Report>(EMPTY_REPORT);
  const [loading, setLoading] = useState(!fixture);
  const [error, setError] = useState("");
  const [range, setRange] = useState<FinanceRange>("30d");
  const [provider, setProvider] = useState("all");
  const [driver, setDriver] = useState("");
  const [customer, setCustomer] = useState("");
  const [route, setRoute] = useState("");
  const [truck, setTruck] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedFilters, setDebouncedFilters] = useState({ driver: "", customer: "", route: "", truck: "", query: "" });
  const [activeKpi, setActiveKpi] = useState<FinanceV3KpiKey | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [updatedAt, setUpdatedAt] = useState(new Date());
  const requestSequence = useRef(0);
  const loadRef = useRef<() => Promise<void>>(async () => {});
  const realtimeRefreshTimer = useRef<number | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedFilters({ driver, customer, route, truck, query }), 300);
    return () => window.clearTimeout(timer);
  }, [driver, customer, route, truck, query]);

  const effectiveDriver = fixture ? driver : debouncedFilters.driver;
  const effectiveCustomer = fixture ? customer : debouncedFilters.customer;
  const effectiveRoute = fixture ? route : debouncedFilters.route;
  const effectiveTruck = fixture ? truck : debouncedFilters.truck;
  const effectiveQuery = fixture ? query : debouncedFilters.query;

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError("");
    try {
      const next = fixture
        ? fixtureReport(fixture, range, provider, effectiveDriver, effectiveCustomer, effectiveRoute, effectiveTruck, effectiveQuery, activeKpi, page, pageSize)
        : await getAdminFinanceV3Report({ range, provider, driver: effectiveDriver, customer: effectiveCustomer, route: effectiveRoute, truck: effectiveTruck, search: effectiveQuery, activeKpi, page, pageSize });
      if (requestId !== requestSequence.current) return;
      setReport(next);
      if (next.drilldown.page !== page) setPage(next.drilldown.page);
      setUpdatedAt(new Date());
    } catch (err) {
      if (requestId !== requestSequence.current) return;
      setError(`database report source failed: ${err instanceof Error ? err.message : "Unknown finance reporting error."}`);
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [fixture, range, provider, effectiveDriver, effectiveCustomer, effectiveRoute, effectiveTruck, effectiveQuery, activeKpi, page, pageSize]);

  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (fixture) return;
    const scheduleRefresh = () => {
      if (realtimeRefreshTimer.current !== null) return;
      realtimeRefreshTimer.current = window.setTimeout(() => {
        realtimeRefreshTimer.current = null;
        void loadRef.current();
      }, 500);
    };
    const channel = supabase.channel("finance-dashboard-v3-report")
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_commission_charges" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_commission_payments" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_commission_deposits" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "financial_corrections" }, scheduleRefresh)
      .subscribe();
    return () => {
      if (realtimeRefreshTimer.current !== null) window.clearTimeout(realtimeRefreshTimer.current);
      realtimeRefreshTimer.current = null;
      void supabase.removeChannel(channel);
    };
  }, [fixture]);

  const maxTrend = useMemo(() => Math.max(1, ...report.trend.flatMap((item) => [item.revenue, item.escrow, item.commission])), [report.trend]);
  const resetPage = <T,>(setter: (value: T) => void, value: T) => { setter(value); setPage(1); };

  function selectKpi(kpi: FinanceV3KpiKey) {
    setActiveKpi((current) => current === kpi ? null : kpi);
    setPage(1);
  }

  function exportCsv() {
    const rows = [["Tracking", "Provider", "Reference", "Event", "Amount ETB", "Driver", "Route", "Created"]];
    for (const row of report.drilldown.rows) rows.push([row.tracking_id, row.provider, row.provider_ref ?? "", row.event, String(row.amount_etb), row.driver_name ?? "", `${row.pickup_address} → ${row.dropoff_address}`, row.created_at]);
    download("hallo-finance-v3-page.csv", rows.map((row) => row.map(csvCell).join(",")).join("\n"), "text/csv;charset=utf-8");
  }

  function exportExcel() {
    const header = ["Tracking", "Provider", "Reference", "Event", "Amount ETB", "Driver", "Route", "Created"].join("\t");
    const body = report.drilldown.rows.map((row) => [row.tracking_id, row.provider, row.provider_ref ?? "", row.event, row.amount_etb, row.driver_name ?? "", `${row.pickup_address} → ${row.dropoff_address}`, row.created_at].join("\t")).join("\n");
    download("hallo-finance-v3-page.xls", `${header}\n${body}`, "application/vnd.ms-excel;charset=utf-8");
  }

  return <main className="min-h-screen overflow-x-hidden bg-[#f5f3ed] p-4 text-asphalt sm:p-7 lg:p-10">
    <div className="mx-auto max-w-[1500px]">
      <section className="bg-asphalt p-5 text-white sm:p-8">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div><p className="font-mono text-[10px] tracking-[.22em] text-amber">ENTERPRISE FINANCE INTELLIGENCE</p><h1 className="mt-3 font-display text-3xl font-bold sm:text-4xl">Finance Dashboard V3</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">DB-backed revenue, escrow, commission, wallet, trend and exception intelligence without bulk ledger loading.</p></div>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={exportCsv} className="min-h-11 border border-white/20 px-4 py-3 text-xs font-semibold">CSV page</button><button type="button" onClick={exportExcel} className="min-h-11 border border-white/20 px-4 py-3 text-xs font-semibold">Excel page</button><button type="button" onClick={() => window.print()} className="min-h-11 bg-amber px-4 py-3 text-xs font-semibold text-asphalt">PDF / Print</button></div>
        </div>
        <p className="mt-5 font-mono text-[9px] tracking-wide text-white/35">LIVE · updated {updatedAt.toLocaleTimeString()}</p>
      </section>

      <section className="mt-5 grid gap-3 border border-asphalt/10 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <label className="text-[10px] font-semibold uppercase tracking-wide">Date range<select value={range} onChange={(event) => resetPage(setRange, event.target.value as FinanceRange)} className="mt-2 min-h-11 w-full border border-asphalt/15 px-3 text-xs normal-case"><option value="today">Today</option><option value="7d">7 days</option><option value="30d">30 days</option><option value="90d">90 days</option><option value="all">All time</option></select></label>
        <label className="text-[10px] font-semibold uppercase tracking-wide">Provider<select value={provider} onChange={(event) => resetPage(setProvider, event.target.value)} className="mt-2 min-h-11 w-full border border-asphalt/15 px-3 text-xs normal-case"><option value="all">All</option>{report.providers.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <SearchFilter label="Driver" value={driver} onChange={(value) => resetPage(setDriver, value)} placeholder="Name or phone" />
        <SearchFilter label="Customer" value={customer} onChange={(value) => resetPage(setCustomer, value)} placeholder="Name or phone" />
        <SearchFilter label="Route" value={route} onChange={(value) => resetPage(setRoute, value)} placeholder="Addis → Adama" />
        <SearchFilter label="Truck" value={truck} onChange={(value) => resetPage(setTruck, value)} placeholder="Dry Cargo" />
        <SearchFilter label="Global search" value={query} onChange={(value) => resetPage(setQuery, value)} placeholder="Tracking, ref, route" />
      </section>

      {error ? <section className="mt-5 border border-route/30 bg-white p-6" role="alert"><p className="font-display text-xl font-bold text-route">Finance data failed to load</p><p className="mt-2 break-words text-sm text-steel">{error}</p><p className="mt-2 text-xs text-steel">No KPI values are shown because one or more finance sources failed.</p><button type="button" onClick={() => void load()} className="mt-4 min-h-11 bg-asphalt px-5 py-3 text-sm font-semibold text-white">Retry finance data</button></section> : loading ? <section className="mt-5 border border-asphalt/10 bg-white p-10 text-center" aria-live="polite"><p className="font-mono text-sm text-steel">Loading DB-side finance report…</p></section> : <>
        <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <Kpi label="Today's revenue" value={formatEtb(report.summary.todayRevenue)} onClick={() => selectKpi("released")} />
          <Kpi label="Weekly revenue" value={formatEtb(report.summary.weeklyRevenue)} onClick={() => selectKpi("released")} />
          <Kpi label="Monthly revenue" value={formatEtb(report.summary.monthlyRevenue)} onClick={() => selectKpi("released")} />
          <Kpi label="Released" value={formatEtb(report.summary.releasedPayments)} onClick={() => selectKpi("released")} />
          <Kpi label="Held escrow" value={formatEtb(report.summary.heldEscrow)} onClick={() => selectKpi("escrow")} warning={report.summary.heldEscrow > 0} />
          <Kpi label="Pending reviews" value={String(report.summary.pendingReviews)} onClick={() => selectKpi("pending")} warning={report.summary.pendingReviews > 0} />
          <Kpi label="Refunded" value={formatEtb(report.summary.refundedPayments)} onClick={() => selectKpi("refunds")} danger={report.summary.refundedPayments > 0} />
          <Kpi label="Failed" value={formatEtb(report.summary.failedPayments)} onClick={() => selectKpi("failed")} danger={report.summary.failedPayments > 0} />
          <Kpi label="Commission earned" value={formatEtb(report.summary.commissionEarned)} onClick={() => selectKpi("commission")} />
          <Kpi label="Commission paid" value={formatEtb(report.summary.commissionPaid)} onClick={() => selectKpi("commission")} />
          <Kpi label="Outstanding commission" value={formatEtb(report.summary.outstandingCommission)} onClick={() => selectKpi("commission")} warning={report.summary.outstandingCommission > 0} />
          <Kpi label="Driver deposits" value={formatEtb(report.summary.driverDeposits)} onClick={() => selectKpi("deposits")} />
          <Kpi label="Available deposits" value={formatEtb(report.summary.availableDriverDeposits)} onClick={() => selectKpi("deposits")} />
          <Kpi label="Net platform revenue" value={formatEtb(report.summary.netPlatformRevenue)} strong onClick={() => selectKpi("released")} />
          <Kpi label="Active wallets" value={String(report.summary.activeWallets)} onClick={() => selectKpi("wallets")} />
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
          <Panel title={range === "90d" ? "30-day revenue, escrow and commission trend" : "14-day revenue, escrow and commission trend"} eyebrow="FINANCE PULSE">
            <div className="overflow-x-auto"><div className="flex min-w-[680px] items-end gap-2 p-5" style={{ height: 290 }}>{report.trend.map((item) => <div key={item.date} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"><div className="flex h-52 w-full items-end justify-center gap-1"><span title={`Revenue ${formatEtb(item.revenue)}`} className="w-2.5 bg-asphalt" style={{ height: `${Math.max(2, item.revenue / maxTrend * 100)}%` }} /><span title={`Escrow ${formatEtb(item.escrow)}`} className="w-2.5 bg-amber" style={{ height: `${Math.max(2, item.escrow / maxTrend * 100)}%` }} /><span title={`Commission ${formatEtb(item.commission)}`} className="w-2.5 bg-emerald-600" style={{ height: `${Math.max(2, item.commission / maxTrend * 100)}%` }} /></div><span className="rotate-[-35deg] whitespace-nowrap text-[8px] text-steel">{new Date(item.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></div>)}</div></div>
            <div className="flex flex-wrap gap-4 border-t border-asphalt/10 p-4 text-[10px] text-steel"><span>■ Revenue</span><span className="text-amber">■ Escrow</span><span className="text-emerald-700">■ Commission</span></div>
          </Panel>
          <Panel title="Finance intelligence" eyebrow="SMART SIGNALS">
            <Signal label="High-value released payments" value={report.signals.highValue} tone={report.signals.highValue ? "warning" : "ok"} />
            <Signal label="Escrow older than 3 days" value={report.signals.oldEscrow} tone={report.signals.oldEscrow ? "danger" : "ok"} />
            <Signal label="Refund events" value={report.signals.refunds} tone={report.signals.refunds ? "danger" : "ok"} />
            <Signal label="Failed payments" value={report.signals.failed} tone={report.signals.failed ? "danger" : "ok"} />
            <Signal label="Deposit reconciliation" value={report.signals.depositMismatch ? "Mismatch" : "Healthy"} tone={report.signals.depositMismatch ? "danger" : "ok"} />
          </Panel>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-2 xl:grid-cols-4"><Breakdown title="Payment providers" rows={report.breakdowns.providers} /><Breakdown title="Top routes" rows={report.breakdowns.routes} /><Breakdown title="Top drivers" rows={report.breakdowns.drivers} /><Breakdown title="Top customers" rows={report.breakdowns.customers} /></section>
        <section className="mt-5"><Breakdown title="Revenue by truck type" rows={report.breakdowns.trucks} /></section>

        <Panel title={activeKpi ? `KPI drill-down · ${activeKpi}` : "Recent finance activity"} eyebrow="ACTIONABLE DETAIL" className="mt-5">
          <div className="flex flex-col gap-3 border-b border-asphalt/10 p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-steel"><span className="font-semibold text-asphalt">{report.drilldown.total.toLocaleString()}</span> matching records · Page {report.drilldown.page} of {report.drilldown.totalPages}</p><label className="flex items-center gap-2 text-xs font-semibold">Rows<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="min-h-11 border border-asphalt/15 bg-white px-3">{FINANCE_V3_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label></div>
          {report.drilldown.rows.length ? <div className="divide-y divide-asphalt/10">{report.drilldown.rows.map((row) => <PaymentRow key={row.id} row={row} />)}</div> : <p className="p-6 text-sm text-steel">No finance records match the current filters.</p>}
          {report.drilldown.totalPages > 1 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-asphalt/10 p-4"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="min-h-11 border border-asphalt/15 px-4 text-xs font-semibold disabled:opacity-35">Previous</button><span className="text-xs text-steel">Page {report.drilldown.page} / {report.drilldown.totalPages}</span><button type="button" disabled={page >= report.drilldown.totalPages} onClick={() => setPage((value) => value + 1)} className="min-h-11 border border-asphalt/15 px-4 text-xs font-semibold disabled:opacity-35">Next</button></div>}
        </Panel>
      </>}
    </div>
  </main>;
}

function SearchFilter({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="min-w-0 text-[10px] font-semibold uppercase tracking-wide">{label}<input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-2 min-h-11 w-full min-w-0 border border-asphalt/15 px-3 text-xs normal-case" /></label>;
}

function Kpi({ label, value, onClick, strong, warning, danger }: { label: string; value: string; onClick: () => void; strong?: boolean; warning?: boolean; danger?: boolean }) {
  return <button type="button" onClick={onClick} className={`min-w-0 border p-4 text-left transition hover:-translate-y-0.5 ${strong ? "border-asphalt bg-asphalt text-white" : danger ? "border-route/30 bg-route/5" : warning ? "border-amber/60 bg-amber/10" : "border-asphalt/10 bg-white"}`}><p className="font-mono text-[9px] uppercase tracking-wide opacity-60">{label}</p><p className="mt-3 break-words font-display text-xl font-bold sm:text-2xl">{value}</p></button>;
}

function Panel({ title, eyebrow, children, className = "" }: { title: string; eyebrow: string; children: React.ReactNode; className?: string }) {
  return <section className={`min-w-0 overflow-hidden border border-asphalt/10 bg-white ${className}`}><div className="border-b border-asphalt/10 p-4 sm:p-5"><p className="font-mono text-[9px] tracking-[.18em] text-amber-dim">{eyebrow}</p><h2 className="mt-2 break-words font-display text-lg font-bold">{title}</h2></div>{children}</section>;
}

function Signal({ label, value, tone }: { label: string; value: number | string; tone: "ok" | "warning" | "danger" }) {
  return <div className="flex items-center justify-between gap-4 border-b border-asphalt/10 p-4 last:border-0"><span className="text-xs text-steel">{label}</span><strong className={tone === "danger" ? "text-route" : tone === "warning" ? "text-amber-dim" : "text-emerald-700"}>{value}</strong></div>;
}

function Breakdown({ title, rows }: { title: string; rows: FinanceV3BreakdownRow[] }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return <Panel title={title} eyebrow="BREAKDOWN">{rows.length ? <div className="space-y-3 p-4">{rows.map((row) => <div key={row.label} className="min-w-0"><div className="flex items-start justify-between gap-3 text-xs"><span className="min-w-0 break-words text-steel">{row.label}</span><strong className="shrink-0">{formatEtb(row.value)}</strong></div><div className="mt-2 h-1.5 bg-asphalt/10"><div className="h-full bg-asphalt" style={{ width: `${Math.max(3, row.value / max * 100)}%` }} /></div></div>)}</div> : <p className="p-4 text-xs text-steel">No matching data.</p>}</Panel>;
}

function PaymentRow({ row }: { row: FinanceV3Report["drilldown"]["rows"][number] }) {
  return <article className="min-w-0 p-4 sm:p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="font-display text-lg">{formatEtb(row.amount_etb)}</strong><span className="bg-amber/15 px-2.5 py-1 text-[10px] font-semibold capitalize text-amber-dim">{row.event.replace(/_/g, " ")}</span></div><p className="mt-2 break-words font-mono text-xs">{row.tracking_id}</p><p className="mt-1 break-words text-xs text-steel">{row.pickup_address} → {row.dropoff_address}</p><p className="mt-1 break-words text-xs text-steel">{row.customer_name ?? "Customer"} · {row.driver_name ?? "Unassigned driver"}</p><p className="mt-1 break-words text-xs text-steel">{row.provider}{row.provider_ref ? ` · ${row.provider_ref}` : ""}</p></div><time className="shrink-0 text-[10px] text-steel">{new Date(row.created_at).toLocaleString()}</time></div></article>;
}
