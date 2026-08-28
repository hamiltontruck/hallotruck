import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const app = readFileSync(path.join(root, "src/App.tsx"), "utf8");
const banner = readFileSync(
  path.join(root, "src/components/driver/DriverPaymentCollectionBanner.tsx"),
  "utf8",
);

test("Driver workspace surfaces held-escrow confirmation from every primary page", () => {
  assert.match(app, /const showPaymentAction = !pathname\.startsWith\("\/driver\/payment\/"\)/);
  assert.match(app, /\{showPaymentAction && <DriverPaymentCollectionBanner \/>\}/);
  assert.match(app, /path="\/driver\/commission"[\s\S]*<DriverCommission \/>/);
});

test("pending payment banner discovers assigned delivered orders awaiting confirmation", () => {
  assert.match(banner, /\.from\("orders"\)/);
  assert.match(banner, /\.eq\("status", "delivered"\)/);
  assert.match(banner, /getDriverPaymentStatus\(order\.id\)/);
  assert.match(banner, /row\.payment_event === "held_escrow"/);
  assert.match(banner, /row\.confirmation_type !== "payment_confirmed"/);
  assert.match(banner, /row\.can_confirm \|\| row\.can_report_not_received/);
});

test("pending confirmation takes priority and opens the completed-trip payment route", () => {
  assert.match(banner, /const confirmation = confirmations\[0\]/);
  assert.match(banner, /const orderId = confirmation\?\.order_id \?\? report!\.order_id/);
  assert.match(banner, /to=\{`\/driver\/payment\/\$\{orderId\}`\}/);
  assert.match(banner, /Kaffaltii mirkaneessi/);
  assert.match(banner, /data-driver-payment-action-banner/);
});
