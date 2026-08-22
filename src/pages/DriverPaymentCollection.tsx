import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getDriverCollectionOrder,
  getDriverCollectionStatus,
  submitDriverCollectedPayment,
  type DriverCollectionMethod,
  type DriverCollectionOrder,
  type DriverCollectionStatus,
} from "../services/driver-payment-collection.service";
import { formatEtb } from "../utils/currency";
import { useLanguage } from "../i18n/LanguageProvider";

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

const copy = {
  en: {
    kicker: "POST-DELIVERY PAYMENT",
    title: "Report money received from the customer",
    help: "Record whether the customer paid cash or transferred money directly to you. Admin must verify the evidence before any amount appears in Earnings.",
    route: "Route",
    invoice: "Full invoice",
    method: "How did the customer pay?",
    cash: "Cash paid to driver",
    bank: "Bank / mobile transfer paid to driver",
    provider: "Bank or provider",
    transaction: "Transaction ID",
    evidence: "Payment evidence",
    evidenceHelp: "Upload a cash receipt, signed note, bank screenshot or PDF. Maximum 10 MB.",
    note: "Collection note",
    notePlaceholder: "Who paid, where it was received, or any useful detail.",
    warningTitle: "Money remains zero until Admin verifies",
    warning: "Pending trips can show in your history, but Gross, commission, Driver Net and payout remain ETB 0 until verification.",
    submit: "Submit for Admin verification",
    submitting: "Submitting evidence…",
    notPaid: "Customer has not paid yet",
    pendingTitle: "Waiting for Admin verification",
    pendingText: "Your report was submitted. Earnings, commission and payout remain zero until Admin verifies it.",
    rejectedTitle: "Payment evidence rejected",
    releasedTitle: "Admin verified the payment",
    releasedText: "The verified amount is now included in Earnings and the HALLO Smart commission ledger.",
    backJobs: "Back to jobs",
    earnings: "Open Earnings",
    loading: "Loading delivered trip…",
    invalid: "This delivered trip could not be loaded.",
    retry: "Try again",
  },
  om: {
    kicker: "KAFFALTII GEEJJIBA BOODAA",
    title: "Maallaqa customer irraa fudhatte gabaasi",
    help: "Customer cash siif kenne moo bank/mobile irratti siif erge galmeessi. Hanga Admin ragaa mirkaneessutti maallaqni Galii keessatti hin mul'atu.",
    route: "Daandii",
    invoice: "Invoice guutuu",
    method: "Customer akkamitti kaffale?",
    cash: "Cash driver irratti kaffale",
    bank: "Bank / mobile transfer driver irratti kaffale",
    provider: "Bankii ykn provider",
    transaction: "Transaction ID",
    evidence: "Ragaa kaffaltii",
    evidenceHelp: "Cash receipt, barruu mallatteeffame, screenshot bankii ykn PDF olkaa'i. Hanga 10 MB.",
    note: "Ibsa gabaabaa",
    notePlaceholder: "Eenyu kaffale, eessatti fudhatte, ykn odeeffannoo barbaachisaa.",
    warningTitle: "Hanga Admin mirkaneessutti maallaqni zeeroo dha",
    warning: "Imalli pending seenaa keessatti mul'achuu danda'a; garuu Gross, commission, Driver Net fi payout ETB 0 ta'anii turu.",
    submit: "Admin akka mirkaneessuuf ergi",
    submitting: "Ragaa ergaa jira…",
    notPaid: "Customer amma hin kaffalle",
    pendingTitle: "Mirkaneessa Admin eeggachaa jira",
    pendingText: "Gabaasni kee ergameera. Hanga Admin mirkaneessutti galii, commission fi payout zeeroo ta'anii turu.",
    rejectedTitle: "Ragaan kaffaltii reject ta'e",
    releasedTitle: "Admin kaffaltii mirkaneesseera",
    releasedText: "Maallaqni mirkanaa'e amma Galii fi galmee commission HALLO Smart keessatti dabalameera.",
    backJobs: "Gara hojii deebi'i",
    earnings: "Galii bani",
    loading: "Imala geeffame fe'aa jira…",
    invalid: "Imala geeffame kana fe'uun hin danda'amne.",
    retry: "Irra deebi'i",
  },
  am: {
    kicker: "ከማድረስ በኋላ ክፍያ",
    title: "ከደንበኛው የተቀበሉትን ገንዘብ ሪፖርት ያድርጉ",
    help: "ደንበኛው ጥሬ ገንዘብ ከፍሎዎት ወይም በባንክ/ሞባይል በቀጥታ ልኮሎት ከሆነ ይመዝግቡ። Admin ማስረጃውን እስኪያረጋግጥ ድረስ በገቢ ውስጥ አይታይም።",
    route: "መንገድ",
    invoice: "ሙሉ ደረሰኝ",
    method: "ደንበኛው እንዴት ከፈለ?",
    cash: "ለአሽከርካሪው ጥሬ ገንዘብ",
    bank: "ለአሽከርካሪው የባንክ/ሞባይል ዝውውር",
    provider: "ባንክ ወይም አቅራቢ",
    transaction: "የግብይት መለያ",
    evidence: "የክፍያ ማስረጃ",
    evidenceHelp: "የጥሬ ገንዘብ ደረሰኝ፣ የተፈረመ ማስታወሻ፣ የባንክ ስክሪንሾት ወይም PDF ይጫኑ። እስከ 10 MB።",
    note: "የመሰብሰቢያ ማስታወሻ",
    notePlaceholder: "ማን ከፈለ፣ የት ተቀበሉ ወይም ሌላ ጠቃሚ መረጃ።",
    warningTitle: "Admin እስኪያረጋግጥ ድረስ ገንዘቡ ዜሮ ነው",
    warning: "ጉዞው pending ሆኖ ሊታይ ይችላል፣ ነገር ግን Gross፣ commission፣ Driver Net እና payout ETB 0 ይቆያሉ።",
    submit: "ለAdmin ማረጋገጫ ላክ",
    submitting: "ማስረጃ በመላክ ላይ…",
    notPaid: "ደንበኛው ገና አልከፈለም",
    pendingTitle: "የAdmin ማረጋገጫ በመጠበቅ ላይ",
    pendingText: "ሪፖርቱ ተልኳል። Admin እስኪያረጋግጥ ድረስ ገቢ፣ commission እና payout ዜሮ ይቆያሉ።",
    rejectedTitle: "የክፍያ ማስረጃው ውድቅ ተደርጓል",
    releasedTitle: "Admin ክፍያውን አረጋግጧል",
    releasedText: "የተረጋገጠው መጠን አሁን በገቢ እና በHALLO Smart commission መዝገብ ውስጥ ተካቷል።",
    backJobs: "ወደ ስራዎች ተመለስ",
    earnings: "ገቢ ክፈት",
    loading: "የደረሰውን ጉዞ በመጫን ላይ…",
    invalid: "ይህን የደረሰ ጉዞ መጫን አልተቻለም።",
    retry: "እንደገና ሞክር",
  },
} as const;

