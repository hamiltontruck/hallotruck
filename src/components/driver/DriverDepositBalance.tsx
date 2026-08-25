import { useEffect, useState } from "react";
import { supabase } from "../../services/supabase.client";
import { formatEtb } from "../../utils/currency";
import { calculateDriverDepositWallet } from "../../domain/driver-deposit";

type DriverFinancialSummary = {
  admin_deposit_etb: number | string;
  commission_charged_etb: number | string;
  commission_paid_etb: number | string;
  available_deposit_etb: number | string;
  commission_due_etb: number | string;
};

function amount(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function DriverDepositBalance({ fixtureSummary = null }: { fixtureSummary?: DriverFinancialSummary | null } = {}) {
  const [summary, setSummary] = useState<DriverFinancialSummary | null>(fixtureSummary);
  const [error, setError] = useState("");

  useEffect(() => {
    if (fixtureSummary) return;
    let active = true;

    async function load() {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) {
        if (active) setError(authError?.message || "Sign in required.");
        return;
      }

      const { data, error: rpcError } = await supabase.rpc("driver_financial_summary", {
        p_driver_id: auth.user.id,
      });

      if (!active) return;
      if (rpcError) {
        setError(rpcError.message);
        return;
      }

      setSummary((data?.[0] ?? null) as DriverFinancialSummary | null);
      setError("");
    }

    void load();
    return () => { active = false; };
  }, [fixtureSummary]);

  if (error) {
    return <p className="mt-6 border border-route/30 bg-route/5 p-4 text-sm text-route">{error}</p>;
  }

  if (!summary) {
    return <p className="mt-6 border border-line bg-white p-5 text-sm text-steel">Loading deposit balance…</p>;
  }

  const deposited = amount(summary.admin_deposit_etb);
  const wallet = calculateDriverDepositWallet({
    depositedEtb: deposited,
    commissionChargedEtb: amount(summary.commission_charged_etb),
    commissionPaidEtb: amount(summary.commission_paid_etb),
  });
  const deducted = wallet.depositConsumedEtb;
  const available = amount(summary.available_deposit_etb);
  const due = amount(summary.commission_due_etb);

  return <section className="mt-6 border border-line bg-white">
    <div className="border-b border-line bg-asphalt p-5 text-white sm:p-6">
      <p className="font-mono text-[10px] uppercase tracking-[.18em] text-amber">DRIVER DEPOSIT WALLET</p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold">Available deposit balance</h2>
          <p className="mt-2 max-w-xl text-xs leading-5 text-white/60">Verified HALLO Smart commission is deducted automatically from your Admin-recorded deposit.</p>
        </div>
        <p className="font-display text-3xl font-bold text-amber">{formatEtb(available)}</p>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
      <Metric label="Deposit total" value={formatEtb(deposited)} />
      <Metric label="Commission deducted" value={formatEtb(deducted)} />
      <Metric label="Available balance" value={formatEtb(available)} strong />
      <Metric label="Commission due" value={formatEtb(due)} alert={due > 0} />
    </div>
  </section>;
}

function Metric({ label, value, strong = false, alert = false }: { label: string; value: string; strong?: boolean; alert?: boolean }) {
  return <div className="bg-white p-4 sm:p-5">
    <p className="text-[10px] uppercase tracking-wide text-steel">{label}</p>
    <p className={`mt-2 font-display text-lg font-bold ${alert ? "text-route" : strong ? "text-emerald-800" : "text-asphalt"}`}>{value}</p>
  </div>;
}
