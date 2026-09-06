import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatWalletEtb,
  walletResultLabel,
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

type SourceErrors = {
  financial: string | null;
  commission: string | null;
  payments: string | null;
  trips: string | null;
};

const EMPTY_ERRORS: SourceErrors = { financial: null, commission: null, payments: null, trips: null };
const REFRESH_MS = 30_000;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function dateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-ET", {
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

function SourceNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
    <p role="alert" className="min-w-0 flex-1 text-[11px] font-bold leading-5 text-amber-900">{message}</p>
    <button type="button" onClick={onRetry} className="min-h-10 shrink-0 rounded-xl bg-halo-navy px-3 text-[10px] font-black text-white">Retry</button>
  </div>;
}

export function DriverWalletView({ userId }: { userId: string }) {
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
    } else {
      nextErrors.financial = errorMessage(financialResult.reason, "Financial summary fe'uun hin danda'amne.");
    }

    if (commissionResult.status === "fulfilled") {
      setCommission(commissionResult.value);
      confirmedAny = true;
    } else {
      nextErrors.commission = errorMessage(commissionResult.reason, "Commission summary fe'uun hin danda'amne.");
    }

    if (paymentsResult.status === "fulfilled") {
      setPayments(paymentsResult.value);
      confirmedAny = true;
    } else {
      nextErrors.payments = errorMessage(paymentsResult.reason, "Commission payment history fe'uun hin danda'amne.");
    }

    if (tripsResult.status === "fulfilled") {
      setTrips(tripsResult.value);
      confirmedAny = true;
    } else {
      nextErrors.trips = errorMessage(tripsResult.reason, "Seenaa trip fe'uun hin danda'amne.");
    }

    setErrors(nextErrors);
    if (confirmedAny) setLastUpdated(new Date().toISOString());
    setLoading(false);
    setRefreshing(false);
    inFlightRef.current = false;

    if (queuedRefreshRef.current && mountedRef.current) {
      queuedRefreshRef.current = false;
      window.setTimeout(() => void load(true), 0);
    }
  }, [userId]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    const interval = window.setInterval(() => void load(true), REFRESH_MS);
    let unsubscribe: () => void = () => undefined;
    try {
      unsubscribe = subscribeToDriverWallet(userId, () => void load(true));
    } catch (caught) {
      setErrors((current) => ({
        ...current,
        financial: current.financial ?? errorMessage(caught, "Wallet realtime jalqabuun hin danda'amne."),
      }));
    }
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      window.clearInterval(interval);
      unsubscribe();
    };
  }, [load, userId]);

  const initialUnknown = !financial && !commission && !payments && !trips;
  if (loading && initialUnknown) {
    return <div className="grid min-h-[calc(100dvh-137px)] place-items-center bg-halo-canvas px-6 text-center">
      <div><div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-halo-line border-t-halo-blue"/><p className="mt-4 text-sm font-bold text-halo-muted">Wallet kee fe'aa jira…</p></div>
    </div>;
  }

  const available = financial?.availableDepositEtb ?? null;
  const due = financial?.commissionDueEtb ?? commission?.balanceEtb ?? null;
  const blocked = commission?.blocked ?? (due !== null ? due > 0.005 : false);

  return <div className="space-y-5 px-4 pb-7 pt-5 sm:px-6" data-mobile-driver-wallet aria-busy={refreshing}>
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-halo-gold-dark">Driver finance</p><h1 className="mt-1 text-2xl font-black text-halo-navy">Wallet fi galii kee</h1><p className="mt-2 text-xs leading-5 text-halo-muted">Customer collection, deposit, commission fi released earnings walitti hin makamu.</p></div>
      <button type="button" onClick={() => void load(true)} disabled={refreshing} className="min-h-11 shrink-0 rounded-2xl border border-halo-line bg-white px-3 text-[10px] font-black text-halo-blue shadow-halo-card disabled:opacity-60">{refreshing ? "Fe'aa…" : "Refresh"}</button>
    </div>

    <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-halo-blue to-halo-blue-dark p-5 text-white shadow-halo-float">
      <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full border-[25px] border-white/5" />
      <div className="relative"><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-white/60">Deposit fayyadamuuf jiru</p><p className="mt-2 text-3xl font-black tracking-tight">{formatWalletEtb(available)}</p></div><span className={`rounded-full px-3 py-2 text-[9px] font-black ${blocked ? "bg-red-500/20 text-red-100" : "bg-emerald-400/20 text-emerald-100"}`}>{blocked ? "JOB LOCK" : "ACTIVE"}</span></div><p className="mt-4 text-[11px] leading-5 text-white/65">Komishiniin kaffalamuu qabu yoo hafe qofa hojii haaraa fudhachuu dhoorka. Maallaqni customer trip isaatiin walqabatee hafa.</p></div>
    </section>

    {errors.financial && <SourceNotice message={errors.financial} onRetry={() => void load(true)} />}
    <section className="grid grid-cols-2 gap-3" aria-label="Driver financial summary">
      <Metric label="Released gross" value={formatWalletEtb(financial?.grossReleasedEtb ?? null)} help="Trip funds released" />
      <Metric label="Trips xumuraman" value={financial ? financial.completedTrips.toLocaleString() : "—"} help="Database delivered" />
      <Metric label="Deposit galmaa'e" value={formatWalletEtb(financial?.adminDepositEtb ?? null)} help="Admin-confirmed deposit" />
      <Metric label="Commission due" value={formatWalletEtb(due)} help={blocked ? "Hojii haaraa dhoorka" : "Job lock hin jiru"} />
    </section>

    <section className="rounded-[24px] border border-halo-line bg-white p-4 shadow-halo-card">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[0.14em] text-halo-gold-dark">HALLO commission</p><h2 className="mt-1 text-lg font-black text-halo-navy">Komishinii fi kaffaltii</h2></div><span className="rounded-xl bg-halo-soft px-2.5 py-1.5 text-[9px] font-black text-halo-blue">READ ONLY</span></div>
      {errors.commission && <div className="mt-3"><SourceNotice message={errors.commission} onRetry={() => void load(true)} /></div>}
      <div className="mt-4 grid grid-cols-2 gap-3"><Metric label="Charged" value={formatWalletEtb(commission?.chargedEtb ?? financial?.commissionChargedEtb ?? null)} /><Metric label="Approved paid" value={formatWalletEtb(commission?.approvedPaidEtb ?? financial?.commissionPaidEtb ?? null)} /><Metric label="Pending review" value={formatWalletEtb(commission?.pendingEtb ?? null)} /><Metric label="Balance" value={formatWalletEtb(commission?.balanceEtb ?? financial?.commissionDueEtb ?? null)} /></div>
    </section>

    {commission && <DriverCommissionPaymentPanel
      userId={userId}
      balanceEtb={commission.balanceEtb}
      pendingEtb={commission.pendingEtb}
      payments={payments}
      sourceError={errors.payments}
      onRetry={() => void load(true)}
      onSubmitted={async () => { await load(true); }}
    />}

    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[0.14em] text-halo-muted">Recent activity</p><h2 className="mt-1 text-lg font-black text-halo-navy">Trip payment history</h2></div>{lastUpdated && <span className="text-[9px] font-bold text-halo-muted">Updated {dateLabel(lastUpdated)}</span>}</div>
      {errors.trips && <SourceNotice message={errors.trips} onRetry={() => void load(true)} />}
      {trips && trips.length === 0 && <div className="rounded-[22px] border border-dashed border-halo-line bg-white p-6 text-center"><p className="text-sm font-black text-halo-navy">Trip payment history hin jiru</p><p className="mt-2 text-xs leading-5 text-halo-muted">Finish Trip fi payment result galmaa'e booda as irratti mul'ata.</p></div>}
      {trips?.map((trip) => <article key={trip.id} className="rounded-[22px] border border-halo-line bg-white p-4 shadow-halo-card">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[10px] font-black uppercase tracking-[0.12em] text-halo-blue">{trip.trackingId}</p><h3 className="mt-1 break-words text-sm font-black text-halo-navy">{trip.pickupAddress} → {trip.dropoffAddress}</h3></div><span className={`shrink-0 rounded-full px-2.5 py-1.5 text-[9px] font-black ${trip.resultType === "payment_not_received" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>{walletResultLabel(trip.resultType)}</span></div>
        <div className="mt-4 grid grid-cols-3 divide-x divide-halo-line text-center"><div className="px-1"><p className="text-[9px] text-halo-muted">Gross</p><p className="mt-1 break-words text-xs font-black text-halo-navy">{formatWalletEtb(trip.grossEtb)}</p></div><div className="px-1"><p className="text-[9px] text-halo-muted">Commission</p><p className="mt-1 break-words text-xs font-black text-red-700">{formatWalletEtb(trip.commissionEtb)}</p></div><div className="px-1"><p className="text-[9px] text-halo-muted">Driver net</p><p className="mt-1 break-words text-xs font-black text-emerald-700">{formatWalletEtb(trip.netEtb)}</p></div></div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-halo-soft px-3 py-2 text-[9px] text-halo-muted"><span>{dateLabel(trip.completedAt)}</span><span>Deposit used: {formatWalletEtb(trip.depositConsumedEtb)}</span></div>
      </article>)}
    </section>
  </div>;
}
