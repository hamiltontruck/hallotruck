import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DRIVER_VEHICLE_TYPES } from "../../../../src/domain/driver-vehicle-types";
import { DriverDocumentPreviewSheet } from "./DriverDocumentPreviewSheet";
import { DriverDocumentUploadSheet } from "./DriverDocumentUploadSheet";
import {
  documentExpirySummary,
  documentExpiryWarning,
  documentHealth,
  documentProgress,
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
  fetchDriverRatingSummary,
  fetchDriverTrucks,
  fetchDriverVerificationFiles,
  saveDriverContactProfile,
  saveDriverVehicleProfile,
  subscribeToDriverProfile,
  type DriverRatingSummary,
} from "./driver-profile.service";
import { getDriverV4Copy, type DriverLanguage } from "./driver-v4-i18n";

const PROFILE_REFRESH_MS = 30_000;

const healthClass: Record<DocumentHealth, string> = {
  missing: "bg-slate-100 text-slate-600",
  pending: "bg-amber-50 text-amber-800",
  verified: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  expired: "bg-red-50 text-red-700",
};

function errorMessage(_error: unknown, fallback: string): string {
  return fallback;
}

function localeFor(language: DriverLanguage) {
  return language === "am" ? "am-ET" : language === "om" ? "om-ET" : "en-GB";
}

