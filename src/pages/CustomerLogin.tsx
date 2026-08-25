import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../services/supabase.client";
import { LanguageSwitcher, useLanguage, type HalloLanguage } from "../i18n/LanguageProvider";
import {
  requestPasswordResetEmail,
  type PasswordResetRequester,
} from "../services/password-recovery.service";
import { passwordRecoveryCopy } from "../i18n/passwordRecoveryCopy";

type Feedback = {
  kind: "error" | "success";
  text: string;
  retryable?: boolean;
};

const connectionCopy: Record<HalloLanguage, {
  offline: string;
  unavailable: string;
  retry: string;
}> = {
  en: {
    offline: "You are offline. Turn on mobile data or Wi-Fi, then try again.",
    unavailable: "The secure login server could not be reached. Check your connection, switch between mobile data and Wi-Fi, then retry.",
    retry: "Retry secure connection",
  },
  om: {
    offline: "Internet hin jiru. Data mobile ykn Wi-Fi baniitii irra deebi'i.",
    unavailable: "Server login nageenya qabu bira ga'uun hin danda'amne. Internet kee ilaali, data mobile fi Wi-Fi wal jijjiiriitii irra deebi'i.",
    retry: "Walqunnamtii irra deebi'i",
  },
  am: {
    offline: "ኢንተርኔት የለም። የሞባይል ዳታ ወይም Wi-Fi ክፈቱና እንደገና ይሞክሩ።",
    unavailable: "ደህንነቱ የተጠበቀውን የመግቢያ አገልጋይ ማግኘት አልተቻለም። ግንኙነትዎን ያረጋግጡ፣ በሞባይል ዳታና Wi-Fi መካከል ይቀያይሩና እንደገና ይሞክሩ።",
    retry: "ደህንነቱ የተጠበቀ ግንኙነትን እንደገና ሞክር",
  },
};

function isNetworkFailure(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();
  return error instanceof TypeError
    || message.includes("failed to fetch")
    || message.includes("network request failed")
    || message.includes("load failed")
    || message.includes("fetch failed");
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function withSingleNetworkRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isNetworkFailure(error) || !navigator.onLine) throw error;
    await wait(1000);
    return operation();
  }
}

