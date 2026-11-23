import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

export const customerSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const customerSupabase: SupabaseClient | null = customerSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        // Authorization Code + PKCE: the browser retains the verifier for this origin.
        // detectSessionInUrl handles the callback; do not exchange the same code twice.
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "hallo-customer-mobile-auth-v2",
      },
    })
  : null;
