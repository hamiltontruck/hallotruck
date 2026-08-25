export const MIN_RECOVERY_PASSWORD_LENGTH = 10;

export type RecoveryPortal = "account" | "admin" | "customer" | "driver";

export function recoveryPortalFromRole(role: unknown): RecoveryPortal {
  if (role === "customer") return "customer";
  if (role === "driver") return "driver";
  if (role === "admin" || role === "ceo") return "admin";
  return "account";
}

export function recoveryLoginHash(portal: RecoveryPortal): string {
  if (portal === "customer") return "#/customer/login";
  if (portal === "driver") return "#/driver/login";
  if (portal === "admin") return "#/admin";
  return "#/";
}

export function isPasswordRecoveryLocation(value: string): boolean {
  return /(?:^|[?&#])type=recovery(?:&|$)/i.test(value);
}

export function buildPasswordResetRedirectUrl(origin: string, pathname: string): string {
  return `${origin}${pathname}`;
}
