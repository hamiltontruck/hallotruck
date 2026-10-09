import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(join(process.cwd(), "supabase", "migrations", "20261007034500_real_customer_driver_chat_notifications.sql"), "utf8");

test("customer-driver chat notifications target only the peer participant", () => {
  assert.match(migration, /event_type in \([\s\S]*'chat_message'/i);
  assert.match(migration, /if new\.sender_id=v_thread\.customer_id[\s\S]*v_recipient:=v_thread\.driver_id/i);
  assert.match(migration, /elsif new\.sender_id=v_thread\.driver_id[\s\S]*v_recipient:=v_thread\.customer_id/i);
  assert.match(migration, /enqueue_user_notification\([\s\S]*v_recipient[\s\S]*'chat_message'/i);
  assert.match(migration, /after insert on public\.customer_driver_chat_messages/i);
  assert.doesNotMatch(migration, /service_role|raw_user_meta_data|user_metadata|app_metadata/i);
});
