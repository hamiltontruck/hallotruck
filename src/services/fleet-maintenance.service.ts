import { supabase } from "./supabase.client";

export type MaintenanceType = "scheduled_service" | "oil_change" | "tyres" | "repair" | "inspection" | "insurance" | "permit" | "other";
export type MaintenanceStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
export type TruckOperationalStatus = "available" | "assigned" | "on_trip" | "maintenance" | "suspended" | "inactive";
export type FleetHealthStatus = "healthy" | "attention" | "critical";
export type FleetOwnershipType = "company" | "partner" | "leased" | "owner_operator";
export type FleetFuelType = "diesel" | "petrol" | "electric" | "hybrid" | "cng" | "other";

export interface FleetVehicle {
  vehicle_id: string;
  partner_vehicle_id: string | null;
  partner_id: string | null;
  plate_number: string;
  vehicle_type: string;
  capacity_tons: number | null;
  status: TruckOperationalStatus;
  ownership_type: FleetOwnershipType;
  fuel_type: FleetFuelType | null;
  branch_id: string | null;
  branch_name: string | null;
  assigned_driver_id: string | null;
  assigned_driver_name: string | null;
  active_trip_id: string | null;
  active_trip_reference: string | null;
  active_trip_status: string | null;
  current_odometer_km: number | null;
  insurance_expiry: string | null;
  license_expiry: string | null;
  roadworthiness_expiry: string | null;
  last_service_date: string | null;
  next_service_date: string | null;
  maintenance_status: "clear" | "scheduled" | "in_progress" | "overdue";
  health_status: FleetHealthStatus;
  dispatch_ready: boolean;
  gps_provider: string | null;
  last_location_at: string | null;
  updated_at: string;
}

export interface FleetSummary {
  total: number;
  available: number;
  assigned: number;
  on_trip: number;
  maintenance: number;
  suspended: number;
  inactive: number;
  expiry_alerts: number;
  service_alerts: number;
  dispatch_ready: number;
}

export interface FleetBranch { id: string; partner_id: string | null; name: string; code: string; address: string | null; active: boolean }
export interface FleetAuditEvent { id: number; entity_type: "truck" | "partner_vehicle" | "maintenance" | "branch"; entity_id: string; truck_id: string | null; event_type: string; reason: string | null; actor_id: string | null; source: "admin" | "partner" | "driver" | "system"; created_at: string }
export interface DriverOption { id: string; full_name: string; phone: string | null }

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

export interface FleetEnterpriseData { vehicles: FleetVehicle[]; summary: FleetSummary; records: TruckMaintenanceRecord[]; branches: FleetBranch[]; audit: FleetAuditEvent[]; drivers: DriverOption[] }
export interface NewMaintenanceRecord { truckId: string; maintenanceType: MaintenanceType; status: MaintenanceStatus; serviceDate: string; odometerKm: number | null; costEtb: number; vendor: string; notes: string; nextServiceDate: string; nextServiceOdometerKm: number | null }
export interface NewFleetVehicle { partnerId?: string | null; plateNumber: string; vehicleType: string; capacityTons: number | null; ownershipType: FleetOwnershipType; fuelType: FleetFuelType | null; branchId: string | null }
export interface FleetProfileUpdate { truckId: string; ownershipType: FleetOwnershipType; fuelType: FleetFuelType | null; branchId: string | null; currentOdometerKm: number | null; insuranceExpiry: string | null; licenseExpiry: string | null; roadworthinessExpiry: string | null; reason: string }

const emptySummary: FleetSummary = { total: 0, available: 0, assigned: 0, on_trip: 0, maintenance: 0, suspended: 0, inactive: 0, expiry_alerts: 0, service_alerts: 0, dispatch_ready: 0 };
function throwIfError(error: { message: string } | null) { if (error) throw new Error(error.message); }

