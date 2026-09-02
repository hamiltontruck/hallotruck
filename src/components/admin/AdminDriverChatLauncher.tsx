import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatConversation } from "../chat/ChatConversation";
import {
  loadAdminDriverChatInbox,
  loadDriverChatMessages,
  loadDriverChatOrders,
  loadDriverChatThread,
  markDriverChatRead,
  openAdminDriverChat,
  sendDriverChatMessage,
  stopDriverChatWatch,
  watchDriverChat,
  type DriverChatInboxRow,
  type DriverChatMessage,
  type DriverChatOrder,
  type DriverChatThread,
} from "../../services/driver-chat.service";
import { supabase } from "../../services/supabase.client";

const quickReplies = [
  "Confirm your current status.",
  "Call Operations when it is safe.",
  "Please check the assigned order details.",
  "Send a payment status update.",
  "Please review your compliance documents.",
];

export function AdminDriverChatLauncher() {
  const [open, setOpen] = useState(false);
  const [inbox, setInbox] = useState<DriverChatInboxRow[]>([]);
  const [search, setSearch] = useState("");
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [thread, setThread] = useState<DriverChatThread | null>(null);
  const [messages, setMessages] = useState<DriverChatMessage[]>([]);
  const [orders, setOrders] = useState<DriverChatOrder[]>([]);
  const [actorId, setActorId] = useState("");
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const refreshInbox = useCallback(async () => {
    setLoadingInbox(true);
    try {
      const rows = await loadAdminDriverChatInbox();
      setInbox(rows);
      setError("");
      return rows;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Driver chat inbox could not be loaded.");
      return [];
    } finally {
      setLoadingInbox(false);
    }
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
    if (!open) return;
    let active = true;
    void (async () => {
      const [{ data }, rows] = await Promise.all([supabase.auth.getUser(), loadAdminDriverChatInbox()]);
      if (!active) return;
      setActorId(data.user?.id ?? "");
      setInbox(rows);
      const preferred = rows.find((row) => Number(row.unread_count) > 0) ?? rows[0];
      if (preferred) setSelectedDriverId((current) => current ?? preferred.driver_id);
    })().catch((loadError) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Admin Driver chat could not be opened.");
    });
    return () => { active = false; };
  }, [open]);

  useEffect(() => {
    if (!open || !selectedDriverId) return;
    let active = true;
    setLoadingConversation(true);
    setError("");
    void (async () => {
      const nextThreadId = await openAdminDriverChat(selectedDriverId);
      if (!active) return;
      setThreadId(nextThreadId);
      await refreshConversation(nextThreadId, selectedDriverId);
      await markDriverChatRead(nextThreadId);
      if (!active) return;
      await refreshConversation(nextThreadId, selectedDriverId);
      await refreshInbox();
    })().catch((loadError) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Driver conversation could not be loaded.");
    }).finally(() => {
      if (active) setLoadingConversation(false);
    });
    return () => { active = false; };
  }, [open, selectedDriverId, refreshConversation, refreshInbox]);

  useEffect(() => {
    if (!open || !threadId || !selectedDriverId) return;
    const channel = watchDriverChat(
      threadId,
      () => {
        void refreshConversation(threadId, selectedDriverId)
          .then(() => markDriverChatRead(threadId))
          .then(() => refreshInbox())
          .catch(() => undefined);
      },
      () => {
        void refreshConversation(threadId, selectedDriverId)
          .then(() => refreshInbox())
          .catch(() => undefined);
      },
    );
    return () => { void stopDriverChatWatch(channel); };
  }, [open, threadId, selectedDriverId, refreshConversation, refreshInbox]);

  const unreadTotal = useMemo(() => inbox.reduce((sum, row) => sum + Number(row.unread_count || 0), 0), [inbox]);
  const selected = inbox.find((row) => row.driver_id === selectedDriverId) ?? null;
  const filteredInbox = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return inbox;
    return inbox.filter((row) => `${row.driver_name} ${row.driver_phone}`.toLowerCase().includes(query));
  }, [inbox, search]);

  async function send(input: { body: string; orderId: string | null; kind: "text" | "quick_reply" | "order_context" }) {
    if (!threadId || !selectedDriverId) return;
    setSending(true);
    setError("");
    try {
      await sendDriverChatMessage({ threadId, body: input.body, orderId: input.orderId, kind: input.kind });
      await refreshConversation(threadId, selectedDriverId);
      await refreshInbox();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Message could not be sent.");
      throw sendError;
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open Admin to Driver chat"
        className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-40 grid h-14 w-14 place-items-center rounded-2xl bg-asphalt text-xl text-white shadow-xl ring-1 ring-white/10 transition hover:-translate-y-0.5 lg:bottom-6 lg:right-6"
      >
        <span aria-hidden="true">💬</span>
        {unreadTotal > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-route px-1.5 py-1 text-center font-mono text-[9px] font-bold text-white">{unreadTotal > 99 ? "99+" : unreadTotal}</span>}
      </button>

      {open && <button type="button" aria-label="Close Driver chat" onClick={() => setOpen(false)} className="fixed inset-0 z-50 bg-asphalt/45 backdrop-blur-[2px]" />}
      <aside className={`fixed inset-y-0 right-0 z-[60] w-full max-w-[980px] transform bg-white shadow-2xl transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`} aria-hidden={!open} aria-label="Admin Driver chat">
        <div className="grid h-full min-h-0 lg:grid-cols-[320px_minmax(0,1fr)]">
          <section className={`${selectedDriverId ? "hidden lg:flex" : "flex"} min-h-0 flex-col border-r border-asphalt/10 bg-asphalt text-white`}>
            <header className="border-b border-white/10 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[9px] tracking-[.18em] text-amber">OPERATIONS CHAT</p>
                  <h2 className="mt-1 font-display text-xl font-bold">Drivers</h2>
                  <p className="mt-1 text-[11px] text-white/45">Secure Admin / CEO channel</p>
                </div>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close chat" className="grid h-10 w-10 place-items-center rounded-xl border border-white/15 text-xl text-white/70">×</button>
              </div>
              <label className="mt-4 block">
                <span className="sr-only">Search Drivers</span>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Driver or phone…" className="w-full rounded-xl border border-white/10 bg-white/10 px-3 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber" />
              </label>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {loadingInbox && inbox.length === 0 && <p className="p-5 text-center font-mono text-xs text-white/40">Loading Drivers…</p>}
              {!loadingInbox && filteredInbox.length === 0 && <p className="p-5 text-center text-xs text-white/40">No approved Drivers match this search.</p>}
              {filteredInbox.map((row) => {
                const unread = Number(row.unread_count || 0);
                const active = row.driver_id === selectedDriverId;
                return (
                  <button key={row.driver_id} type="button" onClick={() => setSelectedDriverId(row.driver_id)} className={`mb-1 flex w-full min-w-0 items-center gap-3 rounded-xl px-3 py-3 text-left transition ${active ? "bg-white text-asphalt" : "text-white hover:bg-white/5"}`}>
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full font-display text-sm font-bold ${active ? "bg-amber text-asphalt" : "bg-white/10 text-white"}`}>{row.driver_name.slice(0, 2).toUpperCase()}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{row.driver_name}</span>
                      <span className={`mt-0.5 block truncate text-[10px] ${active ? "text-steel" : "text-white/40"}`}>{row.last_message_preview ?? row.driver_phone}</span>
                    </span>
                    {unread > 0 && <span className="min-w-5 rounded-full bg-route px-1.5 py-1 text-center font-mono text-[9px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
                  </button>
                );
              })}
            </div>
          </section>

          <section className={`${selectedDriverId ? "flex" : "hidden lg:flex"} min-h-0 min-w-0 flex-col bg-[#f7f6f1]`}>
            <div className="flex items-center justify-between border-b border-asphalt/10 bg-white px-3 py-2 lg:hidden">
              <button type="button" onClick={() => setSelectedDriverId(null)} className="rounded-xl border border-asphalt/10 px-3 py-2 text-xs font-semibold">← Drivers</button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close chat" className="grid h-9 w-9 place-items-center rounded-xl border border-asphalt/10 text-lg">×</button>
            </div>
            {selected && actorId ? (
              <div className="min-h-0 flex-1">
                <ChatConversation
                  title={selected.driver_name}
                  subtitle={`${selected.driver_phone} · HALLO Driver operations`}
                  participantBadge={selected.driver_status}
                  messages={messages}
                  orders={orders}
                  currentUserId={actorId}
                  peerReadAt={thread?.driver_last_read_at ?? null}
                  quickReplies={quickReplies}
                  sending={sending}
                  loading={loadingConversation}
                  error={error}
                  onSend={send}
                />
              </div>
            ) : (
              <div className="grid min-h-0 flex-1 place-items-center p-8 text-center">
                <div className="max-w-sm">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-asphalt text-2xl text-white">💬</div>
                  <h2 className="mt-5 font-display text-2xl font-bold">Choose a Driver</h2>
                  <p className="mt-2 text-sm leading-6 text-steel">Open a secure real-time operations conversation. Driver messages remain isolated to that Driver and active leadership.</p>
                </div>
              </div>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
