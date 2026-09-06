import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "./supabase";

type Mode = "login" | "signup";
const PIN_ERROR = "PIN must be exactly 6 numeric digits.";
const PHONE_ERROR = "Phone must be an Ethiopian mobile number: 09xxxxxxxx, 07xxxxxxxx, +2519xxxxxxxx or +2517xxxxxxxx.";

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,63}$/.test(email)) throw new Error("Enter a valid email address, for example name@example.com.");
  return email;
}

function normalizeEthiopianPhone(value: string) {
  const compact = value.trim().replace(/[\s()-]/g, "");
  if (!/^(?:\+251|251|0)?[79]\d{8}$/.test(compact)) throw new Error(PHONE_ERROR);
  if (compact.startsWith("+251")) return `0${compact.slice(4)}`;
  if (compact.startsWith("251")) return `0${compact.slice(3)}`;
  if (/^[79]/.test(compact)) return `0${compact}`;
  return compact;
}

function isNetworkFailure(reason: unknown) {
  const message = reason instanceof Error ? reason.message.toLowerCase() : String(reason ?? "").toLowerCase();
  return reason instanceof TypeError || message.includes("failed to fetch") || message.includes("network request failed") || message.includes("load failed") || message.includes("fetch failed");
}

export function Login() {
  const [mode, setMode] = useState<Mode>("login");
  const [language, setLanguage] = useState("Afaan Oromoo");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => { window.removeEventListener("online", handleOnline); window.removeEventListener("offline", handleOffline); };
  }, []);

  function resetFeedback() { setError(""); setConfirmation(""); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    resetFeedback();
    try {
      if (!navigator.onLine) throw new Error("Internet hin jiru. Data mobile ykn Wi-Fi baniitii irra deebi'i.");
      const normalizedEmail = normalizeEmail(email);
      if (mode === "signup") {
        const normalizedName = fullName.trim().replace(/\s+/g, " ");
        if (normalizedName.length < 2 || normalizedName.length > 120) throw new Error("Full name must contain 2–120 characters.");
        if (!/^\d{6}$/.test(password)) throw new Error(PIN_ERROR);
        if (password !== confirmPassword) throw new Error("PIN numbers do not match.");
        const normalizedPhone = normalizeEthiopianPhone(phone);
        const { data, error: signupError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { emailRedirectTo: window.location.href, data: { full_name: normalizedName, phone: normalizedPhone, role: "driver", language } },
        });
        if (signupError) throw signupError;
        if (!data.session) {
          setMode("login");
          setPassword("");
          setConfirmPassword("");
          setConfirmation("Account request received. Confirm your email if requested, then sign in to continue Driver onboarding.");
        }
      } else {
        if (!password) throw new Error("Enter your password or 6-digit PIN.");
        const { error: loginError } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
        if (loginError) throw loginError;
      }
    } catch (reason) {
      setOnline(navigator.onLine);
      setError(isNetworkFailure(reason) ? "HALLO login server bira ga'uun hin danda'amne. Internet kee ilaalii irra deebi'i." : reason instanceof Error ? reason.message : "Authentication failed.");
    } finally { setBusy(false); }
  }

  function switchMode() {
    setMode((current) => current === "login" ? "signup" : "login");
    setPassword(""); setConfirmPassword(""); setShowPin(false); resetFeedback();
  }

  const signup = mode === "signup";
  return <main className="auth">
    <div className="auth-brand"><span className="mark big">H</span><h1>HALLO Driver</h1><p>{signup ? "Create your independent Driver account." : "Sign in to HALLO Driver."}</p></div>
    {!online && <p className="error banner" role="alert">Internet hin jiru. Data mobile ykn Wi-Fi bani.</p>}
    <form onSubmit={submit} className="panel" noValidate>
      {signup && <>
        <label>Language<select value={language} onChange={(event) => setLanguage(event.target.value)} disabled={busy}><option>Afaan Oromoo</option><option>English</option><option>Amharic</option></select></label>
        <label>Full name<input required autoComplete="name" minLength={2} maxLength={120} value={fullName} onChange={(event) => setFullName(event.target.value)} disabled={busy} /></label>
        <label>Phone<input required type="tel" inputMode="tel" autoComplete="tel" placeholder="09xxxxxxxx" maxLength={17} value={phone} onChange={(event) => setPhone(event.target.value)} disabled={busy} /></label>
      </>}
      <label>Email<input required type="email" autoComplete="email" inputMode="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} /></label>
      <label>{signup ? "Create 6-digit PIN" : "Password / PIN"}<input required type={showPin ? "text" : "password"} inputMode={signup ? "numeric" : undefined} pattern={signup ? "[0-9]{6}" : undefined} minLength={signup ? 6 : undefined} maxLength={signup ? 6 : undefined} autoComplete={signup ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(signup ? event.target.value.replace(/\D/g, "").slice(0, 6) : event.target.value)} disabled={busy} /></label>
      {signup && <label>Confirm 6-digit PIN<input required type={showPin ? "text" : "password"} inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value.replace(/\D/g, "").slice(0, 6))} disabled={busy} /></label>}
      <label className="auth-check"><input type="checkbox" checked={showPin} onChange={(event) => setShowPin(event.target.checked)} disabled={busy} /><span>Show {signup ? "PIN numbers" : "password"}</span></label>
      {error && <p className="error banner" role="alert" aria-live="assertive">{error}</p>}
      {confirmation && <p className="success notice-box" role="status" aria-live="polite">{confirmation}</p>}
      <button type="submit" className="primary" disabled={busy || !online}>{busy ? "Please wait…" : signup ? "Create Driver account" : "Sign in securely"}</button>
    </form>
    <button type="button" className="link-button" disabled={busy} onClick={switchMode}>{signup ? "Sign in instead" : "Create a Driver account"}</button>
  </main>;
}
