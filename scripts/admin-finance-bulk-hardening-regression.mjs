import fs from "node:fs";

const service = fs.readFileSync("src/services/admin.service.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260911022227_admin_finance_aggregation_hardening.sql", "utf8");

const checks = [
  [service.includes("ADMIN_DASHBOARD_FINANCE_PREVIEW_LIMIT = 100"), "finance previews are bounded"],
  [service.includes('.from("payments")') && service.includes(".limit(ADMIN_DASHBOARD_FINANCE_PREVIEW_LIMIT)"), "payments preview is bounded"],
  [service.includes('.from("delivery_proofs")') && service.includes(".limit(ADMIN_DASHBOARD_FINANCE_PREVIEW_LIMIT)"), "delivery proof preview is bounded"],
  [service.includes('supabase.rpc("admin_finance_dashboard_summary")'), "dashboard revenue uses DB aggregation"],
  [service.includes("financeSummary?.released_total_etb") && service.includes("financeSummary?.refunded_total_etb"), "revenue reads aggregate totals"],
  [migration.includes("security invoker") && migration.includes("private.is_admin_or_ceo()"), "aggregate RPC preserves leadership authorization"],
  [migration.includes("payments_created_at_desc_idx") && migration.includes("delivery_proofs_delivered_at_desc_idx"), "finance preview indexes are present"],
];

const failed = checks.filter(([ok]) => !ok);
for (const [ok, label] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
if (failed.length) process.exit(1);
