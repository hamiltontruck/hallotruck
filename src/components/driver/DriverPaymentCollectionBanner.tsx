import { getUnreportedDeliveries } from "../../services/driver-payment-collection.service";
import { getDriverPaymentStatus } from "../../services/driver-payment.service";
import { supabase } from "../../services/supabase.client";
import {
  DriverPaymentActionBannerState,
  type PendingDriverConfirmation,
} from "./DriverPaymentActionBannerState";

async function getPendingDriverConfirmations(): Promise<PendingDriverConfirmation[]> {
  const { data: orders, error } = await supabase
    .from("orders")
    .select("id,tracking_id,price_etb")
    .eq("status", "delivered")
    .order("delivered_at", { ascending: false })
    .limit(20);

  if (error) throw new Error(error.message);

  const pending = await Promise.all(
    (orders ?? []).map(async (order) => {
      const statuses = await getDriverPaymentStatus(order.id);
      const payment = statuses.find((row) =>
        row.payment_event === "held_escrow"
        && row.confirmation_type !== "payment_confirmed"
        && (row.can_confirm || row.can_report_not_received)
      );
      if (!payment) return null;
      return {
        order_id: order.id,
        tracking_id: order.tracking_id,
        price_etb: order.price_etb,
        provider: payment.provider,
        provider_ref: payment.provider_ref,
      } satisfies PendingDriverConfirmation;
    }),
  );

  return pending.filter((row): row is PendingDriverConfirmation => row !== null);
}

function subscribeToDriverPaymentActions(onChange: () => void): () => void {
  const channel = supabase
    .channel("driver-payment-action-banner")
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, onChange)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "driver_payment_confirmation_events" },
      onChange,
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function DriverPaymentCollectionBanner() {
  return (
    <DriverPaymentActionBannerState
      loadConfirmations={getPendingDriverConfirmations}
      loadReports={getUnreportedDeliveries}
      subscribe={subscribeToDriverPaymentActions}
    />
  );
}
