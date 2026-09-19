import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import {
  classifyCustomerProfile,
  type CustomerProfileRow,
} from "./customer-access-policy";
import {
  customerSupabase,
  customerSupabaseConfigured,
} from "./customer-supabase";

export type CustomerIdentity = {
  userId: string;
  fullName: string;
};

type Language = "om" | "en" | "am";
type AuthState =
  | { kind: "booting" }
  | { kind: "configuration-error" }
  | { kind: "signed-out"; error: string | null; notice: string | null }
  | { kind: "allowed"; identity: CustomerIdentity }
  | { kind: "unsupported-role" }
  | { kind: "missing-profile" }
  | { kind: "load-error"; message: string };

type CustomerAuthBoundaryProps = {
  children: (identity: CustomerIdentity) => ReactNode;
};

const LANGUAGE_KEY = "hallo-customer-language";

const COPY = {
  om: {
    customerOnly: "CUSTOMER QOFA",
    createTitle: "Akkaawuntii HALLO kee uumi",
    signInTitle: "Baga nagaan deebite",
    createDescription: "Maqaa, lakkoofsa bilbilaa Itoophiyaa, imeelii fi password fayyadamuun akkaawuntii Customer uumi.",
    signInDescription: "Gara akkaawuntii keetti seeni.",
    language: "Afaan",
    fullName: "Maqaa guutuu",
    phone: "Bilbila",
    email: "Imeelii",
    password: "Password",
    continueWithGoogle: "Google'n itti fufi",
    creating: "AKKAAWUNTII UUMAA JIRA…",
    verifying: "AKKAAWUNTII MIRKANEESSAA JIRA…",
    createAccount: "CREATE ACCOUNT",
    signIn: "SEENI",
    backToSignIn: "Gara seenuutti deebi'i",
    invalidLogin: "Imeeliin ykn password dogoggora.",
    emailNotConfirmed: "Seenuu dura imeelii kee mirkaneessi.",
    alreadyRegistered: "Imeelii kanaan akkaawuntiin duraan jira.",
    weakPassword: "Password cimaa qubee 6 ol qabu fayyadami.",
    network: "Server bira ga'uun hin danda'amne. Internet kee ilaali.",
    authUnavailable: "Authentication yeroo ammaatti hin hojjatu. Irra deebi'ii yaali.",
    phoneInvalid: "Lakkoofsa bilbilaa Itoophiyaa sirrii galchi.",
    nameInvalid: "Maqaa guutuu kee galchi.",
    emailInvalid: "Imeelii sirrii galchi.",
    passwordInvalid: "Password qubee 6 ol qabu fayyadami.",
    createdNotice: "Akkaawuntiin uumameera. Imeelii kee mirkaneessi; sana booda seeni.",
    retry: "Mirkaneessa irra deebi'i",
    signOut: "Ba'i",
    verifyingAccount: "Akkaawuntii Customer mirkaneessaa jira…",
    configurationEyebrow: "CONFIGURATION BARBAACHISA",
    configurationTitle: "Customer login hin qophoofne",
    configurationDescription: "Build environment keessatti VITE_SUPABASE_URL fi VITE_SUPABASE_ANON_KEY kaa'i. Service-role key app kana keessatti hin saaxilin.",
    deniedEyebrow: "SEENUUN DHORKAME",
    deniedTitle: "Akkaawuntii Customer barbaachisa",
    deniedDescription: "Akkaawuntiin kun database keessatti role Customer hin qabu. Driver, Admin, CEO fi Partner app kana banuu hin danda'an.",
    missingEyebrow: "PROFILE HIN JIRU",
    missingTitle: "Database profile hin argamne",
    missingDescription: "Auth account jira, garuu profile row hin deebine. Authorization tilmaamaan hin murtaa'u.",
    connectionEyebrow: "RAKKOO WALQUNNAMTII NAGEENYAA",
    connectionTitle: "Role mirkaneessuun hin milkoofne",
    profileLoadError: "Database profile mirkaneessuun hin danda'amne. Walqunnamtii kee ilaalii irra deebi'i.",
  },
  en: {
    customerOnly: "CUSTOMER ONLY",
    createTitle: "Create your HALLO account",
    signInTitle: "Welcome Back",
    createDescription: "Create a Customer account using your name, Ethiopian phone number, email and password.",
    signInDescription: "Sign in to your account",
    language: "Language",
    fullName: "Full name",
    phone: "Phone",
    email: "Email",
    password: "Password",
    continueWithGoogle: "Continue with Google",
    creating: "CREATING ACCOUNT…",
    verifying: "VERIFYING ACCOUNT…",
    createAccount: "CREATE ACCOUNT",
    signIn: "SIGN IN",
    backToSignIn: "Back to Sign in",
    invalidLogin: "The email or password is incorrect.",
    emailNotConfirmed: "Confirm your email before signing in.",
    alreadyRegistered: "An account already exists for this email.",
    weakPassword: "Use a stronger password with at least 6 characters.",
    network: "The server could not be reached. Check your internet connection.",
    authUnavailable: "Authentication is temporarily unavailable. Please try again.",
    phoneInvalid: "Enter a valid Ethiopian mobile number.",
    nameInvalid: "Enter your full name.",
    emailInvalid: "Enter a valid email address.",
    passwordInvalid: "Use a password with at least 6 characters.",
    createdNotice: "Account created. Confirm your email, then sign in.",
    retry: "Retry verification",
    signOut: "Sign out",
    verifyingAccount: "Verifying Customer account…",
    configurationEyebrow: "CONFIGURATION REQUIRED",
    configurationTitle: "Customer login is not configured",
    configurationDescription: "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the build environment. Never expose a service-role key in this app.",
    deniedEyebrow: "ACCESS DENIED",
    deniedTitle: "Customer account required",
    deniedDescription: "This account does not have the Customer database role. Driver, Admin, CEO and Partner workspaces cannot open this app.",
    missingEyebrow: "PROFILE MISSING",
    missingTitle: "Database profile not found",
    missingDescription: "An auth account exists, but no profile row was returned. Authorization is never guessed.",
    connectionEyebrow: "SECURE CONNECTION ERROR",
    connectionTitle: "Role verification failed",
    profileLoadError: "The database profile could not be verified. Check your connection and try again.",
  },
  am: {
    customerOnly: "ለደንበኛ ብቻ",
    createTitle: "የHALLO መለያዎን ይፍጠሩ",
    signInTitle: "እንኳን ደህና መጡ",
    createDescription: "ስምዎን፣ የኢትዮጵያ ስልክ ቁጥር፣ ኢሜይል እና የይለፍ ቃል በመጠቀም የCustomer መለያ ይፍጠሩ።",
    signInDescription: "ወደ መለያዎ ይግቡ።",
    language: "ቋንቋ",
    fullName: "ሙሉ ስም",
    phone: "ስልክ",
    email: "ኢሜይል",
    password: "የይለፍ ቃል",
    continueWithGoogle: "በGoogle ይቀጥሉ",
    creating: "መለያ በመፍጠር ላይ…",
    verifying: "መለያ በማረጋገጥ ላይ…",
    createAccount: "መለያ ይፍጠሩ",
    signIn: "ይግቡ",
    backToSignIn: "ወደ መግቢያ ይመለሱ",
    invalidLogin: "ኢሜይሉ ወይም የይለፍ ቃሉ ትክክል አይደለም።",
    emailNotConfirmed: "ከመግባትዎ በፊት ኢሜይልዎን ያረጋግጡ።",
    alreadyRegistered: "በዚህ ኢሜይል መለያ አስቀድሞ አለ።",
    weakPassword: "ቢያንስ 6 ፊደላት ያሉት ጠንካራ የይለፍ ቃል ይጠቀሙ።",
    network: "Server ላይ መድረስ አልተቻለም። ኢንተርኔትዎን ይፈትሹ።",
    authUnavailable: "Authentication ለጊዜው አይገኝም። እንደገና ይሞክሩ።",
    phoneInvalid: "ትክክለኛ የኢትዮጵያ ሞባይል ቁጥር ያስገቡ።",
    nameInvalid: "ሙሉ ስምዎን ያስገቡ።",
    emailInvalid: "ትክክለኛ ኢሜይል ያስገቡ።",
    passwordInvalid: "ቢያንስ 6 ፊደላት ያሉት የይለፍ ቃል ይጠቀሙ።",
    createdNotice: "መለያ ተፈጥሯል። ኢሜይልዎን ያረጋግጡ፣ ከዚያ ይግቡ።",
    retry: "እንደገና ያረጋግጡ",
    signOut: "ውጣ",
    verifyingAccount: "የCustomer መለያ በማረጋገጥ ላይ…",
    configurationEyebrow: "ማዋቀር ያስፈልጋል",
    configurationTitle: "Customer login አልተዋቀረም",
    configurationDescription: "በbuild environment ውስጥ VITE_SUPABASE_URL እና VITE_SUPABASE_ANON_KEY ያስቀምጡ። Service-role key በዚህ app ውስጥ አያሳዩ።",
    deniedEyebrow: "መዳረሻ ተከልክሏል",
    deniedTitle: "የCustomer መለያ ያስፈልጋል",
    deniedDescription: "ይህ መለያ በdatabase ውስጥ Customer role የለውም። Driver፣ Admin፣ CEO እና Partner ይህን app መክፈት አይችሉም።",
    missingEyebrow: "PROFILE አልተገኘም",
    missingTitle: "Database profile አልተገኘም",
    missingDescription: "Auth account አለ፣ ነገር ግን profile row አልተመለሰም። Authorization በግምት አይወሰንም።",
    connectionEyebrow: "የደህንነት ግንኙነት ችግኝ",
    connectionTitle: "Role ማረጋገጥ አልተሳካም",
    profileLoadError: "Database profile ማረጋገጥ አልተቻለም። ግንኙነትዎን ይፈትሹና እንደገና ይሞክሩ።",
  },
} as const;

