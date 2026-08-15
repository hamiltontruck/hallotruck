import { supabase } from "./supabase.client";

export interface DriverPresence {
  driver_id: string;
  is_available: boolean;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  updated_at: string;
}

export async function getMyDriverPresence(): Promise<DriverPresence | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Driver session expired.");

  const { data, error } = await supabase
    .from("driver_presence")
    .select("driver_id,is_available,accuracy_m,updated_at")
    .eq("driver_id", auth.user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    ...data,
    latitude: null,
    longitude: null,
    accuracy_m: data.accuracy_m === null ? null : Number(data.accuracy_m),
  } as DriverPresence;
}

export async function setDriverPresence(input: {
  isAvailable: boolean;
  latitude?: number;
  longitude?: number;
  accuracyM?: number;
}): Promise<DriverPresence> {
  const { data, error } = await supabase.rpc("driver_set_presence", {
    p_is_available: input.isAvailable,
    p_lat: input.isAvailable ? input.latitude ?? null : null,
    p_lng: input.isAvailable ? input.longitude ?? null : null,
    p_accuracy_m: input.isAvailable ? input.accuracyM ?? null : null,
  });

  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Driver availability could not be updated.");

  return {
    ...row,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    accuracy_m: row.accuracy_m === null ? null : Number(row.accuracy_m),
  } as DriverPresence;
}
