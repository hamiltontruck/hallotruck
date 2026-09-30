import { supabase } from "./supabase.client";
import type { DriverVerificationFile, VerificationDocumentKey } from "./driver.service";

export type AdminDocumentStatusFilter = "all" | "pending" | "verified" | "rejected" | "missing" | "expiring" | "expired";

export type AdminDriverDocumentRow = {
  row_id: string;
  document_id: string | null;
  driver_id: string;
  driver_name: string;
  phone: string;
  truck_id: string | null;
  plate_number: string | null;
  vehicle_type: string | null;
  document_key: VerificationDocumentKey;
  expiry_date: string | null;
  status: "pending" | "verified" | "rejected" | "missing";
  updated_at: string | null;
  reviewer_name: string | null;
  file_path: string | null;
  original_name: string | null;
  mime_type: string | null;
  rejection_reason: string | null;
  reviewed_at: string | null;
  created_at: string | null;
  total_count: number;
};

export type AdminDriverDocumentPage = { rows: AdminDriverDocumentRow[]; total: number; page: number; pageSize: number };
export async function getAdminDriverDocumentPage(options: {
  page: number;
  pageSize: number;
  search: string;
  status: AdminDocumentStatusFilter;
}): Promise<AdminDriverDocumentPage> {
  const page = Math.max(1, Math.trunc(options.page));
  const pageSize = Math.min(100, Math.max(10, Math.trunc(options.pageSize)));
  const { data, error } = await supabase.rpc("admin_driver_document_register_page", {
    p_page: page,
    p_page_size: pageSize,
    p_search: options.search.trim() || null,
    p_status_filter: options.status,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as AdminDriverDocumentRow[];
  return { rows, total: Number(rows[0]?.total_count ?? 0), page, pageSize };
}

export function registerRowAsDocument(row: AdminDriverDocumentRow): DriverVerificationFile | null {
  if (!row.document_id || !row.file_path || !row.original_name || !row.mime_type || !row.created_at || !row.updated_at || row.status === "missing") return null;
  return {
    id: row.document_id,
    driver_id: row.driver_id,
    truck_id: row.truck_id,
    document_key: row.document_key,
    file_path: row.file_path,
    original_name: row.original_name,
    mime_type: row.mime_type,
    expiry_date: row.expiry_date,
    status: row.status,
    rejection_reason: row.rejection_reason,
    reviewed_at: row.reviewed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
