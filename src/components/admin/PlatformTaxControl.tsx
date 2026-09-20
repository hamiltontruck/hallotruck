import { FormEvent, useEffect, useMemo, useState } from "react";
import { formatEtb } from "../../utils/currency";
import {
  createPlatformTaxPeriod,
  getPlatformTaxControl,
  openPlatformTaxReceipt,
  recordPlatformTaxRemittance,
  type PlatformTaxControl as PlatformTaxControlData,
  type PlatformTaxPeriod,
  type PlatformTaxStatus,
} from "../../services/platform-tax.service";

const EMPTY: PlatformTaxControlData = {
  summary: {
    taxRatePercent: 15,
    allTimeCommissionEtb: 0,
    allTimeTaxReserveEtb: 0,
    periodizedTaxDueEtb: 0,
    unperiodizedTaxEtb: 0,
    totalDueEtb: 0,
    totalPaidEtb: 0,
    totalOutstandingEtb: 0,
    totalCreditEtb: 0,
    dueCount: 0,
    partialCount: 0,
    paidCount: 0,
  },
  periods: [],
  remittances: [],
};

export function PlatformTaxControl() {
  const [data, setData] = useState<PlatformTaxControlData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedPeriodId, setSelectedPeriodId] = useState("");

  async function load() {
    setLoading(true);
    try {
      const next = await getPlatformTaxControl();
      setData(next);
      setSelectedPeriodId((current) => {
        if (current && next.periods.some((period) => period.id === current && period.outstandingEtb > 0)) return current;
        return next.periods.find((period) => period.outstandingEtb > 0)?.id ?? "";
      });
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load government tax control.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const selectedPeriod = useMemo(
    () => data.periods.find((period) => period.id === selectedPeriodId) ?? null,
    [data.periods, selectedPeriodId],
  );

  async function createPeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true); setError(""); setSuccess("");
    try {
      await createPlatformTaxPeriod(String(values.get("periodStart")), String(values.get("periodEnd")));
      form.reset();
      setSuccess("Tax period created from canonical HALLO commission.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Tax period creation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function recordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPeriod) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const evidence = values.get("evidence");
    if (!(evidence instanceof File) || !evidence.size) {
      setError("Government payment receipt or evidence is required.");
      return;
    }
    setBusy(true); setError(""); setSuccess("");
    try {
      await recordPlatformTaxRemittance({
        taxPeriodId: selectedPeriod.id,
        amountEtb: Number(values.get("amountEtb")),
        paymentDate: String(values.get("paymentDate")),
        paymentMethod: String(values.get("paymentMethod")),
        reference: String(values.get("reference")),
        note: String(values.get("note") ?? ""),
        evidence,
      });
      form.reset();
      setSuccess("Government tax remittance recorded with immutable evidence.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Tax remittance failed.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="mb-8 overflow-hidden border border-asphalt/10 bg-white">
    <div className="bg-asphalt p-5 text-white sm:p-6">
      <p className="font-mono text-[10px] tracking-[.18em] text-amber">GOVERNMENT TAX CONTROL</p>
      <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-display text-2xl font-semibold">Tax liability & remittance ledger</h2>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-white/60">
            Configured rate: {data.summary.taxRatePercent}%. Liability is derived from canonical HALLO Driver commission after duplicate prevention, reversals and corrections. Driver 98% is unchanged.
          </p>
        </div>
        <span className="w-fit border border-white/20 px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-white/70">
          Immutable history + private evidence
        </span>
      </div>
    </div>

    {error && <p className="border-b border-route/30 bg-route/10 p-4 text-sm text-route" role="alert">{error}</p>}
    {success && <p className="border-b border-emerald-600/30 bg-emerald-50 p-4 text-sm text-emerald-800" aria-live="polite">{success}</p>}

    {loading ? <p className="p-10 text-center text-sm text-steel">Loading tax ledger…</p> : <>
      <div className="grid grid-cols-2 gap-px bg-asphalt/10 sm:grid-cols-3 xl:grid-cols-6">
        <TaxMetric label="All-time HALLO commission" value={formatEtb(data.summary.allTimeCommissionEtb)} />
        <TaxMetric label="All-time tax reserve" value={formatEtb(data.summary.allTimeTaxReserveEtb)} alert={data.summary.allTimeTaxReserveEtb > 0} />
        <TaxMetric label="Periodized due" value={formatEtb(data.summary.periodizedTaxDueEtb)} />
        <TaxMetric label="Unperiodized liability" value={formatEtb(data.summary.unperiodizedTaxEtb)} alert={data.summary.unperiodizedTaxEtb > 0} />
        <TaxMetric label="Government paid" value={formatEtb(data.summary.totalPaidEtb)} />
        <TaxMetric label="Period outstanding" value={formatEtb(data.summary.totalOutstandingEtb)} alert={data.summary.totalOutstandingEtb > 0} />
      </div>

      <div className="grid gap-px border-t border-asphalt/10 bg-asphalt/10 xl:grid-cols-2">
        <div className="bg-white p-5">
          <p className="font-mono text-[10px] tracking-[.16em] text-steel">CREATE LIABILITY PERIOD</p>
          <h3 className="mt-2 font-display text-xl font-semibold">Close a tax period</h3>
          <p className="mt-2 text-xs leading-5 text-steel">Period dates cannot overlap. The creation snapshot is permanent; current due is recalculated from canonical corrections.</p>
          <form onSubmit={createPeriod} className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="text-[10px] font-semibold uppercase tracking-wide">Start<input name="periodStart" type="date" required className="mt-2 min-h-11 w-full border border-asphalt/15 px-3 text-xs normal-case" /></label>
            <label className="text-[10px] font-semibold uppercase tracking-wide">End<input name="periodEnd" type="date" required className="mt-2 min-h-11 w-full border border-asphalt/15 px-3 text-xs normal-case" /></label>
            <button disabled={busy} className="min-h-11 self-end bg-asphalt px-4 py-3 text-xs font-semibold text-white disabled:opacity-40">Create period</button>
          </form>
        </div>

        <div className="bg-white p-5">
          <p className="font-mono text-[10px] tracking-[.16em] text-steel">RECORD GOVERNMENT PAYMENT</p>
          <h3 className="mt-2 font-display text-xl font-semibold">Append remittance evidence</h3>
          {!selectedPeriod ? <p className="mt-4 text-sm text-steel">No tax period currently has an outstanding balance.</p> : <form onSubmit={recordPayment} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-[10px] font-semibold uppercase tracking-wide sm:col-span-2">Tax period<select value={selectedPeriodId} onChange={(event) => setSelectedPeriodId(event.target.value)} className="mt-2 min-h-11 w-full border border-asphalt/15 bg-white px-3 text-xs normal-case">
              {data.periods.filter((period) => period.outstandingEtb > 0).map((period) => <option key={period.id} value={period.id}>{period.periodStart} → {period.periodEnd} · outstanding {formatEtb(period.outstandingEtb)}</option>)}
            </select></label>
            <label className="text-[10px] font-semibold uppercase tracking-wide">Amount ETB<input name="amountEtb" type="number" min="0.01" max={selectedPeriod.outstandingEtb} step="0.01" required className="mt-2 min-h-11 w-full border border-asphalt/15 px-3 text-xs normal-case" /></label>
            <label className="text-[10px] font-semibold uppercase tracking-wide">Payment date<input name="paymentDate" type="date" required className="mt-2 min-h-11 w-full border border-asphalt/15 px-3 text-xs normal-case" /></label>
            <label className="text-[10px] font-semibold uppercase tracking-wide">Method<input name="paymentMethod" required defaultValue="bank transfer" minLength={2} maxLength={50} className="mt-2 min-h-11 w-full border border-asphalt/15 px-3 text-xs normal-case" /></label>
            <label className="text-[10px] font-semibold uppercase tracking-wide">Reference<input name="reference" required minLength={3} maxLength={120} placeholder="Government receipt / transaction ID" className="mt-2 min-h-11 w-full border border-asphalt/15 px-3 text-xs normal-case" /></label>
            <label className="text-[10px] font-semibold uppercase tracking-wide sm:col-span-2">Receipt / evidence<input name="evidence" type="file" required accept="image/jpeg,image/png,image/webp,application/pdf" className="mt-2 block min-h-11 w-full border border-asphalt/15 bg-white p-2 text-xs normal-case" /></label>
            <label className="text-[10px] font-semibold uppercase tracking-wide sm:col-span-2">Note (optional)<input name="note" minLength={3} maxLength={500} className="mt-2 min-h-11 w-full border border-asphalt/15 px-3 text-xs normal-case" /></label>
            <button disabled={busy} className="min-h-11 bg-emerald-700 px-4 py-3 text-xs font-semibold text-white disabled:opacity-40 sm:col-span-2">{busy ? "Recording…" : "Record immutable remittance"}</button>
          </form>}
        </div>
      </div>

      <div className="border-t border-asphalt/10">
        <div className="flex flex-col gap-2 p-5 sm:flex-row sm:items-end sm:justify-between">
          <div><h3 className="font-display text-xl font-semibold">Tax periods</h3><p className="mt-1 text-xs text-steel">Status is derived: due → partial → paid. Historical rows cannot be edited or deleted.</p></div>
          <span className="font-mono text-xs text-steel">{data.periods.length} periods · {data.summary.dueCount} due · {data.summary.partialCount} partial</span>
        </div>
        {data.periods.length ? <div className="divide-y divide-asphalt/10">{data.periods.map((period) => <TaxPeriodRow key={period.id} period={period} />)}</div> : <p className="px-5 pb-6 text-sm text-steel">No tax period recorded yet.</p>}
      </div>

      <div className="border-t border-asphalt/10">
        <div className="p-5"><h3 className="font-display text-xl font-semibold">Remittance history</h3><p className="mt-1 text-xs text-steel">Payment reference, actor, amount, date and private evidence remain append-only.</p></div>
        {data.remittances.length ? <div className="divide-y divide-asphalt/10">{data.remittances.map((row) => <article key={row.id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0"><p className="font-display text-xl font-bold">{formatEtb(row.amountEtb)}</p><p className="mt-2 font-mono text-xs">{row.reference}</p><p className="mt-1 text-xs text-steel">{row.paymentDate} · {row.paymentMethod}</p><p className="mt-1 text-xs text-steel">Recorded by {row.paidByName || "Admin/CEO"} · {new Date(row.createdAt).toLocaleString()}</p>{row.note && <p className="mt-2 text-xs text-steel">{row.note}</p>}</div>
          <button type="button" onClick={() => void openPlatformTaxReceipt(row.receiptPath)} className="min-h-11 self-start border border-asphalt/20 px-4 py-3 text-xs font-semibold">Open evidence</button>
        </article>)}</div> : <p className="px-5 pb-6 text-sm text-steel">No government remittance recorded yet.</p>}
      </div>
    </>}
  </section>;
}

function TaxMetric({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) {
  return <div className="bg-white p-4"><p className="font-mono text-[9px] uppercase tracking-wide text-steel">{label}</p><p className={`mt-3 break-words font-display text-xl font-bold ${alert ? "text-route" : "text-asphalt"}`}>{value}</p></div>;
}

function TaxPeriodRow({ period }: { period: PlatformTaxPeriod }) {
  return <article className="p-5">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><p className="font-display text-lg font-bold">{period.periodStart} → {period.periodEnd}</p><TaxStatus status={period.status} /></div>
        <p className="mt-2 text-xs text-steel">Canonical commission: <strong className="text-asphalt">{formatEtb(period.currentCommissionBaseEtb)}</strong> · Current tax due: <strong className="text-asphalt">{formatEtb(period.currentTaxDueEtb)}</strong></p>
        <p className="mt-1 text-xs text-steel">Paid: {formatEtb(period.paidEtb)} · Outstanding: {formatEtb(period.outstandingEtb)}{period.creditEtb > 0 ? ` · Credit: ${formatEtb(period.creditEtb)}` : ""}</p>
        {(period.commissionBaseSnapshotEtb !== period.currentCommissionBaseEtb || period.taxDueSnapshotEtb !== period.currentTaxDueEtb) && <p className="mt-2 text-[11px] font-semibold text-amber-dim">Current liability differs from creation snapshot because canonical commission history changed.</p>}
      </div>
      <div className="shrink-0 text-xs text-steel lg:text-right"><p>Configured tax {period.taxRatePercent}%</p><p className="mt-1">Created {new Date(period.createdAt).toLocaleString()}</p></div>
    </div>
  </article>;
}

function TaxStatus({ status }: { status: PlatformTaxStatus }) {
  const cls = status === "paid" ? "bg-emerald-50 text-emerald-800" : status === "partial" ? "bg-amber/15 text-amber-dim" : "bg-route/10 text-route";
  return <span className={`px-2.5 py-1 text-[10px] font-semibold uppercase ${cls}`}>{status}</span>;
}
