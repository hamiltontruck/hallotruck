import { supabase } from "./supabase.client";

export type DriverPaymentEvent = "initiated" | "held_escrow" | "released";

export interface DriverPaymentStatus {
  payment_id: string;
  provider: string;
  provider_ref: string | null;
  amount_etb: number;
  payment_event: DriverPaymentEvent;
  confirmed_at: string | null;
  released_at: string | null;
  order_status: string;
  can_confirm: boolean;
}

export async function getDriverPaymentStatus(orderId: string): Promise<DriverPaymentStatus[]> {
  const { data, error } = await supabase.rpc("driver_payment_status", {
    p_order_id: orderId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: DriverPaymentStatus) => ({
    ...row,
    amount_etb: Number(row.amount_etb ?? 0),
  }));
}

export async function confirmDriverPayment(paymentId: string): Promise<string> {
  const { data, error } = await supabase.rpc("driver_confirm_verified_payment", {
    p_payment_id: paymentId,
  });
  if (error) throw new Error(error.message);
  return String(data ?? "confirmed_waiting_delivery");
}
