import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { buildAdminIntelligenceReport, searchAdminIntelligence, type AdminIntelligenceData, type AdminReportRange } from "../domain/admin-intelligence";
import { getAdminIntelligenceV2, type AdminIntelligenceV2 } from "../services/admin-intelligence-v2.service";
import { supabase } from "../services/supabase.client";

const RANGE_LABELS: Record<AdminReportRange, string> = { today:"Today", "7d":"Last 7 days", "30d":"Last 30 days", "90d":"Last 90 days", all:"All time" };
const SEARCH_PAGE_SIZE = 6;

function isReportRange(value:string|null): value is AdminReportRange { return value === "today" || value === "7d" || value === "30d" || value === "90d" || value === "all"; }
function money(value:number) { return `ETB ${Math.max(0, value).toLocaleString(undefined,{maximumFractionDigits:0})}`; }
function target(path:string, query:string) { return `${path}${path.includes("?") ? "&" : "?"}q=${encodeURIComponent(query)}`; }

function fixtureResult(data:AdminIntelligenceData, range:AdminReportRange, query:string, page:number):AdminIntelligenceV2 {
  const report = buildAdminIntelligenceReport(data, range);
  const results = searchAdminIntelligence(data, query);
  const offset = (page - 1) * SEARCH_PAGE_SIZE;
  const slice = <T,>(rows:T[]) => rows.slice(offset, offset + SEARCH_PAGE_SIZE);
  return {
    range, generatedAt:new Date().toISOString(),
    coverage:{orders:data.orders.length,customers:data.customers.length,drivers:data.drivers.length,trucks:data.trucks.length,payments:data.payments.length},
    report:{
      orderCount:report.orders.length, deliveredCount:report.delivered.length, cancelledCount:report.cancelled.length, activeCount:report.active.length, unassignedCount:report.unassigned.length,
      invoiceEtb:report.invoiceEtb, averageOrderEtb:report.averageOrderEtb, completionRate:report.completionRate, released:report.released, refunded:report.refunded, netRevenue:report.netRevenue,
      pendingCount:report.pending.length, pendingEtb:report.pendingEtb, heldCount:report.heldEscrow.length, escrowEtb:report.escrowEtb, customerCount:report.customers.length, totalCustomers:data.customers.length,
      approvedDrivers:report.approvedDrivers, availableTrucks:report.availableTrucks, fleetUtilization:report.fleetUtilization, attentionCount:report.attentionCount,
      topRoutes:report.topRoutes.map(x=>({route:x.route,orders:x.orders,delivered:x.delivered,invoice_etb:x.invoiceEtb})), statusBreakdown:report.statusBreakdown,
      providerBreakdown:report.providerBreakdown.map(x=>({provider:x.provider,records:x.records,amount_etb:x.amountEtb})), revenueTrend:report.revenueTrend,
    },
    search:{ query, limit:SEARCH_PAGE_SIZE, offset, total:results.total,
      counts:{orders:results.orders.length,customers:results.customers.length,drivers:results.drivers.length,trucks:results.trucks.length,payments:results.payments.length},
      rows:{
        orders:slice(results.orders), customers:slice(results.customers), drivers:slice(results.drivers), trucks:slice(results.trucks),
        payments:slice(results.payments).map(({payment,order,driver})=>({...payment,tracking_id:order?.tracking_id ?? null,customer_name:order?.customer_name ?? null,customer_phone:order?.customer_phone ?? null,pickup_address:order?.pickup_address ?? null,dropoff_address:order?.dropoff_address ?? null,driver_id:order?.driver_id ?? null,driver_name:driver?.full_name ?? null,driver_phone:driver?.phone ?? null})),
      }
    }
  };
}

