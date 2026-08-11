import { FormEvent, useMemo, useState, useEffect } from "react";
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
  verified: "bg-emerald-50 text-emerald-800 border-emerald-200",
  pending: "bg-amber/10 text-amber-dim border-amber/30",
  rejected: "bg-route/5 text-route border-route/25",
  missing: "bg-[#f5f3ed] text-steel border-asphalt/10",
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
  const percent = required.length ? Math.round((verified / required.length) * 100) : 0;

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

  if (loading) return <main className="max-w-5xl mx-auto px-5 py-12 pb-28"><p className="font-mono text-sm text-steel">{c.loading}</p></main>;

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 pb-28 md:pb-12">
      <section className="bg-asphalt text-white p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full border-[36px] border-amber/10" />
        <div className="relative">
          <p className="font-mono text-[10px] tracking-[.22em] text-amber">{c.compliance}</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
            <div><h1 className="font-display text-3xl sm:text-4xl font-bold">{c.center}</h1><p className="mt-3 max-w-xl text-sm text-white/55">{c.centerHelp}</p></div>
            <div className="min-w-40 border border-white/15 bg-white/5 p-4"><p className="font-mono text-[10px] tracking-wider text-white/45">{c.verified}</p><p className="mt-1 font-display text-3xl font-bold text-amber">{percent}%</p><p className="mt-1 text-xs text-white/45">{verified} / {required.length} {c.requiredItems}</p></div>
          </div>
          <div className="mt-6 h-2 bg-white/10"><div className="h-full bg-amber transition-all" style={{ width: `${percent}%` }} /></div>
        </div>
      </section>

      {error && <p className="mt-5 border border-route/30 bg-route/5 p-4 text-sm text-route">{error}</p>}
      {notice && <p className="mt-5 border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}

      <section className="mt-6 grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <form onSubmit={saveProfile} className="border border-asphalt/10 bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3"><div><p className="font-mono text-[10px] tracking-[.18em] text-amber-dim">{c.profile}</p><h2 className="mt-1 font-display text-2xl font-semibold">{c.contact}</h2></div><span className={`border px-2.5 py-1 text-[10px] font-semibold uppercase ${data?.profile.driver_status === "approved" ? statusClass.verified : statusClass.pending}`}>{localStatus(data?.profile.driver_status ?? "pending", c)}</span></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field name="fullName" label={c.fullLegalName} defaultValue={data?.profile.full_name ?? ""} />
            <Field name="phone" label={c.phone} defaultValue={data?.profile.phone ?? ""} inputMode="tel" placeholder="09xxxxxxxx" />
            <Field name="email" label={c.email} type="email" defaultValue={data?.profile.email ?? ""} placeholder="driver@example.com" />
            <Field name="homeAddress" label={c.homeAddress} defaultValue={data?.profile.home_address ?? ""} placeholder="City, sub-city / woreda" />
          </div>
          <button disabled={savingProfile} className="mt-5 bg-asphalt px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{savingProfile ? c.saving : c.saveProfile}</button>
        </form>

        <div className="border border-asphalt/10 bg-white p-5 sm:p-6">
          <p className="font-mono text-[10px] tracking-[.18em] text-amber-dim">{c.currentVehicle}</p>
          {data?.truck ? <>
            <div className="mt-4 flex items-start justify-between gap-4"><div><p className="font-display text-2xl font-bold">{data.truck.plate_number}</p><p className="mt-1 text-sm text-steel">{data.truck.vehicle_type} · {data.truck.capacity_tons ?? "—"} {c.tons}</p></div><span className="border border-amber/30 bg-amber/10 px-2.5 py-1 text-[10px] font-semibold uppercase text-amber-dim">{data.truck.status}</span></div>
            <div className="mt-5 border-t border-asphalt/10 pt-4 text-xs text-steel">{c.linkedHelp}</div>
          </> : <div className="mt-5 bg-[#f5f3ed] p-5"><p className="font-display font-semibold">{c.noTruck}</p><p className="mt-2 text-sm text-steel">{c.noTruckHelp}</p></div>}
        </div>
      </section>

      <DocumentSection title={c.driverIdentity} eyebrow={c.personalVerification} specs={DRIVER_DOCS} docsByKey={docsByKey} expiry={expiry} setExpiry={setExpiry} busyKey={busyKey} onUpload={upload} />
      <DocumentSection title={c.vehicleCompliance} eyebrow={c.truckDocsPhotos} specs={TRUCK_DOCS} docsByKey={docsByKey} expiry={expiry} setExpiry={setExpiry} busyKey={busyKey} onUpload={upload} truckLocked={!data?.truck} />

      <section className="mt-6 border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
        <p className="font-semibold">{c.privacyTitle}</p>
        <p className="mt-2 leading-relaxed">{c.privacyHelp}</p>
      </section>
    </main>
  );
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
  return <section className="mt-6 border border-asphalt/10 bg-white">
    <div className="border-b border-asphalt/10 p-5 sm:p-6"><p className="font-mono text-[10px] tracking-[.18em] text-amber-dim">{eyebrow}</p><h2 className="mt-1 font-display text-2xl font-semibold">{title}</h2></div>
    <div className="grid gap-px bg-asphalt/10 md:grid-cols-2">
      {specs.map((spec) => {
        const doc = docsByKey.get(spec.key);
        const state = doc?.status ?? "missing";
        const [label, help] = translatedSpecs[spec.key] ?? [spec.label, spec.help];
        return <article key={spec.key} className="bg-white p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3"><div><h3 className="font-display font-semibold text-lg">{label}</h3><p className="mt-1 text-xs leading-relaxed text-steel">{help}</p></div><span className={`shrink-0 border px-2 py-1 text-[9px] font-semibold uppercase ${statusClass[state]}`}>{localStatus(state, c)}</span></div>
          {doc && <div className="mt-4 bg-[#f5f3ed] p-3 text-xs text-steel"><p className="truncate">{doc.original_name}</p>{doc.expiry_date && <p className="mt-1">{c.expires}: <strong className="text-asphalt">{doc.expiry_date}</strong></p>}{doc.rejection_reason && <p className="mt-2 text-route">{c.reviewNote}: {doc.rejection_reason}</p>}<button type="button" onClick={() => void openVerificationDocument(doc.file_path)} className="mt-2 font-semibold text-asphalt underline">{c.openPrivate}</button></div>}
          {spec.expiry && <label className="mt-4 block text-xs text-steel">{c.expiryDate} <input type="date" value={expiry[spec.key] ?? doc?.expiry_date ?? ""} onChange={(event) => setExpiry((current) => ({ ...current, [spec.key]: event.target.value }))} className="mt-1 block w-full border border-asphalt/15 bg-white px-3 py-2 text-sm text-asphalt" /></label>}
          <label className={`mt-4 flex min-h-12 items-center justify-center border px-4 py-3 text-sm font-semibold transition ${truckLocked ? "cursor-not-allowed border-asphalt/10 bg-[#f5f3ed] text-steel" : "cursor-pointer border-asphalt bg-asphalt text-white hover:bg-line"}`}>
            <input disabled={truckLocked || busyKey === spec.key} type="file" accept={spec.photoOnly ? "image/jpeg,image/png,image/webp" : "image/jpeg,image/png,image/webp,application/pdf"} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; void onUpload(spec, file); event.currentTarget.value = ""; }} />
            {truckLocked ? c.truckAssignmentRequired : busyKey === spec.key ? c.uploading : doc ? c.replace : c.uploadReview}
          </label>
          <p className="mt-2 text-[10px] text-steel">{spec.photoOnly ? "JPG / PNG / WebP" : "JPG / PNG / WebP / PDF"} · {c.max10}</p>
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
  return <label className="text-sm font-medium">{label}<input required={name !== "email"} name={name} type={type} inputMode={inputMode} defaultValue={defaultValue} placeholder={placeholder} className="mt-2 block w-full border border-asphalt/15 bg-white px-4 py-3 font-normal outline-none focus:border-amber" /></label>;
}
