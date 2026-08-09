import { useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase.client";
import type { DriverVerificationFile } from "../services/driver.service";

type DriverRow = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  home_address: string | null;
  driver_status: string | null;
};

type TruckRow = {
  id: string;
  plate_number: string;
  vehicle_type: string;
  capacity_tons: number | null;
  status: string;
  driver_id: string | null;
};

const identityRequired = ["driver_photo", "license_front", "license_back", "national_id_front", "national_id_back"];

const labels: Record<string, string> = {
  driver_photo: "Driver photo",
  license_front: "Driving license · front",
  license_back: "Driving license · back",
  national_id_front: "National ID · front",
  national_id_back: "National ID · back",
  vehicle_registration: "Vehicle registration",
  insurance: "Insurance certificate",
  transport_permit: "Transport permit",
  truck_front: "Truck photo · front",
  truck_back: "Truck photo · back",
  truck_side: "Truck photo · side",
  truck_loading_area: "Loading area photo",
};

export function AdminDriverCompliance() {
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [trucks, setTrucks] = useState<TruckRow[]>([]);
  const [documents, setDocuments] = useState<DriverVerificationFile[]>([]);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const [driverResult, truckResult, documentResult] = await Promise.all([
      supabase.from("profiles").select("id,full_name,phone,email,home_address,driver_status").eq("role", "driver").order("full_name"),
      supabase.from("trucks").select("id,plate_number,vehicle_type,capacity_tons,status,driver_id").order("plate_number"),
      supabase.from("driver_verification_files").select("id,driver_id,truck_id,document_key,file_path,original_name,mime_type,expiry_date,status,rejection_reason,reviewed_at,created_at,updated_at").order("updated_at", { ascending: false }),
    ]);
    const queryError = driverResult.error || truckResult.error || documentResult.error;
    if (queryError) setError(queryError.message);
    else {
      setDrivers((driverResult.data ?? []) as DriverRow[]);
      setTrucks((truckResult.data ?? []) as TruckRow[]);
      setDocuments((documentResult.data ?? []) as DriverVerificationFile[]);
      setError("");
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const visibleDrivers = useMemo(() => filter === "all" ? drivers : drivers.filter((driver) => documents.some((doc) => doc.driver_id === driver.id && doc.status === "pending")), [drivers, documents, filter]);

  async function openFile(path: string) {
    const { data, error } = await supabase.storage.from("driver-verification").createSignedUrl(path, 300);
    if (error) { setError(error.message); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function review(doc: DriverVerificationFile, status: "verified" | "rejected") {
    const reason = status === "rejected" ? window.prompt("Rejection / correction note for the driver:", "Please upload a clearer valid document.") : null;
    if (status === "rejected" && reason === null) return;
    setBusy(doc.id); setError("");
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("driver_verification_files").update({
      status,
      rejection_reason: status === "rejected" ? reason?.trim() || "Document rejected by reviewer." : null,
      reviewed_by: auth.user?.id ?? null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", doc.id);
    if (error) setError(error.message);
    else await load();
    setBusy("");
  }

  async function approveDriver(driver: DriverRow) {
    setBusy(driver.id); setError("");
    const driverDocs = documents.filter((doc) => doc.driver_id === driver.id && doc.truck_id === null);
    const complete = identityRequired.every((key) => driverDocs.some((doc) => doc.document_key === key && doc.status === "verified"));
    if (!complete) { setError("Verify the driver photo, both license sides and both national-ID sides before approval."); setBusy(""); return; }
    const { error } = await supabase.from("profiles").update({ driver_status: "approved" }).eq("id", driver.id);
    if (error) setError(error.message); else await load();
    setBusy("");
  }

  return <main className="min-h-screen bg-[#f5f3ed] p-4 text-asphalt sm:p-7 lg:p-10">
    <div className="mx-auto max-w-7xl">
      <section className="bg-asphalt p-6 text-white sm:p-8">
        <p className="font-mono text-[10px] tracking-[.2em] text-amber">COMPLIANCE CONTROL</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h1 className="font-display text-3xl font-bold sm:text-4xl">Driver & vehicle verification</h1><p className="mt-2 max-w-2xl text-sm text-white/55">Review private identity and fleet records before drivers represent Hallo Truck on customer shipments.</p></div><a href="#/admin" className="border border-white/20 px-4 py-3 text-sm font-semibold">← Operations</a></div>
      </section>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2"><button onClick={() => setFilter("pending")} className={`px-4 py-2 text-xs font-semibold ${filter === "pending" ? "bg-asphalt text-white" : "border border-asphalt/15 bg-white"}`}>Pending review</button><button onClick={() => setFilter("all")} className={`px-4 py-2 text-xs font-semibold ${filter === "all" ? "bg-asphalt text-white" : "border border-asphalt/15 bg-white"}`}>All drivers</button></div>
        <span className="font-mono text-xs text-steel">{documents.filter((doc) => doc.status === "pending").length} files pending</span>
      </div>

      {error && <p className="mt-5 border border-route/30 bg-route/5 p-4 text-sm text-route">{error}</p>}
      {loading ? <p className="py-16 text-center font-mono text-sm text-steel">Loading compliance records…</p> : visibleDrivers.length === 0 ? <div className="mt-5 border border-asphalt/10 bg-white p-10 text-center"><p className="font-display text-xl font-semibold">No drivers in this view</p><p className="mt-2 text-sm text-steel">Pending verification submissions will appear here.</p></div> : <div className="mt-5 grid gap-5">
        {visibleDrivers.map((driver) => {
          const driverDocs = documents.filter((doc) => doc.driver_id === driver.id);
          const identityDocs = driverDocs.filter((doc) => !doc.truck_id);
          const verifiedIdentity = identityRequired.filter((key) => identityDocs.some((doc) => doc.document_key === key && doc.status === "verified")).length;
          const assignedTruck = trucks.find((truck) => truck.driver_id === driver.id) ?? (driverDocs.find((doc) => doc.truck_id)?.truck_id ? trucks.find((truck) => truck.id === driverDocs.find((doc) => doc.truck_id)?.truck_id) : undefined);
          return <article key={driver.id} className="border border-asphalt/10 bg-white">
            <div className="grid gap-5 border-b border-asphalt/10 p-5 sm:p-6 lg:grid-cols-[1fr_auto]">
              <div><div className="flex flex-wrap items-center gap-3"><h2 className="font-display text-2xl font-semibold">{driver.full_name}</h2><span className={`border px-2.5 py-1 text-[10px] font-semibold uppercase ${driver.driver_status === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber/30 bg-amber/10 text-amber-dim"}`}>{driver.driver_status ?? "pending"}</span></div><p className="mt-2 text-sm text-steel">{driver.phone}{driver.email ? ` · ${driver.email}` : ""}</p><p className="mt-1 text-xs text-steel">{driver.home_address || "Home address not supplied"}</p></div>
              <div className="min-w-52 bg-[#f5f3ed] p-4"><p className="font-mono text-[10px] text-steel">IDENTITY VERIFIED</p><p className="mt-1 font-display text-2xl font-bold">{verifiedIdentity} / {identityRequired.length}</p>{driver.driver_status !== "approved" && <button disabled={busy === driver.id || verifiedIdentity !== identityRequired.length} onClick={() => void approveDriver(driver)} className="mt-3 w-full bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-35">Approve driver</button>}</div>
            </div>

            {assignedTruck && <div className="border-b border-asphalt/10 bg-emerald-50/40 px-5 py-4 text-sm sm:px-6"><strong>{assignedTruck.plate_number}</strong> · {assignedTruck.vehicle_type} · {assignedTruck.capacity_tons ?? "—"} tons · <span className="capitalize">{assignedTruck.status}</span></div>}

            <div className="grid gap-px bg-asphalt/10 sm:grid-cols-2 xl:grid-cols-3">
              {driverDocs.length === 0 ? <div className="col-span-full bg-white p-6 text-sm text-steel">No verification files submitted yet.</div> : driverDocs.map((doc) => <div key={doc.id} className="bg-white p-5">
                <div className="flex items-start justify-between gap-3"><div><p className="font-display font-semibold">{labels[doc.document_key] ?? doc.document_key}</p><p className="mt-1 max-w-52 truncate text-xs text-steel">{doc.original_name}</p></div><span className={`px-2 py-1 text-[9px] font-semibold uppercase ${doc.status === "verified" ? "bg-emerald-50 text-emerald-800" : doc.status === "rejected" ? "bg-route/5 text-route" : "bg-amber/10 text-amber-dim"}`}>{doc.status}</span></div>
                {doc.expiry_date && <p className="mt-3 text-xs text-steel">Expiry: <strong className="text-asphalt">{doc.expiry_date}</strong></p>}
                {doc.rejection_reason && <p className="mt-3 text-xs text-route">{doc.rejection_reason}</p>}
                <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => void openFile(doc.file_path)} className="border border-asphalt px-3 py-2 text-xs font-semibold">Open file</button>{doc.status === "pending" && <><button disabled={busy === doc.id} onClick={() => void review(doc, "verified")} className="bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Verify</button><button disabled={busy === doc.id} onClick={() => void review(doc, "rejected")} className="border border-route/40 px-3 py-2 text-xs font-semibold text-route disabled:opacity-40">Reject</button></>}</div>
              </div>)}
            </div>
          </article>;
        })}
      </div>}
    </div>
  </main>;
}
