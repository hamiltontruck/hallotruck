import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  buildControlCenterView,
  canonicalPayments,
  isDelayedOrder,
  isLegacyCompletedPayment,
} from "../domain/admin-control-center";
import {
  ControlCenterData,
  ControlOrder,
  ControlPayment,
  getControlCenterData,
} from "../services/admin-control-center.service";

type Tone = "neutral" | "good" | "warning" | "critical";

function money(value: number) {
  return `ETB ${Math.max(0, value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function paymentTotal(payments: ControlPayment[], event: string) {
  return canonicalPayments(payments)
    .filter((payment) => payment.event === event)
    .reduce((sum, payment) => sum + Math.max(0, Number(payment.amount_etb || 0)), 0);
}

export function AdminCeoOverview({ fixture = null }: { fixture?: ControlCenterData | null } = {}) {
  const [data, setData] = useState<ControlCenterData | null>(fixture);
  const [loading, setLoading] = useState(!fixture);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(fixture ? new Date() : null);

  async function load() {
    setLoading(true);
    try {
      setData(await getControlCenterData());
      setLastUpdated(new Date());
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load CEO control center.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!fixture) void load();
  }, [fixture]);

  const view = useMemo(() => data ? buildControlCenterView(data) : null, [data]);

  if (loading) {
    return <main className="min-h-screen bg-[#f5f3ed] p-5"><p className="py-24 text-center font-mono text-sm text-steel">Loading CEO control center…</p></main>;
  }

  if (!data || !view) {
    return <main className="min-h-screen bg-[#f5f3ed] p-5"><div className="mx-auto max-w-3xl border border-route/30 bg-route/10 p-5 text-route"><p>{error || "Dashboard data is unavailable."}</p><button type="button" onClick={() => void load()} className="mt-4 bg-asphalt px-4 py-3 text-sm font-semibold text-white">Retry</button></div></main>;
  }

  const complianceTotal = view.complianceAlerts.length + view.driverOnboardingAlerts.length;
  const attentionTotal = view.delayedTrips.length
    + view.unassignedOrders.length
    + view.pendingPayments.length
    + view.missingEvidenceOrders.length
    + complianceTotal
    + view.maintenanceAlerts.length;

  const released = paymentTotal(view.payments, "released");
  const escrow = paymentTotal(view.payments, "held_escrow");
  const refunded = paymentTotal(view.payments, "refunded");
  const failed = view.payments.filter((payment) => payment.event === "failed").length;

  const cards = [
    { label: "Today's Revenue", value: money(view.todayRevenue), detail: "Released minus refunds today", to: "/admin/payment-review?date=today", tone: "good" as Tone },
    { label: "Total Orders", value: String(data.orders.length), detail: "All operational records", to: "/admin/operations?section=Orders", tone: "neutral" as Tone },
    { label: "Today's Orders", value: String(view.todayOrders.length), detail: "Orders created today", to: "/admin/operations?section=Orders&date=today", tone: "neutral" as Tone },
    { label: "Active Trips", value: String(view.activeTrips.length), detail: "Accepted or in transit", to: "/admin/operations?section=Live%20trips", tone: "neutral" as Tone },
    { label: "Delivered Today", value: String(view.deliveredToday.length), detail: "Completed today", to: "/admin/operations?section=Orders&status=delivered&date=today", tone: "good" as Tone },
    { label: "Delayed Trips", value: String(view.delayedTrips.length), detail: "Active longer than 48 hours", to: "/admin/operations?section=Orders&queue=delayed", tone: view.delayedTrips.length ? "critical" as Tone : "good" as Tone },
    { label: "Unassigned Orders", value: String(view.unassignedOrders.length), detail: "Missing driver or truck", to: "/admin/operations?section=Orders&queue=unassigned", tone: view.unassignedOrders.length ? "warning" as Tone : "good" as Tone },
    { label: "Available Trucks", value: String(view.availableTrucks.length), detail: `${data.trucks.length} total fleet`, to: "/admin/fleet-maintenance", tone: "neutral" as Tone },
    { label: "Active Drivers", value: String(view.activeDrivers.length), detail: `${data.drivers.length} registered`, to: "/admin/driver-compliance", tone: "neutral" as Tone },
    { label: "New Customers Today", value: String(view.activeCustomersToday.length), detail: "Accounts created today", to: "/admin/operations?section=Customers&date=today", tone: "neutral" as Tone },
    { label: "Pending Payments", value: String(view.pendingPayments.length), detail: "Waiting for admin review", to: "/admin/payment-review?status=pending", tone: view.pendingPayments.length ? "warning" as Tone : "good" as Tone },
    { label: "Missing Evidence", value: String(view.missingEvidenceOrders.length), detail: "Delivered without POD", to: "/admin/operations?section=Orders&queue=missing-evidence", tone: view.missingEvidenceOrders.length ? "warning" as Tone : "good" as Tone },
    { label: "Legacy Completed", value: String(view.legacyOrderIds.size), detail: "Historical released payments", to: "/admin/payment-review?queue=legacy", tone: "neutral" as Tone },
    { label: "Commission Receivable", value: money(view.driverCommissionReceivable), detail: "Outstanding driver commission", to: "/admin/driver-commission", tone: view.driverCommissionReceivable ? "warning" as Tone : "good" as Tone },
    { label: "Available Driver Deposits", value: money(view.availableDriverDeposit), detail: `${money(view.totalDriverDeposit)} deposited`, to: "/admin/driver-finance-search", tone: "good" as Tone },
    { label: "Driver Compliance Alerts", value: String(complianceTotal), detail: "Onboarding, rejected or expiring", to: "/admin/driver-compliance", tone: complianceTotal ? "warning" as Tone : "good" as Tone },
    { label: "Fleet Maintenance Alerts", value: String(view.maintenanceAlerts.length), detail: "Maintenance or service due", to: "/admin/fleet-maintenance", tone: view.maintenanceAlerts.length ? "warning" as Tone : "good" as Tone },
  ];

  return <main className="min-h-screen overflow-x-hidden bg-[#f5f3ed] p-3 pb-24 text-asphalt sm:p-6 lg:p-8">
    <div className="mx-auto max-w-[1500px]">
      <header className="overflow-hidden bg-asphalt p-5 text-white sm:p-8 lg:p-10">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-[.22em] text-amber">CEO OPERATIONS CONTROL</p>
            <h1 className="mt-3 break-words font-display text-3xl font-bold sm:text-4xl">HALLO Smart Logistics</h1>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/60">Live KPIs, operational exceptions, finance, evidence, driver compliance and fleet readiness in one control center.</p>
          </div>
          <div className="flex min-w-0 flex-wrap gap-2">
            <Link to="/admin/intelligence" className="border border-white/20 px-4 py-3 text-sm font-semibold">Reports & Search</Link>
            <Link to="/admin/operations" className="bg-amber px-4 py-3 text-sm font-semibold text-asphalt">Open Operations</Link>
            <button type="button" onClick={() => void load()} disabled={loading} className="border border-white/20 px-4 py-3 text-sm font-semibold disabled:opacity-50">{loading ? "Refreshing…" : "Refresh"}</button>
          </div>
        </div>
        <div className="mt-6 flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-4 font-mono text-[10px] uppercase tracking-wide text-white/45">
          <span><i className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-400" />Live database control</span>
          <span>{data.orders.length.toLocaleString()} orders · {view.payments.length.toLocaleString()} canonical payments · {data.drivers.length.toLocaleString()} drivers</span>
          <span>{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Awaiting refresh"}</span>
        </div>
      </header>

      {error && <p className="mt-4 break-words border border-route/30 bg-route/10 p-4 text-sm text-route">{error}</p>}
      {Boolean(data.warnings?.length) && <div className="mt-4 border border-amber/40 bg-amber/10 p-4 text-sm text-asphalt" role="status"><p className="font-semibold">Dashboard is live with partial finance data.</p><p className="mt-1 text-xs leading-5 text-steel">{data.warnings!.length} driver finance {data.warnings!.length === 1 ? "summary is" : "summaries are"} temporarily unavailable. Operational queues remain current; refresh before using aggregate commission or deposit totals.</p></div>}

      <section className="mt-4 border border-asphalt/10 bg-white p-4 sm:p-5" aria-label="Admin command shortcuts">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-[10px] tracking-[.18em] text-amber-dim">COMMAND BAR</p><h2 className="mt-1 font-display text-xl font-bold">Control the business from one place</h2></div><p className="text-xs text-steel">Fast, role-safe entry points to the highest-frequency Admin actions.</p></div>
        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <CommandLink to="/admin/operations?action=create-order" title="New order" detail="Create & dispatch" />
          <CommandLink to="/admin/operations?section=Orders&queue=unassigned" title="Dispatch queue" detail="Assign driver & truck" />
          <CommandLink to="/admin/payment-review?status=pending" title="Payment review" detail="Verify & release" />
          <CommandLink to="/admin/driver-compliance" title="Driver control" detail="Approve & monitor" />
          <CommandLink to="/admin/fleet-maintenance" title="Fleet control" detail="Readiness & service" />
          <CommandLink to="/admin/partners" title="Partner control" detail="Onboard & review" />
        </div>
      </section>

      <section className={`mt-4 border p-4 sm:p-5 ${attentionTotal ? "border-route/25 bg-route/5" : "border-emerald-700/20 bg-emerald-50"}`}>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="break-words font-display text-lg font-semibold">{attentionTotal ? `${attentionTotal} operational items need attention` : "Operations healthy"}</p>
            <p className="mt-1 break-words text-xs leading-5 text-steel">Delayed {view.delayedTrips.length} · Unassigned {view.unassignedOrders.length} · Payments {view.pendingPayments.length} · Evidence {view.missingEvidenceOrders.length} · Compliance {complianceTotal} · Maintenance {view.maintenanceAlerts.length}</p>
          </div>
          <a href="#action-queues" className="self-start border border-asphalt/15 bg-white px-4 py-3 text-xs font-semibold">Review queues →</a>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map((card) => <KpiCard key={card.label} {...card} />)}
      </section>

      <section id="finance-summary" className="mt-7 scroll-mt-5">
        <SectionHeader eyebrow="FINANCE CONTROL" title="Payment and revenue summary" actionTo="/admin/payment-review" actionLabel="Open finance review" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <Metric label="Released" value={money(released)} tone="good" to="/admin/payment-review?status=released" />
          <Metric label="Held in escrow" value={money(escrow)} tone="warning" to="/admin/payment-review?status=escrow" />
          <Metric label="Refunded" value={money(refunded)} tone={refunded ? "critical" : "neutral"} to="/admin/payment-review?status=refunded" />
          <Metric label="Failed payments" value={String(failed)} tone={failed ? "critical" : "good"} to="/admin/payment-review?status=rejected" />
          <Metric label="Commission receivable" value={money(view.driverCommissionReceivable)} tone={view.driverCommissionReceivable ? "warning" : "good"} to="/admin/driver-commission" />
          <Metric label="Available driver deposits" value={money(view.availableDriverDeposit)} tone="good" to="/admin/driver-finance-search" />
        </div>
      </section>

      <section id="action-queues" className="mt-8 scroll-mt-5">
        <SectionHeader eyebrow="ACTION CENTER" title="Operational exception queues" actionTo="/admin/operations" actionLabel="Open operations" />
        <div className="grid gap-5 xl:grid-cols-2">
          <QueueCard id="delayed-queue" title="Delayed and unassigned orders" count={view.delayedTrips.length + view.unassignedOrders.length} actionTo="/admin/operations?section=Orders&queue=delayed-or-unassigned">
            <OrderQueue rows={dedupeOrders([...view.delayedTrips, ...view.unassignedOrders])} badge={(order) => isDelayedOrder(order) ? "Delayed" : "Unassigned"} />
          </QueueCard>

          <QueueCard id="payment-queue" title="Pending payment reviews" count={view.pendingPayments.length} actionTo="/admin/payment-review?status=pending">
            <PaymentQueue rows={view.pendingPayments} empty="No pending payment reviews." />
          </QueueCard>

          <QueueCard id="evidence-queue" title="Missing delivery evidence" count={view.missingEvidenceOrders.length} actionTo="/admin/operations?section=Orders&queue=missing-evidence">
            <OrderQueue rows={view.missingEvidenceOrders} badge={() => "Evidence required"} empty="No delivered orders are missing evidence." />
          </QueueCard>

          <QueueCard id="legacy-queue" title="Legacy completed orders" count={view.legacyOrderIds.size} actionTo="/admin/payment-review?queue=legacy">
            <PaymentQueue rows={view.legacyPayments} badge="Legacy completed" empty="No legacy-completed payments." />
          </QueueCard>

          <QueueCard id="failed-queue" title="Failed and refunded payments" count={view.failedOrRefundedPayments.length} actionTo="/admin/payment-review?queue=exceptions">
            <PaymentQueue rows={view.failedOrRefundedPayments} empty="No failed or refunded payments." />
          </QueueCard>

          <QueueCard id="compliance-queue" title="Driver compliance alerts" count={complianceTotal} actionTo="/admin/driver-compliance">
            <div className="grid gap-2 p-4 text-sm sm:p-5">
              <QueueSummary label="Driver onboarding / approval" value={view.driverOnboardingAlerts.length} />
              <QueueSummary label="Pending, rejected or expiring documents" value={view.complianceAlerts.length} />
            </div>
          </QueueCard>

          <QueueCard id="maintenance-queue" title="Fleet maintenance alerts" count={view.maintenanceAlerts.length} actionTo="/admin/fleet-maintenance">
            <div className="divide-y divide-asphalt/10">
              {view.maintenanceAlerts.slice(0, 6).map((truck) => <div key={truck.id} className="flex min-w-0 items-center justify-between gap-3 p-4 sm:p-5"><p className="min-w-0 break-all font-mono text-xs font-semibold">{truck.plate_number}</p><span className="shrink-0 bg-amber/10 px-2.5 py-1.5 text-[10px] font-semibold uppercase text-amber-dim">{truck.status.replace(/_/g, " ")}</span></div>)}
              {!view.maintenanceAlerts.length && <Empty label="No maintenance alerts." />}
            </div>
          </QueueCard>

          <QueueCard id="modules" title="Control modules" count={7} actionTo="/admin/intelligence">
            <div className="grid gap-2 p-4 sm:p-5">
              <ModuleLink to="/admin/intelligence" title="Reports & global search" detail="Cross-workspace search, trends, routes and smart signals" />
              <ModuleLink to="/admin/payment-review" title="Finance review" detail="Payments, escrow, released, refunds and evidence" />
              <ModuleLink to="/admin/driver-compliance" title="Driver compliance" detail="Documents, approvals and expiry risk" />
              <ModuleLink to="/admin/driver-commission" title="Commission control" detail="Settlements and HALLO commission" />
              <ModuleLink to="/admin/fleet-maintenance" title="Fleet maintenance" detail="Vehicle readiness and service exceptions" />
              <ModuleLink to="/admin/driver-finance-search" title="Driver finance search" detail="Wallet and payment reconciliation" />
              <ModuleLink to="/admin/quote-pricing" title="Quote pricing" detail="Price requests and commercial decisions" />
            </div>
          </QueueCard>
        </div>
      </section>
    </div>
  </main>;
}

function KpiCard({ label, value, detail, to, tone }: { label: string; value: string; detail: string; to: string; tone: Tone }) {
  const accent = tone === "critical" ? "border-route" : tone === "warning" ? "border-amber" : tone === "good" ? "border-emerald-600" : "border-asphalt/15";
  const className = `block min-w-0 overflow-hidden border bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-md sm:p-5 ${accent}`;
  const content = <><p className="break-words text-[10px] font-semibold uppercase tracking-wide text-steel">{label}</p><p className="mt-3 break-words font-display text-xl font-bold sm:text-3xl">{value}</p><p className="mt-2 break-words text-[11px] leading-4 text-steel">{detail}</p></>;
  return to.startsWith("#") ? <a href={to} className={className}>{content}</a> : <Link to={to} className={className}>{content}</Link>;
}

function Metric({ label, value, tone, to }: { label: string; value: string; tone: Tone; to: string }) {
  const valueClass = tone === "critical" ? "text-route" : tone === "warning" ? "text-amber-dim" : tone === "good" ? "text-emerald-800" : "text-asphalt";
  return <Link to={to} className="min-w-0 border border-asphalt/10 bg-white p-4 transition hover:border-amber hover:shadow-sm sm:p-5"><p className="break-words text-[10px] font-semibold uppercase tracking-wide text-steel">{label}</p><p className={`mt-3 break-words font-display text-xl font-bold sm:text-2xl ${valueClass}`}>{value}</p><p className="mt-2 text-[10px] font-semibold text-amber-dim">Open records →</p></Link>;
}

function CommandLink({ to, title, detail }: { to: string; title: string; detail: string }) {
  return <Link to={to} className="min-w-0 border border-asphalt/10 bg-[#f5f3ed] p-3 transition hover:border-amber hover:bg-amber/10 sm:p-4"><p className="break-words text-sm font-semibold">{title}</p><p className="mt-1 break-words text-[10px] leading-4 text-steel">{detail}</p></Link>;
}

function SectionHeader({ eyebrow, title, actionTo, actionLabel }: { eyebrow: string; title: string; actionTo: string; actionLabel: string }) {
  return <div className="mb-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0"><p className="font-mono text-[10px] tracking-[.18em] text-amber-dim">{eyebrow}</p><h2 className="mt-2 break-words font-display text-2xl font-bold">{title}</h2></div><Link to={actionTo} className="self-start border border-asphalt/15 bg-white px-4 py-3 text-xs font-semibold">{actionLabel} →</Link></div>;
}

function QueueCard({ id, title, count, actionTo, children }: { id: string; title: string; count: number; actionTo: string; children: React.ReactNode }) {
  return <article id={id} className="min-w-0 scroll-mt-5 border border-asphalt/10 bg-white"><div className="flex min-w-0 items-start justify-between gap-3 border-b border-asphalt/10 p-4 sm:p-5"><div className="min-w-0"><h3 className="break-words font-display text-lg font-semibold">{title}</h3><p className="mt-1 text-xs text-steel">{count} records</p></div><Link to={actionTo} className="shrink-0 text-xs font-semibold text-amber-dim">Open →</Link></div>{children}</article>;
}

function OrderQueue({ rows, badge, empty = "No matching orders." }: { rows: ControlOrder[]; badge: (order: ControlOrder) => string; empty?: string }) {
  return <div className="divide-y divide-asphalt/10">{rows.slice(0, 6).map((order) => <div key={order.id} className="min-w-0 p-4 sm:p-5"><div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="break-all font-mono text-xs font-semibold">{order.tracking_id}</p><p className="mt-2 break-words text-sm leading-5">{order.pickup_address} → {order.dropoff_address}</p><p className="mt-1 break-words text-xs text-steel">{order.customer_name || "Customer"} · {order.status.replace(/_/g, " ")}</p></div><span className="self-start whitespace-nowrap bg-route/10 px-2.5 py-1.5 text-[10px] font-semibold uppercase text-route">{badge(order)}</span></div></div>)}{!rows.length && <Empty label={empty} />}</div>;
}

function PaymentQueue({ rows, badge, empty }: { rows: ControlPayment[]; badge?: string; empty: string }) {
  return <div className="divide-y divide-asphalt/10">{rows.slice(0, 6).map((payment) => <div key={payment.id} className="min-w-0 p-4 sm:p-5"><div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="break-words font-display text-lg font-bold">{money(Number(payment.amount_etb || 0))}</p><p className="mt-2 break-all font-mono text-xs">{payment.provider_ref || payment.id}</p><p className="mt-1 break-words text-xs capitalize text-steel">{payment.provider.replace(/_/g, " ")} · {payment.event.replace(/_/g, " ")}</p></div><span className={`self-start whitespace-nowrap px-2.5 py-1.5 text-[10px] font-semibold uppercase ${isLegacyCompletedPayment(payment) || badge ? "bg-emerald-50 text-emerald-800" : payment.event === "failed" || payment.event === "refunded" ? "bg-route/10 text-route" : "bg-amber/10 text-amber-dim"}`}>{badge || payment.event.replace(/_/g, " ")}</span></div></div>)}{!rows.length && <Empty label={empty} />}</div>;
}

function QueueSummary({ label, value }: { label: string; value: number }) {
  return <div className="flex min-w-0 items-center justify-between gap-4 border border-asphalt/10 p-4"><p className="min-w-0 break-words text-sm">{label}</p><strong className={value ? "text-route" : "text-emerald-800"}>{value}</strong></div>;
}

function ModuleLink({ to, title, detail }: { to: string; title: string; detail: string }) {
  return <Link to={to} className="min-w-0 border border-asphalt/10 p-4 hover:border-amber"><p className="break-words font-semibold">{title}</p><p className="mt-1 break-words text-xs leading-5 text-steel">{detail}</p></Link>;
}

function Empty({ label }: { label: string }) {
  return <p className="p-8 text-center text-sm text-steel">{label}</p>;
}

function dedupeOrders(orders: ControlOrder[]) {
  return [...new Map(orders.map((order) => [order.id, order])).values()];
}
