import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AdminDeliveryReconciliationPanel } from "../components/admin/AdminDeliveryReconciliationPanel";
import { AdminPaymentLedgerAnomalyPanel } from "../components/admin/AdminPaymentLedgerAnomalyPanel";
import { useLanguage, type SupportedLanguage } from "../i18n/LanguageProvider";
import { getAdminOrderControlQueuePage, type AdminOrderControlQueuePageResult } from "../services/admin-order-control-queue.service";
import { supabase } from "../services/supabase.client";
import { AdminPaymentReview } from "./AdminPaymentReview";

type Copy = {
  kicker: string;
  title: string;
  body: string;
  amount: string;
  delivered: string;
  driver: string;
  unknownDriver: string;
  awaiting: string;
  instruction: string;
  fullQueue: string;
  loadError: string;
};

const copy: Record<SupportedLanguage, Copy> = {
  en: {
    kicker: "DELIVERED · PAYMENT REPORT MISSING",
    title: "Delivered orders waiting for the driver payment report",
    body: "These pay-on-delivery orders are not yet financial ledger entries because the assigned driver has not reported the cash or bank payment. They remain unpaid and create no driver earnings or HALLO commission.",
    amount: "Unreported invoice total",
    delivered: "Delivered",
    driver: "Driver",
    unknownDriver: "Driver unavailable",
    awaiting: "Awaiting driver report",
    instruction: "The driver opens the payment-report action, chooses Cash or Bank / Telebirr, confirms the payment outcome and submits the full invoice amount. No receipt or evidence upload is required. It will then enter Pending review below.",
    fullQueue: "Open full server queue",
    loadError: "Delivered orders awaiting payment reports could not be loaded.",
  },
  om: {
    kicker: "DELIVERED · GABAASNI KAFFALTII HIN GALLE",
    title: "Order delivered taʼe kan gabaasa kaffaltii driver eeggatan",
    body: "Order pay-on-delivery kun driver ramadame cash ykn bank payment fudhate jechuun waan hin gabaafneef Finance ledger keessa amma hin seenne. Unpaid taʼanii turu; driver earnings fi commission HALLO hin uuman.",
    amount: "Waliigala invoice hin gabaafamne",
    delivered: "Delivered",
    driver: "Driver",
    unknownDriver: "Driver hin argamne",
    awaiting: "Gabaasa driver eeggachaa jira",
    instruction: "Driver payment-report action keessaa Cash ykn Bank / Telebirr filatee, kaffaltiin fudhatamuu isaa mirkaneessuun invoice guutuu erguu qaba. Ragaa olkaaʼuun hin barbaachisu. Sana booda Pending review jalatti ni seena.",
    fullQueue: "Server queue guutuu bani",
    loadError: "Order delivered kan gabaasa kaffaltii eeggatan feʼuun hin dandaʼamne.",
  },
  am: {
    kicker: "ደርሷል · የክፍያ ሪፖርት አልገባም",
    title: "የአሽከርካሪ የክፍያ ሪፖርት የሚጠብቁ የደረሱ ትዕዛዞች",
    body: "እነዚህ በመድረስ ጊዜ የሚከፈሉ ትዕዛዞች አሽከርካሪው የጥሬ ገንዘብ ወይም የባንክ ክፍያን ስላላሳወቀ ገና በፋይናንስ መዝገብ ውስጥ አልገቡም። የአሽከርካሪ ገቢ ወይም የHALLO ኮሚሽን አይፈጥሩም።",
    amount: "ያልተላከ ጠቅላላ ደረሰኝ",
    delivered: "የደረሰበት",
    driver: "አሽከርካሪ",
    unknownDriver: "አሽከርካሪ አልተገኘም",
    awaiting: "የአሽከርካሪ ሪፖርት በመጠበቅ ላይ",
    instruction: "አሽከርካሪው የክፍያ ሪፖርት እርምጃን ከፍቶ Cash ወይም Bank / Telebirr መርጦ፣ የክፍያውን ውጤት አረጋግጦ ሙሉ የክፍያ መጠኑን መላክ አለበት። ደረሰኝ ወይም ማስረጃ መጫን አያስፈልግም። ከዚያ Pending review ውስጥ ይገባል።",
    fullQueue: "ሙሉ የሰርቨር ወረፋ ክፈት",
    loadError: "የክፍያ ሪፖርት የሚጠብቁ የደረሱ ትዕዛዞችን መጫን አልተቻለም።",
  },
  so: {
    kicker: "LA GAARSIIYEY · WARBIXINTA LACAGTA MAQAN",
    title: "Dalabyo la gaarsiiyey oo sugaya warbixinta lacagta darawalka",
    body: "Dalabyadan lacagta lagu bixiyo marka la gaarsiiyo weli kuma jiraan diiwaanka maaliyadda, sababtoo ah darawalku ma soo sheegin lacag caddaan ama bangi. Wax dakhli darawal ama komishan HALLO ah ma abuuraan.",
    amount: "Wadarta qaansheegta aan la soo sheegin",
    delivered: "La gaarsiiyey",
    driver: "Darawal",
    unknownDriver: "Darawal lama helin",
    awaiting: "Sugaya warbixinta darawalka",
    instruction: "Darawalku wuxuu furaa warbixinta lacagta, doortaa Cash ama Bank / Telebirr, xaqiijiyaa natiijada lacag-bixinta, dabadeedna diraa wadarta qaansheegta. Looma baahna inuu rasiid ama caddayn soo geliyo. Markaas waxay geli doontaa Pending review.",
    fullQueue: "Fur safka server-ka oo dhan",
    loadError: "Dalabyada la gaarsiiyey ee sugaya warbixinta lacagta lama soo gelin karin.",
  },
  ti: {
    kicker: "ተበጺሑ · ጸብጻብ ክፍሊት የለን",
    title: "ጸብጻብ ክፍሊት መራሕ መኪና ዝጽበዩ ዝተበጽሑ ትእዛዛት",
    body: "እዞም ኣብ ምብጻሕ ዝኽፈሉ ትእዛዛት መራሕ መኪና ናይ ጥረ ገንዘብ ወይ ባንኪ ክፍሊት ስለዘይገለጸ ገና ኣብ መዝገብ ፋይናንስ ኣይኣተዉን። ኣታዊ መራሕ መኪና ወይ ኮሚሽን HALLO ኣይፈጥሩን።",
    amount: "ጠቕላላ ዘይተገልጸ ኢንቮይስ",
    delivered: "ዝተበጽሓሉ",
    driver: "መራሕ መኪና",
    unknownDriver: "መራሕ መኪና ኣይተረኽበን",
    awaiting: "ጸብጻብ መራሕ መኪና ይጽበ ኣሎ",
    instruction: "መራሕ መኪና ናይ ክፍሊት ጸብጻብ ከፊቱ Cash ወይ Bank / Telebirr ክመርጽ፣ ውጽኢት ክፍሊት ከረጋግጽን ምሉእ መጠን ኢንቮይስ ክልእኽን ኣለዎ። ቅብሊት ወይ መረጋገጺ ምስቃል ኣየድልን። ድሕሪኡ ኣብ Pending review ይኣቱ።",
    fullQueue: "ምሉእ ሰርቨር ሰልፊ ክፈት",
    loadError: "ጸብጻብ ክፍሊት ዝጽበዩ ዝተበጽሑ ትእዛዛት ምጽዓን ኣይተኻእለን።",
  },
};

