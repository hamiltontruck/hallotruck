import { useEffect, useState, type FormEvent } from "react";
import { useLanguage, type HalloLanguage } from "../../i18n/LanguageProvider";
import { getCustomerRating, saveCustomerRating, type DriverRating } from "../../services/ratings.service";

const copy: Record<HalloLanguage, {
  kicker: string;
  title: string;
  desc: string;
  comment: string;
  placeholder: string;
  save: string;
  saving: string;
  saved: string;
  update: string;
  loadError: string;
  saveError: string;
  star: string;
}> = {
  en: {
    kicker: "DELIVERY FEEDBACK",
    title: "Rate your driver",
    desc: "Your rating helps HALLOTRUCK maintain safe, reliable service.",
    comment: "Optional note",
    placeholder: "Share a short comment about the delivery…",
    save: "Submit rating",
    saving: "Saving…",
    saved: "Rating saved",
    update: "Update rating",
    loadError: "Could not load your rating.",
    saveError: "Rating could not be saved.",
    star: "star",
  },
  om: {
    kicker: "YAADA GEEJJIBAA",
    title: "Konkolaachisaa madaali",
    desc: "Madaalliin kee HALLOTRUCK tajaajila nageenya qabu fi amanamaa eeguu gargaara.",
    comment: "Yaada dabalataa (dirqama miti)",
    placeholder: "Waa'ee geejjibaa yaada gabaabaa barreessi…",
    save: "Madaallii ergi",
    saving: "Olkaa'aa jira…",
    saved: "Madaalliin olkaa'ame",
    update: "Madaallii haaromsi",
    loadError: "Madaallii kee fe'uun hin milkoofne.",
    saveError: "Madaalliin olkaa'amuu hin dandeenye.",
    star: "urjii",
  },
  am: {
    kicker: "የማድረስ አስተያየት",
    title: "አሽከርካሪዎን ይገምግሙ",
    desc: "ግምገማዎ HALLOTRUCK ደህንነቱ የተጠበቀና አስተማማኝ አገልግሎት እንዲጠብቅ ይረዳል።",
    comment: "አማራጭ አስተያየት",
    placeholder: "ስለ ማድረሱ አጭር አስተያየት ይጻፉ…",
    save: "ግምገማ ላክ",
    saving: "በማስቀመጥ ላይ…",
    saved: "ግምገማው ተቀምጧል",
    update: "ግምገማ አዘምን",
    loadError: "ግምገማዎን መጫን አልተቻለም።",
    saveError: "ግምገማውን ማስቀመጥ አልተቻለም።",
    star: "ኮከብ",
  },
};

export function CustomerRatingCard({ orderId, driverName }: { orderId: string; driverName: string }) {
  const { language } = useLanguage();
  const t = copy[language];
  const [rating, setRating] = useState<DriverRating | null>(null);
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCustomerRating(orderId)
      .then((current) => {
        if (cancelled) return;
        setRating(current);
        setScore(current?.score ?? 0);
        setComment(current?.comment ?? "");
        setError("");
      })
      .catch(() => {
        if (!cancelled) setError(t.loadError);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [orderId, t.loadError]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!score || busy) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const next = await saveCustomerRating({ orderId, score, comment });
      setRating(next);
      setScore(next.score);
      setComment(next.comment ?? "");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.saveError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-5 rounded-2xl border border-amber/30 bg-amber/5 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.18em] text-amber-dim">{t.kicker}</p>
          <h3 className="mt-1 font-display text-xl font-semibold text-asphalt">{t.title}</h3>
          <p className="mt-1 text-sm text-steel">{driverName} · {t.desc}</p>
        </div>
        {rating && <span className="rounded-full bg-emerald-700 px-3 py-2 text-[10px] font-semibold uppercase text-white">{t.saved}</span>}
      </div>

      {loading ? <p className="mt-4 text-xs text-steel">…</p> : <form onSubmit={submit} className="mt-4">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t.title}>
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={score === value}
              aria-label={`${value} ${t.star}`}
              onClick={() => { setScore(value); setSaved(false); }}
              className={`grid h-12 w-12 place-items-center rounded-xl border text-2xl transition ${value <= score ? "border-amber bg-amber/15 text-amber-dim" : "border-asphalt/10 bg-white text-steel/45"}`}
            >
              ★
            </button>
          ))}
        </div>

        <label className="mt-4 block text-xs font-semibold text-asphalt">
          {t.comment}
          <textarea
            value={comment}
            onChange={(event) => { setComment(event.target.value); setSaved(false); }}
            maxLength={500}
            rows={3}
            placeholder={t.placeholder}
            className="mt-2 block w-full resize-y rounded-xl border border-asphalt/15 bg-white px-4 py-3 text-sm font-normal outline-none focus:border-amber"
          />
        </label>

        {error && <p className="mt-3 text-xs text-route">{error}</p>}
        {saved && <p className="mt-3 text-xs font-semibold text-emerald-800">{t.saved}</p>}

        <button
          disabled={busy || score === 0}
          className="mt-4 min-h-11 rounded-xl bg-asphalt px-5 py-3 text-xs font-semibold text-white disabled:opacity-40"
        >
          {busy ? t.saving : rating ? t.update : t.save}
        </button>
      </form>}
    </section>
  );
}
