import { useCallback, useEffect, useState } from "react";
import { useLanguage, type HalloLanguage } from "../../i18n/LanguageProvider";
import { formatEtb } from "../../utils/currency";
import {
  confirmDriverPayment,
  getDriverPaymentStatus,
  reportDriverPaymentNotReceived,
  type DriverPaymentStatus,
} from "../../services/driver-payment.service";

const copy: Record<HalloLanguage, {
  kicker: string;
  title: string;
  help: string;
  empty: string;
  initiated: string;
  awaiting: string;
  confirmed: string;
  notReceived: string;
  released: string;
  confirm: string;
  notReceivedAction: string;
  confirming: string;
  saving: string;
  refresh: string;
  method: string;
  bankMobile: string;
  cash: string;
  provider: string;
  transaction: string;
  amount: string;
  reason: string;
  reasonPlaceholder: string;
  saveNotReceived: string;
  cancel: string;
  confirmedHelp: string;
  notReceivedHelp: string;
}> = {
  en: {
    kicker: "CUSTOMER PAYMENT",
    title: "Payment confirmation",
    help: "Confirm the customer payment after the trip is finished. No receipt or screenshot upload is required.",
    empty: "No customer payment is ready for confirmation yet.",
    initiated: "Waiting for Admin verification",
    awaiting: "Assigned driver confirmation required",
    confirmed: "Assigned driver confirmed payment.",
    notReceived: "Payment not received / not confirmed",
    released: "Payment released",
    confirm: "Payment confirmed",
    notReceivedAction: "Payment not received / not confirmed",
    confirming: "Confirming…",
    saving: "Saving…",
    refresh: "Refresh",
    method: "Payment method",
    bankMobile: "Bank / Telebirr",
    cash: "Cash",
    provider: "Provider",
    transaction: "Transaction reference",
    amount: "Customer payment amount",
    reason: "Reason / status",
    reasonPlaceholder: "Example: transfer not visible in my account or reference could not be verified.",
    saveNotReceived: "Save payment-not-received status",
    cancel: "Cancel",
    confirmedHelp: "Admin/CEO can now release this Held Escrow payment.",
    notReceivedHelp: "The payment remains in Held Escrow and cannot be released.",
  },
  om: {
    kicker: "KAFFALTII CUSTOMER",
    title: "Mirkaneessa kaffaltii",
    help: "Imala erga xumurtee booda kaffaltii customer mirkaneessi. Ragaa ykn screenshot olkaa'uun hin barbaachisu.",
    empty: "Kaffaltiin customer mirkaneessuuf qophaa'e amma hin jiru.",
    initiated: "Mirkaneessa Admin eegaa jira",
    awaiting: "Mirkaneessi driver ramadamee barbaachisa",
    confirmed: "Driver ramadame kaffaltii mirkaneesseera.",
    notReceived: "Kaffaltiin hin geenye / hin mirkanoofne",
    released: "Kaffaltiin release ta'eera",
    confirm: "Kaffaltiin mirkanaa'eera",
    notReceivedAction: "Kaffaltiin hin geenye / hin mirkanoofne",
    confirming: "Mirkaneessaa jira…",
    saving: "Olkaa'aa jira…",
    refresh: "Haaromsi",
    method: "Mala kaffaltii",
    bankMobile: "Bank / Telebirr",
    cash: "Cash",
    provider: "Provider",
    transaction: "Lakkoofsa transaction",
    amount: "Maallaqa customer kaffale",
    reason: "Sababa / haala",
    reasonPlaceholder: "Fakkeenya: transfer account koo keessatti hin mul'anne ykn reference mirkaneessuun hin danda'amne.",
    saveNotReceived: "Haala kaffaltiin hin geenye olkaa'i",
    cancel: "Dhiisi",
    confirmedHelp: "Admin/CEO amma kaffaltii Held Escrow kana release gochuu danda'a.",
    notReceivedHelp: "Kaffaltiin Held Escrow keessatti tura; release hin ta'u.",
  },
  am: {
    kicker: "የደንበኛ ክፍያ",
    title: "የክፍያ ማረጋገጫ",
    help: "ጉዞው ከተጠናቀቀ በኋላ የደንበኛውን ክፍያ ያረጋግጡ። ደረሰኝ ወይም screenshot መጫን አያስፈልግም።",
    empty: "ለማረጋገጥ ዝግጁ የሆነ የደንበኛ ክፍያ የለም።",
    initiated: "የAdmin ማረጋገጫን በመጠበቅ ላይ",
    awaiting: "የተመደበው አሽከርካሪ ማረጋገጫ ያስፈልጋል",
    confirmed: "የተመደበው አሽከርካሪ ክፍያውን አረጋግጧል።",
    notReceived: "ክፍያው አልደረሰም / አልተረጋገጠም",
    released: "ክፍያው ተለቋል",
    confirm: "ክፍያው ተረጋግጧል",
    notReceivedAction: "ክፍያው አልደረሰም / አልተረጋገጠም",
    confirming: "በማረጋገጥ ላይ…",
    saving: "በማስቀመጥ ላይ…",
    refresh: "አድስ",
    method: "የክፍያ ዘዴ",
    bankMobile: "Bank / Telebirr",
    cash: "ጥሬ ገንዘብ",
    provider: "አቅራቢ",
    transaction: "የግብይት ማጣቀሻ",
    amount: "የደንበኛ ክፍያ መጠን",
    reason: "ምክንያት / ሁኔታ",
    reasonPlaceholder: "ለምሳሌ፦ ዝውውሩ በሂሳቤ አልታየም ወይም ማጣቀሻው አልተረጋገጠም።",
    saveNotReceived: "ክፍያ አልደረሰም የሚለውን አስቀምጥ",
    cancel: "ሰርዝ",
    confirmedHelp: "Admin/CEO አሁን ይህን Held Escrow ክፍያ መልቀቅ ይችላል።",
    notReceivedHelp: "ክፍያው Held Escrow ውስጥ ይቆያል እና አይለቀቅም።",
  },
};

