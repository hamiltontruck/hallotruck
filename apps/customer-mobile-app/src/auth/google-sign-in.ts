import type { SupabaseClient } from "@supabase/supabase-js";

/** Create the provider URL without asking the SDK to open a separate window. */
export async function beginCustomerGoogleSignIn(client: SupabaseClient, redirectTo: string): Promise<string> {
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error) throw error;
  if (!data.url) throw new Error("Google sign-in could not be started.");
  return data.url;
}
