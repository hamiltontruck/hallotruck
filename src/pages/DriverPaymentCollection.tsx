import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getDriverCollectionOrder,
  getDriverCollectionStatus,
  submitDriverCollectedPayment,
  type DriverCollectionOrder,
  type DriverCollectionStatus,
} from "../services/driver-payment-collection.service";
import { getDriverPaymentStatus, type DriverPaymentStatus } from "../services/driver-payment.service";
import { formatEtb } from "../utils/currency";
import { useLanguage, type HalloLanguage } from "../i18n/LanguageProvider";
import {
  getDriverPaymentSubmissionIssue,
  type DriverPaymentChoice,
} from "../domain/driver-payment-collection";
import { TripCompletionProgress } from "../components/trips/TripCompletionProgress";
import { DriverPaymentConfirmation } from "../components/driver/DriverPaymentConfirmation";
import type { TripCompletionSummary } from "../domain/trip-completion";

const providers = [
  ["telebirr", "Telebirr"],
  ["cbe", "Commercial Bank of Ethiopia (CBE)"],
  ["awash_bank", "Awash Bank"],
  ["bank_of_abyssinia", "Bank of Abyssinia"],
  ["dashen_bank", "Dashen Bank"],
  ["coop_bank_oromia", "Cooperative Bank of Oromia"],
  ["mpesa", "M-Pesa"],
  ["other_bank", "Other bank"],
] as const;

