import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  canChangeMembership,
  canPromoteToPartner,
  filterPartnerOrganizations,
  getPartnerPromotionWarning,
  getPartnerReadiness,
  normalizePartnerCode,
  validatePartnerOrganization,
  type PartnerMemberSummary,
  type PartnerMembershipStatus,
  type PartnerOrganizationStatus,
  type PartnerOrganizationSummary,
  type PartnerPermission,
  type PartnerProfileSummary,
  type PartnerReadinessFilter,
} from "../domain/partner-onboarding";
import {
  createPartnerOrganization,
  loadPartnerActivity,
  loadPendingPartnerDocuments,
  loadPartnerMembers,
  loadPartnerOrganizationOverview,
  onboardPartnerMember,
  openPartnerDocumentForReview,
  reviewPartnerDocument,
  searchPartnerProfiles,
  setPartnerOrganizationStatus,
  transferPartnerOwnership,
  updatePartnerMembership,
  type PartnerActivitySummary,
  type PartnerDocumentReviewItem,
} from "../services/admin-partner-onboarding.service";
import { supabase } from "../services/supabase.client";

type Feedback = { kind: "success" | "error"; message: string } | null;
type Confirmation = { title: string; message: string; label: string; danger?: boolean; run: () => Promise<void> } | null;

export type AdminPartnerControlFixture = {
  organizations: PartnerOrganizationSummary[];
  membersByOrganization?: Record<string, PartnerMemberSummary[]>;
  activityByOrganization?: Record<string, PartnerActivitySummary[]>;
  documentsByOrganization?: Record<string, PartnerDocumentReviewItem[]>;
  profileResults?: PartnerProfileSummary[];
};

const emptyOrganizationForm = {
  name: "",
  code: "",
  contactEmail: "",
  contactPhone: "",
  status: "active" as PartnerOrganizationStatus,
};
const permissions: PartnerPermission[] = ["owner", "admin", "editor", "viewer"];

