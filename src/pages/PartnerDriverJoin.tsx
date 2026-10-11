import { FormEvent, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { createPartnerDriverSignupClient, validatePartnerDriverSignup } from "../services/partner-driver.service";

export function PartnerDriverJoin() {
  const [params] = useSearchParams(); const token = params.get("token") ?? "";
  const [client] = useState(createPartnerDriverSignupClient);
  const [login, setLogin] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [complete, setComplete] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(""); setMessage("");
    try {
      const password=String(form.get("password"));
      const input=validatePartnerDriverSignup(String(form.get("email")),String(form.get("phone")),password);
      const validation=await client.rpc("validate_partner_driver_registration", { p_token:token,p_email:input.email,p_phone:input.phone });
      if (validation.error) throw new Error(validation.error.message);
      if (validation.data!==true) throw new Error("Registration link is closed, expired, or the email/phone does not match your Partner's registration.");
      const response = login ? await client.auth.signInWithPassword({ email: input.email, password }) :
        await client.auth.signUp({ email: input.email, password, options: { data: { role: "driver", full_name: String(form.get("name")).trim(), phone: input.phone } } });
      if (response.error) throw response.error;
      if (!response.data.session) { setLogin(true); setMessage("Confirm your email, then return to this registration link and sign in to finish joining your Partner."); return; }
      const { error: claimError } = await client.rpc("claim_partner_driver_registration", { p_token: token });
      if (claimError) { setLogin(true); throw new Error(claimError.message); }
      await client.auth.signOut(); setComplete(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Registration could not be completed."); }
    finally { setBusy(false); }
  }
  return <main className="min-h-screen bg-bone p-5 text-asphalt"><section className="mx-auto max-w-lg space-y-5 rounded-2xl bg-white p-6">
    <h1 className="font-display text-2xl font-bold">Join your Partner as a driver</h1>
    <p>Use the email and phone your Partner registered. Set your own six-digit driver PIN. HALLO document verification and Admin approval are required before work.</p>
    {error && <p role="alert" className="text-route">{error}</p>}{message && <p role="status">{message}</p>}
    {complete ? <><p role="status">Registration completed. Your Partner can now see your pending driver account. Ask HALLO Admin to link your Partner truck before entering vehicle details, then sign in to upload documents.</p><a href="https://hamiltontruck.github.io/hallotruck/#/driver/login" className="block border p-4 font-semibold">Open Driver login to complete documents</a></> :
      token && /^[0-9a-f-]{36}$/i.test(token) ? <form onSubmit={submit} className="space-y-4">
        {!login && <label className="block">Full name<input name="name" required minLength={2} className="mt-1 min-h-12 w-full border px-3" /></label>}
        <label className="block">Email<input name="email" type="email" autoComplete="email" required className="mt-1 min-h-12 w-full border px-3" /></label>
        <label className="block">Phone<input name="phone" type="tel" required className="mt-1 min-h-12 w-full border px-3" /></label>
        <label className="block">Six-digit driver PIN<input name="password" type="password" inputMode="numeric" pattern="[0-9]{6}" autoComplete={login ? "current-password" : "new-password"} required className="mt-1 min-h-12 w-full border px-3" /></label>
        <button disabled={busy} className="min-h-12 w-full bg-asphalt p-3 text-white disabled:opacity-40">{busy ? "Please wait…" : login ? "Sign in and complete registration" : "Create my driver account"}</button>
        <button type="button" disabled={busy} onClick={() => { setLogin(!login); setError(""); }} className="min-h-12 underline">{login ? "Create a new account" : "I already signed up with this registration"}</button>
      </form> : <p role="alert">Use the private registration link provided by your Partner.</p>}
  </section></main>;
}
