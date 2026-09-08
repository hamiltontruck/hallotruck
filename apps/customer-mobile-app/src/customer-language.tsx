import { useEffect, useState } from "react";

export type CustomerLanguage = "en" | "om" | "am";

const LANGUAGE_KEY = "hallo-customer-language";
const LANGUAGE_EVENT = "hallo-customer-language-change";

export const customerBookingCopy = {
  en: {
    newBooking: "New booking",
    findingRoute: "Finding route",
    bookTrip: "BOOK YOUR TRIP",
    chooseTruckCargo: "Choose truck & cargo",
    subtitle: "Select the best vehicle and load details for your delivery.",
    route: "Route",
    truck: "Truck",
    cargo: "Cargo",
    load: "Load",
    quote: "Quote",
    confirm: "Confirm",
    chooseTruck: "Choose truck type",
    maxLoad: "Max load",
    cargoCategory: "Cargo category",
    packaging: "Packaging / load type",
    loadAmount: "Load amount",
    unit: "Unit",
    notes: "Notes / handling instructions",
    optional: "Optional",
    notesHelp: "Optional; does not change the transport quote.",
    additionalDetails: "Additional cargo details",
    detailsAdded: "Details added",
    estimatedQuote: "Estimated quote",
    currentRate: "Current Admin-managed transport rate.",
    enterLoad: "Enter the load amount to calculate Birr automatically.",
    calculating: "Calculating…",
    calculateQuote: "Calculate Quote",
    refreshQuote: "Refresh Quote",
    paymentMethod: "Payment method",
    cash: "Cash to driver",
    bankTelebirr: "Bank / Telebirr",
    confirmOrder: "Confirm Order",
    submitting: "Creating order…",
    completeRequired: "Complete every required field and a valid quote to confirm the order.",
    ready: "Booking details are complete and ready to confirm.",
    required: "Required",
  },
  om: {
    newBooking: "Booking haaraa",
    findingRoute: "Daandii barbaadaa jira",
    bookTrip: "GEEJJIBA KEESSAN BOOK GODHAA",
    chooseTruckCargo: "Truck fi feʼumsa fili",
    subtitle: "Geejjiba keessaniif konkolaataa fi ibsa feʼumsaa sirrii fili.",
    route: "Daandii",
    truck: "Truck",
    cargo: "Feʼumsa",
    load: "Baayʼina",
    quote: "Gatii",
    confirm: "Mirkaneessi",
    chooseTruck: "Gosa truck fili",
    maxLoad: "Feʼumsa olaanaa",
    cargoCategory: "Gosa feʼumsaa",
    packaging: "Akkaataa kuusaa / feʼumsaa",
    loadAmount: "Baayʼina feʼumsaa",
    unit: "Safartuu",
    notes: "Yaadannoo / qajeelfama qabannaa",
    optional: "Filannoo",
    notesHelp: "Filannoo dha; gatii geejjibaa hin jijjiiru.",
    additionalDetails: "Ibsa feʼumsaa dabalataa",
    detailsAdded: "Ibsi dabalameera",
    estimatedQuote: "Gatii tilmaamaa",
    currentRate: "Gatii yeroo ammaa Admin qindeesse.",
    enterLoad: "Gatiin akka shallagamu baayʼina feʼumsaa galchi.",
    calculating: "Shallagaa jira…",
    calculateQuote: "Gatii shallagi",
    refreshQuote: "Gatii haaromsi",
    paymentMethod: "Mala kaffaltii",
    cash: "Cash driverʼtti",
    bankTelebirr: "Bank / Telebirr",
    confirmOrder: "Order mirkaneessi",
    submitting: "Order uumamaa jira…",
    completeRequired: "Order mirkaneessuuf dirree barbaachisu hunda fi gatii sirrii guuti.",
    ready: "Ibsi booking guutameera; mirkaneessuuf qophaaʼeera.",
    required: "Barbaachisaa",
  },
  am: {
    newBooking: "አዲስ ትዕዛዝ",
    findingRoute: "መንገድ በመፈለግ ላይ",
    bookTrip: "መጓጓዣዎን ይያዙ",
    chooseTruckCargo: "መኪና እና ጭነት ይምረጡ",
    subtitle: "ለማድረሻዎ ተስማሚውን መኪና እና የጭነት ዝርዝር ይምረጡ።",
    route: "መንገድ",
    truck: "መኪና",
    cargo: "ጭነት",
    load: "መጠን",
    quote: "ዋጋ",
    confirm: "ማረጋገጫ",
    chooseTruck: "የመኪና አይነት ይምረጡ",
    maxLoad: "ከፍተኛ ጭነት",
    cargoCategory: "የጭነት ዓይነት",
    packaging: "የማሸጊያ / የጭነት አይነት",
    loadAmount: "የጭነት መጠን",
    unit: "መለኪያ",
    notes: "ማስታወሻ / የአያያዝ መመሪያ",
    optional: "አማራጭ",
    notesHelp: "አማራጭ ነው፤ የመጓጓዣ ዋጋን አይቀይርም።",
    additionalDetails: "ተጨማሪ የጭነት ዝርዝር",
    detailsAdded: "ዝርዝር ተጨምሯል",
    estimatedQuote: "ግምታዊ ዋጋ",
    currentRate: "አሁን በAdmin የተዘጋጀ ዋጋ።",
    enterLoad: "ዋጋው እንዲሰላ የጭነት መጠን ያስገቡ።",
    calculating: "በማስላት ላይ…",
    calculateQuote: "ዋጋ አስላ",
    refreshQuote: "ዋጋ አድስ",
    paymentMethod: "የክፍያ ዘዴ",
    cash: "ጥሬ ገንዘብ ለአሽከርካሪ",
    bankTelebirr: "ባንክ / ቴሌብር",
    confirmOrder: "ትዕዛዝ ያረጋግጡ",
    submitting: "ትዕዛዝ እየተፈጠረ ነው…",
    completeRequired: "ትዕዛዙን ለማረጋገጥ ሁሉንም አስፈላጊ መረጃ እና ትክክለኛ ዋጋ ይሙሉ።",
    ready: "የትዕዛዙ መረጃ ተሟልቷል፤ ለማረጋገጥ ዝግጁ ነው።",
    required: "አስፈላጊ",
  },
} as const;

