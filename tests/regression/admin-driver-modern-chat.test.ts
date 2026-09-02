import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const source = (file: string) => readFileSync(path.join(root, file), "utf8");

const migration = source("supabase/migrations/20260902070600_admin_driver_modern_chat.sql");
const service = source("src/services/driver-chat.service.ts");
const conversation = source("src/components/chat/ChatConversation.tsx");
const adminLauncher = source("src/components/admin/AdminDriverChatLauncher.tsx");
const driverLauncher = source("src/components/driver/DriverOperationsChatLauncher.tsx");
const header = source("src/components/layout/Header.tsx");
const adminToolShell = source("src/components/admin/AdminToolShell.tsx");
const adminSidebar = source("src/components/admin/AdminSidebarLeadershipLinks.tsx");

test("Admin Driver chat persists one isolated append-only thread per Driver", () => {
  assert.match(migration, /create table if not exists public\.driver_chat_threads/i);
  assert.match(migration, /driver_id uuid not null unique references public\.profiles\(id\) on delete restrict/i);
  assert.match(migration, /create table if not exists public\.driver_chat_messages/i);
  assert.match(migration, /thread_id uuid not null references public\.driver_chat_threads\(id\) on delete restrict/i);
  assert.match(migration, /client_message_id uuid not null/i);
  assert.match(migration, /unique \(sender_id, client_message_id\)/i);
  assert.match(migration, /driver_chat_messages_body_check[\s\S]*between 1 and 4000/i);
  assert.match(migration, /driver_chat_messages_immutable[\s\S]*before update or delete/i);
  assert.match(migration, /Driver chat messages are append-only/i);
});

test("chat tables use RLS and direct client writes are denied", () => {
  assert.match(migration, /alter table public\.driver_chat_threads enable row level security/i);
  assert.match(migration, /alter table public\.driver_chat_messages enable row level security/i);
  assert.match(migration, /revoke insert, update, delete on table public\.driver_chat_threads from authenticated/i);
  assert.match(migration, /revoke insert, update, delete on table public\.driver_chat_messages from authenticated/i);
  assert.match(migration, /driver_chat_threads_participant_read[\s\S]*private\.is_admin_or_ceo\(\)[\s\S]*public\.is_approved_driver\(\)/i);
  assert.match(migration, /driver_chat_messages_participant_read[\s\S]*private\.is_admin_or_ceo\(\)[\s\S]*thread\.driver_id = \(select auth\.uid\(\)\)/i);
  assert.doesNotMatch(migration, /app_metadata|user_metadata|raw_user_meta_data/i);
});

test("chat RPCs authorize current database roles and expose only authenticated execution", () => {
  for (const rpc of [
    "admin_get_or_create_driver_chat_thread",
    "driver_get_or_create_chat_thread",
    "send_driver_chat_message",
    "mark_driver_chat_read",
    "admin_driver_chat_inbox",
    "my_driver_chat_unread_count",
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${rpc}`, "i"));
  }
  assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
  assert.match(migration, /Active Admin or CEO authorization is required/i);
  assert.match(migration, /Approved Driver authorization is required/i);
  assert.match(migration, /Driver chat participant authorization is required/i);
  assert.match(migration, /revoke all on function public\.send_driver_chat_message[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.send_driver_chat_message[\s\S]*to authenticated/i);
});

test("message context, idempotency and unread receipts are server controlled", () => {
  assert.match(migration, /Order context must belong to the conversation Driver/i);
  assert.match(migration, /driver_order\.driver_id = v_driver_id/i);
  assert.match(migration, /on conflict \(sender_id, client_message_id\) do nothing/i);
  assert.match(migration, /admin_last_read_at/i);
  assert.match(migration, /driver_last_read_at/i);
  assert.match(migration, /message\.created_at > coalesce\(thread\.admin_last_read_at/i);
  assert.match(migration, /message\.created_at > coalesce\(thread\.driver_last_read_at/i);
});

test("chat tables are registered for Realtime without weakening RLS", () => {
  assert.match(migration, /pg_publication[\s\S]*supabase_realtime/i);
  assert.match(migration, /alter publication supabase_realtime add table public\.driver_chat_threads/i);
  assert.match(migration, /alter publication supabase_realtime add table public\.driver_chat_messages/i);
  assert.match(service, /postgres_changes/);
  assert.match(service, /table: "driver_chat_messages"/);
  assert.match(service, /table: "driver_chat_threads"/);
  assert.match(service, /filter: `thread_id=eq\.\$\{threadId\}`/);
});

test("modern chat UI includes unread, seen, quick reply and order-context UX", () => {
  assert.match(conversation, /Seen ✓✓/);
  assert.match(conversation, /Sent ✓/);
  assert.match(conversation, /aria-label="Quick replies"/);
  assert.match(conversation, /Order context/);
  assert.match(conversation, /Enter sends · Shift\+Enter adds a new line/);
  assert.match(conversation, /messages are retained for operational audit/i);
  assert.match(adminLauncher, /unreadTotal/);
  assert.match(adminLauncher, /Search Driver or phone/);
  assert.match(adminLauncher, /Secure Admin \/ CEO channel/);
  assert.match(driverLauncher, /HALLO OPERATIONS/);
  assert.match(driverLauncher, /Direct secure support channel/);
});

test("Admin and Driver expose chat globally without replacing Driver primary navigation", () => {
  assert.match(adminToolShell, /AdminDriverChatLauncher/);
  assert.match(adminSidebar, /AdminDriverChatLauncher/);
  assert.match(header, /DriverOperationsChatLauncher/);
  for (const route of ["/driver", "/driver/jobs", "/driver/trip", "/driver/wallet", "/driver/profile"]) {
    assert.ok(header.includes(`to: "${route}"`), `missing existing Driver primary route ${route}`);
  }
  const primaryLinkEntries = header.match(/\{ to: "\/driver[^\n]+/g) ?? [];
  assert.equal(primaryLinkEntries.length, 5);
});

test("chat client uses guarded RPC sends instead of direct message inserts", () => {
  assert.match(service, /supabase\.rpc\("send_driver_chat_message"/);
  assert.match(service, /supabase\.rpc\("mark_driver_chat_read"/);
  assert.match(service, /supabase\.rpc\("admin_driver_chat_inbox"/);
  assert.doesNotMatch(service, /from\("driver_chat_messages"\)\.insert/i);
  assert.doesNotMatch(service, /from\("driver_chat_threads"\)\.insert/i);
});
