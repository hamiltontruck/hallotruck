import { useState, type FormEvent } from "react";
import { getCustomerCopy } from "../../i18n/customerCopy";
import { useLanguage } from "../../i18n/LanguageProvider";
import { cancelCustomerOrder, type CustomerOrder } from "../../services/customer.service";

const lockedCopy = {
  en: "Cancellation is locked because a Driver has been assigned or the trip has started. Contact HALLOTRUCK support for an emergency review.",
  om: "Driver erga ramadamee ykn trip erga jalqabee booda Customer order cancel gochuu hin danda'u. Haala hatattamaa irratti HALLOTRUCK support qunnami.",
  am: "አሽከርካሪ ከተመደበ ወይም ጉዞው ከተጀመረ በኋላ ደንበኛው ትዕዛዙን መሰረዝ አይችልም። ለአስቸኳይ ግምገማ HALLOTRUCK supportን ያነጋግሩ።",
} as const;

export function CustomerCancelOrderModal({
  order,
  onClose,
  onCancelled,
}: {
  order: CustomerOrder;
  onClose: () => void;
  onCancelled: () => void | Promise<void>;
}) {
  const { language } = useLanguage();
  const c = getCustomerCopy(language);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cleanReason = reason.trim();
  const cancellationLocked = !["quoted", "placed"].includes(order.status);
  const reasonValid = cleanReason.length >= 5 && cleanReason.length <= 500;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cancellationLocked || !reasonValid || busy) return;

    setBusy(true);
    setError("");
    try {
      await cancelCustomerOrder(order.id, cleanReason);
      await onCancelled();
    } catch (err) {
      setError(err instanceof Error ? err.message : c.cancelOrderError);
      setBusy(false);
    }
  }

  return (
    <div className="customer-modal customer-cancel-modal" role="dialog" aria-modal="true" aria-labelledby="cancel-order-title">
      <form className="customer-cancel-sheet" onSubmit={submit}>
        <header className="customer-cancel-sheet__header">
          <div>
            <p className="customer-eyebrow">{order.tracking_id}</p>
            <h2 id="cancel-order-title">{c.cancelOrderTitle}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label={c.keepOrder}>×</button>
        </header>

        <div className="customer-cancel-sheet__body">
          <div className="customer-cancel-route">
            <span>{order.pickup_address}</span>
            <b aria-hidden="true">→</b>
            <span>{order.dropoff_address}</span>
          </div>

          {cancellationLocked ? (
            <p className="customer-cancel-warning" role="alert">{lockedCopy[language]}</p>
          ) : (
            <p className="customer-cancel-help">{c.cancelOrderHelp}</p>
          )}
          {error && <p className="customer-cancel-error" role="alert">{error}</p>}

          {!cancellationLocked && (
            <label className="customer-cancel-reason">
              <span>{c.cancelReason}</span>
              <textarea
                autoFocus
                rows={5}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={c.cancelReasonPlaceholder}
                required
              />
              <small className={cleanReason.length > 0 && !reasonValid ? "has-error" : ""}>
                {c.reasonLength} · {reason.length}/500
              </small>
            </label>
          )}
        </div>

        <footer className="customer-cancel-sheet__footer">
          <button type="button" onClick={onClose} disabled={busy} className="customer-cancel-keep">{c.keepOrder}</button>
          {!cancellationLocked && (
            <button type="submit" disabled={busy || !reasonValid} className="customer-cancel-confirm">
              {busy ? c.cancellingOrder : c.confirmCancelOrder}
            </button>
          )}
        </footer>
      </form>
    </div>
  );
}
