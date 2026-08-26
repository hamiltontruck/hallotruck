import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4183;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const viteBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
const esbuildBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild");
const testDirectory = path.join(root, ".admin-partner-onboarding-e2e");
const entryFile = path.join(testDirectory, "entry.mjs");
const bundleFile = path.join(root, "dist", "admin-partner-onboarding-e2e.js");
const htmlFile = path.join(root, "dist", "admin-partner-onboarding-e2e.html");

function findChrome() {
  for (const candidate of [process.env.CHROME_BIN, "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].filter(Boolean)) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (!result.error && result.status === 0) return candidate;
  }
  throw new Error("No supported Chrome/Chromium binary found.");
}
async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const response = await fetch(url); if (response.ok) return; } catch { /* Preview is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Admin Partner onboarding preview server did not start in time.");
}

function render(chrome, width, profileDirectory) {
  const args = ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--hide-scrollbars", `--window-size=${width},1200`, "--virtual-time-budget=6000", `--user-data-dir=${profileDirectory}`, "--dump-dom", `${baseUrl}admin-partner-onboarding-e2e.html`];
  for (const flag of ["--headless=new", "--headless"]) {
    const result = spawnSync(chrome, [flag, ...args], { cwd: root, encoding: "utf8", maxBuffer: 24 * 1024 * 1024, timeout: 30_000 });
    if (!result.error && result.status === 0 && result.stdout) return result.stdout;
  }
  throw new Error(`Chrome could not render Admin Partner onboarding at ${width}px.`);
}

async function prepareFixture() {
  await mkdir(testDirectory, { recursive: true });
  const assetFiles = await readdir(path.join(root, "dist", "assets"));
  const cssFile = assetFiles.find((file) => /^index-.*\.css$/.test(file));
  if (!cssFile) throw new Error("Built application CSS was not found.");

  const source = `
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { AdminToolShell } from ${JSON.stringify(path.join(root, "src", "components", "admin", "AdminToolShell.tsx"))};
import { AdminPartnerControl } from ${JSON.stringify(path.join(root, "src", "pages", "AdminPartnerControl.tsx"))};

const organizationId = "018f0000-0000-7000-8000-000000000001";
const fixture = {
  organizations: [{
    id: organizationId,
    name: "Extremely Long Cross-Border Logistics Partner Organization Name That Must Wrap Safely",
    code: "VERY-LONG-PARTNER-CODE-2026",
    status: "active",
    contact_email: "operations.with.a.very.long.address@partner-logistics.example",
    contact_phone: "+251911123456789012345",
    created_at: "2026-08-26T00:00:00.000Z",
    owner_name: "Abiyu Nagash With A Long Verified Account Name",
    active_member_count: 2,
    partner_role_count: 2,
    active_owner_count: 1,
    project_count: 7,
    pending_document_count: 3,
    pending_payment_count: 2,
    latest_activity: "ownership_transferred",
    latest_activity_at: "2026-08-26T01:00:00.000Z",
  }],
  membersByOrganization: {
    [organizationId]: [
      { id: "membership-owner", partner_id: organizationId, user_id: "user-owner", member_role: "owner", active: true, created_at: "2026-08-26T00:00:00.000Z", full_name: "Abiyu Nagash With A Long Verified Account Name", email: "owner.with.long.email@partner-logistics.example", phone: "+251911123456789012345", profile_role: "partner", account_status: "active" },
      { id: "membership-editor", partner_id: organizationId, user_id: "user-editor", member_role: "editor", active: true, created_at: "2026-08-26T00:10:00.000Z", full_name: "Mebruk Ahmed Partner Operations", email: "mebruk.operations@partner-logistics.example", phone: "+251922123456", profile_role: "partner", account_status: "active" },
    ],
  },
  activityByOrganization: {
    [organizationId]: [{ id: 1, partner_id: organizationId, actor_id: "admin-id", action: "ownership_transferred", entity_type: "membership", entity_id: "membership-editor-with-an-extremely-long-identifier", metadata: { from_user_id: "user-owner", to_user_id: "user-editor" }, created_at: "2026-08-26T01:00:00.000Z" }],
  },
};

createRoot(document.getElementById("root")).render(
  React.createElement(MemoryRouter, { initialEntries: ["/admin/partners"] },
    React.createElement(AdminToolShell, null, React.createElement(AdminPartnerControl, { fixture }))),
);
await new Promise((resolve) => setTimeout(resolve, 400));
document.documentElement.dataset.overflow = String(document.documentElement.scrollWidth > document.documentElement.clientWidth || document.body.scrollWidth > document.body.clientWidth);
document.documentElement.dataset.actions = String(
  Boolean(document.querySelector('a[href="#/partner/login"]'))
  && Boolean(document.querySelector('a[href^="#/partner?organization="]'))
  && Array.from(document.querySelectorAll("button")).some((button) => button.textContent.includes("Open Organization Details"))
  && Array.from(document.querySelectorAll("button")).some((button) => button.textContent.includes("Suspend"))
);
document.documentElement.dataset.uuidPaste = String(document.body.textContent.includes("Profile user ID"));
document.documentElement.dataset.ready = "true";
`;
  await writeFile(entryFile, source, "utf8");
  const bundled = spawnSync(esbuildBinary, [entryFile, "--bundle", "--platform=browser", "--format=esm", "--target=chrome120", `--outfile=${bundleFile}`, "--define:import.meta.env.VITE_SUPABASE_URL=\"https://example.supabase.co\"", "--define:import.meta.env.VITE_SUPABASE_ANON_KEY=\"ci-anon-key\""], { cwd: root, encoding: "utf8" });
  if (bundled.status !== 0) throw new Error(bundled.stderr || "Admin Partner onboarding fixture bundle failed.");
  await writeFile(htmlFile, `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./assets/${cssFile}"></head><body><div id="root"></div><script type="module" src="./admin-partner-onboarding-e2e.js"></script></body></html>`, "utf8");
}

await prepareFixture();
const preview = spawn(viteBinary, ["preview", "--host", host, "--port", String(port), "--strictPort"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
try {
  await waitForServer(baseUrl);
  const chrome = findChrome();
  for (const width of [320, 360, 390, 412]) {
    const profile = await mkdtemp(path.join(os.tmpdir(), "hallotruck-admin-partner-e2e-"));
    try {
      const dom = render(chrome, width, profile);
      for (const expected of ['data-ready="true"', 'data-overflow="false"', 'data-actions="true"', 'data-uuid-paste="false"', "PARTNER ONBOARDING CONTROL", "Onboarding readiness", "Partner login is ready", "Member management", "Audit history", "Transfer ownership to this member"]) {
        if (!dom.includes(expected)) throw new Error(`Admin Partner onboarding ${width}px smoke missing: ${expected}`);
      }
    } finally { await rm(profile, { recursive: true, force: true }); }
  }
  console.log("Admin Partner onboarding browser smoke passed at 320px, 360px, 390px and 412px with working actions and no horizontal overflow.");
} finally {
  preview.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => preview.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 2000))]);
  if (preview.exitCode === null) preview.kill("SIGKILL");
  await Promise.all([rm(testDirectory, { recursive: true, force: true }), rm(bundleFile, { force: true }), rm(htmlFile, { force: true })]);
}
