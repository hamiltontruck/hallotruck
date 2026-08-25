import type { User } from "@supabase/supabase-js";
import {
  buildPasswordResetRedirectUrl,
  recoveryPortalFromRole,
  type RecoveryPortal,
} from "../domain/password-recovery";
import { supabase } from "./supabase.client";

export type PasswordResetRequester = (email: string) => Promise<void>;

export const requestPasswordResetEmail: PasswordResetRequester = async (email) => {
  const redirectTo = buildPasswordResetRedirectUrl(window.location.origin, window.location.pathname);
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
  if (error) throw error;
};

export async function resolveRecoveryPortal(user: User): Promise<RecoveryPortal> {
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return recoveryPortalFromRole(data?.role ?? user.app_metadata?.role);
}
