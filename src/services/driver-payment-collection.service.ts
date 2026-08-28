import { supabase } from "./supabase.client";

export type DriverCollectionMethod = "cash" | "bank";
export type DriverTripPaymentResult = "cash_received" | "bank_telebirr" | "payment_not_received";
export type DriverCollectionEvent = "initiated" | "failed" | "held_escrow" | "released" | "refunded";

export interface DriverCollectionOrder {
  id: string;
  tracking_id: string;
  pickup_address: string;
  dropoff_address: string;
  price_etb: number | string | null;
  status: string;
  payment_terms: string;
  delivered_at: string | null;
}

export interface DriverCollectionStatus {
  payment_id: string;
  payment_event: DriverCollectionEvent;
  collection_method: DriverCollectionMethod;
  provider: string;
  provider_ref: string | null;
  amount_etb: number | string;
  receipt_path: string | null;
  rejection_reason: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

export interface UnreportedDelivery {
  order_id: string;
  tracking_id: string;
  pickup_address: string;
  dropoff_address: string;
  price_etb: number | string;
  delivered_at: string | null;
  rejection_reason: string | null;
}

export async function getUnreportedDeliveries(): Promise<UnreportedDelivery[]> {
  const { data, error } = await supabase.rpc("driver_unreported_deliveries");
  if (error) throw new Error(error.message);
  return (data ?? []) as UnreportedDelivery[];
}

export async function getDriverCollectionOrder(orderId: string): Promise<DriverCollectionOrder> {
  const { data, error } = await supabase
    .from("orders")
    .select("id,tracking_id,pickup_address,dropoff_address,price_etb,status,payment_terms,delivered_at")
    .eq("id", orderId)
    .single();

  if (error) throw new Error(error.message);
  return data as DriverCollectionOrder;
}

export async function getDriverCollectionStatus(orderId: string): Promise<DriverCollectionStatus | null> {
  const { data, error } = await supabase.rpc("driver_collected_payment_status", {
    p_order_id: orderId,
  });
  if (error) throw new Error(error.message);
  return ((data?.[0] ?? null) as DriverCollectionStatus | null);
}

export async function submitDriverCollectedPayment(input: {
  orderId: string;
  method: DriverCollectionMethod;
  provider: string;
  providerRef: string;
  amountEtb: number;
  note?: string;
}): Promise<string> {
  if (!Number.isFinite(input.amountEtb) || input.amountEtb <= 0) {
    throw new Error("A valid invoice amount is required.");
  }
  if (input.method === "bank" && !input.providerRef.trim()) {
    throw new Error("Transaction ID is required for Bank / Telebirr payment.");
  }

  const { data, error } = await supabase.rpc("driver_submit_collected_payment", {
    p_order_id: input.orderId,
    p_collection_method: input.method,
    p_provider: input.method === "cash" ? "cash_to_driver" : input.provider,
    p_provider_ref: input.method === "cash" ? null : input.providerRef.trim(),
    p_amount_etb: input.amountEtb,
    p_receipt_path: null,
    p_note: input.method === "cash" ? null : input.note?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function recordDriverTripPaymentResult(input: {
  orderId: string;
  result: DriverTripPaymentResult;
  amountCollected?: number;
  note?: string;
}): Promise<void> {
  const { error } = await supabase.rpc("driver_record_trip_payment_result", {
    p_order_id: input.orderId,
    p_result_type: input.result,
    p_amount_collected: input.amountCollected ?? null,
    p_note: input.note?.trim() || null,
  });
  if (error) throw new Error(error.message);
}
