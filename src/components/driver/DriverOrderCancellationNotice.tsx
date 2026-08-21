import { useLanguage, type HalloLanguage } from "../../i18n/LanguageProvider";
import type { MyOrder } from "../../services/driver.service";

const copy: Record<HalloLanguage, {
  kicker: string;
  title: string;
  help: string;
  reason: string;
  cancelledAt: string;
  browse: string;
  dismiss: string;
}> = {
  en: {
    kicker: "CUSTOMER CANCELLATION",
    title: "This transport order was cancelled",
    help: "Stop this trip and GPS sharing. The truck is released for another job; Admin and Finance will review any payment or trip costs.",
    reason: "Customer reason",
    cancelledAt: "Cancelled",
    browse: "Browse available jobs",
    dismiss: "Dismiss notice",
  },
  om: {
    kicker: "AJAJA MAAMILAAN DHIIFAME",
    title: "Ajajni geejjibaa kun dhiifameera",
    help: "Imalaa fi qoodinsa GPS dhaabi. Truck hojii biraaf gadhiifameera; kaffaltii ykn baasii imalaa Admin fi Finance ni qoratu.",
    reason: "Sababa maamilaa",
    cancelledAt: "Yeroo dhiifame",
    browse: "Hojii jiran ilaali",
    dismiss: "Beeksisa cufi",
  },
  am: {
    kicker: "የደንበኛ ስረዛ",
    title: "ይህ የትራንስፖርት ትዕዛዝ ተሰርዟል",
    help: "ጉዞውንና GPS ማጋራቱን ያቁሙ። መኪናው ለሌላ ሥራ ተለቋል፤ Admin እና Finance ክፍያን ወይም የጉዞ ወጪን ይገመግማሉ።",
    reason: "የደንበኛ ምክንያት",
    cancelledAt: "የተሰረዘበት ጊዜ",
    browse: "ያሉ ሥራዎችን ይመልከቱ",
    dismiss: "ማሳወቂያውን ዝጋ",
  },
};

export function DriverOrderCancellationNotice({
  order,
  onBrowseJobs,
  onDismiss,
}: {
  order: MyOrder;
  onBrowseJobs?: () => void;
  onDismiss?: () => void;
}) {
  const { language } = useLanguage();
  const t = copy[language];

  return (
    <section className="overflow-hidden border border-route/30 bg-white shadow-[0_18px_45px_rgba(29,34,42,.08)]">
      <header className="bg-route px-5 py-5 text-white sm:px-7">
        <p className="font-mono text-[10px] tracking-[.2em] text-white/70">{t.kicker}</p>
        <h2 className="mt-2 font-display text-2xl font-bold">{t.title}</h2>
        <p className="mt-2 font-mono text-xs text-white/75">{order.tracking_id}</p>
      </header>
      <div className="p-5 sm:p-7">
        <p className="text-sm leading-6 text-steel">{t.help}</p>
        <div className="mt-5 border-l-4 border-route bg-route/5 p-4">
          <p className="font-mono text-[10px] tracking-[.16em] text-route">{t.reason}</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-asphalt">{order.cancellation_reason ?? "—"}</p>
          {order.cancelled_at && <p className="mt-3 text-xs text-steel">{t.cancelledAt}: {new Date(order.cancelled_at).toLocaleString()}</p>}
        </div>
        <p className="mt-4 text-xs text-steel">{order.pickup_address} → {order.dropoff_address}</p>
        {(onBrowseJobs || onDismiss) && <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          {onBrowseJobs && <button type="button" onClick={onBrowseJobs} className="min-h-12 bg-asphalt px-5 py-3 text-sm font-semibold text-white">{t.browse}</button>}
          {onDismiss && <button type="button" onClick={onDismiss} className="min-h-12 border border-asphalt/15 px-5 py-3 text-sm font-semibold text-asphalt">{t.dismiss}</button>}
        </div>}
      </div>
    </section>
  );
}
