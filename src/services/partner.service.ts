import { supabase } from "./supabase.client";

export type PartnerOrganization = { id: string; name: string; code: string; status: string; contact_email: string | null; contact_phone: string | null };
export type PartnerMembership = { id: string; partner_id: string; user_id: string; member_role: string; active: boolean; partner_organizations?: PartnerOrganization | null };
export type PartnerProject = { id: string; partner_id: string; name: string; description: string | null; status: string; progress: number; starts_on: string | null; due_on: string | null; updated_at: string };
export type PartnerPayment = { id: string; partner_id: string; project_id: string | null; amount_etb: number | string; status: string; provider: string | null; transaction_ref: string | null; paid_at: string | null; created_at: string };
export type PartnerDocument = { id: string; partner_id: string; project_id: string | null; folder_id: string | null; file_name: string; storage_path: string; mime_type: string | null; size_bytes: number | null; status: string; uploaded_by: string; created_at: string };
export type PartnerFolder = { id: string; partner_id: string; project_id: string | null; parent_id: string | null; name: string; created_at: string };
export type PartnerActivity = { id: number; partner_id: string; actor_id: string | null; action: string; entity_type: string; entity_id: string | null; metadata: Record<string, unknown>; created_at: string };
export type PartnerMessage = { id: string; partner_id: string; project_id: string | null; sender_id: string; body: string; created_at: string };

export async function getCurrentPartnerMemberships() {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return [] as PartnerMembership[];
  const { data, error } = await supabase
    .from("partner_memberships")
    .select("id,partner_id,user_id,member_role,active,partner_organizations!inner(id,name,code,status,contact_email,contact_phone)")
    .eq("user_id", userId)
    .eq("active", true)
    .eq("partner_organizations.status", "active")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as PartnerMembership[];
}

export async function loadPartnerWorkspace(partnerId: string) {
  const [projects, payments, folders, documents, activity, messages, members] = await Promise.all([
    supabase.from("partner_projects").select("*").eq("partner_id", partnerId).order("updated_at", { ascending: false }),
    supabase.from("partner_payments").select("*").eq("partner_id", partnerId).order("created_at", { ascending: false }),
    supabase.from("partner_folders").select("*").eq("partner_id", partnerId).order("created_at", { ascending: true }),
    supabase.from("partner_documents").select("*").eq("partner_id", partnerId).order("created_at", { ascending: false }),
    supabase.from("partner_activity_log").select("*").eq("partner_id", partnerId).order("created_at", { ascending: false }).limit(100),
    supabase.from("partner_messages").select("*").eq("partner_id", partnerId).order("created_at", { ascending: true }).limit(200),
    supabase.from("partner_memberships").select("id,partner_id,user_id,member_role,active,created_at").eq("partner_id", partnerId).eq("active", true),
  ]);
  const failure = [projects, payments, folders, documents, activity, messages, members].find((result) => result.error)?.error;
  if (failure) throw failure;
  return {
    projects: (projects.data ?? []) as PartnerProject[],
    payments: (payments.data ?? []) as PartnerPayment[],
    folders: (folders.data ?? []) as PartnerFolder[],
    documents: (documents.data ?? []) as PartnerDocument[],
    activity: (activity.data ?? []) as PartnerActivity[],
    messages: (messages.data ?? []) as PartnerMessage[],
    members: members.data ?? [],
  };
}

export async function createPartnerProject(partnerId: string, name: string, description: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error("Partner session expired.");
  const { data, error } = await supabase.from("partner_projects").insert({ partner_id: partnerId, name: name.trim(), description: description.trim() || null, created_by: userId }).select("*").single();
  if (error) throw error;
  await supabase.from("partner_activity_log").insert({ partner_id: partnerId, actor_id: userId, action: "project_created", entity_type: "project", entity_id: data.id, metadata: { name: data.name } });
  return data as PartnerProject;
}

export async function updatePartnerProjectProgress(project: PartnerProject, progress: number, note: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error("Partner session expired.");
  const nextStatus = progress >= 100 ? "completed" : progress > 0 && project.status === "planned" ? "active" : project.status;
  const { error } = await supabase.from("partner_projects").update({ progress, status: nextStatus, updated_at: new Date().toISOString() }).eq("id", project.id);
  if (error) throw error;
  const { error: progressError } = await supabase.from("partner_project_progress").insert({ partner_id: project.partner_id, project_id: project.id, progress, note: note.trim() || null, created_by: userId });
  if (progressError) throw progressError;
  await supabase.from("partner_activity_log").insert({ partner_id: project.partner_id, actor_id: userId, action: "project_progress_updated", entity_type: "project", entity_id: project.id, metadata: { progress } });
}

export async function sendPartnerMessage(partnerId: string, projectId: string | null, body: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error("Partner session expired.");
  const { error } = await supabase.from("partner_messages").insert({ partner_id: partnerId, project_id: projectId, sender_id: userId, body: body.trim() });
  if (error) throw error;
}

export async function uploadPartnerDocument(partnerId: string, projectId: string | null, folderId: string | null, file: File) {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error("Partner session expired.");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const path = `${partnerId}/${projectId ?? "shared"}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from("partner-documents").upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (uploadError) throw uploadError;
  const { data, error } = await supabase.from("partner_documents").insert({ partner_id: partnerId, project_id: projectId, folder_id: folderId, file_name: file.name, storage_path: path, mime_type: file.type || null, size_bytes: file.size, uploaded_by: userId }).select("*").single();
  if (error) {
    await supabase.storage.from("partner-documents").remove([path]);
    throw error;
  }
  await supabase.from("partner_activity_log").insert({ partner_id: partnerId, actor_id: userId, action: "document_uploaded", entity_type: "document", entity_id: data.id, metadata: { file_name: file.name } });
  return data as PartnerDocument;
}

export async function openPartnerDocument(path: string) {
  const { data, error } = await supabase.storage.from("partner-documents").createSignedUrl(path, 300);
  if (error) throw error;
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}
