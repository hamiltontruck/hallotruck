import { supabase } from "./supabase.client";
import { calculatePaymentSummary } from "../utils/paymentSummary";

export type AdminRole = "admin" | "ceo";

export interface DashboardMetrics {
  totalOrders: number;
  activeOrders: number;
  deliveredOrders: number;
  availableTrucks: number;
  totalCustomers: number;
  revenueEtb: number;
}

export interface AdminOrder {
  id: string;
  tracking_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  pickup_address: string;
  dropoff_address: string;
  cargo_description: string | null;
  vehicle_type: string;
  price_etb: number | null;
  status: string;
  payment_status: string;
  driver_id: string | null;
  truck_id: string | null;
  accepted_at: string | null;
  delivered_at: string | null;
  cancellation_reason: string | null;
  cancellation_source: string | null;
  cancelled_at: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  company_name: string | null;
  is_credit_customer: boolean;
  created_at: string;
}

export interface Truck {
  id: string;
  plate_number: string;
  vehicle_type: string;
  capacity_tons: number | null;
  status: string;
  created_at: string;
}

export interface Driver {
  id: string;
  full_name: string | null;
  phone: string | null;
  driver_status: string | null;
}

export interface Payment {
  id: string;
  order_id: string;
  provider: string;
  provider_ref: string | null;
  amount_etb: number;
  event: string;
  receipt_path: string | null;
  created_at: string;
}

export interface DeliveryProof {
  id: string;
  order_id: string;
  recipient_name: string;
  delivery_note: string | null;
  photo_path: string;
  signature_path: string;
  delivered_at: string;
}

function fail(message: string): never { throw new Error(message); }

