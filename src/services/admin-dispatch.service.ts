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
