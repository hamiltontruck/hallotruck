import { ReactNode, useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { getMyDriverWorkspace, type DriverWorkspace } from "../../services/partner-driver.service";
import { supabase } from "../../services/supabase.client";
import { DriverWorkspaceContext } from "../driver/DriverWorkspaceContext";
import { DriverBottomNav } from "../driver/DriverBottomNav";

export function PartnerDriverGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [workspace, setWorkspace] = useState<DriverWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; let version = 0;
    async function check() {
      const current = ++version;
      setLoading(true); setWorkspace(null); setError("");
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const verified = data.session ? await getMyDriverWorkspace() : null;
        if (!active || current !== version) return;
        setSignedIn(Boolean(data.session)); setWorkspace(verified);
      } catch (reason) {
        if (!active || current !== version) return;
        setError(reason instanceof Error ? reason.message : "Driver workspace could not be verified.");
      } finally { if (active && current === version) setLoading(false); }
    }
    void check();
    const { data } = supabase.auth.onAuthStateChange(event => queueMicrotask(() => {
      if (!active) return;
      if (event === "TOKEN_REFRESHED") {
        const current = version;
        void getMyDriverWorkspace().then(context => {
          if (active && current === version) setWorkspace(previous => JSON.stringify(previous) === JSON.stringify(context) ? previous : context);
        }).catch(reason => { if (active && current === version) setError(reason instanceof Error ? reason.message : "Driver workspace could not be verified."); });
      } else void check();
    }));
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [retry]);
  async function signOut() {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) { setError(signOutError.message); return; }
    setWorkspace(null); setSignedIn(false);
  }
  if (loading) return <main className="p-6" role="status">Checking Partner Driver workspace…</main>;
  if (error) return <main className="space-y-4 p-6"><p role="alert">{error}</p><button onClick={() => setRetry(value => value + 1)} className="border p-3">Retry</button><button onClick={() => void signOut()} className="border p-3">Sign out</button></main>;
  if (!signedIn) return <Navigate to="/partner/driver/login" replace />;
  if (!workspace) return <main role="alert" className="p-6">Driver workspace could not be verified.</main>;
  if (workspace.kind === "hallo") return <Navigate to={workspace.driver_status === "approved" ? "/driver/jobs" : "/driver/documents"} replace />;
  if (!workspace.organization_active || workspace.driver_status === "suspended" || workspace.registration_status === "rejected") {
    return <main className="space-y-4 p-6"><h1 className="text-xl font-bold">Partner driver access is unavailable</h1><p>Contact your Partner and HALLO Admin to review your account.</p><button onClick={() => void signOut()} className="border p-3">Sign out</button></main>;
  }
  if (workspace.driver_status !== "approved" && pathname !== "/partner/driver/documents") return <Navigate to="/partner/driver/documents" replace />;
  return <DriverWorkspaceContext.Provider value={workspace}><div className="driver-mobile-flow min-h-screen bg-bone pb-24">
    <header className="flex flex-wrap items-center justify-between gap-3 bg-asphalt p-5 text-white"><div><p className="text-sm text-amber">PARTNER DRIVER</p><p className="font-bold">{workspace.partner_name}</p></div><button onClick={() => void signOut()} className="border border-white/30 p-3">Sign out</button></header>
    <nav aria-label="Partner Driver navigation" className="flex gap-3 border-b bg-white p-3"><Link className="p-3" to="/partner/driver">Home</Link><Link className="p-3" to="/partner/driver/documents">Documents</Link>{workspace.driver_status === "approved" && <Link className="p-3" to="/partner/driver/trip">Trip</Link>}</nav>
    {children}<DriverBottomNav />
  </div></DriverWorkspaceContext.Provider>;
}
