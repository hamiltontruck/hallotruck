import { supabase } from "./supabase.client";

export interface ControlOrder {
  id: string;
  tracking_id: string;
  customer_name: string | null;
  pickup_address: string;
  dropoff_address: string;
  status: string;
  payment_status: string;
  driver_id: string | null;
  truck_id: string | null;
  accepted_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface ControlPayment {
  id: string;
  order_id: string;
  provider: string;
  provider_ref: string | null;
  amount_etb: number;
  event: string;
  receipt_path: string | null;
  raw_payload: Record<string, unknown> | null;
  created_at: string;
}

export interface ControlTruck {
  id: string;
  plate_number: string;
  status: string;
}

export interface ControlDriver {
  id: string;
  full_name: string | null;
  driver_status: string | null;
}

export interface ControlCustomer {
  id: string;
  created_at: string;
}

export interface ControlProof {
  id: string;
  order_id: string;
}

export interface ControlDocument {
  id: string;
  driver_id: string;
  document_key: string;
  status: string;
  expiry_date: string | null;
}

export interface ControlCenterData {
  orders: ControlOrder[];
  payments: ControlPayment[];
  trucks: ControlTruck[];
  drivers: ControlDriver[];
  customers: ControlCustomer[];
  proofs: ControlProof[];
  documents: ControlDocument[];
}

function fail(message: string): never {
  throw new Error(message);
}

export async function getControlCenterData(): Promise<ControlCenterData> {
  const [orders, payments, trucks, drivers, customers, proofs, documents] = await Promise.all([
    supabase
      .from("orders")
      .select("id,tracking_id,customer_name,pickup_address,dropoff_address,status,payment_status,driver_id,truck_id,accepted_at,delivered_at,created_at")
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("payments")
      .select("id,order_id,provider,provider_ref,amount_etb,event,receipt_path,raw_payload,created_at")
      .order("created_at", { ascending: false })
      .limit(4000),
    supabase.from("trucks").select("id,plate_number,status").order("created_at", { ascending: false }),
    supabase.from("profiles").select("id,full_name,driver_status").eq("role", "driver"),
    supabase.from("customers").select("id,created_at").order("created_at", { ascending: false }),
    supabase.from("delivery_proofs").select("id,order_id").order("delivered_at", { ascending: false }).limit(2000),
    supabase
      .from("driver_verification_files")
      .select("id,driver_id,document_key,status,expiry_date")
      .order("updated_at", { ascending: false })
      .limit(4000),
  ]);

  const error = orders.error || payments.error || trucks.error || drivers.error || customers.error || proofs.error;
  if (error) fail(error.message);

  // Older deployments may not have driver verification tables yet. The control
  // center remains usable and links to the dedicated compliance page.
  const documentRows = documents.error ? [] : documents.data ?? [];

  return {
    orders: (orders.data ?? []) as ControlOrder[],
    payments: (payments.data ?? []) as ControlPayment[],
    trucks: (trucks.data ?? []) as ControlTruck[],
    drivers: (drivers.data ?? []) as ControlDriver[],
    customers: (customers.data ?? []) as ControlCustomer[],
    proofs: (proofs.data ?? []) as ControlProof[],
    documents: documentRows as ControlDocument[],
  };
}
