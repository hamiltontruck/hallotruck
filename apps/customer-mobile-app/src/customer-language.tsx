import { useEffect, useState } from "react";

export type CustomerLanguage = "en" | "om" | "am";

const LANGUAGE_KEY = "hallo-customer-language";
const LANGUAGE_EVENT = "hallo-customer-language-change";

export const customerBookingCopy = {
  en: { newBooking:"New booking", findingRoute:"Finding route", bookTrip:"BOOK YOUR TRIP", chooseTruckCargo:"Choose truck & cargo", subtitle:"Select the best vehicle and load details for your delivery.", route:"Route", truck:"Truck", cargo:"Cargo", load:"Load", quote:"Quote", confirm:"Confirm", chooseTruck:"Choose truck type", maxLoad:"Max load", cargoCategory:"Cargo category", packaging:"Packaging / load type", loadAmount:"Load amount", unit:"Unit", notes:"Notes / handling instructions", optional:"Optional", notesHelp:"Optional; does not change the transport quote.", additionalDetails:"Additional cargo details", detailsAdded:"Details added", estimatedQuote:"Estimated quote", currentRate:"Current Admin-managed transport rate.", enterLoad:"Enter the load amount to calculate Birr automatically.", calculating:"Calculating…", calculateQuote:"Calculate Quote", refreshQuote:"Refresh Quote", paymentMethod:"Payment method", cash:"Cash to driver", bankTelebirr:"Bank / Telebirr", confirmOrder:"Confirm Order", submitting:"Creating order…", completeRequired:"Complete every required field and a valid quote to confirm the order.", ready:"Booking details are complete and ready to confirm.", required:"Required" },
  om: { newBooking:"Booking haaraa", findingRoute:"Daandii barbaadaa jira", bookTrip:"GEEJJIBA KEESSAN AJADHAA", chooseTruckCargo:"Konkolaataa fi feʼumsa fili", subtitle:"Geejjiba keessaniif konkolaataa fi ibsa feʼumsaa sirrii fili.", route:"Daandii", truck:"Konkolaataa", cargo:"Feʼumsa", load:"Baayʼina", quote:"Gatii", confirm:"Mirkaneessi", chooseTruck:"Gosa konkolaataa fili", maxLoad:"Feʼumsa olaanaa", cargoCategory:"Gosa feʼumsaa", packaging:"Akkaataa kuusaa / feʼumsaa", loadAmount:"Baayʼina feʼumsaa", unit:"Safartuu", notes:"Yaadannoo / qajeelfama qabannaa", optional:"Filannoo", notesHelp:"Filannoo dha; gatii geejjibaa hin jijjiiru.", additionalDetails:"Ibsa feʼumsaa dabalataa", detailsAdded:"Ibsi dabalameera", estimatedQuote:"Gatii tilmaamaa", currentRate:"Gatii yeroo ammaa bulchiinsi qindeesse.", enterLoad:"Gatiin akka shallagamu baayʼina feʼumsaa galchi.", calculating:"Shallagaa jira…", calculateQuote:"Gatii shallagi", refreshQuote:"Gatii haaromsi", paymentMethod:"Mala kaffaltii", cash:"Maallaqa callaa konkolaachisaaf", bankTelebirr:"Baankii / Telebirr", confirmOrder:"Ajaja mirkaneessi", submitting:"Ajaja uumamaa jira…", completeRequired:"Ajaja mirkaneessuuf dirree barbaachisu hunda fi gatii sirrii guuti.", ready:"Ibsi booking guutameera; mirkaneessuuf qophaaʼeera.", required:"Barbaachisaa" },
  am: { newBooking:"አዲስ ትዕዛዝ", findingRoute:"መንገድ በመፈለግ ላይ", bookTrip:"መጓጓዣዎን ይያዙ", chooseTruckCargo:"መኪና እና ጭነት ይምረጡ", subtitle:"ለማድረሻዎ ተስማሚውን መኪና እና የጭነት ዝርዝር ይምረጡ።", route:"መንገድ", truck:"መኪና", cargo:"ጭነት", load:"መጠን", quote:"ዋጋ", confirm:"ማረጋገጫ", chooseTruck:"የመኪና አይነት ይምረጡ", maxLoad:"ከፍተኛ ጭነት", cargoCategory:"የጭነት ዓይነት", packaging:"የማሸጊያ / የጭነት አይነት", loadAmount:"የጭነት መጠን", unit:"መለኪያ", notes:"ማስታወሻ / የአያያዝ መመሪያ", optional:"አማራጭ", notesHelp:"አማራጭ ነው፤ የመጓጓዣ ዋጋን አይቀይርም።", additionalDetails:"ተጨማሪ የጭነት ዝርዝር", detailsAdded:"ዝርዝር ተጨምሯል", estimatedQuote:"ግምታዊ ዋጋ", currentRate:"አሁን በአስተዳደር የተዘጋጀ ዋጋ።", enterLoad:"ዋጋው እንዲሰላ የጭነት መጠን ያስገቡ።", calculating:"በማስላት ላይ…", calculateQuote:"ዋጋ አስላ", refreshQuote:"ዋጋ አድስ", paymentMethod:"የክፍያ ዘዴ", cash:"ጥሬ ገንዘብ ለአሽከርካሪ", bankTelebirr:"ባንክ / ቴሌብር", confirmOrder:"ትዕዛዝ ያረጋግጡ", submitting:"ትዕዛዝ እየተፈጠረ ነው…", completeRequired:"ትዕዛዙን ለማረጋገጥ ሁሉንም አስፈላጊ መረጃ እና ትክክለኛ ዋጋ ይሙሉ።", ready:"የትዕዛዙ መረጃ ተሟልቷል፤ ለማረጋገጥ ዝግጁ ነው።", required:"አስፈላጊ" },
} as const;