function formatDate(value: string | null, language: DriverLanguage): string {
  if (!value) return "—";
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat(localeFor(language), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function statusCopy(status: DriverProfileRecord["driverStatus"], language: DriverLanguage) {
  const t = getDriverV4Copy(language);
  if (status === "approved") return { label: t.common.approved, detail: t.profile.approvedDetail, className: "bg-emerald-50 text-emerald-700" };
  if (status === "pending") return { label: t.common.pending, detail: t.profile.pendingDetail, className: "bg-amber-50 text-amber-800" };
  if (status === "rejected") return { label: t.common.rejected, detail: t.profile.rejectedDetail, className: "bg-red-50 text-red-700" };
  return { label: t.common.suspended, detail: t.profile.suspendedDetail, className: "bg-red-50 text-red-700" };
}

function vehicleStatusLabel(status: string | null, language: DriverLanguage) {
  const p = getDriverV4Copy(language).profile;
  const normalized = status?.toLowerCase().replace(/[- ]+/g, "_") ?? "";
  if (normalized === "available") return p.vehicleAvailable;
  if (normalized === "assigned") return p.vehicleAssigned;
  if (normalized === "on_trip" || normalized === "in_transit") return p.vehicleOnTrip;
  if (normalized === "maintenance") return p.vehicleMaintenance;
  if (normalized === "suspended") return p.vehicleSuspended;
  if (normalized === "inactive") return p.vehicleInactive;
  return p.vehicleStatus;
}

function ProgressCard({ title, verified, submitted, total, language }: {
  title: string;
  verified: number;
  submitted: number;
  total: number;
  language: DriverLanguage;
}) {
  const p = getDriverV4Copy(language).profile;
  const percent = total > 0 ? Math.round((verified / total) * 100) : 0;
  return <div className="rounded-[22px] border border-halo-line bg-white p-4 shadow-halo-card">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-halo-muted">{title}</p><p className="mt-2 text-xl font-black text-halo-navy">{verified}/{total} {p.verified}</p></div>
      <span className="rounded-xl bg-halo-soft px-3 py-2 text-xs font-black text-halo-blue">{percent}%</span>
    </div>
    <div className="mt-4 h-2 overflow-hidden rounded-full bg-halo-line"><div className="h-full rounded-full bg-halo-blue transition-all" style={{ width: `${percent}%` }} /></div>
    <p className="mt-2 text-[10px] text-halo-muted">{p.submitted}: {submitted}/{total}</p>
  </div>;
}

function SourceError({ message, retryLabel, onRetry }: { message: string; retryLabel: string; onRetry: () => void }) {
  return <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-3">
    <p className="min-w-0 flex-1 text-xs font-bold leading-5 text-red-700">{message}</p>
    <button type="button" onClick={onRetry} className="min-h-10 shrink-0 rounded-xl bg-white px-3 text-[10px] font-black text-red-700 shadow-sm">{retryLabel}</button>
  </div>;
}

function DocumentRow({
  documentKey,
  record,
  onPreview,
  onUpload,
  uploadDisabled = false,
  language,
}: {
  documentKey: VerificationDocumentKey;
  record: DriverVerificationRecord | undefined;
  onPreview: () => void;
  onUpload: () => void;
  uploadDisabled?: boolean;
  language: DriverLanguage;
}) {
  const t = getDriverV4Copy(language);
  const p = t.profile;
  const health = documentHealth(record);
  const className = healthClass[health];
  const healthLabel = health === "missing" ? p.missing : health === "pending" ? p.pending : health === "verified" ? p.docVerified : health === "rejected" ? p.rejected : p.expired;
  const expiry = documentExpiryWarning(record);
  const expiryMessage = expiry.level === "expired"
    ? p.expiredMessage
    : expiry.level === "critical" || expiry.level === "soon"
      ? expiry.daysRemaining === 0
        ? p.expiresToday
        : `${p.expiresIn} ${expiry.daysRemaining} ${p.days}`
      : null;
  const expiryClass = expiry.level === "expired" || expiry.level === "critical"
    ? "border-red-100 bg-red-50 text-red-700"
    : "border-amber-100 bg-amber-50 text-amber-800";

  return <article className="border-t border-halo-line px-4 py-3 first:border-t-0">
    <div className="flex items-start gap-3">
      <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-black ${className}`}>{health === "verified" ? "✓" : health === "rejected" || health === "expired" ? "!" : "•"}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="text-sm font-extrabold leading-5 text-halo-navy">{t.documents[documentKey]}</p>
          <span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${className}`}>{healthLabel}</span>
        </div>
        {record?.expiryDate && <p className="mt-1 text-[10px] text-halo-muted">{p.expiry}: {formatDate(record.expiryDate, language)}</p>}
        {expiryMessage && <p className={`mt-2 rounded-xl border px-3 py-2 text-[10px] font-bold leading-4 ${expiryClass}`}>{expiryMessage}</p>}
        {record?.rejectionReason && <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-[10px] font-bold leading-4 text-red-700">{p.reason}: {record.rejectionReason}</p>}
        {!record && <p className="mt-1 text-[10px] text-halo-muted">{p.notFound}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {record && <button type="button" onClick={onPreview} className="min-h-10 rounded-xl bg-halo-soft px-3 text-[10px] font-black text-halo-blue">{p.preview}</button>}
          <button type="button" onClick={onUpload} disabled={uploadDisabled} className="min-h-10 rounded-xl border border-halo-line bg-white px-3 text-[10px] font-black text-halo-blue shadow-sm disabled:cursor-not-allowed disabled:opacity-45">{record ? p.replace : p.upload}</button>
        </div>
      </div>
    </div>
  </article>;
}

function TruckCard({ truck, selected, onSelect, language }: {
  truck: DriverTruckRecord;
  selected: boolean;
  onSelect: () => void;
  language: DriverLanguage;
}) {
  const p = getDriverV4Copy(language).profile;
  const capacity = truck.capacityTons === null
    ? "—"
    : `${Number.isInteger(truck.capacityTons) ? truck.capacityTons.toFixed(0) : truck.capacityTons.toFixed(1)} t`;
  return <button type="button" onClick={onSelect} aria-pressed={selected} className={`min-w-[230px] rounded-[22px] border p-4 text-left shadow-halo-card transition ${selected ? "border-halo-blue bg-halo-soft" : "border-halo-line bg-white"}`}>
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-halo-muted">{p.plate}</p><p className="mt-1 text-lg font-black text-halo-navy">{truck.plateNumber}</p></div>
      <span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${selected ? "bg-halo-blue text-white" : "bg-slate-100 text-slate-600"}`}>{vehicleStatusLabel(truck.status, language)}</span>
    </div>
    <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
      <div><p className="text-[9px] font-bold uppercase tracking-wider text-halo-muted">{p.type}</p><p className="mt-1 font-extrabold text-halo-navy">{formatVehicleType(truck.vehicleType)}</p></div>
      <div><p className="text-[9px] font-bold uppercase tracking-wider text-halo-muted">{p.capacity}</p><p className="mt-1 font-extrabold text-halo-navy">{capacity}</p></div>
    </div>
  </button>;
}

export function DriverProfileView({ userId, fallbackName, language = "om" }: { userId: string; fallbackName: string; language?: DriverLanguage }) {
  const mountedRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const queuedRefreshRef = useRef(false);
  const requestIdRef = useRef(0);
  const [profile, setProfile] = useState<DriverProfileRecord | null>(null);
  const [trucks, setTrucks] = useState<DriverTruckRecord[]>([]);
  const [documents, setDocuments] = useState<DriverVerificationRecord[]>([]);
  const [ratingSummary, setRatingSummary] = useState<DriverRatingSummary | null>(null);
  const [profileConfirmed, setProfileConfirmed] = useState(false);
  const [trucksConfirmed, setTrucksConfirmed] = useState(false);
  const [documentsConfirmed, setDocumentsConfirmed] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [trucksError, setTrucksError] = useState<string | null>(null);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null);
  const [uploadTarget, setUploadTarget] = useState<{ documentKey: VerificationDocumentKey; truckId: string | null; record: DriverVerificationRecord | undefined } | null>(null);
  const [previewTarget, setPreviewTarget] = useState<{ documentKey: VerificationDocumentKey; record: DriverVerificationRecord } | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [vehicleNotice, setVehicleNotice] = useState<string | null>(null);
  const [vehicleError, setVehicleError] = useState<string | null>(null);
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [plateNumber, setPlateNumber] = useState("");
  const [vehicleType, setVehicleType] = useState<string>(DRIVER_VEHICLE_TYPES[0]);
  const [capacityTons, setCapacityTons] = useState("5");
  const [contactFullName, setContactFullName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactHomeAddress, setContactHomeAddress] = useState("");
  const [savingContact, setSavingContact] = useState(false);
  const [contactNotice, setContactNotice] = useState<string | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);
  const t = getDriverV4Copy(language);
  const c = t.profile;
  const p = c;

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current) {
      queuedRefreshRef.current = true;
      return;
    }
    refreshInFlightRef.current = true;
    const requestId = ++requestIdRef.current;
    if (!profileConfirmed && !trucksConfirmed && !documentsConfirmed) setLoading(true);

    const [profileResult, trucksResult, documentsResult, ratingResult] = await Promise.allSettled([
      fetchDriverProfile(userId),
      fetchDriverTrucks(userId),
      fetchDriverVerificationFiles(userId),
      fetchDriverRatingSummary(userId),
    ]);

    if (!mountedRef.current || requestId !== requestIdRef.current) {
      refreshInFlightRef.current = false;
      return;
    }

    if (profileResult.status === "fulfilled") {
      setProfile(profileResult.value);
      if (!savingContact) {
        setContactFullName(profileResult.value.fullName);
        setContactPhone(profileResult.value.phone);
        setContactEmail(profileResult.value.email ?? "");
        setContactHomeAddress(profileResult.value.homeAddress ?? "");
      }
      setProfileConfirmed(true);
      setProfileError(null);
    } else {
      setProfileError(errorMessage(profileResult.reason, c.profileError));
    }

    if (trucksResult.status === "fulfilled") {
      setTrucks(trucksResult.value);
      setTrucksConfirmed(true);
      setTrucksError(null);
      setSelectedTruckId((current) => current && trucksResult.value.some((truck) => truck.id === current)
        ? current
        : trucksResult.value[0]?.id ?? null);
    } else {
      setTrucksError(errorMessage(trucksResult.reason, c.trucksError));
    }

    if (documentsResult.status === "fulfilled") {
      setDocuments(documentsResult.value);
      setDocumentsConfirmed(true);
      setDocumentsError(null);
    } else {
      setDocumentsError(errorMessage(documentsResult.reason, c.documentsError));
    }

    if (ratingResult.status === "fulfilled") setRatingSummary(ratingResult.value);

    setLoading(false);
    refreshInFlightRef.current = false;
    if (queuedRefreshRef.current && mountedRef.current) {
      queuedRefreshRef.current = false;
      window.setTimeout(() => void refresh(), 0);
    }
  }, [c.documentsError, c.profileError, c.trucksError, documentsConfirmed, profileConfirmed, savingContact, trucksConfirmed, userId]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    const interval = window.setInterval(() => void refresh(), PROFILE_REFRESH_MS);
    let unsubscribe: () => void = () => undefined;
    try {
      unsubscribe = subscribeToDriverProfile(userId, () => void refresh());
    } catch (caught) {
      setProfileError(errorMessage(caught, c.realtimeError));
    }
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      window.clearInterval(interval);
      unsubscribe();
    };
  }, [c.realtimeError, refresh, userId]);

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
  const expirySummary = useMemo(() => documentExpirySummary(documents), [documents]);
  const expiryWarningCount = expirySummary.expired + expirySummary.critical + expirySummary.soon;
  const localizedDocumentLabels = t.documents;
  const profileStatus = profile ? statusCopy(profile.driverStatus, language) : null;
  const initials = (profile?.fullName || fallbackName).trim().split(/\s+/).slice(0, 2).map((part) => part.slice(0, 1).toUpperCase()).join("") || "D";

  async function handleContactSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingContact) return;
    setSavingContact(true);
    setContactError(null);
    setContactNotice(null);
    try {
      const saved = await saveDriverContactProfile(userId, { fullName: contactFullName, phone: contactPhone, email: contactEmail, homeAddress: contactHomeAddress });
      setProfile(saved);
      setContactFullName(saved.fullName);
      setContactPhone(saved.phone);
      setContactEmail(saved.email ?? "");
      setContactHomeAddress(saved.homeAddress ?? "");
      setContactNotice(p.contactSaved);
    } catch {
      setContactError(p.contactSaveError);
    } finally {
      setSavingContact(false);
    }
  }

  async function handleVehicleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingVehicle) return;
    setSavingVehicle(true);
    setVehicleError(null);
    setVehicleNotice(null);
    try {
      const saved = await saveDriverVehicleProfile(userId, { plateNumber, vehicleType, capacityTons: Number(capacityTons) });
      setSelectedTruckId(saved.id);
      setVehicleNotice(p.vehicleSaved);
      await refresh();
    } catch {
      setVehicleError(p.vehicleSaveError);
    } finally {
      setSavingVehicle(false);
    }
  }

  if (loading && !profileConfirmed && !trucksConfirmed && !documentsConfirmed) {
    return <div className="grid min-h-[calc(100dvh-137px)] place-items-center bg-halo-canvas px-6 text-center"><div><div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-halo-line border-t-halo-blue"/><p className="mt-4 text-sm font-bold text-halo-muted">{c.loading}</p></div></div>;
  }

  return <div className="space-y-5 px-4 pb-8 pt-5 sm:px-6" data-mobile-driver-profile>
    <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-halo-gold-dark">{c.eyebrow}</p><h1 className="mt-1 text-2xl font-black text-halo-navy">{c.title}</h1><p className="mt-2 text-xs leading-5 text-halo-muted">{c.help}</p></div>

    {uploadNotice && <div role="status" className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs font-bold leading-5 text-emerald-700">{uploadNotice}</div>}
    {profileError && <SourceError message={profileError} retryLabel={t.common.retry} onRetry={() => void refresh()} />}
    <section className="rounded-[28px] border border-halo-line bg-white p-4 shadow-halo-card">
      <div className="flex items-start gap-4"><span className="grid h-16 w-16 shrink-0 place-items-center rounded-[22px] bg-halo-blue text-lg font-black text-white">{initials}</span><div className="min-w-0 flex-1"><h2 className="break-words text-xl font-black text-halo-navy">{profile?.fullName || fallbackName}</h2><p className="mt-1 break-all text-xs text-halo-muted">{profile?.phone || `${c.phone} —`}</p>{profileStatus && <><span className={`mt-3 inline-flex rounded-full px-3 py-1.5 text-[9px] font-black ${profileStatus.className}`}>{profileStatus.label}</span><p className="mt-2 text-[10px] leading-4 text-halo-muted">{profileStatus.detail}</p></>}</div></div>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-halo-line pt-4 text-xs"><div><p className="text-[9px] font-black uppercase tracking-wider text-halo-muted">{c.preferredVehicle}</p><p className="mt-1 font-extrabold text-halo-navy">{formatVehicleType(profile?.vehicleType ?? null)}</p></div><div><p className="text-[9px] font-black uppercase tracking-wider text-halo-muted">{c.memberSince}</p><p className="mt-1 font-extrabold text-halo-navy">{formatDate(profile?.createdAt ?? null, language)}</p></div></div>
    </section>

    <form data-driver-profile-contact-editor onSubmit={(event) => void handleContactSave(event)} className="rounded-[24px] border border-halo-line bg-white p-4 shadow-halo-card">
      <h2 className="text-sm font-black text-halo-navy">{p.editContact}</h2>
      {contactNotice && <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-2.5 text-[10px] font-bold text-emerald-700">{contactNotice}</p>}
      {contactError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-2.5 text-[10px] font-bold text-red-700">{contactError}</p>}
      <div className="mt-3 grid gap-3 min-[390px]:grid-cols-2">
        <label className="text-[10px] font-black text-halo-muted">{p.fullName}<input required autoComplete="name" maxLength={120} value={contactFullName} onChange={(e) => setContactFullName(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-halo-line px-3 text-sm text-halo-navy" /></label>
        <label className="text-[10px] font-black text-halo-muted">{p.phone}<input required type="tel" inputMode="tel" autoComplete="tel" maxLength={17} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-halo-line px-3 text-sm text-halo-navy" /></label>
        <label className="text-[10px] font-black text-halo-muted">{p.email}<input type="email" inputMode="email" autoComplete="email" maxLength={254} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-halo-line px-3 text-sm text-halo-navy" /></label>
        <label className="text-[10px] font-black text-halo-muted">{p.homeAddress}<input autoComplete="street-address" maxLength={240} value={contactHomeAddress} onChange={(e) => setContactHomeAddress(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-halo-line px-3 text-sm text-halo-navy" /></label>
      </div>
      <button type="submit" disabled={savingContact || !profile} className="mt-3 min-h-11 w-full rounded-xl bg-halo-blue px-4 text-xs font-black text-white disabled:opacity-60">{savingContact ? p.savingContact : p.saveContact}</button>
    </form>

    <section data-driver-profile-contact className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
      <article className="rounded-[22px] border border-halo-line bg-white p-4 shadow-halo-card"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-halo-gold-dark">{p.contact}</p><dl className="mt-3 space-y-3 text-xs"><div><dt className="font-black text-halo-muted">{p.phone}</dt><dd className="mt-1 break-all font-extrabold text-halo-navy">{profile?.phone || "—"}</dd></div><div><dt className="font-black text-halo-muted">{p.email}</dt><dd className="mt-1 break-all font-extrabold text-halo-navy">{profile?.email || "—"}</dd></div><div><dt className="font-black text-halo-muted">{p.homeAddress}</dt><dd className="mt-1 break-words font-extrabold text-halo-navy">{profile?.homeAddress || "—"}</dd></div></dl></article>
      <article className="rounded-[22px] border border-halo-line bg-white p-4 shadow-halo-card"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-halo-gold-dark">{p.rating}</p><div className="mt-2 flex items-end gap-2"><span className="text-3xl font-black text-halo-navy">{(ratingSummary?.average ?? profile?.ratingAvg)?.toFixed(1) ?? "—"}</span><span className="pb-1 text-lg text-amber-500">★</span></div><p className="mt-1 text-[10px] font-bold text-halo-muted">{ratingSummary?.count ?? 0} {p.reviews}</p>{ratingSummary && ratingSummary.recent.length > 0 ? <div className="mt-3 space-y-2">{ratingSummary.recent.map((entry, index) => <div key={index} className="rounded-xl bg-halo-soft p-2.5"><p className="text-[10px] font-black text-amber-700">{"★".repeat(Math.round(entry.score))}</p>{entry.comment && <p className="mt-1 text-[10px] leading-4 text-halo-muted">{entry.comment}</p>}</div>)}</div> : <p className="mt-3 text-[10px] text-halo-muted">{p.noRatings}</p>}</article>
    </section>

    <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2"><ProgressCard title={c.driverDocs} {...identityProgress} language={language} /><ProgressCard title={c.vehicleDocs} {...vehicleProgress} language={language} /></div>

    <section data-driver-current-vehicle className="rounded-[24px] border border-halo-line bg-white p-4 shadow-halo-card">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-halo-gold-dark">{p.currentVehicle}</p>
      {selectedTruck ? <div className="mt-3"><TruckCard truck={selectedTruck} selected={true} onSelect={() => setSelectedTruckId(selectedTruck.id)} language={language} /></div> : <p className="mt-2 text-xs text-halo-muted">{p.noVehicle}</p>}
      <form onSubmit={(event) => void handleVehicleSave(event)} className="mt-4 border-t border-halo-line pt-4"><h3 className="text-sm font-black text-halo-navy">{p.registerVehicle}</h3><p className="mt-1 text-[10px] leading-4 text-halo-muted">{p.registerVehicleHelp}</p>{vehicleNotice && <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-2.5 text-[10px] font-bold text-emerald-700">{vehicleNotice}</p>}{vehicleError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-2.5 text-[10px] font-bold text-red-700">{vehicleError}</p>}<div className="mt-3 grid gap-3 min-[390px]:grid-cols-2"><label className="text-[10px] font-black text-halo-muted">{p.plate}<input required value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-halo-line px-3 text-sm text-halo-navy" /></label><label className="text-[10px] font-black text-halo-muted">{p.vehicleType}<select value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-halo-line bg-white px-3 text-sm text-halo-navy">{DRIVER_VEHICLE_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="text-[10px] font-black text-halo-muted min-[390px]:col-span-2">{p.capacityTons}<input required type="number" min="0.1" max="60" step="0.1" value={capacityTons} onChange={(e) => setCapacityTons(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-halo-line px-3 text-sm text-halo-navy" /></label></div><button type="submit" disabled={savingVehicle} className="mt-3 min-h-11 w-full rounded-xl bg-halo-blue px-4 text-xs font-black text-white disabled:opacity-60">{savingVehicle ? p.savingVehicle : p.saveVehicle}</button></form>
    </section>

    {expiryWarningCount > 0 && <section data-driver-document-expiry-warning className="rounded-[22px] border border-amber-100 bg-amber-50 p-4"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-lg font-black text-amber-700">!</span><div className="min-w-0"><p className="text-sm font-black text-amber-900">{c.expiryAttention}</p><p className="mt-1 text-xs leading-5 text-amber-800">{c.expiryExpiredCount}: {expirySummary.expired} · {c.expiryCriticalCount}: {expirySummary.critical} · {c.expirySoonCount}: {expirySummary.soon}</p><p className="mt-2 text-[10px] leading-4 text-amber-700">{c.expiryHelp}</p></div></div></section>}

    <section className="space-y-3"><div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-halo-gold-dark">{c.fleet}</p><h2 className="mt-1 text-xl font-black text-halo-navy">{c.yourVehicles}</h2></div><span className="text-xs font-bold text-halo-muted">{trucks.length} {c.total}</span></div>{trucksError && <SourceError message={trucksError} retryLabel={t.common.retry} onRetry={() => void refresh()} />}{trucksConfirmed && trucks.length === 0 ? <div className="rounded-[22px] border border-dashed border-halo-line bg-white p-5 text-center"><p className="text-sm font-black text-halo-navy">{c.noVehicle}</p><p className="mt-2 text-xs leading-5 text-halo-muted">{c.noVehicleHelp}</p></div> : <div className="flex snap-x gap-3 overflow-x-auto pb-2">{trucks.map((truck) => <TruckCard key={truck.id} truck={truck} selected={selectedTruck?.id === truck.id} onSelect={() => setSelectedTruckId(truck.id)} language={language} />)}</div>}</section>

    <section className="overflow-hidden rounded-[24px] border border-halo-line bg-white shadow-halo-card"><div className="px-4 py-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-halo-gold-dark">{c.identityChecklist}</p><h2 className="mt-1 text-lg font-black text-halo-navy">{c.driverDocs}</h2></div>{documentsError && <div className="px-4 pb-4"><SourceError message={documentsError} retryLabel={t.common.retry} onRetry={() => void refresh()} /></div>}{identityDocumentKeys.map((key) => {
  const record = documents.find((item) => item.documentKey === key && item.truckId === null);
  return <DocumentRow key={key} documentKey={key} language={language} record={record} onPreview={() => { if (record) setPreviewTarget({ documentKey: key, record }); }} onUpload={() => { setUploadNotice(null); setUploadTarget({ documentKey: key, truckId: null, record }); }} />;
})}</section>

    <section className="overflow-hidden rounded-[24px] border border-halo-line bg-white shadow-halo-card"><div className="px-4 py-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-halo-gold-dark">{c.vehicleChecklist}</p><h2 className="mt-1 text-lg font-black text-halo-navy">{selectedTruck ? selectedTruck.plateNumber : c.chooseVehicle}</h2><p className="mt-1 text-[10px] text-halo-muted">{c.chooseVehicleHelp}</p></div>{vehicleDocumentKeys.map((key) => {
  const record = selectedTruck ? documents.find((item) => item.documentKey === key && item.truckId === selectedTruck.id) : undefined;
  return <DocumentRow key={key} documentKey={key} language={language} record={record} uploadDisabled={!selectedTruck} onPreview={() => { if (record) setPreviewTarget({ documentKey: key, record }); }} onUpload={() => { if (!selectedTruck) return; setUploadNotice(null); setUploadTarget({ documentKey: key, truckId: selectedTruck.id, record }); }} />;
})}</section>

    <div className="rounded-2xl bg-halo-gold-soft p-4 text-xs leading-5 text-halo-gold-dark"><strong>{c.uploadNote}</strong> {c.uploadHelp}</div>
    {previewTarget && <DriverDocumentPreviewSheet expectedUserId={userId} record={previewTarget.record} documentLabel={localizedDocumentLabels[previewTarget.documentKey]} onClose={() => setPreviewTarget(null)} language={language} />}
    {uploadTarget && <DriverDocumentUploadSheet userId={userId} documentKey={uploadTarget.documentKey} documentLabel={localizedDocumentLabels[uploadTarget.documentKey]} truckId={uploadTarget.truckId} currentRecord={uploadTarget.record} onClose={() => setUploadTarget(null)} onUploaded={async (message) => { setUploadNotice(message); setUploadTarget(null); await refresh(); }} language={language} />}
  </div>;
}
