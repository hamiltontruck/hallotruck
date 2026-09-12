import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { type ControlCenterData, getControlCenterData } from "../services/admin-control-center.service";
import { supabase } from "../services/supabase.client";

const money=(v:number)=>`ETB ${Math.max(0,v).toLocaleString(undefined,{maximumFractionDigits:0})}`;
export function AdminCeoOverview({fixture=null}:{fixture?:ControlCenterData|null}={}){
 const [data,setData]=useState<ControlCenterData|null>(fixture),[loading,setLoading]=useState(!fixture),[error,setError]=useState("");
 const seq=useRef(0),loadRef=useRef<()=>Promise<void>>(async()=>{}),timer=useRef<number|undefined>();
 const load=useCallback(async()=>{const id=++seq.current;setLoading(true);try{const next=await getControlCenterData();if(id!==seq.current)return;setData(next);setError("");}catch(e){if(id===seq.current)setError(e instanceof Error?e.message:"Could not load CEO control center.");}finally{if(id===seq.current)setLoading(false);}},[]);
 useEffect(()=>{loadRef.current=load;},[load]); useEffect(()=>{if(!fixture)void load();},[fixture,load]);
 useEffect(()=>{if(fixture)return;const refresh=()=>{window.clearTimeout(timer.current);timer.current=window.setTimeout(()=>void loadRef.current(),700);};const c=supabase.channel("admin-ceo-control-center-live")
 .on("postgres_changes",{event:"*",schema:"public",table:"orders"},refresh).on("postgres_changes",{event:"*",schema:"public",table:"payments"},refresh)
 .on("postgres_changes",{event:"*",schema:"public",table:"driver_verification_files"},refresh).on("postgres_changes",{event:"*",schema:"public",table:"partner_freight_earnings"},refresh)
 .on("postgres_changes",{event:"*",schema:"public",table:"partner_settlements"},refresh).subscribe();return()=>{window.clearTimeout(timer.current);void supabase.removeChannel(c);};},[fixture]);
 if(loading&&!data)return <main className="min-h-screen bg-[#f5f3ed] p-5"><p className="py-24 text-center">Loading CEO control center…</p></main>;
 const s=data?.serverSummary;if(!data||!s)return <main className="min-h-screen bg-[#f5f3ed] p-5"><p>{error||"Dashboard data is unavailable."}</p><button onClick={()=>void load()}>Retry</button></main>;
 const cards=[
  ["Today's Revenue",money(s.todayRevenue),"/admin/payment-review"],["Active Trips",String(s.activeTrips),"/admin/operations?section=Live%20trips"],["Available Trucks",String(s.availableTrucks),"/admin/fleet-maintenance"],
  ["Driver Commission Due",money(s.commissionReceivable),"/admin/driver-commission"],["Partner Commission",money(s.partnerCommission),"/admin/partners"],["Pending Partner Settlements",String(s.pendingPartnerSettlements),"/admin/partners"],
  ["Partner Settlement Amount",money(s.pendingPartnerSettlementAmount),"/admin/partners"],["Documents Expiring in 30 Days",String(s.expiringDocuments),"/admin/driver-compliance"],["Delayed Trips",String(s.delayedTrips),"/admin/order-queue?queue=delayed"],
  ["Unreported Driver Payments",String(s.unreportedPaymentReports),"/admin/order-queue?queue=unreported-payment"],["Escrow",money(s.escrowAmount),"/admin/payment-review?status=escrow"],["Released",money(s.releasedAmount),"/admin/payment-review?status=released"]
 ];
 return <main className="min-h-screen overflow-x-hidden bg-[#f5f3ed] p-3 pb-24 text-asphalt sm:p-6 lg:p-8"><div className="mx-auto max-w-[1500px]">
  <header className="bg-asphalt p-5 text-white sm:p-8"><p className="font-mono text-[10px] tracking-[.22em] text-amber">CEO CONTROL CENTER</p><h1 className="mt-3 font-display text-3xl font-bold">HALLO Smart Logistics</h1><p className="mt-2 text-sm text-white/60">Exact database-backed leadership KPIs and bounded operational signals.</p><button onClick={()=>void load()} disabled={loading} className="mt-4 border border-white/20 px-4 py-3 text-sm">{loading?"Refreshing…":"Refresh"}</button></header>
  {error&&<p className="mt-4 border border-route/30 bg-route/10 p-4 text-route">{error}</p>}
  <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">{cards.map(([label,value,to])=><Link key={label} to={to} className="min-w-0 border border-asphalt/10 bg-white p-4 sm:p-5"><p className="text-[10px] uppercase tracking-wide text-steel">{label}</p><p className="mt-2 break-words font-display text-xl font-bold sm:text-2xl">{value}</p></Link>)}</section>
  <section className="mt-8 grid gap-5 xl:grid-cols-3"><Rank title="Top customers" rows={(data.topCustomers??[]).map(x=>[x.customer_name,`${x.order_count} orders`])}/><Rank title="Top routes" rows={(data.topRoutes??[]).map(x=>[`${x.pickup_address} → ${x.dropoff_address}`,`${x.order_count} orders`])}/><Rank title="Top partners" rows={(data.topPartners??[]).map(x=>[x.partner_id,`${x.freight_count} freight · ${money(x.gross_etb)}`])}/></section>
 </div></main>;
}
function Rank({title,rows}:{title:string;rows:[string,string][]}){return <section className="border border-asphalt/10 bg-white"><h2 className="border-b border-asphalt/10 p-4 font-display text-lg font-bold">{title}</h2><div className="divide-y divide-asphalt/10">{rows.map(([a,b],i)=><div key={`${a}-${i}`} className="flex min-w-0 justify-between gap-3 p-4 text-sm"><span className="min-w-0 break-words font-semibold">{a}</span><span className="shrink-0 text-steel">{b}</span></div>)}{!rows.length&&<p className="p-4 text-sm text-steel">No data yet.</p>}</div></section>}
