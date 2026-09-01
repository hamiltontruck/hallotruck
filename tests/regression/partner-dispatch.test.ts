import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const migration = readFileSync(path.join(root, "supabase", "migrations", "20260901233000_partner_job_request_assignment.sql"), "utf8");
const service = readFileSync(path.join(root, "src", "services", "partner-dispatch.service.ts"), "utf8");
const partnerPage = readFileSync(path.join(root, "src", "pages", "PartnerDispatch.tsx"), "utf8");
const adminPage = readFileSync(path.join(root, "src", "pages", "AdminPartnerDispatch.tsx"), "utf8");
const hub = readFileSync(path.join(root, "src", "pages", "PartnerOperationsHub.tsx"), "utf8");
const app = readFileSync(path.join(root, "src", "App.tsx"), "utf8");
const adminMore = readFileSync(path.join(root, "src", "pages", "AdminMore.tsx"), "utf8");

const compact = (value: string) => value.replace(/\s+/g, " ");

test("Partner job requests are auditable, idempotent and RPC-only", () => {
  assert.match(migration, /create table if not exists public\.partner_job_requests/i);
  assert.match(migration, /request_key uuid not null unique/i);
  assert.match(migration, /response_request_key uuid unique/i);
  assert.match(migration, /confirmation_request_key uuid unique/i);
  assert.match(migration, /where status in \('pending','accepted'\)/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /partner_job_requests_leadership_read[\s\S]*private\.is_admin_or_ceo/i);
  assert.match(migration, /partner_job_requests_partner_read[\s\S]*private\.is_partner_member/i);
  assert.match(migration, /revoke insert, update, delete on public\.partner_job_requests from authenticated/i);
  assert.match(migration, /revoke all on function public\.admin_offer_partner_job[\s\S]*from public,anon/i);
  assert.match(migration, /grant execute on function public\.partner_respond_job_request[\s\S]*to authenticated/i);
});

test("Admin offer and confirmation use current database authorization and preserve dispatch guards", () => {
  const sql = compact(migration);
  assert.match(sql, /admin_offer_partner_job[\s\S]*private\.is_admin_or_ceo/);
  assert.match(sql, /Only unassigned placed orders can be offered to a Partner/);
  assert.match(sql, /Active Partner organization not found/);
  assert.match(sql, /admin_confirm_partner_job_request[\s\S]*private\.is_admin_or_ceo/);
  assert.match(sql, /truck_type_can_fulfill/);
  assert.match(sql, /dispatch_documents_valid/);
  assert.match(sql, /Partner driver already has an active trip|Selected Partner driver already has an active trip/);
  assert.match(sql, /update public\.orders set truck_id=v_truck\.id,driver_id=v_driver\.id,status='accepted'/);
  assert.match(sql, /update public\.trucks set status='assigned',driver_id=v_driver\.id/);
  assert.doesNotMatch(sql, /auth\.jwt\(\).*app_metadata/);
});

test("Partner acceptance is tenant-scoped and cannot claim an arbitrary driver", () => {
  const sql = compact(migration);
  assert.match(sql, /membership\.user_id=v_actor/);
  assert.match(sql, /membership\.member_role in \('owner','admin'\)/);
  assert.match(sql, /organization\.status='active'/);
  assert.match(sql, /where id=p_truck_id and partner_id=v_request\.partner_id/);
  assert.match(sql, /partner_fleet_vehicles[\s\S]*partner_id=v_request\.partner_id and truck_id=p_truck_id/);
  assert.match(sql, /v_partner_vehicle\.assigned_driver_id is null/);
  assert.match(sql, /v_truck\.driver_id is distinct from v_partner_vehicle\.assigned_driver_id/);
  assert.match(sql, /role::text <> 'driver'/);
  assert.match(sql, /driver_status::text <> 'approved'/);
});

test("Partner and Admin UIs expose the complete request lifecycle on mobile", () => {
  assert.match(service, /admin_offer_partner_job/);
  assert.match(service, /partner_respond_job_request/);
  assert.match(service, /admin_confirm_partner_job_request/);
  assert.match(service, /admin_cancel_partner_job_request/);
  assert.match(service, /fleet_enterprise_vehicles/);
  assert.match(partnerPage, /dispatch_ready/);
  assert.match(partnerPage, /assigned_driver_id/);
  assert.match(partnerPage, /Accept job/);
  assert.match(partnerPage, /HALLO Admin for final confirmation/);
  assert.match(adminPage, /Send Partner job request/);
  assert.match(adminPage, /Confirm truck & driver assignment/);
  assert.match(adminPage, /Cancel request/);
  assert.match(partnerPage, /overflow-x-hidden/);
  assert.match(adminPage, /overflow-x-hidden/);
  assert.match(partnerPage, /grid-cols-2/);
  assert.match(adminPage, /grid-cols-2/);
});

test("Partner dispatch routes are protected and discoverable", () => {
  assert.match(app, /path="\/partner\/jobs"[\s\S]*PartnerGate[\s\S]*PartnerDispatch/);
  assert.match(app, /path="\/admin\/partner-dispatch"[\s\S]*AdminGate[\s\S]*AdminPartnerDispatch/);
  assert.match(app, /PartnerOperationsHub/);
  assert.match(hub, /Jobs & assignments/);
  assert.match(adminMore, /Partner job dispatch/);
  assert.match(adminMore, /\/admin\/partner-dispatch/);
});
