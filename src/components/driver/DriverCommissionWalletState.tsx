import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "../../i18n/LanguageProvider";
import { formatEtb } from "../../utils/currency";
import type {
  DriverCommissionPayment,
  DriverCommissionSummary,
} from "../../services/driver-commission.service";

const providers = [
  "Telebirr",
  "CBE",
  "Awash Bank",
  "Bank of Abyssinia",
  "Dashen Bank",
  "Cooperative Bank of Oromia",
  "M-Pesa",
];

type CommissionPaymentInput = {
  provider: string;
  transactionId: string;
  amountEtb: number;
  receipt: File;
};

type Copy = {
  walletLabel: string;
  title: string;
  description: string;
  balanceDue: string;
  loading: string;
  unavailable: string;
  charged: string;
  approved: string;
  pending: string;
  access: string;
  blocked: string;
  active: string;
  partialFailure: string;
  fullFailure: string;
  summaryFailure: string;
  historyFailure: string;
  retry: string;
  retrying: string;
  payTitle: string;
  payDescription: string;
  provider: string;
  amount: string;
  transaction: string;
  transactionPlaceholder: string;
  receipt: string;
  evidenceRule: string;
  receiptRequired: string;
  balanceUnknown: string;
  noBalance: string;
  submit: string;
  submitting: string;
  submitted: string;
  historyTitle: string;
  historyDescription: string;
  historyLoading: string;
  historyUnavailable: string;
  noHistory: string;
  submittedAt: string;
  rejected: string;
  openReceipt: string;
  openingReceipt: string;
  receiptFailure: string;
};

