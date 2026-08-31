import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import {
  classifyMobileProfile,
  type MobileProfileRow,
  type MobileRole,
} from "./access-policy";
import { mobileSupabase, mobileSupabaseConfigured } from "./mobile-supabase";
import { MobileLogin } from "./MobileLogin";

export type MobileIdentity = {
  userId: string;
  role: MobileRole;
  fullName: string;
  driverStatus: string | null;
};

type AuthState =
  | { kind: "booting" }
  | { kind: "configuration-error" }
  | { kind: "signed-out"; error: string | null }
  | { kind: "allowed"; identity: MobileIdentity }
  | { kind: "driver-onboarding"; fullName: string; driverStatus: string | null }
  | { kind: "driver-suspended"; fullName: string }
  | { kind: "unsupported-role" }
  | { kind: "missing-profile" }
  | { kind: "load-error"; message: string };

type BoundaryContext = {
  identity: MobileIdentity;
  signOut: () => Promise<void>;
  signingOut: boolean;
};

type MobileAuthBoundaryProps = {
  children: (context: BoundaryContext) => ReactNode;
};

function friendlyLoginError(message: string | undefined) {
  const normalized = message?.toLowerCase() ?? "";
  if (normalized.includes("invalid login credentials")) {
    return "Email ykn password sirrii miti.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Email kee dura mirkaneessi; sana booda deebi'ii seeni.";
  }
  if (normalized.includes("failed to fetch") || normalized.includes("network")) {
    return "Server bira ga'uun hin danda'amne. Data mobile ykn Wi-Fi ilaaliitii irra deebi'i.";
  }
  return "Amma seenuun hin danda'amne. Irra deebi'ii yaali.";
}

function FullScreenStatus({ children }: { children: ReactNode }) {
  return (
    <main className="halo-mobile-app grid min-h-screen place-items-center bg-halo-canvas p-5 text-halo-navy">
      <section className="w-full max-w-[440px] rounded-[28px] border border-halo-line bg-white p-7 text-center shadow-[0_24px_70px_rgba(16,33,61,0.10)]">
        {children}
      </section>
    </main>
  );
}

function AccessPanel({
  eyebrow,
  title,
  description,
  onSignOut,
  signingOut,
  onRetry,
}: {
  eyebrow: string;
  title: string;
  description: string;
  onSignOut: () => Promise<void>;
  signingOut: boolean;
  onRetry?: () => Promise<void>;
}) {
  return (
    <FullScreenStatus>
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-halo-blue">{eyebrow}</p>
      <h1 className="mt-3 text-2xl font-black tracking-tight">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-halo-muted">{description}</p>
      {onRetry && (
        <button
          type="button"
          onClick={() => void onRetry()}
          disabled={signingOut}
          className="mt-6 min-h-12 w-full rounded-2xl bg-halo-blue px-5 font-black text-white disabled:opacity-60"
        >
          Irra deebi'ii mirkaneessi
        </button>
      )}
      <button
        type="button"
        onClick={() => void onSignOut()}
        disabled={signingOut}
        className={`${onRetry ? "mt-3" : "mt-6"} min-h-12 w-full rounded-2xl border border-halo-line px-5 font-black text-halo-navy disabled:opacity-60`}
      >
        {signingOut ? "Ba'aa jira…" : "Account keessaa ba'i"}
      </button>
    </FullScreenStatus>
  );
}

