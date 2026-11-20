// Reads a fresh fix for the configured QA tracker. Prints counts only.
import { createTraccarClient, latestValidFix } from "./client.mjs";
const {
  TRACCAR_URL: baseUrl, TRACCAR_TOKEN: token, TRACCAR_EMAIL: email,
  TRACCAR_PASSWORD: password, TRACCAR_DEVICE_UNIQUE_ID: deviceUniqueId,
} = process.env;

if (!baseUrl || !(token || (email && password)) || !deviceUniqueId) {
  console.error("Set TRACCAR_URL, Traccar credentials and TRACCAR_DEVICE_UNIQUE_ID.");
  process.exitCode = 2;
} else {
  try {
    const client = createTraccarClient({ baseUrl, token, email, password });
    const devices = await client.devices();
    const matches = devices.filter((device) => device?.uniqueId === deviceUniqueId);
    const positions = await client.positions();
    const fix = matches.length === 1 ? latestValidFix(positions, matches[0].id) : null;
    const hasFreshFix = Boolean(fix && !fix.stale);
    console.log(JSON.stringify({ api: "connected", deviceCount: devices.length, positionCount: positions.length, hasFreshFix }));
    if (!hasFreshFix) {
      console.error("No fresh valid fix for the configured tracker.");
      process.exitCode = 3;
    }
  } catch (error) {
    console.error("Traccar connection failed:", error.message);
    process.exitCode = 1;
  }
}
