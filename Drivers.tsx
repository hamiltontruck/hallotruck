import { useEffect, useState } from "react";
import {
  getDriversByStatus,
  updateDriverStatus,
  updateDocStatus,
  PendingDriver,
} from "../services/admin.service";
import { Button } from "../components/ui/Button";

const REQUIRED_DOCS = ["license", "vehicle_reg", "insurance", "fayda_id", "transport_permit"];
const DOC_LABELS: Record<string, string> = {
  license: "License",
  vehicle_reg: "Vehicle reg",
  insurance: "Insurance",
  fayda_id: "Fayda ID",
  transport_permit: "Permit",
};

export function Drivers() {
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const [drivers, setDrivers] = useState<PendingDriver[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setDrivers(await getDriversByStatus(statusFilter));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load drivers.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function handleDocAction(driverId: string, docType: string, verify: boolean) {
    setBusyId(`${driverId}-${docType}`);
    try {
      await updateDocStatus(driverId, docType, verify ? "verify_doc" : "reject_doc");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDriverAction(driverId: string, approve: boolean) {
    setBusyId(driverId);
    try {
      await updateDriverStatus(driverId, approve ? "approve_driver" : "reject_driver");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-10">
      <h1 className="font-display font-bold text-3xl text-asphalt mb-6">Driver verification</h1>

      <div className="flex gap-2 mb-6">
        {(["pending", "approved", "rejected"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`font-mono text-xs uppercase px-3 py-1.5 border ${
              statusFilter === s ? "border-route text-route" : "border-line text-steel"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {error && (
        <p className="font-body text-sm text-route border border-route/40 bg-route/5 px-4 py-3 mb-6">
          {error}
        </p>
      )}

      {loading ? (
        <p className="font-body text-steel">Loading…</p>
      ) : drivers.length === 0 ? (
        <p className="font-body text-steel">No drivers in this state.</p>
      ) : (
        <div className="space-y-4">
          {drivers.map((driver) => {
            const docsByType = new Map(driver.driver_documents.map((d) => [d.doc_type, d.status]));
            const allVerified = REQUIRED_DOCS.every((dt) => docsByType.get(dt) === "verified");
            return (
              <div key={driver.id} className="border border-line bg-white p-6">
                <div className="flex justify-between items-start flex-wrap gap-4 mb-4">
                  <div>
                    <div className="font-display font-semibold text-lg text-asphalt">
                      {driver.full_name}
                    </div>
                    <div className="font-mono text-xs text-steel">
                      {driver.phone} · {driver.vehicle_type ?? "no vehicle set"}
                    </div>
                  </div>
                  {statusFilter === "pending" && (
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        disabled={busyId === driver.id}
                        onClick={() => handleDriverAction(driver.id, false)}
                      >
                        Reject
                      </Button>
                      <Button
                        disabled={busyId === driver.id || !allVerified}
                        onClick={() => handleDriverAction(driver.id, true)}
                        title={!allVerified ? "All documents must be verified first" : undefined}
                      >
                        Approve driver
                      </Button>
                    </div>
                  )}
                </div>

                <div className="grid sm:grid-cols-5 gap-2">
                  {REQUIRED_DOCS.map((docType) => {
                    const docStatus = docsByType.get(docType) ?? "missing";
                    return (
                      <div key={docType} className="border border-line p-3">
                        <div className="font-body text-xs text-asphalt mb-1">
                          {DOC_LABELS[docType]}
                        </div>
                        <div
                          className={`font-mono text-[10px] uppercase mb-2 ${
                            docStatus === "verified"
                              ? "text-route"
                              : docStatus === "rejected"
                              ? "text-steel"
                              : docStatus === "missing"
                              ? "text-steel"
                              : "text-amber-dim"
                          }`}
                        >
                          {docStatus}
                        </div>
                        {docStatus === "pending" && (
                          <div className="flex gap-1">
                            <button
                              disabled={busyId === `${driver.id}-${docType}`}
                              onClick={() => handleDocAction(driver.id, docType, true)}
                              className="text-xs font-body text-route underline"
                            >
                              Verify
                            </button>
                            <button
                              disabled={busyId === `${driver.id}-${docType}`}
                              onClick={() => handleDocAction(driver.id, docType, false)}
                              className="text-xs font-body text-steel underline"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
