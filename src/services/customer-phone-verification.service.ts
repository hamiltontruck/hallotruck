import { supabase } from "./supabase.client";
import { requireValidEthiopianPhone } from "../domain/contact-validation";

// QA-only: existing authenticated Customer account -> verify phone ownership.
// Does NOT create a second auth user or enable a signup/OTP screen.
function internationalPhone(value: string): string {
  const national = requireValidEthiopianPhone(value);
  return `+251${national.slice(1)}`;
}

export async function requestCustomerPhoneVerification(phone: string): Promise<string> {
  const { data: userResult, error: userError } = await supabase.auth.getUser();
  if (userError || !userResult.user) throw new Error("Sign in to verify your phone.");
  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("role").eq("id", userResult.user.id).maybeSingle();
  if (profileError || profile?.role !== "customer") throw new Error("Customer account required.");
  const normalized = internationalPhone(phone);
  const { error } = await supabase.auth.updateUser({ phone: normalized });
  if (error) throw error;
  return normalized;
}

export async function confirmCustomerPhoneVerification(phone: string, code: string): Promise<void> {
  if (!/^\d{6}$/.test(code)) throw new Error("Enter the 6-digit SMS code.");
  const { data: userResult, error: userError } = await supabase.auth.getUser();
  if (userError || !userResult.user) throw new Error("Sign in to verify your phone.");
  const { error } = await supabase.auth.verifyOtp({
    phone: internationalPhone(phone),
    token: code,
    type: "phone_change",
  });
  if (error) throw error;
}