export const customerUiCopy = {
  en: { home:"Home", orders:"Orders", track:"Track", payments:"Payments", profile:"Profile", orderConfirmed:"Order confirmed", dismiss:"Dismiss order confirmation", pickup:"PICKUP PLACE", dropoff:"DROP-OFF PLACE", findPickup:"Find pickup place", findDropoff:"Find delivery place", myLocation:"My location", locating:"Locating…", swap:"Swap", reset:"Reset", startBooking:"Start your booking", startBookingHelp:"Search, use your location, or tap the map to choose pickup and drop-off.", continue:"Continue", routeReady:"Truck route ready", routeSelected:"Route selected", calculatingRoute:"Calculating truck route…", routeUnavailable:"Truck route unavailable", distanceAuto:"AUTO DISTANCE", loadingPhoto:"Loading photo…", assignedDriverTruck:"ASSIGNED DRIVER & TRUCK", assignmentPending:"ASSIGNMENT PENDING", verifiedDriver:"✓ VERIFIED DRIVER", verificationPending:"VERIFICATION PENDING", assignmentMissing:"Assignment details are loading or not available yet.", assignmentNoGuess:"No Driver or truck data is guessed. This card updates only from the secure Customer assignment source.", platePending:"Plate pending", driver:"DRIVER", assignedDriver:"Assigned Driver", phoneUnavailable:"Phone unavailable", photoUnavailable:"One assignment photo could not be loaded. Fallback is shown instead.", assignmentPrivate:"Private assignment details are shown only for this signed-in Customer's order.", liveTracking:"Live trip tracking →" },
  om: { home:"Mana", orders:"Ajajawwan", track:"Hordofi", payments:"Kaffaltii", profile:"Profaayilii", orderConfirmed:"Ajajni mirkanaaʼeera", dismiss:"Beeksisa ajajaa cufi", pickup:"BAKKA KAʼUMSAA", dropoff:"BAKKA GEESSUMSAA", findPickup:"Bakka kaʼumsaa barbaadi", findDropoff:"Bakka geessumsaa barbaadi", myLocation:"Bakka koo", locating:"Bakka kee barbaadaa…", swap:"Wal jijjiiri", reset:"Haqi", startBooking:"Booking jalqabi", startBookingHelp:"Barbaadi, bakka kee fayyadami, ykn bakka kaʼumsaa fi geessumsaa filachuuf kaartaa tuqi.", continue:"Itti fufi", routeReady:"Daandiin konkolaataa qophaaʼeera", routeSelected:"Daandiin filatameera", calculatingRoute:"Daandii konkolaataa shallagaa jira…", routeUnavailable:"Daandiin konkolaataa hin argamne", distanceAuto:"FAGEENYA OFUMAA", loadingPhoto:"Suuraa feʼaa jira…", assignedDriverTruck:"KONKOLAACHISAA FI KONKOLAATAA RAMADAME", assignmentPending:"RAMADAMNI EEGGAMAA JIRA", verifiedDriver:"✓ KONKOLAACHISAA MIRKANAAʼE", verificationPending:"MIRKANEESSI EEGGAMAA JIRA", assignmentMissing:"Odeeffannoon ramaddii feʼamaa jira ykn amma hin jiru.", assignmentNoGuess:"Odeeffannoon konkolaachisaa ykn konkolaataa hin tilmaamamu. Kaardiin kun madda ramaddii Customer nageenya qabu qofa irraa haaromfama.", platePending:"Lakkoofsi gabatee eegamaa jira", driver:"KONKOLAACHISAA", assignedDriver:"Konkolaachisaa ramadame", phoneUnavailable:"Bilbilli hin jiru", photoUnavailable:"Suuraan ramaddii tokko feʼamuu hin dandeenye. Bakka buʼaan agarsiifameera.", assignmentPrivate:"Odeeffannoon ramaddii dhuunfaa ajaja Customer seenee kanaaf qofa agarsiifama.", liveTracking:"Geejjiba kallattiin hordofi →" },
  am: { home:"መነሻ", orders:"ትዕዛዞች", track:"ክትትል", payments:"ክፍያዎች", profile:"መገለጫ", orderConfirmed:"ትዕዛዙ ተረጋግጧል", dismiss:"የትዕዛዝ ማሳወቂያን ዝጋ", pickup:"መነሻ ቦታ", dropoff:"መድረሻ ቦታ", findPickup:"መነሻ ቦታ ይፈልጉ", findDropoff:"መድረሻ ቦታ ይፈልጉ", myLocation:"የእኔ ቦታ", locating:"ቦታዎን በመፈለግ ላይ…", swap:"ቀያይር", reset:"አጽዳ", startBooking:"ትዕዛዝዎን ይጀምሩ", startBookingHelp:"ይፈልጉ፣ ያሉበትን ቦታ ይጠቀሙ ወይም መነሻና መድረሻን ለመምረጥ ካርታውን ይንኩ።", continue:"ቀጥል", routeReady:"የመኪና መንገድ ዝግጁ ነው", routeSelected:"መንገድ ተመርጧል", calculatingRoute:"የመኪና መንገድ በማስላት ላይ…", routeUnavailable:"የመኪና መንገድ አልተገኘም", distanceAuto:"ራስ-ሰር ርቀት", loadingPhoto:"ፎቶ በመጫን ላይ…", assignedDriverTruck:"የተመደበ አሽከርካሪ እና መኪና", assignmentPending:"ምደባ በመጠባበቅ ላይ", verifiedDriver:"✓ የተረጋገጠ አሽከርካሪ", verificationPending:"ማረጋገጫ በመጠባበቅ ላይ", assignmentMissing:"የምደባ መረጃ በመጫን ላይ ነው ወይም ገና አልተገኘም።", assignmentNoGuess:"የአሽከርካሪ ወይም የመኪና መረጃ አይገመትም። ይህ ካርድ ከደህንነቱ የተጠበቀ የCustomer ምደባ ምንጭ ብቻ ይዘምናል።", platePending:"ታርጋ በመጠባበቅ ላይ", driver:"አሽከርካሪ", assignedDriver:"የተመደበ አሽከርካሪ", phoneUnavailable:"ስልክ አልተገኘም", photoUnavailable:"አንድ የምደባ ፎቶ መጫን አልቻለም። ተለዋጭ ምልክት ታይቷል።", assignmentPrivate:"የግል ምደባ መረጃ ለዚህ የገባ Customer ትዕዛዝ ብቻ ይታያል።", liveTracking:"ቀጥታ ጉዞን ይከታተሉ →" },
} as const;

