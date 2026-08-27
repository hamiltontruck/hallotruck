import type { FleetHealthStatus, FleetVehicle, TruckOperationalStatus } from "../services/fleet-maintenance.service";

export interface FleetFilters {
  query: string;
  status: "all" | TruckOperationalStatus;
  health: "all" | FleetHealthStatus;
  branchId: "all" | string;
}

export type ExpiryState = "not_recorded" | "expired" | "due_soon" | "valid";

export function getExpiryState(value: string | null, today = new Date(), warningDays = 30): ExpiryState {
  if (!value) return "not_recorded";
  const expiry = new Date(`${value}T00:00:00Z`);
  const current = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const warning = new Date(current);
  warning.setUTCDate(warning.getUTCDate() + warningDays);
  if (expiry < current) return "expired";
  if (expiry <= warning) return "due_soon";
  return "valid";
}

export function filterFleetVehicles(vehicles: FleetVehicle[], filters: FleetFilters) {
  const needle = filters.query.trim().toLocaleLowerCase();
  return vehicles.filter((vehicle) => {
    const matchesQuery = !needle || [
      vehicle.plate_number,
      vehicle.vehicle_type,
      vehicle.assigned_driver_name,
      vehicle.branch_name,
      vehicle.active_trip_reference,
    ].some((value) => value?.toLocaleLowerCase().includes(needle));
    return matchesQuery
      && (filters.status === "all" || vehicle.status === filters.status)
      && (filters.health === "all" || vehicle.health_status === filters.health)
      && (filters.branchId === "all" || vehicle.branch_id === filters.branchId);
  });
}

export function canDispatchFleetVehicle(vehicle: Pick<FleetVehicle, "status" | "health_status" | "active_trip_id">) {
  return vehicle.status === "available" && vehicle.health_status !== "critical" && vehicle.active_trip_id === null;
}
