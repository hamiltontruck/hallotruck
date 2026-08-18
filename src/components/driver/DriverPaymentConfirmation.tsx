import { useCallback, useEffect, useState } from "react";
import { useLanguage, type HalloLanguage } from "../../i18n/LanguageProvider";
import { formatEtb } from "../../utils/currency";
import {
  confirmDriverPayment,
  getDriverPaymentStatus,
  type DriverPaymentStatus,
} from "../../services/driver-payment.service";

const copy: Record<HalloLanguage, {
  kicker: string;
  title: string;
  help: string;
  empty: string;
  initiated: string;
  verified: string;
  confirmed: string;
  released: string;
  confirm: string;
  confirming: string;
  refresh: string;
  provider: string;
  transaction: string;
  gross: string;
  commission: string;
  net: string;
  waitingDelivery: string;
}> = {
  en: {
    kicker: "CUSTOMER PAYMENT",
    title: "Driver payment confirmation",
    help: "Admin or Finance verifies the customer's receipt first. Confirm only verified payments. Funds release after delivery.",
    empty: "No customer payment has been submitted for this order yet.",
    initiated: "Waiting for Admin verification",
    verified: "Admin verified",
    confirmed: "Driver confirmed",
    released: "Payment released",
    confirm: "Confirm verified payment",
    confirming: "Confirming…",
    refresh: "Refresh",
    provider: "Provider",
    transaction: "Transaction",
    gross: "Gross",
    commission: "HALLO 2%",
    net: "Driver 98%",
    waitingDelivery: "Confirmed. It will release automatically after delivery proof is completed.",
  },
  om: {
    kicker: "KAFFALTII CUSTOMER",
    title: "Mirkaneessa kaffaltii driver",
    help: "Dura Admin ykn Finance receipt customer mirkaneessa. Kaffaltii mirkanaa'e qofa mirkaneessi. Maallaqni delivery booda release ta'a.",
    empty: "Order kanaaf kaffaltiin customer amma hin ergamne.",
    initiated: "Mirkaneessa Admin eegaa jira",
    verified: "Admin mirkaneesseera",
    confirmed: "Driver mirkaneesseera",
    released: "Kaffaltiin release ta'eera",
    confirm: "Kaffaltii mirkanaa'e mirkaneessi",
    confirming: "Mirkaneessaa jira…",
    refresh: "Haaromsi",
    provider: "Karaa kaffaltii",
    transaction: "Transaction",
    gross: "Waliigala",
    commission: "HALLO 2%",
    net: "Driver 98%",
    waitingDelivery: "Mirkanaa'eera. Ragaan delivery erga xumuramee booda ofumaan release ta'a.",
  },
  am: {
    kicker: "የደንበኛ ክፍያ",
    title: "የአሽከርካሪ ክፍያ ማረጋገጫ",
    help: "መጀመሪያ Admin ወይም Finance የደንበኛውን ደረሰኝ ያረጋግጣል። የተረጋገጠ ክፍያ ብቻ ያረጋግጡ። ገንዘቡ ከማድረስ በኋላ ይለቀቃል።",
    empty: "ለዚህ ትዕዛዝ የደንበኛ ክፍያ ገና አልቀረበም።",
    initiated: "የAdmin ማረጋገጫን በመጠበቅ ላይ",
    verified: "Admin አረጋግጧል",
    confirmed: "አሽከርካሪው አረጋግጧል",
    released: "ክፍያው ተለቋል",
    confirm: "የተረጋገጠውን ክፍያ አረጋግጥ",
    confirming: "በማረጋገጥ ላይ…",
    refresh: "አድስ",
    provider: "የክፍያ መንገድ",
    transaction: "Transaction",
    gross: "ጠቅላላ",
    commission: "HALLO 2%",
    net: "አሽከርካሪ 98%",
    waitingDelivery: "ተረጋግጧል። የማድረሻ ማስረጃው ሲጠናቀቅ በራሱ ይለቀቃል።",
  },
};

