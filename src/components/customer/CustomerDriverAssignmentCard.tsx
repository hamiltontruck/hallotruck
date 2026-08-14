import { useEffect, useState } from "react";
import { supabase } from "../../services/supabase.client";
import type { CustomerDriverAssignment, CustomerOrder } from "../../services/customer.service";

interface AssignmentWithPhoto extends CustomerDriverAssignment {
  driver_photo_path?: string | null;
}

export function CustomerDriverAssignmentCard({ assignment, order, labels }: {
  assignment: AssignmentWithPhoto;
  order: CustomerOrder;
  labels: {
    assigned: string;
    verifiedDriver: string;
    verificationPending: string;
    license: string;
    nationalId: string;
    truckPlate: string;
    truck: string;
    verified: string;
    pending: string;
    viewTruckPhoto: string;
    privacy: string;
  };
}) {
  const [driverPhotoUrl, setDriverPhotoUrl] = useState<string | null>(null);
  const [truckPhotoUrl, setTruckPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPhotos() {
      const [driverResult, truckResult] = await Promise.all([
        assignment.driver_photo_path && assignment.driver_verified
          ? supabase.storage.from("driver-verification").createSignedUrl(assignment.driver_photo_path, 300)
          : Promise.resolve({ data: null, error: null }),
        assignment.truck_photo_path
          ? supabase.storage.from("driver-verification").createSignedUrl(assignment.truck_photo_path, 300)
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (cancelled) return;
      setDriverPhotoUrl(driverResult.error ? null : driverResult.data?.signedUrl ?? null);
      setTruckPhotoUrl(truckResult.error ? null : truckResult.data?.signedUrl ?? null);
    }

    void loadPhotos();
    return () => { cancelled = true; };
  }, [assignment.driver_photo_path, assignment.driver_verified, assignment.truck_photo_path]);

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 shadow-sm">
      <div className="flex items-center justify-between gap-3 bg-asphalt px-4 py-3 text-white sm:px-5">
        <p className="font-mono text-[10px] tracking-[.18em] text-amber">{labels.assigned}</p>
        <span className={`rounded-full px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wide ${assignment.driver_verified ? "bg-emerald-600 text-white" : "border border-amber/40 bg-amber/10 text-amber"}`}>
          {assignment.driver_verified ? labels.verifiedDriver : labels.verificationPending}
        </span>
      </div>

      <div className="p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,.8fr)]">
          <div className="rounded-2xl border border-emerald-200 bg-white p-4">
            <div className="flex items-center gap-4">
              <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full border-4 border-emerald-50 bg-emerald-100 shadow-sm">
                {driverPhotoUrl ? <img src={driverPhotoUrl} alt={assignment.driver_name} className="h-full w-full object-cover" /> : <span className="font-display text-2xl font-bold text-emerald-800">{assignment.driver_name?.trim()?.charAt(0)?.toUpperCase() || "D"}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[9px] uppercase tracking-[.16em] text-steel">Driver</p>
                <p className="mt-1 truncate font-display text-xl font-semibold text-asphalt">{assignment.driver_name}</p>
                <a href={`tel:${assignment.driver_phone}`} className="mt-1 inline-flex min-h-9 items-center text-sm font-semibold text-emerald-800">{assignment.driver_phone}</a>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <SafeInfo label={labels.license} value={assignment.license_verified ? labels.verified : labels.pending} />
              <SafeInfo label={labels.nationalId} value={assignment.national_id_verified ? labels.verified : labels.pending} />
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white">
            <button
              type="button"
              disabled={!truckPhotoUrl}
              onClick={() => truckPhotoUrl && window.open(truckPhotoUrl, "_blank", "noopener,noreferrer")}
              className="block h-40 w-full overflow-hidden bg-[#e8eee8] text-left disabled:cursor-default sm:h-44"
              aria-label={labels.viewTruckPhoto}
            >
              {truckPhotoUrl ? <img src={truckPhotoUrl} alt={`${assignment.plate_number ?? labels.truck} ${labels.truck}`} className="h-full w-full object-cover transition duration-200 hover:scale-[1.02]" /> : <span className="grid h-full place-items-center px-4 text-center text-xs font-semibold text-steel">{labels.truck} · {labels.pending}</span>}
            </button>
            <div className="p-4">
              <p className="font-mono text-[9px] uppercase tracking-[.16em] text-steel">{labels.truckPlate}</p>
              <p className="mt-1 font-display text-2xl font-bold text-asphalt">{assignment.plate_number ?? labels.pending}</p>
              <p className="mt-1 text-sm text-steel">{assignment.vehicle_type ?? order.vehicle_type}{assignment.capacity_tons ? ` · ${assignment.capacity_tons} tons` : ""}</p>
              {truckPhotoUrl && <button type="button" onClick={() => window.open(truckPhotoUrl, "_blank", "noopener,noreferrer")} className="mt-3 min-h-10 w-full rounded-xl border border-emerald-700 px-4 py-2.5 text-xs font-semibold text-emerald-800">{labels.viewTruckPhoto}</button>}
            </div>
          </div>
        </div>

        <p className="mt-4 text-[10px] leading-relaxed text-emerald-900/65">{labels.privacy}</p>
      </div>
    </section>
  );
}

function SafeInfo({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-emerald-50/80 p-3"><p className="text-[9px] uppercase tracking-wider text-emerald-900/55">{label}</p><p className="mt-1 font-semibold text-emerald-950">{value}</p></div>;
}
