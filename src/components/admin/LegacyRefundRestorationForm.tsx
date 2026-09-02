import { FormEvent, useState } from "react";
import { restoreLegacyExcessRefund } from "../../services/financial-correction.service";

const busyGuidance = "Recording an append-only restoration. The original refund row remains unchanged.";

export function LegacyRefundRestorationForm({
  refundPaymentId,
  refundAmountEtb,
  maxRestorationEtb,
  onSaved,
}: {
  refundPaymentId: string;
  refundAmountEtb: number;
  maxRestorationEtb: number;
  onSaved: () => void | Promise<void>;
}) {
  const maxAmount = Math.max(0, Math.min(refundAmountEtb, maxRestorationEtb));
  const [amountEtb, setAmountEtb] = useState(String(maxAmount));
  const [reason, setReason] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedAmount = Number(amountEtb);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > maxAmount + 0.005) {
      setError(`Restoration amount must be between ETB 0.01 and ETB ${maxAmount.toLocaleString()}.`);
      return;
    }
    if (reason.trim().length < 5) {
      setError("Write a restoration reason of at least 5 characters.");
      return;
    }
    if (evidenceReference.trim().length < 3) {
      setError("Enter the external Telebirr, bank, case, or reconciliation evidence reference.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await restoreLegacyExcessRefund({
        refundPaymentId,
        amountEtb: parsedAmount,
        reason,
        externalEvidenceReference: evidenceReference,
      });
      setReason("");
      setEvidenceReference("");
      await onSaved();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Legacy refund restoration failed.");
    } finally {
      setSaving(false);
    }
  }

  if (maxAmount <= 0) return null;

  return <form onSubmit={submit} className="mt-3 border border-route/25 bg-white p-3">
    <p className="font-mono text-[9px] font-semibold uppercase tracking-[.16em] text-route">Legacy excess-refund restoration</p>
    <p className="mt-2 text-xs leading-5 text-steel">
      Use only after external evidence proves that this historical refund was invalid, duplicate, or test data. This adds an immutable correction; it never edits or deletes the original payment row and never creates Driver or Partner commission.
    </p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-semibold text-asphalt">Restoration amount
        <input type="number" min="0.01" max={maxAmount} step="0.01" value={amountEtb} onChange={(event) => setAmountEtb(event.target.value)} disabled={saving} className="mt-1 block w-full border border-asphalt/15 px-3 py-2 text-sm" required />
      </label>
      <label className="text-xs font-semibold text-asphalt">External evidence reference
        <input type="text" minLength={3} maxLength={200} value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} disabled={saving} placeholder="Telebirr / bank / case reference" className="mt-1 block w-full border border-asphalt/15 px-3 py-2 text-sm" required />
      </label>
    </div>
    <label className="mt-3 block text-xs font-semibold text-asphalt">Reason
      <textarea minLength={5} maxLength={500} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} disabled={saving} placeholder="Explain why the legacy refund must be neutralized." className="mt-1 block w-full border border-asphalt/15 p-3 text-sm font-normal" required />
    </label>
    {error && <p role="alert" className="mt-3 border border-route/30 bg-route/5 p-2 text-xs text-route">{error}</p>}
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <button type="submit" disabled={saving} aria-busy={saving} className="min-h-11 bg-route px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">{saving ? "Recording restoration…" : `Restore up to ETB ${maxAmount.toLocaleString()}`}</button>
      <span className="text-[11px] text-steel">{saving ? busyGuidance : "Original payment history stays immutable."}</span>
    </div>
  </form>;
}
