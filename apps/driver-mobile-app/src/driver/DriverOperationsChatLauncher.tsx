import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  fetchDriverChatMessages,
  fetchDriverChatOrders,
  fetchDriverChatThread,
  fetchDriverOperationsUnreadCount,
  markDriverOperationsChatRead,
  openDriverOperationsChat,
  sendDriverOperationsMessage,
  stopDriverOperationsChatWatch,
  watchDriverOperationsChat,
  type DriverChatMessage,
  type DriverChatOrder,
  type DriverChatThread,
} from "./driver-chat.service";
import { getDriverV4Copy, type DriverLanguage } from "./driver-v4-i18n";

function time(value: string, language: DriverLanguage) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const locale = language === "am" ? "am-ET" : language === "om" ? "om-ET" : "en-ET";
  return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

function orderStatusLabel(status: string, language: DriverLanguage) {
  const c = getDriverV4Copy(language).common;
  const normalized = status.toLowerCase().replace(/[- ]+/g, "_");
  if (normalized === "assigned" || normalized === "accepted") return c.assigned;
  if (normalized === "in_transit" || normalized === "on_trip") return c.inTransit;
  if (normalized === "delivered" || normalized === "completed") return c.delivered;
  if (normalized === "cancelled" || normalized === "canceled") return c.cancelled;
  return status.replaceAll("_", " ");
}

