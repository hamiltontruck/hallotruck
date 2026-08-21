import { useState, type FormEvent } from "react";
import { getCustomerCopy } from "../../i18n/customerCopy";
import { useLanguage } from "../../i18n/LanguageProvider";
import { cancelCustomerOrder, type CustomerOrder } from "../../services/customer.service";

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
  const reasonValid = cleanReason.length >= 5 && cleanReason.length <= 500;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reasonValid || busy) return;

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

          <p className="customer-cancel-help">{c.cancelOrderHelp}</p>
          {order.status === "in_transit" && <p className="customer-cancel-warning">{c.cancelInTransitWarning}</p>}
          {error && <p className="customer-cancel-error" role="alert">{error}</p>}

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
        </div>

        <footer className="customer-cancel-sheet__footer">
          <button type="button" onClick={onClose} disabled={busy} className="customer-cancel-keep">{c.keepOrder}</button>
          <button type="submit" disabled={busy || !reasonValid} className="customer-cancel-confirm">
            {busy ? c.cancellingOrder : c.confirmCancelOrder}
          </button>
        </footer>
      </form>
    </div>
  );
}
