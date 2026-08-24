import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AdminOrder, DeliveryProof, Payment, getDashboardData } from "../services/admin.service";

type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
type Tone = "neutral" | "good" | "warning" | "critical";

function sameDay(value?: string | null) {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function isDelayed(order: AdminOrder) {
  if (!["accepted", "in_transit"].includes(order.status)) return false;
  return Date.now() - new Date(order.accepted_at || order.created_at).getTime() > 48 * 60 * 60 * 1000;
}

function hasProof(order: AdminOrder, proofs: DeliveryProof[]) {
  return proofs.some((proof) => proof.order_id === order.id);
}

function todayRevenue(payments: Payment[]) {
  return payments.reduce((sum, payment) => {
    if (!sameDay(payment.created_at)) return sum;
    const amount = Number(payment.amount_etb || 0);
    if (payment.event === "released") return sum + amount;
    if (payment.event === "refunded") return sum - amount;
    return sum;
  }, 0);
}

function money(value: number) {
  return `ETB ${Math.max(0, value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function AdminCeoOverview() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      setData(await getDashboardData());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load CEO dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const view = useMemo(() => {
    if (!data) return null;
    const activeTrips = data.orders.filter((order) => ["accepted", "in_transit"].includes(order.status));
    const delayedTrips = activeTrips.filter(isDelayed);
    const unassigned = data.orders.filter((order) => order.status !== "delivered" && (!order.driver_id || !order.truck_id));
    const pendingPayments = data.payments.filter((payment) => payment.event === "initiated");
    const missingEvidence = data.orders.filter((order) => order.status === "delivered" && !hasProof(order, data.deliveryProofs));
    const activeDrivers = data.drivers.filter((driver) => ["active", "available", "online", "busy"].includes((driver.driver_status || "").toLowerCase()));
    const maintenance = data.trucks.filter((truck) => ["maintenance", "service_due", "out_of_service"].includes(truck.status));
    return {
      activeTrips,
      delayedTrips,
      unassigned,
      pendingPayments,
      missingEvidence,
      activeDrivers,
      maintenance,
      availableTrucks: data.trucks.filter((truck) => truck.status === "available"),
      todayOrders: data.orders.filter((order) => sameDay(order.created_at)),
      deliveredToday: data.orders.filter((order) => order.status === "delivered" && sameDay(order.delivered_at)),
      onlineCustomers: data.customers.filter((customer) => sameDay(customer.created_at)),
      revenue: todayRevenue(data.payments),
    };
  }, [data]);

  if (loading) return <main className="min-h-screen bg-[#f5f3ed] p-5"><p className="py-24 text-center font-mono text-sm text-steel">Loading CEO control center…</p></main>;
  if (!data || !view) return <main className="min-h-screen bg-[#f5f3ed] p-5"><div className="mx-auto max-w-3xl border border-route/30 bg-route/10 p-5 text-route"><p>{error || "Dashboard data is unavailable."}</p><button onClick={() => void load()} className="mt-4 bg-asphalt px-4 py-3 text-sm font-semibold text-white">Retry</button></div></main>;

  const cards = [
    ["Today's Revenue", money(view.revenue), "Released minus refunded today", "/admin/payment-review", "good"],
    ["Today's Orders", String(view.todayOrders.length), "Created today", "/admin/operations", "neutral"],
    ["Active Trips", String(view.activeTrips.length), "Accepted or in transit", "/admin/operations", "neutral"],
    ["Delivered Today", String(view.deliveredToday.length), "Completed today", "/admin/operations", "good"],
    ["Delayed Trips", String(view.delayedTrips.length), "Active over 48 hours", "/admin/operations", view.delayedTrips.length ? "critical" : "good"],
    ["Available Trucks", String(view.availableTrucks.length), `${data.trucks.length} total fleet`, "/admin/fleet-maintenance", "neutral"],
    ["Active Drivers", String(view.activeDrivers.length), `${data.drivers.length} registered`, "/admin/driver-compliance", "neutral"],
    ["Online Customers", String(view.onlineCustomers.length), "New activity today", "/admin/operations", "neutral"],
    ["Pending Payments", String(view.pendingPayments.length), "Waiting for review", "/admin/payment-review", view.pendingPayments.length ? "warning" : "good"],
    ["Missing Evidence", String(view.missingEvidence.length), "Delivered without POD", "/admin/payment-review", view.missingEvidence.length ? "warning" : "good"],
    ["Driver Compliance Alerts", "Open", "Documents and approvals", "/admin/driver-compliance", "warning"],
    ["Fleet Maintenance Alerts", String(view.maintenance.length), "Maintenance or service due", "/admin/fleet-maintenance", view.maintenance.length ? "warning" : "good"],
  ] as const;

  const attention = view.delayedTrips.length + view.unassigned.length + view.pendingPayments.length + view.missingEvidence.length + view.maintenance.length;

  return <main className="min-h-screen overflow-x-hidden bg-[#f5f3ed] p-4 pb-24 text-asphalt sm:p-8">
    <div className="mx-auto max-w-7xl">
      <header className="overflow-hidden bg-asphalt p-6 text-white sm:p-9">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0"><p className="font-mono text-[10px] tracking-[.22em] text-amber">CEO OPERATIONS CONTROL</p><h1 className="mt-3 font-display text-3xl font-bold sm:text-4xl">HALLO Smart Logistics</h1><p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/60">Orders, trips, fleet, finance, evidence and driver risk in one actionable dashboard.</p></div>
          <div className="flex flex-wrap gap-2"><Link to="/admin/operations" className="bg-amber px-4 py-3 text-sm font-semibold text-asphalt">Open Operations</Link><button onClick={() => void load()} className="border border-white/20 px-4 py-3 text-sm font-semibold">Refresh</button></div>
        </div>
      </header>

      {error && <p className="mt-5 border border-route/30 bg-route/10 p-4 text-sm text-route">{error}</p>}

      <section className={`mt-5 border p-4 sm:p-5 ${attention ? "border-route/25 bg-route/5" : "border-emerald-700/20 bg-emerald-50"}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-display text-lg font-semibold">{attention ? `${attention} items need attention` : "Operations healthy"}</p><p className="mt-1 text-xs text-steel">Delayed {view.delayedTrips.length} · Unassigned {view.unassigned.length} · Payments {view.pendingPayments.length} · Evidence {view.missingEvidence.length} · Maintenance {view.maintenance.length}</p></div><Link to="/admin/operations" className="self-start border border-asphalt/15 bg-white px-4 py-3 text-xs font-semibold">Review action queue →</Link></div>
      </section>

      <section className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map(([label, value, detail, to, tone]) => <KpiCard key={label} label={label} value={value} detail={detail} to={to} tone={tone} />)}
      </section>

      <section className="mt-7 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="min-w-0 border border-asphalt/10 bg-white"><div className="flex items-center justify-between border-b border-asphalt/10 p-5"><div><h2 className="font-display text-xl font-semibold">Priority operations</h2><p className="mt-1 text-xs text-steel">Delayed and unassigned orders</p></div><Link to="/admin/operations" className="text-xs font-semibold text-amber-dim">Open all</Link></div><div className="divide-y divide-asphalt/10">{[...view.delayedTrips, ...view.unassigned].slice(0, 6).map((order) => <article key={order.id} className="min-w-0 p-5"><div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:justify-between"><div className="min-w-0"><p className="break-all font-mono text-xs font-semibold">{order.tracking_id}</p><p className="mt-2 break-words text-sm">{order.pickup_address} → {order.dropoff_address}</p></div><span className="self-start whitespace-nowrap bg-route/10 px-2.5 py-1.5 text-[10px] font-semibold uppercase text-route">{isDelayed(order) ? "Delayed" : "Unassigned"}</span></div></article>)}{view.delayedTrips.length + view.unassigned.length === 0 && <p className="p-8 text-center text-sm text-steel">No delayed or unassigned orders.</p>}</div></div>

        <div className="border border-asphalt/10 bg-white p-5"><h2 className="font-display text-xl font-semibold">Control modules</h2><div className="mt-4 grid gap-2"><ModuleLink to="/admin/payment-review" title="Finance review" detail="Payments, escrow, released and evidence"/><ModuleLink to="/admin/driver-compliance" title="Driver compliance" detail="Documents, approvals and expiry risk"/><ModuleLink to="/admin/driver-commission" title="Commission control" detail="Settlements and HALLO commission"/><ModuleLink to="/admin/fleet-maintenance" title="Fleet maintenance" detail="Vehicle readiness and service exceptions"/><ModuleLink to="/admin/driver-finance-search" title="Driver finance search" detail="Wallet and payment reconciliation"/></div></div>
      </section>
    </div>
  </main>;
}

function KpiCard({ label, value, detail, to, tone }: { label: string; value: string; detail: string; to: string; tone: Tone }) {
  const accent = tone === "critical" ? "border-route" : tone === "warning" ? "border-amber" : tone === "good" ? "border-emerald-600" : "border-asphalt/15";
  return <Link to={to} className={`min-w-0 overflow-hidden border bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-md sm:p-5 ${accent}`}><p className="break-words text-[10px] font-semibold uppercase tracking-wide text-steel">{label}</p><p className="mt-3 break-words font-display text-2xl font-bold sm:text-3xl">{value}</p><p className="mt-2 break-words text-[11px] leading-4 text-steel">{detail}</p></Link>;
}

function ModuleLink({ to, title, detail }: { to: string; title: string; detail: string }) {
  return <Link to={to} className="min-w-0 border border-asphalt/10 p-4 hover:border-amber"><p className="font-semibold">{title}</p><p className="mt-1 break-words text-xs text-steel">{detail}</p></Link>;
}
