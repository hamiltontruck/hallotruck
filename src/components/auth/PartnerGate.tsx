import { FormEvent, ReactNode, useEffect, useState } from "react";
import { supabase } from "../../services/supabase.client";
import { getPartnerLoginAccess } from "../../services/admin-partner-onboarding.service";

type AccessState = "loading" | "allowed" | "denied";

function accessError(access: Awaited<ReturnType<typeof getPartnerLoginAccess>>) {
  if (access.profileRole !== "partner") return "This account does not have the Partner profile role.";
  if (access.activeMembershipCount === 0) return "This Partner account has no active organization membership.";
  if (access.activeOrganizationCount === 0) return "The assigned Partner organization is suspended or archived.";
  return "Partner access could not be verified.";
}

export function PartnerGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccessState>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (!data.session) {
        setState("denied");
        return;
      }
      try {
        const access = await getPartnerLoginAccess();
        if (!active) return;
        setState(access.allowed ? "allowed" : "denied");
        setError(access.allowed ? "" : accessError(access));
      } catch (sessionError) {
        if (!active) return;
        setState("denied");
        setError(sessionError instanceof Error ? sessionError.message : "Partner access could not be verified.");
      }
    }
    void checkSession();
    const { data } = supabase.auth.onAuthStateChange(() => void checkSession());
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { data, error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (loginError || !data.user) {
      setError(loginError?.message ?? "Partner sign-in failed.");
      setBusy(false);
      return;
    }
    try {
      const access = await getPartnerLoginAccess();
      if (!access.allowed) {
        await supabase.auth.signOut();
        setError(accessError(access));
        setState("denied");
      } else {
        setState("allowed");
      }
    } catch (roleError) {
      await supabase.auth.signOut();
      setError(roleError instanceof Error ? roleError.message : "Partner role verification failed.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") {
    return <div className="grid min-h-screen place-items-center bg-asphalt font-mono text-sm text-amber">Verifying partner workspace…</div>;
  }
  if (state === "allowed") return <>{children}</>;

  return (
    <main className="grid min-h-screen bg-asphalt text-white lg:grid-cols-2">
      <section className="hidden border-r border-white/10 p-14 lg:flex lg:flex-col lg:justify-between">
        <div><p className="font-display text-2xl font-bold">HALLO<span className="text-amber">TRUCK</span></p><p className="mt-2 font-mono text-[10px] tracking-[.28em] text-white/40">LOGISTICS PARTNER</p></div>
        <div><p className="font-mono text-xs tracking-[.2em] text-amber">SECURE PARTNER NETWORK</p><h1 className="mt-5 font-display text-5xl font-bold leading-tight">Projects, documents<br/>and payments together.</h1><p className="mt-5 max-w-md text-white/45">Every organization is isolated by verified membership and protected database policies.</p></div>
        <p className="text-xs text-white/25">Hamilton Truck Transportation</p>
      </section>
      <section className="grid place-items-center p-5 sm:p-10">
        <form onSubmit={login} className="w-full max-w-md bg-white p-7 text-asphalt sm:p-10">
          <span className="inline-flex h-12 w-12 items-center justify-center bg-amber font-display font-bold">LP</span>
          <h2 className="mt-7 font-display text-3xl font-bold">Partner login</h2>
          <p className="mt-2 text-sm text-steel">Use the company account assigned by HALLO Admin.</p>
          {error && <p className="mt-5 border border-route/30 bg-route/10 p-3 text-sm text-route">{error}</p>}
          <label className="mb-2 mt-7 block text-xs font-semibold">Email address</label>
          <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full border border-asphalt/20 px-4 py-3 outline-none focus:border-amber" />
          <label className="mb-2 mt-5 block text-xs font-semibold">Password</label>
          <input required minLength={6} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full border border-asphalt/20 px-4 py-3 outline-none focus:border-amber" />
          <button disabled={busy} className="mt-7 w-full bg-asphalt py-4 font-semibold text-white disabled:opacity-50">{busy ? "Signing in…" : "Open partner workspace"}</button>
          <a href="#/" className="mt-5 block text-center text-xs font-semibold text-amber-dim">Back to main portal</a>
        </form>
      </section>
    </main>
  );
}
