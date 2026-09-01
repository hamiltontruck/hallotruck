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
  const { data, error } = await supabase.rpc("partner_create_project", {
    p_partner_id: partnerId,
    p_name: name,
    p_description: description,
    p_request_key: crypto.randomUUID(),
  });
  if (error) throw error;
  if (!data) throw new Error("Partner project was not returned after creation.");
  return data as PartnerProject;
}

export async function updatePartnerProjectProgress(project: PartnerProject, progress: number, note: string) {
  const { error } = await supabase.rpc("partner_update_project_progress", {
    p_project_id: project.id,
    p_progress: progress,
    p_note: note,
    p_request_key: crypto.randomUUID(),
  });
  if (error) throw error;
}

export async function sendPartnerMessage(partnerId: string, projectId: string | null, body: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error("Partner session expired.");
  const { error } = await supabase.from("partner_messages").insert({ partner_id: partnerId, project_id: projectId, sender_id: userId, body: body.trim() });
  if (error) throw error;
}

export async function uploadPartnerDocument(partnerId: string, projectId: string | null, folderId: string | null, file: File) {
  const requestKey = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const path = `${partnerId}/${projectId ?? "shared"}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from("partner-documents").upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase.rpc("partner_register_document", {
    p_partner_id: partnerId,
    p_project_id: projectId,
    p_folder_id: folderId,
    p_file_name: file.name,
    p_storage_path: path,
    p_mime_type: file.type || null,
    p_size_bytes: file.size,
    p_request_key: requestKey,
  });

  if (error) {
    const { data: existing } = await supabase
      .from("partner_documents")
      .select("*")
      .eq("partner_id", partnerId)
      .eq("storage_path", path)
      .maybeSingle();
    if (existing) return existing as PartnerDocument;
    await supabase.storage.from("partner-documents").remove([path]);
    throw error;
  }

  if (!data) {
    await supabase.storage.from("partner-documents").remove([path]);
    throw new Error("Partner document metadata was not returned after upload.");
  }
  return data as PartnerDocument;
}

export async function openPartnerDocument(path: string) {
  const { data, error } = await supabase.storage.from("partner-documents").createSignedUrl(path, 300);
  if (error) throw error;
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}
