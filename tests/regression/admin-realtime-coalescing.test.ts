import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path: string) => fs.readFileSync(path, "utf8");
const client = read("src/services/supabase.client.ts");
const finance = read("src/pages/AdminFinanceDashboardV3.tsx");
const reports = read("src/pages/AdminReports.tsx");
const intelligence = read("src/pages/AdminIntelligence.tsx");
const queue = read("src/pages/AdminOrderControlQueue.tsx");
const payments = read("src/pages/AdminPaymentWorkspace.tsx");
const ceo = read("src/pages/AdminCeoOverview.tsx");

test("legacy Admin reload channels are centrally coalesced without broad Admin topic interception", () => {
  assert.match(client, /ADMIN_REALTIME_COALESCE_MS\s*=\s*500/);
  assert.match(client, /\["admin-live-data",\s*"callback"\]/);
  assert.match(client, /\["admin-payment-review",\s*"channel"\]/);
  assert.match(client, /\["admin-payment-ledger-anomalies",\s*"channel"\]/);
  assert.match(client, /\["admin-delivery-reconciliation",\s*"channel"\]/);
  assert.match(client, /\["admin-payment-collection-control",\s*"channel"\]/);
  assert.match(client, /\["admin-driver-document-summary",\s*"channel"\]/);
  assert.doesNotMatch(client, /startsWith\(["']admin-/);
});

test("coalescer preserves section-specific callbacks and clears pending refreshes on unsubscribe", () => {
  assert.match(client, /callbackTimers\s*=\s*new Map/);
  assert.match(client, /callbackTimers\.get\(callback\)/);
  assert.match(client, /channelCallback\s*=\s*callback/);
  assert.match(client, /globalThis\.clearTimeout\(channelTimer\)/);
  assert.match(client, /for \(const timer of callbackTimers\.values\(\)\) globalThis\.clearTimeout\(timer\)/);
  assert.match(client, /channel\.unsubscribe\s*=.*clearPending\(\)/s);
});

test("newer high-volume Admin workspaces keep their existing local burst protection", () => {
  for (const [name, source] of [
    ["Finance V3", finance],
    ["Reports", reports],
    ["Intelligence", intelligence],
    ["Order queue", queue],
    ["Payment workspace", payments],
    ["CEO overview", ceo],
  ] as const) {
    assert.match(source, /setTimeout\(/, `${name} should coalesce realtime refreshes`);
    assert.match(source, /clearTimeout\(/, `${name} should clear pending realtime refreshes`);
  }
});
