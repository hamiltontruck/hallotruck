import {
  useCallback,
  useEffect,
  useRef,
  useState,
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

function friendlyAuthError(message: string | undefined) {
  const value = message?.toLowerCase() ?? "";
  if (value.includes("invalid login credentials")) return "The email or password is incorrect.";
  if (value.includes("email not confirmed")) return "Confirm your email before signing in.";
  if (value.includes("already registered") || value.includes("already been registered")) return "An account already exists for this email.";
  if (value.includes("password") && value.includes("characters")) return "Use a stronger password with at least 6 characters.";
  if (value.includes("failed to fetch") || value.includes("network")) return "The server could not be reached. Check your internet connection.";
  return "Authentication is temporarily unavailable. Please try again.";
}

function Screen({ children }: { children: ReactNode }) {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "20px",
        background: "linear-gradient(180deg,#edf5ff 0%,#f7f9fc 55%,#fff 100%)",
        color: "#10213d",
        fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      }}
    >
      {children}
    </main>
  );
}

function Brand() {
  return (
    <div style={{ display: "grid", justifyItems: "center", gap: "10px", marginBottom: "22px", textAlign: "center" }}>
      <div
        aria-label="HALLO logo"
        style={{
          width: "68px",
          height: "68px",
          display: "grid",
          placeItems: "center",
          borderRadius: "22px",
          background: "#10213d",
          color: "#f5b400",
          fontWeight: 950,
          fontSize: "28px",
          boxShadow: "0 12px 28px rgba(16,33,61,.18)",
        }}
      >H</div>
      <div>
        <div style={{ color: "#10213d", fontSize: "26px", fontWeight: 950, lineHeight: 1 }}>
          HALLO<span style={{ color: "#d68e25" }}>TRUCK</span>
        </div>
        <div style={{ marginTop: "5px", color: "#66758c", fontSize: "11px", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".1em" }}>
          Customer Mobile
        </div>
      </div>
    </div>
  );
}