export function DriverOperationsChatLauncher({
  userId,
  open,
  onOpenChange,
  language = "om",
}: {
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  language?: DriverLanguage;
}) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [thread, setThread] = useState<DriverChatThread | null>(null);
  const [messages, setMessages] = useState<DriverChatMessage[]>([]);
  const [orders, setOrders] = useState<DriverChatOrder[]>([]);
  const [unread, setUnread] = useState(0);
  const [body, setBody] = useState("");
  const [orderId, setOrderId] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const t = getDriverV4Copy(language);

  const orderById = useMemo(() => new Map(orders.map((order) => [order.id, order])), [orders]);

  const refreshUnread = useCallback(async () => {
    setUnread(await fetchDriverOperationsUnreadCount(userId));
  }, [userId]);

  const refreshConversation = useCallback(async (nextThreadId: string) => {
    const [nextThread, nextMessages, nextOrders] = await Promise.all([
      fetchDriverChatThread(userId, nextThreadId),
      fetchDriverChatMessages(userId, nextThreadId),
      fetchDriverChatOrders(userId),
    ]);
    setThread(nextThread);
    setMessages(nextMessages);
    setOrders(nextOrders);
  }, [userId]);

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
    void openDriverOperationsChat(userId)
      .then(async (nextThreadId) => {
        if (!active) return;
        setThreadId(nextThreadId);
        await refreshConversation(nextThreadId);
        await markDriverOperationsChatRead(userId, nextThreadId);
        if (!active) return;
        await refreshConversation(nextThreadId);
        await refreshUnread();
      })
      .catch(() => {
        if (active) setError(t.chat.loadError);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [open, refreshConversation, refreshUnread, t.chat.loadError, userId]);

  useEffect(() => {
    if (!open || !threadId) return;
    const channel = watchDriverOperationsChat(
      threadId,
      () => {
        void refreshConversation(threadId)
          .then(() => markDriverOperationsChatRead(userId, threadId))
          .then(() => refreshUnread())
          .catch(() => undefined);
      },
      () => {
        void refreshConversation(threadId).then(() => refreshUnread()).catch(() => undefined);
      },
    );
    return () => { void stopDriverOperationsChatWatch(channel); };
  }, [open, refreshConversation, refreshUnread, threadId, userId]);

  useEffect(() => {
    if (!open || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, open]);

  const lastOwn = [...messages].reverse().find((message) => message.sender_id === userId);
  const lastOwnSeen = Boolean(
    lastOwn
      && thread?.admin_last_read_at
      && new Date(thread.admin_last_read_at).getTime() >= new Date(lastOwn.created_at).getTime(),
  );

  async function send(text: string, quick = false) {
    const clean = text.trim();
    if (!threadId || !clean || sending) return;
    setSending(true);
    setError("");
    try {
      await sendDriverOperationsMessage(userId, {
        threadId,
        body: clean,
        orderId: orderId || null,
        kind: quick ? "quick_reply" : orderId ? "order_context" : "text",
      });
      setBody("");
      setOrderId("");
      await refreshConversation(threadId);
      await refreshUnread();
    } catch {
      setError(t.chat.sendError);
    } finally {
      setSending(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(body);
  }

  return <>
    <button
      type="button"
      onClick={() => onOpenChange(true)}
      className="relative grid h-10 w-10 place-items-center rounded-xl border border-halo-line bg-white text-base text-halo-navy"
      aria-label={t.chat.open}
      title={t.chat.open}
      data-driver-chat-launcher
    >
      <span aria-hidden="true">💬</span>
      {unread > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1 py-1 text-[8px] font-black text-white">{unread > 99 ? "99+" : unread}</span>}
    </button>

    {open && <div className="fixed inset-0 z-[90] bg-halo-navy/55 backdrop-blur-sm" role="presentation">
      <button type="button" aria-label={t.chat.close} onClick={() => onOpenChange(false)} className="absolute inset-0 h-full w-full cursor-default" />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-[560px] flex-col bg-halo-canvas shadow-2xl" role="dialog" aria-modal="true" aria-label={t.chat.dialog} data-driver-operations-chat>
        <header className="relative z-10 flex items-center justify-between border-b border-white/10 bg-halo-navy px-4 pb-3 pt-[calc(12px+env(safe-area-inset-top))] text-white">
          <div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[0.18em] text-halo-gold">HALLO OPERATIONS</p><h2 className="mt-1 truncate text-base font-black">{t.chat.title}</h2><p className="mt-1 text-[10px] text-white/50">{t.chat.subtitle}</p></div>
          <button type="button" onClick={() => onOpenChange(false)} className="grid h-11 w-11 place-items-center rounded-xl border border-white/15 text-xl" aria-label={t.chat.close}>×</button>
        </header>

        <div ref={scrollRef} className="relative z-10 min-h-0 flex-1 overflow-y-auto px-3 py-4">
          {loading && <p className="py-10 text-center text-xs font-bold text-halo-muted">{t.chat.loading}</p>}
          {!loading && messages.length === 0 && <div className="mx-auto mt-8 max-w-sm rounded-[22px] border border-dashed border-halo-line bg-white p-6 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-halo-soft text-xl">💬</div><h3 className="mt-4 text-base font-black text-halo-navy">{t.chat.emptyTitle}</h3><p className="mt-2 text-xs leading-5 text-halo-muted">{t.chat.emptyHelp}</p></div>}
          <ol className="space-y-2.5">
            {messages.map((message) => {
              const mine = message.sender_id === userId;
              const order = message.order_id ? orderById.get(message.order_id) : null;
              return <li key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[86%] rounded-2xl px-3.5 py-3 shadow-sm ${mine ? "rounded-br-md bg-halo-navy text-white" : "rounded-bl-md border border-halo-line bg-white text-halo-navy"}`}>
                  {order && <div className={`mb-2 rounded-xl px-3 py-2 text-[9px] font-bold ${mine ? "bg-white/10 text-white/75" : "bg-halo-gold-soft text-halo-gold-dark"}`}>{order.tracking_id} · {orderStatusLabel(order.status, language)}</div>}
                  <p className="whitespace-pre-wrap break-words text-sm leading-5">{message.body}</p>
                  <div className={`mt-2 flex justify-end gap-2 text-[9px] ${mine ? "text-white/45" : "text-halo-muted"}`}><span>{time(message.created_at, language)}</span>{mine && message.id === lastOwn?.id && <span>{lastOwnSeen ? t.chat.seen : t.chat.sent}</span>}</div>
                </div>
              </li>;
            })}
          </ol>
        </div>

        <div className="relative z-10 border-t border-halo-line bg-white px-3 pb-[calc(10px+env(safe-area-inset-bottom))] pt-3">
          {error && <p role="alert" className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700">{error}</p>}
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">{t.chat.quickReplies.map((reply) => <button key={reply} type="button" disabled={sending} onClick={() => void send(reply, true)} className="shrink-0 rounded-full border border-halo-line bg-halo-soft px-3 py-2 text-[10px] font-bold text-halo-navy disabled:opacity-40">{reply}</button>)}</div>
          {orders.length > 0 && <select value={orderId} onChange={(event) => setOrderId(event.target.value)} className="mb-2 min-h-11 w-full rounded-xl border border-halo-line bg-halo-canvas px-3 text-xs font-bold text-halo-navy"><option value="">{t.chat.noOrder}</option>{orders.map((order) => <option key={order.id} value={order.id}>{order.tracking_id} · {orderStatusLabel(order.status, language)}</option>)}</select>}
          <form onSubmit={submit} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
            <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={2} maxLength={4000} placeholder={t.chat.placeholder} className="min-h-[50px] w-full resize-none rounded-2xl border border-halo-line bg-halo-canvas px-3 py-3 text-sm text-halo-navy outline-none focus:border-halo-blue" />
            <button type="submit" disabled={sending || !body.trim()} className="h-[50px] min-w-[62px] rounded-2xl bg-halo-blue px-3 text-xs font-black text-white disabled:opacity-35">{sending ? "…" : t.chat.send}</button>
          </form>
        </div>
      </aside>
    </div>}
  </>;
}
