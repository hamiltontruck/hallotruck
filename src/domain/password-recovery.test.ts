import { describe, expect, it } from "vitest";
import {
  isValidNewRolePassword,
  MIN_RECOVERY_PASSWORD_LENGTH,
  recoveryPortalFromRole,
  usesSixDigitPin,
} from "./password-recovery";

describe("role-specific password policy", () => {
  it("accepts exactly six numeric digits", () => {
    expect(isValidNewRolePassword("123456")).toBe(true);
  });

  it.each(["12345", "1234567", "abc123", "12#456", "12 456"])(
    "rejects invalid role password %s",
    (value) => {
      expect(isValidNewRolePassword(value)).toBe(false);
    },
  );

  it.each(["customer", "driver", "partner"])("uses six digit PIN for %s", (role) => {
    expect(usesSixDigitPin(recoveryPortalFromRole(role))).toBe(true);
  });

  it.each(["admin", "ceo"])("keeps leadership recovery separate for %s", (role) => {
    expect(usesSixDigitPin(recoveryPortalFromRole(role))).toBe(false);
  });

  it("keeps CEO/Admin recovery minimum unchanged", () => {
    expect(MIN_RECOVERY_PASSWORD_LENGTH).toBe(10);
  });
});
