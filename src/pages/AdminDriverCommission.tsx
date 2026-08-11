import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatEtb } from "../utils/currency";
import {
  AdminCommissionPayment,
  getAdminCommissionPayments,
  openCommissionReceipt,
  reviewCommissionPayment,
} from "../services/driver-commission.service";

export function AdminDriverCommission() {
  const [rows, setRows] = useState<AdminCommissionPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");

  async function load() {
    try { setRows(await getAdminCommissionPayments()); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not load commission payments."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const visible = useMemo(() => filter === "all" ? rows : rows.filter((row) => row.status === filter), [rows, filter]);
  const pendingTotal = rows.filter((row) => row.status === "pending").reduce((sum, row) => sum + Number(row.amount_etb || 0), 0);
  const approvedTotal = rows.filter((row) => row.status === "approved").reduce((sum, row) => sum + Number(row.amount_etb || 0), 0);

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
        <div><p className="font-mono text-[10px] tracking-[.18em] text-amber-dim">ADMIN / FINANCE CONTROL</p><h1 className="mt-2 font-display text-3xl font-bold">Driver commission settlements</h1><p className="mt-2 max-w-2xl text-sm text-steel">Check the HALLO Smart bank or mobile-money account first. Approve only when the money is genuinely received. Fraud, missing transactions and wrong evidence must be rejected with a reason.</p></div>
        <Link to="/admin" className="self-start border border-asphalt px-4 py-3 text-sm font-semibold">← Back to Control Center</Link>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Pending reviews" value={String(rows.filter((r)=>r.status==="pending").length)} />
        <Metric label="Pending value" value={formatEtb(pendingTotal)} alert={pendingTotal>0} />
        <Metric label="Approved value" value={formatEtb(approvedTotal)} />
        <Metric label="Rejected" value={String(rows.filter((r)=>r.status==="rejected").length)} />
      </div>

      {error && <p className="mb-5 border border-route/30 bg-route/10 p-3 text-sm text-route">{error}</p>}

      <div className="mb-4 flex flex-wrap gap-2">{(["pending","approved","rejected","all"] as const).map((value)=><button key={value} onClick={()=>setFilter(value)} className={`border px-3 py-2 text-xs font-semibold capitalize ${filter===value?"border-asphalt bg-asphalt text-white":"border-asphalt/15 bg-white text-steel"}`}>{value} {value==="all"?rows.length:rows.filter((r)=>r.status===value).length}</button>)}</div>

      <section className="border border-asphalt/10 bg-white">
        <div className="border-b border-asphalt/10 p-5"><h2 className="font-display text-xl font-semibold">Settlement audit queue</h2><p className="mt-1 text-xs text-steel">Transaction IDs are globally unique and cannot be reused.</p></div>
        {loading ? <p className="p-10 text-center text-sm text-steel">Loading settlements…</p> : visible.length ? visible.map((row)=><article key={row.id} className="border-b border-asphalt/10 p-5 last:border-0">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><p className="font-display text-xl font-bold">{formatEtb(row.amount_etb)}</p><Status status={row.status}/></div>
              <p className="mt-3 text-sm font-semibold">{row.driver_name || "Driver"}{row.driver_phone ? ` · ${row.driver_phone}` : ""}</p>
              <p className="mt-1 text-xs text-steel">{row.provider} · Transaction ID: <span className="font-mono text-asphalt">{row.transaction_id}</span></p>
              <p className="mt-1 text-xs text-steel">Submitted {new Date(row.submitted_at).toLocaleString()}</p>
              {row.reviewed_at && <p className="mt-1 text-xs text-steel">Reviewed {new Date(row.reviewed_at).toLocaleString()}</p>}
              {row.rejection_reason && <p className="mt-2 text-xs font-semibold text-route">Rejection reason: {row.rejection_reason}</p>}
            </div>
            <div className="flex flex-wrap gap-2 lg:max-w-xs lg:justify-end">
              <button onClick={()=>openCommissionReceipt(row.receipt_path)} className="border border-asphalt/20 px-3 py-2 text-xs font-semibold">Open receipt</button>
              {row.status === "pending" && <><button disabled={saving===row.id} onClick={()=>approve(row)} className="bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{saving===row.id?"Saving…":"Verify account & approve"}</button><button disabled={saving===row.id} onClick={()=>reject(row)} className="bg-route px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Reject / fraud</button></>}
            </div>
          </div>
        </article>) : <p className="p-10 text-center text-sm text-steel">No {filter === "all" ? "commission settlement" : filter} records.</p>}
      </section>
    </div>
  </main>;
}

function Metric({label,value,alert=false}:{label:string;value:string;alert?:boolean}) { return <div className="border border-asphalt/10 bg-white p-4"><p className="text-[10px] uppercase tracking-wide text-steel">{label}</p><p className={`mt-3 font-display text-xl font-bold ${alert?"text-route":"text-asphalt"}`}>{value}</p></div>; }
function Status({status}:{status:AdminCommissionPayment["status"]}) { const cls=status==="approved"?"bg-emerald-50 text-emerald-800":status==="rejected"?"bg-route/10 text-route":"bg-amber/10 text-amber-dim"; return <span className={`px-2.5 py-1.5 text-[10px] font-semibold uppercase ${cls}`}>{status}</span>; }
