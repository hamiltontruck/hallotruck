import { useState, type FormEvent } from "react";
import { submitCustomerPayment, type CustomerOrder } from "../../services/customer.service";

interface Props {
  order: CustomerOrder;
  onClose: () => void;
  onSubmitted: () => Promise<void> | void;
}

const providers = [
  ["telebirr", "Telebirr"],
  ["cbe", "Commercial Bank of Ethiopia (CBE)"],
  ["awash_bank", "Awash Bank"],
  ["bank_of_abyssinia", "Bank of Abyssinia"],
  ["dashen_bank", "Dashen Bank"],
  ["coop_bank_oromia", "Cooperative Bank of Oromia"],
  ["mpesa", "M-Pesa"],
] as const;

export function CustomerPaymentModal({ order, onClose, onSubmitted }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receiptName, setReceiptName] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const receipt = form.get("receipt");

    if (!(receipt instanceof File) || !receipt.size) {
      setError("Upload the bank / payment receipt as JPG, PNG, WebP or PDF.");
      setBusy(false);
      return;
    }

    try {
      await submitCustomerPayment({
        orderId: order.id,
        provider: String(form.get("provider") ?? ""),
        providerRef: String(form.get("providerRef") ?? ""),
        amountEtb: Number(form.get("amountEtb") ?? 0),
        receipt,
      });
      await onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-asphalt/70 p-4">
      <form onSubmit={submit} className="max-h-[94vh] w-full max-w-lg overflow-y-auto bg-white p-6 sm:p-8">
        <div className="flex justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] tracking-[.2em] text-emerald-700">SECURE PAYMENT SUBMISSION</p>
            <h2 className="mt-2 font-display text-2xl font-bold">{order.tracking_id}</h2>
            <p className="mt-2 text-xs text-steel">Invoice ETB {Number(order.price_etb ?? 0).toLocaleString()}</p>
          </div>
          <button type="button" onClick={onClose} className="text-2xl">×</button>
        </div>

        <div className="mt-5 border border-emerald-200 bg-emerald-50 p-4 text-xs leading-relaxed text-emerald-900">
          Submit the exact transaction ID and a receipt screenshot / PDF. Finance verifies the receipt before money is released.
        </div>

        {error && <p className="mt-4 border border-route/30 bg-route/5 p-3 text-sm text-route">{error}</p>}

        <div className="mt-6 grid gap-4">
          <label className="text-sm">Payment provider / bank
            <select name="provider" required className="mt-2 block w-full border border-line bg-white px-4 py-3">
              {providers.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>

          <label className="text-sm">Transaction ID / reference
            <input required name="providerRef" autoCapitalize="characters" placeholder="Enter exact bank / wallet reference" className="mt-2 block w-full border border-line px-4 py-3" />
          </label>

          <label className="text-sm">Amount ETB
            <input required min="1" max={Number(order.price_etb ?? undefined)} name="amountEtb" type="number" step="0.01" defaultValue={Number(order.price_etb ?? 0) || undefined} className="mt-2 block w-full border border-line px-4 py-3" />
          </label>

          <label className="text-sm">Payment receipt / screenshot
            <input
              required
              name="receipt"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
              onChange={(event) => setReceiptName(event.target.files?.[0]?.name ?? "")}
              className="mt-2 block w-full border border-line bg-white px-4 py-3 text-sm"
            />
            <span className="mt-2 block text-xs text-steel">JPG, PNG, WebP or PDF · maximum 10 MB.</span>
            {receiptName && <span className="mt-2 block border-l-4 border-emerald-700 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">Attached: {receiptName}</span>}
          </label>
        </div>

        <button disabled={busy} className="mt-6 w-full bg-asphalt py-4 font-semibold text-white disabled:opacity-50">{busy ? "Uploading & submitting…" : "Submit payment for verification"}</button>
      </form>
    </div>
  );
}