export function CustomerLogin({
  passwordResetRequester = requestPasswordResetEmail,
  initialResetMode = false,
}: {
  passwordResetRequester?: PasswordResetRequester;
  initialResetMode?: boolean;
} = {}) {
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const connection = connectionCopy[language];
  const resetCopy = passwordRecoveryCopy[language];
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [resetMode, setResetMode] = useState(initialResetMode);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    void supabase.auth.getSession()
      .then(async ({ data }) => {
        if (!data.session) return;
        const profile = await withSingleNetworkRetry(async () => {
          const result = await supabase.from("profiles").select("role").eq("id", data.session!.user.id).maybeSingle();
          if (result.error) throw result.error;
          return result.data;
        });
        if (profile?.role === "customer") navigate("/customer", { replace: true });
      })
      .catch((error) => {
        if (isNetworkFailure(error)) {
          setFeedback({ kind: "error", text: navigator.onLine ? connection.unavailable : connection.offline, retryable: true });
        }
      });
  }, [connection.offline, connection.unavailable, navigate]);

  async function authenticate() {
    setBusy(true);
    setFeedback(null);

    try {
      if (!navigator.onLine) {
        setOnline(false);
        throw new Error(connection.offline);
      }

      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim(), phone: phone.trim(), role: "customer" } },
        });
        if (error) throw error;
        if (data.session) navigate("/customer", { replace: true });
        else setFeedback({ kind: "success", text: t("customer.message.confirm") });
        return;
      }

      const data = await withSingleNetworkRetry(async () => {
        const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (result.error) throw result.error;
        return result.data;
      });

      const profile = await withSingleNetworkRetry(async () => {
        const result = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
        if (result.error) throw result.error;
        return result.data;
      });

      if (profile?.role !== "customer") {
        await supabase.auth.signOut();
        throw new Error(t("customer.error.access"));
      }
      navigate("/customer", { replace: true });
    } catch (error) {
      const networkFailure = isNetworkFailure(error) || !navigator.onLine;
      setOnline(navigator.onLine);
      setFeedback({
        kind: "error",
        text: networkFailure
          ? navigator.onLine ? connection.unavailable : connection.offline
          : error instanceof Error ? error.message : t("customer.error.auth"),
        retryable: networkFailure && mode === "login",
      });
    } finally {
      setBusy(false);
    }
  }

  async function requestPasswordReset() {
    setBusy(true);
    setFeedback(null);

    try {
      if (!navigator.onLine) {
        setOnline(false);
        throw new Error(connection.offline);
      }

      await withSingleNetworkRetry(() => passwordResetRequester(email.trim()));
      setFeedback({ kind: "success", text: resetCopy.sent });
    } catch (error) {
      const networkFailure = isNetworkFailure(error) || !navigator.onLine;
      setOnline(navigator.onLine);
      setFeedback({
        kind: "error",
        text: networkFailure
          ? navigator.onLine ? connection.unavailable : connection.offline
          : error instanceof Error ? error.message : t("customer.error.auth"),
        retryable: networkFailure,
      });
    } finally {
      setBusy(false);
    }
  }

  async function retryCurrentAction() {
    if (resetMode) await requestPasswordReset();
    else await authenticate();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (resetMode) await requestPasswordReset();
    else await authenticate();
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
          <div className="flex flex-wrap items-center justify-between gap-4"><Link to="/" className="font-display text-xl font-bold">HALLO<span className="text-amber">TRUCK</span></Link><div className="lg:hidden"><LanguageSwitcher /></div></div>
          <p className="mt-2 font-mono text-[10px] tracking-[.2em] text-emerald-700">{t("customer.label")}</p>
          <h2 className="mt-8 font-display text-3xl font-bold">{resetMode ? resetCopy.customerTitle : mode === "login" ? t("customer.login.title") : t("customer.signup.title")}</h2>
          <p className="mt-2 text-sm leading-6 text-steel">{resetMode ? resetCopy.customerDescription : mode === "login" ? t("customer.login.desc") : t("customer.signup.desc")}</p>

          {!online && !feedback && <p className="mt-5 border border-route/30 bg-route/5 p-3 text-sm text-route">{connection.offline}</p>}
          {feedback && (
            <div className={`mt-5 border p-3 text-sm ${feedback.kind === "error" ? "border-route/30 bg-route/5 text-route" : "border-emerald-700/30 bg-emerald-50 text-emerald-800"}`}>
              <p>{feedback.text}</p>
              {feedback.kind === "error" && feedback.retryable && (
                <button type="button" onClick={() => void retryCurrentAction()} disabled={busy || !online} className="mt-3 border border-route px-3 py-2 text-xs font-semibold disabled:opacity-40">
                  {connection.retry}
                </button>
              )}
            </div>
          )}

          <div className="mt-6 space-y-4">
            {!resetMode && mode === "signup" && <>
              <Field label={t("common.fullName")} value={fullName} onChange={setFullName} autoComplete="name" />
              <Field label={t("common.phone")} value={phone} onChange={setPhone} autoComplete="tel" placeholder="+251…" />
            </>}
            <Field label={resetMode ? resetCopy.email : t("common.email")} value={email} onChange={setEmail} type="email" autoComplete="email" />
            {!resetMode && <Field label={t("common.password")} value={password} onChange={setPassword} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={10} />}
          </div>

          <button disabled={busy || !online} className="mt-6 w-full bg-emerald-700 py-4 font-semibold text-white disabled:opacity-50">
            {busy ? t("common.wait") : resetMode ? resetCopy.send : mode === "login" ? t("customer.login.submit") : t("customer.signup.submit")}
          </button>
          {resetMode ? (
            <button type="button" onClick={() => { setResetMode(false); setFeedback(null); }} className="mt-5 w-full text-sm font-semibold text-emerald-700 underline">
              {resetCopy.backCustomer}
            </button>
          ) : (
            <>
              {mode === "login" && <button type="button" onClick={() => { setResetMode(true); setFeedback(null); }} className="mt-5 w-full text-sm font-semibold text-emerald-700 underline">{resetCopy.forgot}</button>}
              <button type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setResetMode(false); setFeedback(null); }} className="mt-5 w-full text-sm text-steel underline">
                {mode === "login" ? t("customer.login.switchSignup") : t("customer.login.switchLogin")}
              </button>
            </>
          )}
          <Link to="/" className="mt-5 block text-center text-xs text-steel">{t("common.backPortal")}</Link>
        </form>
      </section>
    </main>
  );
}

function Field({ label, value, onChange, type = "text", autoComplete, placeholder, minLength }: { label: string; value: string; onChange: (value: string) => void; type?: string; autoComplete?: string; placeholder?: string; minLength?: number }) {
  return <label className="block text-sm">{label}<input required type={type} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} placeholder={placeholder} minLength={minLength} className="mt-2 w-full border border-line px-4 py-3 outline-none focus:border-emerald-700" /></label>;
}
