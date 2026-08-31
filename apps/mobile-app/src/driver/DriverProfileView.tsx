import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  documentHealth,
  documentProgress,
  formatCapacityTons,
  formatVehicleType,
  identityDocumentKeys,
  vehicleDocumentKeys,
  type DocumentHealth,
  type DriverProfileRecord,
  type DriverTruckRecord,
  type DriverVerificationRecord,
  type VerificationDocumentKey,
} from "./driver-profile.model";
import {
  fetchDriverProfile,
  fetchDriverTrucks,
  fetchDriverVerificationFiles,
  subscribeToDriverProfile,
} from "./driver-profile.service";

const PROFILE_REFRESH_MS = 30_000;

const documentLabels: Record<VerificationDocumentKey, string> = {
  driver_photo: "Suuraa Driver",
  license_front: "Hayyama konkolaachisummaa — fuuldura",
  license_back: "Hayyama konkolaachisummaa — duuba",
  national_id_front: "Fayda / ID — fuuldura",
  national_id_back: "Fayda / ID — duuba",
  vehicle_registration: "Galmee konkolaataa",
  insurance: "Inshuraansii",
  transport_permit: "Hayyama geejjibaa",
  truck_front: "Suuraa konkolaataa — fuuldura",
  truck_back: "Suuraa konkolaataa — duuba",
  truck_side: "Suuraa konkolaataa — cinaa",
  truck_loading_area: "Bakka fe'umsaa",
};

const healthCopy: Record<DocumentHealth, { label: string; className: string }> = {
  missing: { label: "Hin galmoofne", className: "bg-slate-100 text-slate-600" },
  pending: { label: "Eeggachaa jira", className: "bg-amber-50 text-amber-800" },
  verified: { label: "Mirkanaa'e", className: "bg-emerald-50 text-emerald-700" },
  rejected: { label: "Deebi'e", className: "bg-red-50 text-red-700" },
  expired: { label: "Yeroon darbe", className: "bg-red-50 text-red-700" },
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}

function statusCopy(status: DriverProfileRecord["driverStatus"]) {
  if (status === "approved") return { label: "APPROVED", detail: "Driver account hojii fudhachuuf eeyyamameera.", className: "bg-emerald-50 text-emerald-700" };
  if (status === "pending") return { label: "PENDING", detail: "Admin/CEO verification eeggachaa jira.", className: "bg-amber-50 text-amber-800" };
  if (status === "rejected") return { label: "REJECTED", detail: "Driver profile deebi'eera; dokumentii fi odeeffannoo sirreessi.", className: "bg-red-50 text-red-700" };
  return { label: "SUSPENDED", detail: "Driver account yeroo ammaa hojii fudhachuu hin danda'u.", className: "bg-red-50 text-red-700" };
}

function ProgressCard({ title, verified, submitted, total }: { title: string; verified: number; submitted: number; total: number }) {
  const percent = total > 0 ? Math.round((verified / total) * 100) : 0;
  return <div className="rounded-[22px] border border-halo-line bg-white p-4 shadow-halo-card">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-halo-muted">{title}</p><p className="mt-2 text-xl font-black text-halo-navy">{verified}/{total} verified</p></div><span className="rounded-xl bg-halo-soft px-3 py-2 text-xs font-black text-halo-blue">{percent}%</span></div>
    <div className="mt-4 h-2 overflow-hidden rounded-full bg-halo-line"><div className="h-full rounded-full bg-halo-blue transition-all" style={{ width: `${percent}%` }} /></div>
    <p className="mt-2 text-[10px] text-halo-muted">Submitted: {submitted}/{total}</p>
  </div>;
}

function SourceError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-3"><p className="min-w-0 flex-1 text-xs font-bold leading-5 text-red-700">{message}</p><button type="button" onClick={onRetry} className="min-h-10 shrink-0 rounded-xl bg-white px-3 text-[10px] font-black text-red-700 shadow-sm">Retry</button></div>;
}

function DocumentRow({
  documentKey,
  record,
}: {
  documentKey: VerificationDocumentKey;
  record: DriverVerificationRecord | undefined;
}) {
  const health = documentHealth(record);
  const copy = healthCopy[health];
  return <article className="border-t border-halo-line px-4 py-3 first:border-t-0">
    <div className="flex items-start gap-3"><span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-black ${copy.className}`}>{health === "verified" ? "✓" : health === "rejected" || health === "expired" ? "!" : "•"}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><p className="text-sm font-extrabold leading-5 text-halo-navy">{documentLabels[documentKey]}</p><span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${copy.className}`}>{copy.label}</span></div>{record?.expiryDate && <p className="mt-1 text-[10px] text-halo-muted">Expiry: {formatDate(record.expiryDate)}</p>}{record?.rejectionReason && <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-[10px] font-bold leading-4 text-red-700">Sababa: {record.rejectionReason}</p>}{!record && <p className="mt-1 text-[10px] text-halo-muted">Document kana mobile profile irratti hin argamne.</p>}</div></div>
  </article>;
}

