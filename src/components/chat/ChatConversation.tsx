import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { DriverChatMessage, DriverChatMessageKind, DriverChatOrder } from "../../services/driver-chat.service";

export interface ChatConversationProps {
  title: string;
  subtitle: string;
  participantBadge?: string;
  messages: DriverChatMessage[];
  orders: DriverChatOrder[];
  currentUserId: string;
  peerReadAt: string | null;
  quickReplies: string[];
  sending: boolean;
  loading?: boolean;
  error?: string;
  onSend: (input: { body: string; orderId: string | null; kind: DriverChatMessageKind }) => Promise<void>;
}

function time(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function day(value: string) {
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric" });
}

export function ChatConversation({
  title,
  subtitle,
  participantBadge,
  messages,
  orders,
  currentUserId,
  peerReadAt,
  quickReplies,
  sending,
  loading = false,
  error = "",
  onSend,
}: ChatConversationProps) {
  const [body, setBody] = useState("");
  const [orderId, setOrderId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const orderById = useMemo(() => new Map(orders.map((order) => [order.id, order])), [orders]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [messages.length, loading]);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    await onSend({ body: trimmed, orderId, kind: orderId ? "order_context" : "text" });
    setBody("");
    setOrderId(null);
  }

  async function sendQuickReply(reply: string) {
    if (sending) return;
    await onSend({ body: reply, orderId, kind: "quick_reply" });
    setOrderId(null);
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  const lastOwnMessage = [...messages].reverse().find((message) => message.sender_id === currentUserId);
  const lastOwnSeen = Boolean(
    lastOwnMessage
      && peerReadAt
      && new Date(peerReadAt).getTime() >= new Date(lastOwnMessage.created_at).getTime(),
  );

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-[#f7f6f1]">
      <header className="border-b border-asphalt/10 bg-white px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="truncate font-display text-lg font-bold sm:text-xl">{title}</h2>
              {participantBadge && <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-emerald-800">{participantBadge}</span>}
            </div>
            <p className="mt-1 truncate text-xs text-steel">{subtitle}</p>
          </div>
          <span className="shrink-0 rounded-full bg-asphalt px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[.14em] text-white">Secure</span>
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5" aria-live="polite">
        {loading && <p className="py-12 text-center font-mono text-xs text-steel">Loading secure conversation…</p>}
        {!loading && messages.length === 0 && (
          <div className="mx-auto mt-8 max-w-sm border border-dashed border-asphalt/15 bg-white p-6 text-center">
            <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-amber/15 text-xl">💬</div>
            <p className="mt-4 font-display text-lg font-bold">Start the operations conversation</p>
            <p className="mt-2 text-xs leading-5 text-steel">Use this channel for live trip support, assignment clarification, payment follow-up and compliance coordination.</p>
          </div>
        )}
        {!loading && messages.length > 0 && (
          <ol className="mx-auto grid max-w-3xl gap-2.5">
            {messages.map((message, index) => {
              const mine = message.sender_id === currentUserId;
              const order = message.order_id ? orderById.get(message.order_id) : null;
              const showDate = index === 0 || day(messages[index - 1].created_at) !== day(message.created_at);
              return (
                <li key={message.id} className="min-w-0">
                  {showDate && <div className="my-3 text-center"><span className="rounded-full bg-white px-3 py-1 text-[9px] font-semibold text-steel shadow-sm">{day(message.created_at)}</span></div>}
                  <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[88%] min-w-0 rounded-2xl px-3.5 py-3 shadow-sm sm:max-w-[76%] sm:px-4 ${mine ? "rounded-br-md bg-asphalt text-white" : "rounded-bl-md border border-asphalt/10 bg-white text-asphalt"}`}>
                      {order && (
                        <div className={`mb-2 rounded-xl border px-3 py-2 text-[10px] ${mine ? "border-white/15 bg-white/5 text-white/75" : "border-amber/30 bg-amber/10 text-asphalt"}`}>
                          <span className="font-mono font-bold">{order.tracking_id}</span>
                          <span className="ml-2 capitalize">{order.status.replace(/_/g, " ")}</span>
                        </div>
                      )}
                      <p className="whitespace-pre-wrap break-words text-sm leading-5">{message.body}</p>
                      <div className={`mt-2 flex items-center justify-end gap-2 text-[9px] ${mine ? "text-white/45" : "text-steel"}`}>
                        <span>{time(message.created_at)}</span>
                        {mine && message.id === lastOwnMessage?.id && <span>{lastOwnSeen ? "Seen ✓✓" : "Sent ✓"}</span>}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="border-t border-asphalt/10 bg-white p-3 sm:p-4">
        {error && <p className="mb-3 rounded-xl border border-route/25 bg-route/5 px-3 py-2 text-xs text-route">{error}</p>}
        {quickReplies.length > 0 && (
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1" aria-label="Quick replies">
            {quickReplies.map((reply) => (
              <button key={reply} type="button" disabled={sending} onClick={() => void sendQuickReply(reply)} className="shrink-0 rounded-full border border-asphalt/10 bg-[#f7f6f1] px-3 py-2 text-[10px] font-semibold text-asphalt transition hover:border-amber disabled:opacity-40">
                {reply}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={(event) => void submit(event)} className="grid min-w-0 gap-2">
          {orders.length > 0 && (
            <label className="min-w-0 text-[9px] font-semibold uppercase tracking-wide text-steel">
              Order context
              <select value={orderId ?? ""} onChange={(event) => setOrderId(event.target.value || null)} className="mt-1 block w-full min-w-0 rounded-xl border border-asphalt/10 bg-[#f7f6f1] px-3 py-2.5 text-xs font-normal normal-case text-asphalt outline-none focus:border-amber">
                <option value="">No order attached</option>
                {orders.map((order) => <option key={order.id} value={order.id}>{order.tracking_id} · {order.status.replace(/_/g, " ")}</option>)}
              </select>
            </label>
          )}
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={onComposerKeyDown}
              rows={2}
              maxLength={4000}
              placeholder="Write a message…"
              aria-label="Chat message"
              className="block max-h-32 min-h-[50px] w-full min-w-0 resize-y rounded-2xl border border-asphalt/15 bg-[#f7f6f1] px-3.5 py-3 text-sm outline-none focus:border-amber"
            />
            <button type="submit" disabled={sending || body.trim().length === 0} className="grid h-[50px] min-w-[54px] place-items-center rounded-2xl bg-route px-4 text-sm font-bold text-white shadow-sm transition active:scale-[.98] disabled:opacity-35" aria-label="Send message">
              {sending ? "…" : "Send"}
            </button>
          </div>
          <p className="text-[9px] text-steel">Enter sends · Shift+Enter adds a new line · messages are retained for operational audit.</p>
        </form>
      </div>
    </section>
  );
}
