import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../services/supabase.client";
import { AdminGate } from "./AdminGate";

export function RoleHome({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    function check(nextSession: Session | null) {
      setSession(nextSession);
      setLoading(false);
    }

    supabase.auth.getSession().then(({ data }) => check(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => check(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-asphalt grid place-items-center text-amber font-mono text-sm">
        Opening secure workspace…
      </div>
    );
  }

  if (session?.user.app_metadata?.role === "driver") {
    return <Navigate to="/driver/jobs" replace />;
  }

  return <AdminGate>{children}</AdminGate>;
}
