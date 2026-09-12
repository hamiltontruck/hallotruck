import fs from "node:fs";
import assert from "node:assert/strict";

const page = fs.readFileSync("src/pages/AdminIntelligence.tsx", "utf8");

assert.match(page, /ADMIN INTELLIGENCE V2/, "V2 page must be rendered");
assert.match(page, /DB REPORTING/, "V2 page must expose database-backed reporting state");
assert.match(page, /search_page/, "global search pagination must stay URL-backed");
assert.match(page, /Previous/, "search pagination must expose previous control");
assert.match(page, /Next/, "search pagination must expose next control");
assert.match(page, /overflow-x-hidden/, "Admin Intelligence must remain mobile overflow safe");
assert.doesNotMatch(page, /allPages</, "production page must not contain full-history paging loops");

console.log("Admin Intelligence V2 browser source guard: PASS");
