import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "../services/supabase.client";

interface DriverRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  driver_status: string | null;
}

interface TruckRow {
  id: string;
  plate_number: string;
  vehicle_type: string;
  status: string;
  driver_id: string | null;
  created_by: string | null;
}

interface DocumentRow {
  id: string;
  driver_id: string;
  truck_id: string | null;
  document_key: string;
  original_name: string;
  file_path: string;
  expiry_date: string | null;
  status: string;
  rejection_reason: string | null;
  submission_source: string;
  source_note: string | null;
  updated_at: string;
}

const identityDocuments = [
  ["driver_photo", "Driver photo"],
  ["license_front", "Driving license · front"],
  ["license_back", "Driving license · back"],
  ["national_id_front", "National ID · front"],
  ["national_id_back", "National ID · back"],
] as const;

const vehicleDocuments = [
  ["vehicle_registration", "Vehicle registration"],
  ["insurance", "Insurance certificate"],
  ["transport_permit", "Transport permit"],
  ["truck_front", "Truck photo · front"],
  ["truck_back", "Truck photo · back"],
  ["truck_side", "Truck photo · side"],
  ["truck_loading_area", "Loading area photo"],
] as const;

const allDocuments = [...identityDocuments, ...vehicleDocuments] as const;
const vehicleDocumentKeys = new Set<string>(vehicleDocuments.map(([key]) => key));
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function labelFor(key: string) {
  return allDocuments.find(([value]) => value === key)?.[1] ?? key.replace(/_/g, " ");
}

function dateTime(value: string) {
  return new Date(value).toLocaleString();
}

function statusClass(status: string) {
  if (status === "verified") return "bg-emerald-100 text-emerald-800";
  if (status === "rejected") return "bg-route/10 text-route";
  return "bg-amber/15 text-amber-dim";
}

