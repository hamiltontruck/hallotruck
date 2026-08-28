import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getUnreportedDeliveries,
  type UnreportedDelivery,
} from "../../services/driver-payment-collection.service";
import { getDriverPaymentStatus } from "../../services/driver-payment.service";
import { supabase } from "../../services/supabase.client";
import { formatEtb } from "../../utils/currency";
import { useLanguage } from "../../i18n/LanguageProvider";

type PendingDriverConfirmation = {
  order_id: string;
  tracking_id: string;
  price_etb: number | string | null;
  provider: string;
  provider_ref: string | null;
};

const copy = {
  en: {
    confirmKicker: "HELD ESCROW · DRIVER CONFIRMATION REQUIRED",
    confirmTitle: "Confirm the customer's payment",
    confirmBody: "Open this completed trip and confirm whether the assigned payment was received. Admin cannot release escrow before your confirmation.",
    confirmAction: "Confirm payment",
    reportKicker: "DELIVERED · PAYMENT REPORT REQUIRED",
    reportTitle: "Record how the customer paid",
    reportBody: "Cash or bank money received by the driver stays outside Earnings until Admin verifies it.",
    rejected: "Admin rejected the previous report. Correct it and submit again.",
    reportAction: "Report payment",
    more: "more completed trips need payment action",
  },
  om: {
    confirmKicker: "ESCROW KEESSA · MIRKANEESSA DRIVER BARBAACHISA",
    confirmTitle: "Kaffaltii customer mirkaneessi",
    confirmBody: "Imala xumurame kana baniitii kaffaltiin siif ramadame gaheera moo hin geenye mirkaneessi. Admin mirkaneessa kee dura escrow release gochuu hin danda'u.",
    confirmAction: "Kaffaltii mirkaneessi",
    reportKicker: "GEEFFAME · GABAASNI KAFFALTII BARBAACHISA",
    reportTitle: "Customer akkamitti akka kaffale galmeessi",
    reportBody: "Cash ykn bankiin driver bira gahe hanga Admin mirkaneessutti Galii keessatti hin lakkaa'amu.",
    rejected: "Admin gabaasa duraa reject godheera. Sirreessii irra deebi'ii ergi.",
    reportAction: "Kaffaltii gabaasi",
    more: "imala xumurame kan biraa tarkaanfii kaffaltii eeggata",
  },
  am: {
    confirmKicker: "በኤስክሮው · የአሽከርካሪ ማረጋገጫ ያስፈልጋል",
    confirmTitle: "የደንበኛውን ክፍያ ያረጋግጡ",
    confirmBody: "ይህን የተጠናቀቀ ጉዞ ከፍተው የተመደበው ክፍያ መድረሱን ወይም አለመድረሱን ያረጋግጡ። Admin ከማረጋገጫዎ በፊት ኤስክሮውን መልቀቅ አይችልም።",
    confirmAction: "ክፍያ ያረጋግጡ",
    reportKicker: "ደርሷል · የክፍያ ሪፖርት ያስፈልጋል",
    reportTitle: "ደንበኛው እንዴት እንደከፈለ ይመዝግቡ",
    reportBody: "አሽከርካሪው የተቀበለው ክፍያ Admin እስኪያረጋግጥ ድረስ በገቢ ውስጥ አይቆጠርም።",
    rejected: "Admin የቀድሞውን ሪፖርት ውድቅ አድርጓል። አስተካክለው እንደገና ይላኩ።",
    reportAction: "ክፍያ ሪፖርት",
    more: "ሌሎች የተጠናቀቁ ጉዞዎች የክፍያ እርምጃ ይጠብቃሉ",
  },
} as const;

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

export function DriverPaymentCollectionBanner() {
  const { language } = useLanguage();
  const c = copy[language];
  const [confirmations, setConfirmations] = useState<PendingDriverConfirmation[]>([]);
  const [reports, setReports] = useState<UnreportedDelivery[]>([]);

  const load = useCallback(async () => {
    const [confirmationResult, reportResult] = await Promise.allSettled([
      getPendingDriverConfirmations(),
      getUnreportedDeliveries(),
    ]);
    setConfirmations(confirmationResult.status === "fulfilled" ? confirmationResult.value : []);
    setReports(reportResult.status === "fulfilled" ? reportResult.value : []);
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel("driver-payment-action-banner")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_payment_confirmation_events" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const confirmation = confirmations[0];
  const report = reports[0];
  if (!confirmation && !report) return null;

  const isConfirmation = Boolean(confirmation);
  const orderId = confirmation?.order_id ?? report!.order_id;
  const trackingId = confirmation?.tracking_id ?? report!.tracking_id;
  const priceEtb = confirmation?.price_etb ?? report!.price_etb;
  const remaining = confirmations.length + reports.length - 1;

  return (
    <section className="border-b border-amber/35 bg-amber/10 px-4 py-4 sm:px-6" data-driver-payment-action-banner>
      <div className="mx-auto flex max-w-4xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[9px] font-semibold tracking-[.16em] text-amber-dim">
            {isConfirmation ? c.confirmKicker : c.reportKicker}
          </p>
          <p className="mt-1 font-display text-lg font-bold text-asphalt">
            {trackingId} · {formatEtb(Number(priceEtb || 0))}
          </p>
          <p className="mt-1 text-xs leading-5 text-steel">
            {isConfirmation
              ? `${c.confirmBody} ${confirmation?.provider ?? ""}${confirmation?.provider_ref ? ` · ${confirmation.provider_ref}` : ""}`
              : report?.rejection_reason ? c.rejected : c.reportBody}
          </p>
          {remaining > 0 && <p className="mt-1 text-[11px] font-semibold text-amber-dim">+{remaining} {c.more}</p>}
        </div>
        <Link
          to={`/driver/payment/${orderId}`}
          className="shrink-0 bg-asphalt px-5 py-3 text-center text-sm font-semibold text-white"
        >
          {isConfirmation ? c.confirmAction : c.reportAction} →
        </Link>
      </div>
    </section>
  );
}
