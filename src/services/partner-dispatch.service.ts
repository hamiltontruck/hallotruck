import { supabase } from "./supabase.client";
import type { FleetVehicle } from "./fleet-maintenance.service";

export type PartnerJobStatus = "pending" | "accepted" | "rejected" | "confirmed" | "cancelled";

export interface PartnerDispatchOrder {
  id: string;
  tracking_id: string;
  pickup_address: string;
  dropoff_address: string;
  vehicle_type: string;
  cargo_description: string | null;
  cargo_weight_tons: number | string | null;
  status: string;
  driver_id: string | null;
  truck_id: string | null;
}

export interface PartnerDispatchOrganization {
  id: string;
  name: string;
  code: string;
  status: string;
}

export interface PartnerJobRequest {
  id: string;
  request_key: string;
  order_id: string;
  partner_id: string;
  status: PartnerJobStatus;
  offer_note: string | null;
  offered_by: string;
  offered_at: string;
  responded_by: string | null;
  responded_at: string | null;
  response_note: string | null;
  selected_partner_vehicle_id: string | null;
  selected_truck_id: string | null;
  selected_driver_id: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  order: PartnerDispatchOrder | null;
  organization: PartnerDispatchOrganization | null;
  truck_label: string | null;
  driver_label: string | null;
}

export interface AdminPartnerDispatchData {
  requests: PartnerJobRequest[];
  orders: PartnerDispatchOrder[];
  organizations: PartnerDispatchOrganization[];
}

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

async function hydrateRequests(rows: Array<Omit<PartnerJobRequest, "order" | "organization" | "truck_label" | "driver_label">>) {
  const orderIds = [...new Set(rows.map((row) => row.order_id))];
  const partnerIds = [...new Set(rows.map((row) => row.partner_id))];
  const truckIds = [...new Set(rows.map((row) => row.selected_truck_id).filter(Boolean))] as string[];
  const driverIds = [...new Set(rows.map((row) => row.selected_driver_id).filter(Boolean))] as string[];

  const [orders, organizations, trucks, drivers] = await Promise.all([
    orderIds.length
      ? supabase.from("orders").select("id,tracking_id,pickup_address,dropoff_address,vehicle_type,cargo_description,cargo_weight_tons,status,driver_id,truck_id").in("id", orderIds)
      : Promise.resolve({ data: [], error: null }),
    partnerIds.length
      ? supabase.from("partner_organizations").select("id,name,code,status").in("id", partnerIds)
      : Promise.resolve({ data: [], error: null }),
    truckIds.length
      ? supabase.from("trucks").select("id,plate_number,vehicle_type").in("id", truckIds)
      : Promise.resolve({ data: [], error: null }),
    driverIds.length
      ? supabase.from("profiles").select("id,full_name,phone").in("id", driverIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  [orders.error, organizations.error, trucks.error, drivers.error].forEach(throwIfError);

  const ordersById = new Map((orders.data ?? []).map((row) => [row.id, row as PartnerDispatchOrder]));
  const organizationsById = new Map((organizations.data ?? []).map((row) => [row.id, row as PartnerDispatchOrganization]));
  const trucksById = new Map((trucks.data ?? []).map((row) => [row.id, `${row.plate_number} · ${row.vehicle_type}`]));
  const driversById = new Map((drivers.data ?? []).map((row) => [row.id, row.full_name?.trim() || row.phone?.trim() || "Approved driver"]));

  return rows.map((row) => ({
    ...row,
    order: ordersById.get(row.order_id) ?? null,
    organization: organizationsById.get(row.partner_id) ?? null,
    truck_label: row.selected_truck_id ? trucksById.get(row.selected_truck_id) ?? "Selected truck" : null,
    driver_label: row.selected_driver_id ? driversById.get(row.selected_driver_id) ?? "Selected driver" : null,
  })) as PartnerJobRequest[];
}

export async function loadAdminPartnerDispatchData(): Promise<AdminPartnerDispatchData> {
  const [requests, orders, organizations] = await Promise.all([
    supabase.from("partner_job_requests").select("*").order("created_at", { ascending: false }).limit(150),
    supabase.from("orders").select("id,tracking_id,pickup_address,dropoff_address,vehicle_type,cargo_description,cargo_weight_tons,status,driver_id,truck_id").eq("status", "placed").is("driver_id", null).is("truck_id", null).order("created_at", { ascending: false }).limit(200),
    supabase.from("partner_organizations").select("id,name,code,status").eq("status", "active").order("name"),
  ]);
  [requests.error, orders.error, organizations.error].forEach(throwIfError);
  return {
    requests: await hydrateRequests((requests.data ?? []) as Array<Omit<PartnerJobRequest, "order" | "organization" | "truck_label" | "driver_label">>),
    orders: (orders.data ?? []) as PartnerDispatchOrder[],
    organizations: (organizations.data ?? []) as PartnerDispatchOrganization[],
  };
}

export async function loadPartnerDispatchData(partnerId: string) {
  const [requests, vehicles] = await Promise.all([
    supabase.from("partner_job_requests").select("*").eq("partner_id", partnerId).order("created_at", { ascending: false }).limit(100),
    supabase.rpc("fleet_enterprise_vehicles", { p_partner_id: partnerId }),
  ]);
  [requests.error, vehicles.error].forEach(throwIfError);
  return {
    requests: await hydrateRequests((requests.data ?? []) as Array<Omit<PartnerJobRequest, "order" | "organization" | "truck_label" | "driver_label">>),
    vehicles: (vehicles.data ?? []) as FleetVehicle[],
  };
}

export async function offerPartnerJob(orderId: string, partnerId: string, note: string) {
  const { data, error } = await supabase.rpc("admin_offer_partner_job", {
    p_order_id: orderId,
    p_partner_id: partnerId,
    p_note: note.trim() || null,
    p_request_key: crypto.randomUUID(),
  });
  throwIfError(error);
  return data;
}

export async function respondToPartnerJob(requestId: string, action: "accept" | "reject", truckId: string | null, note: string) {
  const { data, error } = await supabase.rpc("partner_respond_job_request", {
    p_request_id: requestId,
    p_action: action,
    p_truck_id: action === "accept" ? truckId : null,
    p_note: note.trim() || null,
    p_request_key: crypto.randomUUID(),
  });
  throwIfError(error);
  return data;
}

export async function confirmPartnerJob(requestId: string) {
  const { data, error } = await supabase.rpc("admin_confirm_partner_job_request", {
    p_request_id: requestId,
    p_request_key: crypto.randomUUID(),
  });
  throwIfError(error);
  return data;
}

export async function cancelPartnerJob(requestId: string, reason: string) {
  const { data, error } = await supabase.rpc("admin_cancel_partner_job_request", {
    p_request_id: requestId,
    p_reason: reason.trim(),
  });
  throwIfError(error);
  return data;
}