const panelStyle = {
  width: "min(100%, 430px)",
  border: "1px solid #e2e9f3",
  borderRadius: "28px",
  background: "#fff",
  padding: "24px",
  boxShadow: "0 24px 70px rgba(16,33,61,.12)",
} as const;

const inputStyle = {
  width: "100%",
  minHeight: "50px",
  boxSizing: "border-box",
  marginTop: "8px",
  border: "1px solid #d8e2ef",
  borderRadius: "16px",
  padding: "0 14px",
  background: "#fff",
  color: "#10213d",
  fontSize: "16px",
  outline: "none",
} as const;

const primaryButtonStyle = {
  width: "100%",
  minHeight: "52px",
  border: 0,
  borderRadius: "16px",
  background: "#0759c7",
  color: "#fff",
  fontWeight: 900,
  fontSize: "14px",
  cursor: "pointer",
} as const;

const modeLinkStyle = {
  border: 0,
  padding: "10px 14px",
  background: "transparent",
  color: "#0759c7",
  fontSize: "15px",
  fontWeight: 900,
  textDecoration: "underline",
  textUnderlineOffset: "3px",
  cursor: "pointer",
} as const;

function storedLanguage(): Language {
  const value = window.localStorage.getItem(LANGUAGE_KEY);
  return value === "en" || value === "am" || value === "om" ? value : "om";
}

