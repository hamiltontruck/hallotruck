import { supabase } from "./supabase.client";
import type { TripCompletionSummary, TripPaymentState } from "../domain/trip-completion";

interface TripCompletionRow extends Omit<TripCompletionSummary,
  | "invoice_total_etb"
  | "initiated_etb"
  | "held_escrow_etb"
  | "released_etb"
  | "refunded_etb"
  | "verified_net_etb"
  | "balance_due_etb"
  | "commission_charged_etb"
  | "payment_state"
> {
  invoice_total_etb: number | string;
  initiated_etb: number | string;
  held_escrow_etb: number | string;
  released_etb: number | string;
  refunded_etb: number | string;
  verified_net_etb: number | string;
  balance_due_etb: number | string;
  commission_charged_etb: number | string;
  payment_state: TripPaymentState;
}

export async function getTripCompletionSummary(orderId: string): Promise<TripCompletionSummary> {
  const { data, error } = await supabase.rpc("trip_completion_summary", {
    p_order_id: orderId,
  });
  if (error) throw new Error(error.message);

  const row = (data?.[0] ?? null) as TripCompletionRow | null;
  if (!row) throw new Error("Trip completion status is unavailable.");

  return {
    ...row,
    invoice_total_etb: Number(row.invoice_total_etb),
    initiated_etb: Number(row.initiated_etb),
    held_escrow_etb: Number(row.held_escrow_etb),
    released_etb: Number(row.released_etb),
    refunded_etb: Number(row.refunded_etb),
    verified_net_etb: Number(row.verified_net_etb),
    balance_due_etb: Number(row.balance_due_etb),
    commission_charged_etb: Number(row.commission_charged_etb),
  };
}
