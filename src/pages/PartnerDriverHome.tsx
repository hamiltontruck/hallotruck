import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDriverWorkspace } from "../components/driver/DriverWorkspaceContext";
import { getMyVerificationProfile, type DriverVerificationProfile } from "../services/driver.service";

export function PartnerDriverHome() {
  const workspace = useDriverWorkspace(); const [profile, setProfile] = useState<DriverVerificationProfile | null>(null); const [error, setError] = useState("");
  useEffect(() => { let active = true; void getMyVerificationProfile(workspace).then(data => { if (active) setProfile(data); }).catch(reason => { if (active) setError(reason.message); }); return () => { active = false; }; }, [workspace]);
  return <main className="mx-auto max-w-3xl space-y-5 p-6"><h1 className="text-3xl font-bold">Partner Driver workspace</h1><p>{workspace?.partner_name}</p><p>Driver approval: {workspace?.driver_status}</p>{error && <p role="alert">{error}</p>}<section className="border bg-white p-5"><h2 className="text-xl font-bold">Assigned Partner vehicle</h2><p>{profile?.truck?.plate_number ?? "Ask HALLO Admin to link your Partner vehicle."}</p></section><p>Your Partner assigns your trips; HALLO Admin confirms dispatch.</p><Link to="/partner/driver/trip" className="block border p-4">Open assigned trip</Link><Link to="/partner/driver/documents" className="block border p-4">Complete documents</Link></main>;
}
