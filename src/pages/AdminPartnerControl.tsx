import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../services/supabase.client";

type Organization = { id: string; name: string; code: string; status: string; contact_email: string | null; contact_phone: string | null; created_at: string };
type Membership = { id: string; partner_id: string; user_id: string; member_role: string; active: boolean; created_at: string };
type Project = { id: string; partner_id: string; name: string; status: string; progress: number; updated_at: string };
type Payment = { id: string; partner_id: string; amount_etb: number | string; status: string; created_at: string };
type DocumentRow = { id: string; partner_id: string; file_name: string; status: string; storage_path: string; created_at: string };

function money(value: number) { return value.toLocaleString(undefined, { maximumFractionDigits: 2 }); }

export function AdminPartnerControl() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [selectedPartner, setSelectedPartner] = useState("");
  const [memberUserId, setMemberUserId] = useState("");
  const [memberRole, setMemberRole] = useState("viewer");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [orgResult, memberResult, projectResult, paymentResult, documentResult] = await Promise.all([
        supabase.from("partner_organizations").select("*").order("created_at", { ascending: false }),
        supabase.from("partner_memberships").select("*").order("created_at", { ascending: false }),
        supabase.from("partner_projects").select("id,partner_id,name,status,progress,updated_at").order("updated_at", { ascending: false }),
        supabase.from("partner_payments").select("id,partner_id,amount_etb,status,created_at").order("created_at", { ascending: false }),
        supabase.from("partner_documents").select("id,partner_id,file_name,status,storage_path,created_at").order("created_at", { ascending: false }),
      ]);
      const failure = [orgResult, memberResult, projectResult, paymentResult, documentResult].find((result) => result.error)?.error;
      if (failure) throw failure;
      setOrganizations((orgResult.data ?? []) as Organization[]);
      setMemberships((memberResult.data ?? []) as Membership[]);
      setProjects((projectResult.data ?? []) as Project[]);
      setPayments((paymentResult.data ?? []) as Payment[]);
      setDocuments((documentResult.data ?? []) as DocumentRow[]);
      if (!selectedPartner && orgResult.data?.[0]?.id) setSelectedPartner(orgResult.data[0].id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Partner control data could not be loaded.");
    } finally { setLoading(false); }
  }, [selectedPartner]);

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const channel = supabase
      .channel("admin-partner-control")
      .on("postgres_changes", { event: "*", schema: "public", table: "partner_organizations" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "partner_memberships" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "partner_projects" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "partner_payments" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "partner_documents" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const organizationsById = useMemo(() => new Map(organizations.map((organization) => [organization.id, organization])), [organizations]);
  const paid = payments.filter((payment) => payment.status === "paid").reduce((sum, payment) => sum + Number(payment.amount_etb || 0), 0);
  const pending = payments.filter((payment) => payment.status === "pending" || payment.status === "approved").reduce((sum, payment) => sum + Number(payment.amount_etb || 0), 0);

  async function createOrganization(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) throw new Error("Admin session expired.");
      const normalizedCode = code.trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, "-");
      const { error: insertError } = await supabase.from("partner_organizations").insert({ name: name.trim(), code: normalizedCode, contact_email: email.trim() || null, created_by: userId });
      if (insertError) throw insertError;
      setName(""); setCode(""); setEmail("");
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Partner organization could not be created.");
    } finally { setBusy(false); }
  }

  async function addMember(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const adminId = sessionData.session?.user.id;
      if (!adminId) throw new Error("Admin session expired.");
      const userId = memberUserId.trim();
      const { data: profile, error: profileError } = await supabase.from("profiles").select("id,role").eq("id", userId).maybeSingle();
      if (profileError) throw profileError;
      if (!profile) throw new Error("No profile exists for this user ID.");
      if (String(profile.role) !== "partner") throw new Error("Set this account to the Partner role through an authorized Admin process before adding membership.");
      const { error: membershipError } = await supabase.from("partner_memberships").upsert({ partner_id: selectedPartner, user_id: userId, member_role: memberRole, active: true, invited_by: adminId }, { onConflict: "partner_id,user_id" });
      if (membershipError) throw membershipError;
      setMemberUserId("");
      await load();
    } catch (memberError) {
      setError(memberError instanceof Error ? memberError.message : "Partner member could not be added.");
    } finally { setBusy(false); }
  }

  async function reviewDocument(document: DocumentRow, decision: "approved" | "rejected") {
    setBusy(true); setError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const reviewerId = sessionData.session?.user.id;
      if (!reviewerId) throw new Error("Admin session expired.");
      const { error: updateError } = await supabase.from("partner_documents").update({ status: decision, updated_at: new Date().toISOString() }).eq("id", document.id);
      if (updateError) throw updateError;
      const { error: reviewError } = await supabase.from("partner_document_reviews").insert({ partner_id: document.partner_id, document_id: document.id, decision, reviewed_by: reviewerId });
      if (reviewError) throw reviewError;
      await supabase.from("partner_activity_log").insert({ partner_id: document.partner_id, actor_id: reviewerId, action: `document_${decision}`, entity_type: "document", entity_id: document.id });
      await load();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Document review failed.");
    } finally { setBusy(false); }
  }

  async function openDocument(path: string) {
    const { data, error: signedError } = await supabase.storage.from("partner-documents").createSignedUrl(path, 300);
    if (signedError) { setError(signedError.message); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f5f3ed] p-4 text-asphalt sm:p-7">
      <section className="mx-auto max-w-6xl">
        <header className="bg-asphalt p-6 text-white sm:p-8">
          <p className="font-mono text-[10px] tracking-[.22em] text-amber">ADMIN PARTNER CONTROL</p>
          <h1 className="mt-3 font-display text-3xl font-bold sm:text-4xl">HALLO Logistics Partner network</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">Create organizations, manage verified memberships, review private documents and monitor partner projects and payments.</p>
        </header>

        {error && <p className="mt-5 border border-route/30 bg-route/5 p-4 text-sm text-route">{error}</p>}
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Metric label="Organizations" value={String(organizations.length)} />
          <Metric label="Active members" value={String(memberships.filter((membership) => membership.active).length)} />
          <Metric label="Projects" value={String(projects.length)} />
          <Metric label="Paid" value={`ETB ${money(paid)}`} />
          <Metric label="Pending" value={`ETB ${money(pending)}`} />
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <form onSubmit={createOrganization} className="border border-asphalt/10 bg-white p-5 sm:p-6">
            <h2 className="font-display text-xl font-bold">Create partner organization</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-semibold">Organization name<input required value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full border border-asphalt/15 px-3 py-3 text-sm font-normal" /></label>
              <label className="text-xs font-semibold">Code<input required value={code} onChange={(event) => setCode(event.target.value)} className="mt-2 w-full border border-asphalt/15 px-3 py-3 text-sm font-normal uppercase" placeholder="PARTNER-01" /></label>
            </div>
            <label className="mt-4 block text-xs font-semibold">Contact email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 w-full border border-asphalt/15 px-3 py-3 text-sm font-normal" /></label>
            <button disabled={busy} className="mt-5 bg-asphalt px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">Create organization</button>
          </form>

          <form onSubmit={addMember} className="border border-asphalt/10 bg-white p-5 sm:p-6">
            <h2 className="font-display text-xl font-bold">Add verified partner member</h2>
            <label className="mt-5 block text-xs font-semibold">Organization<select required value={selectedPartner} onChange={(event) => setSelectedPartner(event.target.value)} className="mt-2 w-full border border-asphalt/15 px-3 py-3 text-sm font-normal"><option value="">Choose organization</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>
            <label className="mt-4 block text-xs font-semibold">Profile user ID<input required value={memberUserId} onChange={(event) => setMemberUserId(event.target.value)} className="mt-2 w-full border border-asphalt/15 px-3 py-3 font-mono text-xs font-normal" /></label>
            <label className="mt-4 block text-xs font-semibold">Member permission<select value={memberRole} onChange={(event) => setMemberRole(event.target.value)} className="mt-2 w-full border border-asphalt/15 px-3 py-3 text-sm font-normal"><option value="owner">Owner</option><option value="admin">Admin</option><option value="editor">Editor</option><option value="viewer">Viewer</option></select></label>
            <button disabled={busy || !selectedPartner} className="mt-5 bg-asphalt px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">Add membership</button>
          </form>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <Panel title="Organizations" count={organizations.length} empty="No partner organizations yet.">
            {organizations.map((organization) => <div key={organization.id} className="border-b border-asphalt/10 p-4 last:border-b-0"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-words font-semibold">{organization.name}</p><p className="mt-1 font-mono text-[10px] text-steel">{organization.code}</p></div><span className="bg-emerald-50 px-3 py-1 text-[10px] font-semibold uppercase text-emerald-800">{organization.status}</span></div><p className="mt-2 text-xs text-steel">{memberships.filter((membership) => membership.partner_id === organization.id && membership.active).length} members · {projects.filter((project) => project.partner_id === organization.id).length} projects</p></div>)}
          </Panel>

          <Panel title="Document review queue" count={documents.filter((document) => document.status === "pending").length} empty="No partner documents need review.">
            {documents.filter((document) => document.status === "pending").map((document) => <div key={document.id} className="border-b border-asphalt/10 p-4 last:border-b-0"><p className="break-words font-semibold">{document.file_name}</p><p className="mt-1 text-xs text-steel">{organizationsById.get(document.partner_id)?.name ?? document.partner_id}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void openDocument(document.storage_path)} className="border border-emerald-700 px-3 py-2 text-xs font-semibold text-emerald-800">Open securely</button><button disabled={busy} type="button" onClick={() => void reviewDocument(document, "approved")} className="bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Approve</button><button disabled={busy} type="button" onClick={() => void reviewDocument(document, "rejected")} className="border border-route px-3 py-2 text-xs font-semibold text-route disabled:opacity-50">Reject</button></div></div>)}
          </Panel>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <Panel title="Project portfolio" count={projects.length} empty="No partner projects yet.">{projects.map((project) => <div key={project.id} className="border-b border-asphalt/10 p-4 last:border-b-0"><div className="flex flex-wrap items-center justify-between gap-2"><p className="break-words font-semibold">{project.name}</p><span className="text-[10px] font-semibold uppercase text-steel">{project.status.replace(/_/g, " ")}</span></div><p className="mt-1 text-xs text-steel">{organizationsById.get(project.partner_id)?.name ?? project.partner_id}</p><div className="mt-3 h-2 bg-asphalt/10"><div className="h-full bg-amber" style={{ width: `${project.progress}%` }} /></div><p className="mt-2 text-[10px] text-steel">{project.progress}% complete</p></div>)}</Panel>
          <Panel title="Payment summaries" count={payments.length} empty="No partner payments yet.">{organizations.map((organization) => { const rows = payments.filter((payment) => payment.partner_id === organization.id); if (!rows.length) return null; const total = rows.reduce((sum, payment) => sum + Number(payment.amount_etb || 0), 0); return <div key={organization.id} className="border-b border-asphalt/10 p-4 last:border-b-0"><p className="font-semibold">{organization.name}</p><p className="mt-2 font-display text-xl font-bold">ETB {money(total)}</p><p className="mt-1 text-xs text-steel">{rows.length} payment records · {rows.filter((payment) => payment.status === "paid").length} paid</p></div>; })}</Panel>
        </div>

        {loading && <p className="mt-5 border border-asphalt/10 bg-white p-8 text-center font-mono text-sm text-steel">Loading partner control…</p>}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="min-w-0 border border-asphalt/10 bg-white p-4"><p className="font-mono text-[9px] uppercase tracking-wide text-steel">{label}</p><p className="mt-3 break-words font-display text-xl font-bold sm:text-2xl">{value}</p></div>; }
function Panel({ title, count, empty, children }: { title: string; count: number; empty: string; children: React.ReactNode }) { return <section className="min-w-0 border border-asphalt/10 bg-white"><header className="flex items-center justify-between gap-3 border-b border-asphalt/10 p-4"><h2 className="font-display text-xl font-bold">{title}</h2><span className="font-mono text-[10px] text-steel">{count}</span></header>{count === 0 ? <p className="p-8 text-center text-sm text-steel">{empty}</p> : children}</section>; }
