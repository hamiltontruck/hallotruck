import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { mobileSupabase } from "../auth/mobile-supabase";

export type DriverChatMessageKind = "text" | "quick_reply" | "order_context";

export type DriverChatThread = {
  id: string;
  driver_id: string;
  created_by: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_sender_id: string | null;
  admin_last_read_at: string | null;
  driver_last_read_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DriverChatMessage = {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  message_kind: DriverChatMessageKind;
  order_id: string | null;
  client_message_id: string;
  created_at: string;
};

export type DriverChatOrder = {
  id: string;
  tracking_id: string;
  status: string;
  pickup_address: string;
  dropoff_address: string;
  created_at: string;
};

function requireClient(): SupabaseClient {
  if (!mobileSupabase) throw new Error("HALLO Supabase mobile configuration is missing.");
  return mobileSupabase;
}

async function requireExpectedDriver(expectedUserId: string): Promise<SupabaseClient> {
  const client = requireClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Driver session expired. Sign in again.");
  if (data.user.id !== expectedUserId) throw new Error("Driver mobile session changed. Reopen the app.");
  return client;
}

function normalizeCount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function openDriverOperationsChat(expectedUserId: string): Promise<string> {
  const client = await requireExpectedDriver(expectedUserId);
  const { data, error } = await client.rpc("driver_get_or_create_chat_thread");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Driver chat thread id was not returned.");
  return String(data);
}

export async function fetchDriverChatThread(expectedUserId: string, threadId: string): Promise<DriverChatThread> {
  const client = await requireExpectedDriver(expectedUserId);
  const { data, error } = await client
    .from("driver_chat_threads")
    .select("id,driver_id,created_by,last_message_at,last_message_preview,last_sender_id,admin_last_read_at,driver_last_read_at,created_at,updated_at")
    .eq("id", threadId)
    .single();
  if (error || !data) throw new Error(error?.message || "Driver chat thread could not be loaded.");
  return data as DriverChatThread;
}

export async function fetchDriverChatMessages(expectedUserId: string, threadId: string): Promise<DriverChatMessage[]> {
  const client = await requireExpectedDriver(expectedUserId);
  const { data, error } = await client
    .from("driver_chat_messages")
    .select("id,thread_id,sender_id,body,message_kind,order_id,client_message_id,created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(300);
  if (error) throw new Error(error.message);
  return (data ?? []) as DriverChatMessage[];
}

export async function fetchDriverChatOrders(expectedUserId: string): Promise<DriverChatOrder[]> {
  const client = await requireExpectedDriver(expectedUserId);
  const { data, error } = await client
    .from("orders")
    .select("id,tracking_id,status,pickup_address,dropoff_address,created_at")
    .eq("driver_id", expectedUserId)
    .in("status", ["accepted", "in_transit", "delivered"])
    .order("created_at", { ascending: false })
    .limit(8);
  if (error) throw new Error(error.message);
  return (data ?? []) as DriverChatOrder[];
}

export async function sendDriverOperationsMessage(expectedUserId: string, input: {
  threadId: string;
  body: string;
  orderId?: string | null;
  kind?: DriverChatMessageKind;
}) {
  const body = input.body.trim();
  if (!body) throw new Error("Write a message before sending.");
  if (body.length > 4000) throw new Error("Message must be 4000 characters or fewer.");
  if (!globalThis.crypto?.randomUUID) throw new Error("This browser cannot create a secure message id.");
  const client = await requireExpectedDriver(expectedUserId);
  const { data, error } = await client.rpc("send_driver_chat_message", {
    p_thread_id: input.threadId,
    p_body: body,
    p_order_id: input.orderId ?? null,
    p_client_message_id: globalThis.crypto.randomUUID(),
    p_message_kind: input.kind ?? "text",
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function markDriverOperationsChatRead(expectedUserId: string, threadId: string) {
  const client = await requireExpectedDriver(expectedUserId);
  const { error } = await client.rpc("mark_driver_chat_read", { p_thread_id: threadId });
  if (error) throw new Error(error.message);
}

export async function fetchDriverOperationsUnreadCount(expectedUserId: string) {
  const client = await requireExpectedDriver(expectedUserId);
  const { data, error } = await client.rpc("my_driver_chat_unread_count");
  if (error) return 0;
  return normalizeCount(data);
}

export function watchDriverOperationsChat(
  threadId: string,
  onMessage: () => void,
  onReadReceipt?: () => void,
): RealtimeChannel {
  const client = requireClient();
  return client
    .channel(`mobile-driver-operations-chat-${threadId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "driver_chat_messages", filter: `thread_id=eq.${threadId}` }, onMessage)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "driver_chat_threads", filter: `id=eq.${threadId}` }, () => onReadReceipt?.())
    .subscribe();
}

export async function stopDriverOperationsChatWatch(channel: RealtimeChannel | null) {
  if (channel) await requireClient().removeChannel(channel);
}
