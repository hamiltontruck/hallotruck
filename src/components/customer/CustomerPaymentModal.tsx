import { useEffect, useState, type FormEvent } from "react";
import { submitCustomerPayment, type CustomerOrder } from "../../services/customer.service";
import { supabase } from "../../services/supabase.client";
import { useLanguage } from "../../i18n/LanguageProvider";
import { getCustomerCopy } from "../../i18n/customerCopy";

interface Props {
  order: CustomerOrder;
  maxAmount: number;
  onClose: () => void;
  onSubmitted: () => Promise<void> | void;
}

interface RejectedPayment {
  provider: string;
  provider_ref: string | null;
  rejection_reason: string | null;
  reviewed_at: string | null;
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

export function CustomerPaymentModal({ order, maxAmount, onClose, onSubmitted }: Props) {
  const { language } = useLanguage();
  const c = getCustomerCopy(language);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receiptName, setReceiptName] = useState("");
  const [rejectedPayment, setRejectedPayment] = useState<RejectedPayment | null>(null);
  const [provider, setProvider] = useState("telebirr");
  const [providerRef, setProviderRef] = useState("");

  const reviewText = language === "om"
    ? {
        title: "Kaffaltiin duraanii didameera",
        help: "Sababa armaan gadii sirreessi; receipt haaraa olkaa'ii irra deebi'ii ergi.",
        reason: "Sababa",
      }
    : language === "am"
      ? {
          title: "የቀድሞው ክፍያ ውድቅ ተደርጓል",
          help: "ከታች ያለውን ምክንያት ያስተካክሉ፣ አዲስ ደረሰኝ ይጫኑና እንደገና ይላኩ።",
          reason: "ምክንያት",
        }
      : {
          title: "Previous payment was rejected",
          help: "Correct the issue below, upload a replacement receipt and submit again.",
          reason: "Reason",
        };

  useEffect(() => {
    let active = true;

    async function loadRejection() {
      const { data, error: rejectionError } = await supabase
        .from("payments")
        .select("provider,provider_ref,rejection_reason,reviewed_at")
        .eq("order_id", order.id)
        .eq("event", "failed")
        .not("rejection_reason", "is", null)
        .order("reviewed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!active || rejectionError || !data) return;
      const rejected = data as RejectedPayment;
      setRejectedPayment(rejected);
      setProvider(rejected.provider || "telebirr");
      setProviderRef(rejected.provider_ref ?? "");
    }

    void loadRejection();
    return () => { active = false; };
  }, [order.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const receipt = form.get("receipt");

    if (!(receipt instanceof File) || !receipt.size) {
      setError(c.uploadRequired);
      setBusy(false);
      return;
    }

    try {
      await submitCustomerPayment({
        orderId: order.id,
        provider,
        providerRef,
        amountEtb: Number(form.get("amountEtb") ?? 0),
        receipt,
      });
      await onSubmitted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : c.paymentSubmitError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-asphalt/70 p-4">
      <form onSubmit={submit} className="max-h-[94vh] w-full max-w-lg overflow-y-auto bg-white p-6 sm:p-8">
        <div className="flex justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] tracking-[.2em] text-emerald-700">{c.paymentSecure}</p>
            <h2 className="mt-2 font-display text-2xl font-bold">{order.tracking_id}</h2>
            <p className="mt-2 text-xs text-steel">{c.invoiceAmount} ETB {Number(order.price_etb ?? 0).toLocaleString()} · {c.remaining} ETB {maxAmount.toLocaleString()}</p>
          </div>
          <button type="button" onClick={onClose} className="text-2xl">×</button>
        </div>

        <div className="mt-5 border border-emerald-200 bg-emerald-50 p-4 text-xs leading-relaxed text-emerald-900">
          {c.paymentInstruction}
        </div>

        {rejectedPayment && (
          <div className="mt-4 border border-route/35 bg-route/5 p-4 text-sm text-asphalt">
            <p className="font-semibold text-route">{reviewText.title}</p>
            <p className="mt-2 text-xs leading-relaxed text-steel">{reviewText.help}</p>
            <p className="mt-3 border-l-4 border-route pl-3 text-sm"><strong>{reviewText.reason}:</strong> {rejectedPayment.rejection_reason}</p>
            {rejectedPayment.reviewed_at && <p className="mt-2 text-[11px] text-steel">{new Date(rejectedPayment.reviewed_at).toLocaleString()}</p>}
          </div>
        )}

        {error && <p className="mt-4 border border-route/30 bg-route/5 p-3 text-sm text-route">{error}</p>}

        <div className="mt-6 grid gap-4">
          <label className="text-sm">{c.provider}
            <select name="provider" required value={provider} onChange={(event) => setProvider(event.target.value)} className="mt-2 block w-full border border-line bg-white px-4 py-3">
              {providers.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>

          <label className="text-sm">{c.transactionId}
            <input required name="providerRef" value={providerRef} onChange={(event) => setProviderRef(event.target.value)} autoCapitalize="characters" placeholder={c.transactionPlaceholder} className="mt-2 block w-full border border-line px-4 py-3" />
          </label>

          <label className="text-sm">{c.amount}
            <input required min="1" max={maxAmount} name="amountEtb" type="number" step="0.01" defaultValue={maxAmount || undefined} className="mt-2 block w-full border border-line px-4 py-3" />
          </label>

          <label className="text-sm">{c.receipt}
            <input
              required
              name="receipt"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
              onChange={(event) => setReceiptName(event.target.files?.[0]?.name ?? "")}
              className="mt-2 block w-full border border-line bg-white px-4 py-3 text-sm"
            />
            <span className="mt-2 block text-xs text-steel">{c.receiptTypes}</span>
            {receiptName && <span className="mt-2 block border-l-4 border-emerald-700 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">{c.attached}: {receiptName}</span>}
          </label>
        </div>

        <button disabled={busy || maxAmount <= 0} className="mt-6 w-full bg-asphalt py-4 font-semibold text-white disabled:opacity-50">{busy ? c.uploading : c.submitForVerification}</button>
      </form>
    </div>
  );
}
