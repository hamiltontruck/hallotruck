import { supabase } from "./supabase.client";

export type DriverPaymentEvent = "initiated" | "held_escrow" | "released";
export type DriverPaymentConfirmationType = "payment_confirmed" | "payment_not_received" | null;

export interface DriverPaymentStatus {
  payment_id: string;
  provider: string;
  provider_ref: string | null;
  amount_etb: number;
  payment_event: DriverPaymentEvent;
  confirmation_type: DriverPaymentConfirmationType;
  confirmation_reason: string | null;
  confirmed_at: string | null;
  released_at: string | null;
  order_status: string;
  can_confirm: boolean;
  can_report_not_received: boolean;
}

export interface AssignedCustomerContact {
  customer_name: string;
  customer_phone: string | null;
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
  return String(data ?? "confirmed_waiting_admin_release");
}

export async function reportDriverPaymentNotReceived(
  paymentId: string,
  reason: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("driver_report_payment_not_received", {
    p_payment_id: paymentId,
    p_reason: reason.trim(),
  });
  if (error) throw new Error(error.message);
  return String(data ?? "payment_not_received");
}

export async function getAssignedCustomerContact(orderId: string): Promise<AssignedCustomerContact> {
  const { data, error } = await supabase.rpc("driver_order_contact", {
    p_order_id: orderId,
  });
  if (error) throw new Error(error.message);
  const row = data?.[0] as AssignedCustomerContact | undefined;
  if (!row) throw new Error("Customer contact is unavailable for this order.");
  return row;
}
