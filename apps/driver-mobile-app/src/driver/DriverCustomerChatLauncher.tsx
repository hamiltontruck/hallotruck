import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  fetchDriverCustomerChatMessages,
  markDriverCustomerChatRead,
  openDriverCustomerChat,
  sendDriverCustomerChatMessage,
  stopDriverCustomerChatWatch,
  watchDriverCustomerChat,
  type DriverCustomerChatMessage,
} from "./driver-chat.service";
import type { DriverLanguage } from "./driver-v4-i18n";

const copy = {
  en: { button: "Message customer", title: "Customer chat", subtitle: "Real order conversation", close: "Close chat", empty: "No messages yet.", placeholder: "Message customer…", send: "Send", loadError: "Customer chat could not be loaded.", sendError: "Message could not be sent." },
  om: { button: "Customer ergaa", title: "Customer waliin chat", subtitle: "Haasa'a order dhugaa", close: "Chat cufi", empty: "Ergaan amma hin jiru.", placeholder: "Customer ergaa…", send: "Ergi", loadError: "Customer chat fe'uun hin danda'amne.", sendError: "Ergaa erguun hin danda'amne." },
  am: { button: "ደንበኛን መልእክት", title: "ከደንበኛ ጋር ውይይት", subtitle: "እውነተኛ የትዕዛዝ ውይይት", close: "ውይይት ዝጋ", empty: "እስካሁን መልእክት የለም።", placeholder: "ለደንበኛ መልእክት…", send: "ላክ", loadError: "የደንበኛ ውይይት መጫን አልተቻለም።", sendError: "መልእክት መላክ አልተቻለም።" },
} as const;

function messageTime(value: string, language: DriverLanguage) {
  const locale = language === "am" ? "am-ET" : language === "om" ? "om-ET" : "en-ET";
  return new Date(value).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

export function DriverCustomerChatLauncher({ userId, orderId, trackingId, language = "om" }: {
  userId: string;
  orderId: string;
  trackingId: string;
  language?: DriverLanguage;
}) {
  const t = copy[language];
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState("");
  const [messages, setMessages] = useState<DriverCustomerChatMessage[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async (id: string) => {
    const rows = await fetchDriverCustomerChatMessages(userId, id);
    setMessages(rows);
    await markDriverCustomerChatRead(userId, id);
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    let channel: ReturnType<typeof watchDriverCustomerChat> | null = null;
    setLoading(true);
    setError("");
    void openDriverCustomerChat(userId, orderId)
      .then(async (id) => {
        if (!active) return;
        setThreadId(id);
        await refresh(id);
        if (!active) return;
        channel = watchDriverCustomerChat(id, () => void refresh(id).catch(() => undefined));
      })
      .catch(() => { if (active) setError(t.loadError); })
      .finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      if (channel) void stopDriverCustomerChatWatch(channel);
    };
  }, [open, orderId, refresh, t.loadError, userId]);

  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const clean = body.trim();
    if (!threadId || !clean || sending) return;
    setSending(true);
    setError("");
    try {
      await sendDriverCustomerChatMessage(userId, threadId, clean);
      setBody("");
      await refresh(threadId);
    } catch {
      setError(t.sendError);
    } finally {
      setSending(false);
    }
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} className="min-h-12 w-full rounded-2xl border border-halo-blue bg-halo-soft px-4 text-sm font-black text-halo-blue" data-driver-customer-chat-open>
      💬 {t.button}
    </button>
    {open && <div className="fixed inset-0 z-[95] bg-halo-navy/55 backdrop-blur-sm">
      <button type="button" aria-label={t.close} onClick={() => setOpen(false)} className="absolute inset-0 h-full w-full cursor-default" />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-[560px] flex-col bg-halo-canvas shadow-2xl" role="dialog" aria-modal="true" aria-label={t.title} data-driver-customer-chat>
        <header className="relative z-10 flex items-center justify-between border-b border-white/10 bg-halo-navy px-4 pb-3 pt-[calc(12px+env(safe-area-inset-top))] text-white">
          <div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-halo-gold">{trackingId}</p><h2 className="mt-1 text-base font-black">{t.title}</h2><p className="mt-1 text-[10px] text-white/55">{t.subtitle}</p></div>
          <button type="button" onClick={() => setOpen(false)} className="grid h-11 w-11 place-items-center rounded-xl border border-white/15 text-xl" aria-label={t.close}>×</button>
        </header>
        <div ref={scrollRef} className="relative z-10 min-h-0 flex-1 overflow-y-auto px-3 py-4">
          {loading && <p className="py-10 text-center text-xs font-bold text-halo-muted">…</p>}
          {!loading && messages.length === 0 && !error && <p className="py-10 text-center text-xs font-bold text-halo-muted">{t.empty}</p>}
          <ol className="space-y-2.5">{messages.map((message) => {
            const mine = message.sender_id === userId;
            return <li key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}><div className={`max-w-[86%] rounded-2xl px-3.5 py-3 shadow-sm ${mine ? "rounded-br-md bg-halo-navy text-white" : "rounded-bl-md border border-halo-line bg-white text-halo-navy"}`}><p className="whitespace-pre-wrap break-words text-sm leading-5">{message.body}</p><p className={`mt-2 text-right text-[9px] ${mine ? "text-white/45" : "text-halo-muted"}`}>{messageTime(message.created_at, language)}</p></div></li>;
          })}</ol>
        </div>
        <form onSubmit={submit} className="relative z-10 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 border-t border-halo-line bg-white px-3 pb-[calc(10px+env(safe-area-inset-bottom))] pt-3">
          {error && <p role="alert" className="col-span-2 rounded-xl bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700">{error}</p>}
          <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={2} maxLength={4000} placeholder={t.placeholder} className="min-h-[50px] w-full resize-none rounded-2xl border border-halo-line bg-halo-canvas px-3 py-3 text-sm text-halo-navy outline-none focus:border-halo-blue" />
          <button type="submit" disabled={sending || !body.trim()} className="h-[50px] min-w-[62px] rounded-2xl bg-halo-blue px-3 text-xs font-black text-white disabled:opacity-35">{sending ? "…" : t.send}</button>
        </form>
      </aside>
    </div>}
  </>;
}
