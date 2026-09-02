import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const read = (file: string) => readFile(path.join(process.cwd(), file), "utf8");
const migration = await read("supabase/migrations/20260902013000_partner_order_foundation.sql");
const quoteMigration = await read("supabase/migrations/20260902051000_partner_order_quote_review_approval.sql");
const app = await read("src/App.tsx");
const service = await read("src/services/partner-order.service.ts");
const list = await read("src/pages/PartnerOrders.tsx");
const form = await read("src/pages/PartnerOrderNew.tsx");
const details = await read("src/pages/PartnerOrderDetails.tsx");
const adminReview = await read("src/pages/AdminPartnerOrderReview.tsx");
const adminLinks = await read("src/components/admin/AdminSidebarLeadershipLinks.tsx");
const browser = await read("scripts/partner-order-e2e-smoke.mjs");
const packageJson = await read("package.json");

test("Partner order lifecycle and immutable history are separate from canonical orders", () => {
  assert.match(migration, /create table public\.partner_orders/);
  assert.match(migration, /canonical_order_id uuid unique references public\.orders\(id\) on delete restrict/);
  for (const status of ["draft","submitted","under_review","quoted","approved","placed","assigned","accepted","in_transit","delivered","completed","cancelled","rejected","expired"]) assert.match(migration, new RegExp(`'${status}'`));
  assert.match(migration, /create table public\.partner_order_status_history/);
  assert.match(migration, /partner_order_id uuid not null references public\.partner_orders\(id\) on delete restrict/);
  assert.doesNotMatch(`${migration}\n${quoteMigration}`, /delete\s+from\s+public\.(orders|payments|partner_order_status_history)/i);
});

test("Partner order reads are tenant isolated and mutations are RPC-only", () => {
  assert.match(migration, /alter table public\.partner_orders enable row level security/);
  assert.match(migration, /private\.is_admin_or_ceo\(\)[\s\S]*private\.is_partner_member\(partner_id\)/);
  assert.match(migration, /revoke all on table public\.partner_orders, public\.partner_order_status_history from public, anon, authenticated/);
  assert.match(migration, /grant select on table public\.partner_orders, public\.partner_order_status_history to authenticated/);
  assert.doesNotMatch(migration, /grant (insert|update|delete)[^;]*partner_orders/i);
});

test("Partner owner and admin writes require active database membership and Partner profile", () => {
  for (const fn of ["partner_save_order_draft","partner_submit_order"]) assert.match(migration, new RegExp(`function public\\.${fn}`));
  assert.match(migration, /membership\.user_id=v_actor[\s\S]*membership\.active[\s\S]*membership\.member_role in \('owner','admin'\)[\s\S]*organization\.status='active'[\s\S]*profile\.role::text='partner'/);
  assert.doesNotMatch(migration, /(user_metadata|app_metadata|auth\.jwt\(\))/i);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(migration, /revoke all on function public\.partner_save_order_draft\(uuid,uuid,jsonb,uuid\) from public,anon/);
  assert.match(migration, /request_key=p_request_key and partner_id=p_partner_id/);
});

test("Admin review and quote actions require active database leadership authorization", () => {
  for (const fn of ["admin_start_partner_order_review","admin_quote_partner_order"]) assert.match(quoteMigration, new RegExp(`function public\\.${fn}`));
  assert.match(quoteMigration, /if not \(select private\.is_admin_or_ceo\(\)\) then[\s\S]*Active Admin or CEO authorization is required/);
  assert.match(quoteMigration, /Only submitted Partner orders can enter review/);
  assert.match(quoteMigration, /Only Partner orders under review can be quoted/);
  assert.match(quoteMigration, /Quote amount must be greater than zero/);
  assert.match(quoteMigration, /Quote expiry must be in the future/);
  assert.match(quoteMigration, /revoke all on function public\.admin_start_partner_order_review\(uuid,text,uuid\) from public,anon/);
  assert.match(quoteMigration, /revoke all on function public\.admin_quote_partner_order\(uuid,numeric,timestamptz,text,uuid\) from public,anon/);
  assert.doesNotMatch(quoteMigration, /(user_metadata|app_metadata|auth\.jwt\(\))/i);
});

