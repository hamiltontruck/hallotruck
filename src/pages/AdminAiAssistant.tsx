import { FormEvent, KeyboardEvent, useMemo, useState } from "react";
import { askHalloAiAssistant } from "../services/admin-ai-assistant.service";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  requestId?: string;
};

const firstMessage: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "HALLO AI Assistant V1 is ready for Admin and CEO planning. I can help draft operations summaries, checklists, and next-step questions. I only know live HALLO metrics when trusted data is supplied.",
};

function messageId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function AdminAiAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([firstMessage]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastFailedMessage, setLastFailedMessage] = useState("");

  const canSend = useMemo(() => draft.trim().length > 0 && !loading, [draft, loading]);

  async function sendMessage(rawMessage: string) {
    const message = rawMessage.trim();
    if (!message) {
      setError("Write a message before sending.");
      return;
    }

    setError("");
    setLoading(true);
    setLastFailedMessage("");
    setDraft("");
    setMessages((current) => [...current, { id: messageId(), role: "user", content: message }]);

    try {
      const response = await askHalloAiAssistant(message);
      setMessages((current) => [
        ...current,
        { id: messageId(), role: "assistant", content: response.answer, requestId: response.requestId },
      ]);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "HALLO AI Assistant is temporarily unavailable.");
      setLastFailedMessage(message);
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (canSend) void sendMessage(draft);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSend) void sendMessage(draft);
    }
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f5f3ed] p-3 pb-24 text-asphalt sm:p-6 lg:p-8">
      <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-6xl flex-col">
        <header className="bg-asphalt p-5 text-white sm:p-8">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-[10px] tracking-[.22em] text-amber">HALLO AI ASSISTANT V1</p>
              <h1 className="mt-3 break-words font-display text-3xl font-bold sm:text-4xl">Admin / CEO Assistant</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">Server-side OpenAI support for logistics planning, summaries, and safe leadership decisions.</p>
            </div>
            <span className="grid h-12 w-12 shrink-0 place-items-center bg-amber font-mono text-sm font-bold text-asphalt" aria-hidden="true">AI</span>
          </div>
        </header>

        <section className="flex min-h-0 flex-1 flex-col border-x border-asphalt/10 bg-white">
          <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-6" aria-live="polite">
            {messages.map((message) => (
              <article key={message.id} className={`flex min-w-0 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[min(42rem,92%)] border p-4 shadow-sm ${message.role === "user" ? "border-asphalt bg-asphalt text-white" : "border-asphalt/10 bg-[#f5f3ed] text-asphalt"}`}>
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-[.16em] opacity-60">{message.role === "user" ? "You" : "HALLO AI"}</p>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>
                  {message.requestId && <p className="mt-3 break-all font-mono text-[10px] text-steel">Request {message.requestId}</p>}
                </div>
              </article>
            ))}
            {loading && (
              <div className="flex justify-start" role="status">
                <div className="border border-amber/40 bg-amber/10 px-4 py-3 text-sm font-semibold text-amber-dim">Thinking through the operation...</div>
              </div>
            )}
          </div>

          {error && (
            <div className="border-t border-route/20 bg-route/10 px-4 py-3 text-sm text-route sm:px-6" role="alert">
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="min-w-0 break-words">{error}</p>
                {lastFailedMessage && (
                  <button type="button" onClick={() => void sendMessage(lastFailedMessage)} disabled={loading} className="self-start border border-route/30 bg-white px-4 py-2 text-xs font-semibold disabled:opacity-50">
                    Retry
                  </button>
                )}
              </div>
            </div>
          )}

          <form onSubmit={submit} className="border-t border-asphalt/10 bg-[#f5f3ed] p-3 sm:p-4">
            <label htmlFor="hallo-ai-message" className="sr-only">Message HALLO AI Assistant</label>
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
              <textarea
                id="hallo-ai-message"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                rows={3}
                maxLength={3000}
                placeholder="Ask for an operations summary, payment-review checklist, dispatch plan, or leadership note..."
                className="min-h-24 min-w-0 flex-1 resize-none border border-asphalt/15 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-amber"
              />
              <button type="submit" disabled={!canSend} className="min-h-12 shrink-0 bg-asphalt px-6 py-3 text-sm font-semibold text-white transition hover:bg-line disabled:opacity-50">
                {loading ? "Sending" : "Send"}
              </button>
            </div>
            <p className="mt-2 text-xs leading-5 text-steel">Read-only V1: no order, payment, commission, user, settlement, RLS, migration, or production write actions.</p>
          </form>
        </section>
      </div>
    </main>
  );
}
