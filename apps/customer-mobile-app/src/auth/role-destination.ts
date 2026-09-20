export function roleDestination(
  role: string | null | undefined,
  currentUrl: string,
) {
  const normalizedRole = role?.trim().toLowerCase();
  if (normalizedRole !== "driver") return null;

  return new URL("../driver-mobile/", currentUrl).href;
}
