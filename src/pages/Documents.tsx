import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  DriverVerificationProfile,
  VerificationDocumentKey,
  getMyVerificationProfile,
  openVerificationDocument,
  replaceVerificationDocument,
  updateMyVerificationProfile,
} from "../services/driver.service";
import { useLanguage } from "../i18n/LanguageProvider";
import { getDriverTripDocumentsCopy } from "../i18n/driverTripDocumentsCopy";

type DocumentSpec = {
  key: VerificationDocumentKey;
  label: string;
  help: string;
  scope: "driver" | "truck";
  photoOnly?: boolean;
  expiry?: boolean;
};

const DRIVER_DOCS: DocumentSpec[] = [
  { key: "driver_photo", label: "Driver profile photo", help: "Clear recent face photo used for operations identification.", scope: "driver", photoOnly: true },
  { key: "license_front", label: "Driving license · front", help: "Front side of the current driving license.", scope: "driver", expiry: true },
  { key: "license_back", label: "Driving license · back", help: "Back side of the same driving license.", scope: "driver", expiry: true },
  { key: "national_id_front", label: "National ID · front", help: "Fayda / national identity card front side.", scope: "driver" },
  { key: "national_id_back", label: "National ID · back", help: "Fayda / national identity card back side.", scope: "driver" },
];

const TRUCK_DOCS: DocumentSpec[] = [
  { key: "vehicle_registration", label: "Vehicle registration", help: "Registration booklet/card as PDF or clear scan/photo.", scope: "truck" },
  { key: "insurance", label: "Insurance certificate", help: "Current insurance certificate.", scope: "truck", expiry: true },
  { key: "transport_permit", label: "Transport permit", help: "Commercial transport permit or operating certificate.", scope: "truck", expiry: true },
  { key: "truck_front", label: "Truck photo · front", help: "Front photo with the plate clearly visible.", scope: "truck", photoOnly: true },
  { key: "truck_back", label: "Truck photo · back", help: "Rear photo with the plate clearly visible.", scope: "truck", photoOnly: true },
  { key: "truck_side", label: "Truck photo · side", help: "Full side profile of the vehicle.", scope: "truck", photoOnly: true },
  { key: "truck_loading_area", label: "Loading area photo", help: "Clear cargo/loading-bed or container interior photo.", scope: "truck", photoOnly: true },
];

const statusClass: Record<string, string> = {
  verified: "border-emerald-400/35 bg-emerald-400/10 text-emerald-300",
  pending: "border-amber/40 bg-amber/10 text-amber",
  rejected: "border-route/40 bg-route/10 text-red-300",
  missing: "border-white/10 bg-white/[.04] text-white/45",
};

const statusDotClass: Record<string, string> = {
  verified: "bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,.65)]",
  pending: "bg-amber shadow-[0_0_18px_rgba(240,170,55,.55)]",
  rejected: "bg-route shadow-[0_0_18px_rgba(239,98,55,.5)]",
  missing: "bg-white/25",
};

