import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../services/supabase.client";
import { getMyDriverWorkspace } from "../services/partner-driver.service";
import { requireValidEmail } from "../domain/contact-validation";
import { requestPasswordResetEmail } from "../services/password-recovery.service";

export function PartnerDriverLogin() {
  const navigate = useNavigate(); const [error, setError] = useState("");
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  async function routeDriver() {
    const workspace = await getMyDriverWorkspace();
    navigate(workspace.kind === "partner" ? "/partner/driver" : workspace.driver_status === "approved" ? "/driver/jobs" : "/driver/documents", { replace: true });
  }
  useEffect(() => { let active = true;
    void supabase.auth.getSession().then(async ({ data }) => { if (active && data.session) await routeDriver(); }).catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter); setError(""); setNotice(""); setBusy(true);
    try {
      const email = requireValidEmail(String(form.get("email")));
      if (form.get("action") === "recover") { await requestPasswordResetEmail(email); setNotice("Check your email for the secure password recovery link."); return; }
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password: String(form.get("pin")) });
      if (loginError) throw loginError; await routeDriver();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Driver sign-in failed."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-lg space-y-5 p-6"><h1 className="text-3xl font-bold">Partner Driver login</h1><p>Use your own driver email and PIN. Your Partner invitation must be completed first.</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <form onSubmit={submit} className="space-y-4"><label className="block">Email<input name="email" type="email" required autoComplete="email" className="block min-h-12 w-full border p-3" /></label><label className="block">Six-digit driver PIN<input name="pin" type="password" inputMode="numeric" autoComplete="current-password" className="block min-h-12 w-full border p-3" /></label><button disabled={busy} className="min-h-12 w-full bg-asphalt p-3 text-white">Open Partner Driver workspace</button><button name="action" value="recover" disabled={busy} className="min-h-12 border p-3">Forgot PIN?</button></form>
    <button onClick={() => void supabase.auth.signOut().then(() => { setError(""); setNotice("Account signed out. Sign in with your driver account."); })} className="border p-3">Switch account</button>
  </main>;
}
