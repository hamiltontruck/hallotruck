import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatWalletEtb,
  type DriverCommissionSummary,
  type DriverFinancialSummary,
  type DriverWalletTrip,
} from "./driver-wallet.model";
import {
  fetchDriverCommissionSummary,
  fetchDriverFinancialSummary,
  fetchDriverWalletTrips,
  subscribeToDriverWallet,
} from "./driver-wallet.service";
import { DriverCommissionPaymentPanel } from "./DriverCommissionPaymentPanel";
import type { DriverCommissionPayment } from "./driver-commission-payment.model";
import { fetchDriverCommissionPayments } from "./driver-commission-payment.service";
import { DriverPendingPaymentActions } from "./DriverPendingPaymentActions";
import { getDriverV4Copy, type DriverLanguage } from "./driver-v4-i18n";

type SourceErrors = {
  financial: string | null;
  commission: string | null;
  payments: string | null;
  trips: string | null;
};

const EMPTY_ERRORS: SourceErrors = { financial: null, commission: null, payments: null, trips: null };
const REFRESH_MS = 30_000;

function errorMessage(_error: unknown, fallback: string): string {
  return fallback;
}

function dateLabel(value: string, language: DriverLanguage): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const locale = language === "am" ? "am-ET" : language === "om" ? "om-ET" : "en-ET";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Addis_Ababa",
  }).format(date);
}

function Metric({ label, value, help }: { label: string; value: string; help?: string }) {
  return <article className="min-w-0 rounded-[20px] border border-halo-line bg-white p-3.5 shadow-halo-card">
    <p className="text-[9px] font-black uppercase tracking-[0.13em] text-halo-muted">{label}</p>
    <p className="mt-2 break-words text-lg font-black text-halo-navy">{value}</p>
    {help && <p className="mt-1 text-[10px] leading-4 text-halo-muted">{help}</p>}
  </article>;
}

