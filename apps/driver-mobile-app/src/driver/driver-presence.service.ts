import type { SupabaseClient } from "@supabase/supabase-js";
import { mobileSupabase } from "../auth/mobile-supabase";

export type DriverPresence = {
  driverId: string;
  isAvailable: boolean;
  accuracyM: number | null;
  updatedAt: string;
};

function requireClient(): SupabaseClient {
  if (!mobileSupabase) throw new Error("HALLO Supabase mobile configuration is missing.");
  return mobileSupabase;
}

async function requireExpectedDriver(expectedUserId: string): Promise<SupabaseClient> {
  const client = requireClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Driver session expired. Sign in again.");
  if (data.user.id !== expectedUserId) throw new Error("Driver mobile session changed. Reopen the app.");
  return client;
}

export async function fetchDriverPresence(expectedUserId: string): Promise<DriverPresence | null> {
  const client = await requireExpectedDriver(expectedUserId);
  const { data, error } = await client
    .from("driver_presence")
    .select("driver_id,is_available,accuracy_m,updated_at")
    .eq("driver_id", expectedUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    driverId: String(data.driver_id),
    isAvailable: Boolean(data.is_available),
    accuracyM: data.accuracy_m === null ? null : Number(data.accuracy_m),
    updatedAt: String(data.updated_at),
  };
}

export async function updateDriverPresence(expectedUserId: string, input: {
  isAvailable: boolean;
  latitude?: number;
  longitude?: number;
  accuracyM?: number;
}): Promise<DriverPresence> {
  const client = await requireExpectedDriver(expectedUserId);
  const { data, error } = await client.rpc("driver_set_presence", {
    p_is_available: input.isAvailable,
    p_lat: input.isAvailable ? input.latitude ?? null : null,
    p_lng: input.isAvailable ? input.longitude ?? null : null,
    p_accuracy_m: input.isAvailable ? input.accuracyM ?? null : null,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Driver availability could not be updated.");
  return {
    driverId: String(row.driver_id),
    isAvailable: Boolean(row.is_available),
    accuracyM: row.accuracy_m === null ? null : Number(row.accuracy_m),
    updatedAt: String(row.updated_at),
  };
}
