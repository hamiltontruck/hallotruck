import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidCustomerFullName,
  isValidSixDigitPin,
  normalizeEthiopianMobile,
  sanitizeCustomerFullName,
  sanitizeEthiopianPhoneInput,
} from "../.test-dist/customer-auth-validation.js";

test("Customer signup accepts real names but rejects numeric-only names", () => {
  assert.equal(sanitizeCustomerFullName("58800088"), "");
  assert.equal(sanitizeCustomerFullName("Adil  Abdu"), "Adil Abdu");
  assert.equal(sanitizeCustomerFullName("Abiyu Nagash"), "Abiyu Nagash");
  assert.equal(isValidCustomerFullName("58800088"), false);
  assert.equal(isValidCustomerFullName("Adil Abdu"), true);
  assert.equal(isValidCustomerFullName("አዲል አብዱ"), true);
});

test("Customer signup keeps only a bounded Ethiopian phone input", () => {
  assert.equal(sanitizeEthiopianPhoneInput("+2519112504155528 yokan 555855"), "+251911250415");
  assert.equal(sanitizeEthiopianPhoneInput("09 11-250-415"), "0911250415");
  assert.equal(normalizeEthiopianMobile("0911250415"), "+251911250415");
  assert.equal(normalizeEthiopianMobile("+251911250415"), "+251911250415");
  assert.equal(normalizeEthiopianMobile("0711250415"), "+251711250415");
  assert.equal(normalizeEthiopianMobile("+251711250415"), "+251711250415");
  assert.equal(normalizeEthiopianMobile("+2519112504155528"), null);
});

test("Customer PIN remains exactly six numeric digits", () => {
  assert.equal(isValidSixDigitPin("123456"), true);
  assert.equal(isValidSixDigitPin("12345"), false);
  assert.equal(isValidSixDigitPin("12345a"), false);
});
