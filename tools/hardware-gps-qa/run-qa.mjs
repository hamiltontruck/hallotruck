import { readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createTraccarClient, ensureRegistered, hasVerifiedProtocol, validateMappings, verifyReadAccess } from "./qa-client.mjs";
import { openPositionStore, syncPositions } from "./position-store.mjs";

process.umask(0o077);
const modes = new Set(["verify", "register", "once", "watch"]);
const mode = process.argv[2];

async function main() {
  if (!modes.has(mode) || process.env.HALLO_GPS_ENV !== "qa" || !process.env.HALLO_GPS_MAPPINGS_FILE) {
    throw new Error("Set HALLO_GPS_ENV=qa and HALLO_GPS_MAPPINGS_FILE, then choose verify, register, once, or watch");
  }
  let mappings;
  try {
    mappings = validateMappings(JSON.parse(await readFile(process.env.HALLO_GPS_MAPPINGS_FILE, "utf8")));
  } catch {
    throw new Error("Could not read valid QA mappings");
  }
  const awaitsProtocol = (mapping) => !hasVerifiedProtocol(mapping);
  const pendingProtocol = mappings.filter(awaitsProtocol).length;
  const api = createTraccarClient({
    baseUrl: process.env.TRACCAR_URL,
    token: mode === "register" ? process.env.TRACCAR_REGISTRATION_TOKEN : process.env.TRACCAR_TOKEN,
  });
  if (mode === "register") {
    for (const mapping of mappings) await ensureRegistered(api, mapping);
    console.log(JSON.stringify({ registered: mappings.length, pendingProtocol }));
    return;
  }
  if (mode === "verify") {
    const registered = await verifyReadAccess(api, mappings);
    console.log(JSON.stringify({ authenticated: true, registered, historyReadable: true, pendingProtocol }));
    return;
  }
  const file = process.env.HALLO_GPS_DB_FILE;
  if (!file || file === ":memory:") throw new Error("Set HALLO_GPS_DB_FILE to a protected persistent QA path");
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const store = openPositionStore(file);
  try {
    let delay = 30_000;
    const stop = new AbortController();
    process.once("SIGINT", () => stop.abort());
    process.once("SIGTERM", () => stop.abort());
    do {
      try {
        const result = await syncPositions({ api, store, mappings });
        const statuses = { LIVE: 0, STALE: 0, OFFLINE: 0 };
        for (const mapping of mappings) {
          const status = awaitsProtocol(mapping) ? "OFFLINE" : store.latest(mapping).status;
          statuses[status]++;
        }
        console.log(JSON.stringify({ ...result, statuses, pendingProtocol }));
        delay = 30_000;
      } catch (error) {
        if (mode === "once" || /HTTP (400|401|403|404)\b/.test(error.message)) throw error;
        delay = Math.min(delay * 2, 300_000);
        console.error(`QA poll failed. Retry in ${delay / 1000}s.`);
      }
      if (mode === "watch" && !stop.signal.aborted) {
        await sleep(delay, undefined, { signal: stop.signal }).catch((error) => {
          if (error.name !== "AbortError") throw error;
        });
      }
    } while (mode === "watch" && !stop.signal.aborted);
  } finally {
    store.close();
  }
}

main().catch((error) => {
  const safe = /^(Set |Could not read valid QA mappings|Only the approved Traccar|Traccar QA token|Unexpected Traccar QA (device|history) scope|Missing or ambiguous QA device registration|QA device registration name conflict|Traccar API HTTP \d{3}$|Traccar QA request failed$)/;
  console.error(safe.test(error.message) ? error.message : "QA command failed");
  process.exitCode = 1;
});
