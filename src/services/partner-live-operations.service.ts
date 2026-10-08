import { supabase } from "./supabase.client";
import { classifyTrackingFreshness, type TrackingFreshness } from "../domain/tracking-freshness";
import { getFleetEnterpriseData } from "./fleet-maintenance.service";

export interface PartnerLiveTrip {
  order_id: string;
  reference: string;
  status: string;
  plate_number: string;
  driver_name: string;
  truck_lng: number | null;
  truck_lat: number | null;
  heading: number | null;
  speed_kmh: number | null;
  recorded_at: string | null;
  freshness: TrackingFreshness;
}

interface LiveTripRpcRow {
  order_id: string;
  status: string;
  truck_lng: number | null;
  truck_lat: number | null;
  heading: number | null;
  speed_kmh: number | null;
  recorded_at: string | null;
}

export interface PartnerLiveOperationsResult {
  trips: PartnerLiveTrip[];
  warnings: string[];
}

const assignmentMismatchMessage = "Partner live assignment mismatch";

export async function loadPartnerLiveOperations(partnerId: string): Promise<PartnerLiveOperationsResult> {
  const fleet = await getFleetEnterpriseData(partnerId);
  const active = fleet.vehicles.filter((vehicle) => Boolean(vehicle.active_trip_id));
  const rows = await Promise.all(active.map(async (vehicle) => {
    const { data, error } = await supabase.rpc("partner_get_live_trip", {
      p_partner_id: partnerId,
      p_order_id: vehicle.active_trip_id,
    });
    if (error?.message.includes(assignmentMismatchMessage)) {
      return {
        trip: null,
        warning: `${vehicle.plate_number}: the assigned fleet driver does not match the confirmed order driver.`,
      };
    }
    if (error) throw new Error(error.message);
    const trip = (data?.[0] ?? null) as LiveTripRpcRow | null;
    if (!trip) return { trip: null, warning: null };
    return { trip: {
      order_id: trip.order_id,
      reference: vehicle.active_trip_reference ?? trip.order_id,
      status: trip.status,
      plate_number: vehicle.plate_number,
      driver_name: vehicle.assigned_driver_name ?? "Driver",
      truck_lng: trip.truck_lng == null ? null : Number(trip.truck_lng),
      truck_lat: trip.truck_lat == null ? null : Number(trip.truck_lat),
      heading: trip.heading == null ? null : Number(trip.heading),
      speed_kmh: trip.speed_kmh == null ? null : Number(trip.speed_kmh),
      recorded_at: trip.recorded_at,
      freshness: classifyTrackingFreshness(trip.recorded_at),
    } satisfies PartnerLiveTrip, warning: null };
  }));
  return {
    trips: rows.map((row) => row.trip).filter((trip): trip is PartnerLiveTrip => trip !== null),
    warnings: rows.map((row) => row.warning).filter((warning): warning is string => warning !== null),
  };
}
