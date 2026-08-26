import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  belongsToPartner,
  buildPartnerDashboardSummary,
  canManagePartnerWorkspace,
  canOpenPartnerPortal,
} from "../../src/domain/partner-foundation";

test("Partner role gate allows only the dedicated Partner role", () => {
  assert.equal(canOpenPartnerPortal("partner"), true);
  assert.equal(canOpenPartnerPortal("admin"), false);
  assert.equal(canOpenPartnerPortal("ceo"), false);
  assert.equal(canOpenPartnerPortal("customer"), false);
  assert.equal(canOpenPartnerPortal("driver"), false);
  assert.equal(canOpenPartnerPortal(null), false);
});

test("Partner write permissions separate viewers from managers", () => {
  assert.equal(canManagePartnerWorkspace("partner", "owner"), true);
  assert.equal(canManagePartnerWorkspace("partner", "admin"), true);
  assert.equal(canManagePartnerWorkspace("partner", "editor"), true);
  assert.equal(canManagePartnerWorkspace("partner", "viewer"), false);
  assert.equal(canManagePartnerWorkspace("admin", "viewer"), true);
  assert.equal(canManagePartnerWorkspace("ceo", null), true);
});

test("Cross-partner records are never included without membership", () => {
  assert.equal(belongsToPartner("partner-a", ["partner-a"]), true);
  assert.equal(belongsToPartner("partner-b", ["partner-a"]), false);
});

test("Partner dashboard summaries reconcile projects, payments, documents and members", () => {
  const summary = buildPartnerDashboardSummary({
    projects: [{ status: "active" }, { status: "planned" }, { status: "completed" }],
    payments: [
      { amount_etb: 50_000, status: "paid" },
      { amount_etb: 20_000, status: "approved" },
      { amount_etb: 10_000, status: "pending" },
      { amount_etb: 5_000, status: "rejected" },
    ],
    documents: [{ status: "pending" }, { status: "approved" }],
    members: [{ active: true }, { active: false }, { active: true }],
  });
  assert.deepEqual(summary, {
    projects: 3,
    activeProjects: 1,
    paidEtb: 50_000,
    pendingEtb: 30_000,
    pendingDocuments: 1,
    activeMembers: 2,
  });
});

test("Partner migration enforces RLS, Data API grants and private storage", () => {
  const migration = readFileSync(path.join(process.cwd(), "supabase", "migrations", "20260825_logistics_partner_foundation.sql"), "utf8");
  for (const table of ["partner_organizations", "partner_memberships", "partner_projects", "partner_project_progress", "partner_payments", "partner_folders", "partner_documents", "partner_document_reviews", "partner_activity_log", "partner_messages"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(migration, /grant select,insert,update,delete on public\.partner_organizations/i);
  assert.match(migration, /revoke all on public\.partner_organizations[\s\S]*from anon/i);
  assert.match(migration, /private\.is_partner_member\(partner_id\)/i);
  assert.match(migration, /private\.is_admin_or_ceo\(\)/i);
  assert.match(migration, /storage\.buckets\(id,name,public[\s\S]*'partner-documents'[\s\S]*false/i);
  assert.match(migration, /bucket_id='partner-documents'/i);
  assert.doesNotMatch(migration, /raw_user_meta_data|user_metadata/i);
});

test("Partner routes are protected and existing protected routes remain present", () => {
  const app = readFileSync(path.join(process.cwd(), "src", "App.tsx"), "utf8");
  assert.match(app, /path="\/partner" element={<PartnerGate><PartnerPortal \/><\/PartnerGate>}/);
  assert.match(app, /path="\/admin\/partners" element={<AdminGate>/);
  assert.match(app, /path="\/admin" element={<AdminGate>/);
  assert.match(app, /path="\/customer" element={<CustomerGate>/);
  assert.match(app, /path="\/driver\/jobs" element={<DriverGate>/);
});

test("Partner UI includes projects, documents, payments, activity, chat and mobile overflow protection", () => {
  const partner = readFileSync(path.join(process.cwd(), "src", "pages", "PartnerPortal.tsx"), "utf8");
  const admin = readFileSync(path.join(process.cwd(), "src", "pages", "AdminPartnerControl.tsx"), "utf8");
  for (const label of ["projects", "payments", "documents", "activity", "chat"]) assert.match(partner, new RegExp(label, "i"));
  assert.match(partner, /overflow-x-hidden/);
  assert.match(partner, /min-w-0/);
  assert.match(admin, /Document review queue/);
  assert.match(admin, /Assign existing account/);
  assert.match(admin, /overflow-x-hidden/);
});
