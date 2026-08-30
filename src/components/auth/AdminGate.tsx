import { FormEvent, ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../services/supabase.client";
import { canAccessAdminWorkspace } from "../../domain/partner-onboarding";

export function AdminGate({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    let current = true;
    async function check(session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]) {
      if (!session) {
        if (current) { setAllowed(false); setLoading(false); }
        return;
      }
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role,driver_status")
        .eq("id", session.user.id)
        .maybeSingle();
      if (!current) return;
      const role = String(profile?.role ?? "");
      const authorized = !profileError && canAccessAdminWorkspace(role, profile?.driver_status);
      setAllowed(authorized);
      if (!authorized) setError(profileError?.message ?? "This account does not have CEO or Admin access.");
      else setError("");
      setLoading(false);
    }
    void supabase.auth.getSession().then(({ data }) => check(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { window.setTimeout(() => void check(session), 0); });
    return () => { current = false; data.subscription.unsubscribe(); };
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setError("");
    const { data, error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (loginError) { setError(loginError.message); setLoading(false); return; }
    const { data: profile, error: profileError } = await supabase.from("profiles").select("role,driver_status").eq("id", data.user.id).maybeSingle();
    const role = String(profile?.role ?? "");
    if (profileError || !canAccessAdminWorkspace(role, profile?.driver_status)) {
      await supabase.auth.signOut();
      setError(profileError?.message ?? "This account does not have CEO or Admin access.");
      setLoading(false);
      return;
    }
    setAllowed(true);
    setLoading(false);
  }

  async function requestPasswordReset(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResetSent(false);
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (resetError) {
      setError(resetError.message);
      setLoading(false);
      return;
    }
    setResetSent(true);
    setLoading(false);
  }

  if (loading) return <div className="min-h-screen bg-asphalt grid place-items-center text-amber font-mono text-sm">Loading secure workspace…</div>;
  if (allowed) return <>{children}</>;

  return <main className="min-h-screen bg-asphalt text-white grid lg:grid-cols-2">
    <section className="hidden lg:flex p-14 flex-col justify-between border-r border-white/10">
      <div><p className="font-display font-bold text-2xl">HALLO<span className="text-amber">TRUCK</span></p><p className="font-mono text-[10px] tracking-[.28em] text-white/40 mt-2">SMART LOGISTICS</p></div>
      <div><p className="font-mono text-xs tracking-[.2em] text-amber">SECURE CONTROL CENTER</p><h1 className="font-display font-bold text-5xl mt-5 leading-tight">One platform.<br/>Every transport.</h1><p className="text-white/45 mt-5 max-w-md">Live orders, fleet operations, customers and finance—protected for authorized leadership.</p></div>
      <p className="text-xs text-white/25">Hamilton Truck Transportation</p>
    </section>
    <section className="p-6 sm:p-12 grid place-items-center">
      <form onSubmit={resetMode ? requestPasswordReset : login} className="w-full max-w-md bg-white text-asphalt p-7 sm:p-10">
        <span className="inline-flex w-12 h-12 items-center justify-center bg-amber font-display font-bold">HT</span>
        <h2 className="font-display font-bold text-3xl mt-7">{resetMode ? "Reset Admin password" : "CEO / Admin login"}</h2>
        <p className="text-sm text-steel mt-2">{resetMode ? "Enter your authorized email. We will send a secure password-reset link." : "Sign in with your authorized company account."}</p>
        {error && <p className="mt-5 bg-route/10 border border-route/30 text-route text-sm p-3">{error}</p>}
        {resetSent && <p className="mt-5 border border-emerald-700/30 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Reset email sent. Open the newest email and tap “Reset password”.</p>}
        <label className="block text-xs font-semibold mt-7 mb-2">Email address</label>
        <input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-asphalt/20 px-4 py-3 outline-none focus:border-amber" placeholder="ceo@hallotruck.com" />
        {!resetMode && <>
          <label className="block text-xs font-semibold mt-5 mb-2">Password</label>
          <input required minLength={6} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border border-asphalt/20 px-4 py-3 outline-none focus:border-amber" placeholder="••••••••" />
        </>}
        <button disabled={loading} className="w-full bg-asphalt text-white py-4 mt-7 font-semibold hover:bg-line disabled:opacity-60">{loading ? "Please wait…" : resetMode ? "Send reset email" : "Open control center"}</button>
        <button type="button" onClick={() => { setResetMode((value) => !value); setResetSent(false); setError(""); }} className="block w-full text-center text-xs font-semibold text-amber-dim mt-5">{resetMode ? "Back to Admin login" : "Forgot password?"}</button>
        {!resetMode && <Link to="/driver" className="block text-center text-xs text-amber-dim mt-5">Open driver portal instead</Link>}
      </form>
    </section>
  </main>;
}
