import { supabase } from "./supabase.client";

export type PaymentCorrectionType =
  | "full_refund"
  | "partial_refund"
  | "duplicate"
  | "invalidated"
  | "cancelled_order";

export type FinancialCorrection = {
  id: string;
  request_key: string;
  correction_type: PaymentCorrectionType | "reversed_settlement";
  source_payment_id: string | null;
  refund_payment_id: string | null;
  partner_earning_id: string | null;
  partner_settlement_id: string | null;
  order_id: string | null;
  driver_id: string | null;
  partner_id: string | null;
  amount_etb: number | string;
  driver_commission_reversal_etb: number | string;
  partner_gross_reversal_etb: number | string;
  partner_commission_reversal_etb: number | string;
  partner_net_reversal_etb: number | string;
  reason: string;
  actor_id: string;
  created_at: string;
};

function correctionRequestKey() {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("This browser cannot create a secure correction request key. Update the browser and try again.");
  }
  return globalThis.crypto.randomUUID();
}

export async function reversePayment(input: {
  paymentId: string;
  amountEtb: number;
  reason: string;
  correctionType: PaymentCorrectionType;
}) {
  const { data, error } = await supabase.rpc("admin_reverse_payment", {
    p_payment_id: input.paymentId,
    p_amount_etb: input.amountEtb,
    p_reason: input.reason.trim(),
    p_correction_type: input.correctionType,
    p_request_key: correctionRequestKey(),
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function reversePartnerSettlement(settlementId: string, reason: string) {
  const { data, error } = await supabase.rpc("admin_reverse_partner_settlement", {
    p_settlement_id: settlementId,
    p_reason: reason.trim(),
    p_request_key: correctionRequestKey(),
  });
  if (error) throw new Error(error.message);
  return String(data);
}
