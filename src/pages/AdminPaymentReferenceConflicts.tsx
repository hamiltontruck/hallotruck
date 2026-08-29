import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../services/supabase.client";

export type PaymentReferenceClassification =
  | "canonical"
  | "legacy_conflict"
  | "refunded"
  | "superseded";

export interface PaymentReferenceConflictRow {
  payment_id: string;
  order_id: string;
  tracking_id: string;
  provider: string;
  reference_fingerprint: string;
  masked_reference: string;
  amount_etb: number | string;
  event: "initiated" | "held_escrow" | "released" | "failed" | "refunded";
  created_at: string;
  classification: PaymentReferenceClassification;
  canonical_payment_id: string;
  order_count: number;
  active_count: number;
}

export interface PaymentReferenceConflictFixture {
  rows: PaymentReferenceConflictRow[];
  error?: string;
}

type Props = {
  fixture?: PaymentReferenceConflictFixture;
};

function money(value: number | string) {
  const parsed = Number(value);
  return (Number.isFinite(parsed) ? parsed : 0).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

function classificationLabel(classification: PaymentReferenceClassification) {
  if (classification === "canonical") return "Canonical reference";
  if (classification === "legacy_conflict") return "Legacy conflict";
  if (classification === "refunded") return "Refunded history";
  return "Superseded history";
}

function classificationTone(classification: PaymentReferenceClassification) {
  if (classification === "canonical") return "border-emerald-700/30 bg-emerald-50 text-emerald-800";
  if (classification === "legacy_conflict") return "border-route/30 bg-route/10 text-route";
  return "border-amber/35 bg-amber/10 text-amber-dim";
}

function usePaymentReferenceConflicts(fixture?: PaymentReferenceConflictFixture) {
  const [rows, setRows] = useState<PaymentReferenceConflictRow[]>(fixture?.rows ?? []);
  const [loading, setLoading] = useState(!fixture);
  const [error, setError] = useState(fixture?.error ?? "");

  const load = useCallback(async () => {
    if (fixture) {
      setRows(fixture.rows);
      setError(fixture.error ?? "");
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error: loadError } = await supabase.rpc("admin_payment_reference_conflicts");
    if (loadError) {
      setRows([]);
      setError(loadError.message || "Payment reference conflicts could not be loaded.");
    } else {
      setRows((data ?? []) as PaymentReferenceConflictRow[]);
      setError("");
    }
    setLoading(false);
  }, [fixture]);

  useEffect(() => {
    void load();
  }, [load]);

  return { rows, loading, error, reload: load };
}

export function AdminPaymentReferenceConflictBanner({ fixture }: Props = {}) {
  const { rows, loading, error, reload } = usePaymentReferenceConflicts(fixture);
  const conflictRows = rows.filter((row) => row.classification === "legacy_conflict");
  const groupCount = new Set(rows.map((row) => row.reference_fingerprint)).size;

  if (!loading && !error && rows.length === 0) return null;

  return (
    <section className="bg-[#f5f3ed] px-4 pt-4 text-asphalt sm:px-7 sm:pt-7">
      <div className="mx-auto w-full min-w-0 max-w-6xl border border-route/35 bg-route/5 p-4 sm:p-5" role={rows.length ? "alert" : "status"}>
        {loading && <p className="font-mono text-xs text-steel">Checking external transaction-reference integrity…</p>}
        {!loading && error && (
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[.18em] text-route">REFERENCE INTEGRITY SOURCE FAILED</p>
              <p className="mt-2 break-words text-sm text-route">{error}</p>
              <p className="mt-1 text-xs text-steel">No zero conflict count is shown because the source did not load.</p>
            </div>
            <button type="button" onClick={() => void reload()} className="border border-route px-4 py-3 text-sm font-semibold text-route">Retry check</button>
          </div>
        )}
        {!loading && !error && rows.length > 0 && (
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[.18em] text-route">PAYMENT REFERENCE CONFLICTS</p>
              <h2 className="mt-2 break-words font-display text-xl font-bold">Legacy provider references require Finance review</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-steel">
                {groupCount} normalized reference group{groupCount === 1 ? "" : "s"} contain {conflictRows.length} non-canonical active or historical row{conflictRows.length === 1 ? "" : "s"}. Existing ledger history is preserved; new duplicates are blocked by the database migration.
              </p>
            </div>
            <Link to="/admin/payment-review/reference-conflicts" className="shrink-0 bg-route px-4 py-3 text-center text-sm font-semibold text-white">Review conflict queue</Link>
          </div>
        )}
      </div>
    </section>
  );
}

export function AdminPaymentReferenceConflicts({ fixture }: Props = {}) {
  const { rows, loading, error, reload } = usePaymentReferenceConflicts(fixture);
  const groups = useMemo(() => {
    const grouped = new Map<string, PaymentReferenceConflictRow[]>();
    for (const row of rows) {
      const current = grouped.get(row.reference_fingerprint) ?? [];
      current.push(row);
      grouped.set(row.reference_fingerprint, current);
    }
    return [...grouped.entries()];
  }, [rows]);

  const legacyRows = rows.filter((row) => row.classification === "legacy_conflict").length;
  const activeByGroup = groups.reduce((sum, [, groupRows]) => sum + Number(groupRows[0]?.active_count ?? 0), 0);

  return (
    <main className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#f5f3ed] p-3 text-asphalt sm:p-7">
      <section className="mx-auto w-full min-w-0 max-w-6xl">
        <header className="min-w-0 border border-asphalt/10 bg-asphalt p-4 text-white min-[360px]:p-5 sm:p-8">
          <p className="font-mono text-[10px] tracking-[.22em] text-amber">FINANCE CONTROL · ISSUE #189</p>
          <div className="mt-3 flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <h1 className="break-words font-display text-[clamp(1.75rem,9vw,2.45rem)] font-bold leading-tight">Payment reference conflict queue</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">One external provider transaction must map to one canonical payment. This queue masks references, preserves immutable history and separates canonical, refunded, superseded and legacy-conflict rows.</p>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-2 min-[360px]:grid-cols-2 lg:flex">
              <Link to="/admin/payment-review" className="border border-white/25 px-4 py-3 text-center text-sm font-semibold">← Payment ledger</Link>
              <button type="button" onClick={() => void reload()} className="border border-white/25 px-4 py-3 text-sm font-semibold">↻ Refresh queue</button>
            </div>
          </div>
        </header>

        {error ? (
          <section className="mt-4 border border-route/35 bg-route/5 p-5 text-route">
            <h2 className="font-display text-xl font-bold">Reference conflict source failed</h2>
            <p className="mt-2 break-words text-sm">{error}</p>
            <p className="mt-2 text-xs text-steel">No zero metrics are displayed because the leadership-only source did not load.</p>
          </section>
        ) : loading ? (
          <p className="mt-4 border border-asphalt/10 bg-white p-8 text-center font-mono text-sm text-steel">Loading payment reference conflicts…</p>
        ) : rows.length === 0 ? (
          <section className="mt-4 border border-emerald-700/25 bg-emerald-50 p-6 text-emerald-900">
            <h2 className="font-display text-xl font-bold">No provider-reference conflicts found</h2>
            <p className="mt-2 text-sm">Every non-empty external reference currently maps to one canonical transaction.</p>
          </section>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric label="Conflict groups" value={groups.length} />
              <Metric label="Ledger rows" value={rows.length} />
              <Metric label="Legacy conflicts" value={legacyRows} critical />
              <Metric label="Active rows" value={activeByGroup} critical={activeByGroup > groups.length} />
            </div>

            <section className="mt-4 border border-amber/35 bg-amber/10 p-4 text-sm leading-6">
              <strong>Review rule:</strong> Do not delete or rewrite these rows. Use the audited correction/refund workflow when a real financial reversal is required. The canonical classification is deterministic evidence, not an automatic settlement decision.
            </section>

            <div className="mt-4 grid gap-4">
              {groups.map(([fingerprint, groupRows]) => {
                const first = groupRows[0];
                return (
                  <article key={fingerprint} className="min-w-0 overflow-hidden border border-asphalt/10 bg-white">
                    <div className="grid min-w-0 gap-3 border-b border-asphalt/10 bg-bone p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:p-5">
                      <div className="min-w-0">
                        <p className="font-mono text-[10px] uppercase tracking-[.16em] text-steel">{first.provider.replace(/_/g, " ")} · {first.masked_reference}</p>
                        <p className="mt-2 break-all font-mono text-xs font-semibold">Fingerprint {fingerprint}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-center text-xs">
                        <span className="border border-asphalt/10 bg-white px-3 py-2">{first.order_count} orders</span>
                        <span className="border border-route/25 bg-route/5 px-3 py-2 text-route">{first.active_count} active rows</span>
                      </div>
                    </div>
                    <div className="grid gap-3 p-4 sm:p-5">
                      {groupRows.map((row) => (
                        <div key={row.payment_id} className="grid min-w-0 gap-3 border border-asphalt/10 p-3 min-[390px]:grid-cols-[minmax(0,1fr)_auto] sm:p-4">
                          <div className="min-w-0">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <strong className="break-all font-mono text-xs">{row.tracking_id}</strong>
                              <span className={`border px-2.5 py-1 text-[10px] font-semibold uppercase ${classificationTone(row.classification)}`}>{classificationLabel(row.classification)}</span>
                            </div>
                            <p className="mt-2 text-sm text-steel">ETB <strong className="text-asphalt">{money(row.amount_etb)}</strong> · {row.event.replace(/_/g, " ")} · {new Date(row.created_at).toLocaleString()}</p>
                            <p className="mt-2 break-all text-[10px] text-steel">Payment {row.payment_id} · Canonical {row.canonical_payment_id}</p>
                          </div>
                          <span className="self-start border border-asphalt/10 bg-bone px-3 py-2 text-[10px] font-semibold uppercase text-steel">{row.payment_id === row.canonical_payment_id ? "Primary evidence" : "Review only"}</span>
                        </div>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value, critical = false }: { label: string; value: number; critical?: boolean }) {
  return (
    <div className={`min-w-0 border bg-white p-4 ${critical ? "border-route/35" : "border-asphalt/10"}`}>
      <p className="break-words font-mono text-[9px] uppercase tracking-wide text-steel">{label}</p>
      <p className={`mt-3 font-display text-2xl font-bold ${critical ? "text-route" : "text-asphalt"}`}>{value}</p>
    </div>
  );
}
