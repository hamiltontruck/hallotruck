import { supabase } from "./supabase.client";

export interface AssignmentCandidate {
  driver_id: string;
  driver_name: string | null;
  driver_phone: string | null;
  truck_id: string;
  plate_number: string;
  vehicle_type: string;
  capacity_tons: number | null;
  distance_km: number;
  location_accuracy_m: number | null;
  presence_updated_at: string;
}

export interface AdminCustomerDispatchPreference {
  order_id: string;
  driver_id: string;
  truck_id: string;
  status: "requested" | "approved" | "declined" | "expired" | "cancelled";
  distance_km: number | null;
  eta_minutes: number | null;
  updated_at: string;
}

export async function getOrderAssignmentCandidates(orderId: string): Promise<AssignmentCandidate[]> {
  const { data, error } = await supabase.rpc("admin_order_assignment_candidates", {
    p_order_id: orderId,
  });

  if (error) throw new Error(error.message);
  return ((data ?? []) as AssignmentCandidate[]).map((candidate) => ({
    ...candidate,
    capacity_tons: candidate.capacity_tons === null ? null : Number(candidate.capacity_tons),
    distance_km: Number(candidate.distance_km ?? 0),
    location_accuracy_m: candidate.location_accuracy_m === null ? null : Number(candidate.location_accuracy_m),
  }));
}

export async function getAdminCustomerDispatchPreference(orderId: string): Promise<AdminCustomerDispatchPreference | null> {
  const { data, error } = await supabase.rpc("admin_get_customer_dispatch_request", {
    p_order_id: orderId,
  });

  if (error) throw new Error(error.message);
  const preference = ((data ?? [])[0] ?? null) as AdminCustomerDispatchPreference | null;
  if (!preference) return null;

  return {
    ...preference,
    distance_km: preference.distance_km === null ? null : Number(preference.distance_km),
    eta_minutes: preference.eta_minutes === null ? null : Number(preference.eta_minutes),
  };
}
