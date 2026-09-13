import type { DriverVerificationFile } from "../services/driver.service";

export const DRIVER_DOCUMENT_GROUPS = [
  { key: "driver_photo", title: "Driver photo", vehicle: false, sides: [["driver_photo", "Photo"]] },
  { key: "license", title: "Driving license", vehicle: false, sides: [["license_front", "Front"], ["license_back", "Back"]] },
  { key: "national_id", title: "National ID", vehicle: false, sides: [["national_id_front", "Front"], ["national_id_back", "Back"]] },
  { key: "vehicle_registration", title: "Vehicle registration", vehicle: true, sides: [["vehicle_registration", "Front · Photo / PDF"]] },
  { key: "truck_photos", title: "Truck photos", vehicle: true, sides: [["truck_front", "Front"], ["truck_side", "Side"]] },
] as const;

export function documentExpiryLabel(key: string): string | null {
  if (key === "license_front") return "License expiry";
  if (key === "national_id_front") return "National ID expiry";
  return null;
}

export function isCurrentVerifiedDocument(doc: { status: string; document_key: string; expiry_date: string | null }, today = new Date()) {
  if (doc.status !== "verified") return false;
  if (!documentExpiryLabel(doc.document_key)) return true;
  if (!doc.expiry_date) return false;
  const expiry = Date.parse(`${doc.expiry_date}T23:59:59.999Z`);
  return Number.isFinite(expiry) && expiry >= today.getTime();
}

export function driverDocumentGroups(documents: DriverVerificationFile[], driverId: string, truckId: string | null) {
  return DRIVER_DOCUMENT_GROUPS.map((group) => {
    const slots = group.sides.map(([key, label]) => ({
      key, label,
      doc: documents.filter((doc) => doc.driver_id === driverId && doc.document_key === key
        && (group.vehicle ? truckId !== null && doc.truck_id === truckId : doc.truck_id === null))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0],
    }));
    const status = slots.some(({ doc }) => doc?.status === "rejected") ? "Corrections"
      : slots.some(({ doc }) => doc && documentExpiryLabel(doc.document_key) && doc.status === "verified" && !isCurrentVerifiedDocument(doc)) ? "Check expiry"
      : slots.some(({ doc }) => !doc) ? "Incomplete"
      : slots.every(({ doc }) => doc && isCurrentVerifiedDocument(doc)) ? "Verified" : "Pending";
    return { key: group.key, title: group.title, slots, status };
  });
}
export type DriverDocumentGroup = ReturnType<typeof driverDocumentGroups>[number];
