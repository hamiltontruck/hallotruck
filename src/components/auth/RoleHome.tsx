import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../services/supabase.client";
import { AdminGate } from "./AdminGate";

export function RoleHome({ children }: { children: ReactNode }) {
  const [profileRole, setProfileRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function check(nextSession: Session | null) {
      if (!active) return;
      setLoading(true);
      setProfileRole(null);

      if (!nextSession) {
        setLoading(false);
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", nextSession.user.id)
        .maybeSingle();

      if (!active) return;
      setProfileRole(!error ? profile?.role ?? null : null);
      setLoading(false);
    }

    supabase.auth.getSession().then(({ data }) => void check(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void check(nextSession);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-asphalt grid place-items-center text-amber font-mono text-sm">
        Opening secure workspace…
      </div>
    );
  }

  if (profileRole === "driver") {
    return <Navigate to="/driver/jobs" replace />;
  }

  return <AdminGate>{children}</AdminGate>;
}
