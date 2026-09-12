import fs from "node:fs";

const service = fs.readFileSync("src/services/admin.service.ts", "utf8");

const required = [
  ["ADMIN_DASHBOARD_REFERENCE_PREVIEW_LIMIT = 100", "reference preview limit is explicit"],
  ["availableTrucks: availableTrucksResult.count ?? 0", "available trucks use exact count"],
  ["totalCustomers: totalCustomersResult.count ?? 0", "customers use exact count"],
];

for (const [needle, label] of required) {
  if (!service.includes(needle)) throw new Error(`FAIL ${label}`);
  console.log(`PASS ${label}`);
}

for (const legacy of ["shouldLoadAllOrdersForControlQueue", "shouldLoadFullFinanceWorkspace", "getAdminSearchParams"]) {
  if (service.includes(legacy)) throw new Error(`FAIL legacy preload helper still present: ${legacy}`);
}
console.log("PASS legacy load-all helpers removed");
