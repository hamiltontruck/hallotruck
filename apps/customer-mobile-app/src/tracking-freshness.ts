export type TrackingFreshness = "LIVE" | "STALE" | "OFFLINE";

export const TRACKING_LIVE_MAX_AGE_MS = 2 * 60 * 1000;
export const TRACKING_OFFLINE_AFTER_MS = 30 * 60 * 1000;

export function classifyTrackingFreshness(
  recordedAt: string | null | undefined,
  nowMs = Date.now(),
): TrackingFreshness {
  if (!recordedAt) return "OFFLINE";
  const recordedAtMs = new Date(recordedAt).getTime();
  if (!Number.isFinite(recordedAtMs)) return "OFFLINE";

  const ageMs = nowMs - recordedAtMs;
  if (ageMs < 0) return "OFFLINE";
  if (ageMs <= TRACKING_LIVE_MAX_AGE_MS) return "LIVE";
  if (ageMs <= TRACKING_OFFLINE_AFTER_MS) return "STALE";
  return "OFFLINE";
}