const copyByLanguage: Record<"en" | "om" | "am", Copy> = {
  en: {
    walletLabel: "HALLO SMART COMMISSION WALLET",
    title: "Commission settlement",
    description: "Every confirmed bank/mobile payment and direct customer collection creates the HALLO Smart 2% commission balance. Your prepaid deposit covers that balance first.",
    balanceDue: "Balance due",
    loading: "Loading…",
    unavailable: "Unavailable",
    charged: "Commission charged",
    approved: "Approved paid",
    pending: "Pending review",
    access: "Job access",
    blocked: "BLOCKED",
    active: "ACTIVE",
    partialFailure: "Some wallet information could not be refreshed. The last confirmed data remains visible.",
    fullFailure: "Commission wallet information could not be loaded.",
    summaryFailure: "Commission balance is unavailable.",
    historyFailure: "Settlement history is unavailable.",
    retry: "Retry",
    retrying: "Retrying…",
    payTitle: "Pay commission",
    payDescription: "Use the HALLO Smart bank or mobile-money account, then submit the exact evidence here.",
    provider: "Provider",
    amount: "Amount ETB",
    transaction: "Transaction ID",
    transactionPlaceholder: "Unique bank / Telebirr reference",
    receipt: "Screenshot / receipt",
    evidenceRule: "A transaction ID can only be used once. Screenshot submission does not reduce your balance until Admin/Finance verifies the account and approves it.",
    receiptRequired: "Receipt screenshot or PDF is required.",
    balanceUnknown: "Commission balance is unavailable. Retry before submitting a payment.",
    noBalance: "No commission balance is currently due.",
    submit: "Submit commission payment",
    submitting: "Submitting…",
    submitted: "Commission payment submitted. Admin/Finance will verify the money in the HALLO Smart account before approval.",
    historyTitle: "Settlement history",
    historyDescription: "Pending, approved and rejected submissions remain visible for audit.",
    historyLoading: "Loading settlement history…",
    historyUnavailable: "Settlement history could not be loaded. Use Retry above.",
    noHistory: "No commission settlement submitted yet.",
    submittedAt: "Submitted",
    rejected: "Rejected",
    openReceipt: "Open receipt",
    openingReceipt: "Opening…",
    receiptFailure: "Receipt could not be opened.",
  },
  om: {
    walletLabel: "WALLETII KOMISHINII HALLO SMART",
    title: "Qarshii komishinii",
    description: "Kaffaltiin baankii/mobile mirkanaa'eefi qarshiin maamilaa irraa kallattiin walitti qabame hundi komishinii HALLO Smart 2% uuma. Deposit dursee kaffalame jalqaba irraa hir'ata.",
    balanceDue: "Komishinii hafee",
    loading: "Fe'amaa jira…",
    unavailable: "Hin argamne",
    charged: "Komishinii shallagame",
    approved: "Kaffaltii mirkanaa'e",
    pending: "Mirkaneessa eeggataa",
    access: "Hojii argachuu",
    blocked: "CUFAME",
    active: "HOJJATAA",
    partialFailure: "Odeeffannoon walletii muraasni haaromuu hin dandeenye. Odeeffannoon dhuma irratti mirkanaa'e ni mul'ata.",
    fullFailure: "Odeeffannoo walletii komishinii fe'uun hin danda'amne.",
    summaryFailure: "Hafteen komishinii hin argamne.",
    historyFailure: "Seenaan kaffaltii hin argamne.",
    retry: "Irra deebi'i",
    retrying: "Irra deebi'amaa jira…",
    payTitle: "Komishinii kaffali",
    payDescription: "Herrega baankii ykn mobile-money HALLO Smart fayyadami; ragaa sirrii asitti galchi.",
    provider: "Dhaabbata kaffaltii",
    amount: "Hanga ETB",
    transaction: "Lakkoofsa transaction",
    transactionPlaceholder: "Lakkoofsa baankii / Telebirr addaa",
    receipt: "Suuraa / receipt",
    evidenceRule: "Lakkoofsi transaction tokko yeroo tokko qofa fayyada. Ragaa erguun hanga Admin/Finance mirkaneessutti haftee hin hir'isu.",
    receiptRequired: "Suuraan receipt ykn PDF barbaachisaa dha.",
    balanceUnknown: "Hafteen komishinii hin argamne. Kaffaltii erguun dura irra deebi'i.",
    noBalance: "Amma komishiniin kaffalamuu qabu hin jiru.",
    submit: "Kaffaltii komishinii ergi",
    submitting: "Ergamaa jira…",
    submitted: "Kaffaltiin komishinii ergameera. Admin/Finance qarshii herrega HALLO Smart keessatti mirkaneessee booda ni raggaasisa.",
    historyTitle: "Seenaa kaffaltii",
    historyDescription: "Kaffaltiin eeggataa, mirkanaa'eefi didame audit'f ni tura.",
    historyLoading: "Seenaan kaffaltii fe'amaa jira…",
    historyUnavailable: "Seenaan kaffaltii fe'amuu hin dandeenye. Irra deebi'i jedhu fayyadami.",
    noHistory: "Kaffaltiin komishinii hanga ammaatti hin ergamne.",
    submittedAt: "Ergame",
    rejected: "Didame",
    openReceipt: "Receipt bani",
    openingReceipt: "Banamaa jira…",
    receiptFailure: "Receipt banuun hin danda'amne.",
  },
  am: {
    walletLabel: "HALLO SMART ኮሚሽን ዋሌት",
    title: "የኮሚሽን ክፍያ",
    description: "የተረጋገጠ የባንክ/ሞባይል ክፍያ እና በቀጥታ ከደንበኛ የተሰበሰበ ገንዘብ የHALLO Smart 2% ኮሚሽን ይፈጥራል። ቅድመ ተቀማጭዎ መጀመሪያ ይሸፍነዋል።",
    balanceDue: "ቀሪ ኮሚሽን",
    loading: "በመጫን ላይ…",
    unavailable: "አይገኝም",
    charged: "የተሰላ ኮሚሽን",
    approved: "የተረጋገጠ ክፍያ",
    pending: "ማረጋገጫ በመጠበቅ ላይ",
    access: "የሥራ መዳረሻ",
    blocked: "ታግዷል",
    active: "ንቁ",
    partialFailure: "አንዳንድ የዋሌት መረጃዎች መታደስ አልቻሉም። መጨረሻ የተረጋገጠው መረጃ ይታያል።",
    fullFailure: "የኮሚሽን ዋሌት መረጃ መጫን አልተቻለም።",
    summaryFailure: "የኮሚሽን ቀሪ ሂሳብ አይገኝም።",
    historyFailure: "የክፍያ ታሪክ አይገኝም።",
    retry: "እንደገና ሞክር",
    retrying: "እንደገና በመሞከር ላይ…",
    payTitle: "ኮሚሽን ይክፈሉ",
    payDescription: "የHALLO Smart ባንክ ወይም ሞባይል-ገንዘብ ሂሳብን ይጠቀሙ፣ ከዚያ ትክክለኛውን ማስረጃ እዚህ ያስገቡ።",
    provider: "አቅራቢ",
    amount: "መጠን ETB",
    transaction: "የግብይት መለያ",
    transactionPlaceholder: "ልዩ የባንክ / Telebirr ማጣቀሻ",
    receipt: "ስክሪንሾት / ደረሰኝ",
    evidenceRule: "አንድ የግብይት መለያ አንድ ጊዜ ብቻ ይጠቀማል። Admin/Finance እስኪያረጋግጥ ድረስ ማስረጃ መላክ ቀሪውን አይቀንስም።",
    receiptRequired: "የደረሰኝ ስክሪንሾት ወይም PDF ያስፈልጋል።",
    balanceUnknown: "የኮሚሽን ቀሪ ሂሳብ አይገኝም። ክፍያ ከመላክዎ በፊት እንደገና ይሞክሩ።",
    noBalance: "በአሁኑ ጊዜ የሚከፈል ኮሚሽን የለም።",
    submit: "የኮሚሽን ክፍያ ላክ",
    submitting: "በመላክ ላይ…",
    submitted: "የኮሚሽን ክፍያ ተልኳል። Admin/Finance በHALLO Smart ሂሳብ ውስጥ ገንዘቡን ካረጋገጠ በኋላ ያጸድቀዋል።",
    historyTitle: "የክፍያ ታሪክ",
    historyDescription: "በመጠበቅ ላይ፣ የጸደቁ እና የተከለከሉ ግቤቶች ለኦዲት ይቆያሉ።",
    historyLoading: "የክፍያ ታሪክ በመጫን ላይ…",
    historyUnavailable: "የክፍያ ታሪክ መጫን አልተቻለም። ከላይ እንደገና ሞክርን ይጠቀሙ።",
    noHistory: "እስካሁን የኮሚሽን ክፍያ አልተላከም።",
    submittedAt: "ተልኳል",
    rejected: "ውድቅ ተደርጓል",
    openReceipt: "ደረሰኝ ክፈት",
    openingReceipt: "በመክፈት ላይ…",
    receiptFailure: "ደረሰኙን መክፈት አልተቻለም።",
  },
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export function DriverCommissionWalletState({
  loadSummary,
  loadPayments,
  submitPayment,
  openReceipt,
}: {
  loadSummary: () => Promise<DriverCommissionSummary>;
  loadPayments: () => Promise<DriverCommissionPayment[]>;
  submitPayment: (input: CommissionPaymentInput) => Promise<void>;
  openReceipt: (path: string) => Promise<void>;
}) {
  const { language } = useLanguage();
  const copy = copyByLanguage[language];
  const [summary, setSummary] = useState<DriverCommissionSummary | null>(null);
  const [payments, setPayments] = useState<DriverCommissionPayment[]>([]);
  const [summaryKnown, setSummaryKnown] = useState(false);
  const [paymentsKnown, setPaymentsKnown] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [paymentsError, setPaymentsError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openingReceiptId, setOpeningReceiptId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);
  const loadBusyRef = useRef(false);
  const saveBusyRef = useRef(false);
  const receiptBusyRef = useRef(false);

  const load = useCallback(async () => {
    if (loadBusyRef.current) return;
    loadBusyRef.current = true;
    const requestId = ++requestIdRef.current;
    if (mountedRef.current) setLoading(true);

    const [summaryResult, paymentsResult] = await Promise.allSettled([
      Promise.resolve().then(loadSummary),
      Promise.resolve().then(loadPayments),
    ]);

    if (!mountedRef.current || requestId !== requestIdRef.current) {
      loadBusyRef.current = false;
      return;
    }

    if (summaryResult.status === "fulfilled") {
      setSummary(summaryResult.value);
      setSummaryKnown(true);
      setSummaryError("");
    } else {
      setSummaryError(errorMessage(summaryResult.reason, copy.summaryFailure));
    }

    if (paymentsResult.status === "fulfilled") {
      setPayments(paymentsResult.value);
      setPaymentsKnown(true);
      setPaymentsError("");
    } else {
      setPaymentsError(errorMessage(paymentsResult.reason, copy.historyFailure));
    }

    setLoading(false);
    loadBusyRef.current = false;
  }, [copy.historyFailure, copy.summaryFailure, loadPayments, loadSummary]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      loadBusyRef.current = false;
      saveBusyRef.current = false;
      receiptBusyRef.current = false;
    };
  }, [load]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveBusyRef.current) return;
    if (!summaryKnown || !summary) {
      setActionError(copy.balanceUnknown);
      return;
    }
    if (summary.balanceEtb <= 0) {
      setActionError(copy.noBalance);
      return;
    }

    const form = event.currentTarget;
    const data = new FormData(form);
    const receipt = data.get("receipt");
    if (!(receipt instanceof File) || !receipt.size) {
      setActionError(copy.receiptRequired);
      return;
    }

    saveBusyRef.current = true;
    setSaving(true);
    setActionError("");
    setNotice("");
    try {
      await submitPayment({
        provider: String(data.get("provider") || ""),
        transactionId: String(data.get("transactionId") || ""),
        amountEtb: Number(data.get("amountEtb") || 0),
        receipt,
      });
      if (!mountedRef.current) return;
      form.reset();
      setNotice(copy.submitted);
      await load();
    } catch (error) {
      if (mountedRef.current) setActionError(errorMessage(error, copy.receiptFailure));
    } finally {
      saveBusyRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  }

  async function handleOpenReceipt(payment: DriverCommissionPayment) {
    if (receiptBusyRef.current) return;
    receiptBusyRef.current = true;
    setOpeningReceiptId(payment.id);
    setActionError("");
    try {
      await openReceipt(payment.receipt_path);
    } catch (error) {
      if (mountedRef.current) setActionError(errorMessage(error, copy.receiptFailure));
    } finally {
      receiptBusyRef.current = false;
      if (mountedRef.current) setOpeningReceiptId(null);
    }
  }

  const hasSourceError = Boolean(summaryError || paymentsError);
  const hasConfirmedSource = summaryKnown || paymentsKnown;
  const submitDisabled = saving || !summaryKnown || !summary || summary.balanceEtb <= 0;
  const submitGuidance = !summaryKnown || !summary
    ? copy.balanceUnknown
    : summary.balanceEtb <= 0
      ? copy.noBalance
      : copy.evidenceRule;

  return (
    <section className="mt-8 min-w-0 border border-line bg-white" data-commission-wallet-state="true" aria-busy={loading}>
      <div className="border-b border-line bg-asphalt p-5 text-white sm:p-6">
        <p className="font-mono text-[10px] uppercase tracking-[.18em] text-amber">{copy.walletLabel}</p>
        <div className="mt-3 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-bold">{copy.title}</h2>
            <p className="mt-2 max-w-xl break-words text-xs leading-5 text-white/55">{copy.description}</p>
          </div>
          <div className="min-w-0 shrink-0">
            <p className="text-[10px] uppercase tracking-wide text-white/45">{copy.balanceDue}</p>
            <p className="mt-1 break-words font-display text-2xl font-bold text-amber" data-balance-state={summaryKnown ? "ready" : loading ? "loading" : "unavailable"}>
              {summaryKnown && summary ? formatEtb(summary.balanceEtb) : loading ? copy.loading : copy.unavailable}
            </p>
          </div>
        </div>
      </div>

      {hasSourceError && (
        <div className="border-b border-line bg-route/10 p-4" role="alert" data-wallet-source-error={hasConfirmedSource ? "partial" : "full"}>
          <p className="text-sm font-semibold text-route">{hasConfirmedSource ? copy.partialFailure : copy.fullFailure}</p>
          <div className="mt-2 space-y-1 text-xs text-route">
            {summaryError && <p className="break-words">{copy.summaryFailure} {summaryError}</p>}
            {paymentsError && <p className="break-words">{copy.historyFailure} {paymentsError}</p>}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="mt-3 min-h-11 border border-route px-4 py-2 text-xs font-semibold text-route disabled:cursor-wait disabled:opacity-50"
          >
            {loading ? copy.retrying : copy.retry}
          </button>
        </div>
      )}

      {!hasSourceError && loading && !hasConfirmedSource && (
        <p className="border-b border-line p-4 text-sm text-steel" role="status" aria-live="polite">{copy.loading}</p>
      )}

      {summaryKnown && summary && (
        <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4" data-summary-ready="true">
          <Metric label={copy.charged} value={formatEtb(summary.chargedEtb)} />
          <Metric label={copy.approved} value={formatEtb(summary.approvedPaidEtb)} />
          <Metric label={copy.pending} value={formatEtb(summary.pendingEtb)} />
          <Metric label={copy.access} value={summary.blocked ? copy.blocked : copy.active} alert={summary.blocked} />
        </div>
      )}

      <div className="grid min-w-0 gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <form onSubmit={handleSubmit} className="min-w-0 border border-line p-4" data-commission-form="true">
          <h3 className="font-display text-lg font-semibold">{copy.payTitle}</h3>
          <p className="mt-1 break-words text-xs text-steel">{copy.payDescription}</p>
          <fieldset disabled={saving || !summaryKnown || !summary || summary.balanceEtb <= 0} className="min-w-0 disabled:opacity-60">
            <label className="mt-4 block text-xs font-semibold">
              {copy.provider}
              <select name="provider" required className="mt-2 min-h-11 w-full min-w-0 border border-line bg-white p-3 text-sm">
                {providers.map((provider) => <option key={provider}>{provider}</option>)}
              </select>
            </label>
            <label className="mt-4 block text-xs font-semibold">
              {copy.amount}
              <input name="amountEtb" required min="1" step="0.01" type="number" max={summary?.balanceEtb || undefined} className="mt-2 min-h-11 w-full min-w-0 border border-line p-3 text-sm" />
            </label>
            <label className="mt-4 block text-xs font-semibold">
              {copy.transaction}
              <input name="transactionId" required className="mt-2 min-h-11 w-full min-w-0 border border-line p-3 text-sm" placeholder={copy.transactionPlaceholder} />
            </label>
            <label className="mt-4 block min-w-0 text-xs font-semibold">
              {copy.receipt}
              <input name="receipt" required type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="mt-2 block w-full min-w-0 max-w-full text-xs file:mr-2 file:max-w-full" />
            </label>
          </fieldset>
          <p id="commission-submit-guidance" className="mt-3 break-words text-[11px] leading-5 text-steel">{submitGuidance}</p>
          {actionError && <p className="mt-3 break-words bg-route/10 p-3 text-xs text-route" role="alert">{actionError}</p>}
          {notice && <p className="mt-3 break-words bg-emerald-50 p-3 text-xs text-emerald-800" role="status" aria-live="polite">{notice}</p>}
          <button
            disabled={submitDisabled}
            aria-describedby="commission-submit-guidance"
            className="mt-4 min-h-11 w-full bg-asphalt px-3 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? copy.submitting : copy.submit}
          </button>
        </form>

        <div className="min-w-0 border border-line" data-commission-history-state={paymentsKnown ? "ready" : loading ? "loading" : "unavailable"}>
          <div className="border-b border-line p-4">
            <h3 className="font-display text-lg font-semibold">{copy.historyTitle}</h3>
            <p className="mt-1 break-words text-xs text-steel">{copy.historyDescription}</p>
          </div>
          <div className="max-h-[430px] min-w-0 overflow-y-auto overflow-x-hidden">
            {!paymentsKnown && loading && <p className="p-6 text-sm text-steel" role="status">{copy.historyLoading}</p>}
            {!paymentsKnown && !loading && <p className="p-6 text-sm text-route">{copy.historyUnavailable}</p>}
            {paymentsKnown && payments.length === 0 && <p className="p-6 text-sm text-steel">{copy.noHistory}</p>}
            {paymentsKnown && payments.map((payment) => (
              <div key={payment.id} className="min-w-0 border-b border-line p-4 last:border-0" data-commission-payment-id={payment.id}>
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-words font-semibold">{formatEtb(payment.amount_etb)}</p>
                    <p className="mt-1 break-all text-xs text-steel">{payment.provider} · {payment.transaction_id}</p>
                  </div>
                  <Status status={payment.status} />
                </div>
                <p className="mt-2 break-words text-[11px] text-steel">{copy.submittedAt} {new Date(payment.submitted_at).toLocaleString()}</p>
                {payment.rejection_reason && <p className="mt-2 break-words text-xs font-semibold text-route">{copy.rejected}: {payment.rejection_reason}</p>}
                <button
                  type="button"
                  onClick={() => void handleOpenReceipt(payment)}
                  disabled={openingReceiptId !== null}
                  className="mt-3 min-h-11 max-w-full px-1 py-2 text-left text-xs font-semibold text-amber-dim disabled:cursor-wait disabled:opacity-50"
                >
                  {openingReceiptId === payment.id ? copy.openingReceipt : copy.openReceipt}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="min-w-0 bg-white p-4">
      <p className="break-words text-[10px] uppercase tracking-wide text-steel">{label}</p>
      <p className={`mt-2 break-words font-display text-lg font-bold ${alert ? "text-route" : "text-asphalt"}`}>{value}</p>
    </div>
  );
}

function Status({ status }: { status: DriverCommissionPayment["status"] }) {
  const cls = status === "approved"
    ? "bg-emerald-50 text-emerald-800"
    : status === "rejected"
      ? "bg-route/10 text-route"
      : "bg-amber/10 text-amber-dim";
  return <span className={`w-fit shrink-0 px-2.5 py-1.5 text-[10px] font-semibold uppercase ${cls}`}>{status}</span>;
}
