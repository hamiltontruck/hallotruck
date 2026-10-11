import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { linkPartnerDriverVehicle, listPartnerDrivers, reviewPartnerDriver, type PartnerDriverRegistration } from "../services/partner-driver.service";
import { getFleetEnterpriseData, type FleetVehicle } from "../services/fleet-maintenance.service";

export function AdminPartnerDrivers() {
  const [rows,setRows]=useState<PartnerDriverRegistration[]>([]); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  const load=useCallback(async()=>{setRows(await listPartnerDrivers());},[]);
  useEffect(()=>{void load().catch(reason=>setError(reason.message));},[load]);
  async function review(event:FormEvent<HTMLFormElement>, row:PartnerDriverRegistration) {
    event.preventDefault(); const form=new FormData(event.currentTarget); setBusy(true);setError("");
    try { await reviewPartnerDriver(row.id,String(form.get("decision")) as "approved"|"rejected",String(form.get("reason"))); await load(); }
    catch(reason){setError(reason instanceof Error?reason.message:"Review failed.");}finally{setBusy(false);}
  }
  return <main className="min-h-screen space-y-5 bg-bone p-5 text-asphalt"><h1 className="font-display text-3xl font-bold">Partner driver review</h1>
    <p>Link the Partner truck, then verify driver and vehicle documents. Partner approval checks every required document and approves onboarding in one transaction. Pending drivers cannot work.</p>
    <Link to="/admin/driver-compliance" className="inline-block border p-3 font-semibold">Driver document review</Link>
    {error&&<p role="alert" className="text-route">{error}</p>}
    {rows.map(row=><article key={row.id} className="space-y-3 border bg-white p-5"><h2 className="text-xl font-bold">{row.full_name} · {row.partner_name}</h2>
      <p className="break-all">{row.email} · {row.phone}</p><p>Registration: {row.status} · Driver: {row.driver_status??"Signup pending"}</p>
      {row.review_note&&<p>Review: {row.review_note}</p>}
      {row.driver_id&&["registered","approved"].includes(row.status)&&<OnboardingVehicle row={row} onSaved={load} />}
      {["registered","invited"].includes(row.status)&&<form onSubmit={event=>void review(event,row)} className="flex flex-wrap gap-3">
        <select name="decision" className="min-h-12 border p-2"><option value="rejected">Reject registration</option>{row.status==="registered"&&<option value="approved">Approve verified Partner driver</option>}</select>
        <input name="reason" aria-label="Review reason" required minLength={3} placeholder="Review reason" className="min-h-12 min-w-0 flex-1 border p-2" />
        <button disabled={busy} className="min-h-12 bg-asphalt px-4 text-white disabled:opacity-40">Save review</button>
      </form>}
    </article>)}{rows.length===0&&<p>No Partner driver registrations yet.</p>}
  </main>;
}

function OnboardingVehicle({ row, onSaved }: { row: PartnerDriverRegistration; onSaved: () => Promise<void> }) {
  const [vehicles,setVehicles]=useState<FleetVehicle[]>([]); const [loaded,setLoaded]=useState(false);
  const [busy,setBusy]=useState(false); const [error,setError]=useState(""); const [notice,setNotice]=useState("");
  async function loadFleet() {
    setBusy(true);setError("");
    try { const data=await getFleetEnterpriseData(row.partner_id);setVehicles(data.vehicles.filter(vehicle=>vehicle.partner_id===row.partner_id&&!vehicle.active_trip_id&&(!vehicle.assigned_driver_id||vehicle.assigned_driver_id===row.driver_id)&&["available","inactive","assigned"].includes(vehicle.status)));setLoaded(true); }
    catch(reason){setError(reason instanceof Error?reason.message:"Fleet could not be loaded.");}finally{setBusy(false);}
  }
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();const values=new FormData(event.currentTarget);setBusy(true);setError("");setNotice("");
    try { await linkPartnerDriverVehicle(row.id,String(values.get("truck")));setNotice("Vehicle linked for document onboarding. Pending drivers remain inactive until HALLO approval.");await loadFleet();await onSaved(); }
    catch(reason){setError(reason instanceof Error?reason.message:"Vehicle link failed.");}finally{setBusy(false);}
  }
  return <div className="space-y-3 border p-3"><p>Link this Partner's truck for vehicle document onboarding.</p>
    {error&&<p role="alert" className="text-route">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <button type="button" disabled={busy} onClick={()=>void loadFleet()} className="min-h-12 border px-3">Load Partner vehicles</button>
    {loaded&&(vehicles.length?<form onSubmit={submit} className="flex flex-wrap gap-3"><select name="truck" aria-label="Partner onboarding truck" required className="min-h-12 min-w-0 flex-1 border p-2"><option value="">Choose Partner truck</option>{vehicles.map(vehicle=><option key={vehicle.vehicle_id} value={vehicle.vehicle_id}>{vehicle.plate_number} · {vehicle.status}</option>)}</select><button disabled={busy} className="min-h-12 bg-asphalt px-3 text-white disabled:opacity-40">Link onboarding vehicle</button></form>:<p>No eligible Partner trucks. Register an unassigned Partner vehicle first.</p>)}
  </div>;
}