function readLanguage(): CustomerLanguage {
  const value = window.localStorage.getItem(LANGUAGE_KEY);
  return value === "en" || value === "am" || value === "om" ? value : "om";
}

export function useCustomerLanguage() {
  const [language, setLanguageState] = useState<CustomerLanguage>(readLanguage);

  useEffect(() => {
    function syncLanguage() {
      setLanguageState(readLanguage());
    }
    window.addEventListener(LANGUAGE_EVENT, syncLanguage);
    window.addEventListener("storage", syncLanguage);
    return () => {
      window.removeEventListener(LANGUAGE_EVENT, syncLanguage);
      window.removeEventListener("storage", syncLanguage);
    };
  }, []);

  function setLanguage(next: CustomerLanguage) {
    window.localStorage.setItem(LANGUAGE_KEY, next);
    document.documentElement.lang = next;
    setLanguageState(next);
    window.dispatchEvent(new Event(LANGUAGE_EVENT));
  }

  return { language, setLanguage, text: customerBookingCopy[language] };
}

export function CustomerLanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage } = useCustomerLanguage();
  const options: Array<{ value: CustomerLanguage; label: string; title: string }> = [
    { value: "en", label: "EN", title: "English" },
    { value: "om", label: "OR", title: "Afaan Oromoo" },
    { value: "am", label: "አማ", title: "Amharic" },
  ];

  return (
    <div className={`customer-language-switcher ${compact ? "is-compact" : ""}`} role="group" aria-label="Language">
      {options.map((option, index) => (
        <span className="customer-language-choice" key={option.value}>
          {index > 0 && <span className="customer-language-separator" aria-hidden="true">|</span>}
          <button
            type="button"
            className={language === option.value ? "is-active" : ""}
            aria-pressed={language === option.value}
            aria-label={option.title}
            title={option.title}
            onClick={() => setLanguage(option.value)}
          >
            {option.label}
          </button>
        </span>
      ))}
    </div>
  );
}
