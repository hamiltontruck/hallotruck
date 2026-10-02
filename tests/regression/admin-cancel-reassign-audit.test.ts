import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const service = readFileSync("src/services/admin.service.ts", "utf8");
const page = readFileSync("src/pages/SmartLogistics.tsx", "utf8");
const sql = readFileSync("supabase/migrations/20261002090000_admin_cancel_reassign_forward_fix.sql", "utf8");

test("admin cancellation requires an explicit reason with no fallback", () => {
  assert.match(service, /adminCancelOrder\(orderId: string, reason: string\)/);
  assert.doesNotMatch(service, /Cancelled by Admin from Manage Order/);
  assert.match(page, /cancelReason\.trim\(\)\.length\s*>=\s*5/);
  assert.match(sql, /char_length\(v_reason\) not between 5 and 500/);
});

test("forward fix uses active leadership authorization and hardened grants", () => {
  assert.match(sql, /require_active_leadership\('admin_cancel_order'\)/);
  assert.match(sql, /require_active_leadership\('admin_reassign_order'\)/);
  assert.match(sql, /revoke all on function public\.admin_cancel_order\(uuid,text\) from public, anon/i);
  assert.match(sql, /revoke all on function public\.admin_reassign_order\(uuid,uuid,uuid,text\) from public, anon/i);
});

test("reassignment delegates to current admin assignment invariants", () => {
  assert.match(service, /adminReassignOrder/);
  assert.match(page, /Reassignment reason/);
  assert.match(sql, /perform public\.admin_assign_order\(p_order_id, p_truck_id, p_driver_id\)/);
  assert.doesNotMatch(sql, /service_date\s*=\s*v_service_date/);
});

test("cancel and reassign append immutable leadership-readable audit history", () => {
  assert.match(sql, /create table if not exists public\.order_assignment_history/i);
  assert.match(sql, /insert into public\.order_assignment_history/ig);
  assert.match(sql, /alter table public\.order_assignment_history enable row level security/i);
  assert.match(sql, /using \(private\.is_admin_or_ceo\(\)\)/);
  assert.match(sql, /revoke all on table public\.order_assignment_history from public, anon, authenticated/i);
  assert.match(sql, /grant select on table public\.order_assignment_history to authenticated/i);
});

test("cancel locks the order, rejects terminal states and releases only an unused truck", () => {
  assert.match(sql, /where o\.id = p_order_id\s+for update/i);
  assert.match(sql, /Delivered orders cannot be cancelled/);
  assert.match(sql, /Order is already cancelled/);
  assert.match(sql, /active_order\.id <> p_order_id[\s\S]*active_order\.truck_id = v_old_truck_id[\s\S]*accepted[\s\S]*in_transit/i);
});

test("reassign rejects no-op reassignment and invalid mutable states", () => {
  assert.match(sql, /Only placed or accepted orders can be reassigned/);
  assert.match(sql, /Select a different driver or truck/);
});
