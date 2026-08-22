import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getUnreportedDeliveries, type UnreportedDelivery } from "../../services/driver-payment-collection.service";
import { supabase } from "../../services/supabase.client";
import { formatEtb } from "../../utils/currency";
import { useLanguage } from "../../i18n/LanguageProvider";

const copy = {
  en: {
    kicker: "DELIVERED · PAYMENT REPORT REQUIRED",
    title: "Record how the customer paid",
    body: "Cash or bank money received by the driver stays outside Earnings until Admin verifies the evidence.",
    rejected: "Admin rejected the previous evidence. Correct it and submit again.",
    action: "Report payment",
    more: "more delivered trips need payment reports",
  },
  om: {
    kicker: "GEEFFAME · GABAASNI KAFFALTII BARBAACHISA",
    title: "Customer akkamitti akka kaffale galmeessi",
    body: "Cash ykn bankiin driver bira gahe hanga Admin ragaa mirkaneessutti Galii keessatti hin lakkaa'amu.",
    rejected: "Admin ragaa duraa reject godheera. Sirreessii irra deebi'ii ergi.",
    action: "Kaffaltii gabaasi",
    more: "imala geeffame kan biraa gabaasa kaffaltii eeggata",
  },
  am: {
    kicker: "ደርሷል · የክፍያ ሪፖርት ያስፈልጋል",
    title: "ደንበኛው እንዴት እንደከፈለ ይመዝግቡ",
    body: "አሽከርካሪው የተቀበለው ጥሬ ገንዘብ ወይም የባንክ ክፍያ Admin ማስረጃውን እስኪያረጋግጥ ድረስ በገቢ ውስጥ አይቆጠርም።",
    rejected: "Admin የቀድሞውን ማስረጃ ውድቅ አድርጓል። አስተካክለው እንደገና ይላኩ።",
    action: "ክፍያ ሪፖርት",
    more: "ሌሎች የደረሱ ጉዞዎች የክፍያ ሪፖርት ይጠብቃሉ",
  },
} as const;

export function DriverPaymentCollectionBanner() {
  const { language } = useLanguage();
  const c = copy[language];
  const [rows, setRows] = useState<UnreportedDelivery[]>([]);

  const load = useCallback(async () => {
    try {
      setRows(await getUnreportedDeliveries());
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel("driver-payment-collection-banner")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const first = rows[0];
  if (!first) return null;

  return (
    <section className="border-b border-amber/35 bg-amber/10 px-4 py-4 sm:px-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[9px] font-semibold tracking-[.16em] text-amber-dim">{c.kicker}</p>
          <p className="mt-1 font-display text-lg font-bold text-asphalt">{first.tracking_id} · {formatEtb(Number(first.price_etb || 0))}</p>
          <p className="mt-1 text-xs leading-5 text-steel">{first.rejection_reason ? c.rejected : c.body}</p>
          {rows.length > 1 && <p className="mt-1 text-[11px] font-semibold text-amber-dim">+{rows.length - 1} {c.more}</p>}
        </div>
        <Link to={`/driver/payment/${first.order_id}`} className="shrink-0 bg-asphalt px-5 py-3 text-center text-sm font-semibold text-white">
          {c.action} →
        </Link>
      </div>
    </section>
  );
}
