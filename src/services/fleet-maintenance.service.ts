import { supabase } from "./supabase.client";

export type MaintenanceType =
  | "scheduled_service"
  | "oil_change"
  | "tyres"
  | "repair"
  | "inspection"
  | "insurance"
  | "permit"
  | "other";

export type MaintenanceStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
export type TruckOperationalStatus = "available" | "maintenance" | "out_of_service";

export interface MaintenanceTruck {
  id: string;
  plate_number: string;
  vehicle_type: string;
  capacity_tons: number | null;
  status: string;
  current_odometer_km: number | null;
  updated_at: string;
}

export interface TruckMaintenanceRecord {
  id: string;
  truck_id: string;
  maintenance_type: MaintenanceType;
  status: MaintenanceStatus;
  service_date: string;
  odometer_km: number | null;
  cost_etb: number;
  vendor: string | null;
  notes: string | null;
  next_service_date: string | null;
  next_service_odometer_km: number | null;
  created_at: string;
  updated_at: string;
}

export interface FleetMaintenanceData {
  trucks: MaintenanceTruck[];
  records: TruckMaintenanceRecord[];
}

export interface NewMaintenanceRecord {
  truckId: string;
  maintenanceType: MaintenanceType;
  status: MaintenanceStatus;
  serviceDate: string;
  odometerKm: number | null;
  costEtb: number;
  vendor: string;
  notes: string;
  nextServiceDate: string;
  nextServiceOdometerKm: number | null;
}

export async function getFleetMaintenanceData(): Promise<FleetMaintenanceData> {
  const [trucksResult, recordsResult] = await Promise.all([
    supabase
      .from("trucks")
      .select("id,plate_number,vehicle_type,capacity_tons,status,current_odometer_km,updated_at")
      .order("plate_number", { ascending: true }),
    supabase
      .from("truck_maintenance_records")
      .select("id,truck_id,maintenance_type,status,service_date,odometer_km,cost_etb,vendor,notes,next_service_date,next_service_odometer_km,created_at,updated_at")
      .order("service_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (trucksResult.error) throw new Error(trucksResult.error.message);
  if (recordsResult.error) throw new Error(recordsResult.error.message);

  return {
    trucks: (trucksResult.data ?? []) as MaintenanceTruck[],
    records: (recordsResult.data ?? []) as TruckMaintenanceRecord[],
  };
}

export async function createMaintenanceRecord(input: NewMaintenanceRecord) {
  if (!input.truckId) throw new Error("Choose a truck.");
  if (!input.serviceDate) throw new Error("Choose a service date.");
  if (input.costEtb < 0) throw new Error("Maintenance cost cannot be negative.");
  if (input.odometerKm !== null && input.odometerKm < 0) throw new Error("Odometer cannot be negative.");
  if (input.nextServiceOdometerKm !== null && input.nextServiceOdometerKm < 0) {
    throw new Error("Next service odometer cannot be negative.");
  }

  const { error } = await supabase.from("truck_maintenance_records").insert({
    truck_id: input.truckId,
    maintenance_type: input.maintenanceType,
    status: input.status,
    service_date: input.serviceDate,
    odometer_km: input.odometerKm,
    cost_etb: input.costEtb,
    vendor: input.vendor.trim() || null,
    notes: input.notes.trim() || null,
    next_service_date: input.nextServiceDate || null,
    next_service_odometer_km: input.nextServiceOdometerKm,
  });

  if (error) throw new Error(error.message);
}

export async function updateMaintenanceStatus(recordId: string, status: MaintenanceStatus) {
  const { error } = await supabase
    .from("truck_maintenance_records")
    .update({ status })
    .eq("id", recordId);
  if (error) throw new Error(error.message);
}

export async function setTruckOperationalStatus(truckId: string, status: TruckOperationalStatus) {
  const { error } = await supabase.rpc("admin_set_truck_operational_status", {
    p_truck_id: truckId,
    p_status: status,
  });
  if (error) throw new Error(error.message);
}
