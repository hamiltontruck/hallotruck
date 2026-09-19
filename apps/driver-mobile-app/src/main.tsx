import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Session } from "@supabase/supabase-js";
import { Login } from "./auth";
import { Splash } from "./auth/Splash";
import { DriverAccess } from "./onboarding";
import { supabase } from "./supabase";
import { DriverWorkspace } from "./App";
import "./tailwind.css";
import "./driver-v4.css";
import "./styles.css";
import "./auth.css";
import "./auth-brand.css";
import "./auth-language-compact.css";
import "./onboarding.css";
import "./auth/driver-auth.css";
function Root() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [welcome, setWelcome] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setWelcome(false), 2500);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) { setSession(data.session); setLoading(false); }
    }).catch(() => { if (active) setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) setSession(next);
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  if (loading) return <Splash />;
  if (!session && welcome) return <Splash onContinue={() => setWelcome(false)} />;
  if (!session) return <Login />;
  return <DriverAccess session={session}><DriverWorkspace userId={session.user.id} /></DriverAccess>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><Root/></StrictMode>);
