import { useCallback, useEffect, useState } from "react";
import { ChatConversation } from "../chat/ChatConversation";
import {
  getMyDriverChatUnreadCount,
  loadDriverChatMessages,
  loadDriverChatOrders,
  loadDriverChatThread,
  markDriverChatRead,
  openMyDriverChat,
  sendDriverChatMessage,
  stopDriverChatWatch,
  watchDriverChat,
  type DriverChatMessage,
  type DriverChatOrder,
  type DriverChatThread,
} from "../../services/driver-chat.service";
import { supabase } from "../../services/supabase.client";

const quickReplies = [
  "Received, thank you.",
  "I am on the way.",
  "I need Operations support.",
  "I have a payment issue.",
  "I need help with a document.",
];

export function DriverOperationsChatLauncher() {
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [thread, setThread] = useState<DriverChatThread | null>(null);
  const [messages, setMessages] = useState<DriverChatMessage[]>([]);
  const [orders, setOrders] = useState<DriverChatOrder[]>([]);
  const [actorId, setActorId] = useState("");
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const refreshUnread = useCallback(async () => {
    setUnread(await getMyDriverChatUnreadCount());
  }, []);

  const refreshConversation = useCallback(async (nextThreadId: string, driverId: string) => {
    const [nextThread, nextMessages, nextOrders] = await Promise.all([
      loadDriverChatThread(nextThreadId),
      loadDriverChatMessages(nextThreadId),
      loadDriverChatOrders(driverId),
    ]);
    setThread(nextThread);
    setMessages(nextMessages);
    setOrders(nextOrders);
  }, []);

  useEffect(() => {
    void refreshUnread();
    const interval = window.setInterval(() => void refreshUnread(), 15_000);
    return () => window.clearInterval(interval);
  }, [refreshUnread]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError("");
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const driverId = data.user?.id;
      if (!driverId) throw new Error("Driver session is required for Operations chat.");
      const nextThreadId = await openMyDriverChat();
      if (!active) return;
      setActorId(driverId);
      setThreadId(nextThreadId);
      await refreshConversation(nextThreadId, driverId);
      await markDriverChatRead(nextThreadId);
      if (!active) return;
      await refreshConversation(nextThreadId, driverId);
      await refreshUnread();
    })().catch((loadError) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Operations chat could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [open, refreshConversation, refreshUnread]);

  useEffect(() => {
    if (!open || !threadId || !actorId) return;
    const channel = watchDriverChat(threadId, () => {
      void refreshConversation(threadId, actorId)
        .then(() => markDriverChatRead(threadId))
        .then(() => refreshUnread())
        .catch(() => undefined);
    });
    return () => { void stopDriverChatWatch(channel); };
  }, [open, threadId, actorId, refreshConversation, refreshUnread]);

  async function send(input: { body: string; orderId: string | null; kind: "text" | "quick_reply" | "order_context" }) {
    if (!threadId || !actorId) return;
    setSending(true);
    setError("");
    try {
      await sendDriverChatMessage({ threadId, body: input.body, orderId: input.orderId, kind: input.kind });
      await refreshConversation(threadId, actorId);
      await refreshUnread();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Message could not be sent.");
      throw sendError;
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="relative grid h-11 w-11 place-items-center border border-white/15 text-lg text-white/80 transition hover:border-amber hover:text-white" aria-label="Open Operations chat">
        <span aria-hidden="true">💬</span>
        {unread > 0 && <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-route px-1 py-1 text-center font-mono text-[8px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
      </button>

      {open && <button type="button" aria-label="Close Operations chat" onClick={() => setOpen(false)} className="fixed inset-0 z-50 bg-asphalt/45 backdrop-blur-[2px]" />}
      <aside className={`fixed inset-y-0 right-0 z-[60] w-full max-w-[560px] transform bg-white text-asphalt shadow-2xl transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`} aria-hidden={!open} aria-label="Driver Operations chat">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center justify-between border-b border-asphalt/10 bg-asphalt px-4 py-3 text-white">
            <div className="min-w-0">
              <p className="font-mono text-[9px] tracking-[.18em] text-amber">HALLO OPERATIONS</p>
              <p className="mt-1 truncate text-xs text-white/50">Direct secure support channel</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center border border-white/15 text-xl text-white/70" aria-label="Close chat">×</button>
          </div>
          {actorId ? (
            <div className="min-h-0 flex-1">
              <ChatConversation
                title="HALLO Operations"
                subtitle="Admin / CEO support · assignment, trip, payment & compliance"
                participantBadge="Operations"
                messages={messages}
                orders={orders}
                currentUserId={actorId}
                peerReadAt={thread?.admin_last_read_at ?? null}
                quickReplies={quickReplies}
                sending={sending}
                loading={loading}
                error={error}
                onSend={send}
              />
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 place-items-center p-6 text-center text-sm text-steel">{loading ? "Opening secure Operations chat…" : error || "Open chat to connect with HALLO Operations."}</div>
          )}
        </div>
      </aside>
    </>
  );
}
