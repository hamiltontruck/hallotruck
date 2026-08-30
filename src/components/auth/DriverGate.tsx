import { ReactNode, useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../../services/supabase.client";

export function DriverGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [driverStatus, setDriverStatus] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;

    async function check(session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]) {
      if (!active) return;
      setSignedIn(Boolean(session));
      const nextRole = session?.user.app_metadata?.role ?? null;
      setRole(nextRole);
      setDriverStatus(null);

      if (session && nextRole === "driver") {
        const { data } = await supabase
          .from("profiles")
          .select("driver_status")
          .eq("id", session.user.id)
          .maybeSingle();
        if (active) setDriverStatus(data?.driver_status ?? null);
      }

      if (active) setLoading(false);
    }

    supabase.auth.getSession().then(({ data }) => void check(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoading(true);
      void check(session);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  async function switchAccount() {
    setLoading(true);
    await supabase.auth.signOut();
    navigate("/driver/login", { replace: true });
  }

  if (loading) return <div className="min-h-screen bg-bone grid place-items-center text-steel font-mono text-sm">Checking driver session…</div>;
  if (!signedIn) return <Navigate to="/driver/login" replace />;

  if (role === "driver" && driverStatus === "suspended") {
    return <main className="min-h-screen bg-bone grid place-items-center p-5"><section className="bg-white border border-line p-7 max-w-md w-full"><p className="font-mono text-[10px] uppercase tracking-[.18em] text-route">Driver access suspended</p><p className="font-display font-bold text-2xl mt-2">This driver profile is inactive</p><p className="font-body text-sm text-steel mt-3">Hallo Truck Operations removed this driver from the active roster. Existing trip, payment and compliance history is preserved for audit purposes.</p><button onClick={switchAccount} className="w-full bg-asphalt text-white py-4 mt-6 font-semibold">Sign out</button></section></main>;
  }

  if (role === "driver" && driverStatus !== "approved" && location.pathname !== "/driver/documents") {
    return <main className="min-h-screen bg-bone grid place-items-center p-5"><section className="bg-white border border-line p-7 max-w-md w-full"><p className="font-mono text-[10px] uppercase tracking-[.18em] text-amber-dim">Smart driver onboarding</p><p className="font-display font-bold text-2xl mt-2">Complete your driver and vehicle profile</p><p className="font-body text-sm text-steel mt-3">Your approved identity documents stay saved. Add the vehicle plate, type and ton capacity, then upload the seven required vehicle documents and photos. Jobs, Trip and Earnings open after Admin verifies the remaining items.</p><button onClick={() => navigate("/driver/documents", { replace: true })} className="w-full bg-route text-white py-4 mt-6 font-semibold">Continue onboarding</button><button onClick={switchAccount} className="w-full border border-asphalt/20 text-asphalt py-3 mt-3 font-semibold">Sign out</button></section></main>;
  }

  if (role === "driver") return <>{children}</>;

  return <main className="min-h-screen bg-bone grid place-items-center p-5"><section className="bg-white border border-line p-7 max-w-md w-full"><p className="font-display font-bold text-2xl">Driver account required</p><p className="font-body text-sm text-steel mt-3">An Admin/CEO session is active in this browser. Sign it out before opening the driver workspace.</p><button onClick={switchAccount} className="w-full bg-asphalt text-white py-4 mt-6 font-semibold">Switch to driver login</button><Link to="/" className="block text-center text-xs text-steel mt-5">Return to Admin</Link></section></main>;
}
