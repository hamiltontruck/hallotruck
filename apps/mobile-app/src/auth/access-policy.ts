export type MobileRole = "driver" | "customer";

export type MobileProfileRow = {
  role: string | null;
  driver_status: string | null;
  full_name: string | null;
};

export type MobileProfileAccess =
  | {
      kind: "allowed";
      role: MobileRole;
      fullName: string;
      driverStatus: string | null;
    }
  | {
      kind: "driver-onboarding";
      fullName: string;
      driverStatus: string | null;
    }
  | {
      kind: "driver-suspended";
      fullName: string;
    }
  | {
      kind: "unsupported-role";
      role: string | null;
    }
  | { kind: "missing-profile" };

function normalized(value: string | null | undefined) {
  const result = value?.trim().toLowerCase();
  return result || null;
}

function displayName(value: string | null | undefined) {
  return value?.trim() || "HALLO user";
}

export function classifyMobileProfile(
  profile: MobileProfileRow | null | undefined,
): MobileProfileAccess {
  if (!profile) return { kind: "missing-profile" };

  const role = normalized(profile.role);
  const driverStatus = normalized(profile.driver_status);
  const fullName = displayName(profile.full_name);

  if (role === "customer") {
    return {
      kind: "allowed",
      role: "customer",
      fullName,
      driverStatus: null,
    };
  }

  if (role === "driver") {
    if (driverStatus === "suspended") {
      return { kind: "driver-suspended", fullName };
    }

    if (driverStatus !== "approved") {
      return {
        kind: "driver-onboarding",
        fullName,
        driverStatus,
      };
    }

    return {
      kind: "allowed",
      role: "driver",
      fullName,
      driverStatus,
    };
  }

  return { kind: "unsupported-role", role };
}
