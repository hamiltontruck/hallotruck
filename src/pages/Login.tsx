import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../services/supabase.client";

export function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      if (mode === "signup") {
        if (!fullName.trim() || !phone.trim()) {
          throw new Error("Full name and phone number are required.");
        }

        const { data, error: signupError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              phone: phone.trim(),
              role: "driver",
            },
          },
        });

        if (signupError) throw signupError;

        if (data.session) {
          navigate("/jobs", { replace: true });
        } else {
          setMessage("Account created. Check your email to confirm your account.");
        }
      } else {
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (loginError) throw loginError;
        navigate("/jobs", { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-bone flex items-center justify-center px-4 py-10">
      <section className="w-full max-w-md border border-line bg-white p-6 sm:p-8">
        <div className="mb-8">
          <div className="font-display font-bold text-2xl text-asphalt">
            HALLO<span className="text-amber">TRUCK</span>
            <span className="font-mono text-xs text-steel ml-2">DRIVER</span>
          </div>
          <div className="route-line mt-4" />
        </div>

        <h1 className="font-display font-bold text-2xl text-asphalt">
          {mode === "login" ? "Driver login" : "Create driver account"}
        </h1>

        <p className="font-body text-sm text-steel mt-2 mb-6">
          {mode === "login"
            ? "Sign in to view available loads and manage trips."
            : "Register as a Hallo Truck driver."}
        </p>

        {error && (
          <div className="border border-route/50 bg-route/5 text-route px-4 py-3 text-sm mb-5">
            {error}
          </div>
        )}

        {message && (
          <div className="border border-amber bg-amber/10 text-asphalt px-4 py-3 text-sm mb-5">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <>
              <label className="block">
                <span className="font-body text-sm text-asphalt">Full name</span>
                <input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="mt-1 w-full border border-line px-4 py-3 font-body outline-none focus:border-route"
                  autoComplete="name"
                  required
                />
              </label>

              <label className="block">
                <span className="font-body text-sm text-asphalt">Phone number</span>
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className="mt-1 w-full border border-line px-4 py-3 font-body outline-none focus:border-route"
                  placeholder="+251..."
                  autoComplete="tel"
                  required
                />
              </label>
            </>
          )}

          <label className="block">
            <span className="font-body text-sm text-asphalt">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full border border-line px-4 py-3 font-body outline-none focus:border-route"
              autoComplete="email"
              required
            />
          </label>

          <label className="block">
            <span className="font-body text-sm text-asphalt">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full border border-line px-4 py-3 font-body outline-none focus:border-route"
              minLength={6}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />
          </label>

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-route text-bone font-display font-semibold px-6 py-3 disabled:opacity-50"
          >
            {busy
              ? "Please wait…"
              : mode === "login"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError(null);
            setMessage(null);
          }}
          className="w-full mt-5 font-body text-sm text-steel underline"
        >
          {mode === "login"
            ? "New driver? Create an account"
            : "Already registered? Sign in"}
        </button>
      </section>
    </main>
  );
}
