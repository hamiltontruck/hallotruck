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
import { DriverAvailabilityCard } from "./DriverAvailabilityCard";
import { getDriverV4Copy, type DriverLanguage } from "./driver-v4-i18n";

const MARKET_REFRESH_MS = 20_000;

function formatEtb(value: number | null, missing: string) {
  return value === null
    ? missing
    : `ETB ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)}`;
}

function formatDistance(value: number | null, missing: string) {
  return value === null
    ? missing
    : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)} km`;
}

function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || "Driver";
}

function JobRoute({ job, language }: { job: DriverAvailableJob; language: DriverLanguage }) {
  const t = getDriverV4Copy(language);
  return (
    <div className="relative mt-5 pl-7">
      <span className="absolute left-1.5 top-1 h-2.5 w-2.5 rounded-full border-2 border-halo-gold" />
      <span className="absolute bottom-6 left-[10px] top-3 border-l border-dashed border-halo-muted/50" />
      <span className="absolute bottom-1 left-1.5 h-2.5 w-2.5 rounded-full bg-halo-navy" />
      <div>
        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-halo-muted">{t.jobs.pickup}</p>
        <p className="mt-1 break-words text-sm font-extrabold text-halo-navy">{job.pickupAddress}</p>
      </div>
      <div className="mt-5">
        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-halo-muted">{t.jobs.delivery}</p>
        <p className="mt-1 break-words text-sm font-extrabold text-halo-navy">{job.dropoffAddress}</p>
      </div>
    </div>
  );
}

function ActiveTripCard({
  snapshot,
  onOpenTrip,
  language,
}: {
  snapshot: DriverWorkboardSnapshot;
  onOpenTrip: () => void;
  language: DriverLanguage;
}) {
  const trip = snapshot.activeTrip;
  const t = getDriverV4Copy(language);
  if (!trip) return null;

  return (
    <section className="rounded-[26px] bg-halo-navy p-5 text-white shadow-halo-float" aria-label={t.jobs.active}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-halo-gold">{t.jobs.activeLabel}</p>
          <h2 className="mt-2 truncate text-lg font-black">{trip.trackingId}</h2>
        </div>
        <span className="shrink-0 rounded-full bg-emerald-400/15 px-3 py-1.5 text-[9px] font-black uppercase text-emerald-300">
          {trip.status === "in_transit" ? t.common.inTransit : t.jobs.accepted}
        </span>
      </div>
      <div className="mt-5 space-y-4 border-t border-white/10 pt-4">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-white/45">{t.jobs.pickup}</p>
          <p className="mt-1 break-words text-sm font-bold">{trip.pickupAddress}</p>
        </div>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-white/45">{t.jobs.delivery}</p>
          <p className="mt-1 break-words text-sm font-bold">{trip.dropoffAddress}</p>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3">
        <span className="text-[10px] font-bold text-white/55">{t.jobs.customerInvoice}</span>
        <strong className="text-sm">{formatEtb(trip.priceEtb, t.jobs.priceMissing)}</strong>
      </div>
      <p className="mt-4 text-xs leading-5 text-white/55">{t.jobs.activeTripHelp}</p>
      <button type="button" onClick={onOpenTrip} className="mt-4 min-h-12 w-full rounded-2xl bg-white px-4 text-xs font-black text-halo-navy">{t.jobs.openTrip}</button>
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
  language,
}: {
  job: DriverAvailableJob;
  options: DriverTruckOption[] | undefined;
  selectedTruckId: string;
  loading: boolean;
  disabled: boolean;
  onLoad: (jobId: string) => Promise<void>;
  onSelect: (jobId: string, truckId: string) => void;
  language: DriverLanguage;
}) {
  const t = getDriverV4Copy(language);
  return (
    <div className="mt-5 rounded-2xl bg-halo-soft p-3">
      <label htmlFor={`truck-${job.id}`} className="block text-[9px] font-black uppercase tracking-[0.14em] text-halo-muted">
        {t.jobs.truckLabel}
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
        <option value="">{loading ? t.jobs.truckChecking : options ? t.jobs.chooseTruck : t.jobs.tapForTruck}</option>
        {(options ?? []).map((truck) => (
          <option key={truck.id} value={truck.id}>
            {truck.plateNumber} · {truck.vehicleType}{truck.capacityTons === null ? "" : ` · ${truck.capacityTons} t`}
          </option>
        ))}
      </select>
      {options && options.length === 0 && (
        <p className="mt-2 text-xs leading-5 text-red-700">{t.jobs.noCompatibleTruck}</p>
      )}
      <p className="mt-2 text-[10px] leading-4 text-halo-muted">{t.jobs.serverChecks}</p>
    </div>
  );
}

export function DriverJobsBoard({
  userId,
  fullName,
  onOpenTrip = () => undefined,
  language = "om",
}: {
  userId: string;
  fullName: string;
  onOpenTrip?: () => void;
  language?: DriverLanguage;
}) {
  const t = getDriverV4Copy(language);
  const [snapshot, setSnapshot] = useState<DriverWorkboardSnapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truckOptions, setTruckOptions] = useState<Record<string, DriverTruckOption[]>>({});
  const [selectedTruckIds, setSelectedTruckIds] = useState<Record<string, string>>({});
  const [loadingTrucksFor, setLoadingTrucksFor] = useState<string | null>(null);
  const [claimingJobId, setClaimingJobId] = useState<string | null>(null);
  const [dismissedCancellationId, setDismissedCancellationId] = useState<string | null>(null);
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
      setError(caught instanceof Error ? caught.message : t.jobs.loadError);
    } finally {
      if (requestId === requestIdRef.current && mountedRef.current) setRefreshing(false);
      busyRef.current = false;
      if (queuedRefreshRef.current && mountedRef.current) {
        queuedRefreshRef.current = false;
        window.setTimeout(() => void refreshRef.current(), 0);
      }
    }
  }, [t.jobs.loadError, userId]);

  refreshRef.current = refresh;

  useEffect(() => {
    mountedRef.current = true;
    void refreshRef.current();
    const interval = window.setInterval(() => void refreshRef.current(), MARKET_REFRESH_MS);
    let unsubscribe: () => void = () => {};
    try {
      unsubscribe = subscribeToMyDriverOrders(userId, () => void refreshRef.current());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.jobs.realtimeError);
    }

    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      window.clearInterval(interval);
      unsubscribe();
    };
  }, [t.jobs.realtimeError, userId]);

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
      if (mountedRef.current) setError(caught instanceof Error ? caught.message : t.jobs.truckError);
    } finally {
      if (truckRequestRef.current === jobId) truckRequestRef.current = null;
      if (mountedRef.current) setLoadingTrucksFor(null);
    }
  }

  async function claim(job: DriverAvailableJob) {
    if (claimLockRef.current) return;
    const truckId = selectedTruckIds[job.id];
    if (!truckId) {
      setError(t.jobs.chooseTruckError);
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
        setError(caught instanceof Error ? caught.message : t.jobs.claimError);
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
  const latestCancellation = snapshot?.latestCancellation ?? null;
  const cancellationDismissed = latestCancellation
    ? dismissedCancellationId === latestCancellation.id
      || window.localStorage.getItem(`hallotruck-dismissed-cancellation-${latestCancellation.id}`) === "1"
    : true;

  function dismissCancellation() {
    if (!latestCancellation) return;
    window.localStorage.setItem(`hallotruck-dismissed-cancellation-${latestCancellation.id}`, "1");
    setDismissedCancellationId(latestCancellation.id);
  }

  return (
    <div className="space-y-5 overflow-x-hidden px-4 pb-7 pt-5 sm:px-6" aria-busy={refreshing}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-halo-gold-dark">{t.jobs.secureMarketplace}</p>
          <h1 className="mt-1 break-words text-2xl font-black text-halo-navy">{t.jobs.greeting}, {firstName(fullName)}</h1>
          <p className="mt-2 text-xs leading-5 text-halo-muted">{t.jobs.intro}</p>
        </div>
        <button
          type="button"
          onClick={() => void refreshRef.current()}
          disabled={refreshing}
          className="min-h-11 shrink-0 rounded-2xl border border-halo-line bg-white px-3 text-xs font-black text-halo-blue disabled:opacity-60"
        >
          {refreshing ? "…" : t.common.refresh}
        </button>
      </div>

      {snapshot && <DriverAvailabilityCard
        userId={userId}
        hasActiveTrip={Boolean(snapshot.activeTrip)}
        onOpenTrip={onOpenTrip}
        language={language}
      />}

      {latestCancellation && !cancellationDismissed && <section className="overflow-hidden rounded-[24px] border border-red-200 bg-white shadow-halo-card" data-driver-cancellation-notice>
        <div className="bg-red-700 px-4 py-4 text-white">
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-white/70">{t.jobs.cancellationEyebrow}</p>
          <h2 className="mt-1 text-lg font-black">{t.jobs.cancellationTitle}</h2>
          <p className="mt-1 text-[10px] text-white/75">{latestCancellation.trackingId}</p>
        </div>
        <div className="p-4">
          <p className="text-xs leading-5 text-halo-muted">{t.jobs.cancellationHelp}</p>
          <div className="mt-3 rounded-2xl bg-red-50 p-3">
            <p className="text-[9px] font-black uppercase tracking-wider text-red-700">{t.jobs.customerReason}</p>
            <p className="mt-1 text-xs font-bold leading-5 text-halo-navy">{latestCancellation.cancellationReason || t.jobs.noReason}</p>
            {latestCancellation.cancelledAt && <p className="mt-2 text-[10px] text-halo-muted">{new Date(latestCancellation.cancelledAt).toLocaleString()}</p>}
          </div>
          <p className="mt-3 text-[10px] text-halo-muted">{latestCancellation.pickupAddress} → {latestCancellation.dropoffAddress}</p>
          <button type="button" onClick={dismissCancellation} className="mt-4 min-h-11 w-full rounded-xl border border-halo-line bg-white px-4 text-xs font-black text-halo-navy">{t.jobs.dismiss}</button>
        </div>
      </section>}

      {snapshot && !snapshot.activeTrip && (
        <section className="grid grid-cols-2 gap-3" aria-label={t.jobs.title}>
          <div className="rounded-[20px] border border-halo-line bg-white p-4 shadow-halo-card">
            <p className="text-xl font-black text-halo-navy">{jobs.length}</p>
            <p className="mt-1 text-[10px] font-bold text-halo-muted">{t.jobs.openJobs}</p>
          </div>
          <div className="rounded-[20px] border border-halo-line bg-white p-4 shadow-halo-card">
            <p className="truncate text-base font-black text-halo-blue">{potential > 0 ? formatEtb(potential, t.jobs.priceMissing) : "—"}</p>
            <p className="mt-1 text-[10px] font-bold text-halo-muted">{t.jobs.totalValue}</p>
          </div>
        </section>
      )}

      {error && (
        <section role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800">
          <p>{error}</p>
          <button type="button" onClick={() => void refreshRef.current()} disabled={refreshing} className="mt-3 min-h-11 w-full rounded-xl bg-red-800 px-4 text-xs font-black text-white disabled:opacity-60">
            {t.jobs.retry}
          </button>
        </section>
      )}

      {!snapshot && refreshing && (
        <section role="status" className="rounded-[24px] border border-halo-line bg-white p-8 text-center text-sm font-bold text-halo-muted">
          {t.jobs.loading}
        </section>
      )}

      {snapshot?.activeTrip && <ActiveTripCard snapshot={snapshot} onOpenTrip={onOpenTrip} language={language} />}

      {snapshot && !snapshot.activeTrip && jobs.length === 0 && (
        <section className="rounded-[24px] border border-halo-line bg-white p-8 text-center shadow-halo-card">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-halo-soft text-xl text-halo-blue">✓</div>
          <h2 className="mt-4 text-lg font-black text-halo-navy">{t.jobs.emptyTitle}</h2>
          <p className="mt-2 text-xs leading-5 text-halo-muted">{t.jobs.emptyHelp}</p>
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
                    <h2 className="mt-3 break-words text-xl font-black text-halo-blue">{formatEtb(job.priceEtb, t.jobs.priceMissing)}</h2>
                  </div>
                  <span className="shrink-0 rounded-xl bg-halo-soft px-2.5 py-2 text-[9px] font-black uppercase text-halo-blue">{t.jobs.openStatus}</span>
                </div>

                <JobRoute job={job} language={language} />

                <div className="mt-5 flex flex-wrap gap-2 text-[10px] font-bold text-halo-muted">
                  <span className="rounded-xl bg-halo-soft px-2.5 py-2">{formatDistance(job.distanceKm, t.jobs.distanceMissing)}</span>
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
                  language={language}
                />

                <button
                  type="button"
                  onClick={() => void claim(job)}
                  disabled={claiming || !selectedTruckId || Boolean(claimingJobId && !claiming)}
                  className="mt-4 min-h-13 w-full rounded-2xl bg-halo-blue px-5 text-sm font-black text-white shadow-halo-button disabled:opacity-50"
                >
                  {claiming ? t.jobs.accepting : t.jobs.claimWithTruck}
                </button>
              </article>
            );
          })}
        </div>
      )}

      {snapshot && (
        <p role="status" className="text-center text-[9px] font-bold uppercase tracking-[0.12em] text-halo-muted">
          {t.jobs.lastVerified} {new Date(snapshot.loadedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
    </div>
  );
}