function AuthForm({
  busy,
  error,
  notice,
  onSignIn,
  onSignUp,
}: {
  busy: boolean;
  error: string | null;
  notice: string | null;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (fullName: string, phone: string, email: string, password: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const submitLock = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || submitLock.current) return;
    submitLock.current = true;
    try {
      if (mode === "signup") await onSignUp(fullName, phone, email, password);
      else await onSignIn(email.trim(), password);
    } finally {
      submitLock.current = false;
    }
  }

  return (
    <Screen>
      <div style={{ width: "min(100%, 430px)", display: "grid", justifyItems: "stretch" }}>
        <Brand />
        <section style={{ ...panelStyle, width: "100%", boxSizing: "border-box" }}>
          <p style={{ margin: 0, color: "#9a6700", fontSize: "10px", fontWeight: 900, letterSpacing: ".16em" }}>CUSTOMER ONLY</p>
          <h1 style={{ margin: "8px 0 0", fontSize: "26px", lineHeight: 1.15 }}>{mode === "signup" ? "Create your HALLO account" : "Sign in to your account"}</h1>
          <p style={{ margin: "10px 0 0", color: "#66758c", fontSize: "13px", lineHeight: 1.7 }}>
            {mode === "signup" ? "Create a Customer account using your name, Ethiopian phone number, email and password." : "Use your HALLO Customer account to book and track transport."}
          </p>

          {error && <div role="alert" style={{ marginTop: "18px", border: "1px solid #fecaca", borderRadius: "14px", background: "#fef2f2", padding: "12px", color: "#b91c1c", fontSize: "13px" }}>{error}</div>}
          {notice && <div role="status" style={{ marginTop: "18px", border: "1px solid #bbf7d0", borderRadius: "14px", background: "#f0fdf4", padding: "12px", color: "#166534", fontSize: "13px" }}>{notice}</div>}

          <form onSubmit={submit} style={{ display: "grid", gap: "16px", marginTop: "22px" }} aria-busy={busy}>
            {mode === "signup" && (
              <>
                <label style={{ fontSize: "13px", fontWeight: 800 }}>
                  Full name
                  <input style={inputStyle} type="text" autoComplete="name" required disabled={busy} value={fullName} onChange={(event) => setFullName(event.target.value)} />
                </label>
                <label style={{ fontSize: "13px", fontWeight: 800 }}>
                  Phone
                  <input style={inputStyle} type="tel" autoComplete="tel" inputMode="tel" required disabled={busy} placeholder="09XXXXXXXX or +2519XXXXXXXX" value={phone} onChange={(event) => setPhone(event.target.value)} />
                </label>
              </>
            )}
            <label style={{ fontSize: "13px", fontWeight: 800 }}>
              Email
              <input style={inputStyle} type="email" autoComplete="email" inputMode="email" required disabled={busy} value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label style={{ fontSize: "13px", fontWeight: 800 }}>
              Password
              <input style={inputStyle} type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={6} required disabled={busy} value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <button type="submit" disabled={busy} style={{ ...primaryButtonStyle, opacity: busy ? .6 : 1 }}>
              {busy ? (mode === "signup" ? "CREATING ACCOUNT…" : "VERIFYING ACCOUNT…") : (mode === "signup" ? "CREATE ACCOUNT" : "SIGN IN")}
            </button>
          </form>
        </section>

        <div style={{ display: "grid", placeItems: "center", marginTop: "18px" }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            style={{ ...modeLinkStyle, opacity: busy ? .55 : 1 }}
          >
            {mode === "login" ? "Create Account" : "Back to Sign in"}
          </button>
        </div>
      </div>
    </Screen>
  );
}

function AccessState({ eyebrow, title, description, onSignOut, onRetry }: {
  eyebrow: string;
  title: string;
  description: string;
  onSignOut: () => Promise<void>;
  onRetry?: () => Promise<void>;
}) {
  return (
    <Screen>
      <section style={{ ...panelStyle, textAlign: "center" }}>
        <Brand />
        <p style={{ margin: 0, color: "#0759c7", fontSize: "10px", fontWeight: 900, letterSpacing: ".14em" }}>{eyebrow}</p>
        <h1 style={{ margin: "10px 0 0", fontSize: "24px" }}>{title}</h1>
        <p style={{ margin: "10px 0 0", color: "#66758c", fontSize: "13px", lineHeight: 1.7 }}>{description}</p>
        {onRetry && <button type="button" onClick={() => void onRetry()} style={{ ...primaryButtonStyle, marginTop: "20px" }}>Retry verification</button>}
        <button type="button" onClick={() => void onSignOut()} style={{ ...primaryButtonStyle, marginTop: "10px", background: "#fff", color: "#10213d", border: "1px solid #d8e2ef" }}>Sign out</button>
      </section>
    </Screen>
  );
}

function normalizeEthiopianPhone(value: string) {
  const compact = value.replace(/[\s()-]/g, "");
  if (/^09\d{8}$/.test(compact)) return `+251${compact.slice(1)}`;
  if (/^2519\d{8}$/.test(compact)) return `+${compact}`;
  if (/^\+2519\d{8}$/.test(compact)) return compact;
  throw new Error("Enter a valid Ethiopian mobile number.");
}

export function CustomerAuthBoundary({ children }: CustomerAuthBoundaryProps) {
  const [state, setState] = useState<AuthState>(() => customerSupabaseConfigured ? { kind: "booting" } : { kind: "configuration-error" });
  const [authenticating, setAuthenticating] = useState(false);
  const requestIdRef = useRef(0);
  const loginLockRef = useRef(false);

  const resolveSession = useCallback(async (session: Session | null) => {
    const client = customerSupabase;
    const requestId = ++requestIdRef.current;
    if (!client) {
      setState({ kind: "configuration-error" });
      return;
    }
    if (!session) {
      setState({ kind: "signed-out", error: null, notice: null });
      return;
    }

    setState({ kind: "booting" });
    try {
      const { data, error } = await client
        .from("profiles")
        .select("role,full_name")
        .eq("id", session.user.id)
        .maybeSingle<CustomerProfileRow>();
      if (requestId !== requestIdRef.current) return;
      if (error) throw error;

      const access = classifyCustomerProfile(data);
      if (access.kind === "allowed") {
        setState({ kind: "allowed", identity: { userId: session.user.id, fullName: access.fullName } });
        return;
      }
      if (access.kind === "unsupported-role") {
        setState({ kind: "unsupported-role" });
        return;
      }
      setState({ kind: "missing-profile" });
    } catch {
      if (requestId !== requestIdRef.current) return;
      setState({ kind: "load-error", message: "The database profile could not be verified. Check your connection and try again." });
    }
  }, []);

  useEffect(() => {
    const client = customerSupabase;
    if (!client) return;
    let active = true;
    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setState({ kind: "signed-out", error: friendlyAuthError(error.message), notice: null });
        return;
      }
      void resolveSession(data.session);
    });
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      void resolveSession(session);
    });
    return () => {
      active = false;
      ++requestIdRef.current;
      listener.subscription.unsubscribe();
    };
  }, [resolveSession]);

  async function signIn(email: string, password: string) {
    const client = customerSupabase;
    if (!client || loginLockRef.current) return;
    loginLockRef.current = true;
    setAuthenticating(true);
    setState({ kind: "signed-out", error: null, notice: null });
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("network");
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await resolveSession(data.session);
    } catch (error) {
      setState({ kind: "signed-out", error: friendlyAuthError(error instanceof Error ? error.message : undefined), notice: null });
    } finally {
      loginLockRef.current = false;
      setAuthenticating(false);
    }
  }

  async function signUp(fullName: string, phone: string, email: string, password: string) {
    const client = customerSupabase;
    if (!client || loginLockRef.current) return;
    loginLockRef.current = true;
    setAuthenticating(true);
    setState({ kind: "signed-out", error: null, notice: null });
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("network");
      const cleanName = fullName.trim();
      const cleanEmail = email.trim().toLowerCase();
      if (cleanName.length < 2) throw new Error("Enter your full name.");
      if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) throw new Error("Enter a valid email address.");
      if (password.length < 6) throw new Error("Use a password with at least 6 characters.");
      const normalizedPhone = normalizeEthiopianPhone(phone);
      const { data, error } = await client.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: cleanName,
            phone: normalizedPhone,
            role: "customer",
          },
        },
      });
      if (error) throw error;
      if (data.session) {
        await resolveSession(data.session);
      } else {
        setState({ kind: "signed-out", error: null, notice: "Account created. Confirm your email, then sign in." });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : undefined;
      const friendly = message && (message.startsWith("Enter ") || message.startsWith("Use ")) ? message : friendlyAuthError(message);
      setState({ kind: "signed-out", error: friendly, notice: null });
    } finally {
      loginLockRef.current = false;
      setAuthenticating(false);
    }
  }

  async function signOut() {
    const client = customerSupabase;
    ++requestIdRef.current;
    try {
      await client?.auth.signOut();
    } finally {
      setState({ kind: "signed-out", error: null, notice: null });
    }
  }

  async function retryProfile() {
    const client = customerSupabase;
    if (!client) return;
    const { data, error } = await client.auth.getSession();
    if (error) {
      setState({ kind: "load-error", message: friendlyAuthError(error.message) });
      return;
    }
    await resolveSession(data.session);
  }

  if (state.kind === "configuration-error") {
    return <AccessState eyebrow="CONFIGURATION REQUIRED" title="Customer login is not configured" description="Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the build environment. Never expose a service-role key in this app." onSignOut={async () => undefined} />;
  }
  if (state.kind === "booting") {
    return <Screen><section style={{ ...panelStyle, textAlign: "center" }}><Brand/><div style={{ width: "38px", height: "38px", margin: "12px auto", border: "4px solid #e4edf8", borderTopColor: "#0759c7", borderRadius: "50%" }}/><strong role="status">Verifying Customer account…</strong></section></Screen>;
  }
  if (state.kind === "signed-out") return <AuthForm busy={authenticating} error={state.error} notice={state.notice} onSignIn={signIn} onSignUp={signUp} />;
  if (state.kind === "allowed") return <>{children(state.identity)}</>;
  if (state.kind === "unsupported-role") return <AccessState eyebrow="ACCESS DENIED" title="Customer account required" description="This account does not have the Customer database role. Driver, Admin, CEO and Partner workspaces cannot open this app." onSignOut={signOut} />;
  if (state.kind === "missing-profile") return <AccessState eyebrow="PROFILE MISSING" title="Database profile not found" description="An auth account exists, but no profile row was returned. Authorization is never guessed." onSignOut={signOut} onRetry={retryProfile} />;
  if (state.kind === "load-error") return <AccessState eyebrow="SECURE CONNECTION ERROR" title="Role verification failed" description={state.message} onSignOut={signOut} onRetry={retryProfile} />;
  return null;
}