function providerLabel(provider: string) {
  const normalized = provider.trim().toLowerCase();
  const labels: Record<string, string> = {
    cash: "Cash",
    cash_to_driver: "Cash",
    driver_cash: "Cash",
    telebirr: "Telebirr",
    cbe: "Commercial Bank of Ethiopia (CBE)",
    awash_bank: "Awash Bank",
    bank_of_abyssinia: "Bank of Abyssinia",
    dashen_bank: "Dashen Bank",
    coop_bank_oromia: "Cooperative Bank of Oromia",
    mpesa: "M-Pesa",
    other_bank: "Other bank",
  };
  return labels[normalized] ?? provider.replace(/_/g, " ");
}

function isCashProvider(provider: string) {
  return ["cash", "cash_to_driver", "driver_cash"].includes(provider.trim().toLowerCase());
}

export function DriverPaymentConfirmation({
  orderId,
  showEmpty = true,
  onChanged,
  fixture,
}: {
  orderId: string;
  showEmpty?: boolean;
  onChanged?: () => void;
  fixture?: DriverPaymentStatus[];
}) {
  const { language } = useLanguage();
  const t = copy[language];
  const [payments, setPayments] = useState<DriverPaymentStatus[]>(fixture ?? []);
  const [loading, setLoading] = useState(fixture === undefined);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [negativePaymentId, setNegativePaymentId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (fixture !== undefined) {
      setPayments(fixture);
      setLoading(false);
      return;
    }
    try {
      const rows = await getDriverPaymentStatus(orderId);
      setPayments(rows);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment status could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [fixture, orderId]);

  useEffect(() => {
    void load();
    if (fixture !== undefined) return;
    const timer = window.setInterval(() => void load(), 12_000);
    return () => window.clearInterval(timer);
  }, [fixture, load]);

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

  async function reportNotReceived(paymentId: string) {
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 3) {
      setError(t.reasonPlaceholder);
      return;
    }
    setSavingId(paymentId);
    setError("");
    try {
      await reportDriverPaymentNotReceived(paymentId, normalizedReason);
      setNegativePaymentId(null);
      setReason("");
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment status could not be saved.");
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
              const confirmed = payment.confirmation_type === "payment_confirmed" || Boolean(payment.confirmed_at);
              const notReceived = payment.confirmation_type === "payment_not_received" && !confirmed;
              const released = payment.payment_event === "released";
              const method = isCashProvider(payment.provider) ? t.cash : t.bankMobile;
              const status = released
                ? t.released
                : payment.payment_event === "initiated"
                  ? t.initiated
                  : confirmed
                    ? t.confirmed
                    : notReceived
                      ? t.notReceived
                      : t.awaiting;

              return (
                <article key={payment.payment_id} className="rounded-xl border border-asphalt/10 bg-bone p-4">
                  <div className="flex flex-col gap-3 min-[390px]:flex-row min-[390px]:items-start min-[390px]:justify-between">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-steel">{t.amount}</p>
                      <p className="mt-1 font-display text-2xl font-bold text-asphalt">{formatEtb(Number(payment.amount_etb || 0))}</p>
                    </div>
                    <span className={`self-start rounded-full px-3 py-1.5 text-[9px] font-semibold uppercase ${released || confirmed ? "bg-emerald-100 text-emerald-800" : notReceived ? "bg-route/10 text-route" : "bg-amber/15 text-amber-dim"}`}>
                      {status}
                    </span>
                  </div>

                  <dl className="mt-4 grid gap-3 border-t border-asphalt/10 pt-4 text-xs min-[390px]:grid-cols-2">
                    <Detail label={t.method} value={method} />
                    <Detail label={t.provider} value={providerLabel(payment.provider)} />
                    {payment.provider_ref && <Detail label={t.transaction} value={payment.provider_ref} mono />}
                  </dl>

                  {confirmed && !released && payment.payment_event === "held_escrow" && (
                    <p className="mt-4 border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-900">
                      <strong>{t.confirmed}</strong> {t.confirmedHelp}
                    </p>
                  )}

                  {notReceived && (
                    <p className="mt-4 border border-route/25 bg-route/5 p-3 text-xs leading-5 text-route">
                      <strong>{t.notReceived}.</strong> {t.notReceivedHelp}
                      {payment.confirmation_reason && <span className="mt-1 block text-asphalt">{payment.confirmation_reason}</span>}
                    </p>
                  )}

                  {payment.can_confirm && (
                    <div className="mt-4 grid gap-3">
                      <button
                        type="button"
                        disabled={savingId === payment.payment_id}
                        onClick={() => void confirm(payment.payment_id)}
                        className="min-h-12 w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {savingId === payment.payment_id ? t.confirming : t.confirm}
                      </button>

                      {payment.can_report_not_received && (
                        <button
                          type="button"
                          disabled={savingId === payment.payment_id}
                          onClick={() => {
                            setNegativePaymentId(payment.payment_id);
                            setReason("");
                            setError("");
                          }}
                          className="min-h-12 w-full rounded-xl border border-route px-4 py-3 text-sm font-semibold text-route disabled:opacity-50"
                        >
                          {t.notReceivedAction}
                        </button>
                      )}
                    </div>
                  )}

                  {negativePaymentId === payment.payment_id && (
                    <div className="mt-4 border border-route/25 bg-white p-4">
                      <label className="block text-xs font-semibold text-asphalt">
                        {t.reason}
                        <textarea
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                          rows={3}
                          maxLength={500}
                          placeholder={t.reasonPlaceholder}
                          className="mt-2 block w-full border border-asphalt/20 p-3 text-sm font-normal"
                        />
                      </label>
                      <div className="mt-3 grid gap-2 min-[390px]:grid-cols-2">
                        <button type="button" disabled={savingId === payment.payment_id || reason.trim().length < 3} onClick={() => void reportNotReceived(payment.payment_id)} className="min-h-11 bg-route px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">
                          {savingId === payment.payment_id ? t.saving : t.saveNotReceived}
                        </button>
                        <button type="button" onClick={() => { setNegativePaymentId(null); setReason(""); }} className="min-h-11 border border-asphalt/20 px-4 py-3 text-sm font-semibold">
                          {t.cancel}
                        </button>
                      </div>
                    </div>
                  )}
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

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-steel">{label}</dt>
      <dd className={`mt-1 break-all font-semibold text-asphalt ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
