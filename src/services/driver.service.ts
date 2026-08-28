import { supabase } from "./supabase.client";

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL as string;
const VERIFICATION_BUCKET = "driver-verification";
const MAX_VERIFICATION_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_VERIFICATION_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const PHOTO_ONLY_KEYS = new Set(["driver_photo", "truck_front", "truck_back", "truck_side", "truck_loading_area"]);

async function authHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return {
    "Content-Type": "application/json",
    ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

export interface AvailableJob {
  id: string;
  tracking_id: string;
  pickup_address: string;
  dropoff_address: string;
  vehicle_type: string;
  distance_km: number;
  price_etb: number;
  cargo_description: string | null;
}

export interface DriverTruckOption {
  id: string;
  plate_number: string;
  vehicle_type: string;
  capacity_tons: number | null;
  status: string;
}

export async function getAvailableJobs(): Promise<AvailableJob[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, tracking_id, pickup_address, dropoff_address, vehicle_type, distance_km, price_etb, cargo_description",
    )
    .eq("status", "placed")
    .is("driver_id", null)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getAvailableTrucksForOrder(orderId: string): Promise<DriverTruckOption[]> {
  const { data, error } = await supabase.rpc("driver_available_trucks_for_order", {
    p_order_id: orderId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as DriverTruckOption[];
}

export async function acceptJob(orderId: string, truckId?: string) {
  const rpc = truckId ? "claim_order_with_truck" : "claim_order";
  const params = truckId
    ? { p_order_id: orderId, p_truck_id: truckId }
    : { p_order_id: orderId };
  const { data, error } = await supabase.rpc(rpc, params);

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Someone else already took this load.");
}

export async function markDelivered(orderId: string) {
  const { data, error } = await supabase.rpc("complete_order", {
    p_order_id: orderId,
  });

  if (error) throw new Error(error.message);
  if (!data) throw new Error("This trip could not be marked as delivered.");
}

export async function sendGpsPing(params: {
  orderId: string;
  lng: number;
  lat: number;
  heading?: number;
  speedKmh?: number;
}) {
  const res = await fetch(`${FUNCTIONS_URL}/tracking`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "GPS ping failed");
  return res.json();
}

export type VerificationDocumentKey =
  | "driver_photo"
  | "license_front"
  | "license_back"
  | "national_id_front"
  | "national_id_back"
  | "vehicle_registration"
  | "insurance"
  | "transport_permit"
  | "truck_front"
  | "truck_back"
  | "truck_side"
  | "truck_loading_area";

export interface DriverVerificationFile {
  id: string;
  driver_id: string;
  truck_id: string | null;
  document_key: VerificationDocumentKey;
  file_path: string;
  original_name: string;
  mime_type: string;
  expiry_date: string | null;
  status: "pending" | "verified" | "rejected";
  rejection_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DriverVerificationProfile {
  profile: {
    id: string;
    full_name: string;
    phone: string;
    email: string | null;
    home_address: string | null;
    driver_status: string | null;
  };
  truck: {
    id: string;
    plate_number: string;
    vehicle_type: string;
    capacity_tons: number | null;
    status: string;
  } | null;
  documents: DriverVerificationFile[];
}

export const DRIVER_VEHICLE_TYPES = [
  "Pickup",
  "Van",
  "Isuzu 5 Ton",
  "Dry Cargo",
  "Refrigerated",
  "Truck 22 Ton",
  "Truck 25 Ton",
  "Truck 30 Ton",
  "Trailer",
] as const;

export type DriverVehicleType = (typeof DRIVER_VEHICLE_TYPES)[number];

function ensureEthiopianPhone(phone: string) {
  const normalized = phone.replace(/\s+/g, "");
  if (!/^(09\d{8}|\+2519\d{8})$/.test(normalized)) {
    throw new Error("Phone must be 09xxxxxxxx or +2519xxxxxxxx.");
  }
  return normalized;
}

function cleanFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-80) || "file";
}

function validateVerificationFile(documentKey: VerificationDocumentKey, file: File) {
  if (!ALLOWED_VERIFICATION_MIME.has(file.type)) {
    throw new Error("Upload JPG, PNG, WebP or PDF only.");
  }
  if (PHOTO_ONLY_KEYS.has(documentKey) && !file.type.startsWith("image/")) {
    throw new Error("This item must be a JPG, PNG or WebP photo.");
  }
  if (file.size > MAX_VERIFICATION_FILE_BYTES) {
    throw new Error("Verification files must be 10 MB or smaller.");
  }
}

export async function getMyVerificationProfile(): Promise<DriverVerificationProfile> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error("Sign in required.");

  const [profileResult, directTruckResult, documentsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,full_name,phone,email,home_address,driver_status")
      .eq("id", auth.user.id)
      .single(),
    supabase
      .from("trucks")
      .select("id,plate_number,vehicle_type,capacity_tons,status")
      .eq("driver_id", auth.user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("driver_verification_files")
      .select("id,driver_id,truck_id,document_key,file_path,original_name,mime_type,expiry_date,status,rejection_reason,reviewed_at,created_at,updated_at")
      .eq("driver_id", auth.user.id)
      .order("updated_at", { ascending: false }),
  ]);

  if (profileResult.error) throw new Error(profileResult.error.message);
  if (directTruckResult.error) throw new Error(directTruckResult.error.message);
  if (documentsResult.error) throw new Error(documentsResult.error.message);

  let truck = directTruckResult.data;
  if (!truck) {
    const { data: recentOrder, error: orderError } = await supabase
      .from("orders")
      .select("truck_id")
      .eq("driver_id", auth.user.id)
      .not("truck_id", "is", null)
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (orderError) throw new Error(orderError.message);
    if (recentOrder?.truck_id) {
      const { data: recentTruck, error: truckError } = await supabase
        .from("trucks")
        .select("id,plate_number,vehicle_type,capacity_tons,status")
        .eq("id", recentOrder.truck_id)
        .maybeSingle();
      if (truckError) throw new Error(truckError.message);
      truck = recentTruck;
    }
  }

  return {
    profile: profileResult.data,
    truck: truck ?? null,
    documents: (documentsResult.data ?? []) as DriverVerificationFile[],
  };
}

export async function updateMyVerificationProfile(input: {
  fullName: string;
  phone: string;
  email: string;
  homeAddress: string;
}) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Sign in required.");
  const fullName = input.fullName.trim();
  const phone = ensureEthiopianPhone(input.phone);
  const email = input.email.trim().toLowerCase();
  const homeAddress = input.homeAddress.trim();
  if (fullName.length < 2) throw new Error("Enter your full legal name.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  if (homeAddress.length < 4) throw new Error("Enter your home address.");

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, phone, email: email || null, home_address: homeAddress })
    .eq("id", auth.user.id);
  if (error) throw new Error(error.message);
}

