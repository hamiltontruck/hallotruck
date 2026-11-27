// Exercises authentication on an actual running Traccar server.
// Does not need GPS hardware, does not fabricate device positions or write data.
import { createTraccarClient } from "./client.mjs";
const { TRACCAR_URL: baseUrl, TRACCAR_TOKEN: token, TRACCAR_EMAIL: email, TRACCAR_PASSWORD: password } = process.env;
if (!baseUrl || !(token || (email && password))) {
  console.error("Missing TRACCAR_URL and auth credentials; no test executed.");
  process.exitCode = 2;
} else {
  try {
    const client = createTraccarClient({ baseUrl, token, email, password });
    const devices = await client.devices();
    console.log(JSON.stringify({ auth: "PASS", api: "/api/devices", deviceCount: devices.length, realGpsVerified: false }));
  } catch (error) {
    console.error("Real Traccar authentication FAILED:", error.message);
    process.exitCode = 1;
  }
}