export function Documents() {
  const { language } = useLanguage();
  const copy = getDriverTripDocumentsCopy(language);
  const c = copy.docs;
  const [data, setData] = useState<DriverVerificationProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<VerificationDocumentKey | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [expiry, setExpiry] = useState<Partial<Record<VerificationDocumentKey, string>>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    try {
      setData(await getMyVerificationProfile());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : c.loadError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const docsByKey = useMemo(
    () => new Map((data?.documents ?? []).map((item) => [item.document_key, item])),
    [data?.documents],
  );

  const required = data?.truck ? [...DRIVER_DOCS, ...TRUCK_DOCS] : DRIVER_DOCS;
  const verified = required.filter((spec) => docsByKey.get(spec.key)?.status === "verified").length;
  const pending = required.filter((spec) => docsByKey.get(spec.key)?.status === "pending").length;
  const rejected = required.filter((spec) => docsByKey.get(spec.key)?.status === "rejected").length;
  const missing = Math.max(0, required.length - verified - pending - rejected);
  const percent = required.length ? Math.round((verified / required.length) * 100) : 0;
  const initials = (data?.profile.full_name ?? "Driver")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "DR";

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSavingProfile(true); setError(""); setNotice("");
    try {
      await updateMyVerificationProfile({
        fullName: String(form.get("fullName") ?? ""),
        phone: String(form.get("phone") ?? ""),
        email: String(form.get("email") ?? ""),
        homeAddress: String(form.get("homeAddress") ?? ""),
      });
      setNotice(c.profileUpdated);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : c.profileUpdateError);
    } finally { setSavingProfile(false); }
  }

  async function upload(spec: DocumentSpec, file?: File) {
    if (!file) return;
    if (spec.scope === "truck" && !data?.truck) {
      setError(c.truckRequiredError);
      return;
    }
    setBusyKey(spec.key); setError(""); setNotice("");
    try {
      await replaceVerificationDocument({
        documentKey: spec.key,
        file,
        truckId: spec.scope === "truck" ? data?.truck?.id : null,
        expiryDate: spec.expiry ? expiry[spec.key] || null : null,
      });
      const translated = (copy.docSpec as Record<string, readonly [string, string]>)[spec.key]?.[0] ?? spec.label;
      setNotice(`${translated} ${c.uploadedForReview}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : c.uploadFailed);
    } finally { setBusyKey(null); }
  }

  if (loading) return <main className="mx-auto max-w-6xl px-5 py-12 pb-28"><p className="font-mono text-sm text-steel">{c.loading}</p></main>;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 pb-28 sm:px-6 sm:py-10 md:pb-12">
      <section className="relative overflow-hidden border border-white/10 bg-asphalt p-5 text-white shadow-[0_28px_80px_rgba(17,24,39,.24)] sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full border-[54px] border-amber/10" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 h-64 w-64 rounded-full bg-amber/5 blur-3xl" />
        <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-[10px] tracking-[.24em] text-amber">HALLOTRUCK DRIVER</span>
              <span className="inline-flex items-center gap-2 border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 font-mono text-[9px] tracking-[.15em] text-emerald-300">
                <i className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,.75)]" /> SECURE DOCUMENT VAULT
              </span>
            </div>
            <h1 className="mt-4 font-display text-3xl font-bold sm:text-5xl">{c.center}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55 sm:text-base">{c.centerHelp}</p>
          </div>
          <div className="grid min-w-64 grid-cols-[auto_1fr] items-center gap-4 border border-white/10 bg-white/[.05] p-4 backdrop-blur">
            <div className="grid h-16 w-16 place-items-center rounded-full border border-amber/35 bg-amber/10 font-display text-xl font-bold text-amber shadow-[0_0_28px_rgba(240,170,55,.15)]">{initials}</div>
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-semibold">{data?.profile.full_name || c.profile}</p>
              <p className="mt-1 truncate text-xs text-white/45">{data?.profile.phone || "—"}</p>
              <span className={`mt-2 inline-flex border px-2.5 py-1 text-[9px] font-semibold uppercase ${data?.profile.driver_status === "approved" ? statusClass.verified : statusClass.pending}`}>{localStatus(data?.profile.driver_status ?? "pending", c)}</span>
            </div>
          </div>
        </div>

        <div className="relative mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label={c.verified} value={`${percent}%`} detail={`${verified} / ${required.length}`} accent />
          <Metric label={c.statusPending} value={String(pending)} detail={c.requiredItems} />
          <Metric label={c.statusRejected} value={String(rejected)} detail={c.reviewNote} />
          <Metric label={c.statusMissing} value={String(missing)} detail={c.requiredItems} />
        </div>
        <div className="relative mt-5 h-2 overflow-hidden bg-white/10"><div className="h-full bg-gradient-to-r from-amber to-yellow-200 transition-all duration-700" style={{ width: `${percent}%` }} /></div>
      </section>

      {error && <p className="mt-5 border border-route/30 bg-route/5 p-4 text-sm text-route">{error}</p>}
      {notice && <p className="mt-5 border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}

      <section className="mt-6 grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <form onSubmit={saveProfile} className="border border-asphalt/10 bg-white p-5 shadow-sm sm:p-6">
          <SectionTitle eyebrow={c.profile} title={c.contact} badge={localStatus(data?.profile.driver_status ?? "pending", c)} badgeClass={data?.profile.driver_status === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber/30 bg-amber/10 text-amber-dim"} />
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field name="fullName" label={c.fullLegalName} defaultValue={data?.profile.full_name ?? ""} />
            <Field name="phone" label={c.phone} defaultValue={data?.profile.phone ?? ""} inputMode="tel" placeholder="09xxxxxxxx" />
            <Field name="email" label={c.email} type="email" defaultValue={data?.profile.email ?? ""} placeholder="driver@example.com" />
            <Field name="homeAddress" label={c.homeAddress} defaultValue={data?.profile.home_address ?? ""} placeholder="City, sub-city / woreda" />
          </div>
          <button disabled={savingProfile} className="mt-5 inline-flex min-h-12 items-center justify-center bg-asphalt px-6 py-3 text-sm font-semibold text-white transition hover:bg-line disabled:opacity-50">{savingProfile ? c.saving : c.saveProfile}</button>
        </form>

        <div className="relative overflow-hidden border border-asphalt/10 bg-white p-5 shadow-sm sm:p-6">
          <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-amber/10" />
          <SectionTitle eyebrow={c.currentVehicle} title={data?.truck?.plate_number ?? c.noTruck} />
          {data?.truck ? <>
            <div className="relative mt-5 grid grid-cols-2 gap-3">
              <MiniStat label={c.currentVehicle} value={data.truck.vehicle_type} />
              <MiniStat label={c.tons} value={`${data.truck.capacity_tons ?? "—"}`} />
            </div>
            <div className="relative mt-4 flex items-center justify-between gap-3 border border-amber/20 bg-amber/5 p-4">
              <div><p className="font-mono text-[9px] tracking-[.16em] text-amber-dim">ASSIGNMENT STATUS</p><p className="mt-1 text-sm font-semibold capitalize">{data.truck.status}</p></div>
              <span className="h-3 w-3 rounded-full bg-amber shadow-[0_0_16px_rgba(240,170,55,.65)]" />
            </div>
            <p className="relative mt-4 border-t border-asphalt/10 pt-4 text-xs leading-5 text-steel">{c.linkedHelp}</p>
          </> : <div className="relative mt-5 border border-dashed border-asphalt/15 bg-[#f5f3ed] p-5"><p className="font-display font-semibold">{c.noTruck}</p><p className="mt-2 text-sm leading-6 text-steel">{c.noTruckHelp}</p></div>}
        </div>
      </section>

      <DocumentSection title={c.driverIdentity} eyebrow={c.personalVerification} specs={DRIVER_DOCS} docsByKey={docsByKey} expiry={expiry} setExpiry={setExpiry} busyKey={busyKey} onUpload={upload} />
      <DocumentSection title={c.vehicleCompliance} eyebrow={c.truckDocsPhotos} specs={TRUCK_DOCS} docsByKey={docsByKey} expiry={expiry} setExpiry={setExpiry} busyKey={busyKey} onUpload={upload} truckLocked={!data?.truck} />

      <section className="mt-6 flex items-start gap-4 border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-emerald-200 bg-white text-lg">✓</span>
        <div><p className="font-semibold">{c.privacyTitle}</p><p className="mt-2 leading-relaxed">{c.privacyHelp}</p></div>
      </section>
    </main>
  );
}

function Metric({ label, value, detail, accent = false }: { label: string; value: string; detail: string; accent?: boolean }) {
  return <div className={`border p-4 ${accent ? "border-amber/30 bg-amber/10" : "border-white/10 bg-white/[.04]"}`}>
    <p className={`font-mono text-[9px] tracking-[.16em] ${accent ? "text-amber" : "text-white/40"}`}>{label}</p>
    <p className={`mt-2 font-display text-2xl font-bold ${accent ? "text-amber" : "text-white"}`}>{value}</p>
    <p className="mt-1 text-[10px] text-white/35">{detail}</p>
  </div>;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="border border-asphalt/10 bg-[#f5f3ed] p-4"><p className="font-mono text-[9px] tracking-[.15em] text-steel">{label}</p><p className="mt-2 truncate font-display text-lg font-semibold">{value}</p></div>;
}

function SectionTitle({ eyebrow, title, badge, badgeClass }: { eyebrow: string; title: string; badge?: string; badgeClass?: string }) {
  return <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[10px] tracking-[.18em] text-amber-dim">{eyebrow}</p><h2 className="mt-1 font-display text-2xl font-semibold">{title}</h2></div>{badge && <span className={`shrink-0 border px-2.5 py-1 text-[9px] font-semibold uppercase ${badgeClass}`}>{badge}</span>}</div>;
}

function DocumentSection({ title, eyebrow, specs, docsByKey, expiry, setExpiry, busyKey, onUpload, truckLocked = false }: {
  title: string;
  eyebrow: string;
  specs: DocumentSpec[];
  docsByKey: Map<VerificationDocumentKey, DriverVerificationProfile["documents"][number]>;
  expiry: Partial<Record<VerificationDocumentKey, string>>;
  setExpiry: React.Dispatch<React.SetStateAction<Partial<Record<VerificationDocumentKey, string>>>>;
  busyKey: VerificationDocumentKey | null;
  onUpload: (spec: DocumentSpec, file?: File) => Promise<void>;
  truckLocked?: boolean;
}) {
  const { language } = useLanguage();
  const copy = getDriverTripDocumentsCopy(language);
  const c = copy.docs;
  const translatedSpecs = copy.docSpec as Record<string, readonly [string, string]>;
  const completed = specs.filter((spec) => docsByKey.get(spec.key)?.status === "verified").length;

  return <section className="mt-6 overflow-hidden border border-asphalt/10 bg-white shadow-sm">
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-asphalt/10 bg-asphalt p-5 text-white sm:p-6">
      <div><p className="font-mono text-[10px] tracking-[.18em] text-amber">{eyebrow}</p><h2 className="mt-1 font-display text-2xl font-semibold">{title}</h2></div>
      <span className="border border-white/15 bg-white/[.05] px-3 py-2 font-mono text-[10px] text-white/55">{completed} / {specs.length} {c.verified}</span>
    </div>
    <div className="grid gap-px bg-asphalt/10 lg:grid-cols-2">
      {specs.map((spec) => {
        const doc = docsByKey.get(spec.key);
        const state = doc?.status ?? "missing";
        const [label, help] = translatedSpecs[spec.key] ?? [spec.label, spec.help];
        return <article key={spec.key} className="group relative bg-white p-5 transition hover:bg-[#fbfaf7] sm:p-6">
          <span className={`absolute inset-y-0 left-0 w-1 ${state === "verified" ? "bg-emerald-400" : state === "pending" ? "bg-amber" : state === "rejected" ? "bg-route" : "bg-asphalt/10"}`} />
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 gap-3">
              <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${statusDotClass[state]}`} />
              <div className="min-w-0"><h3 className="font-display text-lg font-semibold">{label}</h3><p className="mt-1 text-xs leading-5 text-steel">{help}</p></div>
            </div>
            <span className={`shrink-0 border px-2 py-1 text-[9px] font-semibold uppercase ${state === "verified" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : state === "pending" ? "border-amber/30 bg-amber/10 text-amber-dim" : state === "rejected" ? "border-route/25 bg-route/5 text-route" : "border-asphalt/10 bg-[#f5f3ed] text-steel"}`}>{localStatus(state, c)}</span>
          </div>

          {doc && <div className="mt-4 border border-asphalt/10 bg-[#f5f3ed] p-3 text-xs text-steel">
            <div className="flex items-start justify-between gap-3"><p className="min-w-0 truncate font-medium text-asphalt">{doc.original_name}</p><button type="button" onClick={() => void openVerificationDocument(doc.file_path)} className="shrink-0 font-semibold text-asphalt underline underline-offset-2">{c.openPrivate}</button></div>
            {doc.expiry_date && <p className="mt-2">{c.expires}: <strong className="text-asphalt">{doc.expiry_date}</strong></p>}
            {doc.rejection_reason && <p className="mt-2 border-l-2 border-route pl-3 leading-5 text-route">{c.reviewNote}: {doc.rejection_reason}</p>}
          </div>}

          {spec.expiry && <label className="mt-4 block text-xs font-medium text-steel">{c.expiryDate}<input type="date" value={expiry[spec.key] ?? doc?.expiry_date ?? ""} onChange={(event) => setExpiry((current) => ({ ...current, [spec.key]: event.target.value }))} className="mt-2 block w-full border border-asphalt/15 bg-white px-3 py-2.5 text-sm text-asphalt outline-none focus:border-amber" /></label>}

          <label className={`mt-4 flex min-h-12 items-center justify-center border px-4 py-3 text-sm font-semibold transition ${truckLocked ? "cursor-not-allowed border-asphalt/10 bg-[#f5f3ed] text-steel" : "cursor-pointer border-asphalt bg-asphalt text-white hover:border-amber hover:bg-line"}`}>
            <input disabled={truckLocked || busyKey === spec.key} type="file" accept={spec.photoOnly ? "image/jpeg,image/png,image/webp" : "image/jpeg,image/png,image/webp,application/pdf"} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; void onUpload(spec, file); event.currentTarget.value = ""; }} />
            {truckLocked ? c.truckAssignmentRequired : busyKey === spec.key ? c.uploading : doc ? c.replace : c.uploadReview}
          </label>
          <p className="mt-2 font-mono text-[9px] tracking-wide text-steel">{spec.photoOnly ? "JPG / PNG / WebP" : "JPG / PNG / WebP / PDF"} · {c.max10}</p>
        </article>;
      })}
    </div>
  </section>;
}

function localStatus(state: string, c: ReturnType<typeof getDriverTripDocumentsCopy>["docs"]) {
  if (state === "verified" || state === "approved") return c.statusVerified;
  if (state === "pending") return c.statusPending;
  if (state === "rejected") return c.statusRejected;
  if (state === "missing") return c.statusMissing;
  return state.replace(/_/g, " ");
}

function Field({ name, label, defaultValue, type = "text", placeholder, inputMode }: { name: string; label: string; defaultValue: string; type?: string; placeholder?: string; inputMode?: "tel" | "email" | "text" }) {
  return <label className="text-sm font-medium">{label}<input required={name !== "email"} name={name} type={type} inputMode={inputMode} defaultValue={defaultValue} placeholder={placeholder} className="mt-2 block w-full border border-asphalt/15 bg-white px-4 py-3 font-normal outline-none transition focus:border-amber focus:ring-2 focus:ring-amber/10" /></label>;
}
