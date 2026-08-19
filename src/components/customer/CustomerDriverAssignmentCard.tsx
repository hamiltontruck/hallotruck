import { useEffect, useState } from "react";
import { supabase } from "../../services/supabase.client";
import type { CustomerDriverAssignment, CustomerOrder } from "../../services/customer.service";
import "./customer-assignment-card.css";

interface AssignmentWithPhoto extends CustomerDriverAssignment {
  driver_photo_path?: string | null;
}

const PHOTO_URL_TTL_SECONDS = 3600;

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
          ? supabase.storage.from("driver-verification").createSignedUrl(assignment.driver_photo_path, PHOTO_URL_TTL_SECONDS)
          : Promise.resolve({ data: null, error: null }),
        assignment.truck_photo_path
          ? supabase.storage.from("driver-verification").createSignedUrl(assignment.truck_photo_path, PHOTO_URL_TTL_SECONDS)
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (cancelled) return;
      setDriverPhotoUrl(driverResult.error ? null : driverResult.data?.signedUrl ?? null);
      setTruckPhotoUrl(truckResult.error ? null : truckResult.data?.signedUrl ?? null);
    }

    void loadPhotos();
    return () => { cancelled = true; };
  }, [assignment.driver_photo_path, assignment.driver_verified, assignment.truck_photo_path]);

  const verificationLabel = assignment.driver_verified ? labels.verifiedDriver : labels.verificationPending;
  const driverInitial = assignment.driver_name?.trim()?.charAt(0)?.toUpperCase() || "D";
  const truckType = assignment.vehicle_type ?? order.vehicle_type;

  return (
    <section className="customer-assignment-card min-w-0 overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
      <header className="flex min-w-0 items-center justify-between gap-3 bg-asphalt px-4 py-3 text-white">
        <p className="min-w-0 font-mono text-[10px] uppercase tracking-[.16em] text-amber">{labels.assigned}</p>
        <span className={`shrink-0 rounded-full px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wide ${assignment.driver_verified ? "bg-emerald-600 text-white" : "border border-amber/40 bg-amber/10 text-amber"}`}>
          {verificationLabel}
        </span>
      </header>

      <div className="grid gap-0 sm:grid-cols-2">
        <div className="flex min-w-0 items-center gap-3 border-b border-asphalt/10 p-3 sm:border-b-0 sm:border-r">
          <button
            type="button"
            disabled={!truckPhotoUrl}
            onClick={() => truckPhotoUrl && window.open(truckPhotoUrl, "_blank", "noopener,noreferrer")}
            className="grid h-16 w-24 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#e8eee8] disabled:cursor-default"
            aria-label={labels.viewTruckPhoto}
          >
            {truckPhotoUrl ? (
              <img src={truckPhotoUrl} alt="" className="h-full w-full object-cover" onError={() => setTruckPhotoUrl(null)} />
            ) : (
              <span className="px-2 text-center text-[9px] font-semibold uppercase tracking-wide text-steel">{labels.truck}</span>
            )}
          </button>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[9px] uppercase tracking-[.14em] text-steel">{labels.truckPlate}</p>
            <p className="mt-1 truncate font-display text-lg font-bold text-asphalt">{assignment.plate_number ?? labels.pending}</p>
            <p className="mt-0.5 truncate text-xs text-steel">{truckType}{assignment.capacity_tons ? ` · ${assignment.capacity_tons} tons` : ""}</p>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-3 p-3">
          <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-emerald-100 bg-emerald-100">
            {driverPhotoUrl ? (
              <img src={driverPhotoUrl} alt="" className="h-full w-full object-cover" onError={() => setDriverPhotoUrl(null)} />
            ) : (
              <span className="font-display text-lg font-bold text-emerald-800">{driverInitial}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[9px] uppercase tracking-[.14em] text-steel">Driver</p>
            <p className="mt-1 truncate font-display text-base font-semibold text-asphalt">{assignment.driver_name}</p>
            <a href={`tel:${assignment.driver_phone}`} className="mt-0.5 block truncate text-xs font-semibold text-emerald-800">{assignment.driver_phone}</a>
          </div>
          <a
            href={`tel:${assignment.driver_phone}`}
            aria-label={`Call ${assignment.driver_name}`}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-emerald-200 bg-emerald-50 text-xl text-emerald-800"
          >
            ☎
          </a>
        </div>
      </div>

      <p className="border-t border-asphalt/10 px-4 py-2 text-[9px] leading-relaxed text-steel">{labels.privacy}</p>
    </section>
  );
}
