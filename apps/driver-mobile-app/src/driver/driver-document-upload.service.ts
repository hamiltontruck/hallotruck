import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { mobileSupabase } from "../auth/mobile-supabase";
import {
  buildVerificationObjectPath,
  validateVerificationUpload,
  type VerificationUploadFile,
} from "./driver-document-upload.model";
import {
  identityDocumentKeys,
  type VerificationDocumentKey,
} from "./driver-profile.model";

const VERIFICATION_BUCKET = "driver-verification";

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

async function verifyTruckOwnership(client: SupabaseClient, userId: string, truckId: string) {
  const { data, error } = await client
    .from("trucks")
    .select("id")
    .eq("id", truckId)
    .eq("driver_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Konkolaataan filatame Driver kanaaf assign hin taane.");
}

function uniqueToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

async function fetchExistingRecord(
  client: SupabaseClient,
  userId: string,
  documentKey: VerificationDocumentKey,
  truckId: string | null,
) {
  let query = client
    .from("driver_verification_files")
    .select("id,file_path,status")
    .eq("driver_id", userId)
    .eq("document_key", documentKey);
  query = truckId ? query.eq("truck_id", truckId) : query.is("truck_id", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string; file_path: string; status: string } | null;
}

async function reconcileSavedPath(
  client: SupabaseClient,
  userId: string,
  documentKey: VerificationDocumentKey,
  truckId: string | null,
  expectedPath: string,
): Promise<boolean | null> {
  try {
    const current = await fetchExistingRecord(client, userId, documentKey, truckId);
    return current?.file_path === expectedPath;
  } catch {
    return null;
  }
}

export type SubmitDriverVerificationInput = {
  expectedUserId: string;
  documentKey: VerificationDocumentKey;
  file: File & VerificationUploadFile;
  truckId: string | null;
  expiryDate?: string | null;
};

export type SubmitDriverVerificationResult = {
  recordId: string;
  objectPath: string;
  replaced: boolean;
  cleanupWarning: boolean;
};

export async function submitDriverVerificationDocument(
  input: SubmitDriverVerificationInput,
): Promise<SubmitDriverVerificationResult> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("Document upload offline keessatti hin queue'amu. Internet wal qunnamsiisi.");
  }

  const validation = validateVerificationUpload({
    documentKey: input.documentKey,
    file: input.file,
    truckId: input.truckId,
    expiryDate: input.expiryDate,
  });
  const { client, user } = await requireExpectedDriver(input.expectedUserId);
  const identityDocument = identityDocumentKeys.includes(input.documentKey);
  if (!identityDocument && input.truckId) {
    await verifyTruckOwnership(client, user.id, input.truckId);
  }

  const existing = await fetchExistingRecord(
    client,
    user.id,
    input.documentKey,
    input.truckId,
  );
  const objectPath = buildVerificationObjectPath({
    userId: user.id,
    documentKey: input.documentKey,
    truckId: input.truckId,
    fileName: input.file.name,
    uniqueToken: uniqueToken(),
  });

  const upload = await client.storage.from(VERIFICATION_BUCKET).upload(objectPath, input.file, {
    contentType: input.file.type,
    upsert: false,
  });
  if (upload.error) throw new Error(upload.error.message);

  const cleanupNewObject = async () => {
    await client.storage.from(VERIFICATION_BUCKET).remove([objectPath]);
  };

  try {
    await requireExpectedDriver(input.expectedUserId);
  } catch (error) {
    await cleanupNewObject();
    throw error;
  }

  const record = {
    driver_id: user.id,
    truck_id: input.truckId,
    document_key: input.documentKey,
    file_path: objectPath,
    original_name: input.file.name,
    mime_type: input.file.type,
    expiry_date: validation.expiryDate,
    status: "pending",
    rejection_reason: null,
    reviewed_by: null,
    reviewed_at: null,
    updated_at: new Date().toISOString(),
  };

  let recordId = existing?.id ?? "";
  let mutationError: Error | null = null;
  if (existing) {
    const { data, error } = await client
      .from("driver_verification_files")
      .update(record)
      .eq("id", existing.id)
      .eq("driver_id", user.id)
      .eq("file_path", existing.file_path)
      .select("id")
      .maybeSingle();
    if (error || !data?.id) {
      mutationError = new Error(error?.message || "Document biraa yeroo wal fakkaatutti jijjiirameera. Profile refresh godhi.");
    } else {
      recordId = data.id as string;
    }
  } else {
    const { data, error } = await client
      .from("driver_verification_files")
      .insert(record)
      .select("id")
      .maybeSingle();
    if (error || !data?.id) mutationError = new Error(error?.message || "Document record insert hin mirkanoofne.");
    else recordId = data.id as string;
  }

  if (mutationError) {
    const reconciled = await reconcileSavedPath(
      client,
      user.id,
      input.documentKey,
      input.truckId,
      objectPath,
    );
    if (reconciled !== true) {
      if (reconciled === false) await cleanupNewObject();
      if (reconciled === null) {
        throw new Error("Upload result hin mirkanoofne. Profile refresh godhi; deebi'ii upload hin tuqin.");
      }
      throw mutationError;
    }
    const current = await fetchExistingRecord(client, user.id, input.documentKey, input.truckId);
    recordId = current?.id ?? recordId;
  }

  let cleanupWarning = false;
  if (existing?.file_path && existing.file_path !== objectPath) {
    const cleanup = await client.storage.from(VERIFICATION_BUCKET).remove([existing.file_path]);
    cleanupWarning = Boolean(cleanup.error);
  }

  return {
    recordId,
    objectPath,
    replaced: Boolean(existing),
    cleanupWarning,
  };
}
