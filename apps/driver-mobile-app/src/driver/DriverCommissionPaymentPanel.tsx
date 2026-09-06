import { useMemo, useRef, useState, type FormEvent } from "react";
import {
  driverCommissionPaymentStatusLabel,
  type DriverCommissionPayment,
} from "./driver-commission-payment.model";
import { submitDriverCommissionPayment } from "./driver-commission-payment.service";
import { formatWalletEtb } from "./driver-wallet.model";

function dateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-ET", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Addis_Ababa",
  }).format(date);
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Commission payment galmeessuun hin danda'amne.";
}

function statusTone(status: DriverCommissionPayment["status"]): string {
  if (status === "approved") return "bg-emerald-50 text-emerald-700";
  if (status === "rejected") return "bg-red-50 text-red-700";
  return "bg-amber-50 text-amber-800";
}

export function DriverCommissionPaymentPanel({
  userId,
  balanceEtb,
  pendingEtb,
  payments,
  sourceError,
  onRetry,
  onSubmitted,
}: {
  userId: string;
  balanceEtb: number;
  pendingEtb: number;
  payments: DriverCommissionPayment[] | null;
  sourceError: string | null;
  onRetry: () => void;
  onSubmitted: () => Promise<void>;
}) {
  const [provider, setProvider] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [amount, setAmount] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const payableNowEtb = useMemo(
    () => Math.max(0, balanceEtb - pendingEtb),
    [balanceEtb, pendingEtb],
  );
  const canSubmit = payableNowEtb > 0.005 && !submitting;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await submitDriverCommissionPayment({
        expectedUserId: userId,
        provider,
        transactionId,
        amountEtb: Number(amount),
        payableNowEtb,
        receipt,
      });
      setTransactionId("");
      setAmount("");
      setReceipt(null);
      if (fileRef.current) fileRef.current.value = "";
      setSuccess("Commission payment galmaa'eera. Admin/CEO review booda wallet ofumaan haaromfama.");
      await onSubmitted();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return <section className="space-y-4 rounded-[24px] border border-halo-line bg-white p-4 shadow-halo-card" aria-labelledby="commission-payment-title">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-halo-gold-dark">Commission settlement</p>
        <h2 id="commission-payment-title" className="mt-1 text-lg font-black text-halo-navy">Komishinii kaffali</h2>
        <p className="mt-1 text-[11px] leading-5 text-halo-muted">Bank ykn Telebirr irraa kaffaltii ergi; receipt private ta'ee Admin/CEO qofa review godha.</p>
      </div>
      <span className="shrink-0 rounded-xl bg-halo-soft px-2.5 py-1.5 text-[9px] font-black text-halo-blue">SECURE</span>
    </div>

    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-2xl bg-halo-soft p-3">
        <p className="text-[9px] font-black uppercase tracking-[0.12em] text-halo-muted">Balance due</p>
        <p className="mt-1 text-sm font-black text-halo-navy">{formatWalletEtb(balanceEtb)}</p>
      </div>
      <div className="rounded-2xl bg-halo-soft p-3">
        <p className="text-[9px] font-black uppercase tracking-[0.12em] text-halo-muted">Amma erguu dandeessu</p>
        <p className="mt-1 text-sm font-black text-halo-navy">{formatWalletEtb(payableNowEtb)}</p>
      </div>
    </div>

    {pendingEtb > 0.005 && <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-bold leading-5 text-amber-900">{formatWalletEtb(pendingEtb)} review eeggachaa jira. Pending amount irra deebi'ii hin ergin.</p>}

    {payableNowEtb <= 0.005 ? (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
        <p className="text-sm font-black text-emerald-800">Kaffaltii haaraa barbaachisu hin jiru</p>
        <p className="mt-1 text-[11px] leading-5 text-emerald-700">Balance kee kaffalameera ykn payment review keessa jira.</p>
      </div>
    ) : (
      <form onSubmit={(event) => void submit(event)} className="space-y-3" aria-busy={submitting}>
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-halo-muted">Bank / provider</span>
          <input
            list="driver-commission-providers"
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
            disabled={submitting}
            autoComplete="organization"
            maxLength={80}
            placeholder="Fakkeenya: CBE, Telebirr"
            className="min-h-12 w-full rounded-2xl border border-halo-line bg-white px-4 text-sm font-bold text-halo-navy outline-none focus:border-halo-blue disabled:opacity-60"
          />
          <datalist id="driver-commission-providers">
            <option value="Commercial Bank of Ethiopia" />
            <option value="Telebirr" />
            <option value="Bank of Abyssinia" />
            <option value="Awash Bank" />
            <option value="Dashen Bank" />
          </datalist>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-halo-muted">Transaction ID</span>
          <input
            value={transactionId}
            onChange={(event) => setTransactionId(event.target.value)}
            disabled={submitting}
            maxLength={120}
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="Fakkeenya: FT2026..."
            className="min-h-12 w-full rounded-2xl border border-halo-line bg-white px-4 text-sm font-bold text-halo-navy outline-none focus:border-halo-blue disabled:opacity-60"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-halo-muted">
            <span>Amount ETB</span>
            <button type="button" onClick={() => setAmount(payableNowEtb.toFixed(2))} disabled={submitting} className="normal-case tracking-normal text-halo-blue">Full balance</button>
          </span>
          <input
            type="number"
            inputMode="decimal"
            min="0.01"
            max={payableNowEtb}
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            disabled={submitting}
            placeholder="0.00"
            className="min-h-12 w-full rounded-2xl border border-halo-line bg-white px-4 text-sm font-bold text-halo-navy outline-none focus:border-halo-blue disabled:opacity-60"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-halo-muted">Receipt JPG, PNG, WebP ykn PDF</span>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(event) => setReceipt(event.target.files?.[0] ?? null)}
            disabled={submitting}
            className="block min-h-12 w-full rounded-2xl border border-halo-line bg-white p-2 text-xs font-bold text-halo-navy file:mr-3 file:rounded-xl file:border-0 file:bg-halo-soft file:px-3 file:py-2 file:text-[10px] file:font-black file:text-halo-blue disabled:opacity-60"
          />
          <p className="mt-1.5 text-[10px] leading-4 text-halo-muted">Maximum 10 MB. Receipt bucket public miti.</p>
        </label>

        {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-3 text-[11px] font-bold leading-5 text-red-800">{error}</p>}
        {success && <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-[11px] font-bold leading-5 text-emerald-800">{success}</p>}

        <button type="submit" disabled={!canSubmit} className="min-h-13 w-full rounded-2xl bg-halo-blue px-4 text-sm font-black text-white shadow-halo-button disabled:cursor-not-allowed disabled:opacity-50">
          {submitting ? "Receipt ergaa jira…" : "Kaffaltii review'f ergi"}
        </button>
      </form>
    )}

    <div className="border-t border-halo-line pt-4">
      <div className="flex items-end justify-between gap-3">
        <div><p className="text-[9px] font-black uppercase tracking-[0.14em] text-halo-muted">Submission history</p><h3 className="mt-1 text-base font-black text-halo-navy">Kaffaltii dhihoo</h3></div>
        <button type="button" onClick={onRetry} className="min-h-9 rounded-xl border border-halo-line px-3 text-[9px] font-black text-halo-blue">Refresh</button>
      </div>
      {sourceError && <p role="alert" className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-bold leading-5 text-amber-900">{sourceError}</p>}
      {payments && payments.length === 0 && <p className="mt-3 rounded-2xl border border-dashed border-halo-line p-4 text-center text-[11px] font-bold text-halo-muted">Commission payment submission hin jiru.</p>}
      <div className="mt-3 space-y-2">
        {payments?.map((payment) => <article key={payment.id} className="rounded-2xl border border-halo-line bg-halo-canvas p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="truncate text-xs font-black text-halo-navy">{payment.provider}</p><p className="mt-1 truncate font-mono text-[9px] text-halo-muted">{payment.transactionId}</p></div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black ${statusTone(payment.status)}`}>{driverCommissionPaymentStatusLabel(payment.status)}</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px]"><strong className="text-halo-navy">{formatWalletEtb(payment.amountEtb)}</strong><span className="text-halo-muted">{dateLabel(payment.submittedAt)}</span></div>
          {payment.status === "rejected" && payment.rejectionReason && <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-[10px] font-bold leading-4 text-red-800">Sababa: {payment.rejectionReason}</p>}
        </article>)}
      </div>
    </div>
  </section>;
}
