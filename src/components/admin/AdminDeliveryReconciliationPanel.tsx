import { useCallback, useEffect, useState } from "react";
import {
  DELIVERY_PROOF_REQUIRED_RELEASED_AT,
  TRIP_PAYMENT_RESULT_REQUIRED_RELEASED_AT,
  type DeliveryReconciliationIndicator,
} from "../../domain/delivery-reconciliation";
import {
  DELIVERY_RECONCILIATION_PAGE_SIZES,
  emptyDeliveryReconciliationReport,
  getAdminDeliveryReconciliationReport,
  type DeliveryReconciliationPageSize,
  type DeliveryReconciliationReportRow,
} from "../../services/admin-delivery-reconciliation.service";
import { supabase } from "../../services/supabase.client";

const indicatorCopy: Record<DeliveryReconciliationIndicator, string> = {
  delivered_without_proof: "Delivered without proof",
  delivered_without_trip_payment_result: "Delivered without trip payment result",
  legitimate_legacy_delivered_record: "Legitimate legacy delivered record",
};

function indicatorsForRow(row: DeliveryReconciliationReportRow): DeliveryReconciliationIndicator[] {
  const indicators: DeliveryReconciliationIndicator[] = [];
  if (row.missingProof) indicators.push("delivered_without_proof");
  if (row.missingTripPaymentResult) indicators.push("delivered_without_trip_payment_result");
  if (row.legitimateLegacy) indicators.push("legitimate_legacy_delivered_record");
  return indicators;
}

