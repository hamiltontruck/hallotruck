import { supabase } from "./supabase.client";

export interface CustomerTruckCandidate {
  driver_id: string;
  driver_name: string | null;
  driver_rating: number | null;
  completed_trips: number;
  truck_id: string;
  plate_number: string;
  vehicle_type: string;
  capacity_tons: number | null;
  distance_km: number;
  eta_minutes: number;
  is_requested: boolean;
}

export interface CustomerDispatchRequest {
  order_id: string;
  driver_id: string;
  driver_name: string | null;
  truck_id: string;
  plate_number: string;
  vehicle_type: string;
  capacity_tons: number | null;
  status: "requested" | "approved" | "declined" | "expired" | "cancelled";
  distance_km: number | null;
  eta_minutes: number | null;
  updated_at: string;
}

export async function getCustomerTruckCandidates(orderId: string): Promise<CustomerTruckCandidate[]> {
  const { data, error } = await supabase.rpc("customer_order_assignment_candidates", {
    p_order_id: orderId,
  });

  if (error) throw new Error(error.message);
  return ((data ?? []) as CustomerTruckCandidate[]).map((candidate) => ({
    ...candidate,
    driver_rating: candidate.driver_rating === null ? null : Number(candidate.driver_rating),
    completed_trips: Number(candidate.completed_trips ?? 0),
    capacity_tons: candidate.capacity_tons === null ? null : Number(candidate.capacity_tons),
    distance_km: Number(candidate.distance_km ?? 0),
    eta_minutes: Number(candidate.eta_minutes ?? 0),
    is_requested: Boolean(candidate.is_requested),
  }));
}

export async function getCustomerDispatchRequest(orderId: string): Promise<CustomerDispatchRequest | null> {
  const { data, error } = await supabase.rpc("customer_get_dispatch_request", {
    p_order_id: orderId,
  });

  if (error) throw new Error(error.message);
  const request = ((data ?? [])[0] ?? null) as CustomerDispatchRequest | null;
  if (!request) return null;

  return {
    ...request,
    capacity_tons: request.capacity_tons === null ? null : Number(request.capacity_tons),
    distance_km: request.distance_km === null ? null : Number(request.distance_km),
    eta_minutes: request.eta_minutes === null ? null : Number(request.eta_minutes),
  };
}

export async function requestCustomerTruck(orderId: string, driverId: string, truckId: string) {
  const { error } = await supabase.rpc("customer_request_dispatch_candidate", {
    p_order_id: orderId,
    p_driver_id: driverId,
    p_truck_id: truckId,
  });

  if (error) throw new Error(error.message);
}