export const customerBookingMapCopy = {
  en: {
    findingPlaces: "Finding places…",
    noPlaces: "No matching places found.",
    searchUnavailable: "Could not search places.",
    pickupLocation: "Pickup location",
    dropoffLocation: "Drop-off location",
    results: "results",
    resolvingPosition: "Resolving the selected map position…",
    selectPositionError: "Could not select this map position.",
    updatingPosition: "Updating the route point…",
    updatePositionError: "Could not update this route point.",
    deviceLocationUnavailable: "Device location is not available.",
    findingLocation: "Finding your current location…",
    gpsSlow: "GPS is taking longer than expected. Trying a recent device location…",
    outsideCorridor: "Your current location is outside the HALLO Ethiopia–Djibouti–Somalia operating corridor.",
    permissionDenied: "Location permission was denied. Allow location for this app, then try again.",
    locationUnavailable: "Your current location is unavailable. Turn on Location/GPS and try again.",
    locationTimeout: "Getting your current location timed out. Move to an open area or try again.",
    locationUnreadable: "Your current location could not be read. Check device location settings.",
    findingRoute: "Finding the live truck road distance.",
    distanceWillCalculate: "Distance will calculate automatically.",
    estimatedDrivingTime: "estimated driving time",
    mapLabel: "Customer booking map",
    routeControls: "Route controls",
    routeSummary: "Truck route summary",
    hourShort: "h",
    minuteShort: "min",
  },
  om: {
    findingPlaces: "Bakkawwan barbaadaa jira…",
    noPlaces: "Bakki walsimu hin argamne.",
    searchUnavailable: "Bakka barbaaduun hin dandaʼamne.",
    pickupLocation: "Bakka kaʼumsaa",
    dropoffLocation: "Bakka geessumsaa",
    results: "buʼaalee",
    resolvingPosition: "Bakka kaartaa filatame adda baasaa jira…",
    selectPositionError: "Bakka kaartaa kana filachuun hin dandaʼamne.",
    updatingPosition: "Bakka daandii haaromsaa jira…",
    updatePositionError: "Bakka daandii kana haaromsuun hin dandaʼamne.",
    deviceLocationUnavailable: "Bakki meeshaa kanaa hin argamu.",
    findingLocation: "Bakka amma jirtu barbaadaa jira…",
    gpsSlow: "GPS yeroo dheeraa fudhataa jira. Bakka meeshaa dhiyoo irra deebiʼee yaalaa jira…",
    outsideCorridor: "Bakki amma jirtu daangaa hojii HALLO Itoophiyaa–Jibuutii–Somaaliyaa ala jira.",
    permissionDenied: "Hayyamni bakka kee dhorkameera. App kanaaf hayyamiitii irra deebiʼi.",
    locationUnavailable: "Bakki amma jirtu hin argamu. Location/GPS baniitii irra deebiʼi.",
    locationTimeout: "Bakka kee argachuun yeroo dheeraa fudhate. Bakka banaatti sochoʼi ykn irra deebiʼi.",
    locationUnreadable: "Bakki amma jirtu dubbifamuu hin dandeenye. Qindaaʼina bakka meeshaa ilaali.",
    findingRoute: "Fageenya daandii konkolaataa kallattiin barbaadaa jira.",
    distanceWillCalculate: "Fageenyi ofumaan shallagama.",
    estimatedDrivingTime: "yeroo konkolaachisummaa tilmaamaa",
    mapLabel: "Kaartaa booking maamilaa",
    routeControls: "Toʼannoo daandii",
    routeSummary: "Cuunfaa daandii konkolaataa",
    hourShort: "sa",
    minuteShort: "daq",
  },
  am: {
    findingPlaces: "ቦታዎችን በመፈለግ ላይ…",
    noPlaces: "ተዛማጅ ቦታ አልተገኘም።",
    searchUnavailable: "ቦታዎችን መፈለግ አልተቻለም።",
    pickupLocation: "መነሻ ቦታ",
    dropoffLocation: "መድረሻ ቦታ",
    results: "ውጤቶች",
    resolvingPosition: "የተመረጠውን የካርታ ቦታ በመፈለግ ላይ…",
    selectPositionError: "ይህን የካርታ ቦታ መምረጥ አልተቻለም።",
    updatingPosition: "የመንገድ ቦታን በማዘመን ላይ…",
    updatePositionError: "ይህን የመንገድ ቦታ ማዘመን አልተቻለም።",
    deviceLocationUnavailable: "የመሣሪያው ቦታ አይገኝም።",
    findingLocation: "አሁን ያሉበትን ቦታ በመፈለግ ላይ…",
    gpsSlow: "GPS ጊዜ እየወሰደ ነው። የቅርብ ጊዜ የመሣሪያ ቦታን እንደገና በመሞከር ላይ…",
    outsideCorridor: "አሁን ያሉበት ቦታ ከHALLO ኢትዮጵያ–ጅቡቲ–ሶማሊያ የስራ ክልል ውጭ ነው።",
    permissionDenied: "የቦታ ፈቃድ ተከልክሏል። ለመተግበሪያው ፈቃድ ሰጥተው እንደገና ይሞክሩ።",
    locationUnavailable: "አሁን ያሉበት ቦታ አይገኝም። Location/GPS አብርተው እንደገና ይሞክሩ።",
    locationTimeout: "ቦታዎን ማግኘት ጊዜ አልፎበታል። ወደ ክፍት ቦታ ይሂዱ ወይም እንደገና ይሞክሩ።",
    locationUnreadable: "አሁን ያሉበትን ቦታ ማንበብ አልተቻለም። የመሣሪያውን የቦታ ቅንብር ይፈትሹ።",
    findingRoute: "የቀጥታ የመኪና መንገድ ርቀትን በመፈለግ ላይ።",
    distanceWillCalculate: "ርቀቱ በራስ-ሰር ይሰላል።",
    estimatedDrivingTime: "ግምታዊ የመንዳት ጊዜ",
    mapLabel: "የደንበኛ ትዕዛዝ ካርታ",
    routeControls: "የመንገድ መቆጣጠሪያዎች",
    routeSummary: "የመኪና መንገድ ማጠቃለያ",
    hourShort: "ሰ",
    minuteShort: "ደቂ",
  },
} as const;

