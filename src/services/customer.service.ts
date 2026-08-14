import { supabase } from "./supabase.client";
import { calculatePaymentSummary } from "../utils/paymentSummary";

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
  receipt_path: string | null;
  created_at: string;
}

export interface CustomerDriverAssignment {
  order_id: string;
  driver_name: string;
  driver_phone: string;
  driver_verified: boolean;
  license_verified: boolean;
  national_id_verified: boolean;
  plate_number: string | null;
  vehicle_type: string | null;
  capacity_tons: number | null;
  truck_photo_path: string | null;
  driver_photo_path?: string | null;
}

export interface CustomerProfile {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  home_address: string | null;
  customer_type: "individual" | "business";
  company_name: string | null;
  created_at: string;
}

export interface CustomerPortalData {
  orders: CustomerOrder[];
  proofs: CustomerProof[];
  payments: CustomerPayment[];
  assignments: CustomerDriverAssignment[];
  profile: CustomerProfile | null;
}

const vehicleRates: Record<string, number> = {
  pickup: 48,
  van: 58,
  "dry cargo": 72,
  refrigerated: 92,
  trailer: 110,
};

const allowedReceiptTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export function calculateQuote(distanceKm: number, vehicleType: string) {
  const rate = vehicleRates[vehicleType.toLowerCase()] ?? 72;
  return Math.max(1500, Math.round((distanceKm * rate + 900) / 50) * 50);
}

export async function getCustomerPortalData(): Promise<CustomerPortalData> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Customer session expired.");

  const [ordersResult, profileResult] = await Promise.all([
    supabase
      .from("orders")
      .select("id, tracking_id, pickup_address, dropoff_address, vehicle_type, distance_km, price_etb, status, payment_status, payment_provider, payment_ref, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("id,full_name,phone,email,home_address,customer_type,company_name,created_at")
      .eq("id", auth.user.id)
      .maybeSingle(),
  ]);

  if (ordersResult.error) throw new Error(ordersResult.error.message);
  if (profileResult.error) throw new Error(profileResult.error.message);

  const orders = ordersResult.data ?? [];
  const profile = (profileResult.data ?? null) as CustomerProfile | null;
  const ids = orders.map((order) => order.id);
  if (!ids.length) return { orders: [], proofs: [], payments: [], assignments: [], profile };

  const [proofResult, paymentResult, assignmentResult] = await Promise.all([
    supabase
      .from("delivery_proofs")
      .select("order_id, recipient_name, delivery_note, photo_path, signature_path, delivered_at")
      .in("order_id", ids),
    supabase
      .from("payments")
      .select("id, order_id, provider, provider_ref, amount_etb, event, receipt_path, created_at")
      .in("order_id", ids)
      .order("created_at", { ascending: false }),
    supabase.rpc("customer_driver_assignment_cards"),
  ]);

  if (proofResult.error) throw new Error(proofResult.error.message);
  if (paymentResult.error) throw new Error(paymentResult.error.message);

  return {
    orders,
    proofs: proofResult.data ?? [],
    payments: paymentResult.data ?? [],
    assignments: assignmentResult.error ? [] : ((assignmentResult.data ?? []) as CustomerDriverAssignment[]),
    profile,
  };
}

