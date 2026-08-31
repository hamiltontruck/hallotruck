import { useCallback, useEffect, useRef, useState } from "react";
import {
  claimDriverJob,
  fetchDriverTruckOptions,
  fetchDriverWorkboard,
  subscribeToMyDriverOrders,
} from "./driver-jobs.service";
import type {
  DriverAvailableJob,
  DriverTruckOption,
  DriverWorkboardSnapshot,
} from "./driver-jobs.model";

const MARKET_REFRESH_MS = 20_000;

function formatEtb(value: number | null) {
  return value === null
    ? "Gatiin hin galmoofne"
    : `ETB ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)}`;
}

function formatDistance(value: number | null) {
  return value === null
    ? "Fageenyi hin galmoofne"
    : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)} km`;
}

function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || "Driver";
}

function JobRoute({ job }: { job: DriverAvailableJob }) {
  return (
    <div className="relative mt-5 pl-7">
      <span className="absolute left-1.5 top-1 h-2.5 w-2.5 rounded-full border-2 border-halo-gold" />
      <span className="absolute bottom-6 left-[10px] top-3 border-l border-dashed border-halo-muted/50" />
      <span className="absolute bottom-1 left-1.5 h-2.5 w-2.5 rounded-full bg-halo-navy" />
      <div>
        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-halo-muted">Pickup</p>
        <p className="mt-1 break-words text-sm font-extrabold text-halo-navy">{job.pickupAddress}</p>
      </div>
      <div className="mt-5">
        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-halo-muted">Delivery</p>
        <p className="mt-1 break-words text-sm font-extrabold text-halo-navy">{job.dropoffAddress}</p>
      </div>
    </div>
  );
}

function ActiveTripCard({ snapshot }: { snapshot: DriverWorkboardSnapshot }) {
  const trip = snapshot.activeTrip;
  if (!trip) return null;

  return (
    <section className="rounded-[26px] bg-halo-navy p-5 text-white shadow-halo-float" aria-label="Active driver trip">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-halo-gold">Trip active</p>
          <h2 className="mt-2 truncate text-lg font-black">{trip.trackingId}</h2>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-400/15 px-3 py-1.5 text-[9px] font-black uppercase text-emerald-300">
          {trip.status === "in_transit" ? "IN TRANSIT" : "ACCEPTED"}
        </span>
      </div>
      <div className="mt-5 space-y-4 border-t border-white/10 pt-4">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-white/45">Pickup</p>
          <p className="mt-1 break-words text-sm font-bold">{trip.pickupAddress}</p>
        </div>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-white/45">Delivery</p>
          <p className="mt-1 break-words text-sm font-bold">{trip.dropoffAddress}</p>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3">
        <span className="text-[10px] font-bold text-white/55">Customer invoice</span>
        <strong className="text-sm">{formatEtb(trip.priceEtb)}</strong>
      </div>
      <p className="mt-4 text-xs leading-5 text-white/55">
        Hojii haaraa fudhachuu dura trip kana xumuri. Live trip controls mobile keessatti slice itti aanu irratti walitti hidhamu.
      </p>
    </section>
  );
}

function TruckSelector({
  job,
  options,
  selectedTruckId,
  loading,
  disabled,
  onLoad,
  onSelect,
}: {
  job: DriverAvailableJob;
  options: DriverTruckOption[] | undefined;
  selectedTruckId: string;
  loading: boolean;
  disabled: boolean;
  onLoad: (jobId: string) => Promise<void>;
  onSelect: (jobId: string, truckId: string) => void;
}) {
  return (
    <div className="mt-5 rounded-2xl bg-halo-soft p-3">
      <label htmlFor={`truck-${job.id}`} className="block text-[9px] font-black uppercase tracking-[0.14em] text-halo-muted">
        Truck kee filadhu
      </label>
      <select
        id={`truck-${job.id}`}
        value={selectedTruckId}
        onFocus={() => void onLoad(job.id)}
        onPointerDown={() => void onLoad(job.id)}
        onChange={(event) => onSelect(job.id, event.target.value)}
        disabled={disabled || loading}
        className="mt-2 min-h-12 w-full rounded-xl border border-halo-line bg-white px-3 text-sm font-bold text-halo-navy outline-none focus:border-halo-blue disabled:opacity-60"
      >
        <option value="">{loading ? "Truck mirkanaa'aa jira…" : options ? "Truck filadhu" : "Tuqi; truck mijataa barbaadi"}</option>
        {(options ?? []).map((truck) => (
          <option key={truck.id} value={truck.id}>
            {truck.plateNumber} · {truck.vehicleType}{truck.capacityTons === null ? "" : ` · ${truck.capacityTons} t`}
          </option>
        ))}
      </select>
      {options && options.length === 0 && (
        <p className="mt-2 text-xs leading-5 text-red-700">Truck hojii kanaaf mijatu, available fi documents isaa verified ta'e hin jiru.</p>
      )}
      <p className="mt-2 text-[10px] leading-4 text-halo-muted">
        Server truck ownership, type, tonnage, documents, commission fi active trip irra deebi'ee mirkaneessa.
      </p>
    </div>
  );
}

export function DriverJobsBoard({ userId, fullName }: { userId: string; fullName: string }) {
  const [snapshot, setSnapshot] = useState<DriverWorkboardSnapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truckOptions, setTruckOptions] = useState<Record<string, DriverTruckOption[]>>({});
  const [selectedTruckIds, setSelectedTruckIds] = useState<Record<string, string>>({});
  const [loadingTrucksFor, setLoadingTrucksFor] = useState<string | null>(null);
  const [claimingJobId, setClaimingJobId] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const busyRef = useRef(false);
  const queuedRefreshRef = useRef(false);
  const requestIdRef = useRef(0);
  const truckRequestRef = useRef<string | null>(null);
  const claimLockRef = useRef(false);
  const refreshRef = useRef<() => Promise<void>>(async () => undefined);

  const refresh = useCallback(async () => {
    if (busyRef.current) {
      queuedRefreshRef.current = true;
      return;
    }

    busyRef.current = true;
    const requestId = ++requestIdRef.current;
    if (mountedRef.current) setRefreshing(true);

    try {
      const nextSnapshot = await fetchDriverWorkboard(userId);
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setSnapshot(nextSnapshot);
      setError(null);
      if (nextSnapshot.activeTrip) {
        setTruckOptions({});
        setSelectedTruckIds({});
      }
    } catch (caught) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setError(caught instanceof Error ? caught.message : "Hojii argaman fe'uun hin danda'amne.");
    } finally {
      if (requestId === requestIdRef.current && mountedRef.current) setRefreshing(false);
      busyRef.current = false;
      if (queuedRefreshRef.current && mountedRef.current) {
        queuedRefreshRef.current = false;
        window.setTimeout(() => void refreshRef.current(), 0);
      }
    }
  }, [userId]);

  refreshRef.current = refresh;

  useEffect(() => {
    mountedRef.current = true;
    void refreshRef.current();
    const interval = window.setInterval(() => void refreshRef.current(), MARKET_REFRESH_MS);
    let unsubscribe: () => void = () => {};
    try {
      unsubscribe = subscribeToMyDriverOrders(userId, () => void refreshRef.current());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Realtime hojii jalqabuun hin danda'amne.");
    }

    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      window.clearInterval(interval);
      unsubscribe();
    };
  }, [userId]);

  async function loadTruckOptions(jobId: string) {
    if (truckOptions[jobId] || truckRequestRef.current) return;
    truckRequestRef.current = jobId;
    setLoadingTrucksFor(jobId);
    setError(null);
    try {
      const options = await fetchDriverTruckOptions(userId, jobId);
      if (!mountedRef.current) return;
      setTruckOptions((current) => ({ ...current, [jobId]: options }));
      if (options.length === 1) {
        setSelectedTruckIds((current) => ({ ...current, [jobId]: options[0].id }));
      }
    } catch (caught) {
      if (mountedRef.current) {
        setError(caught instanceof Error ? caught.message : "Truck mijataa fe'uun hin danda'amne.");
      }
    } finally {
      if (truckRequestRef.current === jobId) truckRequestRef.current = null;
      if (mountedRef.current) setLoadingTrucksFor(null);
    }
  }

  async function claim(job: DriverAvailableJob) {
    if (claimLockRef.current) return;
    const truckId = selectedTruckIds[job.id];
    if (!truckId) {
      setError("Dura truck hojii kanaaf mijatu filadhu.");
      await loadTruckOptions(job.id);
      return;
    }

    claimLockRef.current = true;
    setClaimingJobId(job.id);
    setError(null);
    try {
      await claimDriverJob(userId, job.id, truckId);
      await refreshRef.current();
    } catch (caught) {
      if (mountedRef.current) {
        setTruckOptions((current) => {
          const next = { ...current };
          delete next[job.id];
          return next;
        });
        setSelectedTruckIds((current) => ({ ...current, [job.id]: "" }));
        setError(caught instanceof Error ? caught.message : "Hojii kana fudhachuun hin danda'amne.");
        queuedRefreshRef.current = true;
        await refreshRef.current();
      }
    } finally {
      claimLockRef.current = false;
      if (mountedRef.current) setClaimingJobId(null);
    }
  }

  const jobs = snapshot?.availableJobs ?? [];
  const potential = jobs.reduce((sum, job) => sum + (job.priceEtb ?? 0), 0);

  return (
    <div className="space-y-5 overflow-x-hidden px-4 pb-7 pt-5 sm:px-6" aria-busy={refreshing}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-halo-gold-dark">Secure marketplace</p>
          <h1 className="mt-1 break-words text-2xl font-black text-halo-navy">Hojii argaman, {firstName(fullName)}</h1>
          <p className="mt-2 text-xs leading-5 text-halo-muted">Truck kee fi account kee server irratti mirkanaa'eef qofa hojii agarta.</p>
        </div>
        <button
          type="button"
          onClick={() => void refreshRef.current()}
          disabled={refreshing}
          className="min-h-11 shrink-0 rounded-2xl border border-halo-line bg-white px-3 text-xs font-black text-halo-blue disabled:opacity-60"
        >
          {refreshing ? "…" : "Haaromsi"}
        </button>
      </div>

      {snapshot && !snapshot.activeTrip && (
        <section className="grid grid-cols-2 gap-3" aria-label="Driver jobs summary">
          <div className="rounded-[20px] border border-halo-line bg-white p-4 shadow-halo-card">
            <p className="text-xl font-black text-halo-navy">{jobs.length}</p>
            <p className="mt-1 text-[10px] font-bold text-halo-muted">Hojii banaa</p>
          </div>
          <div className="rounded-[20px] border border-halo-line bg-white p-4 shadow-halo-card">
            <p className="truncate text-base font-black text-halo-blue">{potential > 0 ? formatEtb(potential) : "—"}</p>
            <p className="mt-1 text-[10px] font-bold text-halo-muted">Gatii waliigalaa</p>
          </div>
        </section>
      )}

      {error && (
        <section role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800">
          <p>{error}</p>
          <button type="button" onClick={() => void refreshRef.current()} disabled={refreshing} className="mt-3 min-h-11 w-full rounded-xl bg-red-800 px-4 text-xs font-black text-white disabled:opacity-60">
            Irra deebi'ii yaali
          </button>
        </section>
      )}

      {!snapshot && refreshing && (
        <section role="status" className="rounded-[24px] border border-halo-line bg-white p-8 text-center text-sm font-bold text-halo-muted">
          Hojii fi trip kee mirkaneessaa jira…
        </section>
      )}

      {snapshot?.activeTrip && <ActiveTripCard snapshot={snapshot} />}

      {snapshot && !snapshot.activeTrip && jobs.length === 0 && (
        <section className="rounded-[24px] border border-halo-line bg-white p-8 text-center shadow-halo-card">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-halo-soft text-xl text-halo-blue">✓</div>
          <h2 className="mt-4 text-lg font-black text-halo-navy">Hojii mijataan amma hin jiru</h2>
          <p className="mt-2 text-xs leading-5 text-halo-muted">Marketplace sekondii 20 keessatti ofumaan haaromfama. Truck fi documents kee ready ta'uu mirkaneessi.</p>
        </section>
      )}

      {snapshot && !snapshot.activeTrip && (
        <div className="space-y-4">
          {jobs.map((job) => {
            const options = truckOptions[job.id];
            const selectedTruckId = selectedTruckIds[job.id] ?? "";
            const claiming = claimingJobId === job.id;
            return (
              <article key={job.id} className="min-w-0 rounded-[24px] border border-halo-line bg-white p-4 shadow-halo-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="inline-flex max-w-full truncate rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-700">{job.trackingId}</span>
                    <h2 className="mt-3 break-words text-xl font-black text-halo-blue">{formatEtb(job.priceEtb)}</h2>
                  </div>
                  <span className="shrink-0 rounded-xl bg-halo-soft px-2.5 py-2 text-[9px] font-black uppercase text-halo-blue">OPEN</span>
                </div>

                <JobRoute job={job} />

                <div className="mt-5 flex flex-wrap gap-2 text-[10px] font-bold text-halo-muted">
                  <span className="rounded-xl bg-halo-soft px-2.5 py-2">{formatDistance(job.distanceKm)}</span>
                  <span className="rounded-xl bg-halo-soft px-2.5 py-2">{job.vehicleType.replaceAll("_", " ")}</span>
                  {job.cargoDescription && <span className="max-w-full break-words rounded-xl bg-halo-gold-soft px-2.5 py-2 text-halo-gold-dark">{job.cargoDescription}</span>}
                </div>

                <TruckSelector
                  job={job}
                  options={options}
                  selectedTruckId={selectedTruckId}
                  loading={loadingTrucksFor === job.id}
                  disabled={claiming || Boolean(claimingJobId && !claiming)}
                  onLoad={loadTruckOptions}
                  onSelect={(jobId, truckId) => setSelectedTruckIds((current) => ({ ...current, [jobId]: truckId }))}
                />

                <button
                  type="button"
                  onClick={() => void claim(job)}
                  disabled={claiming || !selectedTruckId || Boolean(claimingJobId && !claiming)}
                  className="mt-4 min-h-13 w-full rounded-2xl bg-halo-blue px-5 text-sm font-black text-white shadow-halo-button disabled:opacity-50"
                >
                  {claiming ? "Hojii siif qabaa jira…" : "Truck assign godhi; hojii fudhadhu"}
                </button>
              </article>
            );
          })}
        </div>
      )}

      {snapshot && (
        <p role="status" className="text-center text-[9px] font-bold uppercase tracking-[0.12em] text-halo-muted">
          Last verified {new Date(snapshot.loadedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
    </div>
  );
}