function friendlyAuthError(message: string | undefined, language: Language) {
  const text = COPY[language];
  const value = message?.toLowerCase() ?? "";
  if (value.includes("invalid login credentials")) return text.invalidLogin;
  if (value.includes("email not confirmed")) return text.emailNotConfirmed;
  if (value.includes("already registered") || value.includes("already been registered")) return text.alreadyRegistered;
  if (value.includes("password") && value.includes("characters")) return text.weakPassword;
  if (value.includes("failed to fetch") || value.includes("network")) return text.network;
  return text.authUnavailable;
}

function Screen({ children }: { children: ReactNode }) {
  return <main className="customer-auth-screen">{children}</main>;
}

function Brand() {
  return (
    <div className="customer-auth-brand" data-language-static="true">
      <div aria-label="HALLO logo" className="customer-auth-logo">H</div>
      <div><strong>HALLO</strong><small>Smart Logistics</small></div>
    </div>
  );
}

function LanguageSelect({ language, setLanguage, disabled = false }: { language: Language; setLanguage: (language: Language) => void; disabled?: boolean }) {
  return (
    <label className="customer-auth-language">
      <span className="customer-auth-language-label">{COPY[language].language}</span>
      <select value={language} disabled={disabled} onChange={(event) => setLanguage(event.target.value as Language)} aria-label={COPY[language].language}>
        <option value="en">EN</option>
        <option value="om">OR</option>
        <option value="am">አማ</option>
      </select>
    </label>
  );
}

