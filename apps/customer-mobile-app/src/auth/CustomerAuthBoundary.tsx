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
  | { kind: "signed-out"; error: string | null }
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

function friendlyLoginError(message: string | undefined) {
  const value = message?.toLowerCase() ?? "";
  if (value.includes("invalid login credentials")) return "The email or password is incorrect.";
  if (value.includes("email not confirmed")) return "Confirm your email before signing in.";
  if (value.includes("failed to fetch") || value.includes("network")) return "The server could not be reached. Check your internet connection.";
  return "Sign-in is temporarily unavailable. Please try again.";
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
    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
      <div style={{ width: "54px", height: "54px", display: "grid", placeItems: "center", borderRadius: "18px", background: "#10213d", color: "#f5b400", fontWeight: 950, fontSize: "22px" }}>H</div>
      <div>
        <div style={{ color: "#10213d", fontSize: "24px", fontWeight: 950, lineHeight: 1 }}>HALLO<span style={{ color: "#d68e25" }}>TRUCK</span></div>
        <div style={{ marginTop: "4px", color: "#66758c", fontSize: "11px", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em" }}>Customer Mobile</div>
      </div>
    </div>
  );
}

function Login({ busy, error, onSubmit }: {
  busy: boolean;
  error: string | null;
  onSubmit: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const submitLock = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || submitLock.current) return;
    submitLock.current = true;
    try {
      await onSubmit(email.trim(), password);
    } finally {
      submitLock.current = false;
    }
  }

  return (
    <Screen>
      <section style={panelStyle}>
        <Brand />
        <p style={{ margin: 0, color: "#9a6700", fontSize: "10px", fontWeight: 900, letterSpacing: ".16em" }}>CUSTOMER ONLY</p>
        <h1 style={{ margin: "8px 0 0", fontSize: "26px", lineHeight: 1.15 }}>Sign in to your account</h1>
        <p style={{ margin: "10px 0 0", color: "#66758c", fontSize: "13px", lineHeight: 1.7 }}>
          This app opens only for the Customer database role. Driver, Admin, CEO and Partner accounts fail closed.
        </p>

        {error && <div role="alert" style={{ marginTop: "18px", border: "1px solid #fecaca", borderRadius: "14px", background: "#fef2f2", padding: "12px", color: "#b91c1c", fontSize: "13px" }}>{error}</div>}

        <form onSubmit={submit} style={{ display: "grid", gap: "16px", marginTop: "22px" }} aria-busy={busy}>
          <label style={{ fontSize: "13px", fontWeight: 800 }}>
            Email
            <input style={inputStyle} type="email" autoComplete="email" inputMode="email" required disabled={busy} value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label style={{ fontSize: "13px", fontWeight: 800 }}>
            Password
            <input style={inputStyle} type="password" autoComplete="current-password" required disabled={busy} value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <button type="submit" disabled={busy} style={{ ...primaryButtonStyle, opacity: busy ? .6 : 1 }}>
            {busy ? "Verifying account…" : "SIGN IN"}
          </button>
        </form>

        <p style={{ margin: "18px 0 0", color: "#66758c", fontSize: "11px", lineHeight: 1.6 }}>
          Authorization is verified from the database `profiles.role`. User metadata, app metadata and a UI-selected role are never trusted.
        </p>
      </section>
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
      setState({ kind: "signed-out", error: null });
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
        setState({ kind: "signed-out", error: friendlyLoginError(error.message) });
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
    setState({ kind: "signed-out", error: null });

    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("network");
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await resolveSession(data.session);
    } catch (error) {
      setState({ kind: "signed-out", error: friendlyLoginError(error instanceof Error ? error.message : undefined) });
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
      setState({ kind: "signed-out", error: null });
    }
  }

  async function retryProfile() {
    const client = customerSupabase;
    if (!client) return;
    const { data, error } = await client.auth.getSession();
    if (error) {
      setState({ kind: "load-error", message: friendlyLoginError(error.message) });
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
  if (state.kind === "signed-out") return <Login busy={authenticating} error={state.error} onSubmit={signIn} />;
  if (state.kind === "allowed") return <>{children(state.identity)}</>;
  if (state.kind === "unsupported-role") return <AccessState eyebrow="ACCESS DENIED" title="Customer account required" description="This account does not have the Customer database role. Driver, Admin, CEO and Partner workspaces cannot open this app." onSignOut={signOut} />;
  if (state.kind === "missing-profile") return <AccessState eyebrow="PROFILE MISSING" title="Database profile not found" description="An auth account exists, but no profile row was returned. Authorization is never guessed." onSignOut={signOut} onRetry={retryProfile} />;
  if (state.kind === "load-error") return <AccessState eyebrow="SECURE CONNECTION ERROR" title="Role verification failed" description={state.message} onSignOut={signOut} onRetry={retryProfile} />;
  return null;
}
