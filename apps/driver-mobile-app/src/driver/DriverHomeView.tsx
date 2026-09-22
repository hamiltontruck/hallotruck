import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchDriverWorkboard } from "./driver-jobs.service";
import type { DriverWorkboardSnapshot } from "./driver-jobs.model";
import {
  documentProgress,
  identityDocumentKeys,
  vehicleDocumentKeys,
  type DriverProfileRecord,
  type DriverTruckRecord,
  type DriverVerificationRecord,
} from "./driver-profile.model";
import {
  fetchDriverProfile,
  fetchDriverTrucks,
  fetchDriverVerificationFiles,
} from "./driver-profile.service";
import {
  fetchDriverCommissionSummary,
  fetchDriverFinancialSummary,
} from "./driver-wallet.service";
import {
  formatWalletEtb,
  type DriverCommissionSummary,
  type DriverFinancialSummary,
} from "./driver-wallet.model";
import { getDriverV4Copy, type DriverLanguage } from "./driver-v4-i18n";

export type DriverWorkspaceDestination = "home" | "jobs" | "trip" | "wallet" | "profile" | "alerts";

type Snapshot = {
  profile: DriverProfileRecord | null;
  trucks: DriverTruckRecord[] | null;
  documents: DriverVerificationRecord[] | null;
  workboard: DriverWorkboardSnapshot | null;
  financial: DriverFinancialSummary | null;
  commission: DriverCommissionSummary | null;
};

type SourceErrors = Partial<Record<keyof Snapshot, string>>;

const EMPTY: Snapshot = {
  profile: null,
  trucks: null,
  documents: null,
  workboard: null,
  financial: null,
  commission: null,
};

function message(_error: unknown, fallback: string) {
  return fallback;
}

function statusLabel(
  status: DriverProfileRecord["driverStatus"] | undefined,
  language: DriverLanguage,
) {
  const t = getDriverV4Copy(language);
  if (status === "approved") return t.common.approved;
  if (status === "pending") return t.common.pending;
  if (status === "rejected") return t.common.rejected;
  if (status === "suspended") return t.common.suspended;
  return t.common.unavailable;
}

function Metric({ label, value, help }: { label: string; value: string; help?: string }) {
  return <article className="min-w-0 rounded-[20px] border border-halo-line bg-white p-3.5 shadow-halo-card">
    <p className="text-[9px] font-black uppercase tracking-[0.13em] text-halo-muted">{label}</p>
    <p className="mt-2 break-words text-lg font-black text-halo-navy">{value}</p>
    {help && <p className="mt-1 text-[10px] leading-4 text-halo-muted">{help}</p>}
  </article>;
}

