import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "../supabase";

export const mobileSupabaseConfigured = supabaseConfigured;

export const mobileSupabase: SupabaseClient | null = mobileSupabaseConfigured
  ? supabase
  : null;