function Splash({ onStart }: { onStart: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onStart, 1800);
    return () => window.clearTimeout(timer);
  }, [onStart]);

  return (
    <Screen>
      <button
        type="button"
        className="customer-auth-splash"
        onClick={onStart}
        aria-label="Continue to sign in"
      >
        <span className="customer-auth-splash-a11y">HALLO Smart Logistics</span>
      </button>
    </Screen>
  );
}

function AuthForm({ busy, error, notice, language, setLanguage, onSignIn, onSignUp, onGoogleSignIn }: {
  busy: boolean;
  error: string | null;
  notice: string | null;
  language: Language;
  setLanguage: (language: Language) => void;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (fullName: string, phone: string, email: string, password: string) => Promise<void>;
  onGoogleSignIn: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const submitLock = useRef(false);
  const text = COPY[language];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || submitLock.current || (mode === "signup" && !termsAccepted)) return;
    submitLock.current = true;
    try {
      if (mode === "signup") await onSignUp(fullName, phone, email, password);
      else await onSignIn(email.trim(), password);
    } finally {
      submitLock.current = false;
    }
  }

  function bringIntoView(event: FocusEvent<HTMLInputElement>) {
    window.setTimeout(() => event.currentTarget.scrollIntoView({ block: "center", behavior: "smooth" }), 180);
  }

  return (
    <Screen>
      <div className="customer-auth-shell">
        <LanguageSelect language={language} setLanguage={setLanguage} disabled={busy} />
        <Brand />
        <section className={`customer-auth-card is-${mode}`}>
          <h1>{mode === "signup" ? text.createTitle : text.signInTitle}</h1>
          <p>{mode === "signup" ? text.createDescription : text.signInDescription}</p>
          {error && <div className="customer-auth-alert is-error" role="alert">{error}</div>}
          {notice && <div className="customer-auth-alert is-success" role="status">{notice}</div>}
          <form className="customer-auth-form" onSubmit={submit} aria-busy={busy}>
            {mode === "signup" && <>
              <label><span>{text.fullName}</span><input type="text" autoComplete="name" required disabled={busy} value={fullName} onFocus={bringIntoView} onChange={(event) => setFullName(event.target.value)} /></label>
              <label><span>{text.phone}</span><input type="tel" autoComplete="tel" inputMode="tel" required disabled={busy} placeholder="+2519XXXXXXXX or 09XXXXXXXX" value={phone} onFocus={bringIntoView} onChange={(event) => setPhone(event.target.value)} /></label>
            </>}
            <label><span>{text.email}{mode === "signup" ? "" : ""}</span><input type="email" autoComplete="email" inputMode="email" required disabled={busy} placeholder={mode === "login" ? "Email address" : "name@example.com"} value={email} onFocus={bringIntoView} onChange={(event) => setEmail(event.target.value)} /></label>
            <label><span>{text.password}</span><div className="customer-auth-password"><input type={passwordVisible ? "text" : "password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={6} required disabled={busy} value={password} onFocus={bringIntoView} onChange={(event) => setPassword(event.target.value)} /><button type="button" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? "Hide password" : "Show password"}>{passwordVisible ? "◉" : "◎"}</button></div></label>
            {mode === "signup" && <label className="customer-auth-terms"><input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} disabled={busy}/><span>{language === "om" ? "Ulaagaa fi Haala irratti walii gala" : language === "am" ? "በውሎች እና ሁኔታዎች እስማማለሁ" : "I agree to the Terms & Conditions"}</span></label>}
            <button className="customer-auth-primary" type="submit" disabled={busy || (mode === "signup" && !termsAccepted)}>{busy ? (mode === "signup" ? text.creating : text.verifying) : (mode === "signup" ? text.createAccount : text.signIn)}</button>
          </form>
          {mode === "login" && <>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "18px 0", color: "#8a98aa", fontSize: "12px" }}>
              <span style={{ height: "1px", flex: 1, background: "#e2e9f3" }} />
              <span>OR</span>
              <span style={{ height: "1px", flex: 1, background: "#e2e9f3" }} />
            </div>
            <button type="button" disabled={busy} onClick={() => void onGoogleSignIn()} style={{ width: "100%", minHeight: "52px", border: "1px solid #cbd7e6", borderRadius: "16px", background: "#fff", color: "#10213d", fontWeight: 900, fontSize: "14px", cursor: "pointer", opacity: busy ? .6 : 1 }}>
              <span aria-hidden="true" style={{ marginRight: "8px", fontSize: "18px", fontWeight: 900 }}>G</span>{text.continueWithGoogle}
            </button>
          </>}
          <div className="customer-auth-mode">
            <span>{mode === "login" ? (language === "om" ? "Akkaawuntii hin qabduu?" : language === "am" ? "መለያ የለዎትም?" : "Don't have an account?") : (language === "om" ? "Akkaawuntii qabdaa?" : language === "am" ? "መለያ አለዎት?" : "Already have an account?")}</span>
            <button type="button" disabled={busy} onClick={() => { setMode(mode === "login" ? "signup" : "login"); setPassword(""); setTermsAccepted(false); }}>
              {mode === "login" ? (language === "om" ? "Galmaa'i" : language === "am" ? "ይመዝገቡ" : "Register") : text.signIn}
            </button>
          </div>
        </section>
      </div>
    </Screen>
  );
}