function readLanguage(): CustomerLanguage { const value = window.localStorage.getItem(LANGUAGE_KEY); return value === "en" || value === "am" || value === "om" ? value : "om"; }

export function useCustomerLanguage() {
  const [language, setLanguageState] = useState<CustomerLanguage>(readLanguage);
  useEffect(() => { function syncLanguage(){ setLanguageState(readLanguage()); } window.addEventListener(LANGUAGE_EVENT, syncLanguage); window.addEventListener("storage", syncLanguage); return () => { window.removeEventListener(LANGUAGE_EVENT, syncLanguage); window.removeEventListener("storage", syncLanguage); }; }, []);
  function setLanguage(next: CustomerLanguage) { window.localStorage.setItem(LANGUAGE_KEY, next); document.documentElement.lang = next; setLanguageState(next); window.dispatchEvent(new Event(LANGUAGE_EVENT)); }
  return { language, setLanguage, text: customerBookingCopy[language], ui: customerUiCopy[language] };
}

export function CustomerLanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage } = useCustomerLanguage();
  const options: Array<{ value: CustomerLanguage; label: string; title: string }> = [{ value: "en", label: "EN", title: "English" }, { value: "om", label: "OR", title: "Afaan Oromoo" }, { value: "am", label: "አማ", title: "አማርኛ" }];
  return <div className={`customer-language-switcher ${compact ? "is-compact" : ""}`} role="group" aria-label="Language">{options.map((option,index)=><span className="customer-language-choice" key={option.value}>{index>0&&<span className="customer-language-separator" aria-hidden="true">|</span>}<button type="button" className={language===option.value?"is-active":""} aria-pressed={language === option.value} aria-label={option.title} title={option.title} onClick={()=>setLanguage(option.value)}>{option.label}</button></span>)}</div>;
}
