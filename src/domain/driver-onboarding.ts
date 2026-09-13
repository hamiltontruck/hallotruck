import { isCurrentVerifiedDocument } from "./driver-document-review";

export const DRIVER_IDENTITY_DOCUMENT_KEYS = [
  "driver_photo",
  "license_front",
  "license_back",
  "national_id_front",
  "national_id_back",
] as const;

export const DRIVER_VEHICLE_DOCUMENT_KEYS = [
  "vehicle_registration",
  "truck_front",
  "truck_side",
] as const;

type OnboardingDocument = {
  document_key: string;
  status: string;
  expiry_date?: string | null;
};

function countStatus(documentsByKey: Map<string, OnboardingDocument>, keys: readonly string[], status: string) {
  return keys.filter((key) => {
    const doc = documentsByKey.get(key);
    return doc?.status === status && (status !== "verified" || isCurrentVerifiedDocument({ ...doc, document_key: key, expiry_date: doc.expiry_date ?? null }));
  }).length;
}

export function getDriverOnboardingProgress(documents: OnboardingDocument[]) {
  const documentsByKey = new Map(documents.map((document) => [document.document_key, document]));
  const requiredKeys = [...DRIVER_IDENTITY_DOCUMENT_KEYS, ...DRIVER_VEHICLE_DOCUMENT_KEYS];
  const identityVerified = countStatus(documentsByKey, DRIVER_IDENTITY_DOCUMENT_KEYS, "verified");
  const vehicleVerified = countStatus(documentsByKey, DRIVER_VEHICLE_DOCUMENT_KEYS, "verified");
  const verified = identityVerified + vehicleVerified;
  const pending = countStatus(documentsByKey, requiredKeys, "pending");
  const rejected = countStatus(documentsByKey, requiredKeys, "rejected");
  const required = requiredKeys.length;

  return {
    required,
    verified,
    pending,
    rejected,
    missing: Math.max(0, required - verified - pending - rejected),
    percent: required ? Math.round((verified / required) * 100) : 0,
    identityVerified,
    vehicleVerified,
  };
}
