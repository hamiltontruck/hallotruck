import assert from "node:assert/strict";
import test from "node:test";
import { roleDestination } from "../.test-dist/role-destination.js";

test("Driver role stays in Customer Mobile instead of redirecting to Driver Mobile", () => {
  assert.equal(
    roleDestination(
      " DRIVER ",
      "https://hamiltontruck.github.io/hallotruck/customer-mobile/?from=login",
    ),
    null,
  );
});

test("Customer and privileged roles never receive an inferred destination", () => {
  for (const role of ["customer", "admin", "ceo", "partner", "owner", null]) {
    assert.equal(
      roleDestination(
        role,
        "https://hamiltontruck.github.io/hallotruck/customer-mobile/",
      ),
      null,
    );
  }
});
