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
export interface DriverWorkspace {
  kind: "hallo" | "partner"; driver_id: string; partner_id: string | null;
  partner_name: string | null; organization_active: boolean;
  driver_status: string | null; registration_status: string | null;
}
export interface DriverRosterRow {
  id: string; full_name: string; phone: string | null; email: string | null;
  home_address: string | null; driver_status: string | null; partner_id: string | null;
  partner_name: string | null; truck_id: string | null; plate_number: string | null;
}
export async function getMyDriverWorkspace(): Promise<DriverWorkspace> {
  const { data, error } = await supabase.rpc("get_my_driver_workspace");
  if (error) throw new Error(error.message);
  if (!data || !["hallo", "partner"].includes(data.kind)) throw new Error("Driver workspace could not be verified. Retry before continuing.");
  return data as DriverWorkspace;
}
export async function getAdminDriverRoster(scope: "hallo" | "partner"): Promise<DriverRosterRow[]> {
  const { data, error } = await supabase.rpc("list_admin_driver_roster", { p_scope: scope });
  if (error) throw new Error(error.message);
  return data ?? [];
}
export async function getPartnerDriverRoster(partnerId: string): Promise<DriverRosterRow[]> {
  const { data, error } = await supabase.rpc("list_partner_driver_roster", { p_partner_id: partnerId });
  if (error) throw new Error(error.message);
  return data ?? [];
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
  if (!["approved", "rejected"].includes(decision)) throw new Error("Choose a review action before saving.");
  const { error } = await supabase.rpc("review_partner_driver_registration", {
    p_registration_id: id, p_decision: decision, p_reason: reason.trim(),
  });
  if (error) throw new Error(error.message);
}
export async function reopenPartnerDriver(id: string, reason: string) {
  const { error } = await supabase.rpc("reopen_partner_driver_registration", { p_registration_id: id, p_reason: reason.trim() });
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
