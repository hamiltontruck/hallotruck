import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AdminReportsSummary, getAdminReportsSummary } from "../../services/admin-reports.service";

type FallbackSummary = AdminReportsSummary;

function compactMoney(value: number) {
  return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1_000 ? `${(value / 1_000).toFixed(1)}K` : value.toLocaleString();
}

function ReportCard({ label, value, note = "Live from Supabase" }: { label: string; value: string | number; note?: string }) {
  return <div className="bg-white border border-asphalt/10 p-5 sm:p-7"><p className="text-xs text-steel">{label}</p><p className="font-display font-bold text-2xl sm:text-3xl mt-4 break-words">{value}</p><p className="text-[11px] text-emerald-700 mt-4">{note}</p></div>;
}

function HealthRow({ label, value }: { label: string; value: number }) {
  return <div className="bg-[#f5f3ed] p-4"><p className="text-xs text-steel">{label}</p><p className="mt-2 font-display text-2xl font-bold">{value}</p></div>;
}

export function AdminReportsPanel({ fixtureMode = false, fallback }: { fixtureMode?: boolean; fallback: FallbackSummary }) {
  const [summary, setSummary] = useState<AdminReportsSummary>(fallback);
  const [loading, setLoading] = useState(!fixtureMode);
  const [error, setError] = useState("");

  useEffect(() => {
    if (fixtureMode) {
      setSummary(fallback);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    void getAdminReportsSummary()
      .then((next) => { if (!cancelled) setSummary(next); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load Admin reports."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fixtureMode, fallback]);

  const completionRate = summary.totalOrders ? Math.round(summary.deliveredOrders / summary.totalOrders * 100) : 0;
  const fleetUtilization = summary.totalTrucks ? Math.round(summary.assignedTrucks / summary.totalTrucks * 100) : 0;
  const releasedNet = Math.max(0, summary.releasedGrossEtb - summary.refundedEtb);

  return <>
    <Link to="/admin/intelligence" className="mb-5 flex min-w-0 flex-col gap-4 overflow-hidden bg-asphalt p-5 text-white sm:flex-row sm:items-center sm:justify-between sm:p-6"><div className="min-w-0"><p className="font-mono text-[10px] tracking-[.18em] text-amber">ADMIN INTELLIGENCE</p><p className="mt-2 break-words font-display text-2xl font-bold">Open next-generation Reports & Global Search</p><p className="mt-2 max-w-2xl break-words text-xs leading-5 text-white/55">Search every operational record, change report periods, inspect revenue trends, top routes and actionable smart signals.</p></div><span className="shrink-0 font-semibold text-amber">Open intelligence →</span></Link>
    {error && <p role="alert" className="mb-4 border border-route/30 bg-route/10 p-3 text-sm text-route">{error}</p>}
    {loading && <p role="status" className="mb-4 border border-asphalt/10 bg-white p-3 text-sm text-steel">Loading exact report totals…</p>}
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4"><ReportCard label="Delivery completion" value={`${completionRate}%`} note={`${summary.deliveredOrders.toLocaleString()} delivered of ${summary.totalOrders.toLocaleString()}`} /><ReportCard label="Active shipments" value={summary.activeShipments.toLocaleString()} note="Accepted + in transit" /><ReportCard label="Fleet utilization" value={`${fleetUtilization}%`} note={`${summary.assignedTrucks.toLocaleString()} assigned of ${summary.totalTrucks.toLocaleString()}`} /><ReportCard label="Approved drivers" value={summary.approvedDrivers.toLocaleString()} note={`${summary.totalDrivers.toLocaleString()} driver profiles`} /><ReportCard label="Released revenue" value={`ETB ${compactMoney(releasedNet)}`} note="Net of recorded credit refunds" /><ReportCard label="Held escrow" value={`ETB ${compactMoney(summary.heldEscrowEtb)}`} note="Verified, not released" /><ReportCard label="Pending verification" value={`ETB ${compactMoney(summary.initiatedEtb)}`} note="Initiated customer payments" /><ReportCard label="Customers" value={summary.totalCustomers.toLocaleString()} note="Live customer records" /></div>
    <div className="mt-5 border border-asphalt/10 bg-white p-5"><p className="font-display text-lg font-semibold">Operational health</p><div className="mt-4 grid gap-3 sm:grid-cols-3"><HealthRow label="Orders waiting assignment" value={summary.waitingAssignment} /><HealthRow label="Available trucks" value={summary.availableTrucks} /><HealthRow label="Payments needing verification" value={summary.paymentsNeedingVerification} /></div></div>
  </>;
}
