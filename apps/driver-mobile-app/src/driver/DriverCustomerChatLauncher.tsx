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
  en: {
    button: "Message customer",
    title: "Customer chat",
    customer: "Customer",
    assigned: "Assigned customer",
    secure: "Order-only secure conversation",
    privacy: "Messages are visible only to you and this assigned customer.",
    close: "Back to active trip",
    empty: "No messages yet. Send the first message to your customer.",
    placeholder: "Message customer…",
    send: "Send",
    loadError: "Customer chat could not be loaded.",
    sendError: "Message could not be sent.",
  },
  om: {
    button: "Customer ergaa",
    title: "Customer waliin chat",
    customer: "Customer",
    assigned: "Customer ramadame",
    secure: "Haasa'a order kana qofaaf",
    privacy: "Ergaan kun ati fi Customer ramadame qofaaf mul'ata.",
    close: "Gara Active Trip deebi'i",
    empty: "Ergaan amma hin jiru. Customer keetiif ergaa jalqabaa ergi.",
    placeholder: "Customer ergaa…",
    send: "Ergi",
    loadError: "Customer chat fe'uun hin danda'amne.",
    sendError: "Ergaa erguun hin danda'amne.",
  },
  am: {
    button: "ደንበኛን መልእክት",
    title: "ከደንበኛ ጋር ውይይት",
    customer: "Customer",
    assigned: "የተመደበ ደንበኛ",
    secure: "ለዚህ ትዕዛዝ ብቻ የተጠበቀ ውይይት",
    privacy: "መልእክቶችን እርስዎ እና የተመደበው ደንበኛ ብቻ ያያሉ።",
    close: "ወደ Active Trip ተመለስ",
    empty: "እስካሁን መልእክት የለም። የመጀመሪያውን መልእክት ይላኩ።",
    placeholder: "ለደንበኛ መልእክት…",
    send: "ላክ",
    loadError: "የደንበኛ ውይይት መጫን አልተቻለም።",
    sendError: "መልእክት መላክ አልተቻለም።",
  },
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
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="min-h-12 w-full rounded-2xl border border-halo-blue bg-halo-soft px-4 text-sm font-black text-halo-blue"
      data-driver-customer-chat-open
    >
      💬 {t.button}
    </button>

    {open && <div className="fixed inset-0 z-[95] bg-[#eef3f8]" data-driver-customer-chat-shell>
      <section className="mx-auto flex min-h-[100dvh] w-full max-w-[560px] flex-col bg-white shadow-[0_0_60px_rgba(16,33,61,.12)]" role="dialog" aria-modal="true" aria-label={t.title} data-driver-customer-chat>
        <header className="border-b border-white/10 bg-halo-navy px-4 pb-4 pt-[calc(14px+env(safe-area-inset-top))] text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-halo-gold">HALLO DRIVER V4</p>
              <h2 className="mt-1 text-xl font-black leading-tight">{t.title}</h2>
              <p className="mt-1 truncate text-xs font-bold text-white/60">{trackingId} · Active trip</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/5 text-xl" aria-label={t.close}>×</button>
          </div>
        </header>

        <div className="border-b border-halo-line bg-white px-4 py-3">
          <div className="flex items-center gap-3 rounded-2xl border border-halo-line bg-halo-canvas p-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-halo-soft text-lg font-black text-halo-blue">C</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-halo-navy">{t.customer}</p>
              <p className="mt-0.5 text-[11px] font-bold text-halo-muted">{t.assigned}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> ACTIVE
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-800">
            <span aria-hidden="true">🔒</span><span>{t.secure}</span>
          </div>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-halo-canvas px-3 py-4">
          <p className="mx-auto mb-4 max-w-[320px] text-center text-[10px] leading-4 text-halo-muted">{t.privacy}</p>
          {loading && <p className="py-10 text-center text-xs font-bold text-halo-muted">…</p>}
          {!loading && messages.length === 0 && !error && <p className="mx-auto max-w-xs rounded-2xl border border-halo-line bg-white px-4 py-5 text-center text-xs font-bold leading-5 text-halo-muted">{t.empty}</p>}
          <ol className="space-y-3">{messages.map((message) => {
            const mine = message.sender_id === userId;
            return <li key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[82%] rounded-2xl px-3.5 py-3 shadow-sm ${mine ? "rounded-br-md bg-halo-blue text-white" : "rounded-bl-md border border-halo-line bg-white text-halo-navy"}`}>
                <p className="whitespace-pre-wrap break-words text-sm leading-5">{message.body}</p>
                <p className={`mt-1.5 text-right text-[9px] font-bold ${mine ? "text-white/55" : "text-halo-muted"}`}>{messageTime(message.created_at, language)}</p>
              </div>
            </li>;
          })}</ol>
        </div>

        <form onSubmit={submit} className="border-t border-halo-line bg-white px-3 pb-[calc(10px+env(safe-area-inset-bottom))] pt-3">
          {error && <p role="alert" className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700">{error}</p>}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={2}
              maxLength={4000}
              placeholder={t.placeholder}
              className="min-h-[54px] w-full resize-none rounded-2xl border border-halo-line bg-halo-canvas px-3 py-3 text-sm text-halo-navy outline-none focus:border-halo-blue focus:ring-2 focus:ring-halo-blue/10"
            />
            <button type="submit" disabled={sending || !threadId || !body.trim()} className="h-[54px] min-w-[74px] rounded-2xl bg-halo-blue px-4 text-sm font-black text-white shadow-sm disabled:opacity-35">{sending ? "…" : t.send}</button>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="mt-2 min-h-11 w-full rounded-xl border border-halo-line bg-white text-xs font-black text-halo-navy">{t.close}</button>
        </form>
      </section>
    </div>}
  </>;
}