test("Partner quote response is tenant guarded, expiring and immutable-history backed", () => {
  assert.match(quoteMigration, /function public\.partner_respond_to_order_quote/);
  assert.match(quoteMigration, /membership\.partner_id=v_order\.partner_id[\s\S]*membership\.user_id=v_actor[\s\S]*membership\.active[\s\S]*membership\.member_role in \('owner','admin'\)[\s\S]*organization\.status='active'[\s\S]*profile\.role::text='partner'/);
  assert.match(quoteMigration, /if v_action='reject' and v_reason is null then[\s\S]*A rejection reason is required/);
  assert.match(quoteMigration, /quote_expires_at is null or v_order\.quote_expires_at <= now\(\)/);
  assert.match(quoteMigration, /set status='expired'/);
  assert.match(quoteMigration, /v_next_status := case when v_action='accept' then 'approved' else 'rejected' end/);
  assert.match(quoteMigration, /insert into public\.partner_order_status_history/);
  assert.match(quoteMigration, /partner_order_quote_accepted/);
  assert.match(quoteMigration, /partner_order_quote_rejected/);
  assert.match(quoteMigration, /revoke all on function public\.partner_respond_to_order_quote\(uuid,text,text,uuid\) from public,anon/);
});

test("Quote state records amount, expiry, actor and version without creating a canonical order", () => {
  for (const column of ["reviewed_at","reviewed_by","quoted_at","quoted_by","quote_amount_etb","quote_expires_at","quote_version","approved_at","rejected_at"]) assert.match(quoteMigration, new RegExp(column));
  assert.match(quoteMigration, /partner_orders_quote_amount_positive/);
  assert.match(quoteMigration, /partner_orders_quote_state_complete/);
  assert.doesNotMatch(quoteMigration, /insert\s+into\s+public\.orders/i);
  assert.doesNotMatch(quoteMigration, /update\s+public\.orders/i);
});

test("Partner order pages are protected, discoverable and mobile-safe", () => {
  assert.match(app, /path="\/partner\/orders" element=\{<PartnerGate><PartnerOrders \/><\/PartnerGate>\}/);
  assert.match(app, /path="\/partner\/orders\/new" element=\{<PartnerGate><PartnerOrderNew \/><\/PartnerGate>\}/);
  assert.match(app, /path="\/partner\/orders\/:orderId" element=\{<PartnerGate><PartnerOrderDetails \/><\/PartnerGate>\}/);
  assert.match(app, /path="\/admin\/partner-orders" element=\{<AdminGate><AdminToolShell><AdminPartnerOrderReview \/><\/AdminToolShell><\/AdminGate>\}/);
  assert.match(adminLinks, /to="\/admin\/partner-orders"/);
  assert.match(list, /overflow-x-auto/);
  assert.match(list, /md:grid-cols-2/);
  assert.match(form, /min-w-0/);
  assert.match(form, /sm:grid-cols-2/);
  assert.match(adminReview, /overflow-x-hidden/);
  assert.match(adminReview, /overflow-x-auto/);
});

test("Partner order quote UI exposes controlled Admin and Partner decisions", () => {
  assert.match(service, /rpc\("admin_start_partner_order_review"/);
  assert.match(service, /rpc\("admin_quote_partner_order"/);
  assert.match(service, /rpc\("partner_respond_to_order_quote"/);
  assert.match(adminReview, /Start HALLO review/);
  assert.match(adminReview, /Issue quote to Partner/);
  assert.match(adminReview, /Awaiting Partner owner\/admin decision/);
  assert.match(details, /Accept HALLO quote/);
  assert.match(details, /Reject quote/);
  assert.match(details, /required when rejecting/);
  assert.match(details, /canonical order placement remains a separate Admin-controlled step/i);
});

test("Partner order contact validation accepts Ethiopian and explicit international numbers", () => {
  assert.match(service, /\^\(\?:\\\+251\|251\|0\)\?9\\d\{8\}\$/);
  assert.match(service, /\^\\\+\[1-9\]\\d\{7,14\}\$/);
  assert.match(service, /Enter a valid contact email address/);
  assert.match(migration, /v_phone !~ '\^\(\\\+251\|251\|0\)\?9\[0-9\]\{8\}\$'/);
  assert.match(migration, /v_phone !~ '\^\\\+\[1-9\]\[0-9\]\{7,14\}\$'/);
  assert.match(migration, /length\(v_email\)>254/);
});

test("New Partner order captures the first-slice operational requirements", () => {
  for (const marker of ["pickupCountry","dropoffCountry","cargoCategory","cargoDescription","weight","quantity","truckType","capacity","pickupDate","deadline","pickupPhone","deliveryPhone","paymentMethod"]) assert.match(form, new RegExp(marker));
  for (const marker of ["fragile","hazardous","temperature","refrigeration"]) assert.match(form, new RegExp(marker));
});

test("Partner order browser smoke covers every production target width", () => {
  for (const width of [320,360,390,412,430,768,1280]) assert.match(browser, new RegExp(String(width)));
  assert.match(browser, /data-overflow/);
  assert.match(browser, /Review, quote & approval/);
  assert.match(browser, /Accept HALLO quote/);
  assert.match(packageJson, /node scripts\/partner-order-e2e-smoke\.mjs/);
});
