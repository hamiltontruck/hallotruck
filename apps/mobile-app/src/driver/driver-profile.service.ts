import type { RealtimeChannel, Session, SupabaseClient, User } from "@supabase/supabase-js";
import { mobileSupabase } from "../auth/mobile-supabase";
import {
  normalizeDriverProfile,
  normalizeDriverTruck,
  normalizeDriverVerification,
  type DriverProfileRecord,
  type DriverTruckRecord,
  type DriverVerificationRecord,
} from "./driver-profile.model";

function requireClient(): SupabaseClient {
  if (!mobileSupabase) throw new Error("Supabase mobile configuration hin guutamne.");
  return mobileSupabase;
}

async function requireExpectedDriver(expectedUserId: string): Promise<{
  client: SupabaseClient;
  user: User;
  session: Session;
}> {
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
    throw new Error("Mobile session jijjiirameera. Page kana irra deebi'ii bani.");
  }
  return { client, user, session };
}

export async function fetchDriverProfile(expectedUserId: string): Promise<DriverProfileRecord> {
  const { client, user } = await requireExpectedDriver(expectedUserId);
  const { data, error } = await client
    .from("profiles")
    .select("id,full_name,phone,vehicle_type,driver_status,rating_avg,created_at")
    .eq("id", user.id)
    .eq("role", "driver")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const profile = normalizeDriverProfile(data, user.id);
  if (!profile) throw new Error("Driver profile database keessaa sirriitti hin argamne.");
  return profile;
}

export async function fetchDriverTrucks(expectedUserId: string): Promise<DriverTruckRecord[]> {
  const { client, user } = await requireExpectedDriver(expectedUserId);
  const { data, error } = await client
    .from("trucks")
    .select("id,plate_number,vehicle_type,capacity_tons,status,created_at,updated_at")
    .eq("driver_id", user.id)
    .order("updated_at", { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data : [])
    .map(normalizeDriverTruck)
    .filter((truck): truck is DriverTruckRecord => truck !== null);
}

export async function fetchDriverVerificationFiles(expectedUserId: string): Promise<DriverVerificationRecord[]> {
  const { client, user } = await requireExpectedDriver(expectedUserId);
  const { data, error } = await client
    .from("driver_verification_files")
    .select("id,document_key,truck_id,status,expiry_date,rejection_reason,updated_at")
    .eq("driver_id", user.id)
    .order("updated_at", { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data : [])
    .map(normalizeDriverVerification)
    .filter((record): record is DriverVerificationRecord => record !== null);
}

export function subscribeToDriverProfile(
  userId: string,
  onChange: () => void,
): () => void {
  const client = requireClient();
  let channel: RealtimeChannel | null = client
    .channel(`mobile-driver-profile-${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "trucks", filter: `driver_id=eq.${userId}` },
      onChange,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "driver_verification_files", filter: `driver_id=eq.${userId}` },
      onChange,
    )
    .subscribe();

  return () => {
    if (!channel) return;
    const active = channel;
    channel = null;
    void client.removeChannel(active);
  };
}
