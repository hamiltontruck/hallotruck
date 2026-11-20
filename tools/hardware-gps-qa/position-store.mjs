import { DatabaseSync } from "node:sqlite";
import { normalizeTraccarPosition, positionStatus } from "./traccar-adapter.mjs";
import { resolveDevice, validateMappings } from "./qa-client.mjs";

const DAY = 86_400_000;
const FUTURE_TOLERANCE = 300_000;
const MAX_REPORT_ROWS = 50_000;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)$/;

export function openPositionStore(filename) {
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS points (
      source_id INTEGER PRIMARY KEY,
      device_key TEXT NOT NULL,
      truck_id TEXT NOT NULL,
      fix_ms INTEGER NOT NULL,
      received_ms INTEGER NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      speed_kmh REAL,
      heading REAL,
      ignition INTEGER,
      UNIQUE (device_key, fix_ms, latitude, longitude)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS points_latest ON points (device_key, truck_id, fix_ms DESC, source_id DESC);
  `);
  const insert = db.prepare(`
    INSERT INTO points VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING
  `);
  const latest = db.prepare(`
    SELECT fix_ms, latitude, longitude, speed_kmh, heading, ignition FROM points
    WHERE device_key = ? AND truck_id = ? AND fix_ms <= ?
    ORDER BY fix_ms DESC, source_id DESC LIMIT 1
  `);
  const trim = db.prepare("DELETE FROM points WHERE fix_ms < ?");
  return {
    commit(key, points, now) {
      db.exec("BEGIN IMMEDIATE");
      try {
        let inserted = 0;
        for (const point of points) {
          const { sourceId, truck_id, fixMs, latitude, longitude, speed_kmh, heading, ignition } = point;
          inserted += insert.run(sourceId, key, truck_id, fixMs, now, latitude, longitude,
            speed_kmh, heading, ignition === null ? null : Number(ignition)).changes;
        }
        trim.run(now - 7 * DAY);
        db.exec("COMMIT");
        return inserted;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
    latest(mapping, now = Date.now()) {
      const row = latest.get(mapping.uniqueId, mapping.truckId, now);
      if (!row) return { status: "OFFLINE", fixTime: null, location: null };
      const { fix_ms, ignition, ...location } = row;
      return {
        status: positionStatus(now - fix_ms),
        fixTime: new Date(fix_ms).toISOString(),
        location: { ...location, ignition: ignition === null ? null : Boolean(ignition) },
      };
    },
    close: () => db.close(),
  };
}

function normalizePosition(row, device, mapping, now) {
  if (!row || row.deviceId !== device.id || row.protocol !== "h02" || row.valid !== true ||
      !Number.isSafeInteger(row.id) || row.id < 1 || typeof row.fixTime !== "string" ||
      !TIMESTAMP.test(row.fixTime)) return null;
  const fix = new Date(row.fixTime);
  const date = row.fixTime.slice(0, 10);
  const utcDate = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(fix.getTime()) || !Number.isFinite(utcDate.getTime()) ||
      utcDate.toISOString().slice(0, 10) !== date) return null;
  try {
    const point = normalizeTraccarPosition(row, [device], [
      { gps_provider: "traccar", gps_external_id: mapping.uniqueId, truck_id: mapping.truckId },
    ], new Date(now));
    return { ...point, sourceId: row.id, fixMs: fix.getTime() };
  } catch {
    return null;
  }
}

export async function syncPositions({ api, store, mappings: input, now = Date.now() }) {
  if (!Number.isSafeInteger(now) || now < DAY) throw new Error("Invalid QA clock");
  const mappings = validateMappings(input);
  const devices = await api.devices();
  const registrations = mappings.map((mapping) => [mapping, resolveDevice(devices, mapping)]);
  let inserted = 0;
  let rejected = 0;
  for (const [mapping, device] of registrations) {
    // Traccar filters history by fix time. Rescan the bounded replay window to
    // catch late reports even when their fix time precedes the last API poll.
    const windows = [[now - DAY, now + FUTURE_TOLERANCE]];
    while (windows.length) {
      const [from, to] = windows.pop();
      const rows = await api.history(device.id, from, to);
      if (rows.length >= MAX_REPORT_ROWS) {
        if (from === to) throw new Error("Traccar history exceeds the replay limit");
        const split = Math.floor((from + to) / 2);
        windows.push([split + 1, to], [from, split]);
        continue;
      }
      const points = [];
      for (const row of rows) {
        const point = normalizePosition(row, device, mapping, now);
        if (point && point.fixMs >= from && point.fixMs <= to) points.push(point);
        else rejected++;
      }
      inserted += store.commit(mapping.uniqueId, points, now);
    }
  }
  return { inserted, rejected };
}
