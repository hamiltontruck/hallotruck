import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatEtb } from "../utils/currency";
import { supabase } from "../services/supabase.client";
import {
  AdminCommissionPayment,
  getAdminCommissionPayments,
  openCommissionReceipt,
  reviewCommissionPayment,
} from "../services/driver-commission.service";

type PlatformCommissionStatus = "accrued" | "released" | "reversed";

interface PlatformCommissionAccrual {
  payment_id: string;
  order_id: string;
  tracking_id: string;
  driver_id: string;
  driver_name: string | null;
  provider: string;
  provider_ref: string | null;
  gross_etb: number;
  commission_percent: number;
  commission_etb: number;
  driver_net_etb: number;
  confirmed_at: string;
  released_at: string | null;
  commission_accrued_at: string;
  commission_reversed_at: string | null;
  commission_status: PlatformCommissionStatus;
}

function money(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function AdminDriverCommission() {
  const [rows, setRows] = useState<AdminCommissionPayment[]>([]);
  const [platformRows, setPlatformRows] = useState<PlatformCommissionAccrual[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");

  async function load() {
    try {
      const [settlements, platformResult] = await Promise.all([
        getAdminCommissionPayments(),
        supabase.rpc("admin_platform_commission_accruals"),
      ]);
      if (platformResult.error) throw new Error(platformResult.error.message);
      setRows(settlements);
      setPlatformRows(((platformResult.data ?? []) as PlatformCommissionAccrual[]).map((row) => ({
        ...row,
        gross_etb: money(row.gross_etb),
        commission_percent: money(row.commission_percent),
        commission_etb: money(row.commission_etb),
        driver_net_etb: money(row.driver_net_etb),
      })));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load commission control.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const visible = useMemo(() => filter === "all" ? rows : rows.filter((row) => row.status === filter), [rows, filter]);
  const pendingTotal = rows.filter((row) => row.status === "pending").reduce((sum, row) => sum + Number(row.amount_etb || 0), 0);
  const approvedTotal = rows.filter((row) => row.status === "approved").reduce((sum, row) => sum + Number(row.amount_etb || 0), 0);
  const activePlatformRows = platformRows.filter((row) => row.commission_status !== "reversed");
  const platformCommissionTotal = activePlatformRows.reduce((sum, row) => sum + row.commission_etb, 0);
  const driverNetHeld = activePlatformRows.filter((row) => !row.released_at).reduce((sum, row) => sum + row.driver_net_etb, 0);
  const driverNetReleased = activePlatformRows.filter((row) => row.released_at).reduce((sum, row) => sum + row.driver_net_etb, 0);
  const reversedCommission = platformRows.filter((row) => row.commission_status === "reversed").reduce((sum, row) => sum + row.commission_etb, 0);

  async function approve(row: AdminCommissionPayment) {
    if (!window.confirm(`Confirm that ${formatEtb(row.amount_etb)} is visible in the HALLO Smart ${row.provider} account and approve this settlement?`)) return;
    setSaving(row.id); setError("");
    try { await reviewCommissionPayment(row.id, true); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Approval failed."); }
    finally { setSaving(null); }
  }

  async function reject(row: AdminCommissionPayment) {
    const reason = window.prompt("Why is this payment being rejected? Example: transaction not found, wrong amount, duplicate/fraud receipt.");
    if (!reason?.trim()) return;
    setSaving(row.id); setError("");
    try { await reviewCommissionPayment(row.id, false, reason); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Rejection failed."); }
    finally { setSaving(null); }
  }

  return <main className="min-h-screen bg-[#f5f3ed] p-4 text-asphalt sm:p-8">
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] tracking-[.18em] text-amber-dim">ADMIN / FINANCE CONTROL</p>
          <h1 className="mt-2 font-display text-3xl font-bold">Commission control</h1>
          <p className="mt-2 max-w-2xl text-sm text-steel">HALLO platform commission accrues when the assigned driver confirms an Admin-verified customer payment. Cash paid directly to a driver remains in the separate driver settlement flow.</p>
        </div>
        <Link to="/admin" className="self-start border border-asphalt px-4 py-3 text-sm font-semibold">← Back to Control Center</Link>
      </div>

      {error && <p className="mb-5 border border-route/30 bg-route/10 p-3 text-sm text-route">{error}</p>}

      <section className="mb-8 border border-asphalt/10 bg-white">
        <div className="border-b border-asphalt/10 bg-asphalt p-5 text-white">
          <p className="font-mono text-[10px] tracking-[.18em] text-amber">CUSTOMER BANK / MOBILE-MONEY PAYMENTS</p>
          <h2 className="mt-2 font-display text-2xl font-semibold">HALLO platform commission · 2%</h2>
          <p className="mt-2 text-xs leading-relaxed text-white/60">The 2% becomes HALLO commission immediately after the assigned driver confirms the verified payment. The driver’s 98% stays held until delivery is completed.</p>
        </div>

        <div className="grid grid-cols-2 gap-px bg-asphalt/10 sm:grid-cols-4">
          <PlatformMetric label="HALLO commission earned" value={formatEtb(platformCommissionTotal)} />
          <PlatformMetric label="Driver net held" value={formatEtb(driverNetHeld)} />
          <PlatformMetric label="Driver net released" value={formatEtb(driverNetReleased)} />
          <PlatformMetric label="Commission reversed" value={formatEtb(reversedCommission)} alert={reversedCommission > 0} />
        </div>

        <div className="border-t border-asphalt/10">
          <div className="flex items-center justify-between border-b border-asphalt/10 p-5">
            <div><h3 className="font-display text-xl font-semibold">Driver-confirmed payments</h3><p className="mt-1 text-xs text-steel">Each payment is counted once; refunds reverse the related commission.</p></div>
            <span className="font-mono text-xs text-steel">{platformRows.length} records</span>
          </div>
          {loading ? <p className="p-10 text-center text-sm text-steel">Loading platform commission…</p> : platformRows.length ? platformRows.map((row) => <article key={row.payment_id} className="border-b border-asphalt/10 p-5 last:border-0">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><p className="font-display text-xl font-bold">{formatEtb(row.commission_etb)}</p><PlatformStatus status={row.commission_status} /></div>
                <p className="mt-2 font-mono text-xs font-semibold">{row.tracking_id}</p>
                <p className="mt-2 text-sm font-semibold">{row.driver_name || "Assigned driver"}</p>
                <p className="mt-1 text-xs text-steel">Gross customer payment: {formatEtb(row.gross_etb)}</p>
                <p className="mt-1 text-xs text-steel">HALLO {row.commission_percent}%: <strong className="text-asphalt">{formatEtb(row.commission_etb)}</strong> · Driver 98%: <strong className="text-asphalt">{formatEtb(row.driver_net_etb)}</strong></p>
                <p className="mt-1 text-xs text-steel">{row.provider}{row.provider_ref ? ` · Transaction ID: ${row.provider_ref}` : ""}</p>
                <p className="mt-1 text-xs text-steel">Driver confirmed {new Date(row.confirmed_at).toLocaleString()}</p>
              </div>
              <div className="text-xs font-semibold text-steel lg:text-right">
                {row.commission_status === "accrued" && <p className="text-amber-dim">Commission earned · driver net held</p>}
                {row.commission_status === "released" && <p className="text-emerald-800">Commission earned · driver net released</p>}
                {row.commission_status === "reversed" && <p className="text-route">Refunded · commission reversed</p>}
              </div>
            </div>
          </article>) : <p className="p-10 text-center text-sm text-steel">No driver-confirmed bank or mobile-money payment yet.</p>}
        </div>
      </section>

      <section>
        <div className="mb-5">
          <p className="font-mono text-[10px] tracking-[.18em] text-amber-dim">CASH PAID DIRECTLY TO DRIVER</p>
          <h2 className="mt-2 font-display text-2xl font-bold">Driver cash commission settlements</h2>
          <p className="mt-2 max-w-2xl text-sm text-steel">Check the HALLO Smart bank or mobile-money account first. Approve only when the driver’s 2% settlement is genuinely received. Fraud, missing transactions and wrong evidence must be rejected with a reason.</p>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Pending reviews" value={String(rows.filter((r) => r.status === "pending").length)} />
          <Metric label="Pending value" value={formatEtb(pendingTotal)} alert={pendingTotal > 0} />
          <Metric label="Approved value" value={formatEtb(approvedTotal)} />
          <Metric label="Rejected" value={String(rows.filter((r) => r.status === "rejected").length)} />
        </div>

        <div className="mb-4 flex flex-wrap gap-2">{(["pending", "approved", "rejected", "all"] as const).map((value) => <button key={value} onClick={() => setFilter(value)} className={`border px-3 py-2 text-xs font-semibold capitalize ${filter === value ? "border-asphalt bg-asphalt text-white" : "border-asphalt/15 bg-white text-steel"}`}>{value} {value === "all" ? rows.length : rows.filter((r) => r.status === value).length}</button>)}</div>

        <div className="border border-asphalt/10 bg-white">
          <div className="border-b border-asphalt/10 p-5"><h3 className="font-display text-xl font-semibold">Settlement audit queue</h3><p className="mt-1 text-xs text-steel">Transaction IDs are globally unique and cannot be reused.</p></div>
          {loading ? <p className="p-10 text-center text-sm text-steel">Loading settlements…</p> : visible.length ? visible.map((row) => <article key={row.id} className="border-b border-asphalt/10 p-5 last:border-0">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><p className="font-display text-xl font-bold">{formatEtb(row.amount_etb)}</p><Status status={row.status} /></div>
                <p className="mt-3 text-sm font-semibold">{row.driver_name || "Driver"}{row.driver_phone ? ` · ${row.driver_phone}` : ""}</p>
                <p className="mt-1 text-xs text-steel">{row.provider} · Transaction ID: <span className="font-mono text-asphalt">{row.transaction_id}</span></p>
                <p className="mt-1 text-xs text-steel">Submitted {new Date(row.submitted_at).toLocaleString()}</p>
                {row.reviewed_at && <p className="mt-1 text-xs text-steel">Reviewed {new Date(row.reviewed_at).toLocaleString()}</p>}
                {row.rejection_reason && <p className="mt-2 text-xs font-semibold text-route">Rejection reason: {row.rejection_reason}</p>}
              </div>
              <div className="flex flex-wrap gap-2 lg:max-w-xs lg:justify-end">
                <button onClick={() => openCommissionReceipt(row.receipt_path)} className="border border-asphalt/20 px-3 py-2 text-xs font-semibold">Open receipt</button>
                {row.status === "pending" && <><button disabled={saving === row.id} onClick={() => approve(row)} className="bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{saving === row.id ? "Saving…" : "Verify account & approve"}</button><button disabled={saving === row.id} onClick={() => reject(row)} className="bg-route px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Reject / fraud</button></>}
              </div>
            </div>
          </article>) : <p className="p-10 text-center text-sm text-steel">No {filter === "all" ? "commission settlement" : filter} records.</p>}
        </div>
      </section>
    </div>
  </main>;
}

function PlatformMetric({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) {
  return <div className="bg-white p-4"><p className="text-[10px] uppercase tracking-wide text-steel">{label}</p><p className={`mt-3 font-display text-xl font-bold ${alert ? "text-route" : "text-asphalt"}`}>{value}</p></div>;
}

function PlatformStatus({ status }: { status: PlatformCommissionStatus }) {
  const cls = status === "released" ? "bg-emerald-50 text-emerald-800" : status === "reversed" ? "bg-route/10 text-route" : "bg-amber/10 text-amber-dim";
  return <span className={`px-2.5 py-1.5 text-[10px] font-semibold uppercase ${cls}`}>{status}</span>;
}

function Metric({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) {
  return <div className="border border-asphalt/10 bg-white p-4"><p className="text-[10px] uppercase tracking-wide text-steel">{label}</p><p className={`mt-3 font-display text-xl font-bold ${alert ? "text-route" : "text-asphalt"}`}>{value}</p></div>;
}

function Status({ status }: { status: AdminCommissionPayment["status"] }) {
  const cls = status === "approved" ? "bg-emerald-50 text-emerald-800" : status === "rejected" ? "bg-route/10 text-route" : "bg-amber/10 text-amber-dim";
  return <span className={`px-2.5 py-1.5 text-[10px] font-semibold uppercase ${cls}`}>{status}</span>;
}
