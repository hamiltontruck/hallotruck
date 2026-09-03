import { customerSupabase } from "./auth/customer-supabase";

export type CustomerMobileOrder = {
  id: string;
  tracking_id: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  vehicle_type: string | null;
  distance_km: number | null;
  price_etb: number | null;
  status: string | null;
  payment_status: string | null;
  selected_payment_method: string | null;
  created_at: string | null;
};

export type CustomerMobileProfile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  home_address: string | null;
  customer_type: "individual" | "business" | null;
  company_name: string | null;
  created_at: string | null;
};

export type CustomerMobilePayment = {
  id: string;
  order_id: string;
  provider: string | null;
  provider_ref: string | null;
  amount_etb: number | null;
  event: string | null;
  receipt_path: string | null;
  created_at: string | null;
};

export type CustomerMobileData = {
  orders: CustomerMobileOrder[];
  profile: CustomerMobileProfile | null;
  payments: CustomerMobilePayment[];
};

export function formatEtb(amount: number | null | undefined) {
  const value = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  return `ETB ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)}`;
}

export function formatOrderStatus(value: string | null | undefined) {
  const normalized = value?.trim().replaceAll("_", " ") || "pending";
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function requireCustomerSession(userId: string) {
  const client = customerSupabase;
  if (!client) throw new Error("Customer Supabase is not configured.");

  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user || auth.user.id !== userId) {
    throw new Error("Customer session expired.");
  }

  return client;
}

export async function loadCustomerMobileData(userId: string): Promise<CustomerMobileData> {
  const client = await requireCustomerSession(userId);

  const [ordersResult, profileResult] = await Promise.all([
    client
      .from("orders")
      .select("id,tracking_id,pickup_address,dropoff_address,vehicle_type,distance_km,price_etb,status,payment_status,selected_payment_method,created_at")
      .eq("customer_id", userId)
      .order("created_at", { ascending: false }),
    client.rpc("customer_get_profile"),
  ]);

  if (ordersResult.error) throw new Error(ordersResult.error.message);
  if (profileResult.error) throw new Error(profileResult.error.message);

  const orders = (ordersResult.data ?? []) as CustomerMobileOrder[];
  const profile = ((profileResult.data?.[0] ?? null) as CustomerMobileProfile | null);
  if (profile && profile.id !== userId) {
    throw new Error("Customer profile ownership mismatch.");
  }

  const orderIds = orders.map((order) => order.id);
  let payments: CustomerMobilePayment[] = [];

  if (orderIds.length) {
    const paymentResult = await client
      .from("payments")
      .select("id,order_id,provider,provider_ref,amount_etb,event,receipt_path,created_at")
      .in("order_id", orderIds)
      .order("created_at", { ascending: false });

    if (paymentResult.error) throw new Error(paymentResult.error.message);
    payments = (paymentResult.data ?? []) as CustomerMobilePayment[];
  }

  return {
    orders,
    profile,
    payments,
  };
}

export async function createCustomerPaymentReceiptUrl(userId: string, path: string) {
  const client = await requireCustomerSession(userId);
  const cleanPath = path.trim();
  if (!cleanPath) throw new Error("Payment receipt path is missing.");

  const { data, error } = await client.storage
    .from("payment-receipts")
    .createSignedUrl(cleanPath, 300);

  if (error) throw new Error(error.message);
  return data.signedUrl;
}
