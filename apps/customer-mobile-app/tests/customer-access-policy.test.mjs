import assert from "node:assert/strict";
import test from "node:test";
import { classifyCustomerProfile } from "../.test-dist/customer-access-policy.js";

test("database Customer role opens the standalone Customer app", () => {
  assert.deepEqual(
    classifyCustomerProfile({ role: "customer", full_name: "  Hana  " }),
    { kind: "allowed", fullName: "Hana" },
  );
});

test("role matching is normalized but still database-backed", () => {
  assert.deepEqual(
    classifyCustomerProfile({ role: " CUSTOMER ", full_name: null }),
    { kind: "allowed", fullName: "HALLO Customer" },
  );
});

test("Driver, Admin, CEO, Partner and unknown roles fail closed", () => {
  for (const role of ["driver", "admin", "ceo", "partner", "owner", null]) {
    assert.deepEqual(
      classifyCustomerProfile({ role, full_name: "Other role" }),
      { kind: "unsupported-role", role },
    );
  }
});

test("missing database profile is denied instead of guessed from auth metadata", () => {
  assert.deepEqual(classifyCustomerProfile(null), { kind: "missing-profile" });
});
