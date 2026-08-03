// Drivers on the Adama–Djibouti–Mogadishu corridor lose signal far more
// than customers browsing in town, so GPS pings need the same offline
// queue treatment as customer orders — just simpler, since a ping is
// fire-and-forget (no payment step to worry about).
import { sendGpsPing } from "./driver.service";

const PENDING_PINGS_KEY = "hallotruck:pendingPings";

interface PendingPing {
  orderId: string;
  lng: number;
  lat: number;
  heading?: number;
  speedKmh?: number;
  recordedAt: string;
}

function getPendingPings(): PendingPing[] {
  const raw = localStorage.getItem(PENDING_PINGS_KEY);
  return raw ? JSON.parse(raw) : [];
}

function savePendingPings(pings: PendingPing[]) {
  // Cap the queue — if a driver is offline for hours, we only need the
  // most recent handful of pings once connectivity returns, not a full
  // trail (the tracking_pings table is for live position, not routing history).
  localStorage.setItem(PENDING_PINGS_KEY, JSON.stringify(pings.slice(-20)));
}

export async function sendOrQueuePing(params: {
  orderId: string;
  lng: number;
  lat: number;
  heading?: number;
  speedKmh?: number;
}) {
  try {
    await sendGpsPing(params);
  } catch (err) {
    // Network failure (offline or dropped connection) — queue instead of
    // losing the position update.
    if (!navigator.onLine || err instanceof TypeError) {
      savePendingPings([...getPendingPings(), { ...params, recordedAt: new Date().toISOString() }]);
    } else {
      throw err; // a real API error (e.g. not assigned to this order) should surface
    }
  }
}

export async function syncPendingPings(): Promise<number> {
  const pending = getPendingPings();
  if (pending.length === 0) return 0;

  let syncedCount = 0;
  const stillPending: PendingPing[] = [];

  for (const ping of pending) {
    try {
      await sendGpsPing(ping);
      syncedCount++;
    } catch {
      stillPending.push(ping); // keep it queued, try again next sync
    }
  }
  savePendingPings(stillPending);
  return syncedCount;
}

export function getPendingPingCount(): number {
  return getPendingPings().length;
}
