import { supabase } from "./supabase.client";
import type {
  PartnerMemberSummary,
  PartnerMembershipStatus,
  PartnerOrganizationInput,
  PartnerOrganizationSummary,
  PartnerPermission,
  PartnerProfileSummary,
} from "../domain/partner-onboarding";

export type PartnerActivitySummary = {
  id: number;
  partner_id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type PartnerDocumentReviewItem = {
  id: string;
  partner_id: string;
  file_name: string;
  storage_path: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

function throwIfError(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.code === "23505" || /duplicate|already exists|already belongs/i.test(error.message)) {
    throw new Error(/organization code/i.test(error.message) ? error.message : "This account already belongs to the selected organization.");
  }
  throw new Error(error.message);
}

export async function loadPartnerOrganizationOverview() {
  const { data, error } = await supabase.rpc("admin_partner_organization_overview");
  throwIfError(error);
  return (data ?? []) as PartnerOrganizationSummary[];
}

export async function searchPartnerProfiles(query: string) {
  if (query.trim().length < 2) return [] as PartnerProfileSummary[];
  const { data, error } = await supabase.rpc("admin_search_partner_profiles", {
    p_query: query.trim(),
    p_limit: 25,
  });
  throwIfError(error);
  return (data ?? []) as PartnerProfileSummary[];
}

export async function loadPartnerMembers(partnerId: string) {
  const { data, error } = await supabase.rpc("admin_partner_members", { p_partner_id: partnerId });
  throwIfError(error);
  return (data ?? []) as PartnerMemberSummary[];
}

export async function loadPartnerActivity(partnerId: string) {
  const { data, error } = await supabase
    .from("partner_activity_log")
    .select("id,partner_id,actor_id,action,entity_type,entity_id,metadata,created_at")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })
    .limit(50);
  throwIfError(error);
  return (data ?? []) as PartnerActivitySummary[];
}

export async function loadPendingPartnerDocuments(partnerId: string) {
  const { data, error } = await supabase
    .from("partner_documents")
    .select("id,partner_id,file_name,storage_path,status,created_at")
    .eq("partner_id", partnerId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  throwIfError(error);
  return (data ?? []) as PartnerDocumentReviewItem[];
}

export async function openPartnerDocumentForReview(storagePath: string) {
  const { data, error } = await supabase.storage.from("partner-documents").createSignedUrl(storagePath, 300);
  throwIfError(error);
  window.open(data?.signedUrl, "_blank", "noopener,noreferrer");
}

export async function reviewPartnerDocument(document: PartnerDocumentReviewItem, decision: "approved" | "rejected") {
  const { data: sessionData } = await supabase.auth.getSession();
  const reviewerId = sessionData.session?.user.id;
  if (!reviewerId) throw new Error("Admin session expired.");
  const { error: updateError } = await supabase.from("partner_documents").update({ status: decision, updated_at: new Date().toISOString() }).eq("id", document.id).eq("status", "pending");
  throwIfError(updateError);
  const { error: reviewError } = await supabase.from("partner_document_reviews").insert({ partner_id: document.partner_id, document_id: document.id, decision, reviewed_by: reviewerId });
  throwIfError(reviewError);
  const { error: auditError } = await supabase.from("partner_activity_log").insert({ partner_id: document.partner_id, actor_id: reviewerId, action: `document_${decision}`, entity_type: "document", entity_id: document.id });
  throwIfError(auditError);
}

export async function createPartnerOrganization(input: PartnerOrganizationInput) {
  const { data, error } = await supabase.rpc("admin_create_partner_organization", {
    p_name: input.name,
    p_code: input.code,
    p_contact_email: input.contactEmail || null,
    p_contact_phone: input.contactPhone || null,
    p_status: input.status,
  });
  throwIfError(error);
  return data as string;
}

export async function onboardPartnerMember(input: {
  partnerId: string;
  userId: string;
  permission: PartnerPermission;
  status: PartnerMembershipStatus;
  confirmRoleReplacement: boolean;
}) {
  const { data, error } = await supabase.rpc("admin_onboard_partner_member", {
    p_partner_id: input.partnerId,
    p_user_id: input.userId,
    p_member_role: input.permission,
    p_active: input.status === "active",
    p_confirm_role_replacement: input.confirmRoleReplacement,
  });
  throwIfError(error);
  return data as string;
}

export async function updatePartnerMembership(input: {
  membershipId: string;
  permission: PartnerPermission;
  status: PartnerMembershipStatus;
}) {
  const { error } = await supabase.rpc("admin_update_partner_membership", {
    p_membership_id: input.membershipId,
    p_member_role: input.permission,
    p_active: input.status === "active",
  });
  throwIfError(error);
}

export async function transferPartnerOwnership(input: {
  partnerId: string;
  fromMembershipId: string;
  toMembershipId: string;
}) {
  const { error } = await supabase.rpc("admin_transfer_partner_ownership", {
    p_partner_id: input.partnerId,
    p_from_membership_id: input.fromMembershipId,
    p_to_membership_id: input.toMembershipId,
  });
  throwIfError(error);
}

export async function setPartnerOrganizationStatus(partnerId: string, status: "active" | "suspended" | "archived") {
  const { error } = await supabase.rpc("admin_set_partner_organization_status", {
    p_partner_id: partnerId,
    p_status: status,
  });
  throwIfError(error);
}

export async function getPartnerLoginAccess() {
  const { data, error } = await supabase.rpc("partner_login_access");
  throwIfError(error);
  const row = (data as Array<{
    profile_role: string;
    active_membership_count: number | string;
    active_organization_count: number | string;
    allowed: boolean;
  }> | null)?.[0];
  return {
    profileRole: row?.profile_role ?? null,
    activeMembershipCount: Number(row?.active_membership_count ?? 0),
    activeOrganizationCount: Number(row?.active_organization_count ?? 0),
    allowed: row?.allowed === true,
  };
}