export async function getFleetEnterpriseData(partnerId: string | null = null): Promise<FleetEnterpriseData> {
  const scope = { p_partner_id: partnerId };
  const [vehicles, summary, records, branches, audit, drivers] = await Promise.all([
    supabase.rpc("fleet_enterprise_vehicles", scope),
    supabase.rpc("fleet_enterprise_summary", scope),
    supabase.from("truck_maintenance_records").select("id,truck_id,maintenance_type,status,service_date,odometer_km,cost_etb,vendor,notes,next_service_date,next_service_odometer_km,created_at,updated_at").order("service_date", { ascending: false }).order("created_at", { ascending: false }).limit(500),
    partnerId ? supabase.from("fleet_branches").select("id,partner_id,name,code,address,active").eq("partner_id", partnerId).order("name") : supabase.from("fleet_branches").select("id,partner_id,name,code,address,active").is("partner_id", null).order("name"),
    partnerId ? supabase.from("fleet_audit_events").select("id,entity_type,entity_id,truck_id,event_type,reason,actor_id,source,created_at").eq("partner_id", partnerId).order("created_at", { ascending: false }).limit(100) : supabase.from("fleet_audit_events").select("id,entity_type,entity_id,truck_id,event_type,reason,actor_id,source,created_at").order("created_at", { ascending: false }).limit(100),
    partnerId ? Promise.resolve({ data: [], error: null }) : supabase.from("profiles").select("id,full_name,phone").eq("role", "driver").eq("driver_status", "approved").order("full_name"),
  ]);
  [vehicles.error, summary.error, records.error, branches.error, audit.error, drivers.error].forEach(throwIfError);
  const summaryRow = (summary.data?.[0] ?? emptySummary) as FleetSummary;
  return {
    vehicles: (vehicles.data ?? []) as FleetVehicle[],
    summary: Object.fromEntries(Object.entries(summaryRow).map(([key, value]) => [key, Number(value ?? 0)])) as unknown as FleetSummary,
    records: (records.data ?? []) as TruckMaintenanceRecord[],
    branches: (branches.data ?? []) as FleetBranch[],
    audit: (audit.data ?? []) as FleetAuditEvent[],
    drivers: (drivers.data ?? []) as DriverOption[],
  };
}

export async function createFleetBranch(partnerId: string | null, name: string, code: string, address: string) {
  const { data, error } = await supabase.rpc("create_fleet_branch", { p_partner_id: partnerId, p_name: name.trim(), p_code: code.trim().toUpperCase(), p_address: address.trim() || null });
  throwIfError(error); return data as string;
}

export async function createFleetVehicle(input: NewFleetVehicle) {
  const { data, error } = await supabase.rpc("create_fleet_vehicle", { p_partner_id: input.partnerId ?? null, p_plate_number: input.plateNumber.trim().toUpperCase(), p_vehicle_type: input.vehicleType.trim(), p_capacity_tons: input.capacityTons, p_ownership_type: input.ownershipType, p_fuel_type: input.fuelType, p_branch_id: input.branchId });
  throwIfError(error); return data as string;
}

export async function updateFleetVehicleProfile(input: FleetProfileUpdate) {
  const { error } = await supabase.rpc("update_fleet_vehicle_profile", { p_truck_id: input.truckId, p_ownership_type: input.ownershipType, p_fuel_type: input.fuelType, p_branch_id: input.branchId, p_current_odometer_km: input.currentOdometerKm, p_insurance_expiry: input.insuranceExpiry, p_license_expiry: input.licenseExpiry, p_roadworthiness_expiry: input.roadworthinessExpiry, p_reason: input.reason.trim() });
  throwIfError(error);
}

export async function createMaintenanceRecord(input: NewMaintenanceRecord) {
  if (!input.truckId) throw new Error("Choose a truck.");
  if (!input.serviceDate) throw new Error("Choose a service date.");
  if (input.costEtb < 0) throw new Error("Maintenance cost cannot be negative.");
  const { error } = await supabase.rpc("create_truck_maintenance_record", { p_truck_id: input.truckId, p_maintenance_type: input.maintenanceType, p_status: input.status, p_service_date: input.serviceDate, p_odometer_km: input.odometerKm, p_cost_etb: input.costEtb, p_vendor: input.vendor.trim() || null, p_notes: input.notes.trim() || null, p_next_service_date: input.nextServiceDate || null, p_next_service_odometer_km: input.nextServiceOdometerKm });
  throwIfError(error);
}

export async function updateMaintenanceStatus(recordId: string, status: MaintenanceStatus, reason: string) {
  const { error } = await supabase.rpc("update_truck_maintenance_status", { p_record_id: recordId, p_status: status, p_reason: reason.trim() });
  throwIfError(error);
}

export async function setTruckOperationalStatus(truckId: string, status: TruckOperationalStatus, reason: string) {
  const { error } = await supabase.rpc("admin_set_truck_operational_status", { p_truck_id: truckId, p_status: status, p_reason: reason.trim() });
  throwIfError(error);
}

export async function assignFleetDriver(truckId: string, driverId: string | null, reason: string) {
  const { error } = await supabase.rpc("admin_assign_fleet_driver", { p_truck_id: truckId, p_driver_id: driverId, p_reason: reason.trim() });
  throwIfError(error);
}