function AccessState({ language, setLanguage, eyebrow, title, description, onSignOut, onRetry }: {
  language: Language;
  setLanguage: (language: Language) => void;
  eyebrow: string;
  title: string;
  description: string;
  onSignOut: () => Promise<void>;
  onRetry?: () => Promise<void>;
}) {
  const text = COPY[language];
  return (
    <Screen>
      <section style={{ ...panelStyle, textAlign: "center" }}>
        <Brand />
        <LanguageSelect language={language} setLanguage={setLanguage} />
        <p style={{ margin: 0, color: "#0759c7", fontSize: "10px", fontWeight: 900, letterSpacing: ".14em" }}>{eyebrow}</p>
        <h1 style={{ margin: "10px 0 0", fontSize: "24px" }}>{title}</h1>
        <p style={{ margin: "10px 0 0", color: "#66758c", fontSize: "13px", lineHeight: 1.7 }}>{description}</p>
        {onRetry && <button type="button" onClick={() => void onRetry()} style={{ ...primaryButtonStyle, marginTop: "20px" }}>{text.retry}</button>}
        <button type="button" onClick={() => void onSignOut()} style={{ ...primaryButtonStyle, marginTop: "10px", background: "#fff", color: "#10213d", border: "1px solid #d8e2ef" }}>{text.signOut}</button>
      </section>
    </Screen>
  );
}

