import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "./supabase";
import { Mail, LockKeyhole, Eye, EyeOff } from "lucide-react";
import { AuthBrand, AuthFooter } from "./auth/brand";
import googleMark from "./auth/assets/google.svg";
import { beginGoogleSignIn, driverAuthRedirect } from "./auth/google-sign-in";

type Mode = "login" | "signup" | "reset";
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

const UI = {
  en: { welcome: "Welcome Drivers", subtitle: "Sign in to your account", signIn: "Sign In", forgot: "Forgot Password?", google: "Continue with Google", or: "or", noAccount: "Don’t have an account?", create: "Create Account", reset: "Reset your password", send: "Send reset link", sent: "If an account exists for this email, a reset link will arrive shortly.", googleUnavailable: "Google sign-in is unavailable right now. Please use your email and password.", googleFailed: "Google sign-in was not completed. Try again or sign in with your email.", back: "Back to Sign In" },
  om: { welcome: "Baga Nagaan Deebitan", subtitle: "Gara akkaawuntii keetti seeni", signIn: "Seeni", forgot: "Password dagattee?", google: "Google waliin itti fufi", or: "ykn", noAccount: "Akkaawuntii hin qabduu?", create: "Akkaawuntii Uumi", reset: "Password kee haaromsi", send: "Linkii haaromsuu ergi", sent: "Imeelii kanaan akkaawuntiin yoo jiraate, linkiin haaromsuu siif ergama.", googleUnavailable: "Google'n seenuun amma hin danda'amu. Imeelii fi password kee fayyadami.", googleFailed: "Google'n seenuun hin xumuramne. Irra deebi'i ykn imeelii keetiin seeni.", back: "Gara Seenuutti Deebi'i" },
  am: { welcome: "እንኳን ደህና ተመለሱ", subtitle: "ወደ መለያዎ ይግቡ", signIn: "ግባ", forgot: "የይለፍ ቃል ረሱ?", google: "በGoogle ይቀጥሉ", or: "ወይም", noAccount: "መለያ የለዎትም?", create: "መለያ ይፍጠሩ", reset: "የይለፍ ቃልዎን ያድሱ", send: "የማደሻ አገናኝ ላክ", sent: "በዚህ ኢሜይል መለያ ካለ፣ የማደሻ አገናኝ ይላካል።", googleUnavailable: "በGoogle መግባት አሁን አይቻልም። ኢሜይልና የይለፍ ቃልዎን ይጠቀሙ።", googleFailed: "በGoogle መግባት አልተጠናቀቀም። እንደገና ይሞክሩ ወይም በኢሜይል ይግቡ።", back: "ወደ መግቢያ ተመለስ" },
} as const;
// Capture provider rejection before Supabase consumes the callback URL.
const callbackError = new URLSearchParams(window.location.hash.slice(1)).has("error") || new URLSearchParams(window.location.search).has("error");

function storedLanguage(): Language {
  const value = window.localStorage.getItem(LANGUAGE_KEY);
  return value === "en" || value === "am" || value === "om" ? value : "om";
}

function isNetworkFailure(reason: unknown) {
  const message = reason instanceof Error ? reason.message.toLowerCase() : String(reason ?? "").toLowerCase();
  return reason instanceof TypeError || message.includes("failed to fetch") || message.includes("network request failed") || message.includes("load failed") || message.includes("fetch failed");
}

