import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage, type HalloLanguage } from "../../i18n/LanguageProvider";
import { formatEtb } from "../../utils/currency";

export type PendingDriverConfirmation = {
  order_id: string;
  tracking_id: string;
  price_etb: number | string | null;
  provider: string;
  provider_ref: string | null;
};

export type DriverPaymentActionReport = {
  order_id: string;
  tracking_id: string;
  price_etb: number | string | null;
  rejection_reason?: string | null;
};

type PaymentActionSource = "confirmations" | "reports";
type PaymentActionSubscription = (onChange: () => void) => () => void;

type DriverPaymentActionBannerStateProps = {
  loadConfirmations: () => Promise<PendingDriverConfirmation[]>;
  loadReports: () => Promise<DriverPaymentActionReport[]>;
  subscribe?: PaymentActionSubscription;
};

type Snapshot = {
  confirmations: PendingDriverConfirmation[];
  reports: DriverPaymentActionReport[];
};

const copy: Record<HalloLanguage, {
  loading: string;
  loadFailed: string;
  partialFailure: string;
  retry: string;
  retrying: string;
  confirmKicker: string;
  confirmBody: string;
  confirmAction: string;
  reportKicker: string;
  reportBody: string;
  rejected: string;
  reportAction: string;
  more: string;
}> = {
  en: {
    loading: "Checking completed trips for payment actions…",
    loadFailed: "Payment actions could not be checked. Retry before assuming no action is required.",
    partialFailure: "Some payment actions could not be refreshed. The last confirmed actions remain visible.",
    retry: "Retry payment actions",
    retrying: "Checking payment actions…",
    confirmKicker: "HELD ESCROW · DRIVER CONFIRMATION REQUIRED",
    confirmBody: "Open this completed trip and confirm whether the assigned payment was received. Admin cannot release escrow before your confirmation.",
    confirmAction: "Confirm payment",
    reportKicker: "DELIVERED · PAYMENT REPORT REQUIRED",
    reportBody: "Cash or bank money received by the driver stays outside Earnings until Admin verifies it.",
    rejected: "Admin rejected the previous report. Correct it and submit again.",
    reportAction: "Report payment",
    more: "more completed trips need payment action",
  },
  om: {
    loading: "Trip xumuraman keessaa hojii kaffaltii barbaachisu ilaalaa jira…",
    loadFailed: "Hojiiwwan kaffaltii ilaaluun hin dandaʼamne. Hojii hin jiru jechuun dura deebiʼii yaali.",
    partialFailure: "Hojii kaffaltii muraasni haaromfamuu hin dandeenye. Hojii yeroo dhumaa mirkanaaʼe ammallee mulʼata.",
    retry: "Hojii kaffaltii deebiʼii ilaali",
    retrying: "Hojii kaffaltii ilaalaa jira…",
    confirmKicker: "ESCROW KEESSA · MIRKANEESSA DRIVER BARBAACHISA",
    confirmBody: "Imala xumurame kana baniitii kaffaltiin siif ramadame gaheera moo hin geenye mirkaneessi. Admin mirkaneessa kee dura escrow release gochuu hin dandaʼu.",
    confirmAction: "Kaffaltii mirkaneessi",
    reportKicker: "GEEFFAME · GABAASNI KAFFALTII BARBAACHISA",
    reportBody: "Cash ykn bankiin driver bira gahe hanga Admin mirkaneessutti Galii keessatti hin lakkaaʼamu.",
    rejected: "Admin gabaasa duraa reject godheera. Sirreessii irra deebiʼii ergi.",
    reportAction: "Kaffaltii gabaasi",
    more: "imala xumurame kan biraa tarkaanfii kaffaltii eeggata",
  },
  am: {
    loading: "የተጠናቀቁ ጉዞዎችን የክፍያ እርምጃ በመፈተሽ ላይ…",
    loadFailed: "የክፍያ እርምጃዎችን መፈተሽ አልተቻለም። ምንም እርምጃ እንደማያስፈልግ ከመገመትዎ በፊት እንደገና ይሞክሩ።",
    partialFailure: "አንዳንድ የክፍያ እርምጃዎች መታደስ አልቻሉም። መጨረሻ የተረጋገጡት እርምጃዎች እንደታዩ ይቆያሉ።",
    retry: "የክፍያ እርምጃዎችን እንደገና ይፈትሹ",
    retrying: "የክፍያ እርምጃዎችን በመፈተሽ ላይ…",
    confirmKicker: "በኤስክሮው · የአሽከርካሪ ማረጋገጫ ያስፈልጋል",
    confirmBody: "ይህን የተጠናቀቀ ጉዞ ከፍተው የተመደበው ክፍያ መድረሱን ወይም አለመድረሱን ያረጋግጡ። Admin ከማረጋገጫዎ በፊት ኤስክሮውን መልቀቅ አይችልም።",
    confirmAction: "ክፍያ ያረጋግጡ",
    reportKicker: "ደርሷል · የክፍያ ሪፖርት ያስፈልጋል",
    reportBody: "አሽከርካሪው የተቀበለው ክፍያ Admin እስኪያረጋግጥ ድረስ በገቢ ውስጥ አይቆጠርም።",
    rejected: "Admin የቀድሞውን ሪፖርት ውድቅ አድርጓል። አስተካክለው እንደገና ይላኩ።",
    reportAction: "ክፍያ ሪፖርት",
    more: "ሌሎች የተጠናቀቁ ጉዞዎች የክፍያ እርምጃ ይጠብቃሉ",
  },
};

