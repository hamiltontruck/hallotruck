import { useEffect, useMemo, useRef, useState } from "react";
import type { DriverVerificationFile } from "../../services/driver.service";
import {
  getAdminDriverDocumentPage,
  registerRowAsDocument,
  type AdminDocumentStatusFilter,
  type AdminDriverDocumentRow,
} from "../../services/admin-driver-document-register.service";

const FILTERS: { value: AdminDocumentStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Rejected" },
  { value: "missing", label: "Missing" },
  { value: "expiring", label: "Expiring soon" },
  { value: "expired", label: "Expired" },
];

const DOCUMENT_LABELS: Record<string, string> = {
  driver_photo: "Driver photo",
  license_front: "Driving license · front",
  license_back: "Driving license · back",
  national_id_front: "National ID · front",
  national_id_back: "National ID · back",
  vehicle_registration: "Vehicle registration",
  truck_front: "Truck photo · front",
  truck_side: "Truck photo · side",
};
function expiryMeta(value: string | null) {
  if (!value) return { label: "—", tone: "text-steel", title: "No expiry date" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${value}T00:00:00`);
  const days = Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { label: `Expired · ${value}`, tone: "text-route font-semibold", title: "Expired" };
  if (days <= 7) return { label: `${days}d · 7 days`, tone: "text-route font-semibold", title: `Expires ${value}` };
  if (days <= 14) return { label: `${days}d · 14 days`, tone: "text-amber-dim font-semibold", title: `Expires ${value}` };
  if (days <= 30) return { label: `${days}d · 30 days`, tone: "text-amber-dim", title: `Expires ${value}` };
  return { label: value, tone: "text-asphalt", title: `Expires ${value}` };
}

function statusTone(status: AdminDriverDocumentRow["status"]) {
  if (status === "verified") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "rejected") return "border-route/30 bg-route/5 text-route";
  if (status === "missing") return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-amber/40 bg-amber/10 text-amber-dim";
}

function formatUpdated(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

type Props = {
  busy: string;
  onOpen: (path: string) => Promise<void>;
  onReview: (doc: DriverVerificationFile, status: "verified" | "rejected") => Promise<void>;
};
export function AdminDriverDocumentRegister({ busy, onOpen, onReview }: Props) {
  const [draftSearch, setDraftSearch] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<AdminDocumentStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [rows, setRows] = useState<AdminDriverDocumentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const requestSequence = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(draftSearch.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draftSearch]);

  useEffect(() => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError("");
    void getAdminDriverDocumentPage({ page, pageSize, search, status: filter })
      .then((result) => {
        if (sequence !== requestSequence.current) return;
        setRows(result.rows);
        setTotal(result.total);
      })
      .catch((reason) => {
        if (sequence === requestSequence.current) setError(reason instanceof Error ? reason.message : "Document register failed to load.");
      })
      .finally(() => { if (sequence === requestSequence.current) setLoading(false); });
  }, [page, pageSize, search, filter, refreshKey]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const range = useMemo(() => total === 0 ? "0 rows" : `${(page - 1) * pageSize + 1}–${Math.min(total, page * pageSize)} of ${total}`, [page, pageSize, total]);
  async function reviewRow(row: AdminDriverDocumentRow, status: "verified" | "rejected") {
    const document = registerRowAsDocument(row);
    if (!document) return;
    await onReview(document, status);
    setRefreshKey((value) => value + 1);
  }

  return <section className="mt-6 overflow-hidden border border-asphalt/10 bg-white shadow-sm" aria-label="Driver document register">
    <div className="border-b border-asphalt/10 bg-asphalt px-5 py-5 text-white sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-[.18em] text-amber">DOCUMENT REGISTER</p>
          <h2 className="mt-1 font-display text-2xl font-semibold">Document register</h2>
          <p className="mt-1 text-xs text-white/55">Search, expiry control and review actions without bulk-loading every driver record.</p>
        </div>
        <div className="font-mono text-xs text-white/65">{range}</div>
      </div>
    </div>

    <div className="grid gap-3 border-b border-asphalt/10 bg-[#faf9f5] p-4 lg:grid-cols-[minmax(260px,1fr)_auto_auto] lg:items-center">
      <label className="relative block">
        <span className="sr-only">Driver / phone / plate search</span>
        <input value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} placeholder="Driver / phone / plate" className="min-h-11 w-full border border-asphalt/15 bg-white px-4 pr-10 text-sm outline-none focus:border-asphalt" />
        {draftSearch && <button type="button" onClick={() => setDraftSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-steel" aria-label="Clear search">×</button>}
      </label>
      <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="min-h-11 border border-asphalt/15 bg-white px-3 text-xs font-semibold" aria-label="Rows per page">
        <option value={25}>25 rows</option><option value={50}>50 rows</option><option value={100}>100 rows</option>
      </select>
      <button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="min-h-11 border border-asphalt px-4 text-xs font-semibold">Refresh</button>
    </div>
    <div className="flex gap-2 overflow-x-auto border-b border-asphalt/10 px-4 py-3" aria-label="Document status filters">
      {FILTERS.map((item) => <button key={item.value} type="button" onClick={() => { setFilter(item.value); setPage(1); }} className={`whitespace-nowrap border px-3 py-2 text-[11px] font-semibold ${filter === item.value ? "border-asphalt bg-asphalt text-white" : "border-asphalt/15 bg-white text-asphalt"}`}>{item.label}</button>)}
    </div>

    {error && <p role="alert" className="m-4 border border-route/30 bg-route/5 p-3 text-sm text-route">{error}</p>}

    <div className="hidden max-h-[620px] overflow-auto lg:block">
      <table className="w-full min-w-[1180px] border-collapse text-left">
        <thead className="sticky top-0 z-10 bg-[#f0eee7] shadow-[0_1px_0_rgba(15,23,42,.12)]">
          <tr className="font-mono text-[10px] uppercase tracking-[.08em] text-steel">
            {['Driver', 'Truck / plate', 'Document', 'Expiry', 'Status', 'Updated', 'Reviewer', 'Actions'].map((heading) => <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-asphalt/10">
          {loading ? <tr><td colSpan={8} className="px-4 py-12 text-center font-mono text-xs text-steel">Loading document register…</td></tr>
            : rows.length === 0 ? <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-steel">No document rows match this search or filter.</td></tr>
            : rows.map((row) => <DocumentTableRow key={row.row_id} row={row} busy={busy} onOpen={onOpen} onReview={reviewRow} />)}
        </tbody>
      </table>
    </div>

    <div className="grid gap-3 p-4 lg:hidden">
      {loading ? <p className="py-10 text-center font-mono text-xs text-steel">Loading document register…</p>
        : rows.length === 0 ? <p className="py-10 text-center text-sm text-steel">No document rows match this search or filter.</p>
        : rows.map((row) => <DocumentMobileCard key={row.row_id} row={row} busy={busy} onOpen={onOpen} onReview={reviewRow} />)}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-asphalt/10 bg-[#faf9f5] px-4 py-3">
      <span className="font-mono text-[11px] text-steel">Page {page} of {totalPages} · {range}</span>
      <div className="flex gap-2">
        <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} className="min-h-10 border border-asphalt/15 bg-white px-4 text-xs font-semibold disabled:opacity-40">Previous</button>
        <button type="button" disabled={page >= totalPages || loading} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="min-h-10 border border-asphalt bg-asphalt px-4 text-xs font-semibold text-white disabled:opacity-40">Next</button>
      </div>
    </div>
  </section>;
}

function DocumentTableRow({ row, busy, onOpen, onReview }: { row: AdminDriverDocumentRow; busy: string; onOpen: Props["onOpen"]; onReview: (row: AdminDriverDocumentRow, status: "verified" | "rejected") => Promise<void> }) {
  const expiry = expiryMeta(row.expiry_date);
  const isBusy = Boolean(row.document_id && busy === row.document_id);
  return <tr className="align-top transition hover:bg-[#faf9f5]">
    <td className="px-4 py-3"><strong className="block text-sm">{row.driver_name}</strong><span className="mt-1 block font-mono text-[10px] text-steel">{row.phone}</span></td>
    <td className="px-4 py-3"><span className="block text-sm font-semibold">{row.plate_number ?? "Identity"}</span><span className="mt-1 block text-[11px] text-steel">{row.vehicle_type ?? "Driver file"}</span></td>
    <td className="px-4 py-3"><span className="text-sm font-semibold">{DOCUMENT_LABELS[row.document_key] ?? row.document_key}</span></td>
    <td className={`px-4 py-3 text-xs ${expiry.tone}`} title={expiry.title}>{expiry.label}</td>
    <td className="px-4 py-3"><span className={`inline-flex border px-2.5 py-1 text-[9px] font-semibold uppercase ${statusTone(row.status)}`}>{row.status}</span></td>
    <td className="px-4 py-3 text-[11px] text-steel">{formatUpdated(row.updated_at)}</td>
    <td className="px-4 py-3 text-xs text-steel">{row.reviewer_name ?? "—"}</td>
    <td className="px-4 py-3"><RowActions row={row} busy={isBusy} onOpen={onOpen} onReview={onReview} /></td>
  </tr>;
}
function DocumentMobileCard({ row, busy, onOpen, onReview }: { row: AdminDriverDocumentRow; busy: string; onOpen: Props["onOpen"]; onReview: (row: AdminDriverDocumentRow, status: "verified" | "rejected") => Promise<void> }) {
  const expiry = expiryMeta(row.expiry_date);
  const isBusy = Boolean(row.document_id && busy === row.document_id);
  return <article className="border border-asphalt/10 bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div><strong className="block text-sm">{row.driver_name}</strong><span className="mt-1 block font-mono text-[10px] text-steel">{row.phone}</span></div>
      <span className={`border px-2 py-1 text-[9px] font-semibold uppercase ${statusTone(row.status)}`}>{row.status}</span>
    </div>
    <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
      <div><dt className="font-mono text-[9px] uppercase text-steel">Truck / plate</dt><dd className="mt-1 font-semibold">{row.plate_number ?? "Identity"}</dd></div>
      <div><dt className="font-mono text-[9px] uppercase text-steel">Document</dt><dd className="mt-1 font-semibold">{DOCUMENT_LABELS[row.document_key] ?? row.document_key}</dd></div>
      <div><dt className="font-mono text-[9px] uppercase text-steel">Expiry</dt><dd className={`mt-1 ${expiry.tone}`}>{expiry.label}</dd></div>
      <div><dt className="font-mono text-[9px] uppercase text-steel">Reviewer</dt><dd className="mt-1">{row.reviewer_name ?? "—"}</dd></div>
    </dl>
    <div className="mt-4"><RowActions row={row} busy={isBusy} onOpen={onOpen} onReview={onReview} /></div>
  </article>;
}

function RowActions({ row, busy, onOpen, onReview }: { row: AdminDriverDocumentRow; busy: boolean; onOpen: Props["onOpen"]; onReview: (row: AdminDriverDocumentRow, status: "verified" | "rejected") => Promise<void> }) {
  if (row.status === "missing" || !row.file_path) return <span className="text-[11px] font-semibold text-steel">Awaiting upload</span>;
  return <div className="flex flex-wrap gap-2">
    <button type="button" onClick={() => void onOpen(row.file_path!)} className="min-h-9 border border-asphalt/15 px-2.5 text-[10px] font-semibold">Open</button>
    {row.status === "pending" && <>
      <button type="button" disabled={busy} onClick={() => void onReview(row, "verified")} className="min-h-9 bg-emerald-700 px-2.5 text-[10px] font-semibold text-white disabled:opacity-40">Verify</button>
      <button type="button" disabled={busy} onClick={() => void onReview(row, "rejected")} className="min-h-9 border border-route/30 px-2.5 text-[10px] font-semibold text-route disabled:opacity-40">Request re-upload</button>
    </>}
  </div>;
}
