import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../../services/supabase.client";

type Fix = {
  source_id: number; device_key: string; truck_id: string;
  latitude: number; longitude: number; fix_time: string; received_at: string;
};

function History({ fixes }: { fixes: Fix[] }) {
  if (!fixes.length) return <p>No synthetic fixes available.</p>;
  const points = new Map<string, number>();
  for (const fix of fixes) {
    const key = [fix.latitude, fix.longitude].join(", ");
    points.set(key, (points.get(key) ?? 0) + 1);
  }
  const north = Math.max(...fixes.map(f => f.latitude)) + 0.01;
  const south = Math.min(...fixes.map(f => f.latitude)) - 0.01;
  const east = Math.max(...fixes.map(f => f.longitude)) + 0.01;
  const west = Math.min(...fixes.map(f => f.longitude)) - 0.01;
  return <section className="space-y-3">
    <h2 className="font-semibold">{fixes[0].truck_id}</h2><p>Device {fixes[0].device_key}</p>
    <div className="relative h-52 rounded border bg-emerald-50" aria-label="Recorded GPS locations, north up">
      <small className="absolute left-1 top-1">{north.toFixed(3)}°, {west.toFixed(3)}°</small>
      {[...points].map(([key, count]) => {
        const [lat, lng] = key.split(", ").map(Number);
        return <span key={key} title={key} aria-label={count + " fixes at " + key}
          className="absolute grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-emerald-800 text-white"
          style={{ left: (lng-west)/(east-west)*100+"%", top: (north-lat)/(north-south)*100+"%" }}>{count}</span>;
      })}
      <small className="absolute bottom-1 right-1">{south.toFixed(3)}°, {east.toFixed(3)}°</small>
    </div>
    <ol>{fixes.map(f => <li className="border-b py-3" key={f.source_id}><strong>Fix {f.source_id}</strong> · {f.latitude}°, {f.longitude}°
      <p>GPS fix <time>{f.fix_time}</time></p><p>Received <time>{f.received_at}</time></p></li>)}</ol>
  </section>;
}

export default function QaGpsSnapshot() {
  const [sessionToken, setToken] = useState<string | null | undefined>(undefined);
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [message, setMessage] = useState("");
  const [revision, refresh] = useState(0);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setToken(session?.access_token ?? null);
      setFixes([]); setMessage(""); refresh(n => n + 1);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!sessionToken) return;
    const controller = new AbortController();
    setFixes([]); setMessage("Loading fixes…");
    async function read() {
      const { data, error } = await supabase.rpc("hallo_gps_qa_preview").abortSignal(controller.signal);
      if (controller.signal.aborted) return;
      setMessage(error ? (error.code === "42501" ? "QA preview access denied." : "Could not load QA fixes.") : "");
      setFixes(error ? [] : data ?? []);
    }
    void read();
    return () => controller.abort();
  }, [sessionToken, revision]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(fields.get("email")).trim(), password: String(fields.get("password"))
    });
    if (error) setMessage("QA sign-in failed.");
  }
  return <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-8">
    <h1 className="text-2xl font-bold">HALLO Admin · QA GPS history</h1>
    {sessionToken === undefined ? <p>Checking QA session…</p> : sessionToken === null ?
      <form onSubmit={signIn} className="grid max-w-sm gap-3">
        <label>QA email<input className="block w-full border p-2" type="email" name="email" autoComplete="username" required /></label>
        <label>Password<input className="block w-full border p-2" type="password" name="password" autoComplete="current-password" required /></label>
        <button>Sign in</button>
      </form> : <div className="flex gap-6">
        <button onClick={() => refresh(n => n+1)}>Refresh</button>
        <button onClick={async () => { const { error } = await supabase.auth.signOut({ scope: "local" }); if (error) setMessage("Sign-out failed."); }}>Sign out</button>
      </div>}
    {message && <p role="status">{message}</p>}
    {sessionToken && !message && <History fixes={fixes} />}
  </main>;
}
