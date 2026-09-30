import fs from "node:fs";
import assert from "node:assert/strict";

const page = fs.readFileSync("src/pages/AdminDriverCompliance.tsx", "utf8");
const component = fs.readFileSync("src/components/admin/AdminDriverDocumentRegister.tsx", "utf8");
const service = fs.readFileSync("src/services/admin-driver-document-register.service.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20261001003000_admin_driver_document_register_page.sql", "utf8");

for (const token of [
  "AdminDriverDocumentRegister",
  "Document register",
  "Driver / phone / plate",
  "Expiring soon",
  "Expired",
]) assert.ok(component.includes(token), `Document register UI token missing: ${token}`);

for (const token of [
  "Driver", "Truck / plate", "Document", "Expiry", "Status", "Updated", "Reviewer", "Actions",
  "30 days", "14 days", "7 days",
]) assert.ok(component.includes(token), `Desktop table token missing: ${token}`);

assert.ok(page.includes("<AdminDriverDocumentRegister"), "Compliance page must mount the document register.");
assert.ok(service.includes('supabase.rpc("admin_driver_document_register_page"'), "Register must use server-side RPC pagination.");
assert.ok(service.includes("p_page_size"));
assert.ok(service.includes("p_search"));
assert.ok(service.includes("p_status_filter"));
for (const token of [
  "security invoker",
  "private.is_admin_or_ceo()",
  "limit p.v_page_size",
  "offset (p.v_page - 1) * p.v_page_size",
  "reviewer_name",
  "plate_number",
  "missing",
  "Africa/Addis_Ababa",
]) assert.ok(migration.toLowerCase().includes(token.toLowerCase()), `Register migration token missing: ${token}`);

assert.match(migration, /revoke all on function public\.admin_driver_document_register_page[\s\S]*from public, anon/i);
assert.match(migration, /grant execute on function public\.admin_driver_document_register_page[\s\S]*to authenticated/i);
assert.doesNotMatch(migration, /\b(update|delete from|insert into)\s+public\./i, "document register RPC must remain reporting-only");
assert.doesNotMatch(service, /\.from\("driver_verification_files"\)/, "browser must not bulk-load verification files for the register");

assert.doesNotMatch(page, /\.limit\(1000\)|\.limit\(2000\)/, "Admin compliance must not bulk-preload 1000/2000 audit rows.");
assert.ok(page.includes("loadDriverAudit"), "Driver trip/payment/history audit must lazy-load per driver.");
assert.ok(page.includes("getControlCenterData"), "Top compliance KPIs must use DB-side summary reporting.");

console.log("Admin driver document register regression checks passed.");
