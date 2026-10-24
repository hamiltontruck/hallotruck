import { supabase } from "./supabase.client";
import type { FleetVehicle } from "./fleet-maintenance.service";
import { getPartnerDriverRoster, listPartnerDrivers } from "./partner-driver.service";
import { loadPartnerLiveTrips } from "./partner-live-operations.service";
import type { PartnerOperationalJob } from "../domain/partner-operations";

export type PartnerRead<T> = { data: T | null; error: string | null };
export async function partnerRead<T>(read: () => Promise<T>): Promise<PartnerRead<T>> {
  try { return { data: await read(), error: null }; }
  catch (error) { return { data: null, error: error instanceof Error ? error.message : "This section could not be loaded." }; }
}
export async function loadPartnerFleet(partnerId: string): Promise<FleetVehicle[]> {
  const { data, error } = await supabase.rpc("fleet_enterprise_vehicles", { p_partner_id: partnerId });
  if (error) throw new Error(error.message);
  return data ?? [];
}
export async function loadPartnerOperationalJobs(partnerId: string): Promise<PartnerOperationalJob[]> {
  const { data, error } = await supabase.from("partner_job_requests")
    .select("id,order_id,partner_id,status,offered_at,selected_driver_id,selected_truck_id")
    .eq("partner_id", partnerId).order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  const requests = data ?? [];
  if (!requests.length) return [];
  const { data: orders, error: orderError } = await supabase.from("orders")
    .select("id,tracking_id,status,driver_id,truck_id,pickup_address,dropoff_address").in("id", [...new Set(requests.map(row => row.order_id))]);
  if (orderError) throw new Error(orderError.message);
  const byId = new Map((orders ?? []).map(row => [row.id, row]));
  return requests.map(row => ({ ...row, order: byId.get(row.order_id) ?? null })) as PartnerOperationalJob[];
}
export async function loadPartnerOperations(partnerId: string, canManageDrivers: boolean) {
  const fleet = partnerRead(() => loadPartnerFleet(partnerId));
  const live = fleet.then(result => result.data ? partnerRead(() => loadPartnerLiveTrips(partnerId, result.data!)) : { data: null, error: "Live trips unavailable until fleet access recovers." });
  const [fleetResult, jobs, liveResult, drivers, registrations] = await Promise.all([
    fleet, partnerRead(() => loadPartnerOperationalJobs(partnerId)), live,
    canManageDrivers ? partnerRead(() => getPartnerDriverRoster(partnerId)) : null,
    canManageDrivers ? partnerRead(() => listPartnerDrivers(partnerId)) : null,
  ]);
  return { fleet: fleetResult, jobs, live: liveResult, drivers, registrations };
}
export type PartnerOperationsSnapshot = Awaited<ReturnType<typeof loadPartnerOperations>>;
