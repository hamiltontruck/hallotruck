import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../services/supabase.client";
import { LanguageSwitcher, useLanguage } from "../i18n/LanguageProvider";

export function CustomerLogin() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.session.user.id).maybeSingle();
      if (profile?.role === "customer") navigate("/customer", { replace: true });
    });
  }, [navigate]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFeedback(null);

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim(), phone: phone.trim(), role: "customer" } },
        });
        if (error) throw error;
        if (data.session) navigate("/customer", { replace: true });
        else setFeedback({ kind: "success", text: t("customer.message.confirm") });
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
        if (profile?.role !== "customer") {
          await supabase.auth.signOut();
          throw new Error(t("customer.error.access"));
        }
        navigate("/customer", { replace: true });
      }
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : t("customer.error.auth") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-bone lg:grid lg:grid-cols-2">
      <section className="hidden bg-emerald-800 p-14 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center justify-between gap-4"><p className="font-display text-2xl font-bold">HALLO<span className="text-amber">TRUCK</span></p><LanguageSwitcher dark /></div>
        <div>
          <p className="font-mono text-xs tracking-[.22em] text-amber">{t("customer.smartPortal")}</p>
          <h1 className="mt-5 font-display text-5xl font-bold leading-tight">{t("customer.hero")}</h1>
          <p className="mt-5 max-w-md text-white/55">{t("customer.heroText")}</p>
        </div>
        <p className="text-xs text-white/30">Hamilton Truck Transportation</p>
      </section>

      <section className="grid place-items-center p-5 py-10">
        <form onSubmit={submit} className="w-full max-w-md border border-line bg-white p-7 sm:p-9">
          <div className="flex items-center justify-between gap-4"><Link to="/" className="font-display text-xl font-bold">HALLO<span className="text-amber">TRUCK</span></Link><div className="lg:hidden"><LanguageSwitcher /></div></div>
          <p className="mt-2 font-mono text-[10px] tracking-[.2em] text-emerald-700">{t("customer.label")}</p>
          <h2 className="mt-8 font-display text-3xl font-bold">{mode === "login" ? t("customer.login.title") : t("customer.signup.title")}</h2>
          <p className="mt-2 text-sm text-steel">{mode === "login" ? t("customer.login.desc") : t("customer.signup.desc")}</p>

          {feedback && <p className={`mt-5 border p-3 text-sm ${feedback.kind === "error" ? "border-route/30 bg-route/5 text-route" : "border-emerald-700/30 bg-emerald-50 text-emerald-800"}`}>{feedback.text}</p>}

          <div className="mt-6 space-y-4">
            {mode === "signup" && <>
              <Field label={t("common.fullName")} value={fullName} onChange={setFullName} autoComplete="name" />
              <Field label={t("common.phone")} value={phone} onChange={setPhone} autoComplete="tel" placeholder="+251…" />
            </>}
            <Field label={t("common.email")} value={email} onChange={setEmail} type="email" autoComplete="email" />
            <Field label={t("common.password")} value={password} onChange={setPassword} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={10} />
          </div>

          <button disabled={busy} className="mt-6 w-full bg-emerald-700 py-4 font-semibold text-white disabled:opacity-50">
            {busy ? t("common.wait") : mode === "login" ? t("customer.login.submit") : t("customer.signup.submit")}
          </button>
          <button type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setFeedback(null); }} className="mt-5 w-full text-sm text-steel underline">
            {mode === "login" ? t("customer.login.switchSignup") : t("customer.login.switchLogin")}
          </button>
          <Link to="/" className="mt-5 block text-center text-xs text-steel">{t("common.backPortal")}</Link>
        </form>
      </section>
    </main>
  );
}

function Field({ label, value, onChange, type = "text", autoComplete, placeholder, minLength }: { label: string; value: string; onChange: (value: string) => void; type?: string; autoComplete?: string; placeholder?: string; minLength?: number }) {
  return <label className="block text-sm">{label}<input required type={type} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} placeholder={placeholder} minLength={minLength} className="mt-2 w-full border border-line px-4 py-3 outline-none focus:border-emerald-700" /></label>;
}
