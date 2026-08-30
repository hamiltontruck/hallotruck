import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const deliveryProof = source("src/components/driver/DriverDeliveryProofForm.tsx");
const deliveryService = source("src/services/delivery-proof.service.ts");
const browserSmoke = source("scripts/driver-delivery-proof-action-e2e-smoke.mjs");

test("Driver Delivery Proof blocks duplicate submissions before asynchronous signature encoding", () => {
  assert.match(deliveryProof, /const submitting = useRef\(false\)/);
  assert.match(deliveryProof, /if \(submitting\.current\) return;/);
  assert.match(deliveryProof, /submitting\.current = true;\s*setSaving\(true\);\s*try \{\s*const signature/s);
  assert.match(deliveryProof, /submitProof = submitDeliveryProof/);
  assert.match(browserSmoke, /data-submit-calls="1"/);
});

test("Driver Delivery Proof exposes visible and accessible pending-action guidance", () => {
  assert.match(deliveryProof, /driver-delivery-proof-action-guidance/);
  assert.match(deliveryProof, /aria-busy=\{saving\}/);
  assert.match(deliveryProof, /role=\{saving \? "status" : undefined\}/);
  assert.match(deliveryProof, /aria-live="polite"/);
  assert.match(deliveryProof, /role="alert"/);
  assert.match(deliveryProof, /aria-describedby=\{ACTION_GUIDANCE_ID\}/);
  assert.match(deliveryProof, /Delivery proof and the payment result are being saved/);
  assert.match(deliveryProof, /Ragaan geessuu fi bu'aan kaffaltii olkaa'amaa jiru/);
  assert.match(deliveryProof, /የማድረስ ማስረጃውና የክፍያ ውጤቱ እየተቀመጡ ነው/);
});

test("Driver Delivery Proof locks every editable control and explains why Finish Trip is unavailable", () => {
  assert.match(deliveryProof, /disabled=\{saving\}/);
  assert.match(deliveryProof, /aria-disabled=\{saving\}/);
  assert.match(deliveryProof, /pointer-events-none cursor-not-allowed opacity-60/);
  assert.match(deliveryProof, /const submitGuidance = saving/);
  assert.match(deliveryProof, /disabled=\{saving \|\| !submitReady\}/);
  assert.match(deliveryProof, /title=\{saving \|\| !submitReady \? submitGuidance : undefined\}/);
  assert.match(deliveryProof, /const cashAmountReady/);
  assert.match(browserSmoke, /data-controls-locked="true"/);
  assert.match(browserSmoke, /data-canvas-locked="true"/);
  assert.match(browserSmoke, /\[320, 360, 390, 412, 430, 768\]/);
});

test("Driver assignment and duplicate-proof enforcement remain database-backed", () => {
  assert.match(deliveryService, /supabase\.rpc\("driver_finish_trip"/);
  assert.match(deliveryService, /from\("delivery_proofs"\)/);
  assert.match(deliveryService, /\.eq\("order_id", input\.orderId\)/);
  assert.doesNotMatch(deliveryProof, /auth\.jwt/);
  assert.doesNotMatch(deliveryProof, /app_metadata/);
});