export function AdminManualDriverDocuments() {
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [trucks, setTrucks] = useState<TruckRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [driverId, setDriverId] = useState("");
  const [documentKey, setDocumentKey] = useState<string>("driver_photo");
  const [truckId, setTruckId] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [sourceNote, setSourceNote] = useState("Received from driver through WhatsApp");
  const [verifyNow, setVerifyNow] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    const [driverResult, truckResult, documentResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id,full_name,phone,driver_status")
        .eq("role", "driver")
        .order("full_name"),
      supabase
        .from("trucks")
        .select("id,plate_number,vehicle_type,status,driver_id,created_by")
        .order("plate_number"),
      supabase
        .from("driver_verification_files")
        .select("id,driver_id,truck_id,document_key,original_name,file_path,expiry_date,status,rejection_reason,submission_source,source_note,updated_at")
        .order("updated_at", { ascending: false })
        .limit(1000),
    ]);

    const queryError = driverResult.error || truckResult.error || documentResult.error;
    if (queryError) {
      setError(queryError.message);
      setLoading(false);
      return;
    }

    const nextDrivers = (driverResult.data ?? []) as DriverRow[];
    setDrivers(nextDrivers);
    setTrucks((truckResult.data ?? []) as TruckRow[]);
    setDocuments((documentResult.data ?? []) as DocumentRow[]);
    setDriverId((current) => current || nextDrivers[0]?.id || "");
    setError("");
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const selectedDriver = drivers.find((driver) => driver.id === driverId);
  const linkedTrucks = useMemo(
    () => trucks.filter((truck) => truck.driver_id === driverId || truck.created_by === driverId),
    [driverId, trucks],
  );
  const needsTruck = vehicleDocumentKeys.has(documentKey);
  const selectedDocuments = documents.filter((document) => document.driver_id === driverId);

  useEffect(() => {
    if (!needsTruck) {
      setTruckId("");
      return;
    }
    setTruckId((current) => linkedTrucks.some((truck) => truck.id === current) ? current : linkedTrucks[0]?.id || "");
  }, [driverId, linkedTrucks, needsTruck]);

  async function openFile(path: string) {
    setError("");
    const { data, error: signedError } = await supabase.storage.from("driver-verification").createSignedUrl(path, 300);
    if (signedError) {
      setError(signedError.message);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setError("");

    if (!driverId) return setError("Select a driver.");
    if (needsTruck && !truckId) return setError("Select the driver's truck for this vehicle document.");
    if (!file) return setError("Choose a document file.");
    if (!allowedTypes.has(file.type)) return setError("Document must be JPG, PNG, WebP or PDF.");
    if (file.size > 10 * 1024 * 1024) return setError("Document must be 10 MB or smaller.");

    setSaving(true);
    const fallbackExtension = file.type === "application/pdf" ? "pdf" : "jpg";
    const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || fallbackExtension;
    const path = `${driverId}/admin/${documentKey}/${crypto.randomUUID()}.${extension}`;

    const upload = await supabase.storage.from("driver-verification").upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

    if (upload.error) {
      setError(upload.error.message);
      setSaving(false);
      return;
    }

    try {
      const { error: rpcError } = await supabase.rpc("admin_upsert_driver_document", {
        p_driver_id: driverId,
        p_truck_id: needsTruck ? truckId : null,
        p_document_key: documentKey,
        p_file_path: path,
        p_original_name: file.name,
        p_mime_type: file.type,
        p_expiry_date: expiryDate || null,
        p_verify: verifyNow,
        p_source_note: sourceNote.trim() || null,
      });
      if (rpcError) throw rpcError;

      setNotice(`${labelFor(documentKey)} saved for ${selectedDriver?.full_name ?? "driver"}${verifyNow ? " and verified" : " as pending review"}.`);
      setFile(null);
      setFileInputKey((value) => value + 1);
      setExpiryDate("");
      await load();
    } catch (saveError) {
      await supabase.storage.from("driver-verification").remove([path]);
      setError(saveError instanceof Error ? saveError.message : "Document could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f3ed] p-4 text-asphalt sm:p-7">
      <div className="mx-auto max-w-6xl">
        <header className="bg-asphalt p-6 text-white sm:p-8">
          <p className="font-mono text-[10px] tracking-[.2em] text-amber">ADMIN DOCUMENT INTAKE</p>
          <h1 className="mt-3 font-display text-3xl font-bold">Manual driver document upload</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
            Upload a document received through WhatsApp or in person, link it to the correct driver or truck, and either verify it immediately or send it to the existing review queue.
          </p>
        </header>

        {error && <p className="mt-5 border border-route/30 bg-route/5 p-4 text-sm text-route">{error}</p>}
        {notice && <p className="mt-5 border border-emerald-700/25 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">✓ {notice}</p>}

        <div className="mt-5 grid gap-5 lg:grid-cols-[.85fr_1.15fr]">
          <form onSubmit={submit} className="border border-asphalt/10 bg-white p-5 sm:p-6">
            <h2 className="font-display text-xl font-bold">Add or replace document</h2>
            <p className="mt-2 text-xs leading-5 text-steel">Replacing a current document automatically archives the previous version.</p>

            <label className="mt-5 block text-sm font-semibold">Driver
              <select value={driverId} onChange={(event) => setDriverId(event.target.value)} className="mt-2 block w-full border border-asphalt/20 bg-white p-3 font-normal" required>
                <option value="" disabled>Select driver</option>
                {drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.full_name ?? "Driver"} · {driver.phone ?? "No phone"} · {driver.driver_status ?? "pending"}</option>)}
              </select>
            </label>

            <label className="mt-4 block text-sm font-semibold">Document type
              <select value={documentKey} onChange={(event) => setDocumentKey(event.target.value)} className="mt-2 block w-full border border-asphalt/20 bg-white p-3 font-normal">
                <optgroup label="Driver identity">
                  {identityDocuments.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </optgroup>
                <optgroup label="Vehicle documents and photos">
                  {vehicleDocuments.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </optgroup>
              </select>
            </label>

            {needsTruck && <label className="mt-4 block text-sm font-semibold">Driver truck
              <select value={truckId} onChange={(event) => setTruckId(event.target.value)} className="mt-2 block w-full border border-asphalt/20 bg-white p-3 font-normal" required>
                <option value="" disabled>Select linked truck</option>
                {linkedTrucks.map((truck) => <option key={truck.id} value={truck.id}>{truck.plate_number} · {truck.vehicle_type} · {truck.status}</option>)}
              </select>
              {!linkedTrucks.length && <span className="mt-2 block text-xs font-normal text-route">This driver has no registered or assigned truck. Add the vehicle first.</span>}
            </label>}

            <label className="mt-4 block text-sm font-semibold">Document file
              <input key={fileInputKey} type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-2 block w-full border border-asphalt/20 bg-white p-3 font-normal" required />
              <span className="mt-2 block text-xs font-normal text-steel">JPG, PNG, WebP or PDF · maximum 10 MB</span>
            </label>

            <label className="mt-4 block text-sm font-semibold">Expiry date <span className="font-normal text-steel">(optional)</span>
              <input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} className="mt-2 block w-full border border-asphalt/20 p-3 font-normal" />
            </label>

            <label className="mt-4 block text-sm font-semibold">Source note
              <textarea value={sourceNote} onChange={(event) => setSourceNote(event.target.value)} rows={3} maxLength={500} className="mt-2 block w-full border border-asphalt/20 p-3 font-normal" />
            </label>

            <label className="mt-4 flex items-start gap-3 border border-emerald-700/20 bg-emerald-50 p-4 text-sm">
              <input type="checkbox" checked={verifyNow} onChange={(event) => setVerifyNow(event.target.checked)} className="mt-0.5" />
              <span><strong>Save and verify now</strong><span className="mt-1 block text-xs text-steel">Turn this off to save it as Pending for a second reviewer.</span></span>
            </label>

            <button disabled={saving || loading || (needsTruck && !truckId)} className="mt-5 w-full bg-asphalt py-4 font-semibold text-white disabled:opacity-40">{saving ? "Uploading and saving…" : verifyNow ? "Upload & verify document" : "Upload as pending"}</button>
          </form>

          <section className="border border-asphalt/10 bg-white">
            <div className="border-b border-asphalt/10 p-5 sm:p-6">
              <p className="font-mono text-[10px] tracking-[.16em] text-amber-dim">CURRENT FILES</p>
              <h2 className="mt-2 font-display text-xl font-bold">{selectedDriver?.full_name ?? "Select a driver"}</h2>
              <p className="mt-1 text-xs text-steel">{selectedDocuments.length} current documents · Admin manual source is recorded in the audit trail.</p>
            </div>

            {loading ? <p className="p-8 text-center font-mono text-xs text-steel">Loading documents…</p> : selectedDocuments.length ? (
              <div className="divide-y divide-asphalt/10">
                {selectedDocuments.map((document) => {
                  const truck = document.truck_id ? trucks.find((item) => item.id === document.truck_id) : null;
                  return <article key={document.id} className="p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0"><p className="font-semibold">{labelFor(document.document_key)}</p><p className="mt-1 truncate text-xs text-steel">{document.original_name}</p>{truck && <p className="mt-1 text-xs text-steel">{truck.plate_number} · {truck.vehicle_type}</p>}</div>
                      <span className={`px-3 py-1.5 text-[10px] font-semibold uppercase ${statusClass(document.status)}`}>{document.status}</span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                      <p><span className="block text-steel">Source</span><strong className="mt-1 block capitalize">{document.submission_source.replace(/_/g, " ")}</strong></p>
                      <p><span className="block text-steel">Updated</span><strong className="mt-1 block">{dateTime(document.updated_at)}</strong></p>
                      <p><span className="block text-steel">Expiry</span><strong className="mt-1 block">{document.expiry_date ?? "No expiry"}</strong></p>
                      <p><span className="block text-steel">Note</span><strong className="mt-1 block">{document.source_note ?? "—"}</strong></p>
                    </div>
                    {document.rejection_reason && <p className="mt-3 border-l-4 border-route bg-route/5 p-3 text-xs text-route">{document.rejection_reason}</p>}
                    <button type="button" onClick={() => void openFile(document.file_path)} className="mt-4 border border-asphalt px-4 py-2 text-xs font-semibold">Open private file</button>
                  </article>;
                })}
              </div>
            ) : <p className="p-8 text-center text-sm text-steel">No documents recorded for this driver.</p>}
          </section>
        </div>
      </div>
    </main>
  );
}
