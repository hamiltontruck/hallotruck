import { Link } from "react-router-dom";
import { DriverCommissionWallet } from "../components/driver/DriverCommissionWallet";
import { DriverDepositBalance } from "../components/driver/DriverDepositBalance";
import { useLanguage } from "../i18n/LanguageProvider";

const copy = {
  en: {
    kicker: "DRIVER FINANCE",
    title: "Wallet and earnings control",
    description: "See your deposit, HALLO commission position and released trip earnings without mixing customer collections with your own money.",
    collections: "Customer collections",
    collectionsHelp: "Money confirmed for a trip remains linked to that order and its payment status.",
    earnings: "Driver earnings",
    earningsHelp: "Your earnings come from released trip funds after the recorded HALLO commission.",
    commission: "HALLO commission",
    commissionHelp: "Commission uses your prepaid deposit first. A job lock applies only when commission remains due.",
    history: "Open trip earnings and history",
    historyHelp: "Review every completed route, payment state, released amount and net earnings.",
    live: "Live wallet controls",
  },
  om: {
    kicker: "FAAYINAANSII DRIVER",
    title: "Wallet fi galii to'annoo",
    description: "Maallaqa customer irraa walitti qabame, deposit kee, komishinii HALLO fi galii imalaa walitti hin makiin bakka tokko irraa ilaali.",
    collections: "Maallaqa customer",
    collectionsHelp: "Maallaqni imalaaf mirkanaa'e ajaja fi haala kaffaltii isaa waliin walqabatee hafa.",
    earnings: "Galii driver",
    earningsHelp: "Galiin kee maallaqa imalaa release ta'e keessaa komishinii HALLO galmaa'e erga hir'atee booda argama.",
    commission: "Komishinii HALLO",
    commissionHelp: "Komishiniin dura deposit kee keessaa hir'ata. Hojii fudhachuu kan dhoorku komishiniin kaffalamuu qabu yoo hafe qofa.",
    history: "Galii fi seenaa imalaa bani",
    historyHelp: "Daandii xumurame, haala kaffaltii, maallaqa release ta'e fi galii qulqulluu hunda ilaali.",
    live: "To'annoo wallet kallattii",
  },
  am: {
    kicker: "የአሽከርካሪ ፋይናንስ",
    title: "ዋሌት እና ገቢ መቆጣጠሪያ",
    description: "የደንበኛ ክፍያ፣ ዲፖዚት፣ የHALLO ኮሚሽን እና የጉዞ ገቢን ሳይቀላቀሉ በአንድ ቦታ ይመልከቱ።",
    collections: "የደንበኛ ክፍያ",
    collectionsHelp: "ለጉዞ የተረጋገጠ ገንዘብ ከትዕዛዙና ከክፍያ ሁኔታው ጋር ተያይዞ ይቆያል።",
    earnings: "የአሽከርካሪ ገቢ",
    earningsHelp: "ገቢዎ የHALLO ኮሚሽን ከተመዘገበ በኋላ ከተለቀቀ የጉዞ ገንዘብ ይመጣል።",
    commission: "የHALLO ኮሚሽን",
    commissionHelp: "ኮሚሽን መጀመሪያ ከቅድመ ክፍያ ዲፖዚትዎ ይቀነሳል። ሥራ የሚታገደው የሚከፈል ኮሚሽን ሲቀር ብቻ ነው።",
    history: "የጉዞ ገቢና ታሪክ ይክፈቱ",
    historyHelp: "የተጠናቀቀ መንገድ፣ የክፍያ ሁኔታ፣ የተለቀቀ መጠንና የተጣራ ገቢ ይመልከቱ።",
    live: "ቀጥታ የዋሌት መቆጣጠሪያ",
  },
} as const;

export function DriverWallet() {
  const { language } = useLanguage();
  const text = copy[language];

  return (
    <main className="mx-auto max-w-5xl overflow-x-hidden px-4 py-8 pb-28 sm:px-6 sm:py-12 md:pb-12">
      <header className="overflow-hidden bg-asphalt p-5 text-white sm:p-8">
        <p className="font-mono text-[10px] uppercase tracking-[.18em] text-amber">{text.kicker}</p>
        <h1 className="mt-3 break-words font-display text-3xl font-bold sm:text-4xl">{text.title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">{text.description}</p>
      </header>

      <section className="mt-4 grid gap-3 sm:grid-cols-3" aria-label="Driver finance explanation">
        <FinanceGuide title={text.collections} detail={text.collectionsHelp} marker="1" />
        <FinanceGuide title={text.earnings} detail={text.earningsHelp} marker="2" />
        <FinanceGuide title={text.commission} detail={text.commissionHelp} marker="3" />
      </section>

      <Link
        to="/driver/earnings"
        className="mt-4 flex min-w-0 flex-col gap-3 border border-emerald-700/25 bg-emerald-50 p-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <span className="min-w-0">
          <strong className="block break-words font-display text-lg text-asphalt">{text.history}</strong>
          <span className="mt-1 block break-words text-xs leading-5 text-steel">{text.historyHelp}</span>
        </span>
        <span className="shrink-0 text-sm font-semibold text-emerald-800">→</span>
      </Link>

      <section className="mt-8" aria-labelledby="wallet-live-title">
        <div className="mb-4">
          <p className="font-mono text-[10px] uppercase tracking-[.18em] text-amber-dim">HALLOTRUCK</p>
          <h2 id="wallet-live-title" className="mt-1 font-display text-2xl font-bold text-asphalt">{text.live}</h2>
        </div>
        <div className="space-y-6">
          <DriverDepositBalance />
          <DriverCommissionWallet />
        </div>
      </section>
    </main>
  );
}

function FinanceGuide({ title, detail, marker }: { title: string; detail: string; marker: string }) {
  return (
    <article className="min-w-0 border border-asphalt/10 bg-white p-4 sm:p-5">
      <span className="grid h-8 w-8 place-items-center bg-amber/15 font-mono text-xs font-bold text-amber-dim">{marker}</span>
      <h2 className="mt-4 break-words font-display text-lg font-semibold text-asphalt">{title}</h2>
      <p className="mt-2 break-words text-xs leading-5 text-steel">{detail}</p>
    </article>
  );
}