function SourceNotice({
  message,
  retryLabel,
  onRetry,
}: {
  message: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
    <p role="alert" className="min-w-0 flex-1 text-[11px] font-bold leading-5 text-amber-900">{message}</p>
    <button type="button" onClick={onRetry} className="min-h-10 shrink-0 rounded-xl bg-halo-navy px-3 text-[10px] font-black text-white">{retryLabel}</button>
  </div>;
}

export function DriverWalletView({
  userId,
  language = "om",
}: {
  userId: string;
  language?: DriverLanguage;
}) {
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);
  const inFlightRef = useRef(false);
  const queuedRefreshRef = useRef(false);
  const [financial, setFinancial] = useState<DriverFinancialSummary | null>(null);
  const [commission, setCommission] = useState<DriverCommissionSummary | null>(null);
  const [payments, setPayments] = useState<DriverCommissionPayment[] | null>(null);
  const [trips, setTrips] = useState<DriverWalletTrip[] | null>(null);
  const [errors, setErrors] = useState<SourceErrors>(EMPTY_ERRORS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const t = getDriverV4Copy(language);

  const load = useCallback(async (silent = false) => {
    if (inFlightRef.current) {
      queuedRefreshRef.current = true;
      return;
    }
    inFlightRef.current = true;
    const requestId = ++requestIdRef.current;
    if (silent) setRefreshing(true);
    else setLoading(true);

    const results = await Promise.allSettled([
      fetchDriverFinancialSummary(userId),
      fetchDriverCommissionSummary(userId),
      fetchDriverCommissionPayments(userId),
      fetchDriverWalletTrips(userId),
    ]);
    if (!mountedRef.current || requestId !== requestIdRef.current) {
      inFlightRef.current = false;
      return;
    }

    const nextErrors: SourceErrors = { ...EMPTY_ERRORS };
    const [financialResult, commissionResult, paymentsResult, tripsResult] = results;
    let confirmedAny = false;

    if (financialResult.status === "fulfilled") {
      setFinancial(financialResult.value);
      confirmedAny = true;
    } else nextErrors.financial = errorMessage(financialResult.reason, t.wallet.financeError);

    if (commissionResult.status === "fulfilled") {
      setCommission(commissionResult.value);
      confirmedAny = true;
    } else nextErrors.commission = errorMessage(commissionResult.reason, t.wallet.commissionError);

    if (paymentsResult.status === "fulfilled") {
      setPayments(paymentsResult.value);
      confirmedAny = true;
    } else nextErrors.payments = errorMessage(paymentsResult.reason, t.wallet.paymentsError);

    if (tripsResult.status === "fulfilled") {
      setTrips(tripsResult.value);
      confirmedAny = true;
    } else nextErrors.trips = errorMessage(tripsResult.reason, t.wallet.tripsError);

    setErrors(nextErrors);
    if (confirmedAny) setLastUpdated(new Date().toISOString());
    setLoading(false);
    setRefreshing(false);
    inFlightRef.current = false;

    if (queuedRefreshRef.current && mountedRef.current) {
      queuedRefreshRef.current = false;
      window.setTimeout(() => void load(true), 0);
    }
  }, [
    t.wallet.commissionError,
    t.wallet.financeError,
    t.wallet.paymentsError,
    t.wallet.tripsError,
    userId,
  ]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    const interval = window.setInterval(() => void load(true), REFRESH_MS);
    let unsubscribe: () => void = () => undefined;
    try {
      unsubscribe = subscribeToDriverWallet(userId, () => void load(true));
    } catch (caught) {
      setErrors((currentErrors) => ({
        ...currentErrors,
        financial: currentErrors.financial ?? errorMessage(caught, t.wallet.realtimeError),
      }));
    }
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      window.clearInterval(interval);
      unsubscribe();
    };
  }, [load, t.wallet.realtimeError, userId]);

  const initialUnknown = !financial && !commission && !payments && !trips;
  if (loading && initialUnknown) {
    return <div className="grid min-h-[calc(100dvh-137px)] place-items-center bg-halo-canvas px-6 text-center">
      <div><div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-halo-line border-t-halo-blue"/><p className="mt-4 text-sm font-bold text-halo-muted">{t.wallet.loading}</p></div>
    </div>;
  }

  const available = financial?.availableDepositEtb ?? null;
  const due = financial?.commissionDueEtb ?? commission?.balanceEtb ?? null;
  const blocked = commission?.blocked ?? (due !== null ? due > 0.005 : false);

  function resultLabel(trip: DriverWalletTrip) {
    if (trip.resultType === "cash_received") return t.wallet.cashReceived;
    if (trip.resultType === "bank_telebirr") return t.wallet.bankTelebirr;
    return t.wallet.paymentOutstanding;
  }

  return <div className="space-y-5 px-4 pb-7 pt-5 sm:px-6" data-mobile-driver-wallet aria-busy={refreshing}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-halo-gold-dark">{t.wallet.eyebrow}</p>
        <h1 className="mt-1 text-2xl font-black text-halo-navy">{t.wallet.title}</h1>
        <p className="mt-2 text-xs leading-5 text-halo-muted">{t.wallet.subtitle}</p>
      </div>
      <button type="button" onClick={() => void load(true)} disabled={refreshing} className="min-h-11 shrink-0 rounded-2xl border border-halo-line bg-white px-3 text-[10px] font-black text-halo-blue shadow-halo-card disabled:opacity-60">{refreshing ? t.common.refreshing : t.common.refresh}</button>
    </div>

    <DriverPendingPaymentActions userId={userId} language={language} />

    <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-halo-blue to-halo-blue-dark p-5 text-white shadow-halo-float">
      <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full border-[25px] border-white/5" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs text-white/60">{t.wallet.availableDeposit}</p><p className="mt-2 text-3xl font-black tracking-tight">{formatWalletEtb(available)}</p></div>
          <span className={`rounded-full px-3 py-2 text-[9px] font-black ${blocked ? "bg-red-500/20 text-red-100" : "bg-emerald-400/20 text-emerald-100"}`}>{blocked ? t.wallet.blocked : t.wallet.active}</span>
        </div>
        <p className="mt-4 text-[11px] leading-5 text-white/65">{t.wallet.jobLock}: {blocked ? t.wallet.jobLockBlocked : t.wallet.jobLockClear}.</p>
      </div>
    </section>

    {errors.financial && <SourceNotice message={errors.financial} retryLabel={t.common.retry} onRetry={() => void load(true)} />}
    <section className="grid grid-cols-2 gap-3" aria-label={t.wallet.title}>
      <Metric label={t.wallet.releasedGross} value={formatWalletEtb(financial?.grossReleasedEtb ?? null)} help={t.wallet.tripFunds} />
      <Metric label={t.wallet.completedTrips} value={financial ? financial.completedTrips.toLocaleString() : "—"} />
      <Metric label={t.wallet.deposit} value={formatWalletEtb(financial?.adminDepositEtb ?? null)} help={t.wallet.adminDeposit} />
      <Metric label={t.wallet.availableDeposit} value={formatWalletEtb(available)} />
      <Metric label={t.wallet.commissionDeducted} value={formatWalletEtb(financial?.commissionChargedEtb ?? null)} />
      <Metric label={t.wallet.commissionDue} value={formatWalletEtb(due)} help={blocked ? t.wallet.jobLockBlocked : t.wallet.jobLockClear} />
    </section>

    <section className="rounded-[24px] border border-halo-line bg-white p-4 shadow-halo-card">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[9px] font-black uppercase tracking-[0.14em] text-halo-gold-dark">{t.wallet.halloCommission}</p><h2 className="mt-1 text-lg font-black text-halo-navy">{t.wallet.commissionPayments}</h2></div>
        <span className="rounded-xl bg-halo-soft px-2.5 py-1.5 text-[9px] font-black text-halo-blue">{t.wallet.readOnly}</span>
      </div>
      {errors.commission && <div className="mt-3"><SourceNotice message={errors.commission} retryLabel={t.common.retry} onRetry={() => void load(true)} /></div>}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Metric label={t.wallet.charged} value={formatWalletEtb(commission?.chargedEtb ?? financial?.commissionChargedEtb ?? null)} />
        <Metric label={t.wallet.approvedPaid} value={formatWalletEtb(commission?.approvedPaidEtb ?? financial?.commissionPaidEtb ?? null)} />
        <Metric label={t.wallet.pendingReview} value={formatWalletEtb(commission?.pendingEtb ?? null)} />
        <Metric label={t.wallet.balance} value={formatWalletEtb(commission?.balanceEtb ?? financial?.commissionDueEtb ?? null)} />
      </div>
    </section>

    {commission && <DriverCommissionPaymentPanel
      userId={userId}
      balanceEtb={commission.balanceEtb}
      pendingEtb={commission.pendingEtb}
      payments={payments}
      sourceError={errors.payments}
      onRetry={() => void load(true)}
      onSubmitted={async () => { await load(true); }}
      language={language}
    />}

    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div><p className="text-[9px] font-black uppercase tracking-[0.14em] text-halo-muted">{t.wallet.recentActivity}</p><h2 className="mt-1 text-lg font-black text-halo-navy">{t.wallet.tripHistory}</h2></div>
        {lastUpdated && <span className="text-[9px] font-bold text-halo-muted">{t.wallet.updated} {dateLabel(lastUpdated, language)}</span>}
      </div>
      {errors.trips && <SourceNotice message={errors.trips} retryLabel={t.common.retry} onRetry={() => void load(true)} />}
      {trips && trips.length === 0 && <div className="rounded-[22px] border border-dashed border-halo-line bg-white p-6 text-center"><p className="text-sm font-black text-halo-navy">{t.wallet.noTrips}</p><p className="mt-2 text-xs leading-5 text-halo-muted">{t.wallet.historyEmptyHelp}</p></div>}
      {trips?.map((trip) => <article key={trip.id} className="rounded-[22px] border border-halo-line bg-white p-4 shadow-halo-card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[10px] font-black uppercase tracking-[0.12em] text-halo-blue">{trip.trackingId}</p>
            <h3 className="mt-1 break-words text-sm font-black text-halo-navy">{trip.pickupAddress} → {trip.dropoffAddress}</h3>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1.5 text-[9px] font-black ${trip.resultType === "payment_not_received" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>{resultLabel(trip)}</span>
        </div>
        <div className="mt-4 grid grid-cols-3 divide-x divide-halo-line text-center">
          <div className="px-1"><p className="text-[9px] text-halo-muted">{t.wallet.gross}</p><p className="mt-1 break-words text-xs font-black text-halo-navy">{formatWalletEtb(trip.grossEtb)}</p></div>
          <div className="px-1"><p className="text-[9px] text-halo-muted">{t.wallet.commission}</p><p className="mt-1 break-words text-xs font-black text-red-700">{formatWalletEtb(trip.commissionEtb)}</p></div>
          <div className="px-1"><p className="text-[9px] text-halo-muted">{t.wallet.driverNet}</p><p className="mt-1 break-words text-xs font-black text-emerald-700">{formatWalletEtb(trip.netEtb)}</p></div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-halo-soft p-3 text-[9px] text-halo-muted">
          <div><dt className="font-black text-halo-navy">{t.wallet.tripAmount}</dt><dd className="mt-1">{formatWalletEtb(trip.tripAmountEtb)}</dd></div>
          <div><dt className="font-black text-halo-navy">{t.wallet.vehicle}</dt><dd className="mt-1 break-words">{trip.vehicleType ? trip.vehicleType.replaceAll("_", " ") : t.common.none}</dd></div>
          <div><dt className="font-black text-halo-navy">{t.wallet.distance}</dt><dd className="mt-1">{trip.distanceKm === null ? "—" : `${trip.distanceKm.toLocaleString()} km`}</dd></div>
          <div><dt className="font-black text-halo-navy">{t.wallet.cargo}</dt><dd className="mt-1 break-words">{trip.cargoDescription || t.common.none}</dd></div>
          <div><dt className="font-black text-halo-navy">{t.wallet.paymentMethod}</dt><dd className="mt-1">{trip.paymentMethod === "bank_telebirr" ? t.wallet.bankTelebirr : trip.paymentMethod === "cash" ? t.wallet.cash : t.common.none}</dd></div>
          <div><dt className="font-black text-halo-navy">{t.wallet.customerCollections}</dt><dd className="mt-1">{formatWalletEtb(trip.amountCollectedEtb)}</dd></div>
          <div><dt className="font-black text-halo-navy">{t.wallet.accepted}</dt><dd className="mt-1">{trip.acceptedAt ? dateLabel(trip.acceptedAt, language) : "—"}</dd></div>
          <div><dt className="font-black text-halo-navy">{t.wallet.delivered}</dt><dd className="mt-1">{dateLabel(trip.deliveredAt || trip.completedAt, language)}</dd></div>
          <div><dt className="font-black text-halo-navy">{t.wallet.depositUsed}</dt><dd className="mt-1">{formatWalletEtb(trip.depositConsumedEtb)}</dd></div>
        </dl>
      </article>)}
    </section>
  </div>;
}
