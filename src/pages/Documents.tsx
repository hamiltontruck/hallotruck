import { useEffect, useState } from "react";
import {
  getMyDocuments,
  registerDocument,
  uploadDocumentFile,
  DriverDocStatus,
} from "../services/driver.service";
import { supabase } from "../services/supabase.client";
import { Button } from "../components/ui/Button";

const DOC_LABELS: Record<string, string> = {
  license: "Driving license",
  vehicle_reg: "Vehicle registration",
  insurance: "Insurance certificate",
  fayda_id: "Fayda (national ID)",
  transport_permit: "Transport permit",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "text-amber-dim border-amber",
  verified: "text-route border-route",
  rejected: "text-steel border-steel",
};

export function Documents() {
  const [status, setStatus] = useState<DriverDocStatus | null>(null);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setStatus(await getMyDocuments());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load documents.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleFile(docType: string, file: File | undefined) {
    if (!file) return;
    setUploadingType(docType);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in required.");
      const path = await uploadDocumentFile(user.id, docType, file);
      await registerDocument(docType, path);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingType(null);
    }
  }

  const docsByType = new Map((status?.documents ?? []).map((d) => [d.doc_type, d]));
  const verifiedCount = (status?.documents ?? []).filter((d) => d.status === "verified").length;

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <h1 className="font-display font-bold text-3xl text-asphalt mb-2">Verification documents</h1>
      <p className="font-body text-steel mb-8">
        {status
          ? `${verifiedCount} of ${status.requiredCount} verified. All five must be verified before you can accept loads.`
          : "Loading…"}
      </p>

      {error && (
        <p className="font-body text-sm text-route border border-route/40 bg-route/5 px-4 py-3 mb-6">
          {error}
        </p>
      )}

      <div className="space-y-3">
        {Object.entries(DOC_LABELS).map(([docType, label]) => {
          const doc = docsByType.get(docType);
          return (
            <div
              key={docType}
              className="border border-line bg-white p-5 flex items-center justify-between gap-4 flex-wrap"
            >
              <div>
                <div className="font-display font-semibold text-asphalt">{label}</div>
                {doc && (
                  <span
                    className={`inline-block mt-1 font-mono text-xs uppercase border px-2 py-0.5 ${
                      STATUS_STYLE[doc.status] ?? "text-steel border-steel"
                    }`}
                  >
                    {doc.status}
                  </span>
                )}
              </div>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => handleFile(docType, e.target.files?.[0])}
                />
                <Button
                  variant={doc ? "ghost" : "primary"}
                  disabled={uploadingType === docType}
                  className="pointer-events-none"
                  type="button"
                >
                  {uploadingType === docType ? "Uploading…" : doc ? "Replace" : "Upload"}
                </Button>
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
