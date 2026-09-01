import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../services/supabase.client";
import { LanguageSwitcher, useLanguage } from "../i18n/LanguageProvider";
import {
  requestPasswordResetEmail,
  type PasswordResetRequester,
} from "../services/password-recovery.service";
import { passwordRecoveryCopy } from "../i18n/passwordRecoveryCopy";
import {
  requireValidEmail,
  requireValidEthiopianPhone,
} from "../domain/contact-validation";

export function Login({
  passwordResetRequester = requestPasswordResetEmail,
  initialResetMode = false,
}: {
  passwordResetRequester?: PasswordResetRequester;
  initialResetMode?: boolean;
} = {}) {
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const resetCopy = passwordRecoveryCopy[language];
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [resetMode, setResetMode] = useState(initialResetMode);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function routeDriver(userId: string) {
    const { data, error: profileError } = await supabase
      .from("profiles")
      .select("role,driver_status")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) throw profileError;
    if (data?.role !== "driver") {
      await supabase.auth.signOut();
      throw new Error(t("driver.error.access"));
    }

    navigate(data.driver_status === "approved" ? "/driver/jobs" : "/driver/documents", { replace: true });
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void routeDriver(data.session.user.id).catch(() => undefined);
    });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const normalizedEmail = requireValidEmail(email);

      if (resetMode) {
        await passwordResetRequester(normalizedEmail);
        setMessage(resetCopy.sent);
        return;
      }

      if (mode === "signup") {
        if (!fullName.trim()) throw new Error(t("driver.error.namePhone"));
        const normalizedPhone = requireValidEthiopianPhone(phone);

        const { data, error: signupError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              phone: normalizedPhone,
              role: "driver",
            },
          },
        });

        if (signupError) {
          if (signupError.message.toLowerCase().includes("already registered")) {
            setMode("login");
            setMessage("This driver account already exists. Sign in with the same email and password to continue to document onboarding.");
            return;
          }
          throw signupError;
        }

        if (data.session) {
          await routeDriver(data.session.user.id);
        } else {
          setMode("login");
          setMessage("Account created. Confirm your email if requested, then sign in to complete the required driver documents.");
        }
      } else {
        const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (loginError) throw loginError;
        await routeDriver(loginData.user.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("driver.error.auth"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-bone flex items-center justify-center px-4 py-10">
      <section className="w-full max-w-md border border-line bg-white p-6 sm:p-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="font-display font-bold text-2xl text-asphalt">
              HALLO<span className="text-amber">TRUCK</span>
              <span className="font-mono text-xs text-steel ml-2">DRIVER</span>
            </div>
            <div className="route-line mt-4" />
          </div>
          <LanguageSwitcher />
        </div>

        <h1 className="font-display font-bold text-2xl text-asphalt">
          {resetMode ? resetCopy.driverTitle : mode === "login" ? t("driver.login.title") : t("driver.signup.title")}
        </h1>

        <p className="font-body text-sm leading-6 text-steel mt-2 mb-6">
          {resetMode ? resetCopy.driverDescription : mode === "login" ? t("driver.login.desc") : "Create your driver account. Verification documents are required before Jobs, Trip and Earnings are unlocked."}
        </p>

        {error && <div className="border border-route/50 bg-route/5 text-route px-4 py-3 text-sm mb-5">{error}</div>}
        {message && <div className="border border-amber bg-amber/10 text-asphalt px-4 py-3 text-sm mb-5">{message}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!resetMode && mode === "signup" && (
            <>
              <label className="block">
                <span className="font-body text-sm text-asphalt">{t("common.fullName")}</span>
                <input value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-1 w-full border border-line px-4 py-3 font-body outline-none focus:border-route" autoComplete="name" maxLength={120} required />
              </label>
              <label className="block">
                <span className="font-body text-sm text-asphalt">{t("common.phone")}</span>
                <input type="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-1 w-full border border-line px-4 py-3 font-body outline-none focus:border-route" placeholder="09xxxxxxxx" autoComplete="tel" maxLength={17} required />
              </label>
            </>
          )}

          <label className="block">
            <span className="font-body text-sm text-asphalt">{resetMode ? resetCopy.email : t("common.email")}</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full border border-line px-4 py-3 font-body outline-none focus:border-route" autoComplete="email" maxLength={254} required />
          </label>

          {!resetMode && <label className="block">
            <span className="font-body text-sm text-asphalt">{t("common.password")}</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full border border-line px-4 py-3 font-body outline-none focus:border-route" minLength={10} autoComplete={mode === "login" ? "current-password" : "new-password"} required />
          </label>}

          <button type="submit" disabled={busy} className="w-full bg-route text-bone font-display font-semibold px-6 py-3 disabled:opacity-50">
            {busy ? t("common.wait") : resetMode ? resetCopy.send : mode === "login" ? t("driver.login.submit") : "Create account & continue to documents"}
          </button>
        </form>

        {resetMode ? (
          <button type="button" onClick={() => { setResetMode(false); setError(null); setMessage(null); }} className="w-full mt-5 font-body text-sm font-semibold text-route underline">{resetCopy.backDriver}</button>
        ) : (
          <>
            {mode === "login" && <button type="button" onClick={() => { setResetMode(true); setError(null); setMessage(null); }} className="w-full mt-5 font-body text-sm font-semibold text-route underline">{resetCopy.forgot}</button>}
            <button type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setResetMode(false); setError(null); setMessage(null); }} className="w-full mt-5 font-body text-sm text-steel underline">
              {mode === "login" ? t("driver.login.switchSignup") : t("driver.login.switchLogin")}
            </button>
          </>
        )}
      </section>
    </main>
  );
}
