import { useCallback, useEffect, useState } from "react";
import { buildTripCompletionSteps, type TripCompletionSummary } from "../../domain/trip-completion";
import { getTripCompletionSummary } from "../../services/trip-completion.service";
import { formatEtb } from "../../utils/currency";
import { useLanguage, type HalloLanguage } from "../../i18n/LanguageProvider";

const copy: Record<HalloLanguage, {
  title: string;
  help: string;
  delivery: string;
  payment: string;
  commission: string;
  rating: string;
  complete: string;
  current: string;
  waiting: string;
  attention: string;
  loadError: string;
  retry: string;
  balance: string;
}> = {
  en: {
    title: "Trip completion",
    help: "One secure path from proof of delivery to payment, commission and feedback.",
    delivery: "Delivery", payment: "Payment", commission: "Commission", rating: "Rating",
    complete: "Complete", current: "In progress", waiting: "Waiting", attention: "Action needed",
    loadError: "Completion status could not be loaded.", retry: "Retry", balance: "Balance due",
  },
  om: {
    title: "Xumura imalaa",
    help: "Ragaa geessuu irraa gara kaffaltii, commission fi madaalliitti tartiiba nageenya qabu.",
    delivery: "Geessuu", payment: "Kaffaltii", commission: "Commission", rating: "Madaallii",
    complete: "Xumurame", current: "Adeemaa jira", waiting: "Eegaa jira", attention: "Tarkaanfii barbaada",
    loadError: "Haala xumura imalaa fe'uun hin dandeenye.", retry: "Irra deebi'i", balance: "Kaffaltii hafe",
  },
  am: {
    title: "የጉዞ ማጠናቀቂያ",
    help: "ከማድረሻ ማስረጃ ወደ ክፍያ፣ ኮሚሽንና ግምገማ የሚወስድ ደህንነቱ የተጠበቀ ሂደት።",
    delivery: "ማድረስ", payment: "ክፍያ", commission: "ኮሚሽን", rating: "ግምገማ",
    complete: "ተጠናቋል", current: "በሂደት ላይ", waiting: "በመጠበቅ ላይ", attention: "እርምጃ ያስፈልጋል",
    loadError: "የማጠናቀቂያ ሁኔታው ሊጫን አልቻለም።", retry: "እንደገና ሞክር", balance: "ቀሪ ክፍያ",
  },
};

export function TripCompletionProgress({
  orderId,
  audience,
  initialSummary,
}: {
  orderId: string;
  audience: "customer" | "driver";
  initialSummary?: TripCompletionSummary;
}) {
  const { language } = useLanguage();
  const t = copy[language];
  const [summary, setSummary] = useState<TripCompletionSummary | null>(initialSummary ?? null);
  const [loading, setLoading] = useState(!initialSummary);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (initialSummary) return;
    setLoading(true);
    try {
      setSummary(await getTripCompletionSummary(orderId));
      setError("");
    } catch {
      setError(t.loadError);
    } finally {
      setLoading(false);
    }
  }, [initialSummary, orderId, t.loadError]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <section className="mt-5 min-w-0 border border-asphalt/10 bg-white p-5" aria-busy="true"><p className="text-sm text-steel">{t.title}…</p></section>;
  if (!summary) return <section className="mt-5 min-w-0 border border-route/25 bg-route/5 p-5"><p className="text-sm text-route">{error || t.loadError}</p><button type="button" onClick={() => void load()} className="mt-3 min-h-11 border border-route px-4 py-2 text-sm font-semibold text-route">{t.retry}</button></section>;

  const steps = buildTripCompletionSteps(summary, audience);
  const labels = { delivery: t.delivery, payment: t.payment, commission: t.commission, rating: t.rating };
  const stateLabels = { complete: t.complete, current: t.current, waiting: t.waiting, attention: t.attention };

  return (
    <section className="trip-completion-progress mt-5 min-w-0 overflow-hidden rounded-2xl border border-asphalt/10 bg-white p-4 sm:p-5" aria-labelledby={`completion-${orderId}`}>
      <h3 id={`completion-${orderId}`} className="font-display text-xl font-semibold text-asphalt">{t.title}</h3>
      <p className="mt-1 text-xs leading-5 text-steel">{t.help}</p>
      <ol className={`mt-4 grid min-w-0 gap-2 ${steps.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
        {steps.map((step, index) => (
          <li key={step.key} className={`min-w-0 rounded-xl border p-3 trip-completion-step--${step.state}`}>
            <div className="flex items-center gap-2">
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${step.state === "complete" ? "bg-emerald-700 text-white" : step.state === "attention" ? "bg-route text-white" : "bg-asphalt/8 text-asphalt"}`}>{step.state === "complete" ? "✓" : index + 1}</span>
              <span className="min-w-0 break-words text-xs font-semibold text-asphalt">{labels[step.key]}</span>
            </div>
            <p className={`mt-2 text-[10px] font-semibold ${step.state === "attention" ? "text-route" : "text-steel"}`}>{stateLabels[step.state]}</p>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex min-w-0 flex-wrap gap-x-5 gap-y-2 border-t border-asphalt/10 pt-4 text-xs">
        <span className="break-words"><b>{t.balance}:</b> {formatEtb(summary.balance_due_etb)}</span>
        {audience === "driver" && <span className="break-words"><b>{t.commission}:</b> {formatEtb(summary.commission_charged_etb)}</span>}
      </div>
    </section>
  );
}
