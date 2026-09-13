import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const edge = await readFile("supabase/functions/customer-booking/index.ts", "utf8");
const migration = await readFile("supabase/migrations/20260913214312_customer_booking_backend_v1.sql", "utf8");
const workflow = await readFile(".github/workflows/deploy-supabase-functions.yml", "utf8");

const transpiled = ts.transpileModule(edge, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: "supabase/functions/customer-booking/index.ts",
  reportDiagnostics: true,
});
const syntaxErrors = (transpiled.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
assert.equal(syntaxErrors.length, 0, `Customer booking Edge Function has TypeScript syntax errors: ${syntaxErrors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, " ")).join(" | ")}`);

assert.match(edge, /service\.auth\.getUser\(token\)/, "booking endpoint must verify the bearer token");
assert.match(edge, /profile\.role !== "customer"/, "booking endpoint must reject non-Customer roles");
assert.match(edge, /openrouteservice\/v2\/directions\/driving-hgv\/geojson/, "booking endpoint must use HGV routing");
assert.match(edge, /isOperatingCoordinate/, "booking endpoint must restrict pickup and drop-off to the HALLO corridor");
assert.match(edge, /vehicleCapacityTons/, "booking endpoint must validate truck capacity");
assert.match(edge, /calculate_transport_quote_v2/, "booking endpoint must use the canonical pricing RPC");
assert.match(edge, /Math\.abs\(quoteEtb - body\.expectedQuoteEtb\) > 0\.01/, "booking endpoint must reject stale displayed quotes");
assert.match(edge, /customer_create_booking_v1/, "booking endpoint must commit through the service-only booking RPC");
assert.match(edge, /code: "booking_in_progress"/, "booking endpoint must expose duplicate-submit protection");

assert.match(migration, /create table if not exists private\.customer_booking_requests/, "migration must persist booking idempotency keys privately");
assert.match(migration, /primary key \(customer_id, request_id\)/, "idempotency must be scoped to Customer + request ID");
assert.match(migration, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/, "booking commit RPC must be service-role only at runtime");
assert.match(migration, /p\.role::text = 'customer'/, "booking commit RPC must revalidate Customer role in the database");
assert.match(migration, /public\.vehicle_billing_capacity_tons\(p_vehicle_type\)/, "booking commit RPC must revalidate vehicle capacity");
assert.match(migration, /public\.calculate_transport_quote_v2\(p_distance_km, p_vehicle_type, v_cargo_tons\)/, "booking commit RPC must recalculate the canonical quote");
assert.match(migration, /on conflict \(customer_id, request_id\) do nothing/, "booking commit RPC must be idempotent");
assert.match(migration, /status\s*\n\s*\)\s*\n\s*values[\s\S]*'placed'::public\.order_status/, "booking commit RPC must create placed orders");
assert.match(migration, /revoke all on function public\.customer_create_booking_v1[\s\S]*from public, anon, authenticated/, "direct authenticated RPC execution must be revoked");
assert.match(migration, /grant execute on function public\.customer_create_booking_v1[\s\S]*to service_role/, "only service role should execute the booking commit RPC");

assert.match(workflow, /supabase functions deploy customer-booking/, "Customer booking Edge Function must be included in the deployment workflow");

console.log("Customer booking backend regression guards passed.");
