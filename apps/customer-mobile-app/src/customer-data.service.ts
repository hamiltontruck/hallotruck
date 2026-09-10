import { customerSupabase } from "./auth/customer-supabase";

export type CustomerMobileOrder = {
  id: string;
  tracking_id: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  vehicle_type: string | null;
  distance_km: number | null;
  price_etb: number | null;
  status: string | null;
  payment_status: string | null;
  selected_payment_method: string | null;
  cargo_quantity: number | null;
  cargo_unit: string | null;
  cargo_description: string | null;
  created_at: string | null;
};

export type CustomerMobileProfile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  home_address: string | null;
  customer_type: "individual" | "business" | null;
  company_name: string | null;
  created_at: string | null;
};

export type CustomerMobilePayment = {
  id: string;
  order_id: string;
  provider: string | null;
  provider_ref: string | null;
  amount_etb: number | null;
  event: string | null;
  receipt_path: string | null;
  created_at: string | null;
};

export type CustomerMobileData = {
  orders: CustomerMobileOrder[];
  profile: CustomerMobileProfile | null;
  payments: CustomerMobilePayment[];
};

export type CustomerMobilePaymentSummary = {
  invoiceTotal: number;
  verifiedPaid: number;
  pendingVerification: number;
  remainingToSubmit: number;
  balanceToPay: number;
};

export function formatEtb(amount: number | null | undefined) {
  const value = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  return `ETB ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)}`;
}

export function formatOrderStatus(value: string | null | undefined) {
  const normalized = value?.trim().replaceAll("_", " ") || "pending";
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatCustomerLoad(order: CustomerMobileOrder) {
  const quantity = Number(order.cargo_quantity);
  if (Number.isFinite(quantity) && quantity > 0 && order.cargo_unit) {
    const unit = order.cargo_unit.toLowerCase();
    if (unit === "ton") return `${quantity.toLocaleString()} ton`;
    if (unit === "quintal") return `${quantity.toLocaleString()} quintal`;
    return `${quantity.toLocaleString()} ${unit}`;
  }
  return order.cargo_description?.trim() || "Pending";
}

function totalFor(entries: CustomerMobilePayment[], event: string) {
  return entries
    .filter((entry) => entry.event === event)
    .reduce((sum, entry) => sum + Number(entry.amount_etb || 0), 0);
}

export function calculateCustomerMobilePaymentSummary(
  order: CustomerMobileOrder,
  entries: CustomerMobilePayment[],
): CustomerMobilePaymentSummary {
  const invoiceTotal = Math.max(0, Number(order.price_etb || 0));
  const initiated = totalFor(entries, "initiated");
  const heldEscrow = totalFor(entries, "held_escrow");
  const releasedGross = totalFor(entries, "released");
  const refunded = totalFor(entries, "refunded");
  const verifiedPaid = Math.max(0, releasedGross + heldEscrow - refunded);
  const pendingVerification = Math.max(0, initiated);
  const committed = Math.max(0, verifiedPaid + pendingVerification);

  return {
    invoiceTotal,
    verifiedPaid,
    pendingVerification,
    remainingToSubmit: Math.max(0, invoiceTotal - committed),
    balanceToPay: Math.max(0, invoiceTotal - verifiedPaid),
  };
}

async function requireCustomerSession(userId: string) {
  const client = customerSupabase;
  if (!client) throw new Error("Customer Supabase is not configured.");

  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user || auth.user.id !== userId) {
    throw new Error("Customer session expired.");
  }

  return client;
}

