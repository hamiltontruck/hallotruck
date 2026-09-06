import type { DriverActiveTripOrder } from "./driver-active-trip.model";
import type { DriverTrackingPing } from "./driver-active-trip.service";

const DRIVER_GPS_QUEUE_KEY = "hallo-mobile-driver-gps-v1";
const MAX_SCOPE_PINGS = 20;
const MAX_TOTAL_PINGS = 60;

export type QueuedDriverPing = DriverTrackingPing & {
  userId: string;
};

type PingSender = (ping: DriverTrackingPing) => Promise<DriverActiveTripOrder>;

type QueueSyncResult = {
  sentCount: number;
  remainingCount: number;
  latestTrip: DriverActiveTripOrder | null;
};

function storageAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function validPing(value: unknown): value is QueuedDriverPing {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.userId === "string"
    && row.userId.length > 0
    && typeof row.orderId === "string"
    && row.orderId.length > 0
    && typeof row.lng === "number"
    && Number.isFinite(row.lng)
    && typeof row.lat === "number"
    && Number.isFinite(row.lat)
    && typeof row.recordedAt === "string"
    && row.recordedAt.length > 0;
}

function readQueue(): QueuedDriverPing[] {
  if (!storageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(DRIVER_GPS_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(validPing) : [];
  } catch {
    try {
      window.localStorage.removeItem(DRIVER_GPS_QUEUE_KEY);
    } catch {
      // Storage can be unavailable in strict private browsing modes.
    }
    return [];
  }
}

function writeQueue(queue: QueuedDriverPing[]): void {
  if (!storageAvailable()) return;
  try {
    window.localStorage.setItem(DRIVER_GPS_QUEUE_KEY, JSON.stringify(queue.slice(-MAX_TOTAL_PINGS)));
  } catch {
    // A failed local write must not turn an offline GPS update into a false server success.
  }
}

export function getQueuedDriverPingCount(userId: string, orderId: string): number {
  return readQueue().filter((ping) => ping.userId === userId && ping.orderId === orderId).length;
}

export function enqueueDriverPing(userId: string, ping: DriverTrackingPing): number {
  const queue = readQueue();
  const sameScope = queue.filter((entry) => entry.userId === userId && entry.orderId === ping.orderId);
  const otherScopes = queue.filter((entry) => entry.userId !== userId || entry.orderId !== ping.orderId);
  const nextScope = [...sameScope, { ...ping, userId }].slice(-MAX_SCOPE_PINGS);
  writeQueue([...otherScopes, ...nextScope]);
  return nextScope.length;
}

export function clearQueuedDriverPings(userId: string, orderId: string): void {
  writeQueue(readQueue().filter((ping) => ping.userId !== userId || ping.orderId !== orderId));
}

export async function syncQueuedDriverPings(
  userId: string,
  orderId: string,
  send: PingSender,
  isNetworkFailure: (error: unknown) => boolean,
): Promise<QueueSyncResult> {
  const all = readQueue();
  const scoped = all.filter((ping) => ping.userId === userId && ping.orderId === orderId);
  const untouched = all.filter((ping) => ping.userId !== userId || ping.orderId !== orderId);
  if (scoped.length === 0) return { sentCount: 0, remainingCount: 0, latestTrip: null };

  let sentCount = 0;
  let latestTrip: DriverActiveTripOrder | null = null;
  const remaining: QueuedDriverPing[] = [];

  for (let index = 0; index < scoped.length; index += 1) {
    const queued = scoped[index];
    const { userId: _userId, ...ping } = queued;
    try {
      latestTrip = await send(ping);
      sentCount += 1;
    } catch (error) {
      if (isNetworkFailure(error)) {
        remaining.push(queued, ...scoped.slice(index + 1));
        break;
      }
      writeQueue([...untouched, ...remaining, queued, ...scoped.slice(index + 1)]);
      throw error;
    }
  }

  writeQueue([...untouched, ...remaining]);
  return {
    sentCount,
    remainingCount: remaining.length,
    latestTrip,
  };
}

export const driverGpsQueueStorageKey = DRIVER_GPS_QUEUE_KEY;
