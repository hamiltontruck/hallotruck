import { customerSupabase } from "./auth/customer-supabase";

async function requireCustomerSession(userId: string) {
  const client = customerSupabase;
  if (!client) throw new Error("Customer Supabase is not configured.");
  const { data: auth, error } = await client.auth.getUser();
  if (error || !auth.user || auth.user.id !== userId) throw new Error("Customer session expired.");
  return client;
}

export async function subscribeCustomerOrderChanges(userId: string, onChange: () => void) {
  const client = await requireCustomerSession(userId);
  const channel = client.channel(`customer-mobile-orders:${userId}`);
  channel.on("postgres_changes", {
    event: "*",
    schema: "public",
    table: "orders",
    filter: `customer_id=eq.${userId}`,
  }, onChange);
  channel.subscribe();
  return () => { void client.removeChannel(channel); };
}
