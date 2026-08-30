import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { supabase } from "../../services/supabase.client";

export function CustomerGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "allowed" | "signed-out" | "wrong-role">("loading");

  useEffect(() => {
    let active = true;

    async function check() {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!active) return;

      if (!user) {
        setState("signed-out");
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (!active) return;
      setState(!error && profile?.role === "customer" ? "allowed" : "wrong-role");
    }

    void check();
    const { data } = supabase.auth.onAuthStateChange(() => void check());
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  if (state === "loading") {
    return <div className="min-h-screen bg-bone grid place-items-center font-mono text-sm text-steel">Checking customer session…</div>;
  }
  if (state === "signed-out") return <Navigate to="/customer/login" replace />;
  if (state === "allowed") return <>{children}</>;

  return (
    <main className="min-h-screen bg-bone grid place-items-center p-5">
      <section className="w-full max-w-md border border-line bg-white p-7">
        <h1 className="font-display text-2xl font-bold">Customer account required</h1>
        <p className="mt-3 text-sm text-steel">The active account belongs to another HALLOTRUCK workspace.</p>
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            navigate("/customer/login", { replace: true });
          }}
          className="mt-6 w-full bg-asphalt py-4 font-semibold text-white"
        >
          Switch to customer login
        </button>
        <Link to="/" className="mt-5 block text-center text-xs text-steel">Choose another portal</Link>
      </section>
    </main>
  );
}
