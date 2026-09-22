import { useEffect, useRef, useState } from "react";
import {
  fetchDriverPresence,
  updateDriverPresence,
  type DriverPresence,
} from "./driver-presence.service";
import { getDriverV4Copy, type DriverLanguage } from "./driver-v4-i18n";

const UPDATE_INTERVAL_MS = 60_000;

function ageMinutes(value: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? Math.max(0, Math.floor((Date.now() - time) / 60_000)) : null;
}

export function DriverAvailabilityCard({
  userId,
  hasActiveTrip,
  onOpenTrip,
  language = "om",
}: {
  userId: string;
  hasActiveTrip: boolean;
  onOpenTrip: () => void;
  language?: DriverLanguage;
}) {
  const [presence, setPresence] = useState<DriverPresence | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const watchIdRef = useRef<number | null>(null);
  const lastSentAtRef = useRef(0);
  const t = getDriverV4Copy(language);

  function stopWatch() {
    if (watchIdRef.current !== null && typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
  }

  function startWatch() {
    if (typeof navigator === "undefined" || !navigator.geolocation || watchIdRef.current !== null || hasActiveTrip) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (now - lastSentAtRef.current < UPDATE_INTERVAL_MS) return;
        lastSentAtRef.current = now;
        void updateDriverPresence(userId, {
          isAvailable: true,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM: position.coords.accuracy,
        }).then(setPresence).catch(() => undefined);
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 20_000, timeout: 20_000 },
    );
  }

  useEffect(() => {
    let active = true;
    void fetchDriverPresence(userId)
      .then((value) => {
        if (!active) return;
        setPresence(value);
        if (!hasActiveTrip && value?.isAvailable) startWatch();
      })
      .catch((caught) => {
        if (active) setError(t.availability.loadError);
      });
    return () => {
      active = false;
      stopWatch();
    };
  }, [hasActiveTrip, t.availability.loadError, userId]);

  useEffect(() => {
    if (!hasActiveTrip) return;
    stopWatch();
  }, [hasActiveTrip]);

  async function goOnline() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError(t.availability.noLocation);
      return;
    }
    setBusy(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void updateDriverPresence(userId, {
          isAvailable: true,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM: position.coords.accuracy,
        }).then((next) => {
          setPresence(next);
          lastSentAtRef.current = Date.now();
          startWatch();
        }).catch((caught) => {
          setError(t.availability.permission);
        }).finally(() => setBusy(false));
      },
      () => {
        setError(t.availability.permission);
        setBusy(false);
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
  }

  async function goOffline() {
    setBusy(true);
    setError("");
    try {
      stopWatch();
      setPresence(await updateDriverPresence(userId, { isAvailable: false }));
    } catch (caught) {
      setError(t.availability.updateError);
    } finally {
      setBusy(false);
    }
  }

  if (hasActiveTrip) {
    return <section data-driver-availability className="rounded-[24px] border border-amber-200 bg-amber-50 p-4 shadow-halo-card">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-100 text-lg">🚚</span>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-amber-700">{t.availability.activeEyebrow}</p>
          <h2 className="mt-1 text-base font-black text-halo-navy">{t.availability.activeTitle}</h2>
          <p className="mt-1 text-[11px] leading-5 text-halo-muted">{t.availability.activeHelp}</p>
        </div>
      </div>
      <button type="button" onClick={onOpenTrip} className="mt-4 min-h-12 w-full rounded-2xl bg-halo-navy px-4 text-xs font-black text-white">{t.availability.openTrip}</button>
    </section>;
  }

  const online = Boolean(presence?.isAvailable);
  const minutes = ageMinutes(presence?.updatedAt ?? null);
  const fresh = online && minutes !== null && minutes < 30;

  return <section data-driver-availability className={`rounded-[24px] border p-4 shadow-halo-card ${online ? "border-emerald-200 bg-emerald-50" : "border-halo-line bg-white"}`}>
    <div className="flex items-start gap-3">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-lg ${online ? "bg-emerald-100" : "bg-halo-soft"}`}>⌖</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[9px] font-black uppercase tracking-[0.16em] text-halo-gold-dark">{t.availability.eyebrow}</p>
          <span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${online ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-600"}`}>{online ? t.availability.online : t.availability.offline}</span>
        </div>
        <h2 className="mt-1 text-base font-black text-halo-navy">{online ? t.availability.onlineTitle : t.availability.offlineTitle}</h2>
        <p className="mt-1 text-[11px] leading-5 text-halo-muted">{t.availability.help}</p>
        {online && presence && <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold text-halo-muted">
          <span className={fresh ? "text-emerald-700" : "text-amber-700"}>● {fresh ? t.common.live : t.common.stale}</span>
          <span>{t.common.updated} {new Date(presence.updatedAt).toLocaleTimeString()}</span>
          {presence.accuracyM !== null && <span>±{Math.round(presence.accuracyM)} m</span>}
        </div>}
      </div>
    </div>
    {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700">{error}</p>}
    <button
      type="button"
      disabled={busy}
      onClick={() => void (online ? goOffline() : goOnline())}
      className={`mt-4 min-h-12 w-full rounded-2xl px-4 text-xs font-black text-white disabled:opacity-60 ${online ? "bg-red-700" : "bg-emerald-700"}`}
    >
      {busy ? t.availability.checkingGps : online ? t.availability.goOffline : t.availability.goOnline}
    </button>
  </section>;
}
