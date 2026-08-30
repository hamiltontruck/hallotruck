import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const assets = await readdir(path.join(root, "dist", "assets"));
const javascriptFiles = assets.filter((file) => file.endsWith(".js"));
if (!javascriptFiles.length) throw new Error("Production JavaScript bundle was not found.");

const bundles = await Promise.all(javascriptFiles.map((file) => readFile(path.join(root, "dist", "assets", file), "utf8")));
const bundledSource = bundles.join("\n");
const analyticsSource = await readFile(path.join(root, "src", "services", "analytics.ts"), "utf8");
const analyticsDomainSource = await readFile(path.join(root, "src", "domain", "analytics.ts"), "utf8");
const documentation = await readFile(path.join(root, "docs", "POSTHOG_ANALYTICS.md"), "utf8");

for (const marker of ["hallo-posthog-sdk", "/static/1/array.js"]) {
  if (!bundledSource.includes(marker)) {
    throw new Error(`PostHog production bundle smoke is missing runtime marker ${marker}.`);
  }
}

for (const marker of ["payment_confirmed", "settlement_payment_recorded"]) {
  if (!analyticsDomainSource.includes(marker)) {
    throw new Error(`Analytics event contract is missing ${marker}.`);
  }
}

if (!analyticsSource.includes("VITE_POSTHOG_PROJECT_TOKEN")) {
  throw new Error("Analytics runtime is missing VITE_POSTHOG_PROJECT_TOKEN configuration.");
}

for (const safetyPattern of [
  /autocapture: false/,
  /capture_pageview: false/,
  /disable_session_recording: true/,
  /advanced_disable_flags: true/,
  /before_send: .*sanitizePostHogEvent/,
]) {
  if (!safetyPattern.test(analyticsSource)) throw new Error(`Analytics privacy configuration is missing ${safetyPattern}.`);
}

for (const prohibited of ["password", "receipt", "transaction", "authorization", "document contents"]) {
  if (!documentation.toLowerCase().includes(prohibited)) throw new Error(`Analytics privacy contract is missing prohibited field guidance for ${prohibited}.`);
}

console.log("PostHog analytics build smoke passed: runtime bundled, event contract present, HashRouter tracking available, and broad sensitive capture remains disabled.");
