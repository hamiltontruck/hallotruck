// Drivers on the Adama–Djibouti–Mogadishu corridor lose signal far more
// than customers browsing in town, so GPS pings need the same offline
// queue treatment as customer orders — just simpler, since a ping is
// fire-and-forget (no payment step to worry about).
import { sendGpsPing } from "./driver.service";

const PENDING_PINGS_KEY = "hallotruck:pendingPings";

export interface PendingPing {
  orderId: string;
  lng: number;
  lat: number;
  heading?: number;
  speedKmh?: number;
  recordedAt: string;
}

export type GpsPingDeliveryResult = "sent" | "queued";

export interface PendingPingSyncResult {
  syncedCount: number;
  remainingCount: number;
  syncedOrderIds: string[];
}

function getPendingPings(): PendingPing[] {
  const raw = localStorage.getItem(PENDING_PINGS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    localStorage.removeItem(PENDING_PINGS_KEY);
    return [];
  }
}

function savePendingPings(pings: PendingPing[]) {
  // Cap the queue — if a driver is offline for hours, we only need the
  // most recent handful of pings once connectivity returns, not a full
  // trail (the tracking_pings table is for live position, not routing history).
  localStorage.setItem(PENDING_PINGS_KEY, JSON.stringify(pings.slice(-20)));
}

function isNetworkFailure(error: unknown) {
  return !navigator.onLine || error instanceof TypeError;
}

export async function sendOrQueuePing(params: {
  orderId: string;
  lng: number;
  lat: number;
  heading?: number;
  speedKmh?: number;
}): Promise<GpsPingDeliveryResult> {
  try {
    await sendGpsPing(params);
    return "sent";
  } catch (error) {
    // A queued position is not a server-confirmed trip transition. Callers
    // must keep the order in its current database state until a retry succeeds.
    if (isNetworkFailure(error)) {
      savePendingPings([...getPendingPings(), { ...params, recordedAt: new Date().toISOString() }]);
      return "queued";
    }
    throw error; // authorization, assignment and lifecycle failures must remain visible
  }
}

export async function syncPendingPings(): Promise<PendingPingSyncResult> {
  const pending = getPendingPings();
  if (pending.length === 0) {
    return { syncedCount: 0, remainingCount: 0, syncedOrderIds: [] };
  }

  let syncedCount = 0;
  const syncedOrderIds = new Set<string>();
  const stillPending: PendingPing[] = [];

  for (let index = 0; index < pending.length; index += 1) {
    const ping = pending[index];
    try {
      await sendGpsPing(ping);
      syncedCount += 1;
      syncedOrderIds.add(ping.orderId);
    } catch (error) {
      if (isNetworkFailure(error)) {
        stillPending.push(ping);
        continue;
      }

      // Keep this ping and all later entries for an explicit retry. Do not
      // silently swallow database authorization or invalid lifecycle errors.
      savePendingPings([...stillPending, ping, ...pending.slice(index + 1)]);
      throw error;
    }
  }

  savePendingPings(stillPending);
  return {
    syncedCount,
    remainingCount: stillPending.length,
    syncedOrderIds: [...syncedOrderIds],
  };
}

export function getPendingPingCount(): number {
  return getPendingPings().length;
}

export function getPendingPingCountForOrder(orderId: string): number {
  return getPendingPings().filter((ping) => ping.orderId === orderId).length;
}
