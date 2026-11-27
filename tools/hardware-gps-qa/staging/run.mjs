import { readFile } from "node:fs/promises";
import { validateMappings } from "../qa-client.mjs";
import { openPositionStore } from "../position-store.mjs";
import { replicatePositions, stagingConnection, writeToStaging } from "./replicate.mjs";

process.umask(0o077);
try {
  const env = process.env;
  const connection = stagingConnection(env);
  const mappings = validateMappings(JSON.parse(await readFile(env.HALLO_GPS_MAPPINGS_FILE, "utf8")));
  const store = openPositionStore(env.HALLO_GPS_DB_FILE, { readOnly: true });
  try {
    const submitted = await replicatePositions({
      store, mappings, writeBatch: (points) => writeToStaging(connection, points),
    });
    console.log(JSON.stringify({ submitted }));
  } finally {
    store.close();
  }
} catch {
  console.error("Staging export failed. Check the confirmed staging target, protected ledger, approved mappings and credentials.");
  process.exitCode = 1;
}
