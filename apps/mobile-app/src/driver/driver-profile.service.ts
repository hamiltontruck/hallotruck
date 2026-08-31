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

const DRIVER_PREVIEW_SECONDS = 120;
const previewMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export type DriverDocumentPreview = {
  signedUrl: string;
  mimeType: string;
  originalName: string;
  expiresInSeconds: number;
};

function requireClient(): SupabaseClient {
  if (!mobileSupabase) throw new Error("Supabase mobile configuration hin guutamne.");
  return mobileSupabase;
}

function requiredText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
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
    .select("id,file_path,original_name,mime_type,document_key,truck_id,status,expiry_date,rejection_reason,updated_at")
    .eq("driver_id", user.id)
    .order("updated_at", { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data : [])
    .map(normalizeDriverVerification)
    .filter((record): record is DriverVerificationRecord => record !== null);
}

export async function createDriverDocumentPreview({
  expectedUserId,
  documentId,
  expectedFilePath,
}: {
  expectedUserId: string;
  documentId: string;
  expectedFilePath: string;
}): Promise<DriverDocumentPreview> {
  const normalizedDocumentId = requiredText(documentId);
  const normalizedExpectedPath = requiredText(expectedFilePath);
  if (!normalizedDocumentId || !normalizedExpectedPath) {
    throw new Error("Document preview request sirrii miti.");
  }
  const { client, user } = await requireExpectedDriver(expectedUserId);
  const { data, error } = await client
    .from("driver_verification_files")
    .select("id,driver_id,file_path,original_name,mime_type")
    .eq("id", normalizedDocumentId)
    .eq("driver_id", user.id)
    .eq("file_path", normalizedExpectedPath)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const filePath = requiredText(data?.file_path);
  const originalName = requiredText(data?.original_name);
  const mimeType = requiredText(data?.mime_type);
  if (data?.id !== normalizedDocumentId || data?.driver_id !== user.id || !filePath || !originalName || !mimeType) {
    throw new Error("Document jijjiirameera ykn siif hin hayyamamne. Profile haaromsi.");
  }
  if (filePath !== normalizedExpectedPath || !filePath.startsWith(`${user.id}/`)) {
    throw new Error("Document path owner boundary hin eegu.");
  }
  if (!previewMimeTypes.has(mimeType)) {
    throw new Error("Document type kana preview gochuun hin danda'amu.");
  }
  const { data: signed, error: signedError } = await client.storage
    .from("driver-verification")
    .createSignedUrl(filePath, DRIVER_PREVIEW_SECONDS);
  if (signedError || !signed?.signedUrl) {
    throw new Error(signedError?.message || "Private document preview uumuu hin dandeenye.");
  }
  return {
    signedUrl: signed.signedUrl,
    mimeType,
    originalName,
    expiresInSeconds: DRIVER_PREVIEW_SECONDS,
  };
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