export function CustomerAuthBoundary({ children }: CustomerAuthBoundaryProps) {
  const [language, setLanguage] = useState<Language>(storedLanguage);
  const [state, setState] = useState<AuthState>(() => customerSupabaseConfigured ? { kind: "booting" } : { kind: "configuration-error" });
  const [authenticating, setAuthenticating] = useState(false);
  const [showSplash, setShowSplash] = useState(() => typeof window !== "undefined" && window.sessionStorage.getItem("hallo-customer-splash-seen") !== "1");
  const requestIdRef = useRef(0);
  const loginLockRef = useRef(false);
  const text = COPY[language];

  useEffect(() => {
    document.documentElement.lang = language;
    window.localStorage.setItem(LANGUAGE_KEY, language);
    setState((current) => current.kind === "signed-out" ? { kind: "signed-out", error: null, notice: null } : current);
  }, [language]);

  const resolveSession = useCallback(async (session: Session | null) => {
    const client = customerSupabase;
    const requestId = ++requestIdRef.current;
    if (!client) { setState({ kind: "configuration-error" }); return; }
    if (!session) { setState({ kind: "signed-out", error: null, notice: null }); return; }

    setState({ kind: "booting" });
    try {
      const { data, error } = await client.from("profiles").select("role,full_name").eq("id", session.user.id).maybeSingle<CustomerProfileRow>();
      if (requestId !== requestIdRef.current) return;
      if (error) throw error;
      const access = classifyCustomerProfile(data);
      if (access.kind === "allowed") { setState({ kind: "allowed", identity: { userId: session.user.id, fullName: access.fullName } }); return; }
      if (access.kind === "unsupported-role") { setState({ kind: "unsupported-role" }); return; }
      setState({ kind: "missing-profile" });
    } catch {
      if (requestId !== requestIdRef.current) return;
      setState({ kind: "load-error", message: COPY[language].profileLoadError });
    }
  }, [language]);

  useEffect(() => {
    const client = customerSupabase;
    if (!client) return;
    let active = true;
    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) { setState({ kind: "signed-out", error: friendlyAuthError(error.message, language), notice: null }); return; }
      void resolveSession(data.session);
    });
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => { if (active) void resolveSession(session); });
    return () => { active = false; ++requestIdRef.current; listener.subscription.unsubscribe(); };
  }, [language, resolveSession]);

  async function signIn(email: string, password: string) {
    const client = customerSupabase;
    if (!client || loginLockRef.current) return;
    loginLockRef.current = true; setAuthenticating(true); setState({ kind: "signed-out", error: null, notice: null });
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("network");
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await resolveSession(data.session);
    } catch (error) {
      setState({ kind: "signed-out", error: friendlyAuthError(error instanceof Error ? error.message : undefined, language), notice: null });
    } finally { loginLockRef.current = false; setAuthenticating(false); }
  }

  async function signUp(fullName: string, phone: string, email: string, password: string) {
    const client = customerSupabase;
    if (!client || loginLockRef.current) return;
    loginLockRef.current = true; setAuthenticating(true); setState({ kind: "signed-out", error: null, notice: null });
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("network");
      const cleanName = fullName.trim();
      const cleanEmail = email.trim().toLowerCase();
      if (cleanName.length < 2) throw new Error(text.nameInvalid);
      if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) throw new Error(text.emailInvalid);
      if (password.length < 6) throw new Error(text.passwordInvalid);
      const compact = phone.replace(/[\s()-]/g, "");
      let normalizedPhone = "";
      if (/^09\d{8}$/.test(compact)) normalizedPhone = `+251${compact.slice(1)}`;
      else if (/^2519\d{8}$/.test(compact)) normalizedPhone = `+${compact}`;
      else if (/^\+2519\d{8}$/.test(compact)) normalizedPhone = compact;
      else throw new Error(text.phoneInvalid);

      const { data, error } = await client.auth.signUp({
        email: cleanEmail,
        password,
        options: { data: { full_name: cleanName, phone: normalizedPhone, role: "customer" } },
      });
      if (error) throw error;
      if (data.session) await resolveSession(data.session);
      else setState({ kind: "signed-out", error: null, notice: language === "en" ? "Account created. Confirm your email, then sign in." : text.createdNotice });
    } catch (error) {
      const message = error instanceof Error ? error.message : undefined;
      const localValidation = message && [text.nameInvalid, text.emailInvalid, text.passwordInvalid, text.phoneInvalid].includes(message as never);
      setState({ kind: "signed-out", error: localValidation ? message! : friendlyAuthError(message, language), notice: null });
    } finally { loginLockRef.current = false; setAuthenticating(false); }
  }

  async function signInWithGoogle() {
    const client = customerSupabase;
    if (!client || loginLockRef.current) return;
    loginLockRef.current = true;
    setAuthenticating(true);
    setState({ kind: "signed-out", error: null, notice: null });
    try {
      const redirectTo = `${window.location.origin}${window.location.pathname}`;
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) throw error;
    } catch (error) {
      setState({ kind: "signed-out", error: friendlyAuthError(error instanceof Error ? error.message : undefined, language), notice: null });
      setAuthenticating(false);
      loginLockRef.current = false;
    }
  }

  async function signOut() {
    const client = customerSupabase;
    ++requestIdRef.current;
    try { await client?.auth.signOut(); } finally { setState({ kind: "signed-out", error: null, notice: null }); }
  }

  async function retryProfile() {
    const client = customerSupabase;
    if (!client) return;
    const { data, error } = await client.auth.getSession();
    if (error) { setState({ kind: "load-error", message: friendlyAuthError(error.message, language) }); return; }
    await resolveSession(data.session);
  }

  if (state.kind === "configuration-error") return <AccessState language={language} setLanguage={setLanguage} eyebrow={text.configurationEyebrow} title={text.configurationTitle} description={text.configurationDescription} onSignOut={async () => undefined} />;
  if (state.kind === "booting") return <Screen><section style={{ ...panelStyle, textAlign: "center" }}><Brand/><LanguageSelect language={language} setLanguage={setLanguage}/><div style={{ width: "38px", height: "38px", margin: "12px auto", border: "4px solid #e4edf8", borderTopColor: "#0759c7", borderRadius: "50%" }}/><strong role="status">{text.verifyingAccount}</strong></section></Screen>;
  if (state.kind === "signed-out" && showSplash) return <Splash onStart={() => { window.sessionStorage.setItem("hallo-customer-splash-seen", "1"); setShowSplash(false); }} />;
  if (state.kind === "signed-out") return <AuthForm busy={authenticating} error={state.error} notice={state.notice} language={language} setLanguage={setLanguage} onSignIn={signIn} onSignUp={signUp} onGoogleSignIn={signInWithGoogle} />;
  if (state.kind === "allowed") return <>{children(state.identity)}</>;
  if (state.kind === "unsupported-role") return <AccessState language={language} setLanguage={setLanguage} eyebrow={text.deniedEyebrow} title={text.deniedTitle} description={text.deniedDescription} onSignOut={signOut} />;
  if (state.kind === "missing-profile") return <AccessState language={language} setLanguage={setLanguage} eyebrow={text.missingEyebrow} title={text.missingTitle} description={text.missingDescription} onSignOut={signOut} onRetry={retryProfile} />;
  if (state.kind === "load-error") return <AccessState language={language} setLanguage={setLanguage} eyebrow={text.connectionEyebrow} title={text.connectionTitle} description={state.message} onSignOut={signOut} onRetry={retryProfile} />;
  return null;
}
