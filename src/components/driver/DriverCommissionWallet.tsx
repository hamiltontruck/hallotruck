import { FormEvent, useEffect, useState } from "react";
import { formatEtb } from "../../utils/currency";
import {
  DriverCommissionPayment,
  DriverCommissionSummary,
  getMyCommissionPayments,
  getMyCommissionSummary,
  openCommissionReceipt,
  submitCommissionPayment,
} from "../../services/driver-commission.service";

const providers = ["Telebirr", "CBE", "Awash Bank", "Bank of Abyssinia", "Dashen Bank", "Cooperative Bank of Oromia", "M-Pesa"];

export function DriverCommissionWallet() {
  const [summary, setSummary] = useState<DriverCommissionSummary | null>(null);
  const [payments, setPayments] = useState<DriverCommissionPayment[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    try {
      const [nextSummary, nextPayments] = await Promise.all([getMyCommissionSummary(), getMyCommissionPayments()]);
      setSummary(nextSummary); setPayments(nextPayments); setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load commission wallet."); }
  }

  useEffect(() => { load(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const receipt = data.get("receipt");
    if (!(receipt instanceof File) || !receipt.size) { setError("Receipt screenshot or PDF is required."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      await submitCommissionPayment({
        provider: String(data.get("provider") || ""),
        transactionId: String(data.get("transactionId") || ""),
        amountEtb: Number(data.get("amountEtb") || 0),
        receipt,
      });
      form.reset();
      setNotice("Commission payment submitted. Admin/Finance will verify the money in the HALLO Smart account before approval.");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Payment submission failed."); }
    finally { setSaving(false); }
  }

  return <section className="mt-8 border border-line bg-white">
    <div className="border-b border-line bg-asphalt p-5 text-white sm:p-6">
      <p className="font-mono text-[10px] uppercase tracking-[.18em] text-amber">HALLO SMART COMMISSION WALLET</p>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="font-display text-2xl font-bold">Commission settlement</h2><p className="mt-2 max-w-xl text-xs leading-5 text-white/55">Every confirmed bank/mobile payment and direct customer collection creates the HALLO Smart 2% commission balance. Your prepaid deposit covers that balance first.</p></div>
        <div className="shrink-0"><p className="text-[10px] uppercase tracking-wide text-white/45">Balance due</p><p className="mt-1 font-display text-2xl font-bold text-amber">{summary ? formatEtb(summary.balanceEtb) : "—"}</p></div>
      </div>
    </div>

    {summary && <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
      <Metric label="Commission charged" value={formatEtb(summary.chargedEtb)} />
      <Metric label="Approved paid" value={formatEtb(summary.approvedPaidEtb)} />
      <Metric label="Pending review" value={formatEtb(summary.pendingEtb)} />
      <Metric label="Job access" value={summary.blocked ? "BLOCKED" : "ACTIVE"} alert={summary.blocked} />
    </div>}

    <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_1.1fr]">
      <form onSubmit={submit} className="border border-line p-4">
        <h3 className="font-display text-lg font-semibold">Pay commission</h3>
        <p className="mt-1 text-xs text-steel">Use the HALLO Smart bank or mobile-money account, then submit the exact evidence here.</p>
        <label className="mt-4 block text-xs font-semibold">Provider<select name="provider" required className="mt-2 w-full border border-line bg-white p-3 text-sm">{providers.map((provider)=><option key={provider}>{provider}</option>)}</select></label>
        <label className="mt-4 block text-xs font-semibold">Amount ETB<input name="amountEtb" required min="1" step="0.01" type="number" max={summary?.balanceEtb || undefined} className="mt-2 w-full border border-line p-3 text-sm" /></label>
        <label className="mt-4 block text-xs font-semibold">Transaction ID<input name="transactionId" required className="mt-2 w-full border border-line p-3 text-sm" placeholder="Unique bank / Telebirr reference" /></label>
        <label className="mt-4 block text-xs font-semibold">Screenshot / receipt<input name="receipt" required type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="mt-2 block w-full text-xs" /></label>
        <p className="mt-3 text-[11px] leading-5 text-steel">A transaction ID can only be used once. Screenshot submission does not reduce your balance until Admin/Finance verifies the account and approves it.</p>
        {error && <p className="mt-3 bg-route/10 p-3 text-xs text-route">{error}</p>}
        {notice && <p className="mt-3 bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</p>}
        <button disabled={saving || !summary || summary.balanceEtb <= 0} className="mt-4 w-full bg-asphalt py-3 text-sm font-semibold text-white disabled:opacity-40">{saving ? "Submitting…" : "Submit commission payment"}</button>
      </form>

      <div className="border border-line">
        <div className="border-b border-line p-4"><h3 className="font-display text-lg font-semibold">Settlement history</h3><p className="mt-1 text-xs text-steel">Pending, approved and rejected submissions remain visible for audit.</p></div>
        <div className="max-h-[430px] overflow-y-auto">
          {payments.length ? payments.map((payment)=><div key={payment.id} className="border-b border-line p-4 last:border-0">
            <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{formatEtb(payment.amount_etb)}</p><p className="mt-1 text-xs text-steel">{payment.provider} · {payment.transaction_id}</p></div><Status status={payment.status}/></div>
            <p className="mt-2 text-[11px] text-steel">Submitted {new Date(payment.submitted_at).toLocaleString()}</p>
            {payment.rejection_reason && <p className="mt-2 text-xs font-semibold text-route">Rejected: {payment.rejection_reason}</p>}
            <button onClick={()=>openCommissionReceipt(payment.receipt_path)} className="mt-3 text-xs font-semibold text-amber-dim">Open receipt</button>
          </div>) : <p className="p-6 text-sm text-steel">No commission settlement submitted yet.</p>}
        </div>
      </div>
    </div>
  </section>;
}

function Metric({label,value,alert=false}:{label:string;value:string;alert?:boolean}) { return <div className="bg-white p-4"><p className="text-[10px] uppercase tracking-wide text-steel">{label}</p><p className={`mt-2 font-display text-lg font-bold ${alert?"text-route":"text-asphalt"}`}>{value}</p></div>; }
function Status({status}:{status:DriverCommissionPayment["status"]}) { const cls=status==="approved"?"bg-emerald-50 text-emerald-800":status==="rejected"?"bg-route/10 text-route":"bg-amber/10 text-amber-dim"; return <span className={`px-2.5 py-1.5 text-[10px] font-semibold uppercase ${cls}`}>{status}</span>; }
