import { supabase } from "./supabase.client";

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
  amount_etb: number | string;
  status: "pending" | "paid" | "rejected" | "reversed";
  provider: string | null;
  transaction_ref: string | null;
  note: string | null;
  paid_at: string | null;
  created_at: string;
};

export async function loadPartnerFinance(partnerId: string) {
  const [summary, rules, fleet, earnings, settlements] = await Promise.all([
    supabase.rpc("partner_wallet_summary", { p_partner_id: partnerId }),
    supabase.from("partner_commission_rules").select("*").eq("partner_id", partnerId).order("effective_from", { ascending: false }),
    supabase.from("partner_fleet_vehicles").select("*").eq("partner_id", partnerId).order("plate_number"),
    supabase.from("partner_freight_earnings").select("*").eq("partner_id", partnerId).order("accrued_at", { ascending: false }).limit(500),
    supabase.from("partner_settlements").select("*").eq("partner_id", partnerId).order("created_at", { ascending: false }).limit(500),
  ]);
  const failure = [summary, rules, fleet, earnings, settlements].find((result) => result.error)?.error;
  if (failure) throw failure;
  return {
    summary: (summary.data?.[0] ?? null) as PartnerWalletSummary | null,
    rules: (rules.data ?? []) as PartnerCommissionRule[],
    fleet: (fleet.data ?? []) as PartnerFleetVehicle[],
    earnings: (earnings.data ?? []) as PartnerFreightEarning[],
    settlements: (settlements.data ?? []) as PartnerSettlement[],
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

export async function recordPartnerFreight(partnerId: string, orderId: string, vehicleId: string | null) {
  const { error } = await supabase.rpc("admin_record_partner_freight", { p_partner_id: partnerId, p_order_id: orderId, p_vehicle_id: vehicleId });
  if (error) throw error;
}

export async function createPartnerSettlement(partnerId: string, amountEtb: number, provider: string, transactionRef: string, note: string) {
  const { error } = await supabase.rpc("admin_create_partner_settlement", { p_partner_id: partnerId, p_amount_etb: amountEtb, p_provider: provider, p_transaction_ref: transactionRef, p_note: note });
  if (error) throw error;
}

export async function markPartnerSettlementPaid(settlementId: string) {
  const { error } = await supabase.rpc("admin_mark_partner_settlement_paid", { p_settlement_id: settlementId });
  if (error) throw error;
}
