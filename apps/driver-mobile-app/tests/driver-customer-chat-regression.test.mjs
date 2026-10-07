import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const service = readFileSync(join(root, "src", "driver", "driver-chat.service.ts"), "utf8");
const launcher = readFileSync(join(root, "src", "driver", "DriverCustomerChatLauncher.tsx"), "utf8");
const activeTrip = readFileSync(join(root, "src", "driver", "DriverActiveTripView.tsx"), "utf8");

test("Driver V4 customer chat uses the real order chat backend", () => {
  assert.match(service, /open_customer_driver_order_chat/);
  assert.match(service, /send_customer_driver_chat_message/);
  assert.match(service, /mark_customer_driver_chat_read/);
  assert.match(service, /customer_driver_chat_messages/);
  assert.match(service, /postgres_changes/);
  assert.doesNotMatch(launcher, /fake|mock message|hard-?coded message/i);
});

test("Driver active trip exposes customer chat with the authoritative order id", () => {
  assert.match(activeTrip, /DriverCustomerChatLauncher/);
  assert.match(activeTrip, /orderId=\{trip\.id\}/);
  assert.match(activeTrip, /trackingId=\{trip\.trackingId\}/);
});
