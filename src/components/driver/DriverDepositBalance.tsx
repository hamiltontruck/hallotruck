import { useCallback } from "react";
import type { HalloLanguage } from "../../i18n/LanguageProvider";
import { supabase } from "../../services/supabase.client";
import {
  DriverDepositBalanceState,
  type DriverFinancialSummary,
} from "./DriverDepositBalanceState";

const SUMMARY_FIELDS = [
  "admin_deposit_etb",
  "commission_charged_etb",
  "commission_paid_etb",
  "available_deposit_etb",
  "commission_due_etb",
] as const;

function normalizeSummary(row: unknown): DriverFinancialSummary | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  const normalized: Record<string, number> = {};

  for (const field of SUMMARY_FIELDS) {
    const value = Number(record[field]);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Driver financial summary returned an invalid ${field} value.`);
    }
    normalized[field] = value;
  }

  return normalized as DriverFinancialSummary;
}

export async function loadDriverDepositSummary(): Promise<DriverFinancialSummary | null> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(authError.message);
  if (!auth.user) throw new Error("Sign in required.");

  const { data, error } = await supabase.rpc("driver_financial_summary", {
    p_driver_id: auth.user.id,
  });
  if (error) throw new Error(error.message);

  const row = Array.isArray(data) ? data[0] : data;
  return normalizeSummary(row);
}

function subscribeToDriverDepositChanges(onChange: () => void) {
  let active = true;
  let channel: ReturnType<typeof supabase.channel> | null = null;

  void supabase.auth.getUser().then(({ data: auth, error }) => {
    if (!active || error || !auth.user) return;
    const filter = `driver_id=eq.${auth.user.id}`;

    channel = supabase
      .channel(`driver-deposit-balance-${auth.user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_commission_deposits", filter }, () => onChange())
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_commission_charges", filter }, () => onChange())
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_payment_confirmations", filter }, () => onChange())
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_commission_payments", filter }, () => onChange())
      .subscribe();
  });

  return () => {
    active = false;
    if (channel) void supabase.removeChannel(channel);
  };
}

export function DriverDepositBalance({
  fixtureSummary = null,
  language = "en",
}: {
  fixtureSummary?: DriverFinancialSummary | null;
  language?: HalloLanguage;
} = {}) {
  const hasFixture = fixtureSummary !== null;
  const loadSummary = useCallback(
    () => hasFixture
      ? Promise.resolve(fixtureSummary as DriverFinancialSummary)
      : loadDriverDepositSummary(),
    [fixtureSummary, hasFixture],
  );
  const subscribe = useCallback(
    (onChange: () => void) => hasFixture ? () => undefined : subscribeToDriverDepositChanges(onChange),
    [hasFixture],
  );

  return (
    <DriverDepositBalanceState
      language={language}
      loadSummary={loadSummary}
      subscribe={subscribe}
      initialSummary={hasFixture ? fixtureSummary : undefined}
      loadOnMount={!hasFixture}
    />
  );
}
