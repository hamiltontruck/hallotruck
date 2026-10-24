import { FormEvent, useCallback, useEffect, useState } from "react";
import { addPartnerDriver, listPartnerDrivers, partnerDriverJoinUrl, type PartnerDriverRegistration } from "../../services/partner-driver.service";

export function PartnerDriversPanel({ partnerId, showRegistrations = true, onChanged }: { partnerId: string; showRegistrations?: boolean; onChanged?: () => void }) {
  const [rows, setRows] = useState<PartnerDriverRegistration[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => { if (showRegistrations) setRows(await listPartnerDrivers(partnerId)); }, [partnerId, showRegistrations]);
  useEffect(() => { setRows([]); setNotice(""); setError(""); void load().catch(reason => setError(reason.message)); }, [load]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget;
    const values = new FormData(form); setBusy(true); setError(""); setNotice("");
    try {
      await addPartnerDriver(partnerId, String(values.get("name")), String(values.get("email")), String(values.get("phone")));
      await load(); onChanged?.(); form.reset(); setNotice("Driver registration created. Share the private registration link with this driver. HALLO approval is required before work.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Driver registration failed."); }
    finally { setBusy(false); }
  }
  return <section aria-label="Partner drivers" className="space-y-4 rounded-2xl border border-asphalt/10 bg-white p-4 sm:p-5">
    <h3 className="font-display text-xl font-bold">Partner drivers</h3>
    <p className="text-sm text-steel">Add your own drivers. Each driver sets their own password and completes documents; HALLO Admin verifies and approves them.</p>
    {error && <p role="alert" className="text-route">{error}</p>}
    {notice && <p role="status" className="text-emerald-800">{notice}</p>}
    <details><summary className="cursor-pointer py-3 font-semibold">Add driver</summary>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
        <label>Full name<input name="name" required minLength={2} maxLength={120} className="mt-1 min-h-12 w-full border px-3" /></label>
        <label>Email<input name="email" type="email" required className="mt-1 min-h-12 w-full border px-3" /></label>
        <label>Phone<input name="phone" type="tel" required placeholder="09… or +2519…" className="mt-1 min-h-12 w-full border px-3" /></label>
        <button disabled={busy} className="min-h-12 bg-asphalt px-4 text-white disabled:opacity-40 sm:col-span-3">{busy ? "Creating registration…" : "Create driver registration"}</button>
      </form>
    </details>
    {showRegistrations && <div className="space-y-3">{rows.map(row => <article key={row.id} className="space-y-2 border p-3">
      <p className="font-bold">{row.full_name}</p><p className="break-all text-sm">{row.email} · {row.phone}</p>
      <p className="text-sm">Registration: {row.status} · Driver approval: {row.driver_status ?? "Waiting for signup"}</p>
      {row.review_note && <p className="text-sm">HALLO review: {row.review_note}</p>}
      {row.token && <label className="block text-sm">Private driver registration link<input readOnly value={partnerDriverJoinUrl(row.token)} onFocus={event => event.currentTarget.select()} className="mt-1 min-h-12 w-full border px-3" /><span className="block text-xs text-steel">Share only with this driver. Expires {new Date(row.expires_at).toLocaleDateString()}.</span></label>}
    </article>)}{rows.length === 0 && <p className="text-sm text-steel">No Partner driver registrations yet.</p>}</div>}
  </section>;
}
