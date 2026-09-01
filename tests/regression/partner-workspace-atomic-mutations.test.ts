import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const migration = readFileSync(
  path.join(process.cwd(), "supabase", "migrations", "20260901080000_atomic_partner_workspace_mutations.sql"),
  "utf8",
);
const service = readFileSync(
  path.join(process.cwd(), "src", "services", "partner.service.ts"),
  "utf8",
);

test("Partner project creation commits the project and activity event atomically", () => {
  assert.match(migration, /create or replace function public\.partner_create_project/i);
  assert.match(migration, /private\.can_manage_partner\(p_partner_id\)/i);
  assert.match(migration, /insert into public\.partner_projects[\s\S]*insert into public\.partner_activity_log/i);
  assert.match(migration, /partner_projects_request_key_unique/i);
  assert.match(service, /supabase\.rpc\("partner_create_project"/i);
});

test("Partner progress update commits project state, history and activity together", () => {
  assert.match(migration, /create or replace function public\.partner_update_project_progress/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /update public\.partner_projects[\s\S]*insert into public\.partner_project_progress[\s\S]*insert into public\.partner_activity_log/i);
  assert.match(migration, /partner_project_progress_request_key_unique/i);
  assert.match(service, /supabase\.rpc\("partner_update_project_progress"/i);
});

test("Partner document metadata and upload activity use an idempotent RPC", () => {
  assert.match(migration, /create or replace function public\.partner_register_document/i);
  assert.match(migration, /v_storage_path not like p_partner_id::text \|\| '\/%'/i);
  assert.match(migration, /project does not belong to the Partner organization/i);
  assert.match(migration, /folder does not belong to the Partner organization/i);
  assert.match(migration, /insert into public\.partner_documents[\s\S]*insert into public\.partner_activity_log/i);
  assert.match(migration, /partner_documents_request_key_unique/i);
  assert.match(service, /supabase\.rpc\("partner_register_document"/i);
});

test("Direct Partner business mutations are replaced by guarded RPC calls", () => {
  const createProject = service.match(/export async function createPartnerProject[\s\S]*?\n}\n\nexport async function updatePartnerProjectProgress/)?.[0] ?? "";
  const updateProgress = service.match(/export async function updatePartnerProjectProgress[\s\S]*?\n}\n\nexport async function sendPartnerMessage/)?.[0] ?? "";
  const uploadDocument = service.match(/export async function uploadPartnerDocument[\s\S]*?\n}\n\nexport async function openPartnerDocument/)?.[0] ?? "";
  assert.doesNotMatch(createProject, /\.from\("partner_projects"\)\.insert/i);
  assert.doesNotMatch(updateProgress, /\.from\("partner_projects"\)\.update/i);
  assert.doesNotMatch(updateProgress, /\.from\("partner_project_progress"\)\.insert/i);
  assert.doesNotMatch(uploadDocument, /\.from\("partner_documents"\)\.insert/i);
  assert.match(migration, /revoke insert, update on table public\.partner_projects from authenticated/i);
  assert.match(migration, /revoke insert on table public\.partner_project_progress from authenticated/i);
  assert.match(migration, /revoke insert on table public\.partner_documents from authenticated/i);
});

test("Document upload preserves committed metadata on ambiguous client failures", () => {
  assert.match(service, /\.eq\("storage_path", path\)[\s\S]*\.maybeSingle\(\)/i);
  assert.match(service, /if \(existing\) return existing as PartnerDocument/i);
  assert.match(service, /storage\.from\("partner-documents"\)\.remove\(\[path\]\)/i);
});
