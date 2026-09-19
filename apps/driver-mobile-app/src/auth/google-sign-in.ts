import type { SupabaseClient } from '@supabase/supabase-js';

/** Keep OAuth in this app; never carry query strings, fragments or return URLs. */
export function driverAuthRedirect(origin: string, base: string): string {
  return new URL(base, origin).href;
}

export async function beginGoogleSignIn(client: SupabaseClient, redirectTo: string) {
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error) throw error;
  if (!data.url) throw new Error('Google sign-in could not be started.');
  return data.url;
}
