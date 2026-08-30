import { useEffect, useState } from "react";
import { useLanguage, type HalloLanguage } from "../../i18n/LanguageProvider";

const CUSTOMER_LOCATION_KEY = "hallotruck:customer-location";

type LocationState = "idle" | "requesting" | "shared" | "denied" | "unsupported";

const copy: Record<HalloLanguage, {
  eyebrow: string;
  title: string;
  description: string;
  share: string;
  sharing: string;
  shared: string;
  denied: string;
  unsupported: string;
  clear: string;
  privacy: string;
}> = {
  en: {
    eyebrow: "LOCATION & PRIVACY",
    title: "Share location only when you choose",
    description: "Your device location helps the customer map start near you. HALLOTRUCK does not request it automatically from hidden pages.",
    share: "Share current location",
    sharing: "Requesting permission…",
    shared: "Location is available for this browser session.",
    denied: "Location was not shared. You can continue using the portal normally.",
    unsupported: "This browser does not support device location.",
    clear: "Clear shared location",
    privacy: "Stored only in this browser session; it is not written to your customer profile.",
  },
  om: {
    eyebrow: "BAKKA FI ICCITII",
    title: "Bakka kee yeroo ati filatte qofa qoodi",
    description: "Bakki device kee kaartaan customer naannoo kee irraa akka jalqabu gargaara. HALLOTRUCK page dhokataa irraa ofumaan hin gaafatu.",
    share: "Bakka amma jiru qoodi",
    sharing: "Hayyama gaafachaa jira…",
    shared: "Bakki kun session browser kanaaf qoodameera.",
    denied: "Bakki hin qoodamne. Portal kana akkuma jirutti fayyadamuu dandeessa.",
    unsupported: "Browser kun location device hin deeggaru.",
    clear: "Bakka qoodame haqi",
    privacy: "Session browser kana keessatti qofa kuufama; profile customer kee irratti hin barreeffamu.",
  },
  am: {
    eyebrow: "አካባቢ እና ግላዊነት",
    title: "አካባቢዎን ሲመርጡ ብቻ ያጋሩ",
    description: "የመሣሪያዎ አካባቢ የደንበኛ ካርታው በአቅራቢያዎ እንዲጀምር ይረዳል። HALLOTRUCK ከተደበቁ ገጾች በራስ-ሰር አይጠይቅም።",
    share: "የአሁኑን አካባቢ አጋራ",
    sharing: "ፈቃድ በመጠየቅ ላይ…",
    shared: "አካባቢው ለዚህ የአሳሽ ክፍለ ጊዜ ተጋርቷል።",
    denied: "አካባቢው አልተጋራም። ፖርታሉን መጠቀም መቀጠል ይችላሉ።",
    unsupported: "ይህ አሳሽ የመሣሪያ አካባቢን አይደግፍም።",
    clear: "የተጋራውን አካባቢ አጽዳ",
    privacy: "በዚህ የአሳሽ ክፍለ ጊዜ ብቻ ይቀመጣል፤ በደንበኛ መገለጫዎ ላይ አይጻፍም።",
  },
};

export function CustomerLocationControl() {
  const { language } = useLanguage();
  const text = copy[language];
  const [state, setState] = useState<LocationState>("idle");

  useEffect(() => {
    if (window.sessionStorage.getItem(CUSTOMER_LOCATION_KEY)) setState("shared");
  }, []);

  function requestLocation() {
    if (!("geolocation" in navigator)) {
      setState("unsupported");
      return;
    }

    setState("requesting");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const location = {
          lng: coords.longitude,
          lat: coords.latitude,
          accuracyM: coords.accuracy,
          capturedAt: new Date().toISOString(),
        };
        window.sessionStorage.setItem(CUSTOMER_LOCATION_KEY, JSON.stringify(location));
        window.dispatchEvent(new CustomEvent("hallotruck:customer-location", { detail: location }));
        setState("shared");
      },
      () => setState("denied"),
      {
        enableHighAccuracy: true,
        maximumAge: 5 * 60 * 1000,
        timeout: 12_000,
      },
    );
  }

  function clearLocation() {
    window.sessionStorage.removeItem(CUSTOMER_LOCATION_KEY);
    window.dispatchEvent(new CustomEvent("hallotruck:customer-location-cleared"));
    setState("idle");
  }

  const status = state === "shared"
    ? text.shared
    : state === "denied"
      ? text.denied
      : state === "unsupported"
        ? text.unsupported
        : text.privacy;

  return (
    <section className="border border-asphalt/10 bg-white p-5 sm:p-6" aria-labelledby="customer-location-title">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[.18em] text-emerald-700">{text.eyebrow}</p>
          <h2 id="customer-location-title" className="mt-2 break-words font-display text-xl font-bold text-asphalt">{text.title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-steel">{text.description}</p>
          <p className={`mt-3 text-xs leading-5 ${state === "denied" || state === "unsupported" ? "text-route" : state === "shared" ? "font-semibold text-emerald-800" : "text-steel"}`} role="status">
            {status}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:max-w-56 sm:justify-end">
          <button
            type="button"
            onClick={requestLocation}
            disabled={state === "requesting"}
            className="min-h-11 bg-asphalt px-4 py-3 text-xs font-semibold text-white disabled:opacity-50"
          >
            {state === "requesting" ? text.sharing : text.share}
          </button>
          {state === "shared" && (
            <button type="button" onClick={clearLocation} className="min-h-11 border border-asphalt/20 px-4 py-3 text-xs font-semibold text-asphalt">
              {text.clear}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