export function DriverPaymentActionBannerState({
  loadConfirmations,
  loadReports,
  subscribe,
}: DriverPaymentActionBannerStateProps) {
  const { language } = useLanguage();
  const c = copy[language];
  const [snapshot, setSnapshot] = useState<Snapshot>({ confirmations: [], reports: [] });
  const [errors, setErrors] = useState<PaymentActionSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);
  const loadedRef = useRef(false);
  const busyRef = useRef(false);
  const queuedRef = useRef(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      busyRef.current = false;
      queuedRef.current = false;
    };
  }, []);

  const load = useCallback(async (queueIfBusy = false): Promise<void> => {
    if (busyRef.current) {
      if (queueIfBusy) queuedRef.current = true;
      return;
    }

    busyRef.current = true;
    const requestId = ++requestIdRef.current;
    if (loadedRef.current) setRefreshing(true);
    else setLoading(true);

    try {
      const [confirmationResult, reportResult] = await Promise.allSettled([
        Promise.resolve().then(loadConfirmations),
        Promise.resolve().then(loadReports),
      ]);
      if (!mountedRef.current || requestId !== requestIdRef.current) return;

      setSnapshot((previous) => ({
        confirmations: confirmationResult.status === "fulfilled"
          ? confirmationResult.value
          : previous.confirmations,
        reports: reportResult.status === "fulfilled"
          ? reportResult.value
          : previous.reports,
      }));

      const nextErrors: PaymentActionSource[] = [];
      if (confirmationResult.status === "rejected") nextErrors.push("confirmations");
      if (reportResult.status === "rejected") nextErrors.push("reports");
      setErrors(nextErrors);
      loadedRef.current = true;
    } finally {
      if (requestId === requestIdRef.current) {
        busyRef.current = false;
        if (mountedRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }

      if (mountedRef.current && queuedRef.current && requestId === requestIdRef.current) {
        queuedRef.current = false;
        queueMicrotask(() => void load(false));
      }
    }
  }, [loadConfirmations, loadReports]);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    if (!subscribe) return undefined;
    return subscribe(() => void load(true));
  }, [load, subscribe]);

  const visibleReports = useMemo(() => {
    const confirmationIds = new Set(snapshot.confirmations.map((row) => row.order_id));
    return snapshot.reports.filter((row) => !confirmationIds.has(row.order_id));
  }, [snapshot.confirmations, snapshot.reports]);

  const confirmation = snapshot.confirmations[0];
  const report = visibleReports[0];
  const hasAction = Boolean(confirmation || report);
  const remaining = Math.max(0, snapshot.confirmations.length + visibleReports.length - 1);
  const isConfirmation = Boolean(confirmation);
  const orderId = confirmation?.order_id ?? report?.order_id;
  const trackingId = confirmation?.tracking_id ?? report?.tracking_id;
  const priceEtb = confirmation?.price_etb ?? report?.price_etb;
  const hasErrors = errors.length > 0;
  const statusMessage = hasAction ? c.partialFailure : c.loadFailed;

  if (loading && !loadedRef.current) {
    return (
      <section
        className="border-b border-amber/35 bg-amber/10 px-4 py-3 font-body text-sm text-steel sm:px-6"
        role="status"
        aria-live="polite"
        aria-busy="true"
        data-driver-payment-action-state="loading"
      >
        <div className="mx-auto max-w-4xl">{c.loading}</div>
      </section>
    );
  }

  if (!hasAction && !hasErrors) return null;

  if (!hasAction) {
    return (
      <section
        className="border-b border-route/35 bg-route/5 px-4 py-4 sm:px-6"
        aria-busy={refreshing}
        data-driver-payment-action-state="error"
        data-driver-payment-action-errors={errors.join(",")}
      >
        <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p role="alert" className="min-w-0 break-words text-sm leading-6 text-route">{statusMessage}</p>
          <button
            type="button"
            onClick={() => void load(false)}
            disabled={refreshing}
            className="min-h-12 w-full shrink-0 bg-asphalt px-5 py-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60 sm:w-auto"
          >
            {refreshing ? c.retrying : c.retry}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      className="border-b border-amber/35 bg-amber/10 px-4 py-4 sm:px-6"
      aria-busy={refreshing}
      data-driver-payment-action-banner
      data-driver-payment-action-state={hasErrors ? "partial-error" : "ready"}
      data-driver-payment-action-errors={hasErrors ? errors.join(",") : undefined}
      data-driver-payment-action-count={snapshot.confirmations.length + visibleReports.length}
      data-driver-payment-action-order={orderId}
    >
      <div className="mx-auto max-w-4xl">
        {hasErrors && (
          <div className="mb-4 flex flex-col gap-3 border border-route/30 bg-white/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p role="alert" className="min-w-0 break-words text-xs leading-5 text-route">{statusMessage}</p>
            <button
              type="button"
              onClick={() => void load(false)}
              disabled={refreshing}
              className="min-h-11 w-full shrink-0 border border-asphalt/20 px-4 py-2 text-sm font-semibold text-asphalt disabled:cursor-wait disabled:opacity-60 sm:w-auto"
            >
              {refreshing ? c.retrying : c.retry}
            </button>
          </div>
        )}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-[9px] font-semibold tracking-[.16em] text-amber-dim">
              {isConfirmation ? c.confirmKicker : c.reportKicker}
            </p>
            <p className="mt-1 break-words font-display text-lg font-bold text-asphalt">
              {trackingId} · {formatEtb(Number(priceEtb || 0))}
            </p>
            <p className="mt-1 break-words text-xs leading-5 text-steel">
              {isConfirmation
                ? `${c.confirmBody} ${confirmation?.provider ?? ""}${confirmation?.provider_ref ? ` · ${confirmation.provider_ref}` : ""}`
                : report?.rejection_reason ? c.rejected : c.reportBody}
            </p>
            {remaining > 0 && (
              <p className="mt-1 break-words text-[11px] font-semibold text-amber-dim">+{remaining} {c.more}</p>
            )}
          </div>
          <Link
            to={`/driver/payment/${orderId}`}
            className="inline-flex min-h-12 w-full shrink-0 items-center justify-center bg-asphalt px-5 py-3 text-center text-sm font-semibold text-white sm:w-auto"
          >
            {isConfirmation ? c.confirmAction : c.reportAction} →
          </Link>
        </div>
      </div>
    </section>
  );
}
