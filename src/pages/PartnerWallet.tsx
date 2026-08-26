import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getCurrentPartnerMemberships } from "../services/partner.service";
import { loadPartnerFinance, type PartnerWalletSummary, type PartnerFreightEarning, type PartnerSettlement } from "../services/partner-finance.service";
import { supabase } from "../services/supabase.client";
import { formatEtb } from "../utils/currency";

const zero: PartnerWalletSummary = { gross_etb:0,hallo_commission_etb:0,partner_net_etb:0,pending_settlement_etb:0,paid_settlement_etb:0,payable_etb:0,fleet_total:0,fleet_available:0,hallo_freight_count:0 };
const n=(v:number|string)=>Number(v||0);

export function PartnerWallet() {
  const [params] = useSearchParams();
  const [partnerId,setPartnerId]=useState("");
  const [name,setName]=useState("Partner wallet");
  const [summary,setSummary]=useState<PartnerWalletSummary>(zero);
  const [earnings,setEarnings]=useState<PartnerFreightEarning[]>([]);
  const [settlements,setSettlements]=useState<PartnerSettlement[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  const load=useCallback(async()=>{
    setLoading(true); setError("");
    try {
      const memberships=await getCurrentPartnerMemberships();
      const requested=params.get("organization")||partnerId;
      const membership=memberships.find((item)=>item.partner_id===requested)||memberships[0];
      if(!membership){ setPartnerId(""); return; }
      if(!["owner","admin"].includes(membership.member_role)) throw new Error("Only Partner owners and admins may view finance.");
      setPartnerId(membership.partner_id); setName(membership.partner_organizations?.name||"Partner wallet");
      const data=await loadPartnerFinance(membership.partner_id);
      setSummary(data.summary||zero); setEarnings(data.earnings); setSettlements(data.settlements);
    } catch(e){ setError(e instanceof Error?e.message:"Partner wallet could not be loaded."); }
    finally{ setLoading(false); }
  },[params,partnerId]);

  useEffect(()=>{void load();},[]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{
    if(!partnerId)return;
    const channel=supabase.channel(`partner-wallet-${partnerId}`)
      .on("postgres_changes",{event:"*",schema:"public",table:"partner_freight_earnings",filter:`partner_id=eq.${partnerId}`},()=>void load())
      .on("postgres_changes",{event:"*",schema:"public",table:"partner_settlements",filter:`partner_id=eq.${partnerId}`},()=>void load()).subscribe();
    return()=>{void supabase.removeChannel(channel);};
  },[load,partnerId]);

  return <main className="min-h-screen overflow-x-hidden bg-[#f5f3ed] text-asphalt">
    <header className="bg-asphalt px-4 py-7 text-white sm:px-7"><div className="mx-auto max-w-6xl">
      <p className="font-mono text-[10px] tracking-[.22em] text-amber">PARTNER FINANCE</p>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="break-words font-display text-3xl font-bold sm:text-4xl">{name}</h1><p className="mt-2 text-sm text-white/55">HALLO-generated freight, commission deductions and settlement history.</p></div><div className="flex gap-2"><Link to="/partner" className="border border-white/20 px-4 py-3 text-xs font-semibold">← Workspace</Link><button onClick={()=>void load()} className="border border-amber/50 px-4 py-3 text-xs font-semibold text-amber">Refresh</button></div></div>
    </div></header>
    <section className="mx-auto max-w-6xl space-y-5 px-4 py-5 sm:px-7">
      {error&&<p className="border border-route/30 bg-route/5 p-4 text-sm text-route">{error}</p>}
      {loading?<p className="border border-asphalt/10 bg-white p-10 text-center text-sm text-steel">Loading wallet…</p>:<>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card label="Gross freight" value={formatEtb(n(summary.gross_etb))}/><Card label="HALLO share" value={formatEtb(n(summary.hallo_commission_etb))}/><Card label="Partner net" value={formatEtb(n(summary.partner_net_etb))}/><Card label="Payable balance" value={formatEtb(n(summary.payable_etb))} strong/>
          <Card label="Pending settlements" value={formatEtb(n(summary.pending_settlement_etb))}/><Card label="Paid settlements" value={formatEtb(n(summary.paid_settlement_etb))}/><Card label="Fleet" value={`${summary.fleet_total} trucks`} detail={`${summary.fleet_available} available`}/><Card label="HALLO freight" value={String(summary.hallo_freight_count)} detail="Commissionable loads only"/>
        </div>
        <section className="border border-asphalt/10 bg-white"><Header title="HALLO-generated freight" count={earnings.length}/>{earnings.length===0?<Empty text="No HALLO-generated freight has accrued yet."/>:earnings.map(row=><div key={row.id} className="grid gap-3 border-t border-asphalt/10 p-4 sm:grid-cols-[1fr_auto]"><div className="min-w-0"><p className="break-all font-mono text-xs">{row.order_id}</p><p className="mt-2 font-display text-xl font-bold">{formatEtb(n(row.partner_net_etb))} net</p><p className="mt-1 text-xs text-steel">Gross {formatEtb(n(row.gross_etb))} · HALLO {formatEtb(n(row.hallo_commission_etb))} · {row.commission_type} {row.commission_value}</p></div><span className="h-fit w-fit bg-emerald-50 px-3 py-2 text-[10px] font-semibold uppercase text-emerald-800">{row.status}</span></div>)}</section>
        <section className="border border-asphalt/10 bg-white"><Header title="Settlements" count={settlements.length}/>{settlements.length===0?<Empty text="No partner settlements recorded yet."/>:settlements.map(row=><div key={row.id} className="grid gap-3 border-t border-asphalt/10 p-4 sm:grid-cols-[1fr_auto]"><div><p className="font-display text-xl font-bold">{formatEtb(n(row.amount_etb))}</p><p className="mt-1 break-all text-xs text-steel">{row.provider||"Provider pending"}{row.transaction_ref?` · ${row.transaction_ref}`:""}</p></div><span className="h-fit w-fit bg-amber/15 px-3 py-2 text-[10px] font-semibold uppercase text-amber-dim">{row.status}</span></div>)}</section>
      </>}
    </section>
  </main>;
}
function Card({label,value,detail,strong}:{label:string;value:string;detail?:string;strong?:boolean}){return <div className={`min-w-0 border p-4 ${strong?"border-emerald-600 bg-emerald-50":"border-asphalt/10 bg-white"}`}><p className="font-mono text-[9px] uppercase tracking-wider text-steel">{label}</p><p className="mt-3 break-words font-display text-xl font-bold sm:text-2xl">{value}</p>{detail&&<p className="mt-2 text-[11px] text-steel">{detail}</p>}</div>}
function Header({title,count}:{title:string;count:number}){return <div className="flex items-center justify-between gap-3 p-4"><h2 className="font-display text-xl font-bold">{title}</h2><span className="font-mono text-xs text-steel">{count}</span></div>}
function Empty({text}:{text:string}){return <p className="border-t border-asphalt/10 p-8 text-center text-sm text-steel">{text}</p>}
