import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAvailableJobs, acceptJob, AvailableJob } from "../services/driver.service";
import { supabase } from "../services/supabase.client";
import { formatEtb, formatKm } from "../utils/currency";

export function JobBoard() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<AvailableJob[]>([]);
  const [driverName, setDriverName] = useState("Driver");
  const [loading, setLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(silent=false) {
    if(!silent)setLoading(true);
    try { setJobs(await getAvailableJobs()); setError(null); }
    catch (err) { setError(err instanceof Error ? err.message : "Couldn't load jobs."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    supabase.auth.getUser().then(async({data})=>{if(!data.user)return;const {data:profile}=await supabase.from("profiles").select("full_name").eq("id",data.user.id).maybeSingle();setDriverName(profile?.full_name?.split(" ")[0]||"Driver")});
    const interval = setInterval(()=>load(true),15000);
    return () => clearInterval(interval);
  }, []);

  async function handleAccept(job: AvailableJob) {
    setAcceptingId(job.id); setError(null);
    try {
      const { data:{user} }=await supabase.auth.getUser();
      if(!user)throw new Error("Sign in required.");
      await acceptJob(job.id); navigate("/driver/trip");
    } catch(err){setError(err instanceof Error?err.message:"Someone else already took this load.");await load(true)}
    finally{setAcceptingId(null)}
  }

  const potential=jobs.reduce((sum,job)=>sum+Number(job.price_etb||0),0);
  return <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 pb-28 md:pb-10">
    <section className="bg-asphalt text-white p-6 sm:p-9 relative overflow-hidden">
      <div className="absolute -right-16 -top-24 w-64 h-64 border-[42px] border-amber/10 rounded-full"/>
      <div className="relative"><p className="font-mono text-[10px] tracking-[.22em] text-amber">READY TO MOVE</p><h1 className="font-display font-bold text-3xl sm:text-4xl mt-3">Good day, {driverName}.</h1><p className="text-white/50 text-sm mt-3 max-w-lg">Choose a load, stay connected and deliver with confidence.</p><div className="flex items-center gap-2 mt-6 text-xs"><span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"/><span className="text-white/65">You are online and receiving jobs</span></div></div>
    </section>

    <section className="grid grid-cols-3 gap-3 sm:gap-5 my-5">
      <Stat value={String(jobs.length)} label="Open loads"/>
      <Stat value={jobs.length?formatKm(Math.min(...jobs.map(j=>Number(j.distance_km||0)))):"—"} label="Nearest"/>
      <Stat value={potential?`ETB ${compact(potential)}`:"—"} label="Available value"/>
    </section>

    <div className="flex items-end justify-between gap-4 mt-8 mb-4"><div><p className="font-mono text-[10px] tracking-[.2em] text-amber-dim">JOB MARKET</p><h2 className="font-display font-bold text-2xl mt-1">Available loads</h2></div><button onClick={()=>load()} className="text-xs font-semibold text-amber-dim">↻ Refresh</button></div>
    {error&&<p className="text-sm text-route border border-route/30 bg-route/5 p-3 mb-4">{error}</p>}
    {loading&&<div className="bg-white border border-asphalt/10 p-10 text-center text-steel text-sm">Finding nearby loads…</div>}
    {!loading&&jobs.length===0&&<div className="bg-white border border-asphalt/10 p-8 sm:p-12 text-center"><div className="w-14 h-14 mx-auto bg-[#f5f3ed] grid place-items-center text-2xl">✓</div><h3 className="font-display font-semibold text-xl mt-5">You're all caught up</h3><p className="text-sm text-steel mt-2 max-w-sm mx-auto">No open loads right now. This board refreshes automatically when a customer order becomes available.</p><button onClick={()=>load()} className="bg-asphalt text-white px-5 py-3 mt-6 text-sm font-semibold">Check again</button></div>}
    <div className="grid lg:grid-cols-2 gap-4">{jobs.map(job=><article key={job.id} className="bg-white border border-asphalt/10 p-5 sm:p-6 hover:border-amber transition"><div className="flex justify-between items-start gap-3"><div><span className="font-mono text-[10px] bg-[#f5f3ed] px-2.5 py-1.5">{job.tracking_id}</span><p className="font-display font-bold text-2xl mt-4">{formatEtb(job.price_etb)}</p></div><span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1.5">AVAILABLE</span></div><div className="mt-6 relative pl-7"><span className="absolute left-1.5 top-1 w-2.5 h-2.5 rounded-full border-2 border-amber"/><span className="absolute left-[10px] top-3 bottom-6 border-l border-dashed border-steel/40"/><span className="absolute left-1.5 bottom-1 w-2.5 h-2.5 bg-asphalt rounded-full"/><div><p className="text-[10px] text-steel uppercase tracking-wider">Pickup</p><p className="text-sm font-semibold mt-1">{job.pickup_address}</p></div><div className="mt-5"><p className="text-[10px] text-steel uppercase tracking-wider">Delivery</p><p className="text-sm font-semibold mt-1">{job.dropoff_address}</p></div></div><div className="flex flex-wrap gap-2 mt-6 text-[10px] text-steel"><span className="bg-[#f5f3ed] px-2.5 py-2">{formatKm(job.distance_km)}</span><span className="bg-[#f5f3ed] px-2.5 py-2 capitalize">{job.vehicle_type.replace("_"," ")}</span>{job.cargo_description&&<span className="bg-[#f5f3ed] px-2.5 py-2">{job.cargo_description}</span>}</div><button onClick={()=>handleAccept(job)} disabled={acceptingId===job.id} className="w-full bg-asphalt text-white py-4 mt-5 font-semibold text-sm disabled:opacity-50">{acceptingId===job.id?"Securing load…":"Accept this load →"}</button></article>)}</div>
  </main>;
}

function Stat({value,label}:{value:string;label:string}){return <div className="bg-white border border-asphalt/10 p-3 sm:p-5 min-w-0"><p className="font-display font-bold text-lg sm:text-2xl truncate">{value}</p><p className="text-[9px] sm:text-xs text-steel mt-1">{label}</p></div>}
function compact(value:number){return value>=1_000_000?`${(value/1_000_000).toFixed(1)}M`:value>=1000?`${(value/1000).toFixed(1)}K`:value.toLocaleString()}
