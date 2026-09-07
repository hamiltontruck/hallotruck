import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "./supabase";

type Mode = "login" | "signup";
type Language = "om" | "en" | "am";

const LANGUAGE_KEY = "hallo-driver-language";
const LANGUAGE_LABELS: Record<Language, string> = { om: "Afaan Oromoo", en: "English", am: "አማርኛ" };

const COPY = {
  om: {
    taglineLogin: "HALLO Driver seeni.", taglineSignup: "Akkaawuntii Driver mataa keetii uumi.", language: "Afaan",
    fullName: "Maqaa guutuu", phone: "Bilbila", email: "Imeelii", createPin: "PIN dijiitii 6 uumi", passwordPin: "Password / PIN",
    confirmPin: "PIN dijiitii 6 mirkaneessi", showPins: "PIN agarsiisi", showPassword: "Password agarsiisi",
    wait: "Mee eegi…", create: "Akkaawuntii Driver uumi", signIn: "Nageenyaan seeni", signInInstead: "Gara seenuutti deebi'i", createLink: "Akkaawuntii Driver uumi",
    offline: "Internet hin jiru. Data mobile ykn Wi-Fi bani.", network: "HALLO login server bira ga'uun hin danda'amne. Internet kee ilaalii irra deebi'i.",
    emailInvalid: "Imeelii sirrii galchi; fakkeenyaaf name@example.com.", phoneInvalid: "Lakkoofsa bilbilaa Itoophiyaa sirrii galchi: 09xxxxxxxx, 07xxxxxxxx, +2519xxxxxxxx ykn +2517xxxxxxxx.",
    nameInvalid: "Maqaan guutuun qubee 2–120 qabaachuu qaba.", pinInvalid: "PIN dijiitii lakkoofsaa 6 qofa ta'uu qaba.", pinMismatch: "PIN lamaan wal hin gitan.", passwordRequired: "Password ykn PIN dijiitii 6 galchi.",
    confirmation: "Gaaffiin akkaawuntii fudhatameera. Yoo barbaachise imeelii mirkaneessi; sana booda Driver onboarding itti fufuuf seeni.", authFailed: "Seenuun hin milkoofne.",
  },
  en: {
    taglineLogin: "Sign in to HALLO Driver.", taglineSignup: "Create your independent Driver account.", language: "Language",
    fullName: "Full name", phone: "Phone", email: "Email", createPin: "Create 6-digit PIN", passwordPin: "Password / PIN",
    confirmPin: "Confirm 6-digit PIN", showPins: "Show PIN numbers", showPassword: "Show password",
    wait: "Please wait…", create: "Create Driver account", signIn: "Sign in securely", signInInstead: "Sign in instead", createLink: "Create a Driver account",
    offline: "No internet connection. Turn on mobile data or Wi-Fi.", network: "HALLO login server could not be reached. Check your internet connection and try again.",
    emailInvalid: "Enter a valid email address, for example name@example.com.", phoneInvalid: "Phone must be an Ethiopian mobile number: 09xxxxxxxx, 07xxxxxxxx, +2519xxxxxxxx or +2517xxxxxxxx.",
    nameInvalid: "Full name must contain 2–120 characters.", pinInvalid: "PIN must be exactly 6 numeric digits.", pinMismatch: "PIN numbers do not match.", passwordRequired: "Enter your password or 6-digit PIN.",
    confirmation: "Account request received. Confirm your email if requested, then sign in to continue Driver onboarding.", authFailed: "Authentication failed.",
  },
  am: {
    taglineLogin: "ወደ HALLO Driver ይግቡ።", taglineSignup: "የDriver መለያዎን ይፍጠሩ።", language: "ቋንቋ",
    fullName: "ሙሉ ስም", phone: "ስልክ", email: "ኢሜይል", createPin: "6 አሃዝ PIN ይፍጠሩ", passwordPin: "የይለፍ ቃል / PIN",
    confirmPin: "6 አሃዝ PIN ያረጋግጡ", showPins: "PIN አሳይ", showPassword: "የይለፍ ቃል አሳይ",
    wait: "እባክዎ ይጠብቁ…", create: "የDriver መለያ ይፍጠሩ", signIn: "በደህና ይግቡ", signInInstead: "ወደ መግቢያ ይመለሱ", createLink: "የDriver መለያ ይፍጠሩ",
    offline: "ኢንተርኔት የለም። ሞባይል ዳታ ወይም Wi-Fi ያብሩ።", network: "HALLO login server ላይ መድረስ አልተቻለም። ኢንተርኔትዎን ይፈትሹና እንደገና ይሞክሩ።",
    emailInvalid: "ትክክለኛ ኢሜይል ያስገቡ፣ ለምሳሌ name@example.com።", phoneInvalid: "ትክክለኛ የኢትዮጵያ ሞባይል ቁጥር ያስገቡ።",
    nameInvalid: "ሙሉ ስም 2–120 ፊደላት መሆን አለበት።", pinInvalid: "PIN በትክክል 6 አሃዝ ቁጥር መሆን አለበት።", pinMismatch: "PIN ቁጥሮቹ አይመሳሰሉም።", passwordRequired: "የይለፍ ቃል ወይም 6 አሃዝ PIN ያስገቡ።",
    confirmation: "የመለያ ጥያቄዎ ተቀብሏል። ከተጠየቀ ኢሜይልዎን ያረጋግጡ፣ ከዚያ Driver onboarding ለመቀጠል ይግቡ።", authFailed: "መግባት አልተሳካም።",
  },
} as const;

