import { supabase } from "./supabase.client";
import { reversePartnerSettlement, type FinancialCorrection } from "./financial-correction.service";
import type {
  PartnerSettlementPaymentMethod,
  PartnerSettlementStatus,
} from "../domain/partner-settlement";

export type { FinancialCorrection } from "./financial-correction.service";

export type PartnerWalletSummary = {
  gross_etb: number | string;
  hallo_commission_etb: number | string;
  partner_net_etb: number | string;
  pending_settlement_etb: number | string;
  paid_settlement_etb: number | string;
  payable_etb: number | string;
  fleet_total: number | string;
  fleet_available: number | string;
  hallo_freight_count: number | string;
};

export type PartnerCommissionRule = {
  id: string;
  partner_id: string;
  commission_type: "percentage" | "fixed";
  commission_value: number | string;
  effective_from: string;
  effective_to: string | null;
  active: boolean;
};

export type PartnerFleetVehicle = {
  id: string;
  partner_id: string;
  plate_number: string;
  vehicle_type: string;
  capacity_tons: number | string | null;
  status: "available" | "assigned" | "maintenance" | "inactive";
};

export type PartnerFreightEarning = {
  id: string;
  partner_id: string;
  project_id: string | null;
  order_id: string;
  vehicle_id: string | null;
  gross_etb: number | string;
  commission_type: string;
  commission_value: number | string;
  hallo_commission_etb: number | string;
  partner_net_etb: number | string;
  status: "accrued" | "settled" | "reversed";
  accrued_at: string;
};

export type PartnerSettlement = {
  id: string;
  partner_id: string;
  project_id: string | null;
  settlement_reference: string;
  request_key: string;
  amount_etb: number | string;
  status: PartnerSettlementStatus;
  provider: string | null;
  transaction_ref: string | null;
  note: string | null;
  approval_notes: string | null;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  paid_at: string | null;
  created_at: string;
};

export type PartnerSettlementPayment = {
  id: string;
  request_key: string;
  settlement_id: string;
  partner_id: string;
  amount_etb: number | string;
  payment_method: PartnerSettlementPaymentMethod;
  provider: string | null;
  transaction_ref: string;
  paid_at: string;
  recorded_by: string;
  created_at: string;
};

export type PartnerSettlementEvent = {
  id: number | string;
  settlement_id: string;
  partner_id: string;
  event_type: string;
  from_status: string | null;
  to_status: PartnerSettlementStatus;
  amount_etb: number | string | null;
  reason: string | null;
  actor_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type PartnerFinanceProject = {
  id: string;
  partner_id: string;
  name: string;
  status: string;
};

export async function loadPartnerFinance(partnerId: string) {
  const [summary, rules, fleet, projects, earnings, settlements, settlementPayments, settlementEvents, corrections] = await Promise.all([
    supabase.rpc("partner_wallet_summary", { p_partner_id: partnerId }),
    supabase.from("partner_commission_rules").select("*").eq("partner_id", partnerId).order("effective_from", { ascending: false }),
    supabase.from("partner_fleet_vehicles").select("*").eq("partner_id", partnerId).order("plate_number"),
    supabase.from("partner_projects").select("id,partner_id,name,status").eq("partner_id", partnerId).order("name"),
    supabase.from("partner_freight_earnings").select("*").eq("partner_id", partnerId).order("accrued_at", { ascending: false }).limit(500),
    supabase.from("partner_settlements").select("*").eq("partner_id", partnerId).order("created_at", { ascending: false }).limit(500),
    supabase.from("partner_settlement_payments").select("*").eq("partner_id", partnerId).order("paid_at", { ascending: false }).limit(1000),
    supabase.from("partner_settlement_events").select("*").eq("partner_id", partnerId).order("created_at", { ascending: false }).limit(1000),
    supabase.from("financial_corrections").select("*").eq("partner_id", partnerId).order("created_at", { ascending: false }).limit(500),
  ]);
  const failure = [summary, rules, fleet, projects, earnings, settlements, settlementPayments, settlementEvents, corrections].find((result) => result.error)?.error;
  if (failure) throw failure;
  return {
    summary: (summary.data?.[0] ?? null) as PartnerWalletSummary | null,
    rules: (rules.data ?? []) as PartnerCommissionRule[],
    fleet: (fleet.data ?? []) as PartnerFleetVehicle[],
    projects: (projects.data ?? []) as PartnerFinanceProject[],
    earnings: (earnings.data ?? []) as PartnerFreightEarning[],
    settlements: (settlements.data ?? []) as PartnerSettlement[],
    settlementPayments: (settlementPayments.data ?? []) as PartnerSettlementPayment[],
    settlementEvents: (settlementEvents.data ?? []) as PartnerSettlementEvent[],
    corrections: (corrections.data ?? []) as FinancialCorrection[],
  };
}

export async function createCommissionRule(partnerId: string, commissionType: "percentage" | "fixed", commissionValue: number) {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new Error("Admin session expired.");
  const { error: deactivateError } = await supabase.from("partner_commission_rules").update({ active: false }).eq("partner_id", partnerId).eq("active", true);
  if (deactivateError) throw deactivateError;
  const { error } = await supabase.from("partner_commission_rules").insert({ partner_id: partnerId, commission_type: commissionType, commission_value: commissionValue, created_by: userId });
  if (error) throw error;
}

export async function addPartnerVehicle(partnerId: string, plateNumber: string, vehicleType: string, capacityTons: number | null) {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new Error("Admin session expired.");
  const { error } = await supabase.from("partner_fleet_vehicles").insert({ partner_id: partnerId, plate_number: plateNumber.trim().toUpperCase(), vehicle_type: vehicleType.trim(), capacity_tons: capacityTons, created_by: userId });
  if (error) throw error;
}

export async function recordPartnerFreight(partnerId: string, orderId: string, vehicleId: string | null, projectId: string | null) {
  const { error } = await supabase.rpc("admin_record_partner_freight", {
    p_partner_id: partnerId,
    p_order_id: orderId,
    p_vehicle_id: vehicleId,
    p_project_id: projectId,
  });
  if (error) throw error;
}

export async function createPartnerSettlement(partnerId: string, amountEtb: number, projectId: string | null, note: string) {
  const { error } = await supabase.rpc("admin_create_partner_settlement_request", {
    p_partner_id: partnerId,
    p_amount_etb: amountEtb,
    p_project_id: projectId,
    p_note: note,
    p_request_key: crypto.randomUUID(),
  });
  if (error) throw error;
}

export async function transitionPartnerSettlement(settlementId: string, action: "submit_review" | "approve" | "reject", notes: string) {
  const { error } = await supabase.rpc("admin_transition_partner_settlement", {
    p_settlement_id: settlementId,
    p_action: action,
    p_notes: notes,
  });
  if (error) throw error;
}

export async function recordPartnerSettlementPayment(input: {
  settlementId: string;
  amountEtb: number;
  paymentMethod: PartnerSettlementPaymentMethod;
  provider: string;
  transactionRef: string;
  paidAt: string;
}) {
  const { error } = await supabase.rpc("admin_record_partner_settlement_payment", {
    p_settlement_id: input.settlementId,
    p_amount_etb: input.amountEtb,
    p_payment_method: input.paymentMethod,
    p_provider: input.provider,
    p_transaction_ref: input.transactionRef,
    p_paid_at: input.paidAt,
    p_request_key: crypto.randomUUID(),
  });
  if (error) throw error;
}

export async function reversePaidPartnerSettlement(settlementId: string, reason: string) {
  await reversePartnerSettlement(settlementId, reason);
}
