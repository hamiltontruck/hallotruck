import { FormEvent, ReactNode, useEffect, useState } from "react";
import { supabase } from "../../services/supabase.client";

export function PasswordRecoveryGate({ children }: { children: ReactNode }) {
  const [recovering, setRecovering] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setRecovering(true);
        setSuccess(false);
        setError("");
      }
    });

    // Supabase may restore the recovery session before the listener is attached.
    // The URL token is a reliable fallback for the implicit recovery flow.
    const hash = window.location.hash;
    if (hash.includes("type=recovery") || hash.includes("access_token=")) {
      setRecovering(true);
    }

    return () => data.subscription.unsubscribe();
  }, []);

  async function updatePassword(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The two passwords do not match.");
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setSuccess(true);
  }

  if (!recovering) return <>{children}</>;

  return (
    <main className="min-h-screen bg-asphalt text-white grid place-items-center p-6">
      <section className="w-full max-w-md bg-white text-asphalt p-7 sm:p-10">
        <span className="inline-flex h-12 w-12 items-center justify-center bg-amber font-display font-bold">HT</span>
        <h1 className="mt-7 font-display text-3xl font-bold">Set a new password</h1>
        <p className="mt-2 text-sm text-steel">Create a new password for your HALLOTRUCK account.</p>

        {success ? (
          <div className="mt-6">
            <p className="border border-emerald-700/30 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">Password updated successfully.</p>
            <button
              type="button"
              onClick={() => {
                window.history.replaceState({}, document.title, `${window.location.pathname}#/admin`);
                setRecovering(false);
              }}
              className="mt-5 w-full bg-asphalt py-4 font-semibold text-white"
            >
              Continue to Admin login
            </button>
          </div>
        ) : (
          <form onSubmit={updatePassword}>
            {error && <p className="mt-5 border border-route/30 bg-route/10 p-3 text-sm text-route">{error}</p>}
            <label className="mt-7 mb-2 block text-xs font-semibold">New password</label>
            <input
              required
              minLength={8}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full border border-asphalt/20 px-4 py-3 outline-none focus:border-amber"
            />
            <label className="mt-5 mb-2 block text-xs font-semibold">Confirm new password</label>
            <input
              required
              minLength={8}
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full border border-asphalt/20 px-4 py-3 outline-none focus:border-amber"
            />
            <button disabled={saving} className="mt-7 w-full bg-asphalt py-4 font-semibold text-white disabled:opacity-60">
              {saving ? "Updating password…" : "Update password"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
