import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAvailableJobs, acceptJob, AvailableJob } from "../services/driver.service";
import { supabase } from "../services/supabase.client";
import { formatEtb, formatKm } from "../utils/currency";
import { Button } from "../components/ui/Button";
import { CargoPlate } from "../components/ui/CargoPlate";

export function JobBoard() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<AvailableJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setJobs(await getAvailableJobs());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load jobs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, []);

  async function handleAccept(job: AvailableJob) {
    setAcceptingId(job.id);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in required.");
      await acceptJob(job.id);
      navigate("/trip");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Someone else already took this load — refreshing the board.",
      );
      load();
    } finally {
      setAcceptingId(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display font-bold text-3xl text-asphalt">Available loads</h1>
        <span className="font-mono text-xs text-steel">{jobs.length} nearby</span>
      </div>

      {error && (
        <p className="font-body text-sm text-route border border-route/40 bg-route/5 px-4 py-3 mb-6">
          {error}
        </p>
      )}

      {loading && <p className="font-body text-steel">Loading loads…</p>}

      {!loading && jobs.length === 0 && (
        <div className="border border-line bg-white p-10 text-center">
          <p className="font-body text-steel">
            No loads available right now. New bookings appear here the moment a customer confirms
            payment.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {jobs.map((job) => (
          <div key={job.id} className="border border-line bg-white p-6 flex flex-wrap gap-6 justify-between">
            <div className="flex-1 min-w-[240px]">
              <CargoPlate size="sm">{job.tracking_id}</CargoPlate>
              <div className="font-body text-sm text-asphalt mt-3 space-y-1">
                <div>
                  <span className="text-steel">From </span>
                  {job.pickup_address}
                </div>
                <div>
                  <span className="text-steel">To </span>
                  {job.dropoff_address}
                </div>
                {job.cargo_description && (
                  <div className="text-steel text-xs mt-2">{job.cargo_description}</div>
                )}
              </div>
              <div className="flex gap-4 font-mono text-xs text-steel mt-3">
                <span>{formatKm(job.distance_km)}</span>
                <span className="capitalize">{job.vehicle_type.replace("_", " ")}</span>
              </div>
            </div>
            <div className="flex flex-col items-end justify-between gap-4">
              <CargoPlate size="lg">{formatEtb(job.price_etb)}</CargoPlate>
              <Button onClick={() => handleAccept(job)} disabled={acceptingId === job.id}>
                {acceptingId === job.id ? "Accepting…" : "Accept load"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
