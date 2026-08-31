import { useMemo, useRef, useState } from "react";
import {
  expiryDocumentKeys,
  photoOnlyDocumentKeys,
  replacementWarning,
  validateVerificationUpload,
} from "./driver-document-upload.model";
import { submitDriverVerificationDocument } from "./driver-document-upload.service";
import type {
  DriverVerificationRecord,
  VerificationDocumentKey,
} from "./driver-profile.model";

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Document upload hin milkoofne.";
}

function formatBytes(size: number): string {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

export function DriverDocumentUploadSheet({
  userId,
  documentKey,
  documentLabel,
  truckId,
  currentRecord,
  onClose,
  onUploaded,
}: {
  userId: string;
  documentKey: VerificationDocumentKey;
  documentLabel: string;
  truckId: string | null;
  currentRecord: DriverVerificationRecord | undefined;
  onClose: () => void;
  onUploaded: (message: string) => void | Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [expiryDate, setExpiryDate] = useState(currentRecord?.expiryDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const warning = replacementWarning(currentRecord);
  const photoOnly = photoOnlyDocumentKeys.has(documentKey);
  const supportsExpiry = expiryDocumentKeys.has(documentKey);
  const accept = photoOnly ? "image/jpeg,image/png,image/webp" : "image/jpeg,image/png,image/webp,application/pdf";
  const selectedSummary = useMemo(
    () => file ? `${file.name} · ${formatBytes(file.size)}` : null,
    [file],
  );

  const chooseFile = () => {
    if (!submitting) fileInputRef.current?.click();
  };

  const submit = async () => {
    if (submitting) return;
    setError(null);
    if (!file) {
      setError("File tokko filadhu.");
      return;
    }
    try {
      validateVerificationUpload({
        documentKey,
        file,
        truckId,
        expiryDate: supportsExpiry ? expiryDate : null,
      });
      setSubmitting(true);
      const result = await submitDriverVerificationDocument({
        expectedUserId: userId,
        documentKey,
        file,
        truckId,
        expiryDate: supportsExpiry ? expiryDate : null,
      });
      const message = result.cleanupWarning
        ? "Document galmaa'eera; private file durii qulqulleessuun yeroo biraa irra deebi'ama."
        : result.replaced
          ? "Document jijjiirameera; Admin/CEO review haaraa eeggata."
          : "Document galmaa'eera; Admin/CEO review eeggata.";
      await onUploaded(message);
    } catch (caught) {
      setError(errorMessage(caught));
      setSubmitting(false);
    }
  };

  return <div className="fixed inset-0 z-[80] flex items-end bg-halo-navy/55 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="driver-document-upload-title" data-driver-document-upload-sheet>
    <button type="button" aria-label="Upload sheet cufi" onClick={onClose} disabled={submitting} className="absolute inset-0 cursor-default disabled:cursor-wait" />
    <section className="relative z-10 max-h-[92dvh] w-full overflow-y-auto rounded-t-[30px] bg-white px-4 pb-[calc(22px+env(safe-area-inset-bottom))] pt-4 shadow-[0_-24px_70px_rgba(16,33,61,0.28)] sm:px-6">
      <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-halo-line" />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-halo-gold-dark">Private verification</p><h2 id="driver-document-upload-title" className="mt-1 break-words text-xl font-black text-halo-navy">{documentLabel}</h2><p className="mt-2 text-xs leading-5 text-halo-muted">File private bucket keessatti Driver ID kee jalatti kuufama.</p></div>
        <button type="button" onClick={onClose} disabled={submitting} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-halo-soft text-lg font-black text-halo-blue disabled:opacity-50" aria-label="Cufi">×</button>
      </div>

      {warning && <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">{warning}</div>}
      {error && <div role="alert" className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-3 text-xs font-bold leading-5 text-red-700">{error}</div>}

      <div className="mt-5 space-y-4">
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          capture={photoOnly ? (documentKey === "driver_photo" ? "user" : "environment") : undefined}
          disabled={submitting}
          onChange={(event) => {
            const selected = event.currentTarget.files?.[0] ?? null;
            setFile(selected);
            setError(null);
          }}
          className="sr-only"
        />
        <button type="button" onClick={chooseFile} disabled={submitting} className="flex min-h-24 w-full flex-col items-center justify-center rounded-[22px] border-2 border-dashed border-halo-line bg-halo-canvas px-4 text-center transition active:scale-[0.99] disabled:opacity-60">
          <span className="text-sm font-black text-halo-blue">{file ? "File jijjiiri" : photoOnly ? "Kaameraa ykn Gallery bani" : "File filadhu"}</span>
          <span className="mt-2 break-all text-[10px] leading-4 text-halo-muted">{selectedSummary || (photoOnly ? "JPG, PNG, WebP · max 10 MB" : "JPG, PNG, WebP, PDF · max 10 MB")}</span>
        </button>

        {supportsExpiry && <label className="block"><span className="mb-2 block text-[10px] font-black uppercase tracking-[0.14em] text-halo-muted">Expiry date — optional</span><input type="date" value={expiryDate} disabled={submitting} onChange={(event) => setExpiryDate(event.target.value)} className="min-h-13 w-full rounded-2xl border border-halo-line bg-white px-4 text-sm font-bold text-halo-navy outline-none focus:border-halo-blue disabled:opacity-60" /></label>}

        <div className="rounded-2xl bg-halo-soft p-3 text-[10px] leading-5 text-halo-muted"><strong className="text-halo-navy">Security:</strong> Mobile app file kana verify hin godhu. Submission hundi Pending ta'ee Admin/CEO review eeggata; service-role key browser keessa hin jiru.</div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <button type="button" onClick={onClose} disabled={submitting} className="min-h-13 rounded-2xl border border-halo-line bg-white px-4 text-sm font-black text-halo-navy disabled:opacity-50">Dhiisi</button>
        <button type="button" onClick={() => void submit()} disabled={submitting || !file} className="min-h-13 rounded-2xl bg-halo-blue px-4 text-sm font-black text-white shadow-halo-button disabled:cursor-not-allowed disabled:opacity-50">{submitting ? "Galchaa jira…" : currentRecord ? "Jijjiiri" : "Galchi"}</button>
      </div>
    </section>
  </div>;
}
