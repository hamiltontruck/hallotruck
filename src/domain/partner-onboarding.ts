export type PartnerOrganizationStatus = "active" | "suspended" | "archived";
export type PartnerPermission = "owner" | "admin" | "editor" | "viewer";
export type PartnerMembershipStatus = "active" | "disabled";
export type PartnerReadinessFilter = "all" | "ready" | "not_ready";

export type PartnerProfileSummary = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string;
  profile_role: string;
  account_status: string;
};

export type PartnerMemberSummary = {
  id: string;
  partner_id: string;
  user_id: string;
  member_role: PartnerPermission;
  active: boolean;
  created_at: string;
  full_name: string;
  email: string | null;
  phone: string;
  profile_role: string;
  account_status: string;
};

export type PartnerOrganizationSummary = {
  id: string;
  name: string;
  code: string;
  status: PartnerOrganizationStatus;
  contact_email: string | null;
  contact_phone: string | null;
  created_at: string;
  owner_name: string | null;
  active_member_count: number;
  partner_role_count: number;
  active_owner_count: number;
  project_count: number;
  pending_document_count: number;
  pending_payment_count: number;
  latest_activity: string | null;
  latest_activity_at: string | null;
};

export type PartnerReadiness = {
  organizationCreated: boolean;
  partnerRoleAssigned: boolean;
  activeMembershipExists: boolean;
  activeOwnerAssigned: boolean;
  loginReady: boolean;
  reason: string;
};

export type PartnerOrganizationInput = {
  name: string;
  code: string;
  contactEmail: string;
  contactPhone: string;
  status: PartnerOrganizationStatus;
};

export type PartnerOrganizationValidation = {
  valid: boolean;
  normalized: PartnerOrganizationInput;
  errors: Partial<Record<keyof PartnerOrganizationInput, string>>;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,39}$/;

export function normalizePartnerCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "-");
}

export function validatePartnerOrganization(input: PartnerOrganizationInput): PartnerOrganizationValidation {
  const normalized: PartnerOrganizationInput = {
    name: input.name.trim(),
    code: normalizePartnerCode(input.code),
    contactEmail: input.contactEmail.trim().toLowerCase(),
    contactPhone: input.contactPhone.trim(),
    status: input.status,
  };
  const errors: PartnerOrganizationValidation["errors"] = {};
  if (normalized.name.length < 2 || normalized.name.length > 160) {
    errors.name = "Organization name must contain 2–160 characters.";
  }
  if (!CODE_PATTERN.test(normalized.code)) {
    errors.code = "Code must contain 2–40 uppercase letters, numbers, hyphens or underscores.";
  }
  if (normalized.contactEmail && !EMAIL_PATTERN.test(normalized.contactEmail)) {
    errors.contactEmail = "Enter a valid contact email address.";
  }
  if (normalized.contactPhone && (normalized.contactPhone.length < 7 || normalized.contactPhone.length > 30)) {
    errors.contactPhone = "Contact phone must contain 7–30 characters.";
  }
  if (!(["active", "suspended", "archived"] as string[]).includes(normalized.status)) {
    errors.status = "Choose a valid organization status.";
  }
  return { valid: Object.keys(errors).length === 0, normalized, errors };
}

export function getPartnerReadiness(organization: Pick<PartnerOrganizationSummary,
  "status" | "partner_role_count" | "active_member_count" | "active_owner_count"
>): PartnerReadiness {
  const organizationCreated = true;
  const partnerRoleAssigned = organization.partner_role_count > 0;
  const activeMembershipExists = organization.active_member_count > 0;
  const activeOwnerAssigned = organization.active_owner_count > 0;
  const loginReady = organization.status === "active"
    && partnerRoleAssigned
    && activeMembershipExists
    && activeOwnerAssigned;

  let reason = "Partner login is ready.";
  if (organization.status === "suspended") reason = "Organization is suspended.";
  else if (organization.status === "archived") reason = "Organization is archived.";
  else if (!partnerRoleAssigned) reason = "No member account has the Partner profile role.";
  else if (!activeMembershipExists) reason = "No active Partner membership exists.";
  else if (!activeOwnerAssigned) reason = "No active owner is assigned.";

  return { organizationCreated, partnerRoleAssigned, activeMembershipExists, activeOwnerAssigned, loginReady, reason };
}

export function filterPartnerOrganizations(
  organizations: PartnerOrganizationSummary[],
  search: string,
  status: "all" | PartnerOrganizationStatus,
  readiness: PartnerReadinessFilter,
) {
  const query = search.trim().toLocaleLowerCase();
  return organizations.filter((organization) => {
    const matchesSearch = !query || [organization.name, organization.code, organization.contact_email, organization.contact_phone, organization.owner_name]
      .some((value) => String(value ?? "").toLocaleLowerCase().includes(query));
    const matchesStatus = status === "all" || organization.status === status;
    const ready = getPartnerReadiness(organization).loginReady;
    const matchesReadiness = readiness === "all" || (readiness === "ready" ? ready : !ready);
    return matchesSearch && matchesStatus && matchesReadiness;
  });
}

export function canPromoteToPartner(profileRole: string) {
  return profileRole === "customer" || profileRole === "driver" || profileRole === "partner";
}

export function isDatabaseLeadershipRole(profileRole: string | null | undefined) {
  return profileRole === "admin" || profileRole === "ceo";
}

export function canAccessAdminWorkspace(
  profileRole: string | null | undefined,
  accountStatus?: string | null,
) {
  return isDatabaseLeadershipRole(profileRole) && accountStatus !== "suspended";
}

export function getPartnerPromotionWarning(profile: Pick<PartnerProfileSummary, "full_name" | "profile_role">) {
  if (profile.profile_role === "partner") return "This account already has the Partner role. A membership will be added without changing its profile role.";
  if (profile.profile_role === "admin" || profile.profile_role === "ceo") return "Admin and CEO roles are protected and cannot be replaced.";
  return `${profile.full_name}'s ${profile.profile_role} portal role will be replaced with Partner. The previous role is recorded in the audit trail; confirm this access change before continuing.`;
}

export function canChangeMembership(
  members: PartnerMemberSummary[],
  membershipId: string,
  nextPermission: PartnerPermission,
  nextStatus: PartnerMembershipStatus,
) {
  const current = members.find((member) => member.id === membershipId);
  if (!current) return { allowed: false, reason: "Membership was not found." };
  const removesActiveOwner = current.active
    && current.member_role === "owner"
    && (nextPermission !== "owner" || nextStatus === "disabled");
  const otherActiveOwners = members.filter((member) => member.id !== membershipId && member.active && member.member_role === "owner").length;
  if (removesActiveOwner && otherActiveOwners === 0) {
    return { allowed: false, reason: "Transfer ownership first. The final active owner cannot be disabled or demoted." };
  }
  return { allowed: true, reason: "Membership change is safe." };
}

export function canPartnerLogin(profileRole: string | null, membershipActive: boolean, organizationStatus: string | null) {
  return profileRole === "partner" && membershipActive && organizationStatus === "active";
}
