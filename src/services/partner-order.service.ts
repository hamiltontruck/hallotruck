import { supabase } from "./supabase.client";

export type PartnerOrderStatus = "draft" | "submitted" | "under_review" | "quoted" | "approved" | "placed" | "assigned" | "accepted" | "in_transit" | "delivered" | "completed" | "cancelled" | "rejected" | "expired";
export type PartnerOrderLocation = { country: string; region: string; city: string; address: string; latitude?: number | null; longitude?: number | null };
export type PartnerOrderContact = { name: string; phone: string; email?: string };
export type PartnerOrderPayload = {
  pickup_location: PartnerOrderLocation;
  dropoff_location: PartnerOrderLocation;
  cargo: { category: string; description: string; weight_tons: number; quantity: number; fragile: boolean; hazardous: boolean; temperature_controlled: boolean; handling_instructions?: string };
  vehicle_requirements: { truck_type: string; required_capacity_tons: number; body_type?: string; refrigeration_required: boolean; special_equipment?: string };
  schedule: { pickup_date: string; pickup_time?: string; delivery_deadline?: string; priority: string };
  pickup_contact: PartnerOrderContact;
  delivery_contact: PartnerOrderContact;
  pricing: { state: "pending_calculation" | "manual_quote_required" | "quoted" | "approved" | "rejected" | "expired"; currency?: "ETB"; quoted_amount_etb?: number; quote_expires_at?: string; quote_version?: number };
  payment: { method: string; status: "unpaid" };
  partner_notes?: string;
};

export type PartnerOrder = PartnerOrderPayload & {
  id: string;
  partner_id: string;
  canonical_order_id: string | null;
  reference: string;
  status: PartnerOrderStatus;
  admin_notes: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  quoted_at: string | null;
  quoted_by: string | null;
  quote_amount_etb: number | null;
  quote_expires_at: string | null;
  quote_version: number;
  approved_at: string | null;
  rejected_at: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  partner_organizations?: { name: string; code: string } | null;
};

export type PartnerOrderHistory = { id: number; from_status: string | null; to_status: string; actor_id: string; reason: string | null; created_at: string };

function compactPhone(value: string) {
  const phone = value.trim().replace(/[\s()-]/g, "");
  if (/^(?:\+251|251|0)?9\d{8}$/.test(phone)) {
    if (phone.startsWith("+251")) return `0${phone.slice(4)}`;
    if (phone.startsWith("251")) return `0${phone.slice(3)}`;
    return phone.startsWith("9") ? `0${phone}` : phone;
  }
  if (/^\+[1-9]\d{7,14}$/.test(phone)) return phone;
  throw new Error("Enter a valid Ethiopian mobile number or international number with country code.");
}

function normalizeContact(contact: PartnerOrderContact) {
  const email = contact.email?.trim().toLowerCase() ?? "";
  if (email && !/^[^\s@]{1,64}@[^\s@.]{1,190}\.[A-Za-z]{2,63}$/.test(email)) throw new Error("Enter a valid contact email address.");
  return { name: contact.name.trim(), phone: compactPhone(contact.phone), ...(email ? { email } : {}) };
}

export async function listPartnerOrders(partnerId: string) {
  const { data, error } = await supabase.from("partner_orders").select("*").eq("partner_id", partnerId).order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PartnerOrder[];
}

export async function listAdminPartnerOrders() {
  const { data, error } = await supabase
    .from("partner_orders")
    .select("*,partner_organizations(name,code)")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PartnerOrder[];
}

export async function getPartnerOrder(orderId: string) {
  const [order, history] = await Promise.all([
    supabase.from("partner_orders").select("*").eq("id", orderId).single(),
    supabase.from("partner_order_status_history").select("id,from_status,to_status,actor_id,reason,created_at").eq("partner_order_id", orderId).order("created_at", { ascending: true }),
  ]);
  if (order.error) throw order.error;
  if (history.error) throw history.error;
  return { order: order.data as PartnerOrder, history: (history.data ?? []) as PartnerOrderHistory[] };
}

export async function savePartnerOrderDraft(partnerId: string, payload: PartnerOrderPayload, orderId?: string) {
  const normalized = { ...payload, pickup_contact: normalizeContact(payload.pickup_contact), delivery_contact: normalizeContact(payload.delivery_contact) };
  const { data, error } = await supabase.rpc("partner_save_order_draft", { p_partner_id: partnerId, p_order_id: orderId ?? null, p_payload: normalized, p_request_key: crypto.randomUUID() });
  if (error) throw error;
  if (!data) throw new Error("Partner order draft was not returned.");
  return data as PartnerOrder;
}

export async function submitPartnerOrder(orderId: string) {
  const { data, error } = await supabase.rpc("partner_submit_order", { p_order_id: orderId, p_reason: "Submitted by Partner for HALLO review", p_request_key: crypto.randomUUID() });
  if (error) throw error;
  if (!data) throw new Error("Submitted Partner order was not returned.");
  return data as PartnerOrder;
}

export async function startPartnerOrderReview(orderId: string, adminNotes: string) {
  const { data, error } = await supabase.rpc("admin_start_partner_order_review", {
    p_order_id: orderId,
    p_admin_notes: adminNotes.trim() || null,
    p_request_key: crypto.randomUUID(),
  });
  if (error) throw error;
  if (!data) throw new Error("Partner order review state was not returned.");
  return data as PartnerOrder;
}

export async function quotePartnerOrder(orderId: string, amountEtb: number, expiresAt: string, adminNotes: string) {
  if (!Number.isFinite(amountEtb) || amountEtb <= 0) throw new Error("Quote amount must be greater than zero.");
  if (!expiresAt || Number.isNaN(new Date(expiresAt).getTime())) throw new Error("Choose a valid quote expiry.");
  const { data, error } = await supabase.rpc("admin_quote_partner_order", {
    p_order_id: orderId,
    p_quote_amount_etb: amountEtb,
    p_quote_expires_at: new Date(expiresAt).toISOString(),
    p_admin_notes: adminNotes.trim() || null,
    p_request_key: crypto.randomUUID(),
  });
  if (error) throw error;
  if (!data) throw new Error("Quoted Partner order was not returned.");
  return data as PartnerOrder;
}

export async function respondToPartnerOrderQuote(orderId: string, action: "accept" | "reject", reason = "") {
  const { data, error } = await supabase.rpc("partner_respond_to_order_quote", {
    p_order_id: orderId,
    p_action: action,
    p_reason: reason.trim() || null,
    p_request_key: crypto.randomUUID(),
  });
  if (error) throw error;
  if (!data) throw new Error("Partner quote response was not returned.");
  return data as PartnerOrder;
}