export function AdminPartnerControl({ fixture = null }: { fixture?: AdminPartnerControlFixture | null } = {}) {
  const [organizations, setOrganizations] = useState<PartnerOrganizationSummary[]>(fixture?.organizations ?? []);
  const [members, setMembers] = useState<PartnerMemberSummary[]>([]);
  const [activity, setActivity] = useState<PartnerActivitySummary[]>([]);
  const [documents, setDocuments] = useState<PartnerDocumentReviewItem[]>([]);
  const [loading, setLoading] = useState(!fixture);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(fixture?.organizations[0]?.id ?? "");
  const [organizationForm, setOrganizationForm] = useState(emptyOrganizationForm);
  const [organizationErrors, setOrganizationErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PartnerOrganizationStatus>("all");
  const [readinessFilter, setReadinessFilter] = useState<PartnerReadinessFilter>("all");
  const [profileQuery, setProfileQuery] = useState("");
  const [profileResults, setProfileResults] = useState<PartnerProfileSummary[]>(fixture?.profileResults ?? []);
  const [profileSearching, setProfileSearching] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<PartnerProfileSummary | null>(null);
  const [memberPermission, setMemberPermission] = useState<PartnerPermission>("viewer");
  const [memberStatus, setMemberStatus] = useState<PartnerMembershipStatus>("active");

  const loadOverview = useCallback(async (preferredOrganizationId?: string) => {
    if (fixture) return;
    setLoading(true);
    try {
      const next = await loadPartnerOrganizationOverview();
      setOrganizations(next);
      setSelectedOrganizationId((current) => preferredOrganizationId || current || next[0]?.id || "");
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Partner organizations could not be loaded." });
    } finally { setLoading(false); }
  }, [fixture]);

  const loadDetails = useCallback(async (organizationId: string) => {
    if (!organizationId) { setMembers([]); setActivity([]); setDocuments([]); return; }
    if (fixture) {
      setMembers(fixture.membersByOrganization?.[organizationId] ?? []);
      setActivity(fixture.activityByOrganization?.[organizationId] ?? []);
      setDocuments(fixture.documentsByOrganization?.[organizationId] ?? []);
      return;
    }
    setDetailLoading(true);
    try {
      const [nextMembers, nextActivity, nextDocuments] = await Promise.all([loadPartnerMembers(organizationId), loadPartnerActivity(organizationId), loadPendingPartnerDocuments(organizationId)]);
      setMembers(nextMembers);
      setActivity(nextActivity);
      setDocuments(nextDocuments);
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Organization details could not be loaded." });
    } finally { setDetailLoading(false); }
  }, [fixture]);

  useEffect(() => { void loadOverview(); }, [loadOverview]);
  useEffect(() => { void loadDetails(selectedOrganizationId); }, [loadDetails, selectedOrganizationId]);

  useEffect(() => {
    if (fixture) return;
    const channel = supabase
      .channel("admin-partner-onboarding-control")
      .on("postgres_changes", { event: "*", schema: "public", table: "partner_organizations" }, () => void loadOverview())
      .on("postgres_changes", { event: "*", schema: "public", table: "partner_memberships" }, () => { void loadOverview(); void loadDetails(selectedOrganizationId); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "partner_activity_log" }, () => { void loadOverview(); void loadDetails(selectedOrganizationId); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [fixture, loadDetails, loadOverview, selectedOrganizationId]);

  useEffect(() => {
    if (fixture) { setProfileResults(fixture.profileResults ?? []); return; }
    setSelectedProfile(null);
    if (profileQuery.trim().length < 2) { setProfileResults([]); setProfileSearching(false); return; }
    let current = true;
    const timeout = window.setTimeout(async () => {
      setProfileSearching(true);
      try {
        const results = await searchPartnerProfiles(profileQuery);
        if (current) setProfileResults(results);
      } catch (error) {
        if (current) setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Account search failed." });
      } finally { if (current) setProfileSearching(false); }
    }, 300);
    return () => { current = false; window.clearTimeout(timeout); };
  }, [fixture, profileQuery]);

  const filteredOrganizations = useMemo(
    () => filterPartnerOrganizations(organizations, search, statusFilter, readinessFilter),
    [organizations, readinessFilter, search, statusFilter],
  );
  const selectedOrganization = organizations.find((organization) => organization.id === selectedOrganizationId) ?? null;
  const selectedReadiness = selectedOrganization ? getPartnerReadiness(selectedOrganization) : null;

  function showError(error: unknown, fallback: string) {
    setFeedback({ kind: "error", message: error instanceof Error ? error.message : fallback });
  }
  async function refreshSelected(organizationId = selectedOrganizationId) {
    await loadOverview(organizationId);
    await loadDetails(organizationId);
  }
  function openOrganizationDetails(organizationId: string) {
    setSelectedOrganizationId(organizationId);
    window.setTimeout(() => document.getElementById("partner-organization-details")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  async function submitOrganization(event: FormEvent) {
    event.preventDefault();
    const validation = validatePartnerOrganization(organizationForm);
    setOrganizationErrors(validation.errors);
    if (!validation.valid) { setFeedback({ kind: "error", message: "Correct the highlighted organization fields." }); return; }
    setBusy(true); setFeedback(null);
    try {
      const organizationId = fixture ? `fixture-${Date.now()}` : await createPartnerOrganization(validation.normalized);
      if (fixture) {
        setOrganizations((current) => [{
          id: organizationId, name: validation.normalized.name, code: validation.normalized.code,
          status: validation.normalized.status, contact_email: validation.normalized.contactEmail || null,
          contact_phone: validation.normalized.contactPhone || null, created_at: new Date().toISOString(), owner_name: null,
          active_member_count: 0, partner_role_count: 0, active_owner_count: 0, project_count: 0,
          pending_document_count: 0, pending_payment_count: 0, latest_activity: "organization_created",
          latest_activity_at: new Date().toISOString(),
        }, ...current]);
      } else await loadOverview(organizationId);
      setSelectedOrganizationId(organizationId);
      setOrganizationForm(emptyOrganizationForm);
      setFeedback({ kind: "success", message: `${validation.normalized.name} was created. Assign an active owner to make Partner login ready.` });
    } catch (error) { showError(error, "Partner organization could not be created."); }
    finally { setBusy(false); }
  }

  async function performOnboarding(confirmRoleReplacement: boolean) {
    if (!selectedOrganization || !selectedProfile) return;
    setBusy(true); setFeedback(null);
    try {
      if (!fixture) {
        await onboardPartnerMember({ partnerId: selectedOrganization.id, userId: selectedProfile.id, permission: memberPermission, status: memberStatus, confirmRoleReplacement });
        await refreshSelected(selectedOrganization.id);
      }
      setFeedback({ kind: "success", message: `${selectedProfile.full_name} was assigned to ${selectedOrganization.name}.` });
      setSelectedProfile(null); setProfileQuery(""); setProfileResults([]);
    } catch (error) { showError(error, "Partner membership could not be created."); }
    finally { setBusy(false); }
  }

  function submitMembership(event: FormEvent) {
    event.preventDefault();
    if (!selectedOrganization || !selectedProfile) { setFeedback({ kind: "error", message: "Choose an organization and an existing account first." }); return; }
    if (!canPromoteToPartner(selectedProfile.profile_role)) { setFeedback({ kind: "error", message: "Admin and CEO roles are protected and cannot be replaced." }); return; }
    if (selectedOrganization.active_owner_count === 0 && (memberPermission !== "owner" || memberStatus !== "active")) {
      setFeedback({ kind: "error", message: "This organization has no active owner. Its first active membership must use Owner permission." });
      return;
    }
    if (selectedProfile.profile_role === "customer" || selectedProfile.profile_role === "driver") {
      setConfirmation({ title: "Confirm Partner role promotion", message: getPartnerPromotionWarning(selectedProfile), label: "Promote and assign", run: () => performOnboarding(true) });
      return;
    }
    void performOnboarding(false);
  }

  function requestOrganizationStatus(status: PartnerOrganizationStatus) {
    if (!selectedOrganization) return;
    const verb = status === "active" ? "reactivate" : status;
    setConfirmation({
      title: `${verb[0].toUpperCase()}${verb.slice(1)} organization`,
      message: status === "active" ? `Reactivate ${selectedOrganization.name}? Ready Partner members will regain portal access.` : `${verb[0].toUpperCase()}${verb.slice(1)} ${selectedOrganization.name}? Partner portal access will stop, while projects, documents, payments and audit history remain preserved.`,
      label: status === "active" ? "Reactivate" : status === "suspended" ? "Suspend" : "Archive", danger: status !== "active",
      run: async () => {
        if (!fixture) await setPartnerOrganizationStatus(selectedOrganization.id, status);
        await refreshSelected(selectedOrganization.id);
        setFeedback({ kind: "success", message: `${selectedOrganization.name} is now ${status}.` });
      },
    });
  }

  async function saveMembership(member: PartnerMemberSummary, permission: PartnerPermission, status: PartnerMembershipStatus) {
    const safety = canChangeMembership(members, member.id, permission, status);
    if (!safety.allowed) { setFeedback({ kind: "error", message: safety.reason }); return; }
    const changingAccess = member.active !== (status === "active");
    const run = async () => {
      setBusy(true);
      try {
        if (!fixture) await updatePartnerMembership({ membershipId: member.id, permission, status });
        await refreshSelected(member.partner_id);
        setFeedback({ kind: "success", message: `${member.full_name}'s membership was updated and audited.` });
      } catch (error) { showError(error, "Membership could not be updated."); }
      finally { setBusy(false); }
    };
    if (changingAccess) {
      setConfirmation({
        title: status === "disabled" ? "Disable membership" : "Reactivate membership",
        message: status === "disabled" ? `Disable ${member.full_name}? Their Partner access to this organization will stop; history remains preserved.` : `Reactivate ${member.full_name}'s membership? Their Partner access will resume when the organization is active.`,
        label: status === "disabled" ? "Disable" : "Reactivate", danger: status === "disabled", run,
      });
    } else void run();
  }

  function requestOwnershipTransfer(target: PartnerMemberSummary) {
    const currentOwner = members.find((member) => member.active && member.member_role === "owner");
    if (!selectedOrganization || !currentOwner) { setFeedback({ kind: "error", message: "No active current owner is available for transfer." }); return; }
    setConfirmation({
      title: "Transfer organization ownership",
      message: `${target.full_name} will become Owner. ${currentOwner.full_name} will remain active with Admin permission. This atomic change is recorded in the audit log.`,
      label: "Transfer ownership",
      run: async () => {
        setBusy(true);
        try {
          if (!fixture) await transferPartnerOwnership({ partnerId: selectedOrganization.id, fromMembershipId: currentOwner.id, toMembershipId: target.id });
          await refreshSelected(selectedOrganization.id);
          setFeedback({ kind: "success", message: `Ownership was transferred to ${target.full_name}.` });
        } catch (error) { showError(error, "Ownership transfer failed."); }
        finally { setBusy(false); }
      },
    });
  }

  async function confirmAction() {
    if (!confirmation) return;
    const action = confirmation.run;
    setConfirmation(null);
    try { await action(); } catch (error) { showError(error, "The confirmed action failed."); }
  }

  async function decideDocument(document: PartnerDocumentReviewItem, decision: "approved" | "rejected") {
    setBusy(true);
    try {
      if (!fixture) await reviewPartnerDocument(document, decision);
      await refreshSelected(document.partner_id);
      setFeedback({ kind: "success", message: `${document.file_name} was ${decision} and added to audit history.` });
    } catch (error) { showError(error, "Document review failed."); }
    finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen min-w-0 overflow-x-hidden bg-[#f5f3ed] text-asphalt">
      <section className="mx-auto min-w-0 max-w-7xl px-3 py-5 sm:px-6 sm:py-8">
        <header className="min-w-0 bg-asphalt p-5 text-white sm:p-8">
          <p className="font-mono text-[10px] tracking-[.22em] text-amber">PARTNER ONBOARDING CONTROL</p>
          <div className="mt-3 flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0"><h1 className="break-words font-display text-3xl font-bold sm:text-4xl">HALLO Logistics Partner network</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">Create verified organizations, promote existing accounts safely, protect ownership and make every Partner login decision auditable.</p></div>
            <a href="#/partner/login" target="_blank" rel="noreferrer" className="w-fit border border-amber/60 px-4 py-3 text-xs font-semibold text-amber">Open Partner Login ↗</a>
          </div>
        </header>

        {feedback && <div role="status" className={`mt-4 break-words border p-4 text-sm ${feedback.kind === "success" ? "border-emerald-700/30 bg-emerald-50 text-emerald-800" : "border-route/30 bg-route/5 text-route"}`}>{feedback.message}</div>}

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Organizations" value={String(organizations.length)} detail={`${organizations.filter((item) => item.status === "active").length} active`} />
          <Metric label="Login ready" value={String(organizations.filter((item) => getPartnerReadiness(item).loginReady).length)} detail="Role + membership + owner" />
          <Metric label="Active members" value={String(organizations.reduce((sum, item) => sum + Number(item.active_member_count), 0))} detail="Across all partners" />
          <Metric label="Needs action" value={String(organizations.filter((item) => !getPartnerReadiness(item).loginReady).length)} detail="Exact reasons below" warning />
        </div>

        <div className="mt-5 grid min-w-0 gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
          <form onSubmit={submitOrganization} className="min-w-0 border border-asphalt/10 bg-white p-5 sm:p-6">
            <SectionHeading eyebrow="ORGANIZATION" title="Create Partner organization" description="Use a unique company code. No sample organization is inserted." />
            <Field label="Organization name" error={organizationErrors.name}><input required maxLength={160} value={organizationForm.name} onChange={(event) => setOrganizationForm((current) => ({ ...current, name: event.target.value }))} className="control-input" placeholder="Company or partner name" /></Field>
            <Field label="Organization code" error={organizationErrors.code}><input required maxLength={40} value={organizationForm.code} onChange={(event) => setOrganizationForm((current) => ({ ...current, code: normalizePartnerCode(event.target.value) }))} className="control-input font-mono uppercase" placeholder="PARTNER-01" /></Field>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <Field label="Contact email" error={organizationErrors.contactEmail}><input type="email" maxLength={254} value={organizationForm.contactEmail} onChange={(event) => setOrganizationForm((current) => ({ ...current, contactEmail: event.target.value }))} className="control-input" placeholder="operations@company.com" /></Field>
              <Field label="Contact phone" error={organizationErrors.contactPhone}><input type="tel" maxLength={30} value={organizationForm.contactPhone} onChange={(event) => setOrganizationForm((current) => ({ ...current, contactPhone: event.target.value }))} className="control-input" placeholder="+251…" /></Field>
            </div>
            <Field label="Initial status" error={organizationErrors.status}><select value={organizationForm.status} onChange={(event) => setOrganizationForm((current) => ({ ...current, status: event.target.value as PartnerOrganizationStatus }))} className="control-input"><option value="active">Active</option><option value="suspended">Suspended</option><option value="archived">Archived</option></select></Field>
            <button disabled={busy} className="mt-5 w-full bg-asphalt px-5 py-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Create organization"}</button>
          </form>

          <section className="min-w-0 border border-asphalt/10 bg-white">
            <div className="border-b border-asphalt/10 p-5 sm:p-6">
              <SectionHeading eyebrow="NETWORK CONTROL" title="Organizations" description="Search by name, code, owner, email or phone; filter operational readiness." />
              <div className="mt-5 grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px]">
                <input aria-label="Search Partner organizations" value={search} onChange={(event) => setSearch(event.target.value)} className="control-input mt-0" placeholder="Search name, code, owner, email or phone" />
                <select aria-label="Filter organization status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="control-input mt-0"><option value="all">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="archived">Archived</option></select>
                <select aria-label="Filter Partner readiness" value={readinessFilter} onChange={(event) => setReadinessFilter(event.target.value as PartnerReadinessFilter)} className="control-input mt-0"><option value="all">All readiness</option><option value="ready">Login ready</option><option value="not_ready">Needs action</option></select>
              </div>
            </div>
            {loading ? <LoadingState label="Loading Partner organizations…" /> : filteredOrganizations.length === 0 ? <EmptyState title="No organizations match" description="Change the search or filters, or create the first Partner organization." /> : <div className="divide-y divide-asphalt/10">{filteredOrganizations.map((organization) => <OrganizationCard key={organization.id} organization={organization} selected={organization.id === selectedOrganizationId} onOpen={() => openOrganizationDetails(organization.id)} />)}</div>}
          </section>
        </div>

        {selectedOrganization && selectedReadiness && (
          <section id="partner-organization-details" className="mt-5 min-w-0 border border-asphalt/10 bg-white">
            <header className="min-w-0 border-b border-asphalt/10 p-5 sm:p-6">
              <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0"><p className="font-mono text-[10px] tracking-[.18em] text-amber-dim">ORGANIZATION DETAILS</p><h2 className="mt-2 break-words font-display text-2xl font-bold sm:text-3xl">{selectedOrganization.name}</h2><p className="mt-2 break-all font-mono text-xs text-steel">{selectedOrganization.code} · {selectedOrganization.id}</p><p className="mt-2 break-all text-xs text-steel">{selectedOrganization.contact_email ?? "No contact email"} · {selectedOrganization.contact_phone ?? "No contact phone"}</p></div>
                <div className="flex min-w-0 flex-wrap gap-2">
                  <a href="#/partner/login" target="_blank" rel="noreferrer" className="border border-asphalt/15 px-3 py-2 text-xs font-semibold">Open Partner Login ↗</a>
                  {selectedReadiness.loginReady
                    ? <a href={`#/partner?organization=${selectedOrganization.id}`} target="_blank" rel="noreferrer" className="border border-emerald-700 px-3 py-2 text-xs font-semibold text-emerald-800">Open Partner Dashboard ↗</a>
                    : <button type="button" disabled title={selectedReadiness.reason} className="cursor-not-allowed border border-asphalt/10 px-3 py-2 text-xs font-semibold text-steel/45">Open Partner Dashboard · not ready</button>}
                  {selectedOrganization.status === "active" ? <button type="button" onClick={() => requestOrganizationStatus("suspended")} className="border border-route/40 px-3 py-2 text-xs font-semibold text-route">Suspend</button> : <button type="button" onClick={() => requestOrganizationStatus("active")} className="border border-emerald-700 px-3 py-2 text-xs font-semibold text-emerald-800">Reactivate</button>}
                  {selectedOrganization.status !== "archived" && <button type="button" onClick={() => requestOrganizationStatus("archived")} className="border border-route/40 px-3 py-2 text-xs font-semibold text-route">Archive</button>}
                </div>
              </div>
            </header>

            <div className="grid min-w-0 gap-5 p-5 sm:p-6 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="min-w-0 space-y-5">
                <ReadinessPanel readiness={selectedReadiness} />
                <section className="min-w-0 border border-asphalt/10">
                  <header className="flex flex-wrap items-center justify-between gap-2 border-b border-asphalt/10 p-4"><div><h3 className="font-display text-xl font-bold">Document review queue</h3><p className="mt-1 text-xs text-steel">Open private files with short-lived signed links, then record the decision.</p></div><span className="font-mono text-xs text-steel">{documents.length} PENDING</span></header>
                  {documents.length === 0 ? <EmptyState title="No documents need review" description="New Partner uploads will appear here." /> : <div className="divide-y divide-asphalt/10">{documents.map((document) => <div key={document.id} className="min-w-0 p-4"><p className="break-all text-sm font-semibold">{document.file_name}</p><p className="mt-1 text-xs text-steel">Submitted {new Date(document.created_at).toLocaleString()}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void openPartnerDocumentForReview(document.storage_path)} className="border border-emerald-700 px-3 py-2 text-xs font-semibold text-emerald-800">Open securely</button><button type="button" disabled={busy} onClick={() => void decideDocument(document, "approved")} className="bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Approve</button><button type="button" disabled={busy} onClick={() => void decideDocument(document, "rejected")} className="border border-route px-3 py-2 text-xs font-semibold text-route disabled:opacity-50">Reject</button></div></div>)}</div>}
                </section>
                <section className="min-w-0 border border-asphalt/10">
                  <header className="flex flex-wrap items-center justify-between gap-2 border-b border-asphalt/10 p-4"><div><h3 className="font-display text-xl font-bold">Member management</h3><p className="mt-1 text-xs text-steel">Permission, access status and ownership remain audit-backed.</p></div><span className="font-mono text-xs text-steel">{members.length} MEMBERS</span></header>
                  {detailLoading ? <LoadingState label="Loading members…" /> : members.length === 0 ? <EmptyState title="No Partner members" description="Search an existing account and assign the first active Owner." /> : <div className="divide-y divide-asphalt/10">{members.map((member) => <MemberCard key={member.id} member={member} members={members} busy={busy} onSave={saveMembership} onTransfer={requestOwnershipTransfer} />)}</div>}
                </section>
                <section className="min-w-0 border border-asphalt/10">
                  <header className="border-b border-asphalt/10 p-4"><h3 className="font-display text-xl font-bold">Audit history</h3><p className="mt-1 text-xs text-steel">Role, membership, ownership and organization-control changes.</p></header>
                  {activity.length === 0 ? <EmptyState title="No activity recorded" description="Onboarding actions will appear here." /> : <div className="divide-y divide-asphalt/10">{activity.map((item) => <ActivityRow key={item.id} activity={item} />)}</div>}
                </section>
              </div>

              <form onSubmit={submitMembership} className="min-w-0 self-start border border-asphalt/10 bg-[#f8f7f2] p-5">
                <SectionHeading eyebrow="ACCOUNT ONBOARDING" title="Assign existing account" description="Search by full name, email or phone. Profile UUID entry is not required." />
                <Field label="Organization"><select value={selectedOrganizationId} onChange={(event) => setSelectedOrganizationId(event.target.value)} className="control-input">{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name} · {organization.code}</option>)}</select></Field>
                <Field label="Search account"><input value={profileQuery} onChange={(event) => setProfileQuery(event.target.value)} className="control-input" placeholder="Name, email or phone" /></Field>
                {profileSearching && <p className="mt-2 font-mono text-xs text-steel">Searching profiles…</p>}
                {profileQuery.trim().length >= 2 && !profileSearching && profileResults.length === 0 && <p className="mt-2 border border-asphalt/10 bg-white p-3 text-xs text-steel">No existing account matches this search.</p>}
                {profileResults.length > 0 && <div className="mt-3 max-h-72 overflow-y-auto border border-asphalt/10 bg-white" role="listbox" aria-label="Existing account results">{profileResults.map((profile) => <ProfileResult key={profile.id} profile={profile} selected={selectedProfile?.id === profile.id} onSelect={() => setSelectedProfile(profile)} />)}</div>}
                {selectedProfile && <div className="mt-4 min-w-0 border border-amber/40 bg-amber/5 p-4"><p className="break-words font-semibold">{selectedProfile.full_name}</p><p className="mt-1 break-all text-xs text-steel">{selectedProfile.email ?? "No email"} · {selectedProfile.phone}</p><p className="mt-2 text-xs"><Badge label={selectedProfile.profile_role} tone={canPromoteToPartner(selectedProfile.profile_role) ? "neutral" : "danger"} /> <Badge label={selectedProfile.account_status} tone="neutral" /></p><p className={`mt-3 text-xs leading-5 ${canPromoteToPartner(selectedProfile.profile_role) ? "text-amber-dim" : "text-route"}`}>{getPartnerPromotionWarning(selectedProfile)}</p></div>}
                <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-1">
                  <Field label="Partner permission"><select value={memberPermission} onChange={(event) => setMemberPermission(event.target.value as PartnerPermission)} className="control-input">{permissions.map((permission) => <option key={permission} value={permission}>{capitalize(permission)}</option>)}</select></Field>
                  <Field label="Membership status"><select value={memberStatus} onChange={(event) => setMemberStatus(event.target.value as PartnerMembershipStatus)} className="control-input"><option value="active">Active</option><option value="disabled">Disabled</option></select></Field>
                </div>
                <button disabled={busy || !selectedProfile} className="mt-5 w-full bg-asphalt px-5 py-4 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Assigning…" : "Review and assign membership"}</button>
              </form>
            </div>
          </section>
        )}
      </section>
      {confirmation && <ConfirmationDialog confirmation={confirmation} busy={busy} onCancel={() => setConfirmation(null)} onConfirm={() => void confirmAction()} />}
    </main>
  );
}

function Metric({ label, value, detail, warning = false }: { label: string; value: string; detail: string; warning?: boolean }) { return <div className={`min-w-0 border bg-white p-4 sm:p-5 ${warning ? "border-amber" : "border-asphalt/10"}`}><p className="break-words font-mono text-[9px] uppercase tracking-wide text-steel">{label}</p><p className="mt-3 break-words font-display text-2xl font-bold sm:text-3xl">{value}</p><p className="mt-2 break-words text-xs text-steel">{detail}</p></div>; }
function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <div className="min-w-0"><p className="font-mono text-[9px] tracking-[.18em] text-amber-dim">{eyebrow}</p><h2 className="mt-2 break-words font-display text-xl font-bold sm:text-2xl">{title}</h2><p className="mt-2 break-words text-xs leading-5 text-steel">{description}</p></div>; }
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) { return <label className="mt-4 block min-w-0 text-xs font-semibold"><span className="break-words">{label}</span>{children}{error && <span className="mt-2 block break-words font-normal text-route">{error}</span>}</label>; }

function OrganizationCard({ organization, selected, onOpen }: { organization: PartnerOrganizationSummary; selected: boolean; onOpen: () => void }) {
  const readiness = getPartnerReadiness(organization);
  return <article className={`min-w-0 p-4 sm:p-5 ${selected ? "bg-amber/5" : ""}`}><div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><h3 className="break-words font-display text-xl font-bold">{organization.name}</h3><p className="mt-1 break-all font-mono text-[10px] text-steel">{organization.code}</p></div><div className="flex flex-wrap gap-2"><Badge label={organization.status} tone={organization.status === "active" ? "success" : organization.status === "suspended" ? "warning" : "neutral"} /><Badge label={readiness.loginReady ? "Login ready" : "Needs action"} tone={readiness.loginReady ? "success" : "danger"} /></div></div><p className={`mt-3 break-words text-xs ${readiness.loginReady ? "text-emerald-800" : "text-route"}`}>{readiness.reason}</p><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"><MiniMetric label="Members" value={organization.active_member_count} /><MiniMetric label="Projects" value={organization.project_count} /><MiniMetric label="Documents" value={organization.pending_document_count} /><MiniMetric label="Payments" value={organization.pending_payment_count} /><MiniMetric label="Owners" value={organization.active_owner_count} /><MiniMetric label="Latest" value={organization.latest_activity ? humanize(organization.latest_activity) : "None"} /></div><div className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-3"><div className="min-w-0"><p className="break-words text-xs text-steel">Owner: <strong className="text-asphalt">{organization.owner_name ?? "Not assigned"}</strong></p>{organization.latest_activity_at && <time className="mt-1 block text-[10px] text-steel">Latest activity: {new Date(organization.latest_activity_at).toLocaleString()}</time>}</div><button type="button" onClick={onOpen} className="border border-asphalt px-4 py-2 text-xs font-semibold">Open Organization Details →</button></div></article>;
}
function MiniMetric({ label, value }: { label: string; value: string | number }) { return <div className="min-w-0 bg-[#f5f3ed] p-3"><p className="break-words font-mono text-[8px] uppercase text-steel">{label}</p><p className="mt-2 break-words text-sm font-semibold">{value}</p></div>; }

function ReadinessPanel({ readiness }: { readiness: ReturnType<typeof getPartnerReadiness> }) {
  const items = [["Organization created", readiness.organizationCreated], ["Partner-role account assigned", readiness.partnerRoleAssigned], ["Active membership exists", readiness.activeMembershipExists], ["Active owner assigned", readiness.activeOwnerAssigned], ["Partner login ready", readiness.loginReady]] as const;
  return <section className={`min-w-0 border p-4 sm:p-5 ${readiness.loginReady ? "border-emerald-700/30 bg-emerald-50" : "border-amber/50 bg-amber/5"}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-display text-xl font-bold">Onboarding readiness</h3><p className={`mt-2 break-words text-sm font-semibold ${readiness.loginReady ? "text-emerald-800" : "text-route"}`}>{readiness.reason}</p></div><Badge label={readiness.loginReady ? "READY" : "NOT READY"} tone={readiness.loginReady ? "success" : "danger"} /></div><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{items.map(([label, complete]) => <div key={label} className="min-w-0 bg-white/80 p-3"><p className={`text-lg font-bold ${complete ? "text-emerald-700" : "text-route"}`}>{complete ? "✓" : "!"}</p><p className="mt-1 break-words text-xs font-semibold">{label}</p></div>)}</div></section>;
}
function ProfileResult({ profile, selected, onSelect }: { profile: PartnerProfileSummary; selected: boolean; onSelect: () => void }) { return <button type="button" role="option" aria-selected={selected} onClick={onSelect} className={`block w-full min-w-0 border-b border-asphalt/10 p-3 text-left last:border-b-0 ${selected ? "bg-amber/10" : "hover:bg-asphalt/[.03]"}`}><span className="block break-words text-sm font-semibold">{profile.full_name}</span><span className="mt-1 block break-all text-xs text-steel">{profile.email ?? "No email"} · {profile.phone}</span><span className="mt-2 flex flex-wrap gap-2"><Badge label={profile.profile_role} tone={canPromoteToPartner(profile.profile_role) ? "neutral" : "danger"} /><Badge label={profile.account_status} tone="neutral" /></span></button>; }

function MemberCard({ member, members, busy, onSave, onTransfer }: { member: PartnerMemberSummary; members: PartnerMemberSummary[]; busy: boolean; onSave: (member: PartnerMemberSummary, permission: PartnerPermission, status: PartnerMembershipStatus) => Promise<void>; onTransfer: (member: PartnerMemberSummary) => void }) {
  const [permission, setPermission] = useState<PartnerPermission>(member.member_role);
  const [status, setStatus] = useState<PartnerMembershipStatus>(member.active ? "active" : "disabled");
  useEffect(() => { setPermission(member.member_role); setStatus(member.active ? "active" : "disabled"); }, [member.active, member.member_role]);
  const changed = permission !== member.member_role || status !== (member.active ? "active" : "disabled");
  const safety = canChangeMembership(members, member.id, permission, status);
  return <article className="min-w-0 p-4"><div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_150px_140px_auto] lg:items-end"><div className="min-w-0"><p className="break-words font-semibold">{member.full_name}</p><p className="mt-1 break-all text-xs text-steel">{member.email ?? "No email"} · {member.phone}</p><div className="mt-2 flex flex-wrap gap-2"><Badge label={`Profile: ${member.profile_role}`} tone={member.profile_role === "partner" ? "success" : "danger"} /><Badge label={member.account_status} tone="neutral" /></div></div><label className="min-w-0 text-[10px] font-semibold uppercase text-steel">Permission<select value={permission} onChange={(event) => setPermission(event.target.value as PartnerPermission)} className="control-input mt-2 text-xs normal-case text-asphalt">{permissions.map((item) => <option key={item} value={item}>{capitalize(item)}</option>)}</select></label><label className="min-w-0 text-[10px] font-semibold uppercase text-steel">Status<select value={status} onChange={(event) => setStatus(event.target.value as PartnerMembershipStatus)} className="control-input mt-2 text-xs normal-case text-asphalt"><option value="active">Active</option><option value="disabled">Disabled</option></select></label><button type="button" disabled={busy || !changed || !safety.allowed} title={safety.reason} onClick={() => void onSave(member, permission, status)} className="border border-asphalt bg-asphalt px-4 py-3 text-xs font-semibold text-white disabled:border-asphalt/10 disabled:bg-asphalt/10 disabled:text-steel/50">Save</button></div>{!safety.allowed && <p className="mt-3 break-words text-xs font-semibold text-route">{safety.reason}</p>}{member.active && member.member_role !== "owner" && member.profile_role === "partner" && <button type="button" disabled={busy} onClick={() => onTransfer(member)} className="mt-3 text-xs font-semibold text-amber-dim underline underline-offset-4">Transfer ownership to this member</button>}</article>;
}
function ActivityRow({ activity }: { activity: PartnerActivitySummary }) { return <div className="min-w-0 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><p className="break-words text-sm font-semibold">{humanize(activity.action)}</p><time className="text-[10px] text-steel">{new Date(activity.created_at).toLocaleString()}</time></div><p className="mt-1 break-all font-mono text-[9px] text-steel">{activity.entity_type}{activity.entity_id ? ` · ${activity.entity_id}` : ""}</p>{Object.keys(activity.metadata ?? {}).length > 0 && <p className="mt-2 break-words text-xs text-steel">{Object.entries(activity.metadata).map(([key, value]) => `${humanize(key)}: ${String(value)}`).join(" · ")}</p>}</div>; }
function ConfirmationDialog({ confirmation, busy, onCancel, onConfirm }: { confirmation: Exclude<Confirmation, null>; busy: boolean; onCancel: () => void; onConfirm: () => void }) { return <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-asphalt/70 p-3" role="presentation"><section role="alertdialog" aria-modal="true" aria-labelledby="partner-confirm-title" className="w-full max-w-md min-w-0 bg-white p-5 shadow-2xl sm:p-7"><p className="font-mono text-[9px] tracking-[.18em] text-amber-dim">CONFIRM CONTROL ACTION</p><h2 id="partner-confirm-title" className="mt-3 break-words font-display text-2xl font-bold">{confirmation.title}</h2><p className="mt-4 break-words text-sm leading-6 text-steel">{confirmation.message}</p><div className="mt-6 grid gap-2 sm:grid-cols-2"><button type="button" disabled={busy} onClick={onCancel} className="border border-asphalt/20 px-4 py-3 text-sm font-semibold">Cancel</button><button type="button" disabled={busy} onClick={onConfirm} className={`px-4 py-3 text-sm font-semibold text-white ${confirmation.danger ? "bg-route" : "bg-asphalt"}`}>{confirmation.label}</button></div></section></div>; }
function Badge({ label, tone }: { label: string; tone: "success" | "warning" | "danger" | "neutral" }) { const colors = tone === "success" ? "bg-emerald-50 text-emerald-800" : tone === "warning" ? "bg-amber/15 text-amber-dim" : tone === "danger" ? "bg-route/10 text-route" : "bg-asphalt/5 text-steel"; return <span className={`inline-flex max-w-full break-all px-2 py-1 text-[9px] font-semibold uppercase ${colors}`}>{label}</span>; }
function LoadingState({ label }: { label: string }) { return <p className="p-8 text-center font-mono text-xs text-steel">{label}</p>; }
function EmptyState({ title, description }: { title: string; description: string }) { return <div className="p-8 text-center"><p className="font-display text-lg font-bold">{title}</p><p className="mx-auto mt-2 max-w-lg text-sm text-steel">{description}</p></div>; }
function capitalize(value: string) { return `${value.charAt(0).toUpperCase()}${value.slice(1)}`; }
function humanize(value: string) { return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
