import { useEffect, useState } from "react";
import {
  createDriverDocumentPreview,
  type DriverDocumentPreview,
} from "./driver-profile.service";
import type { DriverVerificationRecord } from "./driver-profile.model";

type PreviewLoader = typeof createDriverDocumentPreview;

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Private document preview fe'uun hin danda'amne.";
}

export function DriverDocumentPreviewSheet({
  expectedUserId,
  record,
  documentLabel,
  onClose,
  loadPreview = createDriverDocumentPreview,
}: {
  expectedUserId: string;
  record: DriverVerificationRecord;
  documentLabel: string;
  onClose: () => void;
  loadPreview?: PreviewLoader;
}) {
  const [preview, setPreview] = useState<DriverDocumentPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    let active = true;
    setPreview(null);
    setError(null);
    setLoading(true);
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setError("Offline yeroo taate signed preview haaraa uumuu hin dandeessu.");
      setLoading(false);
      return () => { active = false; };
    }
    void loadPreview({
      expectedUserId,
      documentId: record.id,
      expectedFilePath: record.filePath,
    }).then((result) => {
      if (!active) return;
      setPreview(result);
      setLoading(false);
    }).catch((caught) => {
      if (!active) return;
      setError(errorMessage(caught));
      setLoading(false);
    });
    return () => { active = false; };
  }, [expectedUserId, loadPreview, record.filePath, record.id, retryNonce]);

  const isImage = preview?.mimeType.startsWith("image/") ?? false;
  const expiresAt = preview
    ? new Date(Date.now() + preview.expiresInSeconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return <div className="fixed inset-0 z-[90] flex items-end bg-halo-navy/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="driver-document-preview-title" data-driver-document-preview-sheet>
    <button type="button" aria-label="Document preview cufi" onClick={onClose} className="absolute inset-0 cursor-default" />
    <section className="relative z-10 max-h-[94dvh] w-full overflow-y-auto rounded-t-[30px] bg-white px-4 pb-[calc(22px+env(safe-area-inset-bottom))] pt-4 shadow-[0_-24px_70px_rgba(16,33,61,0.30)] sm:px-6">
      <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-halo-line" />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-halo-gold-dark">Signed preview</p><h2 id="driver-document-preview-title" className="mt-1 break-words text-xl font-black text-halo-navy">{documentLabel}</h2><p className="mt-2 break-all text-[10px] leading-4 text-halo-muted">{preview?.originalName || record.originalName}</p></div>
        <button type="button" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-halo-soft text-lg font-black text-halo-blue" aria-label="Cufi">×</button>
      </div>

      <div className="mt-4 overflow-hidden rounded-[22px] border border-halo-line bg-halo-canvas" aria-busy={loading}>
        {loading && <div className="grid min-h-64 place-items-center px-6 text-center"><div><div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-halo-line border-t-halo-blue"/><p className="mt-4 text-xs font-bold text-halo-muted">Private signed preview fe'aa jira…</p></div></div>}
        {!loading && error && <div role="alert" className="grid min-h-64 place-items-center px-6 py-8 text-center"><div><p className="text-sm font-black text-red-700">Preview hin banamne</p><p className="mt-2 text-xs leading-5 text-red-600">{error}</p><button type="button" onClick={() => setRetryNonce((value) => value + 1)} className="mt-4 min-h-11 rounded-xl bg-white px-4 text-xs font-black text-halo-blue shadow-sm">Retry</button></div></div>}
        {!loading && preview && isImage && <img src={preview.signedUrl} alt={`${documentLabel} preview`} className="max-h-[64dvh] min-h-64 w-full object-contain" referrerPolicy="no-referrer" />}
        {!loading && preview && !isImage && <iframe src={preview.signedUrl} title={`${documentLabel} PDF preview`} className="h-[64dvh] min-h-96 w-full border-0 bg-white" referrerPolicy="no-referrer" />}
      </div>

      <div className="mt-4 rounded-2xl bg-halo-soft p-3 text-[10px] leading-5 text-halo-muted"><strong className="text-halo-navy">Private access:</strong> URL kun signed fi yeroo gabaabaa qofa hojjata{expiresAt ? `; ${expiresAt}tti xumurama` : ""}. Public URL hin uumamu.</div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button type="button" onClick={onClose} className="min-h-13 rounded-2xl border border-halo-line bg-white px-4 text-sm font-black text-halo-navy">Cufi</button>
        <button type="button" disabled={!preview} onClick={() => { if (preview) window.open(preview.signedUrl, "_blank", "noopener,noreferrer"); }} className="min-h-13 rounded-2xl bg-halo-blue px-4 text-sm font-black text-white shadow-halo-button disabled:cursor-not-allowed disabled:opacity-45">Banu</button>
      </div>
    </section>
  </div>;
}
