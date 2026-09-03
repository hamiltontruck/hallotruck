export type CustomerProfileRow = {
  role: string | null;
  full_name: string | null;
};

export type CustomerProfileAccess =
  | { kind: "allowed"; fullName: string }
  | { kind: "unsupported-role"; role: string | null }
  | { kind: "missing-profile" };

function normalized(value: string | null | undefined) {
  const result = value?.trim().toLowerCase();
  return result || null;
}

function displayName(value: string | null | undefined) {
  return value?.trim() || "HALLO Customer";
}

export function classifyCustomerProfile(
  profile: CustomerProfileRow | null | undefined,
): CustomerProfileAccess {
  if (!profile) return { kind: "missing-profile" };

  const role = normalized(profile.role);
  if (role !== "customer") {
    return { kind: "unsupported-role", role };
  }

  return {
    kind: "allowed",
    fullName: displayName(profile.full_name),
  };
}
