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

function message(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function statusLabel(status: DriverProfileRecord["driverStatus"] | undefined) {
  if (status === "approved") return "APPROVED";
  if (status === "pending") return "PENDING";
  if (status === "rejected") return "REJECTED";
  if (status === "suspended") return "SUSPENDED";
  return "UNAVAILABLE";
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
  language?: "om" | "en" | "am";
}) {
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [errors, setErrors] = useState<SourceErrors>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const copy = language === "en" ? {
    welcome: "Welcome", description: "Jobs, trip, documents and finance below come from your signed-in Driver account.",
    current: "Current operation", documents: "Documents", availableJobs: "Available jobs", assignedTruck: "Assigned truck",
    releasedGross: "Released gross", commissionDue: "Commission due", availableDeposit: "Available deposit", rating: "Rating",
    alerts: "Important alerts", attention: "Operational attention", notifications: "Notifications", quick: "Quick actions",
    workspace: "Driver workspace", refreshing: "Refreshing…", refresh: "Refresh", jobs: "Jobs",
    jobsDetail: "Available loads and truck selection", activeTrip: "Active Trip", tripDetail: "GPS, route, payment and delivery",
    history: "Trip History / Wallet", historyDetail: "Completed trips, deposit and commission", docs: "Documents",
    docsDetail: "Verification documents", support: "HALLO Support", supportDetail: "Secure Operations chat",
  } : language === "am" ? {
    welcome: "እንኳን ደህና መጡ", description: "ስራዎች፣ ጉዞ፣ ሰነዶች እና ፋይናንስ ከDriver መለያዎ ይመጣሉ።",
    current: "የአሁኑ ስራ", documents: "ሰነዶች", availableJobs: "የሚገኙ ስራዎች", assignedTruck: "የተመደበ መኪና",
    releasedGross: "የተለቀቀ ገቢ", commissionDue: "የሚከፈል ኮሚሽን", availableDeposit: "የሚገኝ ዲፖዚት", rating: "ደረጃ",
    alerts: "አስፈላጊ ማሳወቂያዎች", attention: "የስራ ትኩረት", notifications: "ማሳወቂያዎች", quick: "ፈጣን እርምጃዎች",
    workspace: "Driver workspace", refreshing: "በማደስ ላይ…", refresh: "አድስ", jobs: "ስራዎች",
    jobsDetail: "የሚገኙ ጭነቶች እና መኪና", activeTrip: "ንቁ ጉዞ", tripDetail: "GPS፣ መንገድ፣ ክፍያ እና ማድረስ",
    history: "የጉዞ ታሪክ / Wallet", historyDetail: "የተጠናቀቁ ጉዞዎች፣ ዲፖዚት እና ኮሚሽን", docs: "ሰነዶች",
    docsDetail: "የማረጋገጫ ሰነዶች", support: "HALLO Support", supportDetail: "ደህንነቱ የተጠበቀ Operations chat",
  } : {
    welcome: "Baga nagaan dhuftan", description: "Hojii, imala, dokumentii fi faayinaansi akkaawuntii Driver kee irraa dhufu.",
    current: "Hojii ammaa", documents: "Dokumentii", availableJobs: "Hojii jiran", assignedTruck: "Truck ramadame",
    releasedGross: "Galii gadhiifame", commissionDue: "Komishinii hafee", availableDeposit: "Deposit jiru", rating: "Sadarkaa",
    alerts: "Beeksisa barbaachisaa", attention: "Xiyyeeffannoo hojii", notifications: "Beeksisa", quick: "Tarkaanfii saffisaa",
    workspace: "Driver workspace", refreshing: "Haaromsaa…", refresh: "Haaromsi", jobs: "Hojii",
    jobsDetail: "Fe'umsa jiran fi truck filannoo", activeTrip: "Imala hojii irra jiru", tripDetail: "GPS, route, payment fi delivery",
    history: "Seenaa Imalaa / Wallet", historyDetail: "Imala xumurame, deposit fi komishinii", docs: "Dokumentii",
    docsDetail: "Dokumentii mirkaneessaa", support: "HALLO Support", supportDetail: "Operations chat nageenya qabu",
  };

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
    setSnapshot((current) => {
      const next = { ...current };
      if (profile.status === "fulfilled") {
        next.profile = profile.value;
        onProfileName?.(profile.value.fullName);
      } else nextErrors.profile = message(profile.reason, "Driver profile is unavailable.");
      if (trucks.status === "fulfilled") next.trucks = trucks.value;
      else nextErrors.trucks = message(trucks.reason, "Assigned vehicle is unavailable.");
      if (documents.status === "fulfilled") next.documents = documents.value;
      else nextErrors.documents = message(documents.reason, "Document status is unavailable.");
      if (workboard.status === "fulfilled") next.workboard = workboard.value;
      else nextErrors.workboard = message(workboard.reason, "Jobs and active trip are unavailable.");
      if (financial.status === "fulfilled") next.financial = financial.value;
      else nextErrors.financial = message(financial.reason, "Driver financial summary is unavailable.");
      if (commission.status === "fulfilled") next.commission = commission.value;
      else nextErrors.commission = message(commission.reason, "Commission summary is unavailable.");
      return next;
    });
    setErrors(nextErrors);
    setLoading(false);
    setRefreshing(false);
  }, [onProfileName, userId]);

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
      <div><div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-halo-line border-t-halo-blue"/><p className="mt-4 text-sm font-bold text-halo-muted">Driver dashboard loading…</p></div>
    </main>;
  }

  return <main className="min-h-[calc(100dvh-137px)] bg-halo-canvas px-4 pb-8 pt-5 sm:px-6" data-mobile-driver-home aria-busy={refreshing}>
    <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-halo-blue to-halo-blue-dark p-5 text-white shadow-halo-float">
      <div className="absolute -right-12 -top-14 h-40 w-40 rounded-full border-[28px] border-white/5" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[.18em] text-halo-gold">HALLO DRIVER</p>
          <h1 className="mt-2 break-words text-2xl font-black">{copy.welcome}, {firstName}</h1>
          <p className="mt-2 text-xs leading-5 text-white/70">{copy.description}</p>
        </div>
        <span className="shrink-0 rounded-full bg-white/10 px-3 py-2 text-[9px] font-black">{statusLabel(snapshot.profile?.driverStatus)}</span>
      </div>
      <div className="relative mt-5 grid grid-cols-2 gap-3">
        <button type="button" onClick={() => onNavigate(activeTrip ? "trip" : "jobs")} className="min-h-20 rounded-2xl bg-white/10 p-3 text-left">
          <span className="text-[9px] font-bold text-white/55">{copy.current}</span>
          <strong className="mt-1 block break-words text-sm">{activeTrip ? activeTrip.trackingId : jobsCount === null ? "Unavailable" : `${jobsCount} available job${jobsCount === 1 ? "" : "s"}`}</strong>
        </button>
        <button type="button" onClick={() => onNavigate("profile")} className="min-h-20 rounded-2xl bg-white/10 p-3 text-left">
          <span className="text-[9px] font-bold text-white/55">{copy.documents}</span>
          <strong className="mt-1 block text-sm">{progress ? `${progress.submitted}/${progress.total} submitted` : "Unavailable"}</strong>
          {progress && <span className="mt-1 block text-[9px] text-white/55">{progress.verified}/{progress.total} verified</span>}
        </button>
      </div>
    </section>

    {hasAnyError && <section role="status" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3">
      <div className="flex items-center gap-3"><p className="min-w-0 flex-1 text-[11px] font-bold leading-5 text-amber-900">Some dashboard sources are unavailable. Confirmed sources remain visible; unavailable values are not replaced with zero.</p><button type="button" onClick={() => void load(true)} className="min-h-10 shrink-0 rounded-xl bg-halo-navy px-3 text-[10px] font-black text-white">Retry</button></div>
    </section>}

    <section className="mt-4 grid grid-cols-2 gap-3" aria-label="Driver operational summary">
      <Metric label={copy.availableJobs} value={jobsCount === null ? "—" : String(jobsCount)} help={activeTrip ? "Locked while trip is active" : "Authorized marketplace"} />
      <Metric label={copy.assignedTruck} value={truck?.plateNumber ?? (snapshot.trucks ? "None" : "—")} help={truck?.vehicleType ?? undefined} />
      <Metric label={copy.releasedGross} value={formatWalletEtb(snapshot.financial?.grossReleasedEtb ?? null)} help="Authoritative released trip funds" />
      <Metric label={copy.commissionDue} value={formatWalletEtb(due)} help={blocked === null ? "Access state unavailable" : blocked ? "Job access blocked" : "Job access active"} />
      <Metric label={copy.availableDeposit} value={formatWalletEtb(snapshot.financial?.availableDepositEtb ?? null)} help="Authoritative deposit balance" />
      <Metric label={copy.rating} value={snapshot.profile?.ratingAvg === null || snapshot.profile?.ratingAvg === undefined ? "—" : snapshot.profile.ratingAvg.toFixed(1)} help="Driver profile rating" />
    </section>

    <section className="mt-5 rounded-[24px] border border-halo-line bg-white p-4 shadow-halo-card">
      <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[0.14em] text-halo-gold-dark">{copy.alerts}</p><h2 className="mt-1 text-lg font-black text-halo-navy">{copy.attention}</h2></div><button type="button" onClick={() => onNavigate("alerts")} className="min-h-10 rounded-xl bg-halo-soft px-3 text-[10px] font-black text-halo-blue">{copy.notifications}</button></div>
      <div className="mt-4 space-y-2 text-xs leading-5 text-halo-muted">
        {activeTrip && <p className="rounded-xl bg-emerald-50 px-3 py-2 font-bold text-emerald-800">Active trip {activeTrip.trackingId} needs operational attention.</p>}
        {blocked === true && <p className="rounded-xl bg-red-50 px-3 py-2 font-bold text-red-700">Commission status currently blocks new job access.</p>}
        {rejectedDocuments !== null && rejectedDocuments > 0 && <p className="rounded-xl bg-red-50 px-3 py-2 font-bold text-red-700">{rejectedDocuments} required document{rejectedDocuments === 1 ? " is" : "s are"} rejected and can be resubmitted.</p>}
        {progress && progress.submitted < progress.total && <p className="rounded-xl bg-amber-50 px-3 py-2 font-bold text-amber-800">Required documents: {progress.submitted}/{progress.total} submitted.</p>}
        {!activeTrip && blocked !== true && (!progress || progress.submitted === progress.total) && rejectedDocuments === 0 && <p>No urgent local alert was found in the confirmed dashboard sources.</p>}
      </div>
    </section>

    <section className="mt-5">
      <div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[0.14em] text-halo-muted">{copy.quick}</p><h2 className="mt-1 text-lg font-black text-halo-navy">{copy.workspace}</h2></div><button type="button" onClick={() => void load(true)} disabled={refreshing} className="min-h-10 rounded-xl border border-halo-line bg-white px-3 text-[10px] font-black text-halo-blue disabled:opacity-60">{refreshing ? copy.refreshing : copy.refresh}</button></div>
      <div className="grid grid-cols-2 gap-3">
        <Action title={copy.jobs} detail={copy.jobsDetail} onClick={() => onNavigate("jobs")} />
        <Action title={copy.activeTrip} detail={copy.tripDetail} onClick={() => onNavigate("trip")} />
        <Action title={copy.history} detail={copy.historyDetail} onClick={() => onNavigate("wallet")} />
        <Action title={copy.docs} detail={copy.docsDetail} onClick={() => onNavigate("profile")} />
        <Action title={copy.notifications} detail={copy.alerts} onClick={() => onNavigate("alerts")} />
        <Action title={copy.support} detail={copy.supportDetail} onClick={onOpenSupport} />
      </div>
    </section>
  </main>;
}
