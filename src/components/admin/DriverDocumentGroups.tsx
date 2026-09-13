import { useEffect, useRef, useState } from "react";
import { documentExpiryLabel, driverDocumentGroups, type DriverDocumentGroup } from "../../domain/driver-document-review";
import type { DriverVerificationFile } from "../../services/driver.service";
import { supabase } from "../../services/supabase.client";

export async function signedDocumentPreview(path: string) {
  const { data, error } = await supabase.storage.from("driver-verification").createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw new Error("Preview unavailable");
  return data.signedUrl;
}
type PreviewResolver = typeof signedDocumentPreview;

export function DriverDocumentGroups({ documents, driverId, truckId, busy, error, onOpen, onReview, resolvePreview = signedDocumentPreview }: {
  documents: DriverVerificationFile[]; driverId: string; truckId: string | null; busy: boolean; error?: string;
  onOpen: (path: string) => Promise<void>;
  onReview: (doc: DriverVerificationFile, status: "verified" | "rejected") => Promise<void>;
  resolvePreview?: PreviewResolver;
}) {
  const groups = driverDocumentGroups(documents, driverId, truckId);
  const [selection, setSelection] = useState<{ group: string; key: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const group = groups.find((item) => item.key === selection?.group);
  const slot = group?.slots.find((item) => item.key === selection?.key);
  const doc = slot?.doc;

  useEffect(() => {
    const node = dialog.current;
    if (selection && node && !node.open) node.showModal();
    if (!selection && node?.open) node.close();
  }, [selection]);

  function close() {
    setSelection(null);
    opener.current?.focus();
  }
  function choose(groupKey: string, key: string) {
    opener.current = document.activeElement as HTMLElement;
    setSelection({ group: groupKey, key });
  }
  return <>
    <div className="driver-document-grid" aria-label="Required documents">
      {groups.map((item) => <section key={item.key} className="driver-document-group" aria-label={item.title}>
        <header><h3>{item.title}</h3><GroupStatus group={item} /></header>
        <div className="driver-document-sides">{item.slots.map((side) => <div key={side.key}>
          <Preview doc={side.doc} label={`${item.title} · ${side.label}`} onSelect={() => choose(item.key, side.key)} resolvePreview={resolvePreview} />
          <span className="driver-side-label">{side.label}</span>
        </div>)}</div>
      </section>)}
    </div>
    <dialog ref={dialog} className="driver-document-dialog" aria-labelledby={`document-title-${driverId}`} onCancel={(event) => { event.preventDefault(); close(); }} onClose={close} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      {group && <div className="driver-document-dialog-content">
        <header><div><h3 id={`document-title-${driverId}`}>{group.title}</h3><GroupStatus group={group} /></div><button type="button" autoFocus onClick={close} aria-label="Close document details">×</button></header>
        <div className="driver-document-tabs" aria-label="Document sides">{group.slots.map((side) => <button type="button" key={side.key} aria-pressed={side.key === slot?.key} onClick={() => setSelection({ group: group.key, key: side.key })}>{side.label}</button>)}</div>
        <Preview key={doc?.file_path ?? slot?.key} doc={doc} label={`${group.title} · ${slot?.label}`} onSelect={() => { if (doc) void onOpen(doc.file_path); }} resolvePreview={resolvePreview} />
        {doc ? <>
          <dl className="driver-document-metadata">
            <div><dt>File</dt><dd>{doc.original_name}</dd></div>
            <div><dt>Status</dt><dd>{doc.status}</dd></div>
            <div><dt>Updated</dt><dd>{new Date(doc.updated_at).toLocaleDateString()}</dd></div>
            {documentExpiryLabel(doc.document_key) && <div><dt>{documentExpiryLabel(doc.document_key)}</dt><dd>{doc.expiry_date || "Required"}</dd></div>}
            {doc.reviewed_at && <div><dt>Reviewed</dt><dd>{new Date(doc.reviewed_at).toLocaleDateString()}</dd></div>}
          </dl>
          {doc.rejection_reason && <p className="driver-document-correction">{doc.rejection_reason}</p>}
          {error && <p role="alert" className="driver-document-correction">{error}</p>}
          <div className="driver-document-dialog-actions">
            <button type="button" onClick={() => void onOpen(doc.file_path)}>Open original</button>
            {doc.status === "pending" && <>
              <button type="button" disabled={busy} onClick={() => void onReview(doc, "verified")} className="driver-verify">{busy ? "Saving…" : "Verify"}</button>
              <button type="button" disabled={busy} onClick={() => void onReview(doc, "rejected")}>Request re-upload</button>
            </>}
          </div>
        </> : <p className="driver-document-missing">This side has not been uploaded yet.</p>}
      </div>}
    </dialog>
  </>;
}

function GroupStatus({ group }: { group: DriverDocumentGroup }) {
  return <span className={`driver-document-status ${group.status === "Verified" ? "is-verified" : group.status === "Corrections" || group.status === "Check expiry" ? "is-correction" : "is-pending"}`}>{group.status}</span>;
}

function Preview({ doc, label, onSelect, resolvePreview }: {
  doc?: DriverVerificationFile; label: string; onSelect: () => void; resolvePreview: PreviewResolver;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState<{ path: string; value: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const isImage = Boolean(doc?.mime_type.startsWith("image/"));
  const path = doc?.file_path;
  useEffect(() => {
    if (!host.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "160px" });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    setUrl(null); setFailed(false);
    if (visible && isImage && path) {
      void resolvePreview(path).then((value) => { if (active) setUrl({ path, value }); }).catch(() => { if (active) setFailed(true); });
    }
    return () => { active = false; };
  }, [path, visible, isImage, attempt, resolvePreview]);
  return <div className="driver-document-preview" ref={host}>
    <button type="button" onClick={onSelect} aria-label={`View ${label}`}>
      {url?.path === path && url && !failed ? <img src={url.value} alt={label} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        : <span>{!doc ? "Not uploaded" : failed ? "Preview unavailable" : !isImage ? "PDF · Tap to view" : "Loading preview…"}</span>}
    </button>
    {failed && <button type="button" className="driver-preview-retry" aria-label={`Retry ${label} preview`} onClick={() => setAttempt((value) => value + 1)}>↻</button>}
  </div>;
}
