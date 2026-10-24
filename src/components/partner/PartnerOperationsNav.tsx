import { NavLink } from "react-router-dom";
import type { PartnerMembership } from "../../services/partner.service";

export function partnerPath(path: string, partnerId: string, extra?: Record<string, string>) {
  const query = new URLSearchParams(extra); if (partnerId) query.set("organization", partnerId);
  return `${path}${query.size ? `?${query}` : ""}`;
}
export function PartnerOperationsNav({ partnerId, canManageDrivers }: { partnerId: string; canManageDrivers: boolean }) {
  const links = [["Dashboard", "/partner"], ["Live map", "/partner/live"], ...(canManageDrivers ? [["Drivers", "/partner/drivers"]] : []), ["Jobs & assignments", "/partner/jobs"], ["Partner orders", "/partner/orders"], ["Workspace", "/partner/workspace"]];
  return <nav aria-label="Partner operations" className="border-b border-white/15 bg-asphalt px-4 py-3 text-white"><div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2"><span className="mr-auto py-2 font-mono text-[10px] tracking-[.18em] text-amber">HALLO PARTNER</span>{links.map(([label, path]) => <NavLink key={path} to={partnerPath(path, partnerId)} end className={({ isActive }) => `min-h-11 border px-3 py-3 text-xs font-semibold ${isActive ? "border-amber bg-white/10 text-amber" : "border-white/20 text-white"}`}>{label}</NavLink>)}</div></nav>;
}
export function PartnerOrganizationSelect({ memberships, partnerId, onChange }: { memberships: PartnerMembership[]; partnerId: string; onChange: (id: string) => void }) {
  return memberships.length > 1 ? <label className="block text-xs font-semibold">Organization<select value={partnerId} onChange={event => onChange(event.target.value)} className="mt-2 block min-h-11 max-w-full border border-asphalt/20 bg-white px-3 text-sm text-asphalt">{memberships.map(row => <option key={row.partner_id} value={row.partner_id}>{row.partner_organizations?.name ?? row.partner_id}</option>)}</select></label> : null;
}