const copy: Record<HalloLanguage, {
  kicker: string;
  title: string;
  help: string;
  route: string;
  invoice: string;
  method: string;
  chooseMethod: string;
  cash: string;
  bank: string;
  provider: string;
  transaction: string;
  transactionHelp: string;
  note: string;
  notePlaceholder: string;
  submit: string;
  submitting: string;
  notPaid: string;
  unpaidTitle: string;
  unpaidText: string;
  unpaidReturn: string;
  unpaidResume: string;
  rejectedTitle: string;
  backJobs: string;
  loading: string;
  invalid: string;
  retry: string;
  noUpload: string;
}> = {
  en: {
    kicker: "FINISH TRIP",
    title: "Trip payment",
    help: "Finish the trip, review the customer payment, then confirm what you received. Only the database-assigned driver can use this page.",
    route: "Route",
    invoice: "Customer payment amount",
    method: "Payment method",
    chooseMethod: "Choose how the customer paid.",
    cash: "Cash",
    bank: "Bank / Telebirr",
    provider: "Provider",
    transaction: "Transaction reference",
    transactionHelp: "Enter the provider reference when the customer paid directly to you.",
    note: "Optional note",
    notePlaceholder: "Add a useful payment detail for Admin/CEO.",
    submit: "Payment confirmed",
    submitting: "Saving confirmation…",
    notPaid: "Payment not received / not confirmed",
    unpaidTitle: "Payment not received",
    unpaidText: "No payment report was created. Return when the customer payment can be confirmed.",
    unpaidReturn: "Return to Jobs",
    unpaidResume: "Review payment again",
    rejectedTitle: "Previous payment report was rejected",
    backJobs: "Back to jobs",
    loading: "Loading completed trip…",
    invalid: "This completed trip could not be loaded.",
    retry: "Try again",
    noUpload: "No receipt upload. No screenshot upload.",
  },
  om: {
    kicker: "IMALA XUMURI",
    title: "Kaffaltii imalaa",
    help: "Imala xumuri, kaffaltii customer ilaali, achiis waan si gahe mirkaneessi. Page kana driver database keessatti ramadame qofa fayyadama.",
    route: "Daandii",
    invoice: "Maallaqa customer kaffale",
    method: "Mala kaffaltii",
    chooseMethod: "Customer akkamitti akka kaffale filadhu.",
    cash: "Cash",
    bank: "Bank / Telebirr",
    provider: "Provider",
    transaction: "Lakkoofsa transaction",
    transactionHelp: "Customer kallattiin siif kaffale yoo ta'e reference provider galchi.",
    note: "Ibsa dabalataa",
    notePlaceholder: "Admin/CEO'f odeeffannoo kaffaltii barbaachisaa galchi.",
    submit: "Kaffaltiin mirkanaa'eera",
    submitting: "Mirkaneessa olkaa'aa jira…",
    notPaid: "Kaffaltiin hin geenye / hin mirkanoofne",
    unpaidTitle: "Kaffaltiin hin geenye",
    unpaidText: "Gabaasni kaffaltii hin uumamne. Yeroo kaffaltiin customer mirkanoofutti deebi'i.",
    unpaidReturn: "Gara hojii deebi'i",
    unpaidResume: "Kaffaltii irra deebi'ii ilaali",
    rejectedTitle: "Gabaasni kaffaltii duraa reject ta'eera",
    backJobs: "Gara hojii deebi'i",
    loading: "Imala xumurame fe'aa jira…",
    invalid: "Imala xumurame kana fe'uun hin danda'amne.",
    retry: "Irra deebi'i",
    noUpload: "Receipt hin olkaa'in. Screenshot hin olkaa'in.",
  },
  am: {
    kicker: "ጉዞን ጨርስ",
    title: "የጉዞ ክፍያ",
    help: "ጉዞውን ያጠናቅቁ፣ የደንበኛውን ክፍያ ይመልከቱ እና የተቀበሉትን ያረጋግጡ። ይህን ገጽ በዳታቤዝ የተመደበው አሽከርካሪ ብቻ ይጠቀማል።",
    route: "መንገድ",
    invoice: "የደንበኛ ክፍያ መጠን",
    method: "የክፍያ ዘዴ",
    chooseMethod: "ደንበኛው እንዴት እንደከፈለ ይምረጡ።",
    cash: "ጥሬ ገንዘብ",
    bank: "Bank / Telebirr",
    provider: "አቅራቢ",
    transaction: "የግብይት ማጣቀሻ",
    transactionHelp: "ደንበኛው በቀጥታ ከከፈለ የአቅራቢውን ማጣቀሻ ያስገቡ።",
    note: "አማራጭ ማስታወሻ",
    notePlaceholder: "ለAdmin/CEO ጠቃሚ የክፍያ ዝርዝር ያክሉ።",
    submit: "ክፍያው ተረጋግጧል",
    submitting: "ማረጋገጫውን በማስቀመጥ ላይ…",
    notPaid: "ክፍያው አልደረሰም / አልተረጋገጠም",
    unpaidTitle: "ክፍያው አልደረሰም",
    unpaidText: "የክፍያ ሪፖርት አልተፈጠረም። የደንበኛው ክፍያ ሲረጋገጥ ይመለሱ።",
    unpaidReturn: "ወደ ስራዎች ተመለስ",
    unpaidResume: "ክፍያውን እንደገና መርምር",
    rejectedTitle: "የቀድሞው የክፍያ ሪፖርት ውድቅ ተደርጓል",
    backJobs: "ወደ ስራዎች ተመለስ",
    loading: "የተጠናቀቀውን ጉዞ በመጫን ላይ…",
    invalid: "ይህን የተጠናቀቀ ጉዞ መጫን አልተቻለም።",
    retry: "እንደገና ሞክር",
    noUpload: "ደረሰኝ አይጫኑ። screenshot አይጫኑ።",
  },
};

export interface DriverPaymentCollectionFixture {
  order: DriverCollectionOrder;
  status?: DriverCollectionStatus | null;
  payments?: DriverPaymentStatus[];
  completionSummary?: TripCompletionSummary;
}

