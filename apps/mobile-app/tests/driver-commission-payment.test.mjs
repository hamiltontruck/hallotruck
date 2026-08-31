import test from "node:test";
import assert from "node:assert/strict";
import {
  DRIVER_COMMISSION_RECEIPT_MAX_BYTES,
  buildDriverCommissionReceiptPath,
  normalizeDriverCommissionPayments,
  safeDriverCommissionReceiptName,
  validateDriverCommissionPayment,
} from "../.test-dist-commission/driver-commission-payment.model.js";

const receipt = {
  name: "CBE Receipt 2026.JPG",
  size: 512_000,
  type: "image/jpeg",
};

test("validates a commission payment within the remaining payable balance", () => {
  const result = validateDriverCommissionPayment({
    provider: "  Commercial Bank of Ethiopia  ",
    transactionId: "  FT-2026-001  ",
    amountEtb: 2500,
    receipt,
  }, 3000);
  assert.equal(result.provider, "Commercial Bank of Ethiopia");
  assert.equal(result.transactionId, "FT-2026-001");
  assert.equal(result.amountEtb, 2500);
});

test("blocks payment when there is no payable commission balance", () => {
  assert.throws(() => validateDriverCommissionPayment({
    provider: "Telebirr",
    transactionId: "TX-1",
    amountEtb: 1,
    receipt,
  }, 0), /hin jiru/);
});

test("blocks amount above the remaining payable balance", () => {
  assert.throws(() => validateDriverCommissionPayment({
    provider: "Telebirr",
    transactionId: "TX-2",
    amountEtb: 1000.01,
    receipt,
  }, 1000), /caaluu hin danda'u/);
});

test("requires a supported non-empty receipt no larger than 10 MB", () => {
  assert.throws(() => validateDriverCommissionPayment({
    provider: "Telebirr",
    transactionId: "TX-3",
    amountEtb: 100,
    receipt: null,
  }, 100), /Receipt/);
  assert.throws(() => validateDriverCommissionPayment({
    provider: "Telebirr",
    transactionId: "TX-4",
    amountEtb: 100,
    receipt: { name: "receipt.exe", size: 100, type: "application/octet-stream" },
  }, 100), /JPG/);
  assert.throws(() => validateDriverCommissionPayment({
    provider: "Telebirr",
    transactionId: "TX-5",
    amountEtb: 100,
    receipt: { name: "receipt.pdf", size: DRIVER_COMMISSION_RECEIPT_MAX_BYTES + 1, type: "application/pdf" },
  }, 100), /10 MB/);
});

test("builds an owner-scoped receipt path and strips unsafe filename characters", () => {
  assert.equal(safeDriverCommissionReceiptName("../../My CBE Receipt (Final).PDF"), "my-cbe-receipt-final-.pdf".replace("-.", "."));
  const path = buildDriverCommissionReceiptPath(
    "driver-123",
    "../../My Receipt.PDF",
    1720000000000,
    "ABC-123",
  );
  assert.match(path, /^driver-123\/1720000000000-abc123-my-receipt\.pdf$/);
  assert.doesNotMatch(path, /\.\.\//);
});

test("normalizes only complete self-scoped payment history rows", () => {
  const rows = normalizeDriverCommissionPayments([
    {
      id: "payment-1",
      provider: "Telebirr",
      transaction_id: "TX-2026",
      amount_etb: "1200.50",
      receipt_path: "driver-1/receipt.pdf",
      status: "pending",
      rejection_reason: null,
      submitted_at: "2026-08-31T10:00:00Z",
      reviewed_at: null,
    },
    {
      id: "bad",
      provider: "",
      transaction_id: "X",
      amount_etb: 10,
      receipt_path: "driver-1/bad.pdf",
      status: "pending",
      submitted_at: "2026-08-31T10:00:00Z",
    },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amountEtb, 1200.5);
  assert.equal(rows[0].status, "pending");
});
