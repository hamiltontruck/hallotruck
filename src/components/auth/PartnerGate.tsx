import { FormEvent, ReactNode, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../services/supabase.client";
import { getPartnerLoginAccess } from "../../services/admin-partner-onboarding.service";
import { requestPasswordResetEmail } from "../../services/password-recovery.service";

type AccessState = "loading" | "allowed" | "denied";
type PartnerLocale = "en" | "or" | "am";

const copy = {
  en: { eyebrow: "HALLO PARTNER NETWORK", title: "Welcome, HALLO Partner", intro: "Sign in with the business email assigned to your HALLO partner account.", email: "Business email", password: "Password", show: "Show", hide: "Hide", forgot: "Forgot password?", signIn: "Open partner workspace", signingIn: "Signing in…", back: "Back to main portal", reset: "Send password reset", cancel: "Back to sign in", resetHelp: "Enter your business email and we’ll send the existing secure recovery link.", resetSent: "Password reset email sent. Check your inbox.", secure: "SECURE PARTNER WORKSPACE", hero: "Grow your logistics business with HALLO.", detail: "Secure access for approved HALLO partner organizations.", verify: "Verifying partner workspace…" },
  or: { eyebrow: "HALLO PARTNER NETWORK", title: "Baga nagaan dhuftan, Partner", intro: "Imeelii hojii account Partner HALLO keessaniif ramadameen seenaa.", email: "Imeelii hojii", password: "Jecha iccitii", show: "Agarsiisi", hide: "Dhoksi", forgot: "Jecha iccitii dagattanii?", signIn: "Workspace Partner bani", signingIn: "Seenaa jira…", back: "Gara portal guddaatti deebi’i", reset: "Reset password ergi", cancel: "Gara seensatti deebi’i", resetHelp: "Imeelii hojii keessan galchaa; linkii recovery nageenya qabu kan jiru ergina.", resetSent: "Imeeliin password reset ergameera. Inbox keessan ilaalaa.", secure: "WORKSPACE PARTNER NAGEENYA QABU", hero: "HALLO Smart Logistics waliin daldala keessan saffisiisaa.", detail: "Workspace keessan partner membership fi organization access mirkanaa’een eegama.", verify: "Workspace partner mirkaneessaa jira…" },
  am: { eyebrow: "HALLO PARTNER NETWORK", title: "እንኳን ደህና መጡ፣ Partner", intro: "ለHALLO Partner መለያዎ በተመደበው የንግድ ኢሜይል ይግቡ።", email: "የንግድ ኢሜይል", password: "የይለፍ ቃል", show: "አሳይ", hide: "ደብቅ", forgot: "የይለፍ ቃል ረሱ?", signIn: "Partner workspace ክፈት", signingIn: "በመግባት ላይ…", back: "ወደ ዋናው portal ተመለስ", reset: "የይለፍ ቃል ማስመለሻ ላክ", cancel: "ወደ መግቢያ ተመለስ", resetHelp: "የንግድ ኢሜይልዎን ያስገቡ፤ ያለውን ደህንነቱ የተጠበቀ recovery link እንልካለን።", resetSent: "የይለፍ ቃል ማስመለሻ ኢሜይል ተልኳል። Inbox ይመልከቱ።", secure: "ደህንነቱ የተጠበቀ PARTNER WORKSPACE", hero: "ከHALLO Smart Logistics ጋር ንግድዎን ያሳድጉ።", detail: "Workspaceዎ በተረጋገጠ Partner membership እና organization access የተጠበቀ ነው።", verify: "Partner workspace በማረጋገጥ ላይ…" },
} satisfies Record<PartnerLocale, Record<string, string>>;

function accessError(access: Awaited<ReturnType<typeof getPartnerLoginAccess>>) {
  if (access.profileRole !== "partner") return "This account does not have the Partner profile role.";
  if (access.activeMembershipCount === 0) return "This Partner account has no active organization membership.";
  if (access.activeOrganizationCount === 0) return "The assigned Partner organization is suspended or archived.";
  return "Partner access could not be verified.";
}

export function PartnerGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccessState>("loading");
  const [locale, setLocale] = useState<PartnerLocale>("en");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const emailId = useId();
  const passwordId = useId();
  const text = copy[locale];

  useEffect(() => {
    let active = true;
    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (!data.session) { setState("denied"); return; }
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
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setResetSent(false);
    const { data, error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (loginError || !data.user) { setError(loginError?.message ?? "Partner sign-in failed."); setBusy(false); return; }
    try {
      const access = await getPartnerLoginAccess();
      if (!access.allowed) { await supabase.auth.signOut(); setError(accessError(access)); setState("denied"); }
      else setState("allowed");
    } catch (roleError) {
      await supabase.auth.signOut();
      setError(roleError instanceof Error ? roleError.message : "Partner role verification failed.");
    } finally { setBusy(false); }
  }

  async function recover(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    setBusy(true); setError(""); setResetSent(false);
    try { await requestPasswordResetEmail(email.trim()); setResetSent(true); }
    catch (resetError) { setError(resetError instanceof Error ? resetError.message : "Password reset could not be requested."); }
    finally { setBusy(false); }
  }

  if (state === "loading") return <div className="grid min-h-screen place-items-center bg-asphalt px-6 font-mono text-sm text-amber" role="status">{text.verify}</div>;
  if (state === "allowed") return <>{children}</>;

  return (
    <main className="min-h-screen bg-slate-100 text-asphalt lg:grid lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-[#1A237E] p-12 text-white lg:flex lg:min-h-screen lg:flex-col lg:justify-between xl:p-16" aria-label="HALLO Smart Logistics Partner">
        <div className="absolute -left-28 top-1/3 h-80 w-80 rounded-full border border-amber/20" aria-hidden="true" />
        <div className="relative"><p className="font-display text-2xl font-bold tracking-tight">HALLO <span className="text-amber">Smart Logistics</span></p><p className="mt-2 font-mono text-[10px] tracking-[.28em] text-white/45">PARTNER PORTAL</p></div>
        <div className="relative max-w-xl"><p className="font-mono text-xs font-semibold tracking-[.2em] text-amber">{text.secure}</p><h1 className="mt-5 font-display text-5xl font-bold leading-[1.08] xl:text-6xl">{text.hero}</h1><p className="mt-6 max-w-lg text-base leading-7 text-white/55">{text.detail}</p></div>
        <p className="relative text-xs text-white/30">HALLO Smart Logistics · Partner Network</p>
      </section>

      <section className="flex min-h-screen items-center justify-center px-4 py-8 sm:px-8 lg:px-10">
        <div className="w-full max-w-[520px]">
          <div className="mb-6 flex items-center justify-between lg:justify-end">
            <p className="font-display text-lg font-bold lg:hidden">HALLO <span className="text-amber">Smart Logistics</span></p>
            <label className="sr-only" htmlFor="partner-language">Language</label>
            <select id="partner-language" value={locale} onChange={(event) => setLocale(event.target.value as PartnerLocale)} className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white outline-none focus:border-amber focus:ring-2 focus:ring-amber/30">
              <option value="en" className="text-asphalt">English</option><option value="or" className="text-asphalt">Afaan Oromoo</option><option value="am" className="text-asphalt">አማርኛ</option>
            </select>
          </div>
          <form onSubmit={recovery ? recover : login} className="rounded-[28px] bg-white p-5 text-asphalt shadow-xl sm:p-8" noValidate={false}>
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-amber font-display font-bold shadow-sm">HP</div>
            <p className="mt-4 font-mono text-[10px] font-bold tracking-[.2em] text-amber-dim">{text.eyebrow}</p>
            <h2 className="mt-2 font-display text-2xl sm:text-3xl font-bold tracking-tight">{recovery ? text.forgot : text.title}</h2>
            <p className="mt-2 text-sm leading-6 text-steel">{recovery ? text.resetHelp : text.intro}</p>
            <div className="min-h-0" aria-live="polite">{error && <p role="alert" className="mt-3 rounded-xl border border-route/25 bg-route/10 p-3 text-sm text-route">{error}</p>}{resetSent && <p role="status" className="mt-4 rounded-xl border border-green-600/20 bg-green-50 p-3 text-sm text-green-800">{text.resetSent}</p>}</div>
            <label htmlFor={emailId} className="mb-2 mt-4 block text-xs font-bold">{text.email}</label>
            <input id={emailId} required type="email" inputMode="email" autoCapitalize="none" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(error)} className="w-full rounded-xl border border-asphalt/15 bg-slate-50 px-4 py-3.5 text-sm outline-none transition focus:border-amber focus:bg-white focus:ring-2 focus:ring-amber/20" />
            {!recovery && <><label htmlFor={passwordId} className="mb-2 mt-5 block text-xs font-bold">{text.password}</label><div className="relative"><input id={passwordId} required type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={Boolean(error)} className="w-full rounded-xl border border-asphalt/15 bg-slate-50 px-4 py-3.5 pr-20 text-sm outline-none transition focus:border-amber focus:bg-white focus:ring-2 focus:ring-amber/20" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-pressed={showPassword} className="absolute inset-y-0 right-1 my-1 rounded-lg px-3 text-xs font-bold text-amber-dim focus:outline-none focus:ring-2 focus:ring-amber/40">{showPassword ? text.hide : text.show}</button></div><div className="mt-3 flex justify-end"><button type="button" onClick={() => { setRecovery(true); setError(""); setResetSent(false); }} className="rounded text-xs font-bold text-amber-dim underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-amber/40">{text.forgot}</button></div></>}
            <button type="submit" disabled={busy} className="mt-5 w-full rounded-xl bg-asphalt px-4 py-4 text-sm font-bold text-white transition hover:bg-asphalt/90 focus:outline-none focus:ring-2 focus:ring-amber focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55">{busy ? text.signingIn : recovery ? text.reset : text.signIn}</button>
            {recovery && <button type="button" onClick={() => { setRecovery(false); setError(""); setResetSent(false); }} className="mt-3 w-full rounded-xl px-4 py-3 text-sm font-bold text-steel focus:outline-none focus:ring-2 focus:ring-amber/40">{text.cancel}</button>}
            <Link to="/" className="mt-5 block rounded text-center text-xs font-bold text-amber-dim underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-amber/40">{text.back}</Link>
          </form>
          <p className="mt-5 text-center text-[11px] leading-5 text-white/40">Secure Partner Access</p>
        </div>
      </section>
    </main>
  );
}
