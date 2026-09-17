import type { SupabaseClient } from "@supabase/supabase-js";
import { mobileSupabase } from "../auth/mobile-supabase";
import {
  normalizeAssignedCustomerContact,
  normalizeDriverTripPaymentStatuses,
  type DriverAssignedCustomerContact,
  type DriverTripPaymentStatus,
} from "./driver-trip-payment.model";

function requireClient(): SupabaseClient {
  if (!mobileSupabase) throw new Error("HALLO Supabase mobile configuration is missing.");
  return mobileSupabase;
}

async function requireExpectedDriver(expectedUserId: string): Promise<SupabaseClient> {
  const client = requireClient();
  const [userResult, sessionResult] = await Promise.all([
    client.auth.getUser(),
    client.auth.getSession(),
  ]);
  const user = userResult.data.user;
  const session = sessionResult.data.session;
  if (userResult.error || sessionResult.error || !user || !session) throw new Error("Driver session expired. Sign in again.");
  if (user.id !== expectedUserId || session.user.id !== expectedUserId) throw new Error("Driver mobile session changed. Reopen this trip.");
  return client;
}

export async function fetchAssignedCustomerContact(expectedUserId: string, orderId: string): Promise<DriverAssignedCustomerContact> {
  const client = await requireExpectedDriver(expectedUserId);
  const { data, error } = await client.rpc("driver_order_contact", { p_order_id: orderId });
  if (error) throw new Error(error.message);
  return normalizeAssignedCustomerContact(data);
}

export async function fetchDriverTripPaymentStatuses(expectedUserId: string, orderId: string): Promise<DriverTripPaymentStatus[]> {
  const client = await requireExpectedDriver(expectedUserId);
  const { data, error } = await client.rpc("driver_payment_status", { p_order_id: orderId });
  if (error) throw new Error(error.message);
  return normalizeDriverTripPaymentStatuses(data ?? []);
}

export async function confirmDriverTripPayment(expectedUserId: string, paymentId: string): Promise<string> {
  const client = await requireExpectedDriver(expectedUserId);
  const { data, error } = await client.rpc("driver_confirm_verified_payment", { p_payment_id: paymentId });
  if (error) throw new Error(error.message);
  return String(data ?? "confirmed_waiting_admin_release");
}

export async function reportDriverTripPaymentNotReceived(expectedUserId: string, paymentId: string, reason: string): Promise<string> {
  const normalizedReason = reason.trim();
  if (normalizedReason.length < 3) throw new Error("Enter a short reason before reporting payment as not received.");
  if (normalizedReason.length > 500) throw new Error("Payment report reason must be 500 characters or fewer.");
  const client = await requireExpectedDriver(expectedUserId);
  const { data, error } = await client.rpc("driver_report_payment_not_received", {
    p_payment_id: paymentId,
    p_reason: normalizedReason,
  });
  if (error) throw new Error(error.message);
  return String(data ?? "payment_not_received");
}
