import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DELIVERY_PROOF_REQUIRED_RELEASED_AT,
  TRIP_PAYMENT_RESULT_REQUIRED_RELEASED_AT,
  classifyDeliveryReconciliation,
  type DeliveryReconciliationIndicator,
} from "../../domain/delivery-reconciliation";
import { supabase } from "../../services/supabase.client";

type DeliveredOrderRow = {
  id: string;
  tracking_id: string;
  pickup_address: string;
  dropoff_address: string;
  delivered_at: string | null;
};

type EvidenceRow = { order_id: string };

type ReconciliationRow = DeliveredOrderRow & {
  hasProof: boolean;
  hasTripPaymentResult: boolean;
  indicators: DeliveryReconciliationIndicator[];
  currentWorkflowDefect: boolean;
  legitimateLegacy: boolean;
};

const indicatorCopy: Record<DeliveryReconciliationIndicator, string> = {
  delivered_without_proof: "Delivered without proof",
  delivered_without_trip_payment_result: "Delivered without trip payment result",
  legitimate_legacy_delivered_record: "Legitimate legacy delivered record",
};

const QUERY_BATCH_SIZE = 100;

function batches<T>(values: T[]) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += QUERY_BATCH_SIZE) {
    result.push(values.slice(index, index + QUERY_BATCH_SIZE));
  }
  return result;
}

export function AdminDeliveryReconciliationPanel() {
  const [rows, setRows] = useState<ReconciliationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select("id,tracking_id,pickup_address,dropoff_address,delivered_at")
        .eq("status", "delivered")
        .order("delivered_at", { ascending: false, nullsFirst: false })
        .limit(500);
      if (orderError) throw orderError;

      const deliveredOrders = (orderData ?? []) as DeliveredOrderRow[];
      const orderIds = deliveredOrders.map((order) => order.id);
      const orderIdBatches = batches(orderIds);

      const [proofResults, tripPaymentResults] = await Promise.all([
        Promise.all(orderIdBatches.map((ids) => supabase
          .from("delivery_proofs")
          .select("order_id")
          .in("order_id", ids))),
        Promise.all(orderIdBatches.map((ids) => supabase
          .from("driver_trip_payment_results")
          .select("order_id")
          .in("order_id", ids))),
      ]);

      for (const result of proofResults) if (result.error) throw result.error;
      for (const result of tripPaymentResults) if (result.error) throw result.error;

      const proofOrderIds = new Set(
        proofResults.flatMap((result) => (result.data ?? []) as EvidenceRow[]).map((row) => row.order_id),
      );
      const tripPaymentOrderIds = new Set(
        tripPaymentResults.flatMap((result) => (result.data ?? []) as EvidenceRow[]).map((row) => row.order_id),
      );

      setRows(deliveredOrders.map((order) => {
        const hasProof = proofOrderIds.has(order.id);
        const hasTripPaymentResult = tripPaymentOrderIds.has(order.id);
        const classification = classifyDeliveryReconciliation({
          deliveredAt: order.delivered_at,
          hasProof,
          hasTripPaymentResult,
        });
        return { ...order, hasProof, hasTripPaymentResult, ...classification };
      }));
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Delivery reconciliation could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

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

  const anomalyRows = useMemo(() => rows.filter((row) => row.indicators.length > 0), [rows]);
  const deliveredWithoutProof = anomalyRows.filter((row) => !row.hasProof).length;
  const deliveredWithoutTripPaymentResult = anomalyRows.filter((row) => !row.hasTripPaymentResult).length;
  const legitimateLegacy = anomalyRows.filter((row) => row.legitimateLegacy).length;
  const currentWorkflowDefects = anomalyRows.filter((row) => row.currentWorkflowDefect).length;

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
        <Summary label="Delivered without proof" value={deliveredWithoutProof} danger={currentWorkflowDefects > 0 && anomalyRows.some((row) => !row.hasProof && row.currentWorkflowDefect)} />
        <Summary label="Delivered without trip payment result" value={deliveredWithoutTripPaymentResult} danger={currentWorkflowDefects > 0 && anomalyRows.some((row) => !row.hasTripPaymentResult && row.currentWorkflowDefect)} />
        <Summary label="Legitimate legacy delivered record" value={legitimateLegacy} />
        <Summary label="Delivered total checked" value={rows.length} />
      </div>

      {anomalyRows.length === 0 ? (
        <p className="mt-4 border border-emerald-700/20 bg-emerald-50 p-4 text-sm text-emerald-800">No delivery reconciliation gaps were found.</p>
      ) : (
        <div className="mt-4 grid gap-3">
          {anomalyRows.map((row) => <article key={row.id} className={`border p-4 ${row.currentWorkflowDefect ? "border-route/35 bg-route/5" : "border-amber/25 bg-[#faf9f5]"}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="break-all font-mono text-xs font-semibold">{row.tracking_id}</p>
                <p className="mt-2 break-words text-sm text-steel">{row.pickup_address} → {row.dropoff_address}</p>
                <p className="mt-2 text-xs text-steel">Delivered: <strong className="text-asphalt">{row.delivered_at ? new Date(row.delivered_at).toLocaleString() : "Timestamp unavailable"}</strong></p>
              </div>
              <span className={`self-start px-3 py-2 text-[10px] font-semibold uppercase ${row.currentWorkflowDefect ? "bg-route text-white" : "bg-amber/15 text-amber-dim"}`}>{row.currentWorkflowDefect ? "Current workflow defect" : "Historical record"}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {row.indicators.map((indicator) => <span key={indicator} className={`px-2.5 py-1.5 text-[10px] font-semibold uppercase ${indicator === "legitimate_legacy_delivered_record" ? "bg-asphalt/5 text-steel" : row.currentWorkflowDefect ? "bg-route/10 text-route" : "bg-amber/15 text-amber-dim"}`}>{indicatorCopy[indicator]}</span>)}
            </div>
          </article>)}
        </div>
      )}
    </div>
  </section>;
}

function Summary({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return <div className={`min-w-0 border p-3 ${danger ? "border-route/30 bg-route/5" : "border-asphalt/10 bg-[#faf9f5]"}`}><p className="text-[10px] font-semibold uppercase tracking-wide text-steel">{label}</p><p className={`mt-2 font-display text-xl font-bold ${danger ? "text-route" : "text-asphalt"}`}>{value}</p></div>;
}
