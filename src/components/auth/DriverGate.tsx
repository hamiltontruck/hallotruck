import { ReactNode, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "../../services/supabase.client";

export function DriverGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    function check(session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]) {
      setSignedIn(Boolean(session));
      setRole(session?.user.app_metadata?.role ?? null);
      setLoading(false);
    }
    supabase.auth.getSession().then(({ data }) => check(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => check(session));
    return () => data.subscription.unsubscribe();
  }, []);

  async function switchAccount() {
    setLoading(true);
    await supabase.auth.signOut();
    navigate("/driver/login", { replace: true });
  }

  if (loading) return <div className="min-h-screen bg-bone grid place-items-center text-steel font-mono text-sm">Checking driver session…</div>;
  if (!signedIn) return <Navigate to="/driver/login" replace />;
  if (role === "driver") return <>{children}</>;

  return <main className="min-h-screen bg-bone grid place-items-center p-5"><section className="bg-white border border-line p-7 max-w-md w-full"><p className="font-display font-bold text-2xl">Driver account required</p><p className="font-body text-sm text-steel mt-3">An Admin/CEO session is active in this browser. Sign it out before opening the driver workspace.</p><button onClick={switchAccount} className="w-full bg-asphalt text-white py-4 mt-6 font-semibold">Switch to driver login</button><a href="#/" className="block text-center text-xs text-steel mt-5">Return to Admin</a></section></main>;
}
