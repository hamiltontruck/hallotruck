import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  buildAdminIntelligenceReport,
  searchAdminIntelligence,
  type AdminIntelligenceData,
  type AdminReportRange,
} from "../domain/admin-intelligence";
import { getAdminIntelligenceData } from "../services/admin-intelligence.service";
import { supabase } from "../services/supabase.client";

const RANGE_LABELS: Record<AdminReportRange, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

function isReportRange(value: string | null): value is AdminReportRange {
  return value === "today" || value === "7d" || value === "30d" || value === "90d" || value === "all";
}

function money(value: number) {
  return `ETB ${Math.max(0, value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function target(path: string, query: string) {
  return `${path}${path.includes("?") ? "&" : "?"}q=${encodeURIComponent(query)}`;
}

export function AdminIntelligence({ fixture = null }: { fixture?: AdminIntelligenceData | null } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialRange = isReportRange(searchParams.get("range")) ? searchParams.get("range") as AdminReportRange : "30d";
  const [data, setData] = useState<AdminIntelligenceData | null>(fixture);
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [range, setRange] = useState<AdminReportRange>(initialRange);
  const [loading, setLoading] = useState(!fixture);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (fixture) {
      setData(fixture);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setData(await getAdminIntelligenceData());
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Admin intelligence data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [fixture]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (fixture) return;
    const channel = supabase.channel("admin-intelligence-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "trucks" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [fixture, load]);

  const report = useMemo(() => data ? buildAdminIntelligenceReport(data, range) : null, [data, range]);
  const results = useMemo(() => data ? searchAdminIntelligence(data, query) : null, [data, query]);

  function updateUrl(nextQuery: string, nextRange: AdminReportRange) {
    const next = new URLSearchParams();
    if (nextQuery.trim()) next.set("q", nextQuery.trim());
    if (nextRange !== "30d") next.set("range", nextRange);
    setSearchParams(next, { replace: true });
  }

  function changeQuery(value: string) {
    setQuery(value);
    updateUrl(value, range);
  }

  function changeRange(value: AdminReportRange) {
    setRange(value);
    updateUrl(query, value);
  }

  if (loading) return <main className="min-h-screen bg-[#f5f3ed] p-5"><p className="py-24 text-center font-mono text-sm text-steel">Loading Admin intelligence…</p></main>;
  if (!data || !report || !results) return <main className="min-h-screen bg-[#f5f3ed] p-5"><div className="mx-auto max-w-3xl border border-route/30 bg-route/10 p-5 text-route"><p className="break-words">{error || "Admin intelligence is unavailable."}</p><button type="button" onClick={() => void load()} className="mt-4 bg-asphalt px-4 py-3 text-sm font-semibold text-white">Retry</button></div></main>;

  const maxTrend = Math.max(1, ...report.revenueTrend.map((day) => day.amountEtb));
  const maxStatus = Math.max(1, ...report.statusBreakdown.map((item) => item.count));
  const signals = [
    { label: "Orders need assignment", value: report.unassigned.length, detail: "Missing driver or truck", to: "/admin/operations?section=Orders", alert: report.unassigned.length > 0 },
    { label: "Payments need verification", value: report.pending.length, detail: money(report.pendingEtb), to: "/admin/payment-review", alert: report.pending.length > 0 },
    { label: "Funds held in escrow", value: report.heldEscrow.length, detail: money(report.escrowEtb), to: "/admin/payment-review", alert: report.heldEscrow.length > 0 },
  ];

  return <main className="min-h-screen overflow-x-hidden bg-[#f5f3ed] p-3 pb-24 text-asphalt sm:p-6 lg:p-8">
    <div className="mx-auto max-w-[1500px]">
      <header className="relative overflow-hidden bg-asphalt p-5 text-white sm:p-8 lg:p-10">
        <div className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full border-[58px] border-amber/10" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[10px] tracking-[.22em] text-amber">ADMIN INTELLIGENCE</span><span className="border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 font-mono text-[9px] tracking-wide text-emerald-300">● LIVE DATA</span></div>
            <h1 className="mt-4 break-words font-display text-[clamp(2rem,9vw,3.5rem)] font-bold leading-[1.05]">Search everything.<br className="hidden sm:block" /> Decide faster.</h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-white/60">One operational command center for orders, customers, drivers, trucks, transactions, revenue trends and exceptions.</p>
          </div>
          <div className="flex flex-wrap gap-2"><Link to="/admin" className="border border-white/20 px-4 py-3 text-sm font-semibold">CEO overview</Link><button type="button" onClick={() => void load()} className="bg-amber px-4 py-3 text-sm font-semibold text-asphalt">↻ Refresh intelligence</button></div>
        </div>
      </header>

      {error && <p className="mt-4 break-words border border-route/30 bg-route/10 p-4 text-sm text-route">{error}</p>}

      <section className="relative -mt-1 border border-asphalt/10 bg-white p-4 shadow-[0_18px_45px_rgba(29,34,42,.08)] sm:p-6">
        <div className="grid min-w-0 gap-4 lg:grid-cols-[1fr_220px]">
          <label className="min-w-0"><span className="text-[10px] font-semibold uppercase tracking-[.14em] text-steel">Global search</span><div className="mt-2 flex min-w-0 items-center border-2 border-asphalt bg-white px-3 focus-within:border-amber"><span className="shrink-0 text-xl">⌕</span><input type="search" value={query} onChange={(event) => changeQuery(event.target.value)} className="min-h-14 min-w-0 flex-1 px-3 text-sm outline-none sm:text-base" placeholder="Tracking, customer, phone, driver, plate, route, transaction…" />{query && <button type="button" onClick={() => changeQuery("")} className="shrink-0 px-2 py-3 text-xs font-semibold text-route">Clear</button>}</div></label>
          <label><span className="text-[10px] font-semibold uppercase tracking-[.14em] text-steel">Report period</span><select value={range} onChange={(event) => changeRange(event.target.value as AdminReportRange)} className="mt-2 min-h-14 w-full border border-asphalt/20 bg-white px-4 text-sm font-semibold outline-none focus:border-amber">{Object.entries(RANGE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <p className="mt-3 text-xs leading-5 text-steel">Search covers {data.orders.length} orders · {data.customers.length} customers · {data.drivers.length} drivers · {data.trucks.length} trucks · {data.payments.length} payments.</p>
      </section>

      {query.trim() && <section className="mt-7">
        <SectionTitle eyebrow="UNIVERSAL SEARCH" title={`${results.total} matching records`} detail={`Results for “${query.trim()}” across the complete Admin workspace.`} />
        {results.total ? <div className="grid gap-5 xl:grid-cols-2">
          <SearchGroup title="Orders" count={results.orders.length}>{results.orders.slice(0, 6).map((order) => <SearchResult key={order.id} title={order.tracking_id} detail={`${order.customer_name || "Customer"} · ${order.customer_phone || "No phone"}`} meta={`${order.pickup_address} → ${order.dropoff_address}`} badge={order.status} to={target("/admin/operations?section=Orders", order.tracking_id)} />)}</SearchGroup>
          <SearchGroup title="Payments" count={results.payments.length}>{results.payments.slice(0, 6).map(({ payment, order, driver }) => <SearchResult key={payment.id} title={payment.provider_ref || payment.id} detail={`${payment.provider} · ${money(Number(payment.amount_etb || 0))}`} meta={`${order?.tracking_id || "Order unavailable"} · ${driver?.full_name || order?.customer_name || "No linked contact"}`} badge={payment.event} to={target("/admin/payment-review", payment.provider_ref || payment.id)} />)}</SearchGroup>
          <SearchGroup title="Customers" count={results.customers.length}>{results.customers.slice(0, 6).map((customer) => <SearchResult key={customer.id} title={customer.full_name} detail={customer.phone} meta={customer.company_name || customer.email || "Customer account"} badge={customer.is_credit_customer ? "credit" : "standard"} to={target("/admin/operations?section=Customers", customer.phone)} />)}</SearchGroup>
          <SearchGroup title="Drivers" count={results.drivers.length}>{results.drivers.slice(0, 6).map((driver) => <SearchResult key={driver.id} title={driver.full_name || "Driver"} detail={driver.phone || "No phone"} meta="Driver finance, trips and vehicle context" badge={driver.driver_status || "pending"} to={target("/admin/driver-finance-search", driver.phone || driver.full_name || driver.id)} />)}</SearchGroup>
          <SearchGroup title="Trucks" count={results.trucks.length}>{results.trucks.slice(0, 6).map((truck) => <SearchResult key={truck.id} title={truck.plate_number} detail={`${truck.vehicle_type} · ${truck.capacity_tons ?? "—"} tons`} meta="Fleet readiness and assignment context" badge={truck.status} to={target("/admin/operations?section=Fleet%20%26%20drivers", truck.plate_number)} />)}</SearchGroup>
        </div> : <div className="border border-asphalt/10 bg-white p-10 text-center text-steel"><p className="font-display text-xl font-semibold text-asphalt">No records found</p><p className="mt-2 text-sm">Try a tracking ID, phone, route, plate or transaction reference.</p></div>}
      </section>}

      <section className="mt-8">
        <SectionTitle eyebrow="EXECUTIVE REPORT" title={`${RANGE_LABELS[range]} performance`} detail="Live operational and financial evidence—not sample dashboard data." />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Metric label="Net revenue" value={money(report.netRevenue)} detail={`${money(report.released)} released`} tone="good" to="/admin/payment-review" />
          <Metric label="Orders" value={String(report.orders.length)} detail={`${money(report.invoiceEtb)} invoiced`} to="/admin/operations?section=Orders" />
          <Metric label="Completion" value={`${report.completionRate}%`} detail={`${report.delivered.length} delivered`} tone="good" to="/admin/operations?section=Orders&status=delivered" />
          <Metric label="Needs attention" value={String(report.attentionCount)} detail="Assignment + payment queues" tone={report.attentionCount ? "alert" : "good"} to="#smart-signals" />
          <Metric label="Average order" value={money(report.averageOrderEtb)} detail={`${report.orders.length} priced orders`} to="/admin/quote-pricing" />
          <Metric label="Active trips" value={String(report.active.length)} detail="Accepted + in transit" to="/admin/operations?section=Live%20trips" />
          <Metric label="Fleet utilization" value={`${report.fleetUtilization}%`} detail={`${report.availableTrucks} trucks available`} to="/admin/fleet-maintenance" />
          <Metric label="New customers" value={String(report.customers.length)} detail={`${data.customers.length} total accounts`} to="/admin/operations?section=Customers" />
        </div>
      </section>

      <section id="smart-signals" className="mt-8 scroll-mt-5">
        <SectionTitle eyebrow="SMART SIGNALS" title="What needs a decision now" detail="Rule-based alerts linked directly to the responsible control module." />
        <div className="grid gap-3 md:grid-cols-3">{signals.map((signal) => <Link key={signal.label} to={signal.to} className={`min-w-0 border-l-4 bg-white p-5 ${signal.alert ? "border-route" : "border-emerald-700"}`}><div className="flex min-w-0 items-start justify-between gap-4"><div className="min-w-0"><p className="break-words font-display text-lg font-semibold">{signal.label}</p><p className="mt-2 break-words text-xs text-steel">{signal.detail}</p></div><strong className={`shrink-0 font-display text-3xl ${signal.alert ? "text-route" : "text-emerald-800"}`}>{signal.value}</strong></div><p className="mt-5 text-xs font-semibold text-amber-dim">Open control →</p></Link>)}</div>
      </section>

      <section className="mt-8 grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
        <article className="min-w-0 border border-asphalt/10 bg-white p-5 sm:p-6">
          <div><p className="font-mono text-[10px] tracking-[.16em] text-amber-dim">7-DAY REVENUE PULSE</p><h2 className="mt-2 font-display text-2xl font-bold">Released money trend</h2></div>
          <div className="mt-8 grid h-64 grid-cols-7 items-end gap-2 sm:gap-4">{report.revenueTrend.map((day) => <div key={day.date} className="flex min-w-0 flex-col items-center justify-end gap-2"><span className="hidden break-all text-center font-mono text-[9px] text-steel sm:block">{day.amountEtb ? money(day.amountEtb) : "0"}</span><div className="w-full bg-[#f5f3ed] p-1"><div className="w-full bg-gradient-to-t from-amber-dim to-amber" style={{ height: `${Math.max(6, Math.round((day.amountEtb / maxTrend) * 150))}px` }} /></div><span className="font-mono text-[9px] text-steel">{day.date.slice(5)}</span></div>)}</div>
        </article>
        <article className="min-w-0 border border-asphalt/10 bg-asphalt p-5 text-white sm:p-6">
          <p className="font-mono text-[10px] tracking-[.16em] text-amber">ORDER FLOW</p><h2 className="mt-2 font-display text-2xl font-bold">Status distribution</h2>
          <div className="mt-6 space-y-4">{report.statusBreakdown.map((item) => <div key={item.status}><div className="flex items-center justify-between gap-3 text-xs"><span className="capitalize text-white/70">{item.status.replace(/_/g, " ")}</span><strong>{item.count}</strong></div><div className="mt-2 h-2 bg-white/10"><div className="h-full bg-amber" style={{ width: `${Math.max(4, Math.round((item.count / maxStatus) * 100))}%` }} /></div></div>)}{!report.statusBreakdown.length && <p className="py-12 text-center text-sm text-white/45">No orders in this period.</p>}</div>
        </article>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-2">
        <article className="min-w-0 border border-asphalt/10 bg-white"><PanelHead title="Top routes" detail="Highest order volume in the selected period" /><div className="divide-y divide-asphalt/10">{report.topRoutes.map((route, index) => <div key={route.route} className="grid min-w-0 grid-cols-[32px_1fr] gap-3 p-4 sm:p-5"><span className="grid h-8 w-8 place-items-center bg-asphalt font-mono text-xs font-bold text-amber">{index + 1}</span><div className="min-w-0"><p className="break-words text-sm font-semibold leading-5">{route.route}</p><p className="mt-2 text-xs text-steel">{route.orders} orders · {route.delivered} delivered · {money(route.invoiceEtb)}</p></div></div>)}{!report.topRoutes.length && <Empty />}</div></article>
        <article className="min-w-0 border border-asphalt/10 bg-white"><PanelHead title="Payment providers" detail="Transaction value and record count" /><div className="divide-y divide-asphalt/10">{report.providerBreakdown.map((provider) => <div key={provider.provider} className="flex min-w-0 items-center justify-between gap-4 p-4 sm:p-5"><div className="min-w-0"><p className="break-words font-semibold capitalize">{provider.provider.replace(/_/g, " ")}</p><p className="mt-1 text-xs text-steel">{provider.records} records</p></div><strong className="shrink-0 text-right font-display text-lg">{money(provider.amountEtb)}</strong></div>)}{!report.providerBreakdown.length && <Empty />}</div></article>
      </section>
    </div>
  </main>;
}

function SectionTitle({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return <div className="mb-4 min-w-0"><p className="font-mono text-[10px] tracking-[.18em] text-amber-dim">{eyebrow}</p><h2 className="mt-2 break-words font-display text-2xl font-bold sm:text-3xl">{title}</h2><p className="mt-2 max-w-3xl break-words text-xs leading-5 text-steel sm:text-sm">{detail}</p></div>;
}

function Metric({ label, value, detail, to, tone = "neutral" }: { label: string; value: string; detail: string; to: string; tone?: "neutral" | "good" | "alert" }) {
  const border = tone === "alert" ? "border-route" : tone === "good" ? "border-emerald-600" : "border-asphalt/15";
  return <Link to={to} className={`min-w-0 overflow-hidden border bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-md sm:p-5 ${border}`}><p className="break-words text-[10px] font-semibold uppercase tracking-wide text-steel">{label}</p><p className={`mt-3 break-words font-display text-[clamp(1.15rem,6vw,1.8rem)] font-bold ${tone === "alert" ? "text-route" : "text-asphalt"}`}>{value}</p><p className="mt-2 break-words text-[11px] leading-4 text-steel">{detail}</p></Link>;
}

function SearchGroup({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (!count) return null;
  return <article className="min-w-0 border border-asphalt/10 bg-white"><PanelHead title={title} detail={`${count} matching ${count === 1 ? "record" : "records"}`} /><div className="divide-y divide-asphalt/10">{children}</div></article>;
}

function SearchResult({ title, detail, meta, badge, to }: { title: string; detail: string; meta: string; badge: string; to: string }) {
  return <Link to={to} className="block min-w-0 p-4 transition hover:bg-amber/5 sm:p-5"><div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="break-all font-mono text-xs font-bold">{title}</p><p className="mt-2 break-words text-sm font-semibold">{detail}</p><p className="mt-1 break-words text-xs leading-5 text-steel">{meta}</p></div><span className="self-start whitespace-nowrap bg-amber/10 px-2.5 py-1.5 text-[10px] font-semibold uppercase text-amber-dim">{badge.replace(/_/g, " ")}</span></div><p className="mt-3 text-xs font-semibold text-amber-dim">Open record →</p></Link>;
}

function PanelHead({ title, detail }: { title: string; detail: string }) {
  return <div className="min-w-0 border-b border-asphalt/10 p-4 sm:p-5"><h3 className="break-words font-display text-xl font-semibold">{title}</h3><p className="mt-1 break-words text-xs text-steel">{detail}</p></div>;
}

function Empty() {
  return <p className="p-8 text-center text-sm text-steel">No records in this period.</p>;
}