export function AdminIntelligence({ fixture=null }:{ fixture?:AdminIntelligenceData|null }={}) {
  const [params,setParams] = useSearchParams();
  const range = isReportRange(params.get("range")) ? params.get("range") as AdminReportRange : "30d";
  const query = params.get("q") ?? "";
  const searchPage = Math.max(1, Number(params.get("search_page") || 1) || 1);
  const [draftQuery,setDraftQuery] = useState(query);
  const [data,setData] = useState<AdminIntelligenceV2|null>(fixture ? fixtureResult(fixture,range,query,searchPage) : null);
  const [loading,setLoading] = useState(!fixture);
  const [error,setError] = useState("");

  useEffect(()=>setDraftQuery(query),[query]);

  const load = useCallback(async()=>{
    setLoading(true);
    try {
      setData(fixture ? fixtureResult(fixture,range,query,searchPage) : await getAdminIntelligenceV2({range,query,searchPage,searchLimit:SEARCH_PAGE_SIZE}));
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Admin intelligence data could not be loaded."); }
    finally { setLoading(false); }
  },[fixture,range,query,searchPage]);

  useEffect(()=>{ void load(); },[load]);
  useEffect(()=>{
    if (fixture) return;
    let timer:number|undefined;
    const queue=()=>{ window.clearTimeout(timer); timer=window.setTimeout(()=>void load(),600); };
    const channel=supabase.channel("admin-intelligence-v2-live")
      .on("postgres_changes",{event:"*",schema:"public",table:"orders"},queue)
      .on("postgres_changes",{event:"*",schema:"public",table:"payments"},queue)
      .on("postgres_changes",{event:"*",schema:"public",table:"customers"},queue)
      .on("postgres_changes",{event:"*",schema:"public",table:"profiles"},queue)
      .on("postgres_changes",{event:"*",schema:"public",table:"trucks"},queue).subscribe();
    return()=>{ window.clearTimeout(timer); void supabase.removeChannel(channel); };
  },[fixture,load]);

  function update(next:{q?:string;range?:AdminReportRange;page?:number}) {
    const p=new URLSearchParams(params);
    if (next.q !== undefined) { next.q.trim() ? p.set("q",next.q.trim()) : p.delete("q"); p.delete("search_page"); }
    if (next.range !== undefined) { next.range === "30d" ? p.delete("range") : p.set("range",next.range); }
    if (next.page !== undefined) { next.page <= 1 ? p.delete("search_page") : p.set("search_page",String(next.page)); }
    setParams(p,{replace:true});
  }
  function submitSearch(e:FormEvent){ e.preventDefault(); update({q:draftQuery}); }

  const report=data?.report;
  const search=data?.search;
  const maxTrend=Math.max(1,...(report?.revenueTrend ?? []).map(x=>x.amountEtb));
  const maxStatus=Math.max(1,...(report?.statusBreakdown ?? []).map(x=>x.count));
  const searchPages=search ? Math.max(1,Math.ceil(Math.max(search.counts.orders,search.counts.customers,search.counts.drivers,search.counts.trucks,search.counts.payments)/search.limit)) : 1;
  const signals=report ? [
    {label:"Orders need assignment",value:report.unassignedCount,detail:"Missing driver or truck",to:"/admin/order-queue?queue=unassigned",alert:report.unassignedCount>0},
    {label:"Payments need verification",value:report.pendingCount,detail:money(report.pendingEtb),to:"/admin/payment-review",alert:report.pendingCount>0},
    {label:"Funds held in escrow",value:report.heldCount,detail:money(report.escrowEtb),to:"/admin/payment-review",alert:report.heldCount>0},
  ] : [];

  return <main className="min-h-screen overflow-x-hidden bg-[#f5f3ed] p-3 pb-24 text-asphalt sm:p-6 lg:p-8"><div className="mx-auto max-w-[1500px]">
    <header className="relative overflow-hidden bg-asphalt p-5 text-white sm:p-8 lg:p-10"><div className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full border-[58px] border-amber/10"/><div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between"><div><div className="flex flex-wrap gap-2"><span className="font-mono text-[10px] tracking-[.22em] text-amber">ADMIN INTELLIGENCE V2</span><span className="border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 font-mono text-[9px] text-emerald-300">● DB REPORTING</span></div><h1 className="mt-4 font-display text-[clamp(2rem,9vw,3.5rem)] font-bold leading-[1.05]">Search everything.<br className="hidden sm:block"/> Decide faster.</h1><p className="mt-4 max-w-3xl text-sm leading-6 text-white/60">KPIs, trends and global search are computed in PostgreSQL. The browser no longer downloads full operational history.</p></div><div className="flex flex-wrap gap-2"><Link to="/admin" className="border border-white/20 px-4 py-3 text-sm font-semibold">CEO overview</Link><button onClick={()=>void load()} className="bg-amber px-4 py-3 text-sm font-semibold text-asphalt">↻ Refresh</button></div></div></header>
    {error&&<p role="alert" className="mt-4 border border-route/30 bg-route/10 p-4 text-sm text-route">{error}</p>}

    <section className="border border-asphalt/10 bg-white p-4 shadow-sm sm:p-6"><div className="grid gap-4 lg:grid-cols-[1fr_220px]"><form onSubmit={submitSearch} className="min-w-0"><span className="text-[10px] font-semibold uppercase tracking-[.14em] text-steel">Global search</span><div className="mt-2 flex min-w-0 border-2 border-asphalt"><input value={draftQuery} onChange={e=>setDraftQuery(e.target.value)} className="min-h-14 min-w-0 flex-1 px-3 text-sm outline-none" placeholder="Tracking, customer, phone, driver, plate, route, transaction…"/><button className="shrink-0 bg-asphalt px-4 text-xs font-semibold text-white">Search</button></div></form><label><span className="text-[10px] font-semibold uppercase tracking-[.14em] text-steel">Report period</span><select value={range} onChange={e=>update({range:e.target.value as AdminReportRange})} className="mt-2 min-h-14 w-full border border-asphalt/20 bg-white px-4 text-sm font-semibold">{Object.entries(RANGE_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label></div>
      {data&&<p className="mt-3 text-xs text-steel">Database coverage: {data.coverage.orders.toLocaleString()} orders · {data.coverage.customers.toLocaleString()} customers · {data.coverage.drivers.toLocaleString()} drivers · {data.coverage.trucks.toLocaleString()} trucks · {data.coverage.payments.toLocaleString()} payments.</p>}
    </section>

    {loading&&!data&&<div className="py-24 text-center font-mono text-sm text-steel">Loading database intelligence…</div>}
    {data&&report&&<>
      {query.trim()&&<section className="mt-7"><SectionTitle eyebrow="UNIVERSAL SEARCH" title={`${search?.total ?? 0} matching records`} detail={`Server-side results for “${query.trim()}”. Up to ${SEARCH_PAGE_SIZE} per category per page.`}/>{search&&search.total>0?<><div className="grid gap-5 xl:grid-cols-2">
        <SearchGroup title="Orders" count={search.counts.orders}>{search.rows.orders.map(o=><SearchResult key={o.id} title={o.tracking_id} detail={`${o.customer_name||"Customer"} · ${o.customer_phone||"No phone"}`} meta={`${o.pickup_address} → ${o.dropoff_address}`} badge={o.status} to={target("/admin/operations?section=Orders",o.tracking_id)}/>)}</SearchGroup>
        <SearchGroup title="Payments" count={search.counts.payments}>{search.rows.payments.map(p=><SearchResult key={p.id} title={p.provider_ref||p.id} detail={`${p.provider} · ${money(Number(p.amount_etb||0))}`} meta={`${p.tracking_id||"Order unavailable"} · ${p.driver_name||p.customer_name||"No linked contact"}`} badge={p.event} to={target("/admin/payment-review",p.provider_ref||p.id)}/>)}</SearchGroup>
        <SearchGroup title="Customers" count={search.counts.customers}>{search.rows.customers.map(c=><SearchResult key={c.id} title={c.full_name} detail={c.phone} meta={c.company_name||c.email||"Customer account"} badge={c.is_credit_customer?"credit":"standard"} to={target("/admin/operations?section=Customers",c.phone)}/>)}</SearchGroup>
        <SearchGroup title="Drivers" count={search.counts.drivers}>{search.rows.drivers.map(d=><SearchResult key={d.id} title={d.full_name||"Driver"} detail={d.phone||"No phone"} meta="Driver finance, trips and vehicle context" badge={d.driver_status||"pending"} to={target("/admin/driver-finance-search",d.phone||d.full_name||d.id)}/>)}</SearchGroup>
        <SearchGroup title="Trucks" count={search.counts.trucks}>{search.rows.trucks.map(t=><SearchResult key={t.id} title={t.plate_number} detail={`${t.vehicle_type} · ${t.capacity_tons??"—"} tons`} meta="Fleet readiness and assignment context" badge={t.status} to={target("/admin/operations?section=Fleet%20%26%20drivers",t.plate_number)}/>)}</SearchGroup>
      </div>{searchPages>1&&<div className="mt-5 flex items-center justify-between gap-3"><button disabled={searchPage<=1} onClick={()=>update({page:searchPage-1})} className="min-h-11 border border-asphalt/15 bg-white px-4 text-xs font-semibold disabled:opacity-40">Previous</button><span className="text-xs text-steel">Search page {searchPage} of {searchPages}</span><button disabled={searchPage>=searchPages} onClick={()=>update({page:searchPage+1})} className="min-h-11 border border-asphalt/15 bg-white px-4 text-xs font-semibold disabled:opacity-40">Next</button></div>}</>:<div className="border border-asphalt/10 bg-white p-10 text-center text-sm text-steel">No records found.</div>}</section>}

      <section className="mt-8"><SectionTitle eyebrow="EXECUTIVE REPORT" title={`${RANGE_LABELS[range]} performance`} detail="Set-based database aggregation; no full-history client preload."/><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Net revenue" value={money(report.netRevenue)} detail={`${money(report.released)} released`} tone="good" to="/admin/payment-review"/><Metric label="Orders" value={String(report.orderCount)} detail={`${money(report.invoiceEtb)} invoiced`} to="/admin/operations?section=Orders"/><Metric label="Completion" value={`${report.completionRate}%`} detail={`${report.deliveredCount} delivered`} tone="good" to="/admin/operations?section=Orders&status=delivered"/><Metric label="Needs attention" value={String(report.attentionCount)} detail="Assignment + payment queues" tone={report.attentionCount?"alert":"good"} to="#smart-signals"/>
        <Metric label="Average order" value={money(report.averageOrderEtb)} detail={`${report.orderCount} orders`} to="/admin/quote-pricing"/><Metric label="Active trips" value={String(report.activeCount)} detail="Accepted + in transit" to="/admin/operations?section=Live%20trips"/><Metric label="Fleet utilization" value={`${report.fleetUtilization}%`} detail={`${report.availableTrucks} trucks available`} to="/admin/fleet-maintenance"/><Metric label="New customers" value={String(report.customerCount)} detail={`${report.totalCustomers} total accounts`} to="/admin/operations?section=Customers"/>
      </div></section>

      <section id="smart-signals" className="mt-8"><SectionTitle eyebrow="SMART SIGNALS" title="What needs a decision now" detail="Exact database counts linked to responsible controls."/><div className="grid gap-3 md:grid-cols-3">{signals.map(s=><Link key={s.label} to={s.to} className={`border-l-4 bg-white p-5 ${s.alert?"border-route":"border-emerald-700"}`}><div className="flex justify-between gap-4"><div><p className="font-display text-lg font-semibold">{s.label}</p><p className="mt-2 text-xs text-steel">{s.detail}</p></div><strong className={`text-3xl ${s.alert?"text-route":"text-emerald-800"}`}>{s.value}</strong></div><p className="mt-5 text-xs font-semibold text-amber-dim">Open control →</p></Link>)}</div></section>

      <section className="mt-8 grid gap-5 xl:grid-cols-[1.15fr_.85fr]"><article className="border border-asphalt/10 bg-white p-5"><p className="font-mono text-[10px] tracking-[.16em] text-amber-dim">7-DAY REVENUE PULSE</p><h2 className="mt-2 font-display text-2xl font-bold">Released money trend</h2><div className="mt-8 grid h-64 grid-cols-7 items-end gap-2">{report.revenueTrend.map(day=><div key={day.date} className="flex min-w-0 flex-col items-center justify-end gap-2"><span className="hidden text-[9px] text-steel sm:block">{day.amountEtb?money(day.amountEtb):"0"}</span><div className="w-full bg-[#f5f3ed] p-1"><div className="w-full bg-amber" style={{height:`${Math.max(6,Math.round(day.amountEtb/maxTrend*150))}px`}}/></div><span className="text-[9px] text-steel">{day.date.slice(5)}</span></div>)}</div></article><article className="border border-asphalt/10 bg-white p-5"><p className="font-mono text-[10px] tracking-[.16em] text-amber-dim">STATUS MIX</p><h2 className="mt-2 font-display text-2xl font-bold">Order pipeline</h2><div className="mt-6 space-y-4">{report.statusBreakdown.map(x=><div key={x.status}><div className="flex justify-between text-xs"><span className="font-semibold">{x.status.replaceAll("_"," ")}</span><span>{x.count}</span></div><div className="mt-2 h-2 bg-[#f5f3ed]"><div className="h-full bg-asphalt" style={{width:`${Math.max(3,x.count/maxStatus*100)}%`}}/></div></div>)}</div></article></section>

      <section className="mt-8 grid gap-5 lg:grid-cols-2"><article className="border border-asphalt/10 bg-white p-5"><SectionTitle eyebrow="TOP ROUTES" title="Highest-volume lanes" detail="Database-ranked by order count and invoice value."/>{report.topRoutes.length?<div className="divide-y divide-asphalt/10">{report.topRoutes.map(r=><div key={r.route} className="py-4"><div className="flex justify-between gap-4"><p className="min-w-0 break-words text-sm font-semibold">{r.route}</p><strong>{r.orders}</strong></div><p className="mt-1 text-xs text-steel">{r.delivered} delivered · {money(r.invoice_etb)} invoiced</p></div>)}</div>:<p className="text-sm text-steel">No route data in this period.</p>}</article><article className="border border-asphalt/10 bg-white p-5"><SectionTitle eyebrow="PAYMENT SOURCES" title="Provider activity" detail="Exact records and value in the selected period."/>{report.providerBreakdown.length?<div className="divide-y divide-asphalt/10">{report.providerBreakdown.map(p=><div key={p.provider} className="flex items-center justify-between gap-4 py-4"><div><p className="text-sm font-semibold">{p.provider}</p><p className="mt-1 text-xs text-steel">{p.records} records</p></div><strong>{money(p.amount_etb)}</strong></div>)}</div>:<p className="text-sm text-steel">No payment data in this period.</p>}</article></section>
    </>}
  </div></main>;
}

function SectionTitle({eyebrow,title,detail}:{eyebrow:string;title:string;detail:string}) { return <div className="mb-5"><p className="font-mono text-[10px] tracking-[.16em] text-amber-dim">{eyebrow}</p><h2 className="mt-2 font-display text-2xl font-bold">{title}</h2><p className="mt-2 text-xs leading-5 text-steel">{detail}</p></div>; }
function Metric({label,value,detail,to,tone="normal"}:{label:string;value:string;detail:string;to:string;tone?:"normal"|"good"|"alert"}) { return <Link to={to} className="min-w-0 border border-asphalt/10 bg-white p-4 sm:p-5"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-steel">{label}</p><p className={`mt-3 break-words font-display text-2xl font-bold sm:text-3xl ${tone==="alert"?"text-route":tone==="good"?"text-emerald-800":"text-asphalt"}`}>{value}</p><p className="mt-2 text-[11px] text-steel">{detail}</p></Link>; }
function SearchGroup({title,count,children}:{title:string;count:number;children:React.ReactNode}) { return <article className="border border-asphalt/10 bg-white"><div className="flex items-center justify-between border-b border-asphalt/10 px-5 py-4"><h3 className="font-display text-lg font-semibold">{title}</h3><span className="font-mono text-xs text-steel">{count}</span></div><div className="divide-y divide-asphalt/10">{children||<p className="p-5 text-xs text-steel">No matches on this page.</p>}</div></article>; }
function SearchResult({title,detail,meta,badge,to}:{title:string;detail:string;meta:string;badge:string;to:string}) { return <Link to={to} className="block min-w-0 p-4 hover:bg-[#f5f3ed]"><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-semibold">{title}</p><p className="mt-1 break-words text-xs text-steel">{detail}</p><p className="mt-1 break-words text-[11px] text-steel">{meta}</p></div><span className="shrink-0 bg-[#f5f3ed] px-2 py-1 font-mono text-[9px] uppercase text-steel">{badge}</span></div></Link>; }