function Action({ title, detail, onClick }: { title: string; detail: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="min-h-24 rounded-[22px] border border-halo-line bg-white p-4 text-left shadow-halo-card">
    <strong className="block text-sm text-halo-navy">{title}</strong>
    <span className="mt-2 block text-[10px] leading-4 text-halo-muted">{detail}</span>
  </button>;
}

export function DriverHomeView({
  userId,
  onNavigate,
  onProfileName,
  onOpenSupport,
  language = "om",
}: {
  userId: string;
  onNavigate: (destination: DriverWorkspaceDestination) => void;
  onProfileName?: (name: string) => void;
  onOpenSupport: () => void;
  language?: DriverLanguage;
}) {
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [errors, setErrors] = useState<SourceErrors>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const t = getDriverV4Copy(language);

  const load = useCallback(async (silent = false) => {
    const requestId = ++requestIdRef.current;
    if (silent) setRefreshing(true);
    else setLoading(true);

    const results = await Promise.allSettled([
      fetchDriverProfile(userId),
      fetchDriverTrucks(userId),
      fetchDriverVerificationFiles(userId),
      fetchDriverWorkboard(userId),
      fetchDriverFinancialSummary(userId),
      fetchDriverCommissionSummary(userId),
    ]);
    if (!mountedRef.current || requestId !== requestIdRef.current) return;

    const nextErrors: SourceErrors = {};
    const [profile, trucks, documents, workboard, financial, commission] = results;
    setSnapshot((currentSnapshot) => {
      const next = { ...currentSnapshot };
      if (profile.status === "fulfilled") {
        next.profile = profile.value;
        onProfileName?.(profile.value.fullName);
      } else nextErrors.profile = message(profile.reason, t.home.profileUnavailable);
      if (trucks.status === "fulfilled") next.trucks = trucks.value;
      else nextErrors.trucks = message(trucks.reason, t.home.truckUnavailable);
      if (documents.status === "fulfilled") next.documents = documents.value;
      else nextErrors.documents = message(documents.reason, t.home.documentsUnavailable);
      if (workboard.status === "fulfilled") next.workboard = workboard.value;
      else nextErrors.workboard = message(workboard.reason, t.home.workboardUnavailable);
      if (financial.status === "fulfilled") next.financial = financial.value;
      else nextErrors.financial = message(financial.reason, t.home.financeUnavailable);
      if (commission.status === "fulfilled") next.commission = commission.value;
      else nextErrors.commission = message(commission.reason, t.home.commissionUnavailable);
      return next;
    });
    setErrors(nextErrors);
    setLoading(false);
    setRefreshing(false);
  }, [
    onProfileName,
    t.home.commissionUnavailable,
    t.home.documentsUnavailable,
    t.home.financeUnavailable,
    t.home.profileUnavailable,
    t.home.truckUnavailable,
    t.home.workboardUnavailable,
    userId,
  ]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    const interval = window.setInterval(() => void load(true), 30_000);
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      window.clearInterval(interval);
    };
  }, [load]);

  const truck = snapshot.trucks?.[0] ?? null;
  const progress = useMemo(() => {
    if (!snapshot.documents) return null;
    const identity = documentProgress(identityDocumentKeys, snapshot.documents, null);
    const vehicle = truck
      ? documentProgress(vehicleDocumentKeys, snapshot.documents, truck.id)
      : { verified: 0, submitted: 0, total: vehicleDocumentKeys.length };
    return {
      submitted: identity.submitted + vehicle.submitted,
      verified: identity.verified + vehicle.verified,
      total: identity.total + vehicle.total,
    };
  }, [snapshot.documents, truck]);

  const rejectedDocuments = snapshot.documents?.filter((document) => document.status === "rejected").length ?? null;
  const driverName = snapshot.profile?.fullName ?? "Driver";
  const firstName = driverName.trim().split(/\s+/)[0] || "Driver";
  const activeTrip = snapshot.workboard?.activeTrip ?? null;
  const jobsCount = snapshot.workboard ? snapshot.workboard.availableJobs.length : null;
  const due = snapshot.financial?.commissionDueEtb ?? snapshot.commission?.balanceEtb ?? null;
  const blocked = snapshot.commission?.blocked ?? null;
  const hasAnyError = Object.keys(errors).length > 0;

  if (loading && Object.values(snapshot).every((value) => value === null)) {
    return <main className="grid min-h-[calc(100dvh-137px)] place-items-center bg-halo-canvas px-6 text-center">
      <div><div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-halo-line border-t-halo-blue"/><p className="mt-4 text-sm font-bold text-halo-muted">{t.common.loading}</p></div>
    </main>;
  }

  return <main className="min-h-[calc(100dvh-137px)] bg-halo-canvas px-4 pb-8 pt-5 sm:px-6" data-mobile-driver-home aria-busy={refreshing}>
    <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-halo-blue to-halo-blue-dark p-5 text-white shadow-halo-float">
      <div className="absolute -right-12 -top-14 h-40 w-40 rounded-full border-[28px] border-white/5" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[.18em] text-halo-gold">HALLO DRIVER</p>
          <h1 className="mt-2 break-words text-2xl font-black">{t.home.welcome}, {firstName}</h1>
          <p className="mt-2 text-xs leading-5 text-white/70">{t.home.description}</p>
        </div>
        <span className="shrink-0 rounded-full bg-white/10 px-3 py-2 text-[9px] font-black">{statusLabel(snapshot.profile?.driverStatus, language)}</span>
      </div>
      <div className="relative mt-5 grid grid-cols-2 gap-3">
        <button type="button" onClick={() => onNavigate(activeTrip ? "trip" : "jobs")} className="min-h-20 rounded-2xl bg-white/10 p-3 text-left">
          <span className="text-[9px] font-bold text-white/55">{t.home.current}</span>
          <strong className="mt-1 block break-words text-sm">
            {activeTrip ? activeTrip.trackingId : jobsCount === null ? t.common.unavailable : `${jobsCount} · ${t.home.availableJobs}`}
          </strong>
        </button>
        <button type="button" onClick={() => onNavigate("profile")} className="min-h-20 rounded-2xl bg-white/10 p-3 text-left">
          <span className="text-[9px] font-bold text-white/55">{t.home.documents}</span>
          <strong className="mt-1 block text-sm">{progress ? `${progress.submitted}/${progress.total} ${t.common.submitted}` : t.common.unavailable}</strong>
          {progress && <span className="mt-1 block text-[9px] text-white/55">{progress.verified}/{progress.total} {t.common.verified}</span>}
        </button>
      </div>
    </section>

    {hasAnyError && <section role="status" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3">
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-[11px] font-bold leading-5 text-amber-900">{Object.values(errors).filter(Boolean).join(" · ")}</p>
        <button type="button" onClick={() => void load(true)} className="min-h-10 shrink-0 rounded-xl bg-halo-navy px-3 text-[10px] font-black text-white">{t.common.retry}</button>
      </div>
    </section>}

    <section className="mt-4 grid grid-cols-2 gap-3" aria-label={t.home.current}>
      <Metric label={t.home.availableJobs} value={jobsCount === null ? "—" : String(jobsCount)} help={activeTrip ? t.home.lockedWhileTrip : t.home.authorizedMarketplace} />
      <Metric label={t.home.assignedTruck} value={truck?.plateNumber ?? (snapshot.trucks ? t.common.none : "—")} help={truck?.vehicleType ?? undefined} />
      <Metric label={t.home.releasedGross} value={formatWalletEtb(snapshot.financial?.grossReleasedEtb ?? null)} help={t.home.releasedFunds} />
      <Metric label={t.home.commissionDue} value={formatWalletEtb(due)} help={blocked === null ? t.home.accessUnavailable : blocked ? t.home.jobAccessBlocked : t.home.jobAccessActive} />
      <Metric label={t.home.availableDeposit} value={formatWalletEtb(snapshot.financial?.availableDepositEtb ?? null)} help={t.home.depositBalance} />
      <Metric label={t.home.rating} value={snapshot.profile?.ratingAvg === null || snapshot.profile?.ratingAvg === undefined ? "—" : snapshot.profile.ratingAvg.toFixed(1)} help={t.home.profileRating} />
    </section>

    <section className="mt-5 rounded-[24px] border border-halo-line bg-white p-4 shadow-halo-card">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[9px] font-black uppercase tracking-[0.14em] text-halo-gold-dark">{t.home.alerts}</p><h2 className="mt-1 text-lg font-black text-halo-navy">{t.home.attention}</h2></div>
        <button type="button" onClick={() => onNavigate("alerts")} className="min-h-10 rounded-xl bg-halo-soft px-3 text-[10px] font-black text-halo-blue">{t.home.notifications}</button>
      </div>
      <div className="mt-4 space-y-2 text-xs leading-5 text-halo-muted">
        {activeTrip && <p className="rounded-xl bg-emerald-50 px-3 py-2 font-bold text-emerald-800">{activeTrip.trackingId} · {t.home.activeTripAttention}</p>}
        {blocked === true && <p className="rounded-xl bg-red-50 px-3 py-2 font-bold text-red-700">{t.home.commissionBlocked}</p>}
        {rejectedDocuments !== null && rejectedDocuments > 0 && <p className="rounded-xl bg-red-50 px-3 py-2 font-bold text-red-700">{rejectedDocuments} · {t.home.rejectedDocuments}</p>}
        {progress && progress.submitted < progress.total && <p className="rounded-xl bg-amber-50 px-3 py-2 font-bold text-amber-800">{progress.submitted}/{progress.total} · {t.home.requiredDocuments}</p>}
        {!activeTrip && blocked !== true && (!progress || progress.submitted === progress.total) && rejectedDocuments === 0 && <p>{t.home.noUrgentAlert}</p>}
      </div>
    </section>

    <section className="mt-5">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div><p className="text-[9px] font-black uppercase tracking-[0.14em] text-halo-muted">{t.home.quick}</p><h2 className="mt-1 text-lg font-black text-halo-navy">{t.home.workspace}</h2></div>
        <button type="button" onClick={() => void load(true)} disabled={refreshing} className="min-h-10 rounded-xl border border-halo-line bg-white px-3 text-[10px] font-black text-halo-blue disabled:opacity-60">{refreshing ? t.common.refreshing : t.common.refresh}</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Action title={t.home.jobs} detail={t.home.jobsDetail} onClick={() => onNavigate("jobs")} />
        <Action title={t.home.activeTrip} detail={t.home.tripDetail} onClick={() => onNavigate("trip")} />
        <Action title={t.home.history} detail={t.home.historyDetail} onClick={() => onNavigate("wallet")} />
        <Action title={t.home.docs} detail={t.home.docsDetail} onClick={() => onNavigate("profile")} />
        <Action title={t.home.notifications} detail={t.home.alerts} onClick={() => onNavigate("alerts")} />
        <Action title={t.home.support} detail={t.home.supportDetail} onClick={onOpenSupport} />
      </div>
    </section>
  </main>;
}