function storedLanguage(): Language {
  const value = window.localStorage.getItem(LANGUAGE_KEY);
  return value === "en" || value === "am" || value === "om" ? value : "om";
}

function isNetworkFailure(reason: unknown) {
  const message = reason instanceof Error ? reason.message.toLowerCase() : String(reason ?? "").toLowerCase();
  return reason instanceof TypeError || message.includes("failed to fetch") || message.includes("network request failed") || message.includes("load failed") || message.includes("fetch failed");
}

export function Login() {
  const [mode, setMode] = useState<Mode>("login");
  const [language, setLanguage] = useState<Language>(storedLanguage);
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
  const text = COPY[language];

  useEffect(() => {
    document.documentElement.lang = language;
    window.localStorage.setItem(LANGUAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => { window.removeEventListener("online", handleOnline); window.removeEventListener("offline", handleOffline); };
  }, []);

  function resetFeedback() { setError(""); setConfirmation(""); }
  function normalizeEmail(value: string) {
    const normalized = value.trim().toLowerCase();
    if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,63}$/.test(normalized)) throw new Error(text.emailInvalid);
    return normalized;
  }
  function normalizePhone(value: string) {
    const compact = value.trim().replace(/[\s()-]/g, "");
    if (!/^(?:\+251|251|0)?[79]\d{8}$/.test(compact)) throw new Error(text.phoneInvalid);
    if (compact.startsWith("+251")) return `0${compact.slice(4)}`;
    if (compact.startsWith("251")) return `0${compact.slice(3)}`;
    if (/^[79]/.test(compact)) return `0${compact}`;
    return compact;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); resetFeedback();
    try {
      if (!navigator.onLine) throw new Error(text.offline);
      const normalizedEmail = normalizeEmail(email);
      if (mode === "signup") {
        const normalizedName = fullName.trim().replace(/\s+/g, " ");
        if (normalizedName.length < 2 || normalizedName.length > 120) throw new Error(text.nameInvalid);
        if (!/^\d{6}$/.test(password)) throw new Error(text.pinInvalid);
        if (password !== confirmPassword) throw new Error(text.pinMismatch);
        const normalizedPhone = normalizePhone(phone);
        const { data, error: signupError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { emailRedirectTo: window.location.href, data: { full_name: normalizedName, phone: normalizedPhone, role: "driver", language: LANGUAGE_LABELS[language] } },
        });
        if (signupError) throw signupError;
        if (!data.session) { setMode("login"); setPassword(""); setConfirmPassword(""); setConfirmation(text.confirmation); }
      } else {
        if (!password) throw new Error(text.passwordRequired);
        const { error: loginError } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
        if (loginError) throw loginError;
      }
    } catch (reason) {
      setOnline(navigator.onLine);
      setError(isNetworkFailure(reason) ? text.network : reason instanceof Error ? reason.message : text.authFailed);
    } finally { setBusy(false); }
  }

  function switchMode() { setMode((current) => current === "login" ? "signup" : "login"); setPassword(""); setConfirmPassword(""); setShowPin(false); resetFeedback(); }
  const signup = mode === "signup";

  return <main className="auth">
    <div className="auth-brand"><span className="mark big">H</span><h1>HALLO Driver</h1><p>{signup ? text.taglineSignup : text.taglineLogin}</p></div>
    {!online && <p className="error banner" role="alert">{text.offline}</p>}
    <form onSubmit={submit} className="panel" noValidate>
      <label>{text.language}<select value={language} onChange={(event) => setLanguage(event.target.value as Language)} disabled={busy}><option value="om">Afaan Oromoo</option><option value="en">English</option><option value="am">አማርኛ</option></select></label>
      {signup && <>
        <label>{text.fullName}<input required autoComplete="name" minLength={2} maxLength={120} value={fullName} onChange={(event) => setFullName(event.target.value)} disabled={busy} /></label>
        <label>{text.phone}<input required type="tel" inputMode="tel" autoComplete="tel" placeholder="09xxxxxxxx" maxLength={17} value={phone} onChange={(event) => setPhone(event.target.value)} disabled={busy} /></label>
      </>}
      <label>{text.email}<input required type="email" autoComplete="email" inputMode="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} /></label>
      <label>{signup ? text.createPin : text.passwordPin}<input required type={showPin ? "text" : "password"} inputMode={signup ? "numeric" : undefined} pattern={signup ? "[0-9]{6}" : undefined} minLength={signup ? 6 : undefined} maxLength={signup ? 6 : undefined} autoComplete={signup ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(signup ? event.target.value.replace(/\D/g, "").slice(0, 6) : event.target.value)} disabled={busy} /></label>
      {signup && <label>{text.confirmPin}<input required type={showPin ? "text" : "password"} inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value.replace(/\D/g, "").slice(0, 6))} disabled={busy} /></label>}
      <label className="auth-check"><input type="checkbox" checked={showPin} onChange={(event) => setShowPin(event.target.checked)} disabled={busy} /><span>{signup ? text.showPins : text.showPassword}</span></label>
      {error && <p className="error banner" role="alert" aria-live="assertive">{error}</p>}
      {confirmation && <p className="success notice-box" role="status" aria-live="polite">{confirmation}</p>}
      <button type="submit" className="primary" disabled={busy || !online}>{busy ? text.wait : signup ? text.create : text.signIn}</button>
    </form>
    <button type="button" className="link-button" disabled={busy} onClick={switchMode}>{signup ? text.signInInstead : text.createLink}</button>
  </main>;
}