export function DriverPaymentConfirmation({
  orderId,
  showEmpty = true,
  onChanged,
}: {
  orderId: string;
  showEmpty?: boolean;
  onChanged?: () => void;
}) {
  const { language } = useLanguage();
  const t = copy[language];
  const [payments, setPayments] = useState<DriverPaymentStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const rows = await getDriverPaymentStatus(orderId);
      setPayments(rows);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment status could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 12_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function confirm(paymentId: string) {
    setSavingId(paymentId);
    setError("");
    try {
      await confirmDriverPayment(paymentId);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment could not be confirmed.");
    } finally {
      setSavingId(null);
    }
  }

  if (!loading && !payments.length && !showEmpty) return null;

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-emerald-700/25 bg-white">
      <div className="flex items-start justify-between gap-4 bg-asphalt px-5 py-4 text-white">
        <div>
          <p className="font-mono text-[9px] tracking-[.18em] text-amber">{t.kicker}</p>
          <h2 className="mt-1 font-display text-lg font-semibold">{t.title}</h2>
        </div>
        <button type="button" onClick={() => void load()} className="shrink-0 border border-white/20 px-3 py-2 text-[10px] font-semibold text-white/75">
          {t.refresh}
        </button>
      </div>

      <div className="p-4 sm:p-5">
        <p className="text-xs leading-5 text-steel">{t.help}</p>
        {error && <p className="mt-3 border border-route/30 bg-route/5 px-3 py-2 text-xs text-route">{error}</p>}

        {loading ? (
          <p className="mt-4 text-xs text-steel">Loading…</p>
        ) : payments.length ? (
          <div className="mt-4 space-y-3">
            {payments.map((payment) => {
              const amount = Number(payment.amount_etb || 0);
              const commission = Math.round(amount * 0.02 * 100) / 100;
              const net = Math.max(0, Math.round((amount - commission) * 100) / 100);
              const confirmed = Boolean(payment.confirmed_at);
              const released = payment.payment_event === "released";
              const status = released
                ? t.released
                : payment.payment_event === "initiated"
                  ? t.initiated
                  : confirmed
                    ? t.confirmed
                    : t.verified;

              return (
                <article key={payment.payment_id} className="rounded-xl border border-asphalt/10 bg-bone p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display text-lg font-bold text-asphalt">{formatEtb(amount)}</p>
                      <p className="mt-1 truncate text-[11px] text-steel">
                        {t.provider}: {payment.provider}{payment.provider_ref ? ` · ${t.transaction}: ${payment.provider_ref}` : ""}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1.5 text-[9px] font-semibold uppercase ${released ? "bg-emerald-100 text-emerald-800" : payment.payment_event === "initiated" ? "bg-amber/15 text-amber-dim" : "bg-asphalt/5 text-asphalt"}`}>
                      {status}
                    </span>
                  </div>

                  {(released || confirmed) && (
                    <div className="mt-4 grid grid-cols-3 gap-2 border-t border-asphalt/10 pt-3 text-[10px]">
                      <Amount label={t.gross} value={amount} />
                      <Amount label={t.commission} value={commission} />
                      <Amount label={t.net} value={net} strong />
                    </div>
                  )}

                  {payment.can_confirm && (
                    <button
                      type="button"
                      disabled={savingId === payment.payment_id}
                      onClick={() => void confirm(payment.payment_id)}
                      className="mt-4 min-h-12 w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {savingId === payment.payment_id ? t.confirming : t.confirm}
                    </button>
                  )}

                  {confirmed && !released && <p className="mt-3 text-[11px] leading-5 text-emerald-800">✓ {t.waitingDelivery}</p>}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-bone px-4 py-4 text-xs text-steel">{t.empty}</p>
        )}
      </div>
    </section>
  );
}

function Amount({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div>
      <span className="block text-steel">{label}</span>
      <strong className={`mt-1 block ${strong ? "text-emerald-800" : "text-asphalt"}`}>{formatEtb(value)}</strong>
    </div>
  );
}
