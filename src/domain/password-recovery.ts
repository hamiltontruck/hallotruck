export const MIN_RECOVERY_PASSWORD_LENGTH = 10;
export const ROLE_PIN_PATTERN = /^\d{6}$/;
export const ROLE_PIN_ERROR = "Password must be exactly 6 numeric digits.";

export type RecoveryPortal = "account" | "admin" | "customer" | "driver" | "partner";

export function recoveryPortalFromRole(role: unknown): RecoveryPortal {
  if (role === "customer") return "customer";
  if (role === "driver") return "driver";
  if (role === "partner") return "partner";
  if (role === "admin" || role === "ceo") return "admin";
  return "account";
}

export function usesSixDigitPin(portal: RecoveryPortal): boolean {
  return portal === "customer" || portal === "driver" || portal === "partner";
}

export function isValidNewRolePassword(password: string): boolean {
  return ROLE_PIN_PATTERN.test(password);
}

export function recoveryLoginHash(portal: RecoveryPortal): string {
  if (portal === "customer") return "#/customer/login";
  if (portal === "driver") return "#/driver/login";
  if (portal === "partner") return "#/partner";
  if (portal === "admin") return "#/admin";
  return "#/";
}

export function isPasswordRecoveryLocation(value: string): boolean {
  return /(?:^|[?&#])type=recovery(?:&|$)/i.test(value);
}

export function buildPasswordResetRedirectUrl(origin: string, pathname: string): string {
  return `${origin}${pathname}`;
}
