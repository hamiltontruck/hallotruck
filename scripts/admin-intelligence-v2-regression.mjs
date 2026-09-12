import fs from "node:fs";
import assert from "node:assert/strict";

const page = fs.readFileSync("src/pages/AdminIntelligence.tsx", "utf8");
const service = fs.readFileSync("src/services/admin-intelligence-v2.service.ts", "utf8");
const legacyService = fs.readFileSync("src/services/admin-intelligence.service.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260912002822_admin_intelligence_v2_reporting.sql", "utf8");
const marker = fs.readFileSync("supabase/production-migration-version.txt", "utf8").trim();

assert.match(page, /getAdminIntelligenceV2\(/, "Admin Intelligence production UI must use DB reporting");
assert.doesNotMatch(page, /getAdminIntelligenceData\(/, "Admin Intelligence production UI must not use full-history loader");
assert.match(service, /supabase\.rpc\(\"admin_intelligence_v2\"/, "service must call the V2 RPC");
assert.match(service, /p_search_limit/, "search must remain bounded");
assert.match(service, /p_search_offset/, "search must remain paginated");
assert.match(migration, /Africa\/Addis_Ababa/, "reporting ranges must use Ethiopia-local day boundaries");
assert.match(migration, /security invoker/i, "RPC must remain SECURITY INVOKER");
assert.match(migration, /private\.is_admin_or_ceo\(\)/, "RPC must enforce database-backed leadership authorization");
assert.match(migration, /revoke execute on function public\.admin_intelligence_v2\(text,text,integer,integer\) from public/i, "PUBLIC execute must stay revoked");
assert.match(migration, /revoke execute on function public\.admin_intelligence_v2\(text,text,integer,integer\) from anon/i, "anon execute must stay revoked");
assert.match(migration, /limit v_limit offset v_offset/i, "search rows must be bounded and offset-paginated in PostgreSQL");
assert.equal(marker, "20260912002822", "production migration marker must match Admin Intelligence V2 migration");
assert.match(legacyService, /allPages<AdminOrder>/, "legacy loader remains isolated for compatibility until removal is separately audited");

console.log("Admin Intelligence V2 regression: PASS");
