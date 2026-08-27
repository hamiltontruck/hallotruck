import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getCurrentPartnerMemberships } from "../services/partner.service";
import { loadPartnerFinance, type FinancialCorrection, type PartnerWalletSummary, type PartnerFreightEarning, type PartnerSettlement } from "../services/partner-finance.service";
import { supabase } from "../services/supabase.client";
import { formatEtb } from "../utils/currency";

const zero: PartnerWalletSummary = { gross_etb:0,hallo_commission_etb:0,partner_net_etb:0,pending_settlement_etb:0,paid_settlement_etb:0,payable_etb:0,fleet_total:0,fleet_available:0,hallo_freight_count:0 };
const n=(v:number|string)=>Number(v||0);

export type PartnerWalletFixture = {
  partnerId: string;
  name: string;
  summary: PartnerWalletSummary;
  earnings: PartnerFreightEarning[];
  settlements: PartnerSettlement[];
  corrections?: FinancialCorrection[];
};

export function PartnerWallet({ fixture }: { fixture?: PartnerWalletFixture }) {
  const [params] = useSearchParams();
  const [partnerId,setPartnerId]=useState(fixture?.partnerId ?? "");
  const [name,setName]=useState(fixture?.name ?? "Partner wallet");
  const [summary,setSummary]=useState<PartnerWalletSummary>(fixture?.summary ?? zero);
  const [earnings,setEarnings]=useState<PartnerFreightEarning[]>(fixture?.earnings ?? []);
  const [settlements,setSettlements]=useState<PartnerSettlement[]>(fixture?.settlements ?? []);
  const [corrections,setCorrections]=useState<FinancialCorrection[]>(fixture?.corrections ?? []);
  const [loading,setLoading]=useState(!fixture);
  const [error,setError]=useState("");

  const load=useCallback(async()=>{
    if (fixture) {
      setPartnerId(fixture.partnerId); setName(fixture.name); setSummary(fixture.summary); setEarnings(fixture.earnings); setSettlements(fixture.settlements); setCorrections(fixture.corrections??[]); setError(""); setLoading(false);
      return;
    }
    setLoading(true); setError("");
    try {
      const memberships=await getCurrentPartnerMemberships();
      const requested=params.get("organization")||partnerId;
      const membership=memberships.find((item)=>item.partner_id===requested)||memberships[0];
      if(!membership){ setPartnerId(""); throw new Error("No active Partner organization is assigned to this account."); }
      if(!["owner","admin"].includes(membership.member_role)) throw new Error("Only Partner owners and admins may view finance.");
      setPartnerId(membership.partner_id); setName(membership.partner_organizations?.name||"Partner wallet");
      const data=await loadPartnerFinance(membership.partner_id);
      setSummary(data.summary||zero); setEarnings(data.earnings); setSettlements(data.settlements); setCorrections(data.corrections);
    } catch(e){ setError(e instanceof Error?e.message:"Partner wallet could not be loaded."); }
    finally{ setLoading(false); }
  },[fixture,params,partnerId]);

  useEffect(()=>{void load();},[]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{
    if(fixture||!partnerId)return;
    const channel=supabase.channel(`partner-wallet-${partnerId}`)
      .on("postgres_changes",{event:"*",schema:"public",table:"partner_freight_earnings",filter:`partner_id=eq.${partnerId}`},()=>void load())
      .on("postgres_changes",{event:"*",schema:"public",table:"partner_settlements",filter:`partner_id=eq.${partnerId}`},()=>void load())
      .on("postgres_changes",{event:"*",schema:"public",table:"financial_corrections",filter:`partner_id=eq.${partnerId}`},()=>void load()).subscribe();
    return()=>{void supabase.removeChannel(channel);};
  },[fixture,load,partnerId]);

  return <main className="min-h-screen overflow-x-hidden bg-[#f5f3ed] text-asphalt">
    <header className="bg-asphalt px-4 py-7 text-white sm:px-7"><div className="mx-auto max-w-6xl">
      <p className="font-mono text-[10px] tracking-[.22em] text-amber">PARTNER FINANCE</p>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="break-words font-display text-3xl font-bold sm:text-4xl">{name}</h1><p className="mt-2 text-sm text-white/55">HALLO-generated freight, commission deductions and settlement history.</p></div><div className="flex gap-2"><Link to="/partner" className="border border-white/20 px-4 py-3 text-xs font-semibold">← Workspace</Link><button onClick={()=>void load()} className="border border-amber/50 px-4 py-3 text-xs font-semibold text-amber">Refresh</button></div></div>
    </div></header>
    <section className="mx-auto max-w-6xl space-y-5 px-4 py-5 sm:px-7">
      {error?<section className="border border-route/30 bg-white p-6" role="alert"><p className="font-display text-xl font-bold text-route">Partner wallet failed to load</p><p className="mt-2 break-words text-sm text-steel">{error}</p><p className="mt-2 text-xs text-steel">No wallet totals are shown because the finance source failed.</p><button type="button" onClick={()=>void load()} className="mt-4 min-h-11 bg-asphalt px-5 py-3 text-sm font-semibold text-white">Retry wallet</button></section>:loading?<p className="border border-asphalt/10 bg-white p-10 text-center text-sm text-steel" aria-live="polite">Loading wallet…</p>:<>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card label="Gross freight" value={formatEtb(n(summary.gross_etb))}/><Card label="HALLO share" value={formatEtb(n(summary.hallo_commission_etb))}/><Card label="Partner net" value={formatEtb(n(summary.partner_net_etb))}/><Card label="Payable balance" value={formatEtb(n(summary.payable_etb))} strong/>
          <Card label="Pending settlements" value={formatEtb(n(summary.pending_settlement_etb))}/><Card label="Paid settlements" value={formatEtb(n(summary.paid_settlement_etb))}/><Card label="Fleet" value={`${summary.fleet_total} trucks`} detail={`${summary.fleet_available} available`}/><Card label="HALLO freight" value={String(summary.hallo_freight_count)} detail="Commissionable loads only"/>
        </div>
        <section className="border border-asphalt/10 bg-white"><Header title="HALLO-generated freight" count={earnings.length}/>{earnings.length===0?<Empty text="No HALLO-generated freight has accrued yet."/>:earnings.map(row=>{const related=corrections.filter(c=>c.partner_earning_id===row.id);const reversedGross=related.reduce((sum,c)=>sum+n(c.partner_gross_reversal_etb),0);const reversedCommission=related.reduce((sum,c)=>sum+n(c.partner_commission_reversal_etb),0);const effectiveNet=Math.max(0,n(row.partner_net_etb)-(reversedGross-reversedCommission));const status=reversedGross>=n(row.gross_etb)?"reversed":reversedGross>0?"partially reversed":row.status;return <div key={row.id} className="grid gap-3 border-t border-asphalt/10 p-4 sm:grid-cols-[1fr_auto]"><div className="min-w-0"><p className="break-all font-mono text-xs">{row.order_id}</p><p className="mt-2 font-display text-xl font-bold">{formatEtb(effectiveNet)} net</p><p className="mt-1 text-xs text-steel">Original gross {formatEtb(n(row.gross_etb))} · HALLO {formatEtb(Math.max(0,n(row.hallo_commission_etb)-reversedCommission))} · {row.commission_type} {row.commission_value}</p>{reversedGross>0&&<p className="mt-2 text-xs font-semibold text-route">Corrected gross: −{formatEtb(reversedGross)} · original row preserved</p>}</div><span className={`h-fit w-fit px-3 py-2 text-[10px] font-semibold uppercase ${reversedGross>0?"bg-route/10 text-route":"bg-emerald-50 text-emerald-800"}`}>{status}</span></div>;})}</section>
        <section className="border border-asphalt/10 bg-white"><Header title="Settlements" count={settlements.length}/>{settlements.length===0?<Empty text="No partner settlements recorded yet."/>:settlements.map(row=>{const reversed=corrections.some(c=>c.partner_settlement_id===row.id);return <div key={row.id} className="grid gap-3 border-t border-asphalt/10 p-4 sm:grid-cols-[1fr_auto]"><div><p className="font-display text-xl font-bold">{formatEtb(n(row.amount_etb))}</p><p className="mt-1 break-all text-xs text-steel">{row.provider||"Provider pending"}{row.transaction_ref?` · ${row.transaction_ref}`:""}</p>{reversed&&<p className="mt-2 text-xs font-semibold text-route">Reversal recorded · original settlement preserved</p>}</div><span className={`h-fit w-fit px-3 py-2 text-[10px] font-semibold uppercase ${reversed?"bg-route/10 text-route":"bg-amber/15 text-amber-dim"}`}>{reversed?"reversed":row.status}</span></div>;})}</section>
        <section className="border border-asphalt/10 bg-white"><Header title="Financial corrections" count={corrections.length}/>{corrections.length===0?<Empty text="No refunds or financial reversals recorded."/>:corrections.map(row=><div key={row.id} className="border-t border-asphalt/10 p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="font-display text-lg font-bold text-route">−{formatEtb(n(row.amount_etb))}</p><p className="mt-1 break-words text-xs font-semibold capitalize">{row.correction_type.replaceAll("_"," ")}</p><p className="mt-2 break-words text-xs text-steel">{row.reason}</p></div><time className="shrink-0 text-[10px] text-steel" dateTime={row.created_at}>{new Date(row.created_at).toLocaleString()}</time></div></div>)}</section>
      </>}
    </section>
  </main>;
}
function Card({label,value,detail,strong}:{label:string;value:string;detail?:string;strong?:boolean}){return <div className={`min-w-0 border p-4 ${strong?"border-emerald-600 bg-emerald-50":"border-asphalt/10 bg-white"}`}><p className="font-mono text-[9px] uppercase tracking-wider text-steel">{label}</p><p className="mt-3 break-words font-display text-xl font-bold sm:text-2xl">{value}</p>{detail&&<p className="mt-2 text-[11px] text-steel">{detail}</p>}</div>}
function Header({title,count}:{title:string;count:number}){return <div className="flex items-center justify-between gap-3 p-4"><h2 className="font-display text-xl font-bold">{title}</h2><span className="font-mono text-xs text-steel">{count}</span></div>}
function Empty({text}:{text:string}){return <p className="border-t border-asphalt/10 p-8 text-center text-sm text-steel">{text}</p>}
