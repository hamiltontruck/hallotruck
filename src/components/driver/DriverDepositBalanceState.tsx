import { useCallback, useEffect, useRef, useState } from "react";
import type { HalloLanguage } from "../../i18n/LanguageProvider";
import { calculateDriverDepositWallet } from "../../domain/driver-deposit";
import { formatEtb } from "../../utils/currency";

export type DriverFinancialSummary = {
  admin_deposit_etb: number | string;
  commission_charged_etb: number | string;
  commission_paid_etb: number | string;
  available_deposit_etb: number | string;
  commission_due_etb: number | string;
};

type RefreshReason = "initial" | "manual" | "realtime";
type DepositSubscription = (onChange: () => void) => () => void;

type Copy = {
  loading: string;
  refreshing: string;
  loadError: string;
  refreshError: string;
  unavailable: string;
  retry: string;
  retrying: string;
  kicker: string;
  title: string;
  description: string;
  depositTotal: string;
  commissionDeducted: string;
  availableBalance: string;
  commissionDue: string;
};

const copy: Record<HalloLanguage, Copy> = {
  en: {
    loading: "Loading your confirmed deposit balance…",
    refreshing: "Refreshing the deposit balance after the latest wallet update…",
    loadError: "Your deposit balance could not be loaded. Retry before assuming a zero balance.",
    refreshError: "The latest deposit refresh failed. Your last confirmed balance remains visible.",
    unavailable: "The financial summary returned no balance record. Retry before assuming a zero balance.",
    retry: "Retry deposit balance",
    retrying: "Refreshing deposit balance…",
    kicker: "DRIVER DEPOSIT WALLET",
    title: "Available deposit balance",
    description: "Verified HALLO Smart commission is deducted automatically from your Admin-recorded deposit.",
    depositTotal: "Deposit total",
    commissionDeducted: "Commission deducted",
    availableBalance: "Available balance",
    commissionDue: "Commission due",
  },
  om: {
    loading: "Deposit kee kan mirkanaa'e fe'aa jira…",
    refreshing: "Jijjiirama wallet haaraa booda deposit haaromsaa jira…",
    loadError: "Deposit kee fe'uun hin milkoofne. Zeeroo dha jechuun dura irra deebi'ii yaali.",
    refreshError: "Deposit haaromsuun hin milkoofne. Balance dhumaa mirkanaa'e mul'achuu itti fufa.",
    unavailable: "Gabaasni faayinaansii balance hin deebisne. Zeeroo dha jechuun dura irra deebi'ii yaali.",
    retry: "Deposit irra deebi'ii ilaali",
    retrying: "Deposit haaromsaa jira…",
    kicker: "WALLET DEPOSIT DRIVER",
    title: "Deposit irraa hafe",
    description: "Komishiniin HALLO Smart mirkanaa'e deposit Admin galmeesse keessaa ofumaan hir'ata.",
    depositTotal: "Deposit waliigalaa",
    commissionDeducted: "Komishinii hir'ate",
    availableBalance: "Balance jiru",
    commissionDue: "Komishinii kaffalamu",
  },
  am: {
    loading: "የተረጋገጠውን የዲፖዚት ቀሪ ሂሳብ በመጫን ላይ…",
    refreshing: "ከቅርብ የዋሌት ለውጥ በኋላ የዲፖዚት ቀሪ ሂሳብን በማደስ ላይ…",
    loadError: "የዲፖዚት ቀሪ ሂሳብዎን መጫን አልተቻለም። ዜሮ ነው ብለው ከመገመትዎ በፊት እንደገና ይሞክሩ።",
    refreshError: "የቅርብ ጊዜው የዲፖዚት ማደስ አልተሳካም። የመጨረሻው የተረጋገጠ ቀሪ ሂሳብ እንደታየ ይቆያል።",
    unavailable: "የፋይናንስ ማጠቃለያው የቀሪ ሂሳብ መዝገብ አልመለሰም። ዜሮ ነው ብለው ከመገመትዎ በፊት እንደገና ይሞክሩ።",
    retry: "የዲፖዚት ቀሪ ሂሳብን እንደገና ይሞክሩ",
    retrying: "የዲፖዚት ቀሪ ሂሳብን በማደስ ላይ…",
    kicker: "የአሽከርካሪ ዲፖዚት ዋሌት",
    title: "ያለው የዲፖዚት ቀሪ ሂሳብ",
    description: "የተረጋገጠው የHALLO Smart ኮሚሽን Admin ከመዘገበው ዲፖዚት በራስ-ሰር ይቀነሳል።",
    depositTotal: "ጠቅላላ ዲፖዚት",
    commissionDeducted: "የተቀነሰ ኮሚሽን",
    availableBalance: "ያለው ቀሪ ሂሳብ",
    commissionDue: "የሚከፈል ኮሚሽን",
  },
};

