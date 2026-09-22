import { customerSupabase } from "./auth/customer-supabase";

export type CustomerMobileAvatarProfile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  home_address: string | null;
  customer_type: "individual" | "business" | null;
  company_name: string | null;
  avatar_path: string | null;
  created_at: string | null;
};

export type CustomerAvatarProgress = (percent: number, stage: string) => void;

const CUSTOMER_AVATAR_BUCKET = "customer-avatars";
const CUSTOMER_AVATAR_TTL_SECONDS = 900;
const CUSTOMER_AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const CUSTOMER_AVATAR_MAX_INPUT_BYTES = 12 * 1024 * 1024;
const CUSTOMER_AVATAR_MAX_DIMENSION = 1024;
const CUSTOMER_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function requireCustomerSession(userId: string) {
  const client = customerSupabase;
  if (!client) throw new Error("Customer Supabase is not configured.");
  const { data: auth, error } = await client.auth.getUser();
  if (error || !auth.user || auth.user.id !== userId) throw new Error("Customer session expired.");
  return client;
}

export function customerAvatarPath(userId: string) {
  return `${userId}/avatar.jpg`;
}

export async function loadCustomerMobileAvatarProfile(userId: string): Promise<CustomerMobileAvatarProfile | null> {
  const client = await requireCustomerSession(userId);
  const { data, error } = await client.rpc("customer_get_profile_v2");
  if (error) throw new Error(error.message);
  const profile = (data?.[0] ?? null) as CustomerMobileAvatarProfile | null;
  if (profile && profile.id !== userId) throw new Error("Customer profile ownership mismatch.");
  if (profile?.avatar_path && profile.avatar_path !== customerAvatarPath(userId)) {
    throw new Error("Customer avatar ownership mismatch.");
  }
  return profile;
}

export async function createCustomerAvatarUrl(userId: string, avatarPath: string) {
  const client = await requireCustomerSession(userId);
  const expectedPath = customerAvatarPath(userId);
  if (avatarPath.trim() !== expectedPath) throw new Error("Customer avatar ownership mismatch.");
  const { data, error } = await client.storage
    .from(CUSTOMER_AVATAR_BUCKET)
    .createSignedUrl(expectedPath, CUSTOMER_AVATAR_TTL_SECONDS);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

async function compressCustomerAvatar(file: File, onProgress?: CustomerAvatarProgress) {
  if (!CUSTOMER_AVATAR_TYPES.has(file.type)) throw new Error("Profile photo must be JPEG, PNG or WebP.");
  if (!file.size) throw new Error("Profile photo is empty.");
  if (file.size > CUSTOMER_AVATAR_MAX_INPUT_BYTES) throw new Error("Profile photo is too large. Choose an image under 12 MB.");

  onProgress?.(15, "Reading photo");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const next = new Image();
      next.onload = () => resolve(next);
      next.onerror = () => reject(new Error("Profile photo could not be decoded."));
      next.src = objectUrl;
    });
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) throw new Error("Profile photo dimensions are invalid.");

    const scale = Math.min(1, CUSTOMER_AVATAR_MAX_DIMENSION / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Profile photo compression is unavailable in this browser.");
    context.drawImage(image, 0, 0, targetWidth, targetHeight);

    onProgress?.(35, "Compressing photo");
    for (const quality of [0.86, 0.72, 0.58]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size > 0 && blob.size <= CUSTOMER_AVATAR_MAX_BYTES) return blob;
    }
    throw new Error("Compressed profile photo still exceeds 5 MB.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function uploadCustomerAvatar(userId: string, file: File, onProgress?: CustomerAvatarProgress) {
  const client = await requireCustomerSession(userId);
  onProgress?.(5, "Validating photo");
  const blob = await compressCustomerAvatar(file, onProgress);
  const path = customerAvatarPath(userId);

  onProgress?.(55, "Uploading photo");
  const { error: uploadError } = await client.storage
    .from(CUSTOMER_AVATAR_BUCKET)
    .upload(path, blob, { upsert: true, contentType: "image/jpeg", cacheControl: "3600" });
  if (uploadError) throw new Error(uploadError.message);

  onProgress?.(88, "Saving profile photo");
  const { error: profileError } = await client.rpc("customer_set_avatar", { p_avatar_path: path });
  if (profileError) throw new Error(profileError.message);
  onProgress?.(100, "Profile photo saved");
  return path;
}

export async function clearCustomerAvatar(userId: string) {
  const client = await requireCustomerSession(userId);
  const path = customerAvatarPath(userId);

  // The existing profile RPC is authoritative for whether an avatar is attached to the Customer.
  // Once it succeeds, a storage cleanup failure must not make the UI report that the avatar is still attached.
  const { error: profileError } = await client.rpc("customer_clear_avatar");
  if (profileError) throw new Error(profileError.message);

  const { error: storageError } = await client.storage.from(CUSTOMER_AVATAR_BUCKET).remove([path]);
  return { storageCleanupFailed: Boolean(storageError) };
}
