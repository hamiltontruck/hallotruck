import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase.client";
import { formatEtb } from "../utils/currency";
import {
  computeFinanceSummary,
  dailySeries,
  groupAmount,
  inRange,
  numberOf,
  type FinanceDashboardData,
  type FinanceOrder,
  type FinancePayment,
  type FinanceRange,
} from "../domain/finance-dashboard";

type Props = { fixture?: FinanceDashboardData };
type KpiKey = "released" | "escrow" | "pending" | "refunds" | "failed" | "commission" | "deposits" | "wallets";

const emptyData: FinanceDashboardData = {
  payments: [], orders: [], profiles: [], deposits: [], commissionCharges: [], commissionPayments: [], confirmations: [],
};

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: unknown) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }

export function AdminFinanceDashboardV3({ fixture }: Props) {
  const [data, setData] = useState<FinanceDashboardData>(fixture ?? emptyData);
  const [loading, setLoading] = useState(!fixture);
  const [error, setError] = useState("");
  const [range, setRange] = useState<FinanceRange>("30d");
  const [provider, setProvider] = useState("all");
  const [driver, setDriver] = useState("all");
  const [customer, setCustomer] = useState("all");
  const [route, setRoute] = useState("all");
  const [truckType, setTruckType] = useState("all");
  const [query, setQuery] = useState("");
  const [activeKpi, setActiveKpi] = useState<KpiKey | null>(null);
  const [updatedAt, setUpdatedAt] = useState(new Date());

  const load = useCallback(async () => {
    if (fixture) return;
    setLoading(true); setError("");
    const [payments, orders, profiles, deposits, charges, commissionPayments, confirmations] = await Promise.all([
      supabase.from("payments").select("id,order_id,provider,provider_ref,amount_etb,event,created_at,reviewed_at").order("created_at", { ascending: false }).limit(5000),
      supabase.from("orders").select("id,tracking_id,customer_id,customer_name,driver_id,truck_id,pickup_address,dropoff_address,vehicle_type,price_etb,status,payment_status,created_at").order("created_at", { ascending: false }).limit(5000),
      supabase.from("profiles").select("id,full_name,phone,email,role").limit(5000),
      supabase.from("driver_commission_deposits").select("id,driver_id,amount_etb,status,created_at").limit(5000),
      supabase.from("driver_commission_charges").select("id,driver_id,order_id,payment_id,commission_etb,status,created_at").limit(5000),
      supabase.from("driver_commission_payments").select("id,driver_id,amount_etb,status,submitted_at").limit(5000),
      supabase.from("driver_payment_confirmations").select("payment_id,order_id,driver_id,commission_etb,commission_reversed_at,commission_accrued_at").limit(5000),
    ]);
    const failed = [payments, orders, profiles, deposits, charges, commissionPayments, confirmations].find((result) => result.error)?.error;
    if (failed) { setError(failed.message); setLoading(false); return; }
    setData({
      payments: (payments.data ?? []) as FinanceDashboardData["payments"],
      orders: (orders.data ?? []) as FinanceDashboardData["orders"],
      profiles: (profiles.data ?? []) as FinanceDashboardData["profiles"],
      deposits: (deposits.data ?? []) as FinanceDashboardData["deposits"],
      commissionCharges: (charges.data ?? []) as FinanceDashboardData["commissionCharges"],
      commissionPayments: (commissionPayments.data ?? []) as FinanceDashboardData["commissionPayments"],
      confirmations: (confirmations.data ?? []) as FinanceDashboardData["confirmations"],
    });
    setUpdatedAt(new Date()); setLoading(false);
  }, [fixture]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (fixture) return;
    const channel = supabase.channel("finance-dashboard-v3")
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_commission_charges" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_commission_payments" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_commission_deposits" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [fixture, load]);

  const profileById = useMemo(() => new Map(data.profiles.map((profile) => [profile.id, profile])), [data.profiles]);
  const orderById = useMemo(() => new Map(data.orders.map((order) => [order.id, order])), [data.orders]);
  const routes = useMemo(() => [...new Set(data.orders.map((order) => `${order.pickup_address} → ${order.dropoff_address}`))].sort(), [data.orders]);
  const providers = useMemo(() => [...new Set(data.payments.map((payment) => payment.provider).filter(Boolean))].sort(), [data.payments]);
  const truckTypes = useMemo(() => [...new Set(data.orders.map((order) => order.vehicle_type).filter(Boolean))].sort(), [data.orders]);
  const drivers = useMemo(() => data.profiles.filter((profile) => profile.role === "driver"), [data.profiles]);
  const customers = useMemo(() => data.profiles.filter((profile) => profile.role === "customer"), [data.profiles]);

  const filteredOrders = useMemo(() => data.orders.filter((order) => {
    const routeName = `${order.pickup_address} → ${order.dropoff_address}`;
    const haystack = [order.tracking_id, order.customer_name, order.pickup_address, order.dropoff_address, order.vehicle_type, profileById.get(order.driver_id ?? "")?.full_name].join(" ").toLowerCase();
    return (driver === "all" || order.driver_id === driver)
      && (customer === "all" || order.customer_id === customer)
      && (route === "all" || routeName === route)
      && (truckType === "all" || order.vehicle_type === truckType)
      && (!query.trim() || haystack.includes(query.trim().toLowerCase()));
  }), [customer, data.orders, driver, profileById, query, route, truckType]);
  const visibleOrderIds = useMemo(() => new Set(filteredOrders.map((order) => order.id)), [filteredOrders]);
  const filteredPayments = useMemo(() => data.payments.filter((payment) => inRange(payment.created_at, range)
    && visibleOrderIds.has(payment.order_id)
    && (provider === "all" || payment.provider === provider)), [data.payments, provider, range, visibleOrderIds]);
  const filteredData = useMemo(() => ({ ...data, payments: filteredPayments, orders: filteredOrders }), [data, filteredOrders, filteredPayments]);
  const summary = useMemo(() => computeFinanceSummary(filteredData), [filteredData]);
  const trend = useMemo(() => dailySeries(filteredPayments, range === "90d" ? 30 : 14), [filteredPayments, range]);
  const maxTrend = Math.max(1, ...trend.flatMap((item) => [item.revenue, item.escrow, item.commission]));
  const releasedRows = useMemo(() => filteredPayments.filter((payment) => payment.event === "released"), [filteredPayments]);

  const paymentBreakdown = useMemo(() => groupAmount(releasedRows, (payment) => payment.provider || "Unknown", (payment) => numberOf(payment.amount_etb)), [releasedRows]);
  const byRoute = useMemo(() => groupAmount(releasedRows, (payment) => { const order = orderById.get(payment.order_id); return order ? `${order.pickup_address} → ${order.dropoff_address}` : "Unknown route"; }, (payment) => numberOf(payment.amount_etb)).slice(0, 8), [orderById, releasedRows]);
  const byDriver = useMemo(() => groupAmount(releasedRows, (payment) => { const order = orderById.get(payment.order_id); return profileById.get(order?.driver_id ?? "")?.full_name || "Unassigned"; }, (payment) => numberOf(payment.amount_etb)).slice(0, 8), [orderById, profileById, releasedRows]);
  const byCustomer = useMemo(() => groupAmount(releasedRows, (payment) => orderById.get(payment.order_id)?.customer_name || "Unknown customer", (payment) => numberOf(payment.amount_etb)).slice(0, 8), [orderById, releasedRows]);
  const byTruck = useMemo(() => groupAmount(releasedRows, (payment) => orderById.get(payment.order_id)?.vehicle_type || "Unknown", (payment) => numberOf(payment.amount_etb)).slice(0, 8), [orderById, releasedRows]);

  const highValue = releasedRows.filter((payment) => numberOf(payment.amount_etb) >= 100_000).slice(0, 8);
  const oldEscrow = filteredPayments.filter((payment) => payment.event === "held_escrow" && Date.now() - new Date(payment.created_at).getTime() > 3 * 86400000).slice(0, 8);
  const refunds = filteredPayments.filter((payment) => payment.event === "refunded").slice(0, 8);
  const failedPayments = filteredPayments.filter((payment) => payment.event === "failed").slice(0, 8);
  const depositMismatch = summary.outstandingCommission > summary.driverDeposits;

  function rowsForKpi() {
    if (activeKpi === "released") return filteredPayments.filter((row) => row.event === "released");
    if (activeKpi === "escrow") return filteredPayments.filter((row) => row.event === "held_escrow");
    if (activeKpi === "pending") return filteredPayments.filter((row) => row.event === "initiated" && !row.reviewed_at);
    if (activeKpi === "refunds") return filteredPayments.filter((row) => row.event === "refunded");
    if (activeKpi === "failed") return filteredPayments.filter((row) => row.event === "failed");
    return filteredPayments;
  }

  function exportCsv() {
    const rows = [["Tracking", "Provider", "Reference", "Event", "Amount ETB", "Route", "Created"]];
    for (const payment of filteredPayments) {
      const order = orderById.get(payment.order_id);
      rows.push([order?.tracking_id ?? payment.order_id, payment.provider, payment.provider_ref ?? "", payment.event, String(numberOf(payment.amount_etb)), order ? `${order.pickup_address} → ${order.dropoff_address}` : "", payment.created_at]);
    }
    download("hallo-finance-v3.csv", rows.map((row) => row.map(csvCell).join(",")).join("\n"), "text/csv;charset=utf-8");
  }

  function exportExcel() {
    const header = ["Tracking", "Provider", "Reference", "Event", "Amount ETB", "Route", "Created"].join("\t");
    const body = filteredPayments.map((payment) => { const order = orderById.get(payment.order_id); return [order?.tracking_id ?? payment.order_id, payment.provider, payment.provider_ref ?? "", payment.event, numberOf(payment.amount_etb), order ? `${order.pickup_address} → ${order.dropoff_address}` : "", payment.created_at].join("\t"); }).join("\n");
    download("hallo-finance-v3.xls", `${header}\n${body}`, "application/vnd.ms-excel;charset=utf-8");
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f5f3ed] p-4 text-asphalt sm:p-7 lg:p-10">
      <div className="mx-auto max-w-[1500px]">
        <section className="bg-asphalt p-6 text-white sm:p-8">
          <div className="flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
            <div><p className="font-mono text-[10px] tracking-[.22em] text-amber">ENTERPRISE FINANCE INTELLIGENCE</p><h1 className="mt-3 font-display text-3xl font-bold sm:text-4xl">Finance Dashboard V3</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">Live revenue, escrow, commission, wallet and exception intelligence built from production finance ledgers.</p></div>
            <div className="flex flex-wrap gap-2"><button onClick={exportCsv} className="border border-white/20 px-4 py-3 text-xs font-semibold">CSV</button><button onClick={exportExcel} className="border border-white/20 px-4 py-3 text-xs font-semibold">Excel</button><button onClick={() => window.print()} className="bg-amber px-4 py-3 text-xs font-semibold text-asphalt">PDF / Print</button></div>
          </div>
          <p className="mt-5 font-mono text-[9px] tracking-wide text-white/35">LIVE · updated {updatedAt.toLocaleTimeString()}</p>
        </section>

        {error && <p className="mt-5 border border-route/30 bg-route/5 p-4 text-sm text-route">{error}</p>}
        <section className="mt-5 grid gap-3 border border-asphalt/10 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <label className="text-[10px] font-semibold uppercase tracking-wide">Date range<select value={range} onChange={(event) => setRange(event.target.value as FinanceRange)} className="mt-2 w-full border border-asphalt/15 px-3 py-2.5 text-xs normal-case"><option value="today">Today</option><option value="7d">7 days</option><option value="30d">30 days</option><option value="90d">90 days</option><option value="all">All time</option></select></label>
          <Filter label="Provider" value={provider} setValue={setProvider} values={providers} />
          <Filter label="Driver" value={driver} setValue={setDriver} values={drivers.map((item) => ({ value: item.id, label: item.full_name || item.phone || item.id }))} />
          <Filter label="Customer" value={customer} setValue={setCustomer} values={customers.map((item) => ({ value: item.id, label: item.full_name || item.phone || item.id }))} />
          <Filter label="Route" value={route} setValue={setRoute} values={routes} />
          <Filter label="Truck" value={truckType} setValue={setTruckType} values={truckTypes} />
          <label className="text-[10px] font-semibold uppercase tracking-wide">Global search<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tracking, route, driver" className="mt-2 w-full border border-asphalt/15 px-3 py-2.5 text-xs normal-case" /></label>
        </section>

        <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <Kpi label="Today's revenue" value={formatEtb(summary.todayRevenue)} onClick={() => setActiveKpi("released")} />
          <Kpi label="Weekly revenue" value={formatEtb(summary.weeklyRevenue)} onClick={() => setActiveKpi("released")} />
          <Kpi label="Monthly revenue" value={formatEtb(summary.monthlyRevenue)} onClick={() => setActiveKpi("released")} />
          <Kpi label="Released" value={formatEtb(summary.releasedPayments)} onClick={() => setActiveKpi("released")} />
          <Kpi label="Held escrow" value={formatEtb(summary.heldEscrow)} onClick={() => setActiveKpi("escrow")} warning={summary.heldEscrow > 0} />
          <Kpi label="Pending reviews" value={String(summary.pendingReviews)} onClick={() => setActiveKpi("pending")} warning={summary.pendingReviews > 0} />
          <Kpi label="Refunded" value={formatEtb(summary.refundedPayments)} onClick={() => setActiveKpi("refunds")} danger={summary.refundedPayments > 0} />
          <Kpi label="Failed" value={formatEtb(summary.failedPayments)} onClick={() => setActiveKpi("failed")} danger={summary.failedPayments > 0} />
          <Kpi label="Commission earned" value={formatEtb(summary.commissionEarned)} onClick={() => setActiveKpi("commission")} />
          <Kpi label="Commission paid" value={formatEtb(summary.commissionPaid)} onClick={() => setActiveKpi("commission")} />
          <Kpi label="Outstanding commission" value={formatEtb(summary.outstandingCommission)} onClick={() => setActiveKpi("commission")} warning={summary.outstandingCommission > 0} />
          <Kpi label="Driver deposits" value={formatEtb(summary.driverDeposits)} onClick={() => setActiveKpi("deposits")} />
          <Kpi label="Available deposits" value={formatEtb(summary.availableDriverDeposits)} onClick={() => setActiveKpi("deposits")} />
          <Kpi label="Net platform revenue" value={formatEtb(summary.netPlatformRevenue)} strong onClick={() => setActiveKpi("released")} />
          <Kpi label="Active wallets" value={String(summary.activeWallets)} onClick={() => setActiveKpi("wallets")} />
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
          <Panel title="14-day revenue, escrow and commission trend" eyebrow="FINANCE PULSE">
            <div className="overflow-x-auto"><div className="flex min-w-[720px] items-end gap-2 p-5" style={{ height: 290 }}>{trend.map((item) => <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"><div className="flex h-52 w-full items-end justify-center gap-1"><span title={`Revenue ${formatEtb(item.revenue)}`} className="w-2.5 bg-asphalt" style={{ height: `${Math.max(2, item.revenue / maxTrend * 100)}%` }} /><span title={`Escrow ${formatEtb(item.escrow)}`} className="w-2.5 bg-amber" style={{ height: `${Math.max(2, item.escrow / maxTrend * 100)}%` }} /><span title={`Commission ${formatEtb(item.commission)}`} className="w-2.5 bg-emerald-600" style={{ height: `${Math.max(2, item.commission / maxTrend * 100)}%` }} /></div><span className="rotate-[-35deg] whitespace-nowrap text-[8px] text-steel">{item.label}</span></div>)}</div></div>
            <div className="flex flex-wrap gap-4 border-t border-asphalt/10 p-4 text-[10px] text-steel"><span>■ Revenue</span><span className="text-amber">■ Escrow</span><span className="text-emerald-700">■ Commission</span></div>
          </Panel>
          <Panel title="Finance intelligence" eyebrow="SMART SIGNALS">
            <Signal label="High-value released payments" value={highValue.length} tone={highValue.length ? "warning" : "ok"} />
            <Signal label="Escrow older than 3 days" value={oldEscrow.length} tone={oldEscrow.length ? "danger" : "ok"} />
            <Signal label="Refund events" value={refunds.length} tone={refunds.length ? "danger" : "ok"} />
            <Signal label="Failed payments" value={failedPayments.length} tone={failedPayments.length ? "danger" : "ok"} />
            <Signal label="Deposit reconciliation" value={depositMismatch ? "Mismatch" : "Healthy"} tone={depositMismatch ? "danger" : "ok"} />
          </Panel>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
          <Breakdown title="Payment providers" rows={paymentBreakdown} />
          <Breakdown title="Top routes" rows={byRoute} />
          <Breakdown title="Top drivers" rows={byDriver} />
          <Breakdown title="Top customers" rows={byCustomer} />
        </section>
        <section className="mt-5 grid gap-5 lg:grid-cols-2"><Breakdown title="Revenue by truck type" rows={byTruck} /><Breakdown title="Monthly comparison" rows={trend.slice(-6).map((item) => ({ label: item.label, value: item.revenue }))} /></section>

        <Panel title={activeKpi ? `KPI drill-down · ${activeKpi}` : "Recent finance activity"} eyebrow="ACTIONABLE DETAIL" className="mt-5">
          {loading ? <p className="p-5 text-sm text-steel">Loading live finance data…</p> : rowsForKpi().length === 0 ? <p className="p-5 text-sm text-steel">No finance records match the current filters.</p> : <div className="divide-y divide-asphalt/10">{rowsForKpi().slice(0, 50).map((payment) => <PaymentRow key={payment.id} payment={payment} order={orderById.get(payment.order_id)} />)}</div>}
        </Panel>
      </div>
    </main>
  );
}

function Filter({ label, value, setValue, values }: { label: string; value: string; setValue: (value: string) => void; values: string[] | { value: string; label: string }[] }) {
  return <label className="min-w-0 text-[10px] font-semibold uppercase tracking-wide">{label}<select value={value} onChange={(event) => setValue(event.target.value)} className="mt-2 w-full min-w-0 border border-asphalt/15 px-3 py-2.5 text-xs normal-case"><option value="all">All</option>{values.map((item) => typeof item === "string" ? <option key={item} value={item}>{item}</option> : <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>;
}
function Kpi({ label, value, onClick, strong, warning, danger }: { label: string; value: string; onClick: () => void; strong?: boolean; warning?: boolean; danger?: boolean }) {
  return <button type="button" onClick={onClick} className={`min-w-0 border p-4 text-left transition hover:-translate-y-0.5 ${strong ? "border-asphalt bg-asphalt text-white" : danger ? "border-route/30 bg-route/5" : warning ? "border-amber/60 bg-amber/10" : "border-asphalt/10 bg-white"}`}><p className="font-mono text-[9px] uppercase tracking-wide opacity-60">{label}</p><p className="mt-3 break-words font-display text-xl font-bold sm:text-2xl">{value}</p></button>;
}
function Panel({ title, eyebrow, children, className = "" }: { title: string; eyebrow: string; children: React.ReactNode; className?: string }) { return <section className={`min-w-0 border border-asphalt/10 bg-white ${className}`}><header className="border-b border-asphalt/10 p-5"><p className="font-mono text-[9px] tracking-[.2em] text-steel">{eyebrow}</p><h2 className="mt-2 font-display text-xl font-bold">{title}</h2></header>{children}</section>; }
function Breakdown({ title, rows }: { title: string; rows: { label: string; value: number }[] }) { const max = Math.max(1, ...rows.map((row) => row.value)); return <Panel title={title} eyebrow="BREAKDOWN">{rows.length === 0 ? <p className="p-5 text-sm text-steel">No released payment data.</p> : <div className="space-y-4 p-5">{rows.slice(0, 8).map((row) => <div key={row.label} className="min-w-0"><div className="flex items-start justify-between gap-3 text-xs"><span className="min-w-0 break-words font-medium">{row.label}</span><span className="shrink-0 font-mono text-[10px]">{formatEtb(row.value)}</span></div><div className="mt-2 h-2 bg-asphalt/10"><div className="h-full bg-asphalt" style={{ width: `${row.value / max * 100}%` }} /></div></div>)}</div>}</Panel>; }
function Signal({ label, value, tone }: { label: string; value: string | number; tone: "ok" | "warning" | "danger" }) { return <div className="flex items-center justify-between gap-4 border-b border-asphalt/10 p-4 last:border-b-0"><span className="text-xs font-medium">{label}</span><span className={`px-3 py-1 text-[10px] font-semibold uppercase ${tone === "danger" ? "bg-route/10 text-route" : tone === "warning" ? "bg-amber/20 text-asphalt" : "bg-emerald-50 text-emerald-800"}`}>{value}</span></div>; }
function PaymentRow({ payment, order }: { payment: FinancePayment; order?: FinanceOrder }) { return <div className="grid min-w-0 gap-3 p-4 sm:grid-cols-[1.2fr_1fr_auto] sm:items-center"><div className="min-w-0"><p className="break-words font-semibold">{order?.tracking_id ?? payment.order_id}</p><p className="mt-1 break-words text-xs text-steel">{order ? `${order.pickup_address} → ${order.dropoff_address}` : "Order unavailable"}</p></div><div className="min-w-0"><p className="break-words text-xs font-medium">{payment.provider} · {payment.provider_ref || "No reference"}</p><p className="mt-1 text-[10px] uppercase text-steel">{payment.event} · {new Date(payment.created_at).toLocaleString()}</p></div><p className="font-display text-lg font-bold">{formatEtb(numberOf(payment.amount_etb))}</p></div>; }