export async function saveMyVehicleProfile(input: {
  plateNumber: string;
  vehicleType: DriverVehicleType;
  capacityTons: number;
}): Promise<NonNullable<DriverVerificationProfile["truck"]>> {
  const plateNumber = input.plateNumber.trim();
  if (plateNumber.length < 3) throw new Error("Enter a valid plate number.");
  if (!DRIVER_VEHICLE_TYPES.includes(input.vehicleType)) throw new Error("Choose a valid vehicle type.");
  if (!Number.isFinite(input.capacityTons) || input.capacityTons < 0.1 || input.capacityTons > 60) {
    throw new Error("Vehicle capacity must be between 0.1 and 60 tons.");
  }

  const { data, error } = await supabase.rpc("driver_save_vehicle_profile", {
    p_plate_number: plateNumber,
    p_vehicle_type: input.vehicleType,
    p_capacity_tons: input.capacityTons,
  });
  if (error) throw new Error(error.message);

  const truck = Array.isArray(data) ? data[0] : data;
  if (!truck) throw new Error("Vehicle details could not be saved.");
  return truck as NonNullable<DriverVerificationProfile["truck"]>;
}

export async function replaceVerificationDocument(input: {
  documentKey: VerificationDocumentKey;
  file: File;
  truckId?: string | null;
  expiryDate?: string | null;
}) {
  validateVerificationFile(input.documentKey, input.file);
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Sign in required.");

  const truckId = input.truckId ?? null;
  const scope = truckId ? `truck-${truckId}` : "identity";
  const path = `${auth.user.id}/${scope}/${input.documentKey}/${Date.now()}-${cleanFileName(input.file.name)}`;
  const upload = await supabase.storage.from(VERIFICATION_BUCKET).upload(path, input.file, {
    contentType: input.file.type,
    upsert: false,
  });
  if (upload.error) throw new Error(upload.error.message);

  try {
    let existingQuery = supabase
      .from("driver_verification_files")
      .select("id,file_path")
      .eq("driver_id", auth.user.id)
      .eq("document_key", input.documentKey);
    existingQuery = truckId ? existingQuery.eq("truck_id", truckId) : existingQuery.is("truck_id", null);
    const { data: existing, error: existingError } = await existingQuery.maybeSingle();
    if (existingError) throw new Error(existingError.message);

    const record = {
      driver_id: auth.user.id,
      truck_id: truckId,
      document_key: input.documentKey,
      file_path: path,
      original_name: input.file.name,
      mime_type: input.file.type,
      expiry_date: input.expiryDate || null,
      status: "pending",
      rejection_reason: null,
      reviewed_by: null,
      reviewed_at: null,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      const { error } = await supabase.from("driver_verification_files").update(record).eq("id", existing.id);
      if (error) throw new Error(error.message);
      if (existing.file_path && existing.file_path !== path) {
        await supabase.storage.from(VERIFICATION_BUCKET).remove([existing.file_path]);
      }
    } else {
      const { error } = await supabase.from("driver_verification_files").insert(record);
      if (error) throw new Error(error.message);
    }
  } catch (error) {
    await supabase.storage.from(VERIFICATION_BUCKET).remove([path]);
    throw error;
  }
}

