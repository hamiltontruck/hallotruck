export type PartnerRole = "partner" | "admin" | "ceo" | string | null | undefined;
export type PartnerMemberRole = "owner" | "admin" | "editor" | "viewer" | string | null | undefined;

export function canOpenPartnerPortal(role: PartnerRole) {
  return role === "partner" || role === "admin" || role === "ceo";
}

export function canManagePartnerWorkspace(role: PartnerRole, memberRole: PartnerMemberRole) {
  if (role === "admin" || role === "ceo") return true;
  return role === "partner" && (memberRole === "owner" || memberRole === "admin" || memberRole === "editor");
}

export function belongsToPartner(recordPartnerId: string, allowedPartnerIds: readonly string[]) {
  return allowedPartnerIds.includes(recordPartnerId);
}

export type PartnerSummaryInput = {
  projects: Array<{ status: string }>;
  payments: Array<{ amount_etb: number | string; status: string }>;
  documents: Array<{ status: string }>;
  members: Array<{ active: boolean }>;
};

export function buildPartnerDashboardSummary(input: PartnerSummaryInput) {
  const paidEtb = input.payments
    .filter((payment) => payment.status === "paid")
    .reduce((sum, payment) => sum + Number(payment.amount_etb || 0), 0);
  const pendingEtb = input.payments
    .filter((payment) => payment.status === "pending" || payment.status === "approved")
    .reduce((sum, payment) => sum + Number(payment.amount_etb || 0), 0);
  return {
    projects: input.projects.length,
    activeProjects: input.projects.filter((project) => project.status === "active").length,
    paidEtb,
    pendingEtb,
    pendingDocuments: input.documents.filter((document) => document.status === "pending").length,
    activeMembers: input.members.filter((member) => member.active).length,
  };
}