function money(value: number | string | null | undefined) {
  return Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function AdminUnreportedDeliveredPayments() {
  const { selectedLanguage } = useLanguage();
  const c = copy[selectedLanguage];
  const [result, setResult] = useState<AdminOrderControlQueuePageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);
  const realtimeTimer = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    try {
      const next = await getAdminOrderControlQueuePage({
        queue: "unreported-payment",
        page: 1,
        pageSize: 50,
        status: "delivered",
      });
      if (requestId !== requestSequence.current) return;
      setResult(next);
      setError("");
    } catch (loadError) {
      if (requestId !== requestSequence.current) return;
      setError(loadError instanceof Error ? loadError.message : c.loadError);
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [c.loadError]);

  useEffect(() => {
    void load();
    const queueRefresh = () => {
      window.clearTimeout(realtimeTimer.current);
      realtimeTimer.current = window.setTimeout(() => void load(), 600);
    };
    const channel = supabase
      .channel("admin-unreported-delivered-payments")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, queueRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_trip_payment_results" }, queueRefresh)
      .subscribe();
    return () => {
      window.clearTimeout(realtimeTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const orders = result?.orders ?? [];
  const total = result?.invoiceTotal ?? 0;
  const count = result?.total ?? 0;

  if (!loading && !error && count === 0) return null;

  return (
    <section className="bg-[#f5f3ed] px-4 pt-4 text-asphalt sm:px-7 sm:pt-7">
      <div className="mx-auto max-w-5xl border border-amber/45 bg-amber/10 p-5 sm:p-6" role={count ? "alert" : "status"}>
        {loading && <p className="font-mono text-xs text-steel">Loading delivered payment-report exceptions…</p>}
        {error && <p className="text-sm text-route">{error || c.loadError}</p>}
        {!loading && !error && count > 0 && (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-mono text-[10px] tracking-[.18em] text-amber-dim">{c.kicker}</p>
                <h2 className="mt-2 font-display text-2xl font-bold">{c.title}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-steel">{c.body}</p>
              </div>
              <div className="shrink-0 border border-amber/35 bg-white px-4 py-3">
                <p className="font-mono text-[9px] uppercase tracking-wide text-steel">{c.amount}</p>
                <p className="mt-2 font-display text-xl font-bold">ETB {money(total)}</p>
                <p className="mt-1 text-xs text-steel">{count} order{count === 1 ? "" : "s"}</p>
              </div>
            </div>

            <p className="mt-4 border-l-4 border-amber bg-white/75 p-4 text-xs leading-5 text-asphalt">{c.instruction}</p>

            <div className="mt-4 grid gap-3">
              {orders.map((order) => (
                <article key={order.id} className="border border-amber/30 bg-white p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-semibold">{order.tracking_id}</p>
                      <p className="mt-2 font-display text-xl font-bold">ETB {money(order.price_etb)}</p>
                      <p className="mt-2 text-sm text-steel">{order.pickup_address} → {order.dropoff_address}</p>
                      <p className="mt-2 text-xs text-steel">
                        {c.driver}: <strong className="text-asphalt">{order.driver_name ?? c.unknownDriver}</strong>
                        {order.delivered_at ? ` · ${c.delivered}: ${new Date(order.delivered_at).toLocaleString()}` : ""}
                      </p>
                    </div>
                    <span className="self-start bg-amber/15 px-3 py-2 text-xs font-semibold text-amber-dim">{c.awaiting}</span>
                  </div>
                </article>
              ))}
            </div>
            <div className="mt-4 flex justify-end"><Link to="/admin/order-queue?queue=unreported-payment" className="min-h-11 bg-asphalt px-4 py-3 text-xs font-semibold text-white">{c.fullQueue} →</Link></div>
          </>
        )}
      </div>
    </section>
  );
}

export function AdminPaymentWorkspace() {
  return (
    <>
      <AdminPaymentLedgerAnomalyPanel />
      <AdminDeliveryReconciliationPanel />
      <AdminUnreportedDeliveredPayments />
      <AdminPaymentReview />
    </>
  );
}
