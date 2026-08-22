import { supabase } from "./supabase.client";
import { splitHalloCommission } from "../utils/commission";

export type DriverPayoutStatus = "released" | "partial" | "held_escrow" | "initiated" | "unpaid";

export interface DriverEarningsTrip {
  id: string;
  trackingId: string;
  pickup: string;
  dropoff: string;
  deliveredAt: string | null;
  invoiceEtb: number;
  releasedEtb: number;
  partialReleasedEtb: number;
  commissionEtb: number;
  driverNetEtb: number;
  heldEtb: number;
  initiatedEtb: number;
  remainingEtb: number;
  remainingDriverNetEtb: number;
  payoutStatus: DriverPayoutStatus;
  lastReleaseAt: string | null;
}

export interface DriverEarningsSummary {
  releasedTrips: number;
  totalReleasedEtb: number;
  totalCommissionEtb: number;
  totalDriverNetEtb: number;
  partialReleasedEtb: number;
  pendingTrips: number;
  pendingBalanceEtb: number;
  pendingDriverBalanceEtb: number;
  released: DriverEarningsTrip[];
  pending: DriverEarningsTrip[];
}

interface OrderRow {
  id: string;
  tracking_id: string;
  pickup_address: string;
  dropoff_address: string;
  price_etb: number | string | null;
  delivered_at: string | null;
}

interface PaymentRow {
  order_id: string;
  provider: string;
  amount_etb: number | string | null;
  event: string;
  created_at: string;
}

function amount(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export async function getDriverEarnings(): Promise<DriverEarningsSummary> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error("Sign in required.");

  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .select("id,tracking_id,pickup_address,dropoff_address,price_etb,delivered_at")
    .eq("driver_id", auth.user.id)
    .eq("status", "delivered")
    .order("delivered_at", { ascending: false });

  if (orderError) throw new Error(orderError.message);
  const orders = (orderData ?? []) as OrderRow[];
  if (!orders.length) {
    return {
      releasedTrips: 0,
      totalReleasedEtb: 0,
      totalCommissionEtb: 0,
      totalDriverNetEtb: 0,
      partialReleasedEtb: 0,
      pendingTrips: 0,
      pendingBalanceEtb: 0,
      pendingDriverBalanceEtb: 0,
      released: [],
      pending: [],
    };
  }

  const orderIds = orders.map((order) => order.id);
  const { data: paymentData, error: paymentError } = await supabase
    .from("payments")
    .select("order_id,provider,amount_etb,event,created_at")
    .in("order_id", orderIds)
    .order("created_at", { ascending: false });

  if (paymentError) throw new Error(paymentError.message);
  const payments = (paymentData ?? []) as PaymentRow[];
  const byOrder = new Map<string, PaymentRow[]>();
  for (const payment of payments) {
    const rows = byOrder.get(payment.order_id) ?? [];
    rows.push(payment);
    byOrder.set(payment.order_id, rows);
  }

  const trips: DriverEarningsTrip[] = orders.map((order) => {
    const invoiceEtb = amount(order.price_etb);
    const rows = byOrder.get(order.id) ?? [];
    const releasedGross = rows
      .filter((payment) => payment.event === "released")
      .reduce((sum, payment) => sum + amount(payment.amount_etb), 0);
    const creditRefunded = rows
      .filter((payment) => payment.event === "refunded" && payment.provider === "credit_refund")
      .reduce((sum, payment) => sum + amount(payment.amount_etb), 0);
    const netReleased = Math.max(0, releasedGross - creditRefunded);
    const releasedToInvoice = Math.min(invoiceEtb, netReleased);
    const heldEtb = rows
      .filter((payment) => payment.event === "held_escrow")
      .reduce((sum, payment) => sum + amount(payment.amount_etb), 0);
    const initiatedEtb = rows
      .filter((payment) => payment.event === "initiated")
      .reduce((sum, payment) => sum + amount(payment.amount_etb), 0);
    const remainingEtb = Math.max(0, invoiceEtb - releasedToInvoice);
    const fullyReleased = invoiceEtb > 0 && remainingEtb <= 0.005;
    const payoutStatus: DriverPayoutStatus = fullyReleased
      ? "released"
      : releasedToInvoice > 0
        ? "partial"
        : heldEtb > 0
          ? "held_escrow"
          : "initiated";
    const lastRelease = rows.find((payment) => payment.event === "released");
    const grossPaid = fullyReleased ? invoiceEtb : releasedToInvoice;
    const paidSplit = splitHalloCommission(grossPaid);

    // Only Admin-verified escrow may create an expected pending payout.
    // A delivered trip with no verified funds remains visible, but every money value stays zero.
    const verifiedPendingGross = Math.min(remainingEtb, heldEtb);
    const verifiedPendingSplit = splitHalloCommission(verifiedPendingGross);

    return {
      id: order.id,
      trackingId: order.tracking_id,
      pickup: order.pickup_address,
      dropoff: order.dropoff_address,
      deliveredAt: order.delivered_at,
      invoiceEtb,
      releasedEtb: fullyReleased ? invoiceEtb : 0,
      partialReleasedEtb: fullyReleased ? 0 : releasedToInvoice,
      commissionEtb: paidSplit.commissionEtb,
      driverNetEtb: paidSplit.driverNetEtb,
      heldEtb,
      initiatedEtb,
      remainingEtb,
      remainingDriverNetEtb: verifiedPendingSplit.driverNetEtb,
      payoutStatus,
      lastReleaseAt: lastRelease?.created_at ?? null,
    };
  });

  const released = trips.filter((trip) => trip.payoutStatus === "released");
  const pending = trips.filter((trip) => trip.payoutStatus !== "released");
  const totalReleasedEtb = trips.reduce(
    (sum, trip) => sum + (trip.payoutStatus === "released" ? trip.releasedEtb : trip.partialReleasedEtb),
    0,
  );
  const totalSplit = splitHalloCommission(totalReleasedEtb);

  return {
    releasedTrips: released.length,
    totalReleasedEtb,
    totalCommissionEtb: totalSplit.commissionEtb,
    totalDriverNetEtb: totalSplit.driverNetEtb,
    partialReleasedEtb: pending.reduce((sum, trip) => sum + trip.partialReleasedEtb, 0),
    pendingTrips: pending.length,
    pendingBalanceEtb: pending.reduce((sum, trip) => sum + Math.min(trip.remainingEtb, trip.heldEtb), 0),
    pendingDriverBalanceEtb: pending.reduce((sum, trip) => sum + trip.remainingDriverNetEtb, 0),
    released,
    pending,
  };
}
