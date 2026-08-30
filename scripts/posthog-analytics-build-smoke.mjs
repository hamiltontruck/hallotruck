import { spawnSync } from "node:child_process";
import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const configuredBuildDirectory = path.join(root, ".posthog-build-smoke");
const viteBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
const analyticsSource = await readFile(path.join(root, "src", "services", "analytics.ts"), "utf8");
const analyticsDomainSource = await readFile(path.join(root, "src", "domain", "analytics.ts"), "utf8");
const documentation = await readFile(path.join(root, "docs", "POSTHOG_ANALYTICS.md"), "utf8");

try {
  await rm(configuredBuildDirectory, { recursive: true, force: true });
  const configuredBuild = spawnSync(viteBinary, ["build", "--outDir", configuredBuildDirectory, "--emptyOutDir"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      VITE_POSTHOG_PROJECT_TOKEN: "phc_ci_build_only",
      VITE_POSTHOG_HOST: "https://us.i.posthog.com",
      VITE_RELEASE_SHA: "posthog-build-smoke",
    },
  });
  if (configuredBuild.error) throw configuredBuild.error;
  if (configuredBuild.status !== 0) {
    throw new Error(configuredBuild.stderr || configuredBuild.stdout || "Configured PostHog production build failed.");
  }

  const assets = await readdir(path.join(configuredBuildDirectory, "assets"));
  const javascriptFiles = assets.filter((file) => file.endsWith(".js"));
  if (!javascriptFiles.length) throw new Error("Configured production JavaScript bundle was not found.");
  const bundles = await Promise.all(javascriptFiles.map((file) => readFile(path.join(configuredBuildDirectory, "assets", file), "utf8")));
  const bundledSource = bundles.join("\n");

  for (const marker of ["hallo-posthog-sdk", "/static/1/array.js", "phc_ci_build_only"]) {
    if (!bundledSource.includes(marker)) {
      throw new Error(`Configured PostHog production bundle is missing runtime marker ${marker}.`);
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

  console.log("PostHog analytics build smoke passed: configured runtime bundled, event contract present, HashRouter tracking available, and broad sensitive capture remains disabled.");
} finally {
  await rm(configuredBuildDirectory, { recursive: true, force: true });
}
