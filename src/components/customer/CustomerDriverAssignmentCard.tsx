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

  useEffect(() => {
    let cancelled = false;
    const path = assignment.driver_photo_path;
    if (!path || !assignment.driver_verified) {
      setDriverPhotoUrl(null);
      return;
    }
    void supabase.storage.from("driver-verification").createSignedUrl(path, 300).then(({ data, error }) => {
      if (!cancelled && !error) setDriverPhotoUrl(data.signedUrl);
    });
    return () => { cancelled = true; };
  }, [assignment.driver_photo_path, assignment.driver_verified]);

  return (
    <div className="mt-5 overflow-hidden border border-emerald-200 bg-emerald-50">
      <div className="bg-asphalt px-4 py-3 text-white sm:px-5">
        <p className="font-mono text-[10px] tracking-[.18em] text-amber">{labels.assigned}</p>
      </div>
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-4">
          <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full border-4 border-white bg-emerald-100 shadow-sm">
            {driverPhotoUrl ? <img src={driverPhotoUrl} alt={assignment.driver_name} className="h-full w-full object-cover" /> : <span className="font-display text-2xl font-bold text-emerald-800">{assignment.driver_name?.trim()?.charAt(0)?.toUpperCase() || "D"}</span>}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-display text-xl font-semibold text-asphalt">{assignment.driver_name}</p>
                <a href={`tel:${assignment.driver_phone}`} className="mt-1 inline-block text-sm font-semibold text-emerald-800">{assignment.driver_phone}</a>
              </div>
              <span className={`px-3 py-2 text-[10px] font-semibold uppercase ${assignment.driver_verified ? "bg-emerald-700 text-white" : "border border-amber/30 bg-amber/10 text-amber-dim"}`}>
                {assignment.driver_verified ? labels.verifiedDriver : labels.verificationPending}
              </span>
            </div>
            <div className="mt-4 border border-emerald-200 bg-white p-3">
              <p className="font-mono text-[10px] uppercase tracking-[.16em] text-steel">{labels.truckPlate}</p>
              <p className="mt-1 font-display text-2xl font-bold text-asphalt">{assignment.plate_number ?? labels.pending}</p>
              <p className="mt-1 text-sm text-steel">{assignment.vehicle_type ?? order.vehicle_type}{assignment.capacity_tons ? ` · ${assignment.capacity_tons} tons` : ""}</p>
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
          <SafeInfo label={labels.license} value={assignment.license_verified ? labels.verified : labels.pending} />
          <SafeInfo label={labels.nationalId} value={assignment.national_id_verified ? labels.verified : labels.pending} />
        </div>
        {assignment.truck_photo_path && <button onClick={async () => {
          const { data, error } = await supabase.storage.from("driver-verification").createSignedUrl(assignment.truck_photo_path!, 300);
          if (!error) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
        }} className="mt-4 border border-emerald-700 px-4 py-2.5 text-xs font-semibold text-emerald-800">{labels.viewTruckPhoto}</button>}
        <p className="mt-3 text-[10px] leading-relaxed text-emerald-900/65">{labels.privacy}</p>
      </div>
    </div>
  );
}

function SafeInfo({ label, value }: { label: string; value: string }) {
  return <div className="bg-white/70 p-3"><p className="text-[10px] uppercase tracking-wider text-emerald-900/55">{label}</p><p className="mt-1 font-semibold text-emerald-950">{value}</p></div>;
}
