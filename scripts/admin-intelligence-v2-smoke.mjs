import fs from "node:fs";
import assert from "node:assert/strict";

const page = fs.readFileSync("src/pages/AdminIntelligence.tsx", "utf8");
const service = fs.readFileSync("src/services/admin-intelligence-v2.service.ts", "utf8");

assert.match(page, /ADMIN INTELLIGENCE V2/);
assert.match(page, /DB REPORTING/);
assert.match(page, /search_page/);
assert.match(page, /overflow-x-hidden/);
assert.match(service, /admin_intelligence_v2/);
assert.doesNotMatch(page, /getAdminIntelligenceData/);

console.log("Admin Intelligence V2 smoke guard: PASS");
