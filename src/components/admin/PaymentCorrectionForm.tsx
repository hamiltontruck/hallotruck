import { FormEvent, useState } from "react";
import { reversePayment, type PaymentCorrectionType } from "../../services/financial-correction.service";

const correctionBusyReason = "Recording this immutable correction. Wait for the ledger update to finish before closing or changing the form.";

export function PaymentCorrectionForm({
  paymentId,
  paymentAmountEtb,
  onCancel,
  onSubmitted,
  submitCorrection = reversePayment,
}: {
  paymentId: string;
  paymentAmountEtb: number;
  onCancel: () => void;
  onSubmitted: () => Promise<void>;
  submitCorrection?: typeof reversePayment;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const busyGuidanceId = `payment-correction-busy-${paymentId}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    setSaving(true); setError("");
    try {
      await submitCorrection({
        paymentId,
        amountEtb: Number(form.get("correctionAmount")),
        reason: String(form.get("correctionReason") || "").trim(),
        correctionType: String(form.get("correctionType")) as PaymentCorrectionType,
      });
      await onSubmitted();
      onCancel();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Financial correction failed.");
    } finally {
      setSaving(false);
    }
  }

  return <form onSubmit={submit} aria-busy={saving} aria-describedby={saving ? busyGuidanceId : undefined} className="mt-4 grid min-w-0 gap-3 border border-route/25 bg-route/5 p-4 sm:grid-cols-2">
    <label className="min-w-0 text-xs font-semibold">Correction type<select name="correctionType" defaultValue="full_refund" disabled={saving} aria-describedby={saving ? busyGuidanceId : undefined} className="mt-2 block min-h-11 w-full min-w-0 border border-asphalt/20 bg-white px-3 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-45">
      <option value="full_refund">Full refund</option><option value="partial_refund">Partial refund</option><option value="duplicate">Duplicate payment</option><option value="invalidated">Invalid payment</option><option value="cancelled_order">Cancelled order</option>
    </select></label>
    <label className="min-w-0 text-xs font-semibold">Correction amount ETB<input name="correctionAmount" type="number" required defaultValue={paymentAmountEtb} min="0.01" step="0.01" disabled={saving} aria-describedby={saving ? busyGuidanceId : undefined} className="mt-2 block min-h-11 w-full min-w-0 border border-asphalt/20 px-3 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-45"/></label>
    <label className="min-w-0 text-xs font-semibold sm:col-span-2">Reason<textarea name="correctionReason" required minLength={5} maxLength={500} rows={3} disabled={saving} aria-describedby={saving ? busyGuidanceId : undefined} className="mt-2 block w-full min-w-0 border border-asphalt/20 px-3 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-45" placeholder="Required audit reason (5–500 characters)"/></label>
    <p className="break-words text-[11px] leading-5 text-steel sm:col-span-2">Original ledger rows are preserved. A full correction must equal the remaining unreversed amount; partial refunds must be smaller.</p>
    {saving&&<p id={busyGuidanceId} role="status" aria-live="polite" className="break-words border border-amber/40 bg-amber/10 p-3 text-xs font-semibold leading-5 text-asphalt sm:col-span-2">{correctionBusyReason}</p>}
    {error&&<p className="break-words text-xs font-semibold text-route sm:col-span-2" role="alert">{error}</p>}
    <div className="grid grid-cols-1 gap-2 sm:col-span-2 sm:grid-cols-2">
      <button type="button" disabled={saving} aria-describedby={saving ? busyGuidanceId : undefined} title={saving ? correctionBusyReason : "Close this correction form without recording a ledger change"} onClick={onCancel} className="min-h-11 border border-asphalt/20 bg-white px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-35">Cancel</button>
      <button type="submit" disabled={saving} aria-describedby={saving ? busyGuidanceId : undefined} title={saving ? correctionBusyReason : "Confirm this immutable financial correction"} className="min-h-11 bg-route px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-35">{saving?"Recording correction…":"Confirm immutable correction"}</button>
    </div>
  </form>;
}
