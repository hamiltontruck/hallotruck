import { useEffect, useMemo, useState } from "react";
import { createCustomerAssignmentPhotoUrl, type CustomerMobileAssignment } from "./customer-assignment.service";

function initials(value: string | null | undefined) {
  const parts = (value || "Driver").trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "DR";
}

export function CustomerAssignmentCard({
  userId,
  assignment,
  orderVehicleType,
  trackingAvailable = false,
  onTrack,
}: {
  userId: string;
  assignment?: CustomerMobileAssignment;
  orderVehicleType?: string | null;
  trackingAvailable?: boolean;
  onTrack?: () => void;
}) {
  const [driverPhotoUrl, setDriverPhotoUrl] = useState<string | null>(null);
  const [truckPhotoUrl, setTruckPhotoUrl] = useState<string | null>(null);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [photoError, setPhotoError] = useState("");

  useEffect(() => {
    let active = true;
    setDriverPhotoUrl(null);
    setTruckPhotoUrl(null);
    setPhotoError("");

    if (!assignment) return () => { active = false; };
    const driverPath = assignment.driver_verified ? assignment.driver_photo_path?.trim() : "";
    const truckPath = assignment.truck_photo_path?.trim();
    if (!driverPath && !truckPath) return () => { active = false; };

    setPhotosLoading(true);
    void Promise.allSettled([
      driverPath ? createCustomerAssignmentPhotoUrl(userId, driverPath) : Promise.resolve(null),
      truckPath ? createCustomerAssignmentPhotoUrl(userId, truckPath) : Promise.resolve(null),
    ]).then(([driverResult, truckResult]) => {
      if (!active) return;
      setDriverPhotoUrl(driverResult.status === "fulfilled" ? driverResult.value : null);
      setTruckPhotoUrl(truckResult.status === "fulfilled" ? truckResult.value : null);
      if (driverResult.status === "rejected" || truckResult.status === "rejected") {
        setPhotoError("One assignment photo could not be loaded.");
      }
    }).finally(() => {
      if (active) setPhotosLoading(false);
    });

    return () => { active = false; };
  }, [assignment, userId]);

  const driverInitials = useMemo(() => initials(assignment?.driver_name), [assignment?.driver_name]);
  const truckType = assignment?.vehicle_type || orderVehicleType || "Truck details pending";
  const phone = assignment?.driver_phone?.trim() || "";

  return (
    <section className="customer-v4-assignment" aria-busy={photosLoading}>
      <header className="customer-v4-assignment__header">
        <strong>ASSIGNED DRIVER &amp; TRUCK</strong>
        <span className={assignment?.driver_verified ? "is-verified" : "is-pending"}>
          {assignment?.driver_verified ? "✓ VERIFIED DRIVER" : "VERIFICATION PENDING"}
        </span>
      </header>

      {!assignment ? (
        <div className="customer-v4-assignment__missing">
          <strong>Assignment details are loading or not available yet.</strong>
          <span>No Driver or truck data is guessed. This card updates only from the secure Customer assignment source.</span>
        </div>
      ) : (
        <div className="customer-v4-assignment__body">
          <div className="customer-v4-assignment__truck">
            <div className="customer-v4-assignment__truck-photo">
              {truckPhotoUrl ? (
                <img src={truckPhotoUrl} alt="Assigned truck" onError={() => setTruckPhotoUrl(null)} />
              ) : (
                <span aria-label="Truck photo unavailable">🚚</span>
              )}
              {photosLoading && !truckPhotoUrl && <small>Loading photo…</small>}
            </div>
            <div className="customer-v4-assignment__copy">
              <small>TRUCK</small>
              <strong>{assignment.plate_number || "Plate pending"}</strong>
              <span>{truckType}{assignment.capacity_tons != null ? ` · ${assignment.capacity_tons} ton` : ""}</span>
            </div>
          </div>

          <div className="customer-v4-assignment__driver">
            <div className="customer-v4-assignment__avatar" aria-label={driverPhotoUrl ? "Driver profile photo" : "Driver photo fallback"}>
              {driverPhotoUrl ? (
                <img src={driverPhotoUrl} alt="Assigned Driver" onError={() => setDriverPhotoUrl(null)} />
              ) : (
                <strong>{driverInitials}</strong>
              )}
            </div>
            <div className="customer-v4-assignment__copy">
              <small>DRIVER</small>
              <strong>{assignment.driver_name || "Assigned Driver"}</strong>
              <span>{phone || "Phone unavailable"}</span>
            </div>
            {phone ? (
              <a className="customer-v4-call" href={`tel:${phone}`} aria-label={`Call ${assignment.driver_name || "Driver"}`}>☎</a>
            ) : (
              <span className="customer-v4-call is-disabled" aria-label="Driver phone unavailable">☎</span>
            )}
          </div>
        </div>
      )}

      {photoError && <p className="customer-v4-assignment__note" role="status">{photoError} Fallback is shown instead.</p>}
      {trackingAvailable && onTrack && (
        <button type="button" className="customer-v4-track-action" onClick={onTrack}>Live trip tracking →</button>
      )}
    </section>
  );
}
