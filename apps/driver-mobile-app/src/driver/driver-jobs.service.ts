import type { RealtimeChannel, SupabaseClient, User } from "@supabase/supabase-js";
import { mobileSupabase } from "../auth/mobile-supabase";
import {
  normalizeDriverActiveTrip,
  normalizeDriverAvailableJobs,
  normalizeDriverTruckOptions,
  type DriverTruckOption,
  type DriverWorkboardSnapshot,
} from "./driver-jobs.model";

function requireClient(): SupabaseClient {
  if (!mobileSupabase) {
    throw new Error("Supabase mobile configuration hin guutamne.");
  }
  return mobileSupabase;
}

async function requireExpectedDriver(expectedUserId: string): Promise<{
  client: SupabaseClient;
  user: User;
}> {
  const client = requireClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    throw new Error("Driver session xumurameera. Deebi'ii seeni.");
  }
  if (data.user.id !== expectedUserId) {
    throw new Error("Mobile session jijjiirameera. Page kana irra deebi'ii bani.");
  }
  return { client, user: data.user };
}

export async function fetchDriverWorkboard(expectedUserId: string): Promise<DriverWorkboardSnapshot> {
  const { client, user } = await requireExpectedDriver(expectedUserId);

  const activeResult = await client
    .from("orders")
    .select("id,tracking_id,status,pickup_address,dropoff_address,price_etb,accepted_at")
    .eq("driver_id", user.id)
    .in("status", ["accepted", "in_transit"])
    .order("accepted_at", { ascending: true })
    .limit(1);

  if (activeResult.error) throw new Error(activeResult.error.message);
  const activeTrip = normalizeDriverActiveTrip(activeResult.data?.[0] ?? null);
  if (activeTrip) {
    return { activeTrip, availableJobs: [], loadedAt: Date.now() };
  }

  const availableResult = await client.rpc("get_available_jobs");
  if (availableResult.error) throw new Error(availableResult.error.message);

  return {
    activeTrip: null,
    availableJobs: normalizeDriverAvailableJobs(availableResult.data),
    loadedAt: Date.now(),
  };
}

export async function fetchDriverTruckOptions(
  expectedUserId: string,
  orderId: string,
): Promise<DriverTruckOption[]> {
  const { client } = await requireExpectedDriver(expectedUserId);
  const { data, error } = await client.rpc("driver_available_trucks_for_order", {
    p_order_id: orderId,
  });
  if (error) throw new Error(error.message);
  return normalizeDriverTruckOptions(data);
}

export async function claimDriverJob(
  expectedUserId: string,
  orderId: string,
  truckId: string,
): Promise<void> {
  const { client } = await requireExpectedDriver(expectedUserId);
  const { data, error } = await client.rpc("claim_order_with_truck", {
    p_order_id: orderId,
    p_truck_id: truckId,
  });
  if (error) throw new Error(error.message);
  if (data !== true) {
    throw new Error("Hojii kana driver biraa fudhateera. Tarree hojii haaromsi.");
  }
}

export function subscribeToMyDriverOrders(
  userId: string,
  onChange: () => void,
): () => void {
  const client = requireClient();
  let channel: RealtimeChannel | null = client
    .channel(`mobile-driver-orders-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "orders",
        filter: `driver_id=eq.${userId}`,
      },
      onChange,
    )
    .subscribe();

  return () => {
    if (!channel) return;
    const activeChannel = channel;
    channel = null;
    void client.removeChannel(activeChannel);
  };
}
