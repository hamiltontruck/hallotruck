import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createCustomerPaymentReceiptUrl,
  formatEtb,
  formatOrderStatus,
  loadCustomerMobileData,
  type CustomerMobileData,
  type CustomerMobilePayment,
} from "./customer-data.service";
import { useCustomerLanguage, type CustomerLanguage } from "./customer-language";
import { getCustomerFinalCopy } from "./customer-final-copy";

type State =
  | { kind: "loading" }
  | { kind: "ready"; data: CustomerMobileData }
  | { kind: "error"; message: string };

function eventLabel(event: string | null, language: CustomerLanguage) {
  const key = event || "pending";
  const labels: Record<CustomerLanguage, Record<string, string>> = {
    en: { initiated: "Pending verification", held_escrow: "Held in escrow", released: "Released", refunded: "Refunded", pending: "Pending" },
    om: { initiated: "Mirkaneessa eegamaa", held_escrow: "Escrow keessatti qabame", released: "Gadhiifame", refunded: "Deebifame", pending: "Eegamaa" },
    am: { initiated: "ማረጋገጫ በመጠባበቅ ላይ", held_escrow: "በEscrow የተያዘ", released: "ተለቋል", refunded: "ተመላሽ ተደርጓል", pending: "በመጠባበቅ ላይ" },
  };
  return labels[language][key] || formatOrderStatus(key);
}

function Header({ title, count }: { title: string; count: number | null }) {
  return (
    <header className="customer-final-payments-header">
      <div><strong>HALLO</strong><small>{title}</small></div>
      <span>{count === null ? "…" : count}</span>
    </header>
  );
}

function StatusCard({ title, body, action, onAction }: { title: string; body: string; action?: string; onAction?: () => void }) {
  return (
    <section className="customer-final-state">
      <span className="customer-final-payment-state-icon" aria-hidden="true">▣</span>
      <strong>{title}</strong>
      <span>{body}</span>
      {action && onAction && <button type="button" onClick={onAction}>{action}</button>}
    </section>
  );
}

function PaymentCard({ payment, trackingId, userId, language }: { payment: CustomerMobilePayment; trackingId: string; userId: string; language: CustomerLanguage }) {
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const c = getCustomerFinalCopy(language);

  async function openReceipt() {
    if (!payment.receipt_path || receiptBusy) return;
    setReceiptBusy(true);
    setReceiptError(null);
    try {
      const url = await createCustomerPaymentReceiptUrl(userId, payment.receipt_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setReceiptError(error instanceof Error ? error.message : "Receipt could not be opened.");
    } finally {
      setReceiptBusy(false);
    }
  }

  return (
    <article className="customer-final-payment-record">
      <header><div><small>ORDER</small><strong>{trackingId}</strong></div><b>{eventLabel(payment.event, language)}</b></header>
      <dl>
        <div><dt>{language === "om" ? "Hanga" : language === "am" ? "መጠን" : "Amount"}</dt><dd>{formatEtb(payment.amount_etb)}</dd></div>
        <div><dt>{language === "om" ? "Karaa" : language === "am" ? "አቅራቢ" : "Provider"}</dt><dd>{payment.provider || "—"}</dd></div>
        <div><dt>{language === "om" ? "Ragaa" : language === "am" ? "ማጣቀሻ" : "Reference"}</dt><dd>{payment.provider_ref || "—"}</dd></div>
        <div><dt>{language === "om" ? "Galmaa'e" : language === "am" ? "የተመዘገበ" : "Recorded"}</dt><dd>{payment.created_at ? new Date(payment.created_at).toLocaleString() : "—"}</dd></div>
      </dl>
      {payment.receipt_path && <button type="button" className="customer-final-secondary" onClick={() => void openReceipt()} disabled={receiptBusy}>{receiptBusy ? (language === "om" ? "Nagahee qopheessaa jira…" : language === "am" ? "ደረሰኝ በማዘጋጀት ላይ…" : "Preparing receipt…") : (language === "om" ? "Nagahee bani" : language === "am" ? "ደረሰኝ ክፈት" : "Open receipt")}</button>}
      {receiptError && <p className="customer-final-error" role="alert">{receiptError}</p>}
      <span className="customer-final-payment-card-truth">{c.paymentTruth}</span>
    </article>
  );
}

export function CustomerPaymentsPage({ userId, onHome }: { userId: string; onHome: () => void }) {
  const { language } = useCustomerLanguage();
  const c = getCustomerFinalCopy(language);
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try { setState({ kind: "ready", data: await loadCustomerMobileData(userId) }); }
    catch (error) { setState({ kind: "error", message: error instanceof Error ? error.message : "Payment data could not be loaded." }); }
  }, [userId]);

  useEffect(() => {
    let active = true;
    void loadCustomerMobileData(userId)
      .then((data) => { if (active) setState({ kind: "ready", data }); })
      .catch((error: unknown) => { if (active) setState({ kind: "error", message: error instanceof Error ? error.message : "Payment data could not be loaded." }); });
    return () => { active = false; };
  }, [userId]);

  const count = state.kind === "ready" ? state.data.payments.length : null;
  const orderMap = useMemo(() => state.kind === "ready" ? new Map(state.data.orders.map((order) => [order.id, order.tracking_id || "Pending tracking ID"])) : new Map<string,string>(), [state]);

  if (state.kind === "loading") return <main className="customer-final-page"><Header title={c.payments} count={null}/><StatusCard title={c.loading} body={c.paymentTruth}/></main>;
  if (state.kind === "error") return <main className="customer-final-page"><Header title={c.payments} count={null}/><StatusCard title={c.payments} body={state.message} action={c.retry} onAction={() => void load()}/></main>;
  if (!state.data.orders.length) return <main className="customer-final-page"><Header title={c.payments} count={0}/><StatusCard title={c.noPaymentRecords} body={c.paymentTruth} action="Home" onAction={onHome}/></main>;

  const refunds = state.data.payments.filter((payment) => payment.event === "refunded").length;
  return (
    <main className="customer-final-page customer-final-payments-page">
      <Header title={c.payments} count={count}/>
      <section className="customer-final-payment-hero">
        <span aria-hidden="true">▣</span>
        <div><small>{c.paymentLedger}</small><strong>{state.data.payments.length.toLocaleString()} {language === "om" ? "galmee" : language === "am" ? "መዝገቦች" : "records"}</strong></div>
        <p>Events and amounts are shown exactly as recorded in the database ledger. {c.paymentTruth}</p>
      </section>
      <section className="customer-final-payment-menu">
        <div><span>▤</span><p><strong>{c.paymentHistory}</strong><small>{state.data.payments.length.toLocaleString()}</small></p></div>
        <div><span>▧</span><p><strong>{c.invoices}</strong><small>{state.data.orders.length.toLocaleString()}</small></p></div>
        <div><span>↶</span><p><strong>{c.refunds}</strong><small>{refunds.toLocaleString()}</small></p></div>
      </section>
      <div className="customer-final-payment-toolbar"><button type="button" onClick={() => void load()}>{c.refresh}</button></div>
      {state.data.payments.length ? <section className="customer-final-payment-list">{state.data.payments.map((payment) => <PaymentCard key={payment.id} payment={payment} userId={userId} language={language} trackingId={orderMap.get(payment.order_id) || "Customer order"}/>)}</section> : <StatusCard title={c.noPaymentRecords} body={c.paymentTruth} action={c.refresh} onAction={() => void load()}/>}
    </main>
  );
}
