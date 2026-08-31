import assert from "node:assert/strict";
import test from "node:test";
import { classifyMobileProfile } from "../.test-dist/access-policy.js";

test("customer profile is allowed from the database role", () => {
  assert.deepEqual(
    classifyMobileProfile({ role: "customer", driver_status: null, full_name: "  Hana  " }),
    { kind: "allowed", role: "customer", fullName: "Hana", driverStatus: null },
  );
});

test("only an approved driver opens the Driver workspace", () => {
  assert.deepEqual(
    classifyMobileProfile({ role: "driver", driver_status: "approved", full_name: "Adil" }),
    { kind: "allowed", role: "driver", fullName: "Adil", driverStatus: "approved" },
  );
});

test("pending and rejected drivers remain in onboarding", () => {
  for (const driverStatus of ["pending", "rejected", null]) {
    assert.equal(
      classifyMobileProfile({ role: "driver", driver_status: driverStatus, full_name: "Driver" }).kind,
      "driver-onboarding",
    );
  }
});

test("suspended drivers are denied without deleting history", () => {
  assert.equal(
    classifyMobileProfile({ role: "driver", driver_status: "suspended", full_name: "Driver" }).kind,
    "driver-suspended",
  );
});

test("Admin, CEO, Partner and unknown roles never open a mobile workspace", () => {
  for (const role of ["admin", "ceo", "partner", "owner", null]) {
    assert.equal(
      classifyMobileProfile({ role, driver_status: null, full_name: "Leadership" }).kind,
      "unsupported-role",
    );
  }
});

test("a missing profile is not guessed from auth metadata", () => {
  assert.deepEqual(classifyMobileProfile(null), { kind: "missing-profile" });
});