function TruckCard({ truck, selected, onSelect }: { truck: DriverTruckRecord; selected: boolean; onSelect: () => void }) {
  return <button type="button" onClick={onSelect} aria-pressed={selected} className={`min-w-[230px] rounded-[22px] border p-4 text-left shadow-halo-card transition ${selected ? "border-halo-blue bg-halo-soft" : "border-halo-line bg-white"}`}>
    <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-halo-muted">Plate</p><p className="mt-1 text-lg font-black text-halo-navy">{truck.plateNumber}</p></div><span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${selected ? "bg-halo-blue text-white" : "bg-slate-100 text-slate-600"}`}>{truck.status?.replace(/_/g, " ").toUpperCase() || "STATUS —"}</span></div>
    <div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><p className="text-[9px] font-bold uppercase tracking-wider text-halo-muted">Type</p><p className="mt-1 font-extrabold text-halo-navy">{formatVehicleType(truck.vehicleType)}</p></div><div><p className="text-[9px] font-bold uppercase tracking-wider text-halo-muted">Capacity</p><p className="mt-1 font-extrabold text-halo-navy">{formatCapacityTons(truck.capacityTons)}</p></div></div>
  </button>;
}

export function DriverProfileView({ userId, fallbackName }: { userId: string; fallbackName: string }) {
  const mountedRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const queuedRefreshRef = useRef(false);
  const requestIdRef = useRef(0);
  const [profile, setProfile] = useState<DriverProfileRecord | null>(null);
  const [trucks, setTrucks] = useState<DriverTruckRecord[]>([]);
  const [documents, setDocuments] = useState<DriverVerificationRecord[]>([]);
  const [profileConfirmed, setProfileConfirmed] = useState(false);
  const [trucksConfirmed, setTrucksConfirmed] = useState(false);
  const [documentsConfirmed, setDocumentsConfirmed] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [trucksError, setTrucksError] = useState<string | null>(null);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current) {
      queuedRefreshRef.current = true;
      return;
    }
    refreshInFlightRef.current = true;
    const requestId = ++requestIdRef.current;
    if (!profileConfirmed && !trucksConfirmed && !documentsConfirmed) setLoading(true);

    const [profileResult, trucksResult, documentsResult] = await Promise.allSettled([
      fetchDriverProfile(userId),
      fetchDriverTrucks(userId),
      fetchDriverVerificationFiles(userId),
    ]);

    if (!mountedRef.current || requestId !== requestIdRef.current) {
      refreshInFlightRef.current = false;
      return;
    }

    if (profileResult.status === "fulfilled") {
      setProfile(profileResult.value);
      setProfileConfirmed(true);
      setProfileError(null);
    } else {
      setProfileError(errorMessage(profileResult.reason, "Driver profile fe'uun hin danda'amne."));
    }

    if (trucksResult.status === "fulfilled") {
      setTrucks(trucksResult.value);
      setTrucksConfirmed(true);
      setTrucksError(null);
      setSelectedTruckId((current) => current && trucksResult.value.some((truck) => truck.id === current)
        ? current
        : trucksResult.value[0]?.id ?? null);
    } else {
      setTrucksError(errorMessage(trucksResult.reason, "Konkolaataa Driver fe'uun hin danda'amne."));
    }

    if (documentsResult.status === "fulfilled") {
      setDocuments(documentsResult.value);
      setDocumentsConfirmed(true);
      setDocumentsError(null);
    } else {
      setDocumentsError(errorMessage(documentsResult.reason, "Document status fe'uun hin danda'amne."));
    }

    setLoading(false);
    refreshInFlightRef.current = false;
    if (queuedRefreshRef.current && mountedRef.current) {
      queuedRefreshRef.current = false;
      window.setTimeout(() => void refresh(), 0);
    }
  }, [documentsConfirmed, profileConfirmed, trucksConfirmed, userId]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    const interval = window.setInterval(() => void refresh(), PROFILE_REFRESH_MS);
    let unsubscribe: () => void = () => undefined;
    try {
      unsubscribe = subscribeToDriverProfile(userId, () => void refresh());
    } catch (caught) {
      setProfileError(errorMessage(caught, "Profile realtime jalqabuun hin danda'amne."));
    }
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      window.clearInterval(interval);
      unsubscribe();
    };
  }, [refresh, userId]);

  const selectedTruck = useMemo(
    () => trucks.find((truck) => truck.id === selectedTruckId) ?? trucks[0] ?? null,
    [selectedTruckId, trucks],
  );
  const identityProgress = useMemo(
    () => documentProgress(identityDocumentKeys, documents, null),
    [documents],
  );
  const vehicleProgress = useMemo(
    () => selectedTruck ? documentProgress(vehicleDocumentKeys, documents, selectedTruck.id) : { verified: 0, submitted: 0, total: vehicleDocumentKeys.length },
    [documents, selectedTruck],
  );
  const profileStatus = profile ? statusCopy(profile.driverStatus) : null;
  const initials = (profile?.fullName || fallbackName).trim().split(/\s+/).slice(0, 2).map((part) => part.slice(0, 1).toUpperCase()).join("") || "D";

  if (loading && !profileConfirmed && !trucksConfirmed && !documentsConfirmed) {
    return <div className="grid min-h-[calc(100dvh-137px)] place-items-center bg-halo-canvas px-6 text-center"><div><div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-halo-line border-t-halo-blue"/><p className="mt-4 text-sm font-bold text-halo-muted">Driver profile fe'aa jira…</p></div></div>;
  }

  return <div className="space-y-5 px-4 pb-8 pt-5 sm:px-6" data-mobile-driver-profile>
    <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-halo-gold-dark">Driver profile</p><h1 className="mt-1 text-2xl font-black text-halo-navy">Eenyummaa fi compliance</h1><p className="mt-2 text-xs leading-5 text-halo-muted">Odeeffannoo database fi Admin/CEO verification status yeroo dhugaa ilaali.</p></div>

    {profileError && <SourceError message={profileError} onRetry={() => void refresh()} />}
    <section className="rounded-[28px] border border-halo-line bg-white p-4 shadow-halo-card">
      <div className="flex items-start gap-4"><span className="grid h-16 w-16 shrink-0 place-items-center rounded-[22px] bg-halo-blue text-lg font-black text-white">{initials}</span><div className="min-w-0 flex-1"><h2 className="break-words text-xl font-black text-halo-navy">{profile?.fullName || fallbackName}</h2><p className="mt-1 break-all text-xs text-halo-muted">{profile?.phone || "Phone —"}</p>{profileStatus && <><span className={`mt-3 inline-flex rounded-full px-3 py-1.5 text-[9px] font-black ${profileStatus.className}`}>{profileStatus.label}</span><p className="mt-2 text-[10px] leading-4 text-halo-muted">{profileStatus.detail}</p></>}</div>{profile?.ratingAvg !== null && profile?.ratingAvg !== undefined && <span className="shrink-0 rounded-xl bg-halo-gold-soft px-3 py-2 text-xs font-black text-halo-gold-dark">{profile.ratingAvg.toFixed(1)} ★</span>}</div>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-halo-line pt-4 text-xs"><div><p className="text-[9px] font-black uppercase tracking-wider text-halo-muted">Preferred vehicle</p><p className="mt-1 font-extrabold text-halo-navy">{formatVehicleType(profile?.vehicleType ?? null)}</p></div><div><p className="text-[9px] font-black uppercase tracking-wider text-halo-muted">Member since</p><p className="mt-1 font-extrabold text-halo-navy">{formatDate(profile?.createdAt ?? null)}</p></div></div>
    </section>

    <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2"><ProgressCard title="Driver documents" {...identityProgress} /><ProgressCard title="Vehicle documents" {...vehicleProgress} /></div>

    <section className="space-y-3"><div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-halo-gold-dark">Fleet</p><h2 className="mt-1 text-xl font-black text-halo-navy">Konkolaataa kee</h2></div><span className="text-xs font-bold text-halo-muted">{trucks.length} total</span></div>{trucksError && <SourceError message={trucksError} onRetry={() => void refresh()} />}{trucksConfirmed && trucks.length === 0 ? <div className="rounded-[22px] border border-dashed border-halo-line bg-white p-5 text-center"><p className="text-sm font-black text-halo-navy">Konkolaataan assign hin taane</p><p className="mt-2 text-xs leading-5 text-halo-muted">Admin/CEO irraa vehicle assignment ykn onboarding completion barbaachisa.</p></div> : <div className="flex snap-x gap-3 overflow-x-auto pb-2">{trucks.map((truck) => <TruckCard key={truck.id} truck={truck} selected={selectedTruck?.id === truck.id} onSelect={() => setSelectedTruckId(truck.id)} />)}</div>}</section>

    <section className="overflow-hidden rounded-[24px] border border-halo-line bg-white shadow-halo-card"><div className="px-4 py-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-halo-gold-dark">Identity checklist</p><h2 className="mt-1 text-lg font-black text-halo-navy">Driver documents</h2></div>{documentsError && <div className="px-4 pb-4"><SourceError message={documentsError} onRetry={() => void refresh()} /></div>}{identityDocumentKeys.map((key) => <DocumentRow key={key} documentKey={key} record={documents.find((record) => record.documentKey === key && record.truckId === null)} />)}</section>

    <section className="overflow-hidden rounded-[24px] border border-halo-line bg-white shadow-halo-card"><div className="px-4 py-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-halo-gold-dark">Vehicle checklist</p><h2 className="mt-1 text-lg font-black text-halo-navy">{selectedTruck ? selectedTruck.plateNumber : "Konkolaataa hin filatamne"}</h2><p className="mt-1 text-[10px] text-halo-muted">Vehicle tokko filachuun document status isaa ilaali.</p></div>{vehicleDocumentKeys.map((key) => <DocumentRow key={key} documentKey={key} record={selectedTruck ? documents.find((record) => record.documentKey === key && record.truckId === selectedTruck.id) : undefined} />)}</section>

    <div className="rounded-2xl bg-halo-gold-soft p-4 text-xs leading-5 text-halo-gold-dark"><strong>Read-only profile:</strong> Mobile page kun status database keessaa qofa agarsiisa. Document upload/replacement fi Admin review hojii itti aanu keessatti adda hojjatama.</div>
  </div>;
}
