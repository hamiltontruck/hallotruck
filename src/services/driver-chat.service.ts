import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase.client";

export type DriverChatMessageKind = "text" | "quick_reply" | "order_context";

export interface DriverChatInboxRow {
  thread_id: string | null;
  driver_id: string;
  driver_name: string;
  driver_phone: string;
  driver_status: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_sender_id: string | null;
  unread_count: number | string;
}

export interface DriverChatThread {
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
}

export interface DriverChatMessage {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  message_kind: DriverChatMessageKind;
  order_id: string | null;
  client_message_id: string;
  created_at: string;
}

export interface DriverChatOrder {
  id: string;
  tracking_id: string;
  status: string;
  pickup_address: string;
  dropoff_address: string;
  created_at: string;
}

function fail(error: { message?: string } | null, fallback: string): never {
  throw new Error(error?.message || fallback);
}

function normalizeCount(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function loadAdminDriverChatInbox(): Promise<DriverChatInboxRow[]> {
  const { data, error } = await supabase.rpc("admin_driver_chat_inbox");
  if (error) fail(error, "Admin Driver chat inbox could not be loaded.");
  return ((data ?? []) as DriverChatInboxRow[]).map((row) => ({
    ...row,
    unread_count: normalizeCount(row.unread_count),
  }));
}

export async function openAdminDriverChat(driverId: string) {
  const { data, error } = await supabase.rpc("admin_get_or_create_driver_chat_thread", {
    p_driver_id: driverId,
  });
  if (error) fail(error, "Driver chat thread could not be opened.");
  if (!data) throw new Error("Driver chat thread id was not returned.");
  return String(data);
}

export async function openMyDriverChat() {
  const { data, error } = await supabase.rpc("driver_get_or_create_chat_thread");
  if (error) fail(error, "Operations chat could not be opened.");
  if (!data) throw new Error("Driver chat thread id was not returned.");
  return String(data);
}

export async function loadDriverChatThread(threadId: string): Promise<DriverChatThread> {
  const { data, error } = await supabase
    .from("driver_chat_threads")
    .select("id,driver_id,created_by,last_message_at,last_message_preview,last_sender_id,admin_last_read_at,driver_last_read_at,created_at,updated_at")
    .eq("id", threadId)
    .single();
  if (error || !data) fail(error, "Driver chat thread could not be loaded.");
  return data as DriverChatThread;
}

export async function loadDriverChatMessages(threadId: string): Promise<DriverChatMessage[]> {
  const { data, error } = await supabase
    .from("driver_chat_messages")
    .select("id,thread_id,sender_id,body,message_kind,order_id,client_message_id,created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(300);
  if (error) fail(error, "Driver chat messages could not be loaded.");
  return (data ?? []) as DriverChatMessage[];
}

export async function loadDriverChatOrders(driverId: string): Promise<DriverChatOrder[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("id,tracking_id,status,pickup_address,dropoff_address,created_at")
    .eq("driver_id", driverId)
    .in("status", ["accepted", "in_transit", "delivered"])
    .order("created_at", { ascending: false })
    .limit(8);
  if (error) fail(error, "Driver order context could not be loaded.");
  return (data ?? []) as DriverChatOrder[];
}

export async function sendDriverChatMessage(input: {
  threadId: string;
  body: string;
  orderId?: string | null;
  kind?: DriverChatMessageKind;
}) {
  const body = input.body.trim();
  if (!body) throw new Error("Write a message before sending.");
  if (body.length > 4000) throw new Error("Message must be 4000 characters or fewer.");
  if (!globalThis.crypto?.randomUUID) throw new Error("This browser cannot create a secure message id.");

  const { data, error } = await supabase.rpc("send_driver_chat_message", {
    p_thread_id: input.threadId,
    p_body: body,
    p_order_id: input.orderId ?? null,
    p_client_message_id: globalThis.crypto.randomUUID(),
    p_message_kind: input.kind ?? "text",
  });
  if (error) fail(error, "Message could not be sent.");
  return String(data);
}

export async function markDriverChatRead(threadId: string) {
  const { error } = await supabase.rpc("mark_driver_chat_read", { p_thread_id: threadId });
  if (error) fail(error, "Chat read status could not be updated.");
}

export async function getMyDriverChatUnreadCount() {
  const { data, error } = await supabase.rpc("my_driver_chat_unread_count");
  if (error) return 0;
  return normalizeCount(data as number | string | null);
}

export function watchDriverChat(
  threadId: string,
  onMessage: () => void,
  onReadReceipt?: () => void,
): RealtimeChannel {
  return supabase
    .channel(`driver-chat-${threadId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "driver_chat_messages", filter: `thread_id=eq.${threadId}` },
      onMessage,
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "driver_chat_threads", filter: `id=eq.${threadId}` },
      () => onReadReceipt?.(),
    )
    .subscribe();
}

export async function stopDriverChatWatch(channel: RealtimeChannel | null) {
  if (channel) await supabase.removeChannel(channel);
}
