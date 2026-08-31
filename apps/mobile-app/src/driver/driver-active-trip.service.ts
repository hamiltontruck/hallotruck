import type { RealtimeChannel, Session, SupabaseClient, User } from "@supabase/supabase-js";
import { mobileSupabase } from "../auth/mobile-supabase";
import {
  normalizeDriverActiveTripOrder,
  normalizeDriverNavigationRoute,
  type DriverActiveTripOrder,
  type DriverNavigationRoute,
} from "./driver-active-trip.model";

export type DriverTrackingPing = {
  orderId: string;
  lng: number;
  lat: number;
  heading?: number;
  speedKmh?: number;
  accuracyM?: number;
  recordedAt: string;
};

function requireClient(): SupabaseClient {
  if (!mobileSupabase) throw new Error("Supabase mobile configuration hin guutamne.");
  return mobileSupabase;
}

function functionsBaseUrl(): string {
  const explicit = (import.meta.env.VITE_SUPABASE_FUNCTIONS_URL ?? "").trim().replace(/\/+$/, "");
  if (explicit) return explicit;
  const projectUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  if (!projectUrl) throw new Error("Supabase Functions URL hin qindaa'ne.");
  return `${projectUrl}/functions/v1`;
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

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as { error?: unknown };
    return typeof payload.error === "string" && payload.error.trim() ? payload.error : fallback;
  } catch {
    return fallback;
  }
}

export async function fetchDriverActiveTrip(expectedUserId: string): Promise<DriverActiveTripOrder | null> {
  const { client, user } = await requireExpectedDriver(expectedUserId);
  const { data, error } = await client
    .from("orders")
    .select("id,tracking_id,status,pickup_address,dropoff_address,price_etb,accepted_at")
    .eq("driver_id", user.id)
    .in("status", ["accepted", "in_transit"])
    .order("accepted_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return normalizeDriverActiveTripOrder(data);
}

export async function fetchDriverAssignedTrip(
  expectedUserId: string,
  orderId: string,
): Promise<DriverActiveTripOrder | null> {
  const { client, user } = await requireExpectedDriver(expectedUserId);
  const { data, error } = await client
    .from("orders")
    .select("id,tracking_id,status,pickup_address,dropoff_address,price_etb,accepted_at")
    .eq("id", orderId)
    .eq("driver_id", user.id)
    .in("status", ["accepted", "in_transit"])
    .maybeSingle();
  if (error) throw new Error(error.message);
  return normalizeDriverActiveTripOrder(data);
}

export async function fetchDriverNavigation(
  expectedUserId: string,
  orderId: string,
): Promise<DriverNavigationRoute> {
  const { session } = await requireExpectedDriver(expectedUserId);
  const response = await fetch(`${functionsBaseUrl()}/navigation?orderId=${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!response.ok) throw new Error(await readError(response, "Route fe'uun hin danda'amne."));
  const route = normalizeDriverNavigationRoute(await response.json());
  if (!route) throw new Error("Route server irraa deebi'e sirrii miti.");
  return route;
}

export async function sendDriverTrackingPing(
  expectedUserId: string,
  ping: DriverTrackingPing,
): Promise<DriverActiveTripOrder> {
  const { session } = await requireExpectedDriver(expectedUserId);
  const response = await fetch(`${functionsBaseUrl()}/tracking`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(ping),
  });
  if (!response.ok) throw new Error(await readError(response, "GPS update erguun hin danda'amne."));

  const current = await fetchDriverAssignedTrip(expectedUserId, ping.orderId);
  if (!current) {
    throw new Error("Trip kun siif assigned miti ykn lifecycle isaa xumurameera.");
  }
  return current;
}

export function subscribeToDriverActiveTrip(
  userId: string,
  onChange: () => void,
): () => void {
  const client = requireClient();
  let channel: RealtimeChannel | null = client
    .channel(`mobile-driver-active-trip-${userId}`)
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
    const active = channel;
    channel = null;
    void client.removeChannel(active);
  };
}

export function isDriverNetworkFailure(error: unknown): boolean {
  return (typeof navigator !== "undefined" && navigator.onLine === false)
    || error instanceof TypeError;
}
