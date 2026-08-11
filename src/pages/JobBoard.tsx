import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAvailableJobs,
  acceptJob,
  AvailableJob,
  getMyActiveOrders,
  getAvailableTrucksForOrder,
  DriverTruckOption,
} from "../services/driver.service";
import { supabase } from "../services/supabase.client";
import { formatEtb, formatKm } from "../utils/currency";
import { useDriverText } from "../i18n/driverTranslations";

export function JobBoard() {
  const navigate = useNavigate();
  const dt = useDriverText();
  const [jobs, setJobs] = useState<AvailableJob[]>([]);
  const [driverName, setDriverName] = useState("Driver");
  const [loading, setLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [hasActiveTrip, setHasActiveTrip] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truckOptions, setTruckOptions] = useState<Record<string, DriverTruckOption[]>>({});
  const [selectedTruckIds, setSelectedTruckIds] = useState<Record<string, string>>({});
  const [loadingTrucksFor, setLoadingTrucksFor] = useState<string | null>(null);

  async function load(silent=false) {
    if(!silent)setLoading(true);
    try {
      const [availableJobs, activeOrders] = await Promise.all([getAvailableJobs(), getMyActiveOrders()]);
      setJobs(availableJobs);
      setHasActiveTrip(activeOrders.length > 0);
      setError(null);
    }
    catch (err) { setError(err instanceof Error ? err.message : dt("jobs.loadError")); }
    finally { setLoading(false); }
  }

  async function loadTruckOptions(jobId: string) {
    if (truckOptions[jobId] || loadingTrucksFor === jobId) return;
    setLoadingTrucksFor(jobId);
    try {
      const trucks = await getAvailableTrucksForOrder(jobId);
      setTruckOptions((current) => ({ ...current, [jobId]: trucks }));
      if (trucks.length === 1) {
        setSelectedTruckIds((current) => ({ ...current, [jobId]: trucks[0].id }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load available trucks.");
    } finally {
      setLoadingTrucksFor(null);
    }
  }

  useEffect(() => {
    load();
    supabase.auth.getUser().then(async({data})=>{if(!data.user)return;const {data:profile}=await supabase.from("profiles").select("full_name").eq("id",data.user.id).maybeSingle();setDriverName(profile?.full_name?.split(" ")[0]||"Driver")});
    const interval = setInterval(()=>load(true),15000);
    return () => clearInterval(interval);
  }, []);

  async function handleAccept(job: AvailableJob) {
    if (hasActiveTrip) {
      setError(dt("jobs.activeHelp"));
      return;
    }
    const truckId = selectedTruckIds[job.id];
    if (!truckId) {
      setError("Choose an available matching truck before accepting this load.");
      await loadTruckOptions(job.id);
      return;
    }
    setAcceptingId(job.id); setError(null);
    try {
      const { data:{user} }=await supabase.auth.getUser();
      if(!user)throw new Error(dt("jobs.signIn"));
      await acceptJob(job.id, truckId); navigate("/driver/trip");
    } catch(err){
      setTruckOptions((current) => { const next = { ...current }; delete next[job.id]; return next; });
      setSelectedTruckIds((current) => ({ ...current, [job.id]: "" }));
      setError(err instanceof Error?err.message:dt("jobs.taken"));
      await load(true);
    }
    finally{setAcceptingId(null)}
  }

  const potential=jobs.reduce((sum,job)=>sum+Number(job.price_etb||0),0);
  return <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 pb-28 md:pb-10">
    <section className="bg-asphalt text-white p-6 sm:p-9 relative overflow-hidden">
      <div className="absolute -right-16 -top-24 w-64 h-64 border-[42px] border-amber/10 rounded-full"/>
      <div className="relative"><p className="font-mono text-[10px] tracking-[.22em] text-amber">{dt("jobs.ready")}</p><h1 className="font-display font-bold text-3xl sm:text-4xl mt-3">{dt("jobs.greeting")}, {driverName}.</h1><p className="text-white/50 text-sm mt-3 max-w-lg">{dt("jobs.hero")}</p><div className="flex items-center gap-2 mt-6 text-xs"><span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"/><span className="text-white/65">{dt("jobs.online")}</span></div></div>
    </section>

    <section className="grid grid-cols-3 gap-3 sm:gap-5 my-5">
      <Stat value={String(jobs.length)} label={dt("jobs.open")}/>
      <Stat value={jobs.some(j=>Number(j.distance_km)>0)?formatKm(Math.min(...jobs.filter(j=>Number(j.distance_km)>0).map(j=>Number(j.distance_km)))):dt("jobs.pending")} label={dt("jobs.nearest")}/>
      <Stat value={potential?`ETB ${compact(potential)}`:"—"} label={dt("jobs.value")}/>
    </section>

    <div className="flex items-end justify-between gap-4 mt-8 mb-4"><div><p className="font-mono text-[10px] tracking-[.2em] text-amber-dim">{dt("jobs.market")}</p><h2 className="font-display font-bold text-2xl mt-1">{dt("jobs.available")}</h2></div><button onClick={()=>load()} className="text-xs font-semibold text-amber-dim">↻ {dt("jobs.refresh")}</button></div>
    {hasActiveTrip&&<div className="border border-amber/40 bg-amber/10 p-4 mb-4"><p className="text-sm font-semibold text-asphalt">{dt("jobs.active")}</p><p className="text-xs text-steel mt-1">{dt("jobs.activeHelp")}</p></div>}
    {error&&<p className="text-sm text-route border border-route/30 bg-route/5 p-3 mb-4">{error}</p>}
    {loading&&<div className="bg-white border border-asphalt/10 p-10 text-center text-steel text-sm">{dt("jobs.loading")}</div>}
    {!loading&&jobs.length===0&&<div className="bg-white border border-asphalt/10 p-8 sm:p-12 text-center"><div className="w-14 h-14 mx-auto bg-[#f5f3ed] grid place-items-center text-2xl">✓</div><h3 className="font-display font-semibold text-xl mt-5">{dt("jobs.emptyTitle")}</h3><p className="text-sm text-steel mt-2 max-w-sm mx-auto">{dt("jobs.emptyText")}</p><button onClick={()=>load()} className="bg-asphalt text-white px-5 py-3 mt-6 text-sm font-semibold">{dt("jobs.check")}</button></div>}
    <div className="grid lg:grid-cols-2 gap-4">{jobs.map(job=>{
      const options=truckOptions[job.id]??[];
      const selected=selectedTruckIds[job.id]??"";
      return <article key={job.id} className="bg-white border border-asphalt/10 p-5 sm:p-6 hover:border-amber transition"><div className="flex justify-between items-start gap-3"><div><span className="font-mono text-[10px] bg-[#f5f3ed] px-2.5 py-1.5">{job.tracking_id}</span><p className="font-display font-bold text-2xl mt-4">{formatEtb(job.price_etb)}</p></div><span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1.5">{dt("jobs.status")}</span></div><div className="mt-6 relative pl-7"><span className="absolute left-1.5 top-1 w-2.5 h-2.5 rounded-full border-2 border-amber"/><span className="absolute left-[10px] top-3 bottom-6 border-l border-dashed border-steel/40"/><span className="absolute left-1.5 bottom-1 w-2.5 h-2.5 bg-asphalt rounded-full"/><div><p className="text-[10px] text-steel uppercase tracking-wider">{dt("jobs.pickup")}</p><p className="text-sm font-semibold mt-1">{job.pickup_address}</p></div><div className="mt-5"><p className="text-[10px] text-steel uppercase tracking-wider">{dt("jobs.delivery")}</p><p className="text-sm font-semibold mt-1">{job.dropoff_address}</p></div></div><div className="flex flex-wrap gap-2 mt-6 text-[10px] text-steel"><span className="bg-[#f5f3ed] px-2.5 py-2">{formatKm(job.distance_km)}</span><span className="bg-[#f5f3ed] px-2.5 py-2 capitalize">{job.vehicle_type.replace("_"," ")}</span>{job.cargo_description&&<span className="bg-[#f5f3ed] px-2.5 py-2">{job.cargo_description}</span>}</div>
      <div className="mt-5 border border-asphalt/10 bg-[#f8f7f2] p-4">
        <label className="block text-[10px] font-semibold uppercase tracking-wider text-steel">Choose your truck</label>
        <select
          value={selected}
          onFocus={()=>loadTruckOptions(job.id)}
          onChange={(event)=>setSelectedTruckIds((current)=>({...current,[job.id]:event.target.value}))}
          className="mt-2 w-full border border-asphalt/15 bg-white px-3 py-3 text-sm text-asphalt"
          disabled={hasActiveTrip || loadingTrucksFor===job.id}
        >
          <option value="">{loadingTrucksFor===job.id?"Loading matching trucks…":"Select matching truck"}</option>
          {options.map((truck)=><option key={truck.id} value={truck.id}>{truck.plate_number} · {truck.vehicle_type}{truck.capacity_tons?` · ${truck.capacity_tons} t`:""}</option>)}
        </select>
        {truckOptions[job.id]&&options.length===0&&<p className="mt-2 text-xs text-route">No compatible available truck is ready for this load.</p>}
        <p className="mt-2 text-[11px] leading-relaxed text-steel">Only an available truck matching this load can be assigned. The server checks the truck again before the load is accepted.</p>
      </div>
      <button onClick={()=>handleAccept(job)} disabled={acceptingId===job.id||hasActiveTrip||!selected} className="w-full bg-asphalt text-white py-4 mt-4 font-semibold text-sm disabled:opacity-50">{hasActiveTrip?dt("jobs.finish"):acceptingId===job.id?dt("jobs.securing"):"Assign truck & accept load →"}</button></article>})}</div>
  </main>;
}

function Stat({value,label}:{value:string;label:string}){return <div className="bg-white border border-asphalt/10 p-3 sm:p-5 min-w-0"><p className="font-display font-bold text-lg sm:text-2xl truncate">{value}</p><p className="text-[9px] sm:text-xs text-steel mt-1">{label}</p></div>}
function compact(value:number){return value>=1_000_000?`${(value/1_000_000).toFixed(1)}M`:value>=1000?`${(value/1000).toFixed(1)}K`:value.toLocaleString()}
