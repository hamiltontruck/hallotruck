import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { HalloLanguage } from "../../i18n/LanguageProvider";
import type { DriverEarningsSummary } from "../../services/driver-earnings.service";

type RefreshReason = "initial" | "manual" | "payment";

type Copy = {
  loading: string;
  refreshing: string;
  loadError: string;
  refreshError: string;
  retry: string;
  retrying: string;
};

const copy: Record<HalloLanguage, Copy> = {
  en: {
    loading: "Loading earnings and trip history…",
    refreshing: "Refreshing earnings after the latest payment update…",
    loadError: "Could not load your earnings and trip history.",
    refreshError: "The latest earnings refresh failed. Your last confirmed earnings remain visible.",
    retry: "Retry",
    retrying: "Retrying…",
  },
  om: {
    loading: "Galii fi seenaa imalaa fe'aa jira…",
    refreshing: "Jijjiirama kaffaltii haaraa booda galii haaromsaa jira…",
    loadError: "Galii fi seenaa imalaa kee fe'uun hin milkoofne.",
    refreshError: "Galii haaraa haaromsuun hin milkoofne. Galiin dhumaa mirkanaa'e mul'achuu itti fufa.",
    retry: "Irra deebi'i",
    retrying: "Irra deebi'aa jira…",
  },
  am: {
    loading: "ገቢዎችን እና የጉዞ ታሪክን በመጫን ላይ…",
    refreshing: "ከቅርብ የክፍያ ለውጥ በኋላ ገቢዎችን በማደስ ላይ…",
    loadError: "ገቢዎችዎን እና የጉዞ ታሪክዎን መጫን አልተቻለም።",
    refreshError: "የቅርብ ጊዜው የገቢ ማደስ አልተሳካም። የመጨረሻው የተረጋገጠ ገቢ እንደታየ ይቆያል።",
    retry: "እንደገና ሞክር",
    retrying: "እንደገና በመሞከር ላይ…",
  },
};

export function DriverEarningsLoadBoundary({
  language,
  loadEarnings,
  children,
}: {
  language: HalloLanguage;
  loadEarnings: () => Promise<DriverEarningsSummary>;
  children: (data: DriverEarningsSummary, onPaymentChanged: () => void) => ReactNode;
}) {
  const t = copy[language];
  const [data, setData] = useState<DriverEarningsSummary | null>(null);
  const [errorDetail, setErrorDetail] = useState("");
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(false);
  const busyRef = useRef(false);
  const queuedPaymentRefreshRef = useRef(false);
  const requestIdRef = useRef(0);
  const runRef = useRef<(reason: RefreshReason) => Promise<void>>(async () => undefined);

  const run = useCallback(async (reason: RefreshReason) => {
    if (busyRef.current) {
      if (reason === "payment") queuedPaymentRefreshRef.current = true;
      return;
    }

    busyRef.current = true;
    setLoading(true);
    const requestId = ++requestIdRef.current;

    try {
      const result = await Promise.resolve().then(loadEarnings);
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setData(result);
      setErrorDetail("");
    } catch (error) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setErrorDetail(error instanceof Error ? error.message : "Unknown earnings error.");
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) setLoading(false);
      busyRef.current = false;

      if (mountedRef.current && queuedPaymentRefreshRef.current) {
        queuedPaymentRefreshRef.current = false;
        window.setTimeout(() => {
          if (mountedRef.current) void runRef.current("payment");
        }, 0);
      }
    }
  }, [loadEarnings]);

  runRef.current = run;

  useEffect(() => {
    mountedRef.current = true;
    void run("initial");
    return () => {
      mountedRef.current = false;
      queuedPaymentRefreshRef.current = false;
      requestIdRef.current += 1;
    };
  }, [run]);

  const onPaymentChanged = useCallback(() => {
    void run("payment");
  }, [run]);

  const hasError = Boolean(errorDetail);

  return (
    <section
      aria-busy={loading}
      data-driver-earnings-state="true"
      data-has-data={String(Boolean(data))}
      data-loading={String(loading)}
      data-error={String(hasError)}
    >
      {loading && !data && !hasError && (
        <p role="status" aria-live="polite" className="font-body text-sm text-steel">
          {t.loading}
        </p>
      )}

      {loading && data && (
        <p role="status" aria-live="polite" className="mb-4 border border-amber/30 bg-amber/10 px-4 py-3 font-body text-xs text-amber-dim">
          {t.refreshing}
        </p>
      )}

      {hasError && (
        <div role="alert" aria-live="assertive" className="mb-6 border border-route/40 bg-route/5 p-4">
          <p className="font-body text-sm font-semibold text-route">{data ? t.refreshError : t.loadError}</p>
          <p className="mt-1 break-words font-body text-xs text-route/80">{errorDetail}</p>
          <button
            type="button"
            data-earnings-retry="true"
            disabled={loading}
            aria-disabled={loading}
            onClick={() => void run("manual")}
            className="mt-3 min-h-11 bg-asphalt px-4 py-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? t.retrying : t.retry}
          </button>
        </div>
      )}

      {data ? children(data, onPaymentChanged) : null}
    </section>
  );
}
