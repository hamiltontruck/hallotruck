import type { PartnerDriverRegistration, DriverRosterRow } from "../services/partner-driver.service";

export type PartnerJobStage = "offered" | "awaiting_confirmation" | "ready" | "in_transit" | "delivered" | "closed" | "unknown";
export const partnerStageLabels: Record<PartnerJobStage, string> = {
  offered: "Available offers", awaiting_confirmation: "Awaiting HALLO confirmation", ready: "Assigned · awaiting start",
  in_transit: "In transit", delivered: "Delivered", closed: "Closed", unknown: "Needs verification",
};
export interface PartnerOperationalJob {
  id: string; order_id: string; partner_id: string; status: string; offered_at: string;
  selected_driver_id: string | null; selected_truck_id: string | null;
  order: { id: string; tracking_id: string; status: string; driver_id: string | null; truck_id: string | null; pickup_address: string; dropoff_address: string } | null;
}
export function partnerJobStage(job: PartnerOperationalJob): PartnerJobStage {
  const order = job.order;
  if (["cancelled", "rejected"].includes(job.status) || order?.status === "cancelled") return "closed";
  if (!order || order.id !== job.order_id) return "unknown";
  const unassigned = order.status === "placed" && !order.driver_id && !order.truck_id;
  if (job.status === "pending") return unassigned ? "offered" : "unknown";
  if (job.status === "accepted") return unassigned ? "awaiting_confirmation" : "unknown";
  if (job.status !== "confirmed" || !job.selected_driver_id || !job.selected_truck_id || order.driver_id !== job.selected_driver_id || order.truck_id !== job.selected_truck_id) return "unknown";
  if (order.status === "accepted") return "ready";
  if (order.status === "in_transit") return "in_transit";
  if (order.status === "delivered") return "delivered";
  return "unknown";
}

export interface PartnerDriverItem { key: string; driver: DriverRosterRow | null; registration: PartnerDriverRegistration | null }
export function isActivePartnerInvitation(registration: PartnerDriverRegistration, nowMs = Date.now()) {
  const expires = new Date(registration.expires_at).getTime();
  return registration.status === "invited" && !registration.driver_id && Number.isFinite(expires) && expires > nowMs;
}
export function joinPartnerDrivers(roster: DriverRosterRow[], registrations: PartnerDriverRegistration[]): PartnerDriverItem[] {
  const registrationsByDriver = new Map(registrations.filter(row => row.driver_id).map(row => [row.driver_id, row]));
  const ids = new Set(roster.map(row => row.id));
  return [
    ...roster.map(driver => ({ key: driver.id, driver, registration: registrationsByDriver.get(driver.id) ?? null })),
    ...registrations.filter(row => !row.driver_id || !ids.has(row.driver_id)).map(registration => ({ key: `registration:${registration.id}`, driver: null, registration })),
  ];
}
export function filterPartnerDrivers(rows: PartnerDriverItem[], query: string, status: string) {
  const search = query.trim().toLocaleLowerCase();
  return rows.filter(({ driver, registration }) => {
    const approval = driver?.driver_status ?? registration?.driver_status;
    const invitation = registration?.status === "invited" && !registration.driver_id;
    const selected = status === "all" || (status === "invited" ? registration && isActivePartnerInvitation(registration) : status === "expired" ? invitation && !isActivePartnerInvitation(registration!) : approval === status);
    return selected && [driver?.full_name, driver?.phone, driver?.email, driver?.plate_number, registration?.full_name, registration?.email, registration?.phone]
      .some(value => !search || value?.toLocaleLowerCase().includes(search));
  });
}
export function isLocatedTrip(trip: { truck_lng: number | null; truck_lat: number | null }) {
  return trip.truck_lng != null && trip.truck_lat != null && Number.isFinite(trip.truck_lng) && Number.isFinite(trip.truck_lat)
    && Math.abs(trip.truck_lng) <= 180 && Math.abs(trip.truck_lat) <= 90;
}