export function DriverPaymentCollection() {
  const { orderId = "" } = useParams();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const c = copy[language];
  const [order, setOrder] = useState<DriverCollectionOrder | null>(null);
  const [status, setStatus] = useState<DriverCollectionStatus | null>(null);
  const [method, setMethod] = useState<DriverCollectionMethod>("cash");
  const [provider, setProvider] = useState("telebirr");
  const [providerRef, setProviderRef] = useState("");
  const [note, setNote] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const [nextOrder, nextStatus] = await Promise.all([
        getDriverCollectionOrder(orderId),
        getDriverCollectionStatus(orderId),
      ]);
      setOrder(nextOrder);
      setStatus(nextStatus);
      if (nextStatus?.collection_method) setMethod(nextStatus.collection_method);
      if (nextStatus?.provider && nextStatus.provider !== "cash_to_driver") setProvider(nextStatus.provider);
      if (nextStatus?.provider_ref) setProviderRef(nextStatus.provider_ref);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : c.invalid);
    } finally {
      setLoading(false);
    }
  }, [c.invalid, orderId]);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!order || !receipt) {
      setError(c.evidenceHelp);
      return;
    }

    setSaving(true);
    setError("");
    try {
      await submitDriverCollectedPayment({
        orderId: order.id,
        method,
        provider,
        providerRef,
        amountEtb: Number(order.price_etb ?? 0),
        receipt,
        note,
      });
      setReceipt(null);
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
  const pending = status?.payment_event === "initiated" || status?.payment_event === "held_escrow";
  const released = status?.payment_event === "released";
  const rejected = status?.payment_event === "failed";

  return (
    <main className="mx-auto max-w-2xl px-5 py-10 sm:py-16">
      <header className="bg-asphalt p-6 text-white sm:p-8">
        <p className="font-mono text-[10px] tracking-[.2em] text-amber">{c.kicker}</p>
        <h1 className="mt-3 font-display text-3xl font-bold">{c.title}</h1>
        <p className="mt-3 text-sm leading-6 text-white/60">{c.help}</p>
      </header>

      <section className="border-x border-b border-asphalt/10 bg-white p-5 sm:p-6">
        <p className="font-mono text-xs font-semibold">{order.tracking_id}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><p className="text-[10px] uppercase tracking-wide text-steel">{c.route}</p><p className="mt-1 text-sm">{order.pickup_address} → {order.dropoff_address}</p></div>
          <div><p className="text-[10px] uppercase tracking-wide text-steel">{c.invoice}</p><p className="mt-1 font-display text-2xl font-bold">{formatEtb(amount)}</p></div>
        </div>
      </section>

      {error && <p className="mt-5 border border-route/30 bg-route/5 p-4 text-sm text-route">{error}</p>}

      {released ? (
        <section className="mt-5 border border-emerald-700/30 bg-emerald-50 p-6">
          <p className="font-display text-2xl font-bold text-emerald-900">✓ {c.releasedTitle}</p>
          <p className="mt-3 text-sm leading-6 text-emerald-900/75">{c.releasedText}</p>
          <div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={() => navigate("/driver/earnings")} className="bg-emerald-700 px-5 py-3 text-sm font-semibold text-white">{c.earnings}</button><button type="button" onClick={() => navigate("/driver/jobs")} className="border border-asphalt px-5 py-3 text-sm font-semibold">{c.backJobs}</button></div>
        </section>
      ) : pending ? (
        <section className="mt-5 border border-amber/35 bg-amber/10 p-6">
          <p className="font-display text-2xl font-bold text-asphalt">{c.pendingTitle}</p>
          <p className="mt-3 text-sm leading-6 text-steel">{c.pendingText}</p>
          <div className="mt-5 grid grid-cols-3 gap-3"><Zero label="Gross" /><Zero label="Commission" /><Zero label="Driver Net" /></div>
          <button type="button" onClick={() => navigate("/driver/jobs")} className="mt-5 border border-asphalt px-5 py-3 text-sm font-semibold">{c.backJobs}</button>
        </section>
      ) : (
        <form onSubmit={submit} className="mt-5 border border-asphalt/10 bg-white p-5 sm:p-6">
          {rejected && <div className="mb-5 border-l-4 border-route bg-route/5 p-4"><p className="font-semibold text-route">{c.rejectedTitle}</p><p className="mt-2 text-sm">{status?.rejection_reason}</p></div>}

          <div className="border border-amber/35 bg-amber/10 p-4">
            <p className="font-semibold text-asphalt">{c.warningTitle}</p>
            <p className="mt-2 text-xs leading-5 text-steel">{c.warning}</p>
          </div>

          <fieldset className="mt-6">
            <legend className="text-sm font-semibold">{c.method}</legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className={`border p-4 text-sm ${method === "cash" ? "border-asphalt bg-asphalt text-white" : "border-asphalt/15"}`}><input type="radio" name="method" value="cash" checked={method === "cash"} onChange={() => setMethod("cash")} className="mr-2" />{c.cash}</label>
              <label className={`border p-4 text-sm ${method === "bank" ? "border-asphalt bg-asphalt text-white" : "border-asphalt/15"}`}><input type="radio" name="method" value="bank" checked={method === "bank"} onChange={() => setMethod("bank")} className="mr-2" />{c.bank}</label>
            </div>
          </fieldset>

          {method === "bank" && <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm">{c.provider}<select value={provider} onChange={(event) => setProvider(event.target.value)} className="mt-2 block w-full border border-asphalt/20 bg-white p-3">{providers.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-sm">{c.transaction}<input required value={providerRef} onChange={(event) => setProviderRef(event.target.value)} className="mt-2 block w-full border border-asphalt/20 p-3" /></label></div>}

          <label className="mt-5 block text-sm">{c.evidence}<input required type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf" onChange={(event) => setReceipt(event.target.files?.[0] ?? null)} className="mt-2 block w-full border border-asphalt/20 bg-white p-3" /><span className="mt-2 block text-xs text-steel">{c.evidenceHelp}</span></label>
          <label className="mt-5 block text-sm">{c.note}<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={3} placeholder={c.notePlaceholder} className="mt-2 block w-full border border-asphalt/20 p-3" /></label>

          <button disabled={saving || !receipt} className="mt-6 w-full bg-asphalt py-4 font-semibold text-white disabled:opacity-40">{saving ? c.submitting : c.submit}</button>
          <button type="button" onClick={() => navigate("/driver/jobs")} className="mt-3 w-full border border-asphalt py-3 text-sm font-semibold">{c.notPaid}</button>
        </form>
      )}
    </main>
  );
}

function Zero({ label }: { label: string }) {
  return <div className="bg-white p-3 text-center"><p className="font-mono text-[9px] uppercase text-steel">{label}</p><p className="mt-2 font-display text-lg font-bold">ETB 0</p></div>;
}