export async function getDashboardData() {
  const [ordersResult, trucksResult, customersResult, paymentsResult, driversResult, proofsResult] = await Promise.all([
    supabase.from("orders").select("id,tracking_id,customer_name,customer_phone,pickup_address,dropoff_address,cargo_description,vehicle_type,price_etb,status,payment_status,driver_id,truck_id,accepted_at,delivered_at,cancellation_reason,cancellation_source,cancelled_at,created_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("trucks").select("id,plate_number,vehicle_type,capacity_tons,status,created_at").order("created_at", { ascending: false }),
    supabase.from("customers").select("id,full_name,phone,email,company_name,is_credit_customer,created_at").order("created_at", { ascending: false }),
    supabase.from("payments").select("id,order_id,provider,provider_ref,amount_etb,event,receipt_path,created_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("profiles").select("id,full_name,phone,driver_status").eq("role", "driver").order("full_name"),
    supabase.from("delivery_proofs").select("id,order_id,recipient_name,delivery_note,photo_path,signature_path,delivered_at").order("delivered_at", { ascending:false }).limit(100),
  ]);

  const error = ordersResult.error || trucksResult.error || customersResult.error || paymentsResult.error || driversResult.error || proofsResult.error;
  if (error) fail(error.message);

  const orders = (ordersResult.data ?? []) as AdminOrder[];
  const trucks = (trucksResult.data ?? []) as Truck[];
  const customers = (customersResult.data ?? []) as Customer[];
  const payments = (paymentsResult.data ?? []) as Payment[];
  const drivers = (driversResult.data ?? []) as Driver[];
  const deliveryProofs = (proofsResult.data ?? []) as DeliveryProof[];
  const releasedTotal = payments
    .filter((payment) => payment.event === "released")
    .reduce((sum, payment) => sum + Number(payment.amount_etb || 0), 0);
  const refundedTotal = payments
    .filter((payment) => payment.event === "refunded")
    .reduce((sum, payment) => sum + Number(payment.amount_etb || 0), 0);

  const metrics: DashboardMetrics = {
    totalOrders: orders.length,
    activeOrders: orders.filter((order) => ["accepted", "in_transit"].includes(order.status)).length,
    deliveredOrders: orders.filter((order) => order.status === "delivered").length,
    availableTrucks: trucks.filter((truck) => truck.status === "available").length,
    totalCustomers: customers.length,
    revenueEtb: Math.max(0, releasedTotal - refundedTotal),
  };

  return { metrics, orders, trucks, customers, payments, drivers, deliveryProofs };
}

export async function assignOrder(orderId: string, truckId: string, driverId: string) {
  const { error } = await supabase.rpc("admin_assign_order", { p_order_id: orderId, p_truck_id: truckId, p_driver_id: driverId });
  if (error) fail(error.message);
}

export async function transitionOrder(orderId: string, status: "accepted" | "in_transit" | "delivered") {
  const { error } = await supabase.rpc("admin_transition_order", { p_order_id: orderId, p_status: status });
  if (error) fail(error.message);
}

export async function recordPayment(input: { orderId:string; provider:string; providerRef?:string; amountEtb:number; event:"initiated"|"held_escrow"|"released" }) {
  const { error } = await supabase.rpc("admin_record_payment", { p_order_id:input.orderId, p_provider:input.provider, p_provider_ref:input.providerRef || null, p_amount_etb:input.amountEtb, p_event:input.event });
  if (error) fail(error.message);
}

export async function submitDeliveryProof(input: { orderId:string; recipientName:string; deliveryNote:string; photo:File; signature:Blob }) {
  if (!input.photo.type.startsWith("image/")) fail("Delivery photo must be an image.");
  if (input.photo.size > 8 * 1024 * 1024) fail("Delivery photo must be smaller than 8 MB.");
  const stamp = Date.now();
  const extension = input.photo.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const photoPath = `${input.orderId}/${stamp}-delivery.${extension}`;
  const signaturePath = `${input.orderId}/${stamp}-signature.png`;
  const uploaded:string[] = [];
  try {
    const photoUpload = await supabase.storage.from("delivery-proofs").upload(photoPath, input.photo, { contentType:input.photo.type, upsert:false });
    if (photoUpload.error) fail(photoUpload.error.message); uploaded.push(photoPath);
    const signatureUpload = await supabase.storage.from("delivery-proofs").upload(signaturePath, input.signature, { contentType:"image/png", upsert:false });
    if (signatureUpload.error) fail(signatureUpload.error.message); uploaded.push(signaturePath);
    const { error } = await supabase.rpc("submit_delivery_proof", { p_order_id:input.orderId, p_recipient_name:input.recipientName, p_delivery_note:input.deliveryNote || null, p_photo_path:photoPath, p_signature_path:signaturePath });
    if (error) fail(error.message);
  } catch (error) {
    if (uploaded.length) await supabase.storage.from("delivery-proofs").remove(uploaded);
    throw error;
  }
}

export async function openDeliveryProof(path:string) {
  const { data, error } = await supabase.storage.from("delivery-proofs").createSignedUrl(path, 300);
  if (error) fail(error.message);
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

export async function openPaymentReceipt(path:string) {
  const { data, error } = await supabase.storage.from("payment-receipts").createSignedUrl(path, 300);
  if (error) fail(error.message);
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

export function printInvoice(order: AdminOrder, truck?: Truck, driver?: Driver, payments: Payment[] = []) {
  const safe = (value: unknown) => String(value ?? "—").replace(/[&<>"']/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[character] ?? character));
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

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safe(order.tracking_id)} invoice</title><style>body{font:14px Arial;color:#1d222a;padding:24px;max-width:760px;margin:auto}h1{font-size:28px}.brand{color:#d68e25}.row{display:flex;gap:20px;justify-content:space-between;border-bottom:1px solid #ddd;padding:12px 0}.row span{text-align:right}.total{font-size:20px;font-weight:bold}.credit{font-size:18px;font-weight:bold;color:#256b4a;background:#eefbf4;padding-left:10px;padding-right:10px}.refund{color:#256b4a;background:#eefbf4;padding-left:10px;padding-right:10px}.escrow{color:#8a5f1b;background:#fff8e8;padding-left:10px;padding-right:10px}.pending{color:#9b6418}.muted{color:#68707c}button{width:100%;border:0;background:#1d222a;color:white;padding:15px;margin-top:24px;font-weight:bold}@media(max-width:480px){body{padding:18px}.row{display:block}.row span{display:block;text-align:left;margin-top:6px}}@media print{button{display:none}body{padding:0}}</style></head><body><h1>HALLO<span class="brand">TRUCK</span></h1><p class="muted">Smart Logistics invoice / receipt</p><div class="row"><b>Tracking</b><span>${safe(order.tracking_id)}</span></div><div class="row"><b>Customer</b><span>${safe(order.customer_name)} · ${safe(order.customer_phone)}</span></div><div class="row"><b>Route</b><span>${safe(order.pickup_address)} → ${safe(order.dropoff_address)}</span></div><div class="row"><b>Truck / driver</b><span>${safe(truck?.plate_number ?? "Unassigned")} · ${safe(driver?.full_name ?? "Unassigned")}</span></div><div class="row"><b>Status</b><span>${safe(order.status.replace("_"," "))}</span></div><div class="row total"><b>Invoice total</b><span>ETB ${summary.invoiceTotal.toLocaleString()}</span></div><div class="row"><b>Verified customer payment</b><span>ETB ${summary.verifiedPaid.toLocaleString()}</span></div>${heldRow}${releasedRow}${pendingRow}${refundRow}<div class="row total"><b>Balance to pay</b><span>ETB ${summary.balanceToPay.toLocaleString()}</span></div>${creditRow}<p class="muted">Held escrow is verified customer money awaiting release after delivery. Pending verification is submitted but not yet verified and does not reduce the verified balance.</p><p class="muted">Generated ${safe(new Date().toLocaleString())}</p><button type="button" onclick="window.print()">Print / Save as PDF</button></body></html>`;
  const popup = window.open("about:blank", "_blank");
  if (!popup) fail("Allow pop-ups to generate the PDF.");
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.opener = null;
}

export interface NewOrderInput {
  customerName: string;
  customerPhone: string;
  pickupAddress: string;
  dropoffAddress: string;
  cargoDescription: string;
  vehicleType: string;
  priceEtb: number;
}

export async function createOrder(input: NewOrderInput) {
  const trackingId = `HT-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
  const { data, error } = await supabase.from("orders").insert({
    tracking_id: trackingId,
    customer_name: input.customerName,
    customer_phone: input.customerPhone,
    pickup_address: input.pickupAddress,
    dropoff_address: input.dropoffAddress,
    cargo_description: input.cargoDescription || null,
    vehicle_type: input.vehicleType,
    price_etb: input.priceEtb,
    status: "placed",
    payment_status: "unpaid",
  }).select("*").single();
  if (error) fail(error.message);
  return data as AdminOrder;
}

export async function createCustomer(input: { fullName: string; phone: string; email?: string; companyName?: string }) {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("customers").insert({
    full_name: input.fullName,
    phone: input.phone,
    email: input.email || null,
    company_name: input.companyName || null,
    created_by: auth.user?.id,
  });
  if (error) fail(error.message);
}

export async function createTruck(input: { plateNumber: string; vehicleType: string; capacityTons?: number }) {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("trucks").insert({
    plate_number: input.plateNumber,
    vehicle_type: input.vehicleType,
    capacity_tons: input.capacityTons || null,
    created_by: auth.user?.id,
  });
  if (error) fail(error.message);
}

export function subscribeToAdminData(onChange: () => void) {
  return supabase.channel("admin-live-data")
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "trucks" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "delivery_proofs" }, onChange)
    .subscribe();
}
