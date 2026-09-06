import { useCallback, useEffect, useState } from "react";
import { mobileSupabase } from "../auth/mobile-supabase";

type DriverNotification = {
  id: string;
  event_type: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

function notificationTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function DriverNotificationsView({ userId }: { userId: string }) {
  const [items, setItems] = useState<DriverNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!mobileSupabase) {
      setError("HALLO Supabase configuration is missing.");
      setLoading(false);
      return;
    }
    const { data, error: requestError } = await mobileSupabase.rpc("my_notifications", { p_limit: 100 });
    if (requestError) setError(requestError.message);
    else {
      setItems((data ?? []) as DriverNotification[]);
      setError("");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    if (!mobileSupabase) return;
    const client = mobileSupabase;
    const channel = client
      .channel(`driver-notifications-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => void refresh())
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [refresh, userId]);

  async function markRead(item: DriverNotification) {
    if (!mobileSupabase || item.read_at) return;
    const { error: requestError } = await mobileSupabase.rpc("mark_notification_read", { p_notification_id: item.id });
    if (requestError) setError(requestError.message);
    else setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry));
  }

  return <main className="min-h-[calc(100dvh-74px)] bg-halo-canvas px-4 pb-8 pt-5">
    <div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-halo-gold-dark">Driver alerts</p><h1 className="mt-1 text-2xl font-black text-halo-navy">Notifications</h1></div><button type="button" onClick={() => void refresh()} className="min-h-10 rounded-xl border border-halo-line bg-white px-3 text-[10px] font-black">Refresh</button></div>
    {error && <p className="mt-4 rounded-2xl bg-red-50 p-3 text-xs font-bold text-red-700">{error}</p>}
    {loading ? <p className="mt-6 text-sm text-halo-muted">Notifications fe'amaa jiru…</p> : items.length === 0 ? <div className="mt-6 rounded-[22px] border border-dashed border-halo-line bg-white p-6 text-center text-sm text-halo-muted">Notification haaraan hin jiru.</div> : <section className="mt-5 space-y-3">{items.map((item) => <button key={item.id} type="button" onClick={() => void markRead(item)} className={`w-full rounded-[22px] border p-4 text-left shadow-halo-card ${item.read_at ? "border-halo-line bg-white" : "border-halo-gold bg-halo-gold-soft"}`}><span className="text-[9px] font-black uppercase tracking-[0.14em] text-halo-blue">{item.event_type.replaceAll("_", " ")}</span><strong className="mt-1 block text-sm text-halo-navy">{item.title}</strong><span className="mt-2 block text-xs leading-5 text-halo-muted">{item.body}</span><time className="mt-2 block text-[9px] text-halo-muted">{notificationTime(item.created_at)}</time></button>)}</section>}
  </main>;
}
