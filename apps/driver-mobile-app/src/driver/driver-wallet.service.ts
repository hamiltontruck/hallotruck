import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { mobileSupabase } from "../auth/mobile-supabase";
import {
  normalizeDriverCommissionSummary,
  normalizeDriverFinancialSummary,
  normalizeDriverWalletTrips,
  type DriverCommissionSummary,
  type DriverFinancialSummary,
  type DriverWalletTrip,
} from "./driver-wallet.model";

function requireClient(): SupabaseClient {
  if (!mobileSupabase) throw new Error("Supabase mobile configuration hin guutamne.");
  return mobileSupabase;
}

async function requireExpectedDriver(expectedUserId: string): Promise<SupabaseClient> {
  const client = requireClient();
  const [userResult, sessionResult] = await Promise.all([
    client.auth.getUser(),
    client.auth.getSession(),
  ]);
  const user = userResult.data.user;
  const session = sessionResult.data.session;
  if (userResult.error || sessionResult.error || !user || !session) {
    throw new Error("Driver session xumurameera. Deebi'ii seeni.");
  }
  if (user.id !== expectedUserId || session.user.id !== expectedUserId) {
    throw new Error("Mobile session jijjiirameera. Wallet irra deebi'ii bani.");
  }
  return client;
}

export async function fetchDriverFinancialSummary(expectedUserId: string): Promise<DriverFinancialSummary> {
  const client = await requireExpectedDriver(expectedUserId);
  const { data, error } = await client.rpc("driver_financial_summary", {
    p_driver_id: expectedUserId,
  });
  if (error) throw new Error(error.message);
  return normalizeDriverFinancialSummary(data);
}

export async function fetchDriverCommissionSummary(expectedUserId: string): Promise<DriverCommissionSummary> {
  const client = await requireExpectedDriver(expectedUserId);
  const { data, error } = await client.rpc("my_driver_commission_summary");
  if (error) throw new Error(error.message);
  return normalizeDriverCommissionSummary(data);
}

export async function fetchDriverWalletTrips(expectedUserId: string): Promise<DriverWalletTrip[]> {
  const client = await requireExpectedDriver(expectedUserId);
  const { data, error } = await client
    .from("driver_trip_payment_results")
    .select("id,order_id,result_type,amount_collected,payment_method,completed_at,commission_etb,driver_gross_etb,driver_net_etb,deposit_consumed_etb,commission_due_after_etb,orders!inner(tracking_id,pickup_address,dropoff_address)")
    .eq("assigned_driver_id", expectedUserId)
    .order("completed_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return normalizeDriverWalletTrips(data ?? []);
}

export function subscribeToDriverWallet(
  userId: string,
  onChange: () => void,
): () => void {
  const client = requireClient();
  const driverFilter = `driver_id=eq.${userId}`;
  let channel: RealtimeChannel | null = client
    .channel(`mobile-driver-wallet-${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "driver_commission_deposits", filter: driverFilter }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "driver_commission_charges", filter: driverFilter }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "driver_commission_payments", filter: driverFilter }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "driver_payment_confirmations", filter: driverFilter }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "driver_trip_payment_results", filter: `assigned_driver_id=eq.${userId}` }, onChange)
    .subscribe();

  return () => {
    if (!channel) return;
    const active = channel;
    channel = null;
    void client.removeChannel(active);
  };
}