export async function openVerificationDocument(filePath: string) {
  const { data, error } = await supabase.storage.from(VERIFICATION_BUCKET).createSignedUrl(filePath, 300);
  if (error) throw new Error(error.message);
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

export interface NavigationStep {
  instruction: string;
  distanceM: number;
  durationSec: number;
  location: [number, number] | null;
}

export interface NavigationRoute {
  geometry: GeoJSON.LineString;
  distanceKm: number;
  durationMin: number;
  steps: NavigationStep[];
}

export async function getNavigation(orderId: string): Promise<NavigationRoute> {
  const res = await fetch(`${FUNCTIONS_URL}/navigation?orderId=${orderId}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't load route");
  return res.json();
}

export interface MyOrder {
  id: string;
  tracking_id: string;
  status: string;
  pickup_address: string;
  dropoff_address: string;
  price_etb: number;
  payment_terms: string;
  cancellation_reason: string | null;
  cancelled_at: string | null;
}

export async function getMyActiveOrders(): Promise<MyOrder[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Driver session expired.");

  const { data, error } = await supabase
    .from("orders")
    .select("id, tracking_id, status, pickup_address, dropoff_address, price_etb, payment_terms, cancellation_reason, cancelled_at")
    .eq("driver_id", auth.user.id)
    .in("status", ["accepted", "in_transit"])
    .order("accepted_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getMyAssignedOrder(orderId: string): Promise<MyOrder | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Driver session expired.");

  const { data, error } = await supabase
    .from("orders")
    .select("id, tracking_id, status, pickup_address, dropoff_address, price_etb, payment_terms, cancellation_reason, cancelled_at")
    .eq("id", orderId)
    .eq("driver_id", auth.user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function getMyLatestCancelledOrder(): Promise<MyOrder | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Driver session expired.");

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("orders")
    .select("id, tracking_id, status, pickup_address, dropoff_address, price_etb, payment_terms, cancellation_reason, cancelled_at")
    .eq("driver_id", auth.user.id)
    .eq("status", "cancelled")
    .gte("cancelled_at", sevenDaysAgo)
    .order("cancelled_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function getEarnings(): Promise<{ totalTrips: number; totalEtb: number }> {
  const { data, error } = await supabase
    .from("orders")
    .select("price_etb")
    .eq("status", "delivered")
    .eq("payment_status", "released");

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return {
    totalTrips: rows.length,
    totalEtb: rows.reduce((sum, r) => sum + Number(r.price_etb ?? 0), 0),
  };
}
