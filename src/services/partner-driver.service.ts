import { createClient } from "@supabase/supabase-js";
import { requireValidEmail, requireValidEthiopianPhone } from "../domain/contact-validation";
import { isValidNewRolePassword, ROLE_PIN_ERROR } from "../domain/password-recovery";
import { supabase } from "./supabase.client";

export interface PartnerDriverRegistration {
  id: string; partner_id: string; partner_name: string; full_name: string;
  email: string; phone: string; status: "invited" | "registered" | "approved" | "rejected";
  driver_id: string | null; driver_status: string | null; expires_at: string;
  review_note: string | null; token: string | null;
}
export async function listPartnerDrivers(partnerId?: string): Promise<PartnerDriverRegistration[]> {
  const { data, error } = await supabase.rpc("list_partner_driver_registrations", { p_partner_id: partnerId ?? null });
  if (error) throw new Error(error.message);
  return data ?? [];
}
export async function addPartnerDriver(partnerId: string, fullName: string, email: string, phone: string) {
  const { data, error } = await supabase.rpc("create_partner_driver_registration", {
    p_partner_id: partnerId, p_full_name: fullName.trim(),
    p_email: requireValidEmail(email), p_phone: requireValidEthiopianPhone(phone),
  });
  if (error) throw new Error(error.message);
  return data as { id: string; token: string; expires_at: string };
}
export function partnerDriverJoinUrl(token: string) {
  return `${window.location.origin}${window.location.pathname}#/partner/driver-join?token=${encodeURIComponent(token)}`;
}
export async function linkPartnerDriverVehicle(registrationId: string, truckId: string) {
  const { error } = await supabase.rpc("link_partner_driver_onboarding_vehicle", { p_registration_id: registrationId, p_truck_id: truckId });
  if (error) throw new Error(error.message);
}
export async function reviewPartnerDriver(id: string, decision: "approved" | "rejected", reason: string) {
  const { error } = await supabase.rpc("review_partner_driver_registration", {
    p_registration_id: id, p_decision: decision, p_reason: reason.trim(),
  });
  if (error) throw new Error(error.message);
}

// Driver signup must never replace the Partner's logged-in browser session.
export function createPartnerDriverSignupClient() {
  return createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
export function validatePartnerDriverSignup(email: string, phone: string, password: string) {
  if (!isValidNewRolePassword(password)) throw new Error(ROLE_PIN_ERROR);
  return { email: requireValidEmail(email), phone: requireValidEthiopianPhone(phone) };
}