export function DriverPaymentCollection({ fixture }: { fixture?: DriverPaymentCollectionFixture } = {}) {
  const { orderId = "" } = useParams();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const c = copy[language];
  const [order, setOrder] = useState<DriverCollectionOrder | null>(fixture?.order ?? null);
  const [status, setStatus] = useState<DriverCollectionStatus | null>(fixture?.status ?? null);
  const [payments, setPayments] = useState<DriverPaymentStatus[]>(fixture?.payments ?? []);
  const [method, setMethod] = useState<DriverPaymentChoice>(fixture?.status?.collection_method ?? null);
  const [provider, setProvider] = useState("telebirr");
  const [providerRef, setProviderRef] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(!fixture);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showUnpaidNotice, setShowUnpaidNotice] = useState(false);

  const load = useCallback(async () => {
    if (fixture) {
      setOrder(fixture.order);
      setStatus(fixture.status ?? null);
      setPayments(fixture.payments ?? []);
      setMethod(fixture.status?.collection_method ?? null);
      setLoading(false);
      return;
    }
    if (!orderId) return;
    setLoading(true);
    try {
      const [nextOrder, nextStatus, nextPayments] = await Promise.all([
        getDriverCollectionOrder(orderId),
        getDriverCollectionStatus(orderId),
        getDriverPaymentStatus(orderId),
      ]);
      setOrder(nextOrder);
      setStatus(nextStatus);
      setPayments(nextPayments);
      if (nextStatus?.collection_method) setMethod(nextStatus.collection_method);
      if (nextStatus?.provider && nextStatus.provider !== "cash_to_driver") setProvider(nextStatus.provider);
      if (nextStatus?.provider_ref) setProviderRef(nextStatus.provider_ref);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : c.invalid);
    } finally {
      setLoading(false);
    }
  }, [c.invalid, fixture, orderId]);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedMethod = method;
    const submissionIssue = getDriverPaymentSubmissionIssue(selectedMethod, providerRef);
    if (!order || !selectedMethod || submissionIssue) {
      setError(submissionIssue === "method_required" ? c.chooseMethod : c.transactionHelp);
      return;
    }

    setSaving(true);
    setError("");
    try {
      await submitDriverCollectedPayment({
        orderId: order.id,
        method: selectedMethod,
        provider,
        providerRef,
        amountEtb: Number(order.price_etb ?? 0),
        note,
      });
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : c.invalid);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="mx-auto max-w-2xl px-5 py-16 text-center font-mono text-sm text-steel">{c.loading}</main>;

  if (!order) {
    return <main className="mx-auto max-w-2xl px-5 py-16 text-center"><p className="text-route">{error || c.invalid}</p><button type="button" onClick={() => void load()} className="mt-5 bg-asphalt px-5 py-3 text-sm font-semibold text-white">{c.retry}</button></main>;
  }

  const amount = Number(order.price_etb ?? 0);
  const hasExistingPayment = payments.length > 0;
  const rejected = status?.payment_event === "failed";
  const canReportDirectCollection = !hasExistingPayment && order.payment_terms === "pay_driver_on_delivery";
  const submissionIssue = getDriverPaymentSubmissionIssue(method, providerRef);
  const heldAmount = payments.filter((payment) => payment.payment_event === "held_escrow").reduce((sum, payment) => sum + Number(payment.amount_etb || 0), 0);
  const releasedAmount = payments.filter((payment) => payment.payment_event === "released").reduce((sum, payment) => sum + Number(payment.amount_etb || 0), 0);
  const initiatedAmount = payments.filter((payment) => payment.payment_event === "initiated").reduce((sum, payment) => sum + Number(payment.amount_etb || 0), 0);
  const fixtureSummary: TripCompletionSummary | undefined = fixture?.completionSummary ?? (fixture ? {
    order_id: order.id,
    tracking_id: order.tracking_id,
    order_status: order.status,
    payment_terms: order.payment_terms,
    invoice_total_etb: amount,
    initiated_etb: initiatedAmount,
    held_escrow_etb: heldAmount,
    released_etb: releasedAmount,
    refunded_etb: 0,
    verified_net_etb: releasedAmount,
    balance_due_etb: Math.max(0, amount - releasedAmount),
    commission_charged_etb: releasedAmount > 0 ? Math.round(releasedAmount * 0.02 * 100) / 100 : 0,
    payment_state: releasedAmount >= amount && amount > 0
      ? "released"
      : heldAmount > 0
        ? "awaiting_driver_confirmation"
        : initiatedAmount > 0
          ? "awaiting_admin_review"
          : "payment_required",
    delivery_proof_recorded: true,
    rating_score: null,
  } : undefined);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-5 sm:py-16">
      <header className="bg-asphalt p-6 text-white sm:p-8">
        <p className="font-mono text-[10px] tracking-[.2em] text-amber">{c.kicker}</p>
        <h1 className="mt-3 font-display text-3xl font-bold">{c.title}</h1>
        <p className="mt-3 text-sm leading-6 text-white/60">{c.help}</p>
      </header>

      <section className="border-x border-b border-asphalt/10 bg-white p-5 sm:p-6">
        <p className="break-all font-mono text-xs font-semibold">{order.tracking_id}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><p className="text-[10px] uppercase tracking-wide text-steel">{c.route}</p><p className="mt-1 text-sm">{order.pickup_address} → {order.dropoff_address}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-steel">{c.invoice}</p><p className="mt-1 font-display text-2xl font-bold">{formatEtb(amount)}</p></div>
        </div>
      </section>

      <TripCompletionProgress orderId={order.id} audience="driver" initialSummary={fixtureSummary} />

      {error && <p className="mt-5 border border-route/30 bg-route/5 p-4 text-sm text-route">{error}</p>}

      {hasExistingPayment && (
        <DriverPaymentConfirmation
          orderId={order.id}
          fixture={payments}
          onChanged={() => void load()}
        />
      )}

      {showUnpaidNotice ? (
        <section role="status" aria-live="polite" className="mt-5 border border-amber/40 bg-white p-5 sm:p-6">
          <p className="font-display text-2xl font-bold text-asphalt">{c.unpaidTitle}</p>
          <p className="mt-3 text-sm leading-6 text-steel">{c.unpaidText}</p>
          <div className="mt-6 grid gap-3">
            <button type="button" onClick={() => navigate("/driver/jobs")} className="w-full bg-asphalt px-4 py-4 text-sm font-semibold text-white">{c.unpaidReturn}</button>
            <button type="button" onClick={() => setShowUnpaidNotice(false)} className="w-full border border-asphalt px-4 py-3 text-sm font-semibold">{c.unpaidResume}</button>
          </div>
        </section>
      ) : canReportDirectCollection ? (
        <form onSubmit={submit} className="mt-5 border border-asphalt/10 bg-white p-5 sm:p-6">
          {rejected && <div className="mb-5 border-l-4 border-route bg-route/5 p-4"><p className="font-semibold text-route">{c.rejectedTitle}</p><p className="mt-2 text-sm">{status?.rejection_reason}</p></div>}

          <p className="border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">{c.noUpload}</p>

          <fieldset className="mt-6">
            <legend className="text-sm font-semibold">{c.method}</legend>
            <p className="mt-2 text-xs leading-5 text-steel">{c.chooseMethod}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className={`border p-4 text-sm ${method === "cash" ? "border-asphalt bg-asphalt text-white" : "border-asphalt/15"}`}><input type="radio" name="method" value="cash" checked={method === "cash"} onChange={() => setMethod("cash")} className="mr-2" />{c.cash}</label>
              <label className={`border p-4 text-sm ${method === "bank" ? "border-asphalt bg-asphalt text-white" : "border-asphalt/15"}`}><input type="radio" name="method" value="bank" checked={method === "bank"} onChange={() => setMethod("bank")} className="mr-2" />{c.bank}</label>
            </div>
          </fieldset>

          {method === "bank" ? (
            <>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-sm">{c.provider}<select value={provider} onChange={(event) => setProvider(event.target.value)} className="mt-2 block w-full border border-asphalt/20 bg-white p-3">{providers.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="text-sm">{c.transaction}<input required value={providerRef} onChange={(event) => setProviderRef(event.target.value)} className="mt-2 block w-full border border-asphalt/20 p-3" /><span className="mt-2 block text-xs text-steel">{c.transactionHelp}</span></label>
              </div>
              <label className="mt-5 block text-sm">{c.note}<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={3} placeholder={c.notePlaceholder} className="mt-2 block w-full border border-asphalt/20 p-3" /></label>
            </>
          ) : method === "cash" ? (
            <div className="mt-5 border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">✓ {c.cash} — {formatEtb(amount)}</div>
          ) : null}

          <button disabled={saving || Boolean(submissionIssue)} className="mt-6 w-full bg-emerald-700 py-4 font-semibold text-white disabled:opacity-40">{saving ? c.submitting : c.submit}</button>
          <button type="button" onClick={() => { setMethod(null); setProviderRef(""); setError(""); setShowUnpaidNotice(true); }} className="mt-3 w-full border border-route px-3 py-3 text-sm font-semibold text-route">{c.notPaid}</button>
        </form>
      ) : !hasExistingPayment ? (
        <section className="mt-5 border border-asphalt/10 bg-white p-5 text-center">
          <p className="text-sm text-steel">{c.invalid}</p>
          <button type="button" onClick={() => navigate("/driver/jobs")} className="mt-4 border border-asphalt px-5 py-3 text-sm font-semibold">{c.backJobs}</button>
        </section>
      ) : null}
    </main>
  );
}