export function Login() {
  const submitting = useRef(false);
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
  const ui = UI[language];

  useEffect(() => {
    if (callbackError) {
      setError(UI[storedLanguage()].googleFailed);
      const url = new URL(window.location.href);
      for (const key of ["error", "error_code", "error_description"]) url.searchParams.delete(key);
      if (new URLSearchParams(url.hash.slice(1)).has("error")) url.hash = "";
      window.history.replaceState(null, "", url);
    }
  }, []);

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
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true); resetFeedback();
    try {
      if (!navigator.onLine) throw new Error(text.offline);
      const normalizedEmail = normalizeEmail(email);
      if (mode === "reset") {
        // The existing root portal owns the complete recovery callback and PIN policy.
        const redirectTo = new URL("../", driverAuthRedirect(window.location.origin, import.meta.env.BASE_URL)).href;
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
        if (resetError) throw resetError;
        setConfirmation(ui.sent);
      } else if (mode === "signup") {
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
    } finally { submitting.current = false; setBusy(false); }
  }

  function changeMode(next: Mode) { setMode(next); setPassword(""); setConfirmPassword(""); setShowPin(false); resetFeedback(); }
  async function googleSignIn() {
    if (busy) return;
    if (submitting.current) return;
    submitting.current = true; setBusy(true); resetFeedback();
    try {
      if (!navigator.onLine) throw new Error(text.offline);
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`, {
        headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY }, signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(ui.googleUnavailable);
      const settings = await response.json();
      if (settings.external?.google !== true) throw new Error(ui.googleUnavailable);
      const url = await beginGoogleSignIn(supabase, driverAuthRedirect(window.location.origin, import.meta.env.BASE_URL));
      window.location.assign(url);
    } catch (reason) {
      setError(isNetworkFailure(reason) ? text.network : reason instanceof Error ? reason.message : ui.googleFailed);
    } finally { submitting.current = false; setBusy(false); }
  }
  const signup = mode === "signup";
  const reset = mode === "reset";

  return <main className="driver-auth">
    <div className="driver-auth-top"><label><span className="driver-sr-only">{text.language}</span><select aria-label={text.language} value={language} onChange={(event) => setLanguage(event.target.value as Language)} disabled={busy}><option value="en">EN</option><option value="om">OR</option><option value="am">አማ</option></select></label></div>
    <div className="driver-auth-content">
      <AuthBrand />
      <header className={`driver-auth-title ${!signup && !reset ? "driver-auth-title--login" : ""}`}><h1>{signup ? ui.create : reset ? ui.reset : ui.welcome}</h1><p>{signup ? text.taglineSignup : reset ? text.email : ui.subtitle}</p></header>
      {!online && <p className="driver-auth-error" role="alert" aria-live="assertive">{text.offline}</p>}
      <form onSubmit={submit} className="driver-auth-form" noValidate>
        {signup && <>
          <label>{text.fullName}<input required autoComplete="name" minLength={2} maxLength={120} value={fullName} onChange={(event) => setFullName(event.target.value)} disabled={busy} /></label>
          <label>{text.phone}<input required type="tel" inputMode="tel" autoComplete="tel" placeholder="09xxxxxxxx" maxLength={17} value={phone} onChange={(event) => setPhone(event.target.value)} disabled={busy} /></label>
        </>}
        <label className="driver-auth-field"><span className="driver-sr-only">{text.email}</span><Mail size={19} aria-hidden="true"/><input required type="email" autoComplete={signup || reset ? "email" : "username"} inputMode="email" placeholder={language === "en" ? "Email address" : text.email} maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} /></label>
        {!reset && <label className="driver-auth-field"><span className="driver-sr-only">{signup ? text.createPin : text.passwordPin}</span><LockKeyhole size={19} aria-hidden="true"/><input required placeholder={signup ? text.createPin : text.passwordPin} type={showPin ? "text" : "password"} inputMode={signup ? "numeric" : undefined} pattern={signup ? "[0-9]{6}" : undefined} minLength={signup ? 6 : undefined} maxLength={signup ? 6 : undefined} autoComplete={signup ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(signup ? event.target.value.replace(/\D/g, "").slice(0, 6) : event.target.value)} disabled={busy} /><button type="button" className="driver-password-toggle" aria-label={text.showPassword} aria-pressed={showPin} disabled={busy} onClick={() => setShowPin(!showPin)}>{showPin ? <EyeOff size={19}/> : <Eye size={19}/>}</button></label>}
        {signup && <label>{text.confirmPin}<input required type={showPin ? "text" : "password"} inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value.replace(/\D/g, "").slice(0, 6))} disabled={busy} /></label>}
        {!signup && !reset && <button type="button" className="driver-auth-forgot" disabled={busy} onClick={() => changeMode("reset")}>{ui.forgot}</button>}
        {error && <p className="driver-auth-error" role="alert" aria-live="assertive">{error}</p>}
        {confirmation && <p className="driver-auth-notice" role="status" aria-live="polite">{confirmation}</p>}
        <button type="submit" className="driver-auth-submit" disabled={busy || !online}>{busy ? text.wait : signup ? text.create : reset ? ui.send : ui.signIn}</button>
      </form>
      {!signup && !reset && <><div className="driver-auth-divider"><span>{ui.or}</span></div><button type="button" className="driver-auth-google" disabled={busy || !online} onClick={() => void googleSignIn()}><img src={googleMark} alt="" width="20" height="20"/>{busy ? text.wait : ui.google}</button></>}
      <div className="driver-auth-switch">{!signup && !reset && <span>{ui.noAccount}</span>}<button type="button" disabled={busy} onClick={() => changeMode(signup || reset ? "login" : "signup")}>{signup || reset ? ui.back : ui.create}</button></div>
    </div>
    <AuthFooter />
  </main>;
}
