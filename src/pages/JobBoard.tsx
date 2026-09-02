import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAvailableJobs,
  acceptJob,
  type AvailableJob,
  getMyActiveOrders,
  getAvailableTrucksForOrder,
  getMyLatestCancelledOrder,
  type MyOrder,
  type DriverTruckOption,
} from "../services/driver.service";
import { supabase } from "../services/supabase.client";
import { formatEtb, formatKm } from "../utils/currency";
import { useDriverText } from "../i18n/driverTranslations";
import { DriverAvailabilityCard } from "../components/driver/DriverAvailabilityCard";
import { DriverOrderCancellationNotice } from "../components/driver/DriverOrderCancellationNotice";

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
  const [cancelledOrder, setCancelledOrder] = useState<MyOrder | null>(null);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    try {
      const [availableJobs, activeOrders, latestCancellation] = await Promise.all([
        getAvailableJobs(),
        getMyActiveOrders(),
        getMyLatestCancelledOrder(),
      ]);
      const activeTrip = activeOrders.length > 0;
      setHasActiveTrip(activeTrip);
      setJobs(activeTrip ? [] : availableJobs);
      const dismissed = latestCancellation
        ? window.localStorage.getItem(`hallotruck-dismissed-cancellation-${latestCancellation.id}`) === "1"
        : false;
      setCancelledOrder(dismissed ? null : latestCancellation);
      if (activeTrip) {
        setTruckOptions({});
        setSelectedTruckIds({});
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : dt("jobs.loadError"));
    } finally {
      setLoading(false);
    }
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
    void load();
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", data.user.id)
        .maybeSingle();
      setDriverName(profile?.full_name?.split(" ")[0] || "Driver");
    });
    const interval = window.setInterval(() => void load(true), 15_000);
    return () => window.clearInterval(interval);
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

    setAcceptingId(job.id);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(dt("jobs.signIn"));
      await acceptJob(job.id, truckId);
      navigate("/driver/trip");
    } catch (err) {
      setTruckOptions((current) => {
        const next = { ...current };
        delete next[job.id];
        return next;
      });
      setSelectedTruckIds((current) => ({ ...current, [job.id]: "" }));
      setError(err instanceof Error ? err.message : dt("jobs.taken"));
      await load(true);
    } finally {
      setAcceptingId(null);
    }
  }

  const potential = jobs.reduce((sum, job) => sum + Number(job.price_etb || 0), 0);

  function dismissCancellation() {
    if (!cancelledOrder) return;
    window.localStorage.setItem(`hallotruck-dismissed-cancellation-${cancelledOrder.id}`, "1");
    setCancelledOrder(null);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 pb-28 sm:px-6 sm:py-10 md:pb-10">
      <section className="relative overflow-hidden bg-asphalt p-6 text-white sm:p-9">
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full border-[42px] border-amber/10" />
        <div className="relative">
          <p className="font-mono text-[10px] tracking-[.22em] text-amber">{dt("jobs.ready")}</p>
          <h1 className="mt-3 font-display text-3xl font-bold sm:text-4xl">{dt("jobs.greeting")}, {driverName}.</h1>
          <p className="mt-3 max-w-lg text-sm text-white/50">{dt("jobs.hero")}</p>
        </div>
      </section>

      {cancelledOrder && <div className="my-5"><DriverOrderCancellationNotice order={cancelledOrder} onDismiss={dismissCancellation} /></div>}

      <DriverAvailabilityCard />

      <section className="my-5 grid grid-cols-3 gap-3 sm:gap-5">
        <Stat value={String(jobs.length)} label={dt("jobs.open")} />
        <Stat
          value={jobs.some((job) => Number(job.distance_km) > 0)
            ? formatKm(Math.min(...jobs.filter((job) => Number(job.distance_km) > 0).map((job) => Number(job.distance_km))))
            : dt("jobs.pending")}
          label={dt("jobs.nearest")}
        />
        <Stat value={potential ? `ETB ${compact(potential)}` : "—"} label={dt("jobs.value")} />
      </section>

      <div className="mb-4 mt-8 flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-[.2em] text-amber-dim">{dt("jobs.market")}</p>
          <h2 className="mt-1 font-display text-2xl font-bold">{dt("jobs.available")}</h2>
        </div>
        <button onClick={() => void load()} className="text-xs font-semibold text-amber-dim">↻ {dt("jobs.refresh")}</button>
      </div>

      {hasActiveTrip && (
        <div className="mb-4 border border-amber/40 bg-amber/10 p-4">
          <p className="text-sm font-semibold text-asphalt">{dt("jobs.active")}</p>
          <p className="mt-1 text-xs text-steel">{dt("jobs.activeHelp")}</p>
          <button onClick={() => navigate("/driver/trip")} className="mt-4 bg-asphalt px-4 py-3 text-xs font-semibold text-white">Open active trip →</button>
        </div>
      )}

      {error && <p className="mb-4 border border-route/30 bg-route/5 p-3 text-sm text-route">{error}</p>}
      {loading && <div className="border border-asphalt/10 bg-white p-10 text-center text-sm text-steel">{dt("jobs.loading")}</div>}

      {!loading && !hasActiveTrip && jobs.length === 0 && (
        <div className="border border-asphalt/10 bg-white p-8 text-center sm:p-12">
          <div className="mx-auto grid h-14 w-14 place-items-center bg-[#f5f3ed] text-2xl">✓</div>
          <h3 className="mt-5 font-display text-xl font-semibold">{dt("jobs.emptyTitle")}</h3>
          <p className="mx-auto mt-2 max-w-sm text-sm text-steel">{dt("jobs.emptyText")}</p>
          <button onClick={() => void load()} className="mt-6 bg-asphalt px-5 py-3 text-sm font-semibold text-white">{dt("jobs.check")}</button>
        </div>
      )}

      {!hasActiveTrip && (
        <div className="grid gap-4 lg:grid-cols-2">
          {jobs.map((job) => {
            const options = truckOptions[job.id] ?? [];
            const selected = selectedTruckIds[job.id] ?? "";
            const isLoadingTrucks = loadingTrucksFor === job.id;
            const isAccepting = acceptingId === job.id;
            const truckGuidanceId = `job-${job.id}-truck-guidance`;
            const acceptGuidanceId = `job-${job.id}-accept-guidance`;
            const acceptGuidance = isAccepting
              ? "Assigning this truck and securing the load."
              : selected
                ? "Ready to assign the selected truck and accept this load."
                : isLoadingTrucks
                  ? "Loading compatible trucks before this load can be accepted."
                  : "Choose a compatible truck before accepting this load.";
            return (
              <article key={job.id} className="border border-asphalt/10 bg-white p-5 transition hover:border-amber sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="bg-[#f5f3ed] px-2.5 py-1.5 font-mono text-[10px]">{job.tracking_id}</span>
                    <p className="mt-4 font-display text-2xl font-bold">{formatEtb(job.price_etb)}</p>
                  </div>
                  <span className="bg-emerald-50 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-700">{dt("jobs.status")}</span>
                </div>

                <div className="relative mt-6 pl-7">
                  <span className="absolute left-1.5 top-1 h-2.5 w-2.5 rounded-full border-2 border-amber" />
                  <span className="absolute bottom-6 left-[10px] top-3 border-l border-dashed border-steel/40" />
                  <span className="absolute bottom-1 left-1.5 h-2.5 w-2.5 rounded-full bg-asphalt" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-steel">{dt("jobs.pickup")}</p>
                    <p className="mt-1 text-sm font-semibold">{job.pickup_address}</p>
                  </div>
                  <div className="mt-5">
                    <p className="text-[10px] uppercase tracking-wider text-steel">{dt("jobs.delivery")}</p>
                    <p className="mt-1 text-sm font-semibold">{job.dropoff_address}</p>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-2 text-[10px] text-steel">
                  <span className="bg-[#f5f3ed] px-2.5 py-2">{formatKm(job.distance_km)}</span>
                  <span className="bg-[#f5f3ed] px-2.5 py-2 capitalize">{job.vehicle_type.replace("_", " ")}</span>
                  {job.cargo_description && <span className="bg-amber/10 px-2.5 py-2 font-semibold text-amber-dim">{job.cargo_description}</span>}
                </div>

                <div className="mt-5 border border-asphalt/10 bg-[#f8f7f2] p-4">
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-steel">Choose your truck</label>
                  <select
                    value={selected}
                    onFocus={() => void loadTruckOptions(job.id)}
                    onChange={(event) => setSelectedTruckIds((current) => ({ ...current, [job.id]: event.target.value }))}
                    className="mt-2 w-full border border-asphalt/15 bg-white px-3 py-3 text-sm text-asphalt"
                    disabled={isLoadingTrucks}
                    aria-busy={isLoadingTrucks}
                    aria-describedby={truckGuidanceId}
                  >
                    <option value="">{isLoadingTrucks ? "Loading matching trucks…" : "Select matching truck"}</option>
                    {options.map((truck) => (
                      <option key={truck.id} value={truck.id}>
                        {truck.plate_number} · {truck.vehicle_type}{truck.capacity_tons ? ` · ${truck.capacity_tons} t` : ""}
                      </option>
                    ))}
                  </select>
                  {truckOptions[job.id] && options.length === 0 && <p className="mt-2 text-xs text-route">No compatible available truck is ready for this load.</p>}
                  <p id={truckGuidanceId} className="mt-2 text-[11px] leading-relaxed text-steel">The server checks truck type, cargo tonnage, documents and active-trip availability again before acceptance.</p>
                </div>

                <button
                  type="button"
                  onClick={() => void handleAccept(job)}
                  disabled={isAccepting || !selected}
                  aria-busy={isAccepting}
                  aria-describedby={acceptGuidanceId}
                  title={acceptGuidance}
                  className="mt-4 w-full bg-asphalt py-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {isAccepting ? dt("jobs.securing") : "Assign truck & accept load →"}
                </button>
                <p id={acceptGuidanceId} className="mt-2 text-xs leading-relaxed text-steel" role="status" aria-live="polite">
                  {acceptGuidance}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return <div className="min-w-0 border border-asphalt/10 bg-white p-3 sm:p-5"><p className="truncate font-display text-lg font-bold sm:text-2xl">{value}</p><p className="mt-1 text-[9px] text-steel sm:text-xs">{label}</p></div>;
}

function compact(value: number) {
  return value >= 1_000_000
    ? `${(value / 1_000_000).toFixed(1)}M`
    : value >= 1000
      ? `${(value / 1000).toFixed(1)}K`
      : value.toLocaleString();
}