function amount(value: number | string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function DriverDepositBalanceState({
  language = "en",
  loadSummary,
  subscribe,
  initialSummary,
  loadOnMount = true,
}: {
  language?: HalloLanguage;
  loadSummary: () => Promise<DriverFinancialSummary | null>;
  subscribe?: DepositSubscription;
  initialSummary?: DriverFinancialSummary | null;
  loadOnMount?: boolean;
}) {
  const t = copy[language];
  const [summary, setSummary] = useState<DriverFinancialSummary | null>(initialSummary ?? null);
  const [known, setKnown] = useState(initialSummary !== undefined);
  const [errorDetail, setErrorDetail] = useState("");
  const [loading, setLoading] = useState(loadOnMount && initialSummary === undefined);
  const mountedRef = useRef(false);
  const busyRef = useRef(false);
  const queuedRealtimeRefreshRef = useRef(false);
  const requestIdRef = useRef(0);
  const runRef = useRef<(reason: RefreshReason) => Promise<void>>(async () => undefined);

  const run = useCallback(async (reason: RefreshReason) => {
    if (busyRef.current) {
      if (reason === "realtime") queuedRealtimeRefreshRef.current = true;
      return;
    }

    busyRef.current = true;
    setLoading(true);
    const requestId = ++requestIdRef.current;

    try {
      const result = await Promise.resolve().then(loadSummary);
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setSummary(result);
      setKnown(true);
      setErrorDetail("");
    } catch (error) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setErrorDetail(error instanceof Error ? error.message : "Unknown deposit balance error.");
    } finally {
      if (requestId === requestIdRef.current) {
        busyRef.current = false;
        if (mountedRef.current) setLoading(false);
      }

      if (mountedRef.current && queuedRealtimeRefreshRef.current && requestId === requestIdRef.current) {
        queuedRealtimeRefreshRef.current = false;
        queueMicrotask(() => void runRef.current("realtime"));
      }
    }
  }, [loadSummary]);

  runRef.current = run;

  useEffect(() => {
    mountedRef.current = true;
    if (loadOnMount) void run("initial");
    return () => {
      mountedRef.current = false;
      busyRef.current = false;
      queuedRealtimeRefreshRef.current = false;
      requestIdRef.current += 1;
    };
  }, [loadOnMount, run]);

  useEffect(() => {
    if (!loadOnMount || !subscribe) return undefined;
    return subscribe(() => void run("realtime"));
  }, [loadOnMount, run, subscribe]);

  const hasError = Boolean(errorDetail);

  if (!known && loading && !hasError) {
    return (
      <section
        className="mt-6 border border-line bg-white p-5 text-sm text-steel"
        role="status"
        aria-live="polite"
        aria-busy="true"
        data-driver-deposit-state="loading"
      >
        {t.loading}
      </section>
    );
  }

  if (!summary) {
    return (
      <section
        className="mt-6 border border-route/30 bg-route/5 p-4"
        role="alert"
        aria-live="assertive"
        aria-busy={loading}
        data-driver-deposit-state={known ? "unavailable" : "error"}
        data-deposit-known={String(known)}
      >
        <p className="break-words text-sm font-semibold text-route">{known ? t.unavailable : t.loadError}</p>
        {hasError && <p className="mt-1 break-words text-xs leading-5 text-route/80">{errorDetail}</p>}
        <button
          type="button"
          data-deposit-retry="true"
          disabled={loading}
          aria-disabled={loading}
          onClick={() => void run("manual")}
          className="mt-3 min-h-11 w-full bg-asphalt px-4 py-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {loading ? t.retrying : t.retry}
        </button>
      </section>
    );
  }

  const deposited = amount(summary.admin_deposit_etb);
  const wallet = calculateDriverDepositWallet({
    depositedEtb: deposited,
    commissionChargedEtb: amount(summary.commission_charged_etb),
    commissionPaidEtb: amount(summary.commission_paid_etb),
  });
  const deducted = wallet.depositConsumedEtb;
  const available = amount(summary.available_deposit_etb);
  const due = amount(summary.commission_due_etb);

  return (
    <section
      className="mt-6 min-w-0 overflow-x-hidden"
      aria-busy={loading}
      data-driver-deposit-state={hasError ? "stale" : loading ? "refreshing" : "ready"}
      data-deposit-known="true"
    >
      {loading && (
        <p role="status" aria-live="polite" className="mb-3 border border-amber/30 bg-amber/10 px-4 py-3 text-xs text-amber-dim">
          {t.refreshing}
        </p>
      )}

      {hasError && (
        <div role="alert" aria-live="assertive" className="mb-3 border border-route/30 bg-route/5 p-4">
          <p className="break-words text-sm font-semibold text-route">{t.refreshError}</p>
          <p className="mt-1 break-words text-xs leading-5 text-route/80">{errorDetail}</p>
          <button
            type="button"
            data-deposit-retry="true"
            disabled={loading}
            aria-disabled={loading}
            onClick={() => void run("manual")}
            className="mt-3 min-h-11 w-full bg-asphalt px-4 py-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {loading ? t.retrying : t.retry}
          </button>
        </div>
      )}

      <div className="border border-line bg-white">
        <div className="border-b border-line bg-asphalt p-5 text-white sm:p-6">
          <p className="break-words font-mono text-[10px] uppercase tracking-[.18em] text-amber">{t.kicker}</p>
          <div className="mt-3 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h2 className="break-words font-display text-2xl font-bold">{t.title}</h2>
              <p className="mt-2 max-w-xl break-words text-xs leading-5 text-white/60">{t.description}</p>
            </div>
            <p className="shrink-0 break-words font-display text-3xl font-bold text-amber">{formatEtb(available)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
          <Metric label={t.depositTotal} value={formatEtb(deposited)} />
          <Metric label={t.commissionDeducted} value={formatEtb(deducted)} />
          <Metric label={t.availableBalance} value={formatEtb(available)} strong />
          <Metric label={t.commissionDue} value={formatEtb(due)} alert={due > 0} />
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value, strong = false, alert = false }: { label: string; value: string; strong?: boolean; alert?: boolean }) {
  return (
    <div className="min-w-0 bg-white p-4 sm:p-5">
      <p className="break-words text-[10px] uppercase tracking-wide text-steel">{label}</p>
      <p className={`mt-2 break-words font-display text-lg font-bold ${alert ? "text-route" : strong ? "text-emerald-800" : "text-asphalt"}`}>
        {value}
      </p>
    </div>
  );
}