export function MobileAuthBoundary({ children }: MobileAuthBoundaryProps) {
  const [state, setState] = useState<AuthState>(() =>
    mobileSupabaseConfigured ? { kind: "booting" } : { kind: "configuration-error" },
  );
  const [authenticating, setAuthenticating] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const requestIdRef = useRef(0);
  const loginLockRef = useRef(false);
  const signOutLockRef = useRef(false);

  const resolveSession = useCallback(async (session: Session | null) => {
    const client = mobileSupabase;
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
        .select("role,driver_status,full_name")
        .eq("id", session.user.id)
        .maybeSingle<MobileProfileRow>();

      if (requestId !== requestIdRef.current) return;
      if (error) throw error;

      const access = classifyMobileProfile(data);
      if (access.kind === "allowed") {
        setState({
          kind: "allowed",
          identity: {
            userId: session.user.id,
            role: access.role,
            fullName: access.fullName,
            driverStatus: access.driverStatus,
          },
        });
        return;
      }

      if (access.kind === "driver-onboarding") {
        setState({
          kind: "driver-onboarding",
          fullName: access.fullName,
          driverStatus: access.driverStatus,
        });
        return;
      }

      if (access.kind === "driver-suspended") {
        setState({ kind: "driver-suspended", fullName: access.fullName });
        return;
      }

      if (access.kind === "unsupported-role") {
        setState({ kind: "unsupported-role" });
        return;
      }

      setState({ kind: "missing-profile" });
    } catch {
      if (requestId !== requestIdRef.current) return;
      setState({
        kind: "load-error",
        message: "Database profile kee mirkaneessuun hin danda'amne. Internet ilaaliitii irra deebi'i.",
      });
    }
  }, []);

  useEffect(() => {
    const client = mobileSupabase;
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
    const client = mobileSupabase;
    if (!client || loginLockRef.current) return;

    loginLockRef.current = true;
    setAuthenticating(true);
    setState({ kind: "signed-out", error: null });

    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        throw new Error("network");
      }

      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await resolveSession(data.session);
    } catch (error) {
      setState({
        kind: "signed-out",
        error: friendlyLoginError(error instanceof Error ? error.message : undefined),
      });
    } finally {
      loginLockRef.current = false;
      setAuthenticating(false);
    }
  }

  async function signOut() {
    const client = mobileSupabase;
    if (!client || signOutLockRef.current) return;

    signOutLockRef.current = true;
    setSigningOut(true);
    ++requestIdRef.current;

    try {
      await client.auth.signOut();
    } finally {
      setState({ kind: "signed-out", error: null });
      setSigningOut(false);
      signOutLockRef.current = false;
    }
  }

  async function retryProfile() {
    const client = mobileSupabase;
    if (!client) return;
    const { data, error } = await client.auth.getSession();
    if (error) {
      setState({ kind: "load-error", message: friendlyLoginError(error.message) });
      return;
    }
    await resolveSession(data.session);
  }

  if (state.kind === "configuration-error") {
    return (
      <FullScreenStatus>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-600">Configuration required</p>
        <h1 className="mt-3 text-2xl font-black">Mobile login hin qophoofne</h1>
        <p className="mt-3 text-sm leading-6 text-halo-muted">
          VITE_SUPABASE_URL fi VITE_SUPABASE_ANON_KEY mobile build environment keessatti kaa'i. Service-role key gonkumaa app keessatti hin galchin.
        </p>
      </FullScreenStatus>
    );
  }

  if (state.kind === "booting") {
    return (
      <FullScreenStatus>
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-halo-soft border-t-halo-blue" aria-hidden="true" />
        <p className="mt-4 text-sm font-bold" role="status" aria-live="polite">Account fi database role mirkaneessaa jira…</p>
      </FullScreenStatus>
    );
  }

  if (state.kind === "signed-out") {
    return <MobileLogin busy={authenticating} error={state.error} onSubmit={signIn} />;
  }

  if (state.kind === "allowed") {
    return <>{children({ identity: state.identity, signOut, signingOut })}</>;
  }

  if (state.kind === "driver-onboarding") {
    return (
      <AccessPanel
        eyebrow="Driver onboarding"
        title="Profile fi documents kee xumuri"
        description={`${state.fullName}, Jobs, Trip fi Wallet banuuf driver_status database keessatti approved ta'uu qaba. Amma status kee ${state.driverStatus ?? "pending"} dha.`}
        onSignOut={signOut}
        signingOut={signingOut}
        onRetry={retryProfile}
      />
    );
  }

  if (state.kind === "driver-suspended") {
    return (
      <AccessPanel
        eyebrow="Driver access suspended"
        title="Driver workspace yeroo ammaa cufameera"
        description={`${state.fullName}, profile kee suspended dha. Trip, payment fi audit history hin haqamu; Operations waliin qunnami.`}
        onSignOut={signOut}
        signingOut={signingOut}
      />
    );
  }

  if (state.kind === "unsupported-role") {
    return (
      <AccessPanel
        eyebrow="Workspace denied"
        title="Mobile Driver/Customer account barbaachisa"
        description="Admin, CEO fi Partner account mobile shell kana hin banu. Portal isaanii web application nageenya qabu keessatti itti fufa."
        onSignOut={signOut}
        signingOut={signingOut}
      />
    );
  }

  if (state.kind === "missing-profile") {
    return (
      <AccessPanel
        eyebrow="Profile missing"
        title="Database profile hin argamne"
        description="Auth account jiraatus profiles row kee hin argamne. Irra deebi'ii mirkaneessi ykn Operations qunnami."
        onSignOut={signOut}
        signingOut={signingOut}
        onRetry={retryProfile}
      />
    );
  }

  return (
    <AccessPanel
      eyebrow="Secure connection error"
      title="Role mirkaneessuun hin danda'amne"
      description={state.message}
      onSignOut={signOut}
      signingOut={signingOut}
      onRetry={retryProfile}
    />
  );
}
