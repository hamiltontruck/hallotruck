import { customerSupabase } from "./auth/customer-supabase";

export type CustomerMobileAssignment = {
  order_id: string;
  driver_name: string | null;
  driver_phone: string | null;
  driver_verified: boolean | null;
  license_verified: boolean | null;
  national_id_verified: boolean | null;
  plate_number: string | null;
  vehicle_type: string | null;
  capacity_tons: number | null;
  truck_photo_path: string | null;
  driver_photo_path: string | null;
};

const PHOTO_URL_TTL_SECONDS = 3600;

async function requireCustomerSession(userId: string) {
  const client = customerSupabase;
  if (!client) throw new Error("Customer Supabase is not configured.");

  const { data: auth, error } = await client.auth.getUser();
  if (error || !auth.user || auth.user.id !== userId) {
    throw new Error("Customer session expired.");
  }
  return client;
}

export async function loadCustomerAssignments(userId: string, orderIds: string[]) {
  if (!orderIds.length) return [] as CustomerMobileAssignment[];
  const client = await requireCustomerSession(userId);
  const allowedOrderIds = new Set(orderIds);
  const { data, error } = await client.rpc("customer_driver_assignment_cards");
  if (error) throw new Error(error.message);

  return ((data ?? []) as CustomerMobileAssignment[])
    .filter((assignment) => allowedOrderIds.has(assignment.order_id));
}

export async function createCustomerAssignmentPhotoUrl(userId: string, path: string) {
  const cleanPath = path.trim();
  if (!cleanPath) throw new Error("Assignment photo path is missing.");
  const client = await requireCustomerSession(userId);
  const { data, error } = await client.storage
    .from("driver-verification")
    .createSignedUrl(cleanPath, PHOTO_URL_TTL_SECONDS);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
