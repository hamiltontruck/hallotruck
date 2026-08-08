import { supabase } from "./supabase.client";

export interface CustomerOrder {
  id: string;
  tracking_id: string;
  pickup_address: string;
  dropoff_address: string;
  vehicle_type: string;
  distance_km: number | null;
  price_etb: number | null;
  status: string;
  payment_status: string;
  payment_provider: string | null;
  payment_ref: string | null;
  created_at: string;
}

export interface CustomerProof {
  order_id: string;
  recipient_name: string;
  delivery_note: string | null;
  photo_path: string;
  signature_path: string;
  delivered_at: string;
}

export interface CustomerPayment {
  id: string;
  order_id: string;
  provider: string;
  provider_ref: string | null;
  amount_etb: number;
  event: string;
  created_at: string;
}

export interface CustomerPortalData {
  orders: CustomerOrder[];
  proofs: CustomerProof[];
  payments: CustomerPayment[];
}

const vehicleRates: Record<string, number> = {
  pickup: 48,
  van: 58,
  "dry cargo": 72,
  refrigerated: 92,
  trailer: 110,
};

export function calculateQuote(distanceKm: number, vehicleType: string) {
  const rate = vehicleRates[vehicleType.toLowerCase()] ?? 72;
  return Math.max(1500, Math.round((distanceKm * rate + 900) / 50) * 50);
}

export async function getCustomerPortalData(): Promise<CustomerPortalData> {
  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, tracking_id, pickup_address, dropoff_address, vehicle_type, distance_km, price_etb, status, payment_status, payment_provider, payment_ref, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const ids = (orders ?? []).map((order) => order.id);
  if (!ids.length) return { orders: [], proofs: [], payments: [] };

  const [proofResult, paymentResult] = await Promise.all([
    supabase
      .from("delivery_proofs")
      .select("order_id, recipient_name, delivery_note, photo_path, signature_path, delivered_at")
      .in("order_id", ids),
    supabase
      .from("payments")
      .select("id, order_id, provider, provider_ref, amount_etb, event, created_at")
      .in("order_id", ids)
      .order("created_at", { ascending: false }),
  ]);

  if (proofResult.error) throw new Error(proofResult.error.message);
  if (paymentResult.error) throw new Error(paymentResult.error.message);

  return {
    orders: orders ?? [],
    proofs: proofResult.data ?? [],
    payments: paymentResult.data ?? [],
  };
}

export async function createCustomerOrder(input: {
  pickupAddress: string;
  dropoffAddress: string;
  vehicleType: string;
  distanceKm: number;
  pickup: [number, number];
  dropoff: [number, number];
}) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Customer session expired.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone")
    .eq("id", auth.user.id)
    .single();

  const trackingId = `HT-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const priceEtb = calculateQuote(input.distanceKm, input.vehicleType);

  const { error } = await supabase.from("orders").insert({
    tracking_id: trackingId,
    customer_id: auth.user.id,
    customer_name: profile?.full_name ?? auth.user.email ?? "Customer",
    customer_phone: profile?.phone ?? "",
    pickup_address: input.pickupAddress.trim(),
    pickup: `POINT(${input.pickup[0]} ${input.pickup[1]})`,
    dropoff_address: input.dropoffAddress.trim(),
    dropoff: `POINT(${input.dropoff[0]} ${input.dropoff[1]})`,
    vehicle_type: input.vehicleType,
    distance_km: input.distanceKm,
    price_etb: priceEtb,
    status: "placed",
  });
  if (error) throw new Error(error.message);

  return { trackingId, priceEtb };
}

export async function submitCustomerPayment(input: {
  orderId: string;
  provider: string;
  providerRef: string;
  amountEtb: number;
}) {
  const { error } = await supabase.rpc("customer_submit_payment", {
    p_order_id: input.orderId,
    p_provider: input.provider,
    p_provider_ref: input.providerRef,
    p_amount_etb: input.amountEtb,
  });
  if (error) throw new Error(error.message);
}

export function printCustomerInvoice(order: CustomerOrder, payments: CustomerPayment[]) {
  const safe = (value: unknown) => String(value ?? "—").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[character] ?? character));
  const released = payments
    .filter((payment) => payment.order_id === order.id && payment.event === "released")
    .reduce((sum, payment) => sum + Number(payment.amount_etb || 0), 0);
  const refundedCredit = payments
    .filter((payment) => payment.order_id === order.id && payment.event === "refunded" && payment.provider === "credit_refund")
    .reduce((sum, payment) => sum + Number(payment.amount_etb || 0), 0);
  const verified = Math.max(0, released - refundedCredit);
  const pending = payments
    .filter((payment) => payment.order_id === order.id && ["initiated", "held_escrow"].includes(payment.event))
    .reduce((sum, payment) => sum + Number(payment.amount_etb || 0), 0);
  const total = Number(order.price_etb ?? 0);
  const balance = Math.max(0, total - verified);
  const refundRow = refundedCredit > 0
    ? `<div class="row refund"><b>Credit refunded</b><span>ETB ${refundedCredit.toLocaleString()}</span></div>`
    : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safe(order.tracking_id)} invoice</title><style>body{font:14px Arial;color:#1d222a;padding:24px;max-width:760px;margin:auto}h1{font-size:28px}.brand{color:#d68e25}.row{display:flex;gap:20px;justify-content:space-between;border-bottom:1px solid #ddd;padding:12px 0}.row span{text-align:right}.total{font-size:20px;font-weight:bold}.muted{color:#68707c}.pending{color:#9b6418}.refund{color:#256b4a;background:#eefbf4;padding-left:10px;padding-right:10px}button{width:100%;border:0;background:#1d222a;color:white;padding:15px;margin-top:24px;font-weight:bold}@media(max-width:480px){body{padding:18px}.row{display:block}.row span{display:block;text-align:left;margin-top:6px}}@media print{button{display:none}body{padding:0}}</style></head><body><h1>HALLO<span class="brand">TRUCK</span></h1><p class="muted">Customer logistics invoice / receipt</p><div class="row"><b>Tracking</b><span>${safe(order.tracking_id)}</span></div><div class="row"><b>Route</b><span>${safe(order.pickup_address)} → ${safe(order.dropoff_address)}</span></div><div class="row"><b>Vehicle</b><span>${safe(order.vehicle_type)}</span></div><div class="row"><b>Order status</b><span>${safe(order.status.replace("_", " "))}</span></div><div class="row total"><b>Invoice total</b><span>ETB ${total.toLocaleString()}</span></div><div class="row"><b>Verified paid</b><span>ETB ${verified.toLocaleString()}</span></div>${refundRow}<div class="row pending"><b>Pending verification</b><span>ETB ${pending.toLocaleString()}</span></div><div class="row total"><b>Balance</b><span>ETB ${balance.toLocaleString()}</span></div><p class="muted">Generated ${safe(new Date().toLocaleString())}</p><button type="button" onclick="window.print()">Print / Save as PDF</button></body></html>`;
  const popup = window.open("about:blank", "_blank");
  if (!popup) throw new Error("Allow pop-ups to generate the PDF.");
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.opener = null;
}

export async function openCustomerProof(path: string) {
  const { data, error } = await supabase.storage.from("delivery-proofs").createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}
