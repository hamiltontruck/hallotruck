import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../services/supabase.client";
import { LegacyRefundRestorationForm } from "./LegacyRefundRestorationForm";

type IntegrityRow = {
  order_id: string;
  tracking_id: string;
  invoice_total_etb: number | string;
  verified_net_etb: number | string;
  pending_etb: number | string;
  balance_due_etb: number | string;
  customer_credit_etb: number | string;
  ledger_anomaly_etb: number | string;
  issue: string;
};

type RefundRow = {
  id: string;
  order_id: string;
  provider: string;
  provider_ref: string | null;
  amount_etb: number | string;
  event: string;
  raw_payload: Record<string, unknown> | null;
  created_at: string;
};

type RestorationRow = {
  id: string;
  order_id: string | null;
  source_payment_id: string | null;
  amount_etb: number | string;
  external_evidence_reference: string | null;
  created_at: string;
};

const ineligibleLegacyProviders = new Set([
  "cash",
  "cash_to_driver",
  "driver_cash",
  "financial_correction",
  "credit_refund",
  "internal",
]);

function amount(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number | string | null | undefined) {
  return amount(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function isEligibleLegacyExternalRefund(refund: RefundRow) {
  const provider = refund.provider.trim().toLowerCase();
  const reference = refund.provider_ref?.trim() ?? "";
  if (!reference || ineligibleLegacyProviders.has(provider)) return false;
  return !refund.raw_payload || !("correction_id" in refund.raw_payload);
}

export function AdminPaymentLedgerAnomalyPanel() {
  const [integrityRows, setIntegrityRows] = useState<IntegrityRow[]>([]);
  const [refunds, setRefunds] = useState<RefundRow[]>([]);
  const [restorations, setRestorations] = useState<RestorationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const integrityResult = await supabase.rpc("admin_payment_integrity_report");
      if (integrityResult.error) throw integrityResult.error;
      const anomalies = ((integrityResult.data ?? []) as IntegrityRow[])
        .filter((row) => amount(row.ledger_anomaly_etb) > 0);
      const orderIds = anomalies.map((row) => row.order_id);

      if (orderIds.length === 0) {
        setIntegrityRows([]);
        setRefunds([]);
        setRestorations([]);
        setError("");
        return;
      }

      const [refundResult, restorationResult] = await Promise.all([
        supabase
          .from("payments")
          .select("id,order_id,provider,provider_ref,amount_etb,event,raw_payload,created_at")
          .in("order_id", orderIds)
          .eq("event", "refunded")
          .order("created_at", { ascending: false }),
        supabase
          .from("financial_corrections")
          .select("id,order_id,source_payment_id,amount_etb,external_evidence_reference,created_at")
          .in("order_id", orderIds)
          .eq("correction_type", "legacy_refund_restoration")
          .order("created_at", { ascending: false }),
      ]);
      if (refundResult.error) throw refundResult.error;
      if (restorationResult.error) throw restorationResult.error;

      setIntegrityRows(anomalies);
      setRefunds((refundResult.data ?? []) as RefundRow[]);
      setRestorations((restorationResult.data ?? []) as RestorationRow[]);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Payment integrity report could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel("admin-payment-ledger-anomalies")
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => void load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "financial_corrections" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const restorationsBySource = useMemo(() => {
    const result = new Map<string, number>();
    for (const restoration of restorations) {
      if (!restoration.source_payment_id) continue;
      result.set(
        restoration.source_payment_id,
        (result.get(restoration.source_payment_id) ?? 0) + amount(restoration.amount_etb),
      );
    }
    return result;
  }, [restorations]);

  if (loading) {
    return <section className="bg-[#f5f3ed] px-4 pt-4 text-asphalt sm:px-7 sm:pt-7"><div className="mx-auto max-w-5xl border border-asphalt/10 bg-white p-4 font-mono text-xs text-steel">Checking Payment Ledger integrity…</div></section>;
  }

  if (error) {
    return <section className="bg-[#f5f3ed] px-4 pt-4 text-asphalt sm:px-7 sm:pt-7"><div className="mx-auto max-w-5xl border border-route/30 bg-route/5 p-4 text-sm text-route">Payment Ledger integrity check failed: {error}</div></section>;
  }

  if (integrityRows.length === 0) return null;

  const totalAnomaly = integrityRows.reduce((sum, row) => sum + amount(row.ledger_anomaly_etb), 0);

  return <section className="bg-[#f5f3ed] px-4 pt-4 text-asphalt sm:px-7 sm:pt-7" aria-label="Payment Ledger anomalies">
    <div className="mx-auto max-w-5xl border-2 border-route bg-route/5 p-4 sm:p-6" role="alert">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[.18em] text-route">PAYMENT LEDGER ANOMALY</p>
          <h2 className="mt-2 font-display text-2xl font-bold">Refunds exceed verified funds</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-steel">These orders are reconciliation exceptions, not ordinary unpaid invoices. New or advancing payments fail closed while the negative ledger remains. Never edit or delete original payment rows.</p>
        </div>
        <div className="shrink-0 border border-route/30 bg-white px-4 py-3">
          <p className="font-mono text-[9px] uppercase tracking-wide text-steel">Total anomaly</p>
          <p className="mt-2 font-display text-xl font-bold text-route">ETB {money(totalAnomaly)}</p>
          <p className="mt-1 text-xs text-steel">{integrityRows.length} order{integrityRows.length === 1 ? "" : "s"}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        {integrityRows.map((row) => {
          const anomaly = amount(row.ledger_anomaly_etb);
          const eligibleRefunds = refunds.filter((refund) =>
            refund.order_id === row.order_id && isEligibleLegacyExternalRefund(refund),
          );

          return <article key={row.order_id} className="border border-route/25 bg-white p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <div className="min-w-0">
                <p className="break-all font-mono text-xs font-semibold">{row.tracking_id}</p>
                <p className="mt-2 text-sm font-semibold text-route">{row.issue}</p>
                <p className="mt-1 text-xs text-steel">Restoration requires reviewed external Telebirr/bank evidence, an immutable reason and a replay-safe request key.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <Value label="Invoice" value={`ETB ${money(row.invoice_total_etb)}`} />
                <Value label="Verified" value={`ETB ${money(row.verified_net_etb)}`} />
                <Value label="Balance" value={`ETB ${money(row.balance_due_etb)}`} />
                <Value label="Anomaly" value={`ETB ${money(anomaly)}`} danger />
              </div>
            </div>

            <div className="mt-4 border-t border-route/15 pt-4">
              <p className="text-xs font-semibold text-asphalt">Eligible historical refund sources</p>
              {eligibleRefunds.length === 0 ? (
                <p className="mt-2 text-xs text-route">No eligible legacy refund row is available for automated restoration. Keep this anomaly open for manual Finance investigation.</p>
              ) : (
                <div className="mt-3 grid gap-3">
                  {eligibleRefunds.map((refund) => {
                    const restored = restorationsBySource.get(refund.id) ?? 0;
                    const sourceRemaining = Math.max(0, amount(refund.amount_etb) - restored);
                    const maxRestoration = Math.min(anomaly, sourceRemaining);
                    if (maxRestoration <= 0) return null;
                    return <div key={refund.id} className="rounded-xl border border-asphalt/10 bg-[#faf9f5] p-3">
                      <p className="break-all font-mono text-[10px] text-steel">{refund.provider} · {refund.provider_ref} · original refund ETB {money(refund.amount_etb)} · {new Date(refund.created_at).toLocaleString()}</p>
                      <LegacyRefundRestorationForm refundPaymentId={refund.id} refundAmountEtb={sourceRemaining} maxRestorationEtb={maxRestoration} onSaved={load} />
                    </div>;
                  })}
                </div>
              )}
            </div>
          </article>;
        })}
      </div>
    </div>
  </section>;
}

function Value({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div className={`min-w-0 border p-2.5 ${danger ? "border-route/30 bg-route/5 text-route" : "border-asphalt/10 bg-[#f8f7f2] text-asphalt"}`}><span className="block font-mono text-[8px] uppercase tracking-wide opacity-70">{label}</span><strong className="mt-1 block break-words">{value}</strong></div>;
}
