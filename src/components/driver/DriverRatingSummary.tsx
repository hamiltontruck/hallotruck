import { useEffect, useState } from "react";
import { useLanguage, type HalloLanguage } from "../../i18n/LanguageProvider";
import { getDriverRatingSummary, type DriverRatingSummary as RatingSummary } from "../../services/ratings.service";

const copy: Record<HalloLanguage, {
  kicker: string;
  title: string;
  reviews: string;
  noRatings: string;
  recent: string;
  error: string;
}> = {
  en: {
    kicker: "CUSTOMER TRUST",
    title: "Driver rating",
    reviews: "reviews",
    noRatings: "No customer ratings yet. Completed deliveries can be rated by the customer.",
    recent: "Recent feedback",
    error: "Could not load driver ratings.",
  },
  om: {
    kicker: "AMANAMUMMAA MAAMILAA",
    title: "Madaallii konkolaachisaa",
    reviews: "madaallii",
    noRatings: "Madaalliin maamilaa amma hin jiru. Geejjiba xumurame maamilaan madaaluu danda'a.",
    recent: "Yaada dhihoo",
    error: "Madaallii konkolaachisaa fe'uun hin milkoofne.",
  },
  am: {
    kicker: "የደንበኛ እምነት",
    title: "የአሽከርካሪ ግምገማ",
    reviews: "ግምገማዎች",
    noRatings: "እስካሁን የደንበኛ ግምገማ የለም። የተጠናቀቁ ማድረሶችን ደንበኛው መገምገም ይችላል።",
    recent: "የቅርብ ጊዜ አስተያየት",
    error: "የአሽከርካሪ ግምገማዎችን መጫን አልተቻለም።",
  },
};

export function DriverRatingSummary() {
  const { language } = useLanguage();
  const t = copy[language];
  const [data, setData] = useState<RatingSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getDriverRatingSummary()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError("");
        }
      })
      .catch(() => {
        if (!cancelled) setError(t.error);
      });
    return () => { cancelled = true; };
  }, [t.error]);

  if (error) return <p className="mb-6 border border-route/30 bg-route/5 px-4 py-3 text-sm text-route">{error}</p>;
  if (!data) return null;

  return (
    <section className="mb-8 rounded-2xl border border-amber/30 bg-amber/5 p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.18em] text-amber-dim">{t.kicker}</p>
          <h2 className="mt-1 font-display text-xl font-bold text-asphalt">{t.title}</h2>
        </div>
        {data.count > 0 && <div className="text-right">
          <p className="font-display text-3xl font-bold text-asphalt">{data.average.toFixed(1)} <span className="text-amber-dim">★</span></p>
          <p className="text-xs text-steel">{data.count} {t.reviews}</p>
        </div>}
      </div>

      {data.count === 0 ? <p className="mt-4 text-sm text-steel">{t.noRatings}</p> : data.recent.length > 0 && <div className="mt-5 border-t border-amber/20 pt-4">
        <p className="font-mono text-[9px] uppercase tracking-[.16em] text-steel">{t.recent}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {data.recent.map((rating) => <blockquote key={rating.id} className="rounded-xl border border-asphalt/10 bg-white p-4 text-xs leading-5 text-steel">
            <p className="mb-2 text-amber-dim">{"★".repeat(rating.score)}<span className="text-steel/20">{"★".repeat(5 - rating.score)}</span></p>
            <p>“{rating.comment}”</p>
          </blockquote>)}
        </div>
      </div>}
    </section>
  );
}
