import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../services/supabase.client";
import { PartnerFleetPanel } from "../components/partner/PartnerFleetPanel";
import {
  createPartnerProject,
  getCurrentPartnerMemberships,
  loadPartnerWorkspace,
  openPartnerDocument,
  sendPartnerMessage,
  updatePartnerProjectProgress,
  uploadPartnerDocument,
  type PartnerActivity,
  type PartnerDocument,
  type PartnerMembership,
  type PartnerMessage,
  type PartnerPayment,
  type PartnerProject,
} from "../services/partner.service";

type PartnerTab = "overview" | "projects" | "payments" | "fleet" | "documents" | "activity" | "chat";

type Workspace = {
  projects: PartnerProject[];
  payments: PartnerPayment[];
  documents: PartnerDocument[];
  activity: PartnerActivity[];
  messages: PartnerMessage[];
  folders: Array<{ id: string; name: string }>;
  members: Array<{ id: string }>;
};

const emptyWorkspace: Workspace = { projects: [], payments: [], documents: [], activity: [], messages: [], folders: [], members: [] };
const tabs: PartnerTab[] = ["overview", "projects", "payments", "fleet", "documents", "activity", "chat"];

function money(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function PartnerPortal() {
  const [searchParams] = useSearchParams();
  const [memberships, setMemberships] = useState<PartnerMembership[]>([]);
  const [partnerId, setPartnerId] = useState("");
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [tab, setTab] = useState<PartnerTab>("overview");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [message, setMessage] = useState("");
  const [messageProject, setMessageProject] = useState("");
  const [uploadProject, setUploadProject] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const load = useCallback(async (requestedPartnerId?: string) => {
    setLoading(true);
    setError("");
    try {
      const nextMemberships = await getCurrentPartnerMemberships();
      setMemberships(nextMemberships);
      const candidatePartnerId = requestedPartnerId || partnerId;
      const nextPartnerId = nextMemberships.some((membership) => membership.partner_id === candidatePartnerId)
        ? candidatePartnerId
        : nextMemberships[0]?.partner_id || "";
      setPartnerId(nextPartnerId);
      if (!nextPartnerId) {
        setWorkspace(emptyWorkspace);
        return;
      }
      const next = await loadPartnerWorkspace(nextPartnerId);
      setWorkspace(next as Workspace);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Partner workspace could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => {
    void load(searchParams.get("organization") ?? undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!partnerId) return;
    const channel = supabase
      .channel(`partner-workspace-${partnerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "partner_projects", filter: `partner_id=eq.${partnerId}` }, () => void load(partnerId))
      .on("postgres_changes", { event: "*", schema: "public", table: "partner_payments", filter: `partner_id=eq.${partnerId}` }, () => void load(partnerId))
      .on("postgres_changes", { event: "*", schema: "public", table: "partner_documents", filter: `partner_id=eq.${partnerId}` }, () => void load(partnerId))
      .on("postgres_changes", { event: "*", schema: "public", table: "partner_messages", filter: `partner_id=eq.${partnerId}` }, () => void load(partnerId))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, partnerId]);

  const currentMembership = memberships.find((membership) => membership.partner_id === partnerId);
  const currentOrganization = currentMembership?.partner_organizations ?? null;
  const totalPaid = workspace.payments.filter((payment) => payment.status === "paid").reduce((sum, payment) => sum + Number(payment.amount_etb || 0), 0);
  const totalPending = workspace.payments.filter((payment) => payment.status === "pending" || payment.status === "approved").reduce((sum, payment) => sum + Number(payment.amount_etb || 0), 0);
  const activeProjects = workspace.projects.filter((project) => project.status === "active").length;
  const pendingDocuments = workspace.documents.filter((document) => document.status === "pending").length;
  const canManage = ["owner", "admin", "editor"].includes(currentMembership?.member_role ?? "");
  const canManageFleet = ["owner", "admin"].includes(currentMembership?.member_role ?? "");
  const canViewFinance = ["owner", "admin"].includes(currentMembership?.member_role ?? "");
  const visibleTabs = canManageFleet ? tabs : tabs.filter((item) => item !== "fleet");

  const projectsById = useMemo(() => new Map(workspace.projects.map((project) => [project.id, project])), [workspace.projects]);

  async function createProject(event: FormEvent) {
    event.preventDefault();
    if (!partnerId || !projectName.trim()) return;
    setBusy(true); setError("");
    try {
      await createPartnerProject(partnerId, projectName, projectDescription);
      setProjectName(""); setProjectDescription("");
      await load(partnerId);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Project could not be created.");
    } finally { setBusy(false); }
  }

  async function changeProgress(project: PartnerProject, progress: number) {
    setBusy(true); setError("");
    try {
      await updatePartnerProjectProgress(project, progress, `Progress changed to ${progress}%`);
      await load(partnerId);
    } catch (progressError) {
      setError(progressError instanceof Error ? progressError.message : "Progress could not be updated.");
    } finally { setBusy(false); }
  }

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!partnerId || !selectedFile) return;
    setBusy(true); setError("");
    try {
      await uploadPartnerDocument(partnerId, uploadProject || null, null, selectedFile);
      setSelectedFile(null);
      setUploadProject("");
      await load(partnerId);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Document upload failed.");
    } finally { setBusy(false); }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!partnerId || !message.trim()) return;
    setBusy(true); setError("");
    try {
      await sendPartnerMessage(partnerId, messageProject || null, message);
      setMessage("");
      await load(partnerId);
    } catch (messageError) {
      setError(messageError instanceof Error ? messageError.message : "Message could not be sent.");
    } finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f5f3ed] text-asphalt">
      <header className="bg-asphalt px-4 py-6 text-white sm:px-7">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-[.22em] text-amber">HALLO LOGISTICS PARTNER</p>
            <h1 className="mt-2 break-words font-display text-3xl font-bold sm:text-4xl">{currentOrganization?.name ?? "Partner workspace"}</h1>
            <p className="mt-2 text-sm text-white/55">Projects, payments, shared documents and team activity in one secure workspace.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {memberships.length > 1 && (
              <select value={partnerId} onChange={(event) => void load(event.target.value)} className="min-w-0 border border-white/15 bg-white/5 px-3 py-2 text-sm text-white">
                {memberships.map((membership) => <option key={membership.partner_id} value={membership.partner_id} className="text-asphalt">{membership.partner_organizations?.name ?? membership.partner_id}</option>)}
              </select>
            )}
            {canViewFinance && partnerId && (
              <Link to={`/partner/wallet?organization=${encodeURIComponent(partnerId)}`} className="border border-emerald-500/60 px-4 py-2 text-xs font-semibold text-emerald-300">
                Wallet & statements
              </Link>
            )}
            <button type="button" onClick={() => void load(partnerId)} className="border border-amber/50 px-4 py-2 text-xs font-semibold text-amber">Refresh</button>
            <button type="button" onClick={() => void supabase.auth.signOut()} className="border border-white/15 px-4 py-2 text-xs font-semibold text-white/70">Sign out</button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-5 sm:px-7">
        {error && <p className="mb-4 border border-route/30 bg-route/5 p-4 text-sm text-route">{error}</p>}
        {!loading && memberships.length === 0 && (
          <div className="border border-amber/35 bg-white p-8 text-center">
            <h2 className="font-display text-2xl font-bold">No partner organization assigned</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-steel">Your account is authorized for the Partner portal, but it is not yet attached to an active organization. Ask HALLO Admin to create the membership.</p>
          </div>
        )}

        {memberships.length > 0 && (
          <>
            <nav className="mb-5 flex max-w-full gap-2 overflow-x-auto pb-2" aria-label="Partner workspace sections">
              {visibleTabs.map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`min-h-11 whitespace-nowrap border px-4 py-2 text-xs font-semibold capitalize ${tab === item ? "border-asphalt bg-asphalt text-white" : "border-asphalt/15 bg-white text-steel"}`}>{item}</button>)}
            </nav>

            {loading ? <div className="border border-asphalt/10 bg-white p-10 text-center font-mono text-sm text-steel">Loading partner data…</div> : (
              <>
                {tab === "overview" && (
                  <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                      <Metric label="Active projects" value={String(activeProjects)} detail={`${workspace.projects.length} total`} />
                      <Metric label="Paid" value={`ETB ${money(totalPaid)}`} detail={`${workspace.payments.filter((payment) => payment.status === "paid").length} records`} />
                      <Metric label="Pending payments" value={`ETB ${money(totalPending)}`} detail="Pending or approved" />
                      <Metric label="Documents to review" value={String(pendingDocuments)} detail={`${workspace.documents.length} shared files`} />
                    </div>
                    <div className="grid gap-5 lg:grid-cols-2">
                      <Section title="Project progress" count={workspace.projects.length} empty="No projects have been created yet.">
                        {workspace.projects.slice(0, 6).map((project) => <ProjectRow key={project.id} project={project} />)}
                      </Section>
                      <Section title="Recent activity" count={workspace.activity.length} empty="No activity has been recorded yet.">
                        {workspace.activity.slice(0, 8).map((activity) => <ActivityRow key={activity.id} activity={activity} />)}
                      </Section>
                    </div>
                  </div>
                )}

                {tab === "projects" && (
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <Section title="Projects" count={workspace.projects.length} empty="No partner projects yet.">
                      {workspace.projects.map((project) => (
                        <div key={project.id} className="border-b border-asphalt/10 p-4 last:border-b-0">
                          <ProjectRow project={project} />
                          {canManage && <div className="mt-3 flex flex-wrap gap-2">{[0,25,50,75,100].map((value) => <button disabled={busy} key={value} type="button" onClick={() => void changeProgress(project, value)} className={`border px-3 py-2 text-[10px] font-semibold ${project.progress === value ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-asphalt/15 text-steel"}`}>{value}%</button>)}</div>}
                        </div>
                      ))}
                    </Section>
                    {canManage && <form onSubmit={createProject} className="h-fit border border-asphalt/10 bg-white p-5">
                      <h2 className="font-display text-xl font-bold">Create project</h2>
                      <label className="mt-5 block text-xs font-semibold">Project name</label>
                      <input required value={projectName} onChange={(event) => setProjectName(event.target.value)} className="mt-2 w-full border border-asphalt/15 px-3 py-3 text-sm outline-none focus:border-amber" />
                      <label className="mt-4 block text-xs font-semibold">Description</label>
                      <textarea value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} rows={4} className="mt-2 w-full border border-asphalt/15 px-3 py-3 text-sm outline-none focus:border-amber" />
                      <button disabled={busy} className="mt-5 w-full bg-asphalt py-3 text-sm font-semibold text-white disabled:opacity-50">Create project</button>
                    </form>}
                  </div>
                )}

                {tab === "payments" && <Section title="Partner payment records" count={workspace.payments.length} empty="No partner payment records yet.">{workspace.payments.map((payment) => <div key={payment.id} className="grid gap-3 border-b border-asphalt/10 p-4 last:border-b-0 sm:grid-cols-[1fr_auto] sm:items-center"><div className="min-w-0"><p className="font-display text-xl font-bold">ETB {money(Number(payment.amount_etb || 0))}</p><p className="mt-1 break-all text-xs text-steel">{payment.provider ?? "Provider not recorded"}{payment.transaction_ref ? ` · ${payment.transaction_ref}` : ""}</p><p className="mt-1 text-xs text-steel">{payment.project_id ? projectsById.get(payment.project_id)?.name ?? "Project" : "Organization payment"}</p></div><span className="w-fit bg-amber/15 px-3 py-2 text-[10px] font-semibold uppercase text-amber-dim">{payment.status}</span></div>)}</Section>}

                {tab === "fleet" && <PartnerFleetPanel partnerId={partnerId} canManage={canManageFleet} />}

                {tab === "documents" && (
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <Section title="Shared private documents" count={workspace.documents.length} empty="No private documents have been uploaded.">
                      {workspace.documents.map((document) => <div key={document.id} className="flex flex-col gap-3 border-b border-asphalt/10 p-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="break-words font-semibold">{document.file_name}</p><p className="mt-1 text-xs text-steel">{document.project_id ? projectsById.get(document.project_id)?.name ?? "Project" : "Shared folder"} · {document.status}</p></div><button type="button" onClick={() => void openPartnerDocument(document.storage_path).catch((openError) => setError(openError.message))} className="w-fit border border-emerald-700 px-4 py-2 text-xs font-semibold text-emerald-800">Open securely</button></div>)}
                    </Section>
                    {canManage && <form onSubmit={upload} className="h-fit border border-asphalt/10 bg-white p-5">
                      <h2 className="font-display text-xl font-bold">Upload document</h2>
                      <label className="mt-5 block text-xs font-semibold">Project or shared folder</label>
                      <select value={uploadProject} onChange={(event) => setUploadProject(event.target.value)} className="mt-2 w-full border border-asphalt/15 px-3 py-3 text-sm"><option value="">Shared organization folder</option>{workspace.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
                      <input required type="file" accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} className="mt-4 block w-full min-w-0 text-xs" />
                      <button disabled={busy || !selectedFile} className="mt-5 w-full bg-asphalt py-3 text-sm font-semibold text-white disabled:opacity-50">Upload privately</button>
                    </form>}
                  </div>
                )}

                {tab === "activity" && <Section title="Activity log" count={workspace.activity.length} empty="No organization activity yet.">{workspace.activity.map((activity) => <ActivityRow key={activity.id} activity={activity} />)}</Section>}

                {tab === "chat" && (
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <Section title="Project chat" count={workspace.messages.length} empty="No messages yet. Start the project conversation.">
                      {workspace.messages.map((item) => <div key={item.id} className="border-b border-asphalt/10 p-4 last:border-b-0"><p className="whitespace-pre-wrap break-words text-sm leading-6">{item.body}</p><p className="mt-2 text-[10px] text-steel">{item.project_id ? projectsById.get(item.project_id)?.name ?? "Project" : "Organization channel"} · {new Date(item.created_at).toLocaleString()}</p></div>)}
                    </Section>
                    <form onSubmit={sendMessage} className="h-fit border border-asphalt/10 bg-white p-5">
                      <h2 className="font-display text-xl font-bold">New message</h2>
                      <select value={messageProject} onChange={(event) => setMessageProject(event.target.value)} className="mt-4 w-full border border-asphalt/15 px-3 py-3 text-sm"><option value="">Organization channel</option>{workspace.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
                      <textarea required value={message} onChange={(event) => setMessage(event.target.value)} rows={5} maxLength={4000} className="mt-4 w-full border border-asphalt/15 px-3 py-3 text-sm outline-none focus:border-amber" placeholder="Write a project update…" />
                      <button disabled={busy || !message.trim()} className="mt-4 w-full bg-asphalt py-3 text-sm font-semibold text-white disabled:opacity-50">Send message</button>
                    </form>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="min-w-0 border border-asphalt/10 bg-white p-4 sm:p-5"><p className="font-mono text-[9px] uppercase tracking-wide text-steel">{label}</p><p className="mt-3 break-words font-display text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-steel">{detail}</p></div>;
}
function Section({ title, count, empty, children }: { title: string; count: number; empty: string; children: React.ReactNode }) {
  return <section className="min-w-0 border border-asphalt/10 bg-white"><header className="flex items-center justify-between gap-4 border-b border-asphalt/10 p-4"><h2 className="font-display text-xl font-bold">{title}</h2><span className="font-mono text-[10px] text-steel">{count}</span></header>{count === 0 ? <p className="p-8 text-center text-sm text-steel">{empty}</p> : children}</section>;
}
function ProjectRow({ project }: { project: PartnerProject }) {
  return <div className="border-b border-asphalt/10 p-4 last:border-b-0"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="break-words font-semibold">{project.name}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-steel">{project.description || "No description"}</p></div><span className="w-fit bg-emerald-50 px-3 py-1 text-[10px] font-semibold uppercase text-emerald-800">{project.status.replace(/_/g, " ")}</span></div><div className="mt-3 h-2 overflow-hidden bg-asphalt/10"><div className="h-full bg-amber" style={{ width: `${project.progress}%` }} /></div><p className="mt-2 text-[10px] text-steel">{project.progress}% complete{project.due_on ? ` · Due ${new Date(project.due_on).toLocaleDateString()}` : ""}</p></div>;
}
function ActivityRow({ activity }: { activity: PartnerActivity }) {
  return <div className="border-b border-asphalt/10 p-4 last:border-b-0"><p className="break-words text-sm font-semibold">{activity.action.replace(/_/g, " ")}</p><p className="mt-1 text-xs text-steel">{activity.entity_type}{activity.entity_id ? ` · ${activity.entity_id}` : ""}</p><p className="mt-1 text-[10px] text-steel">{new Date(activity.created_at).toLocaleString()}</p></div>;
}
