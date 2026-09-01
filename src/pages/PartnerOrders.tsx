import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getCurrentPartnerMemberships, type PartnerMembership } from "../services/partner.service";
import { listPartnerOrders, type PartnerOrder } from "../services/partner-order.service";

const groups = ["all","draft","submitted","active","completed","cancelled"] as const;
type Group = typeof groups[number];
const active = new Set(["under_review","quoted","approved","placed","assigned","accepted","in_transit","delivered"]);

export function PartnerOrders() {
  const [params, setParams] = useSearchParams();
  const [memberships, setMemberships] = useState<PartnerMembership[]>([]);
  const [partnerId, setPartnerId] = useState("");
  const [orders, setOrders] = useState<PartnerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const group = (groups.includes(params.get("status") as Group) ? params.get("status") : "all") as Group;

  useEffect(() => { void (async () => {
    try {
      const next = await getCurrentPartnerMemberships();
      const requested = params.get("organization");
      const selected = next.some((item) => item.partner_id===requested) ? requested! : next[0]?.partner_id ?? "";
      setMemberships(next); setPartnerId(selected);
      if (selected) setOrders(await listPartnerOrders(selected));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Partner orders could not be loaded."); }
    finally { setLoading(false); }
  })(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => orders.filter((order) => group==="all" || order.status===group || (group==="active" && active.has(order.status)) || (group==="cancelled" && ["cancelled","rejected","expired"].includes(order.status))), [group,orders]);
  const membership = memberships.find((item) => item.partner_id===partnerId);
  const canCreate = ["owner","admin"].includes(membership?.member_role ?? "");
  const withOrganization = (path: string) => partnerId ? `${path}${path.includes("?")?"&":"?"}organization=${encodeURIComponent(partnerId)}` : path;

  return <main className="min-h-screen overflow-x-hidden bg-[#f5f3ed] text-asphalt">
    <header className="bg-asphalt px-4 py-7 text-white sm:px-7"><div className="mx-auto flex max-w-6xl flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0"><p className="font-mono text-[10px] tracking-[.22em] text-amber">PARTNER ORDER CONTROL</p><h1 className="mt-2 break-words font-display text-3xl font-bold sm:text-4xl">Freight orders</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">Create, submit and track your organization’s freight work without replacing HALLO’s Admin-to-Partner dispatch flow.</p></div>{canCreate&&<Link to={withOrganization("/partner/orders/new")} className="min-h-12 shrink-0 bg-amber px-5 py-3 text-center text-sm font-bold text-asphalt">New Partner order</Link>}</div></header>
    <section className="mx-auto max-w-6xl px-4 py-5 sm:px-7">
      {error&&<p className="mb-4 border border-route/30 bg-route/5 p-4 text-sm text-route">{error}</p>}
      <div className="mb-5 flex gap-2 overflow-x-auto pb-2" aria-label="Partner order status filters">{groups.map((item)=><button key={item} onClick={()=>{params.set("status",item);setParams(params);}} className={`min-h-11 whitespace-nowrap border px-4 text-xs font-semibold capitalize ${group===item?"border-asphalt bg-asphalt text-white":"border-asphalt/15 bg-white"}`}>{item}</button>)}</div>
      {loading?<p className="bg-white p-10 text-center text-sm text-steel">Loading Partner orders…</p>:visible.length===0?<div className="border border-asphalt/10 bg-white p-8 text-center"><h2 className="font-display text-xl font-bold">No {group==="all"?"Partner":group} orders</h2><p className="mt-2 text-sm text-steel">Orders in this workspace remain isolated to the selected active Partner organization.</p></div>:<div className="grid gap-4 md:grid-cols-2">{visible.map((order)=><Link key={order.id} to={withOrganization(`/partner/orders/${order.id}`)} className="min-w-0 border border-asphalt/10 bg-white p-5 transition hover:border-amber"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-[10px] text-steel">{order.reference}</p><h2 className="mt-2 break-words font-display text-xl font-bold">{order.pickup_location.city||"Pickup pending"} → {order.dropoff_location.city||"Destination pending"}</h2></div><span className="shrink-0 bg-bone px-2 py-1 text-[10px] font-bold uppercase">{order.status.replaceAll("_"," ")}</span></div><p className="mt-4 text-sm text-steel">{order.cargo.description||"Cargo details not added"}</p><p className="mt-3 text-xs font-semibold text-amber-dim">Open order →</p></Link>)}</div>}
    </section>
  </main>;
}