export async function updateCustomerProfile(input: {
  fullName: string;
  phone: string;
  email: string;
  homeAddress: string;
  customerType: "individual" | "business";
  companyName: string;
}) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Customer session expired.");

  const fullName = input.fullName.trim();
  const phone = input.phone.trim();
  const email = input.email.trim();
  const homeAddress = input.homeAddress.trim();
  const companyName = input.companyName.trim();

  if (fullName.length < 2) throw new Error("Enter your full name.");
  if (!/^(09\d{8}|\+2519\d{8})$/.test(phone)) throw new Error("Phone must be 09xxxxxxxx or +2519xxxxxxxx.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  if (input.customerType === "business" && !companyName) throw new Error("Company name is required for a business account.");

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      phone,
      email: email || null,
      home_address: homeAddress || null,
      customer_type: input.customerType,
      company_name: input.customerType === "business" ? companyName : null,
    })
    .eq("id", auth.user.id);

  if (error) throw new Error(error.message);
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
  receipt: File;
}) {
  if (!allowedReceiptTypes.has(input.receipt.type)) throw new Error("Receipt must be JPG, PNG, WebP or PDF.");
  if (input.receipt.size > 10 * 1024 * 1024) throw new Error("Receipt must be 10 MB or smaller.");

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Customer session expired.");

  const extension = input.receipt.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || (input.receipt.type === "application/pdf" ? "pdf" : "jpg");
  const receiptPath = `${auth.user.id}/${input.orderId}/${crypto.randomUUID()}.${extension}`;

  const upload = await supabase.storage.from("payment-receipts").upload(receiptPath, input.receipt, {
    contentType: input.receipt.type,
    upsert: false,
  });
  if (upload.error) throw new Error(upload.error.message);

  try {
    const { error } = await supabase.rpc("customer_submit_payment", {
      p_order_id: input.orderId,
      p_provider: input.provider,
      p_provider_ref: input.providerRef.trim(),
      p_amount_etb: input.amountEtb,
      p_receipt_path: receiptPath,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    await supabase.storage.from("payment-receipts").remove([receiptPath]);
    throw error;
  }
}

export async function openCustomerPaymentReceipt(path: string) {
  const { data, error } = await supabase.storage.from("payment-receipts").createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

export function printCustomerInvoice(order: CustomerOrder, payments: CustomerPayment[]) {
  const safe = (value: unknown) => String(value ?? "—").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[character] ?? character));

  const orderPayments = payments.filter((payment) => payment.order_id === order.id);
  const summary = calculatePaymentSummary(order.price_etb, orderPayments);
  const releasedNet = Math.max(0, summary.releasedGross - summary.refunded);

  const heldRow = summary.heldEscrow > 0
    ? `<div class="row escrow"><b>Held in escrow</b><span>ETB ${summary.heldEscrow.toLocaleString()}</span></div>`
    : "";
  const releasedRow = releasedNet > 0
    ? `<div class="row"><b>Released from escrow</b><span>ETB ${releasedNet.toLocaleString()}</span></div>`
    : "";
  const pendingRow = summary.pendingVerification > 0
    ? `<div class="row pending"><b>Pending verification</b><span>ETB ${summary.pendingVerification.toLocaleString()}</span></div>`
    : "";
  const refundRow = summary.refunded > 0
    ? `<div class="row refund"><b>Refunded</b><span>ETB ${summary.refunded.toLocaleString()}</span></div>`
    : "";
  const creditRow = summary.customerCredit > 0
    ? `<div class="row credit"><b>Customer credit</b><span>ETB ${summary.customerCredit.toLocaleString()}</span></div>`
    : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safe(order.tracking_id)} invoice</title><style>body{font:14px Arial;color:#1d222a;padding:24px;max-width:760px;margin:auto}h1{font-size:28px}.brand{color:#d68e25}.row{display:flex;gap:20px;justify-content:space-between;border-bottom:1px solid #ddd;padding:12px 0}.row span{text-align:right}.total{font-size:20px;font-weight:bold}.muted{color:#68707c}.pending{color:#9b6418}.escrow{color:#8a5f1b;background:#fff8e8;padding-left:10px;padding-right:10px}.refund{color:#256b4a;background:#eefbf4;padding-left:10px;padding-right:10px}.credit{color:#256b4a;background:#eefbf4;padding-left:10px;padding-right:10px}button{width:100%;border:0;background:#1d222a;color:white;padding:15px;margin-top:24px;font-weight:bold}@media(max-width:480px){body{padding:18px}.row{display:block}.row span{display:block;text-align:left;margin-top:6px}}@media print{button{display:none}body{padding:0}}</style></head><body><h1>HALLO<span class="brand">TRUCK</span></h1><p class="muted">Customer logistics invoice / receipt</p><div class="row"><b>Tracking</b><span>${safe(order.tracking_id)}</span></div><div class="row"><b>Route</b><span>${safe(order.pickup_address)} → ${safe(order.dropoff_address)}</span></div><div class="row"><b>Vehicle</b><span>${safe(order.vehicle_type)}</span></div><div class="row"><b>Order status</b><span>${safe(order.status.replace("_", " "))}</span></div><div class="row total"><b>Invoice total</b><span>ETB ${summary.invoiceTotal.toLocaleString()}</span></div><div class="row"><b>Verified customer payment</b><span>ETB ${summary.verifiedPaid.toLocaleString()}</span></div>${heldRow}${releasedRow}${pendingRow}${refundRow}<div class="row total"><b>Balance to pay</b><span>ETB ${summary.balanceToPay.toLocaleString()}</span></div>${creditRow}<p class="muted">Held escrow is verified customer money awaiting release after delivery. Pending verification is submitted but not yet verified and does not reduce the verified balance.</p><p class="muted">Generated ${safe(new Date().toLocaleString())}</p><button type="button" onclick="window.print()">Print / Save as PDF</button></body></html>`;
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

export async function openCustomerTruckPhoto(path: string) {
  const { data, error } = await supabase.storage.from("driver-verification").createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}
