import assert from "node:assert/strict";
import test from "node:test";
import { roleDestination } from "../.test-dist/role-destination.js";

test("Driver role from Customer Mobile routes to the standalone Driver app", () => {
  assert.equal(
    roleDestination(
      " DRIVER ",
      "https://hamiltontruck.github.io/hallotruck/customer-mobile/?from=login",
    ),
    "https://hamiltontruck.github.io/hallotruck/driver-mobile/",
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
