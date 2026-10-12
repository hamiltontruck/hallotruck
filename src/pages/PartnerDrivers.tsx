import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getCurrentPartnerMemberships, type PartnerMembership } from "../services/partner.service";
import { PartnerDriversPanel } from "../components/partner/PartnerDriversPanel";
import { getPartnerDriverRoster, type DriverRosterRow } from "../services/partner-driver.service";

export function PartnerDrivers() {
  const [params] = useSearchParams(); const [memberships, setMemberships] = useState<PartnerMembership[]>([]);
  const [partnerId, setPartnerId] = useState(""); const [rows, setRows] = useState<DriverRosterRow[]>([]); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  useEffect(() => { let active = true; void getCurrentPartnerMemberships().then(data => {
    if (!active) return; const managed = data.filter(row => ["owner", "admin"].includes(row.member_role)); setMemberships(managed);
    const requested = params.get("organization"); setPartnerId(managed.find(row => row.partner_id === requested)?.partner_id ?? managed[0]?.partner_id ?? ""); setLoading(false);
  }).catch(reason => { if (active) { setError(reason.message); setLoading(false); } }); return () => { active = false; }; }, []);
  useEffect(() => { let active = true; setRows([]); if (partnerId) void getPartnerDriverRoster(partnerId).then(data => { if (active) setRows(data); }).catch(reason => { if (active) setError(reason.message); }); return () => { active = false; }; }, [partnerId]);
  return <main className="mx-auto max-w-5xl space-y-5 p-5"><h1 className="text-3xl font-bold">Your Partner drivers</h1>{error && <p role="alert">{error}</p>}{loading ? <p>Loading drivers…</p> : !partnerId ? <p>Active Partner owner or admin access is required.</p> : <><label>Partner organization<select className="block border p-3" value={partnerId} onChange={event => setPartnerId(event.target.value)}>{memberships.map(row => <option key={row.partner_id} value={row.partner_id}>{row.partner_organizations?.name ?? "Partner organization"}</option>)}</select></label><PartnerDriversPanel key={partnerId} partnerId={partnerId} /><section aria-label="Registered Partner drivers" className="space-y-3">{rows.map(row => <article key={row.id} className="border bg-white p-4"><h2 className="font-bold">{row.full_name}</h2><p>{row.partner_name} · {row.driver_status}</p><p>Vehicle: {row.plate_number ?? "Awaiting Admin vehicle link"}</p></article>)}</section></>}</main>;
}
