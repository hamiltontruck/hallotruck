import type { RealtimeChannel, SupabaseClient, User } from "@supabase/supabase-js";
import { mobileSupabase } from "../auth/mobile-supabase";
import {
  normalizeDriverAvailableJobs,
  normalizeDriverCancelledOrder,
  normalizeDriverTruckOptions,
  splitDriverAssignments,
  type DriverTruckOption,
  type DriverWorkboardSnapshot,
} from "./driver-jobs.model";

function requireClient(): SupabaseClient {
  if (!mobileSupabase) throw new Error("Supabase mobile configuration hin guutamne.");
  return mobileSupabase;
}

async function requireExpectedDriver(expectedUserId: string): Promise<{ client: SupabaseClient; user: User }> {
  const client = requireClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Driver session xumurameera. Deebi'ii seeni.");
  if (data.user.id !== expectedUserId) throw new Error("Mobile session jijjiirameera. Page kana irra deebi'ii bani.");
  return { client, user: data.user };
}

export async function fetchDriverWorkboard(expectedUserId: string): Promise<DriverWorkboardSnapshot> {
  const { client, user } = await requireExpectedDriver(expectedUserId);
  const [assignmentResult, cancellationResult, availableResult] = await Promise.all([
    client.from("orders")
      .select("id,tracking_id,status,pickup_address,dropoff_address,price_etb,accepted_at,service_date")
      .eq("driver_id", user.id)
      .in("status", ["accepted", "in_transit"])
      .order("service_date", { ascending: true })
      .order("accepted_at", { ascending: true }),
    client.from("orders")
      .select("id,tracking_id,pickup_address,dropoff_address,cancellation_reason,cancelled_at")
      .eq("driver_id", user.id)
      .eq("status", "cancelled")
      .order("cancelled_at", { ascending: false })
      .limit(1),
    client.rpc("get_available_jobs_v2"),
  ]);
  if (assignmentResult.error) throw new Error(assignmentResult.error.message);
  if (cancellationResult.error) throw new Error(cancellationResult.error.message);
  if (availableResult.error) throw new Error(availableResult.error.message);
  const assignments = splitDriverAssignments(assignmentResult.data);
  return {
    ...assignments,
    availableJobs: normalizeDriverAvailableJobs(availableResult.data),
    latestCancellation: normalizeDriverCancelledOrder(cancellationResult.data?.[0] ?? null),
    loadedAt: Date.now(),
  };
}

export async function fetchDriverTruckOptions(expectedUserId: string, orderId: string): Promise<DriverTruckOption[]> {
  const { client } = await requireExpectedDriver(expectedUserId);
  const { data, error } = await client.rpc("driver_available_trucks_for_order_v2", { p_order_id: orderId });
  if (error) throw new Error(error.message);
  return normalizeDriverTruckOptions(data);
}

export async function claimDriverJob(expectedUserId: string, orderId: string, truckId: string): Promise<void> {
  const { client } = await requireExpectedDriver(expectedUserId);
  const { data, error } = await client.rpc("claim_order_with_truck_v2", {
    p_order_id: orderId,
    p_truck_id: truckId,
  });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error("Hojii kana driver biraa fudhateera. Tarree hojii haaromsi.");
}

export function subscribeToMyDriverOrders(userId: string, onChange: () => void): () => void {
  const client = requireClient();
  const channels: RealtimeChannel[] = [];
  channels.push(client.channel(`mobile-driver-orders-${userId}`).on(
    "postgres_changes",
    { event: "*", schema: "public", table: "orders", filter: `driver_id=eq.${userId}` },
    onChange,
  ).subscribe());
  channels.push(client.channel(`mobile-driver-market-${userId}`).on(
    "postgres_changes",
    { event: "*", schema: "public", table: "orders", filter: "status=eq.placed" },
    onChange,
  ).subscribe());
  return () => {
    for (const channel of channels) void client.removeChannel(channel);
  };
}