export function AdminDeliveryReconciliationPanel() {
  const [report, setReport] = useState(emptyDeliveryReconciliationReport);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<DeliveryReconciliationPageSize>(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getAdminDeliveryReconciliationReport({ page, pageSize });
      setReport(next);
      if (next.page !== page) setPage(next.page);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Delivery reconciliation could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel("admin-delivery-reconciliation")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_proofs" }, () => void load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "driver_trip_payment_results" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const {
    deliveredTotal,
    deliveredWithoutProof,
    deliveredWithoutTripPaymentResult,
    currentWithoutProof,
    currentWithoutTripPaymentResult,
    legitimateLegacy,
    currentWorkflowDefects,
  } = report.summary;

  if (loading) {
    return <section className="bg-[#f5f3ed] px-4 pt-4 text-asphalt sm:px-7 sm:pt-7"><div className="mx-auto max-w-5xl border border-asphalt/10 bg-white p-4 font-mono text-xs text-steel">Checking delivery reconciliation…</div></section>;
  }

  if (error) {
    return <section className="bg-[#f5f3ed] px-4 pt-4 text-asphalt sm:px-7 sm:pt-7"><div className="mx-auto max-w-5xl border border-route/30 bg-route/5 p-4 text-sm text-route">Delivery reconciliation check failed: {error}</div></section>;
  }

  return <section className="bg-[#f5f3ed] px-4 pt-4 text-asphalt sm:px-7 sm:pt-7" aria-label="Delivery reconciliation anomalies">
    <div className={`mx-auto max-w-5xl border-2 bg-white p-4 sm:p-6 ${currentWorkflowDefects > 0 ? "border-route" : "border-amber/45"}`} role={currentWorkflowDefects > 0 ? "alert" : "status"}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[.18em] text-amber-dim">DELIVERY RECONCILIATION</p>
          <h2 className="mt-2 font-display text-2xl font-bold">Delivery completion integrity</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-steel">Derived from existing order, delivery-proof and immutable trip-payment history. Historical gaps are labeled explicitly; no proof or payment result is synthesized or backfilled.</p>
          <p className="mt-2 text-xs leading-5 text-steel">Proof enforcement release: {new Date(DELIVERY_PROOF_REQUIRED_RELEASED_AT).toLocaleString()} · Atomic proof + trip-payment release: {new Date(TRIP_PAYMENT_RESULT_REQUIRED_RELEASED_AT).toLocaleString()}</p>
        </div>
        <div className={`shrink-0 border px-4 py-3 ${currentWorkflowDefects > 0 ? "border-route/30 bg-route/5" : "border-amber/30 bg-amber/10"}`}>
          <p className="font-mono text-[9px] uppercase tracking-wide text-steel">Current workflow defects</p>
          <p className={`mt-2 font-display text-2xl font-bold ${currentWorkflowDefects > 0 ? "text-route" : "text-emerald-700"}`}>{currentWorkflowDefects}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Summary label="Delivered without proof" value={deliveredWithoutProof} danger={currentWithoutProof > 0} />
        <Summary label="Delivered without trip payment result" value={deliveredWithoutTripPaymentResult} danger={currentWithoutTripPaymentResult > 0} />
        <Summary label="Legitimate legacy delivered record" value={legitimateLegacy} />
        <Summary label="Delivered total checked" value={deliveredTotal} />
      </div>

      {report.total === 0 ? (
        <p className="mt-4 border border-emerald-700/20 bg-emerald-50 p-4 text-sm text-emerald-800">No delivery reconciliation gaps were found.</p>
      ) : (
        <>
          <div className="mt-4 grid gap-3">
            {report.rows.map((row) => <article key={row.id} className={`border p-4 ${row.currentWorkflowDefect ? "border-route/35 bg-route/5" : "border-amber/25 bg-[#faf9f5]"}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="break-all font-mono text-xs font-semibold">{row.tracking_id}</p>
                  <p className="mt-2 break-words text-sm text-steel">{row.pickup_address} → {row.dropoff_address}</p>
                  <p className="mt-2 text-xs text-steel">Delivered: <strong className="text-asphalt">{row.delivered_at ? new Date(row.delivered_at).toLocaleString() : "Timestamp unavailable"}</strong></p>
                </div>
                <span className={`self-start px-3 py-2 text-[10px] font-semibold uppercase ${row.currentWorkflowDefect ? "bg-route text-white" : "bg-amber/15 text-amber-dim"}`}>{row.currentWorkflowDefect ? "Current workflow defect" : "Historical record"}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {indicatorsForRow(row).map((indicator) => <span key={indicator} className={`px-2.5 py-1.5 text-[10px] font-semibold uppercase ${indicator === "legitimate_legacy_delivered_record" ? "bg-asphalt/5 text-steel" : row.currentWorkflowDefect ? "bg-route/10 text-route" : "bg-amber/15 text-amber-dim"}`}>{indicatorCopy[indicator]}</span>)}
              </div>
            </article>)}
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-asphalt/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-mono text-[10px] uppercase tracking-wide text-steel">
              Showing {(report.page - 1) * report.pageSize + 1}–{Math.min(report.page * report.pageSize, report.total)} of {report.total.toLocaleString()} reconciliation gaps
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-steel">
                Rows
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value) as DeliveryReconciliationPageSize);
                    setPage(1);
                  }}
                  className="border border-asphalt/15 bg-white px-2 py-2 text-asphalt"
                >
                  {DELIVERY_RECONCILIATION_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
              <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={report.page <= 1} className="border border-asphalt/15 px-3 py-2 text-xs font-semibold disabled:opacity-40">Previous</button>
              <span className="px-2 font-mono text-[10px] text-steel">Page {report.page} / {report.totalPages}</span>
              <button type="button" onClick={() => setPage((value) => Math.min(report.totalPages, value + 1))} disabled={report.page >= report.totalPages} className="border border-asphalt/15 px-3 py-2 text-xs font-semibold disabled:opacity-40">Next</button>
            </div>
          </div>
        </>
      )}
    </div>
  </section>;
}

function Summary({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return <div className={`min-w-0 border p-3 ${danger ? "border-route/30 bg-route/5" : "border-asphalt/10 bg-[#faf9f5]"}`}><p className="text-[10px] font-semibold uppercase tracking-wide text-steel">{label}</p><p className={`mt-2 font-display text-xl font-bold ${danger ? "text-route" : "text-asphalt"}`}>{value}</p></div>;
}