export async function loadCustomerMobileData(userId: string): Promise<CustomerMobileData> {
  const client = await requireCustomerSession(userId);

  const [ordersResult, profileResult] = await Promise.all([
    client
      .from("orders")
      .select("id,tracking_id,pickup_address,dropoff_address,vehicle_type,distance_km,price_etb,status,payment_status,selected_payment_method,cargo_quantity,cargo_unit,cargo_description,created_at")
      .eq("customer_id", userId)
      .order("created_at", { ascending: false }),
    client.rpc("customer_get_profile"),
  ]);

  if (ordersResult.error) throw new Error(ordersResult.error.message);
  if (profileResult.error) throw new Error(profileResult.error.message);

  const orders = (ordersResult.data ?? []) as CustomerMobileOrder[];
  const profile = ((profileResult.data?.[0] ?? null) as CustomerMobileProfile | null);
  if (profile && profile.id !== userId) {
    throw new Error("Customer profile ownership mismatch.");
  }

  const orderIds = orders.map((order) => order.id);
  let payments: CustomerMobilePayment[] = [];

  if (orderIds.length) {
    const paymentResult = await client
      .from("payments")
      .select("id,order_id,provider,provider_ref,amount_etb,event,receipt_path,created_at")
      .in("order_id", orderIds)
      .order("created_at", { ascending: false });

    if (paymentResult.error) throw new Error(paymentResult.error.message);
    payments = (paymentResult.data ?? []) as CustomerMobilePayment[];
  }

  return {
    orders,
    profile,
    payments,
  };
}

export async function createCustomerPaymentReceiptUrl(userId: string, path: string) {
  const client = await requireCustomerSession(userId);
  const cleanPath = path.trim();
  if (!cleanPath) throw new Error("Payment receipt path is missing.");

  const { data, error } = await client.storage
    .from("payment-receipts")
    .createSignedUrl(cleanPath, 300);

  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function cancelCustomerMobileOrder(userId: string, orderId: string, reason: string) {
  const cleanReason = reason.trim();
  if (cleanReason.length < 5) throw new Error("Write a cancellation reason of at least 5 characters.");
  if (cleanReason.length > 500) throw new Error("Cancellation reason must be 500 characters or fewer.");

  const client = await requireCustomerSession(userId);
  const { error } = await client.rpc("customer_cancel_order", {
    p_order_id: orderId,
    p_reason: cleanReason,
  });
  if (error) throw new Error(error.message);
}

export function printCustomerMobileInvoice(order: CustomerMobileOrder, payments: CustomerMobilePayment[]) {
  const safe = (value: unknown) => String(value ?? "—").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[character] ?? character));

  const summary = calculateCustomerMobilePaymentSummary(order, payments);
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safe(order.tracking_id)} invoice</title><style>body{font:14px Arial;color:#10213d;padding:24px;max-width:760px;margin:auto}h1{font-size:28px}.brand{color:#d68e25}.row{display:flex;gap:20px;justify-content:space-between;border-bottom:1px solid #dfe7f1;padding:12px 0}.row span{text-align:right}.total{font-size:20px;font-weight:bold}.muted{color:#68778d}button{width:100%;border:0;background:#10213d;color:white;padding:15px;margin-top:24px;font-weight:bold}@media(max-width:480px){body{padding:18px}.row{display:block}.row span{display:block;text-align:left;margin-top:6px}}@media print{button{display:none}body{padding:0}}</style></head><body><h1>HALLO<span class="brand">TRUCK</span></h1><p class="muted">Customer logistics invoice / receipt</p><div class="row"><b>Tracking</b><span>${safe(order.tracking_id)}</span></div><div class="row"><b>Route</b><span>${safe(order.pickup_address)} → ${safe(order.dropoff_address)}</span></div><div class="row"><b>Vehicle</b><span>${safe(order.vehicle_type)}</span></div><div class="row"><b>Load</b><span>${safe(formatCustomerLoad(order))}</span></div><div class="row"><b>Order status</b><span>${safe(formatOrderStatus(order.status))}</span></div><div class="row total"><b>Invoice total</b><span>${safe(formatEtb(summary.invoiceTotal))}</span></div><div class="row"><b>Verified customer payment</b><span>${safe(formatEtb(summary.verifiedPaid))}</span></div><div class="row"><b>Pending verification</b><span>${safe(formatEtb(summary.pendingVerification))}</span></div><div class="row total"><b>Balance to pay</b><span>${safe(formatEtb(summary.balanceToPay))}</span></div><p class="muted">Generated ${safe(new Date().toLocaleString())}</p><button type="button" onclick="window.print()">Print / Save as PDF</button></body></html>`;
  const popup = window.open("about:blank", "_blank");
  if (!popup) throw new Error("Allow pop-ups to generate the PDF.");
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.opener = null;
}
