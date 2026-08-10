import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type HalloLanguage = "en" | "om" | "am";

type LanguageContextValue = {
  language: HalloLanguage;
  setLanguage: (language: HalloLanguage) => void;
  t: (key: string) => string;
};

const STORAGE_KEY = "hallo_language";

const translations: Record<HalloLanguage, Record<string, string>> = {
  en: {
    "common.openPortal": "Open portal",
    "common.signOut": "Sign out",
    "common.online": "Online",
    "common.email": "Email",
    "common.password": "Password",
    "common.fullName": "Full name",
    "common.phone": "Phone number",
    "common.wait": "Please wait…",
    "common.createAccount": "Create account",
    "common.signIn": "Sign in",
    "common.backPortal": "Back to portal selection",
    "landing.oneNetwork": "ONE NETWORK",
    "landing.chooseWorkspace": "CHOOSE YOUR WORKSPACE",
    "landing.hero": "Logistics built around every role.",
    "landing.heroText": "Secure portals for leadership, drivers and customers—connected by live GPS, road routing, payments and one shared transport network.",
    "landing.capabilities": "LIVE PLATFORM CAPABILITIES",
    "landing.adminLabel": "ADMIN / CEO",
    "landing.adminTitle": "Control Center",
    "landing.adminDesc": "Orders, live operations, fleet, finance, delivery proof and business reports.",
    "landing.driverLabel": "DRIVER",
    "landing.driverTitle": "Mobile Workspace",
    "landing.driverDesc": "Find loads, share live GPS, follow turn-by-turn routes, manage trips, documents and earnings.",
    "landing.customerLabel": "CUSTOMER",
    "landing.customerTitle": "Smart Portal",
    "landing.customerDesc": "Request transport, get route-aware quotes, follow the truck live, submit payments and view delivery proof.",
    "cap.driverGps": "Live driver GPS",
    "cap.customerTracking": "Customer truck tracking",
    "cap.routeQuote": "Route-aware quotes",
    "cap.navigation": "Turn-by-turn navigation",
    "cap.autoSteps": "Automatic route steps",
    "cap.payment": "Secure payment flow",
    "driver.workspace": "DRIVER WORKSPACE",
    "driver.nav.jobs": "Jobs",
    "driver.nav.trip": "Trip",
    "driver.nav.docs": "Docs",
    "driver.nav.earnings": "Earnings",
    "driver.menu.signedIn": "Signed in as",
    "driver.login.title": "Driver login",
    "driver.signup.title": "Create driver account",
    "driver.login.desc": "Sign in to view available loads and manage trips.",
    "driver.signup.desc": "Register as a Hallo Truck driver.",
    "driver.login.submit": "Sign in",
    "driver.signup.submit": "Create account",
    "driver.login.switchSignup": "New driver? Create an account",
    "driver.login.switchLogin": "Already registered? Sign in",
    "driver.error.namePhone": "Full name and phone number are required.",
    "driver.error.access": "This account does not have Driver access.",
    "driver.error.auth": "Authentication failed.",
    "driver.message.pending": "Account created. Driver access is pending approval.",
    "driver.message.confirm": "Account created. Check your email to confirm your account.",
    "customer.smartPortal": "CUSTOMER SMART PORTAL",
    "customer.hero": "Book. Track. Receive.",
    "customer.heroText": "Your orders, payments, invoices and proof of delivery in one secure workspace.",
    "customer.label": "CUSTOMER",
    "customer.login.title": "Welcome back",
    "customer.signup.title": "Create customer account",
    "customer.login.desc": "Sign in to manage your shipments.",
    "customer.signup.desc": "Start booking and tracking transport.",
    "customer.login.submit": "Open customer portal",
    "customer.signup.submit": "Create account",
    "customer.login.switchSignup": "New customer? Create an account",
    "customer.login.switchLogin": "Already registered? Sign in",
    "customer.error.access": "This account does not have Customer access.",
    "customer.error.auth": "Authentication failed.",
    "customer.message.confirm": "Account created. Check your email to confirm it, then sign in."
  },
  om: {
    "common.openPortal": "Poortaalii bani",
    "common.signOut": "Ba'i",
    "common.online": "Online",
    "common.email": "Imeelii",
    "common.password": "Jecha iccitii",
    "common.fullName": "Maqaa guutuu",
    "common.phone": "Lakkoofsa bilbilaa",
    "common.wait": "Mee eegi…",
    "common.createAccount": "Akkaawuntii uumi",
    "common.signIn": "Seeni",
    "common.backPortal": "Gara filannoo poortaaliitti deebi'i",
    "landing.oneNetwork": "NETWORKII TOKKO",
    "landing.chooseWorkspace": "BAKKA HOJII KEE FILADHU",
    "landing.hero": "Loojistikii gahee hundaaf ijaarame.",
    "landing.heroText": "Poortaalii nageenya qabu hoggansa, konkolaachisaa fi maamiltootaaf—GPS kallattii, daandii, kaffaltii fi networkii geejjibaa tokkoon wal qunnamsiifame.",
    "landing.capabilities": "DANDEETTII PLATFORMII KALLATTII",
    "landing.adminLabel": "ADMIN / CEO",
    "landing.adminTitle": "Giddugala To'annoo",
    "landing.adminDesc": "Ajajoota, hojii kallattii, fleet, faayinaansii, ragaa geejjibaa fi gabaasa daldalaa.",
    "landing.driverLabel": "KONKOLAACHISAA",
    "landing.driverTitle": "Bakka Hojii Moobaayilaa",
    "landing.driverDesc": "Fe'umsa barbaadi, GPS kallattii qoodi, daandii tartiibaan hordofi, imala, dokumentii fi galii bulchi.",
    "landing.customerLabel": "MAAMILA",
    "landing.customerTitle": "Poortaalii Smart",
    "landing.customerDesc": "Geejjiba gaafadhu, gatii daandii irratti hundaa'e argadhu, konkolaataa kallattiin hordofi, kaffaltii ergi fi ragaa geejjibaa ilaali.",
    "cap.driverGps": "GPS konkolaachisaa kallattii",
    "cap.customerTracking": "Hordoffii konkolaataa maamilaa",
    "cap.routeQuote": "Gatii daandii irratti hundaa'e",
    "cap.navigation": "Qajeelfama tartiiba daandii",
    "cap.autoSteps": "Tarkaanfii daandii ofumaan",
    "cap.payment": "Kaffaltii nageenya qabu",
    "driver.workspace": "BAKKA HOJII KONKOLAACHISAA",
    "driver.nav.jobs": "Hojii",
    "driver.nav.trip": "Imala",
    "driver.nav.docs": "Dokumentii",
    "driver.nav.earnings": "Galii",
    "driver.menu.signedIn": "Seentee jirta akka",
    "driver.login.title": "Seensa konkolaachisaa",
    "driver.signup.title": "Akkaawuntii konkolaachisaa uumi",
    "driver.login.desc": "Fe'umsa jiru ilaaluufi imala bulchuuf seeni.",
    "driver.signup.desc": "Akka konkolaachisaa Hallo Truck tti galmaa'i.",
    "driver.login.submit": "Seeni",
    "driver.signup.submit": "Akkaawuntii uumi",
    "driver.login.switchSignup": "Konkolaachisaa haaraa? Akkaawuntii uumi",
    "driver.login.switchLogin": "Dura galmoofteetta? Seeni",
    "driver.error.namePhone": "Maqaa guutuu fi lakkoofsi bilbilaa barbaachisaa dha.",
    "driver.error.access": "Akkaawuntiin kun hayyama Konkolaachisaa hin qabu.",
    "driver.error.auth": "Seenuun hin milkoofne.",
    "driver.message.pending": "Akkaawuntiin uumameera. Hayyamni konkolaachisaa mirkaneessa eeggachaa jira.",
    "driver.message.confirm": "Akkaawuntiin uumameera. Imeelii kee irratti mirkaneessi.",
    "customer.smartPortal": "POORTAALII SMART MAAMILAA",
    "customer.hero": "Ajaji. Hordofi. Fudhadhu.",
    "customer.heroText": "Ajajoota, kaffaltii, invoice fi ragaa geejjibaa bakka hojii nageenya qabu tokko keessatti.",
    "customer.label": "MAAMILA",
    "customer.login.title": "Baga nagaan deebite",
    "customer.signup.title": "Akkaawuntii maamilaa uumi",
    "customer.login.desc": "Geejjiba kee bulchuuf seeni.",
    "customer.signup.desc": "Geejjiba ajajuu fi hordofuu jalqabi.",
    "customer.login.submit": "Poortaalii maamilaa bani",
    "customer.signup.submit": "Akkaawuntii uumi",
    "customer.login.switchSignup": "Maamila haaraa? Akkaawuntii uumi",
    "customer.login.switchLogin": "Dura galmoofteetta? Seeni",
    "customer.error.access": "Akkaawuntiin kun hayyama Maamilaa hin qabu.",
    "customer.error.auth": "Seenuun hin milkoofne.",
    "customer.message.confirm": "Akkaawuntiin uumameera. Imeelii kee mirkaneessi, sana booda seeni."
  },
  am: {
    "common.openPortal": "ፖርታል ክፈት",
    "common.signOut": "ውጣ",
    "common.online": "ኦንላይን",
    "common.email": "ኢሜይል",
    "common.password": "የይለፍ ቃል",
    "common.fullName": "ሙሉ ስም",
    "common.phone": "ስልክ ቁጥር",
    "common.wait": "እባክዎ ይጠብቁ…",
    "common.createAccount": "መለያ ፍጠር",
    "common.signIn": "ግባ",
    "common.backPortal": "ወደ ፖርታል ምርጫ ተመለስ",
    "landing.oneNetwork": "አንድ ኔትወርክ",
    "landing.chooseWorkspace": "የስራ ቦታዎን ይምረጡ",
    "landing.hero": "ለእያንዳንዱ ሚና የተገነባ ሎጂስቲክስ።",
    "landing.heroText": "ለአመራር፣ ለአሽከርካሪዎች እና ለደንበኞች የተጠበቁ ፖርታሎች—በቀጥታ GPS፣ የመንገድ አቅጣጫ፣ ክፍያ እና አንድ የትራንስፖርት ኔትወርክ የተገናኙ።",
    "landing.capabilities": "የቀጥታ ፕላትፎርም አቅሞች",
    "landing.adminLabel": "ADMIN / CEO",
    "landing.adminTitle": "የቁጥጥር ማዕከል",
    "landing.adminDesc": "ትዕዛዞች፣ የቀጥታ ኦፕሬሽን፣ ፍሊት፣ ፋይናንስ፣ የማድረስ ማስረጃ እና የንግድ ሪፖርቶች።",
    "landing.driverLabel": "አሽከርካሪ",
    "landing.driverTitle": "የሞባይል የስራ ቦታ",
    "landing.driverDesc": "ጭነቶችን ፈልግ፣ የቀጥታ GPS አጋራ፣ የመንገድ መመሪያን ተከተል፣ ጉዞ፣ ሰነዶች እና ገቢን አስተዳድር።",
    "landing.customerLabel": "ደንበኛ",
    "landing.customerTitle": "ስማርት ፖርታል",
    "landing.customerDesc": "ትራንስፖርት ጠይቅ፣ በመንገድ ርቀት የተመሰረተ ዋጋ አግኝ፣ መኪናውን በቀጥታ ተከታተል፣ ክፍያ ላክ እና የማድረስ ማስረጃ ተመልከት።",
    "cap.driverGps": "የአሽከርካሪ ቀጥታ GPS",
    "cap.customerTracking": "የደንበኛ መኪና ክትትል",
    "cap.routeQuote": "በመንገድ የተመሰረተ ዋጋ",
    "cap.navigation": "ደረጃ በደረጃ አቅጣጫ",
    "cap.autoSteps": "ራስ-ሰር የመንገድ ደረጃዎች",
    "cap.payment": "የተጠበቀ የክፍያ ሂደት",
    "driver.workspace": "የአሽከርካሪ የስራ ቦታ",
    "driver.nav.jobs": "ስራዎች",
    "driver.nav.trip": "ጉዞ",
    "driver.nav.docs": "ሰነዶች",
    "driver.nav.earnings": "ገቢ",
    "driver.menu.signedIn": "የገቡት",
    "driver.login.title": "የአሽከርካሪ መግቢያ",
    "driver.signup.title": "የአሽከርካሪ መለያ ፍጠር",
    "driver.login.desc": "ያሉ ጭነቶችን ለማየት እና ጉዞዎችን ለማስተዳደር ይግቡ።",
    "driver.signup.desc": "እንደ Hallo Truck አሽከርካሪ ይመዝገቡ።",
    "driver.login.submit": "ግባ",
    "driver.signup.submit": "መለያ ፍጠር",
    "driver.login.switchSignup": "አዲስ አሽከርካሪ? መለያ ፍጠር",
    "driver.login.switchLogin": "ቀድሞ ተመዝግበዋል? ይግቡ",
    "driver.error.namePhone": "ሙሉ ስም እና ስልክ ቁጥር ያስፈልጋሉ።",
    "driver.error.access": "ይህ መለያ የአሽከርካሪ ፈቃድ የለውም።",
    "driver.error.auth": "መግባት አልተሳካም።",
    "driver.message.pending": "መለያው ተፈጥሯል። የአሽከርካሪ ፈቃድ ማረጋገጫ በመጠበቅ ላይ ነው።",
    "driver.message.confirm": "መለያው ተፈጥሯል። ኢሜይልዎን ይፈትሹ እና ያረጋግጡ።",
    "customer.smartPortal": "የደንበኛ ስማርት ፖርታል",
    "customer.hero": "ይዘዙ። ይከታተሉ። ይቀበሉ።",
    "customer.heroText": "ትዕዛዞችዎ፣ ክፍያዎችዎ፣ ደረሰኞችዎ እና የማድረስ ማስረጃ በአንድ የተጠበቀ የስራ ቦታ።",
    "customer.label": "ደንበኛ",
    "customer.login.title": "እንኳን ደህና መጡ",
    "customer.signup.title": "የደንበኛ መለያ ፍጠር",
    "customer.login.desc": "ጭነቶችዎን ለማስተዳደር ይግቡ።",
    "customer.signup.desc": "ትራንስፖርት መያዝ እና መከታተል ይጀምሩ።",
    "customer.login.submit": "የደንበኛ ፖርታል ክፈት",
    "customer.signup.submit": "መለያ ፍጠር",
    "customer.login.switchSignup": "አዲስ ደንበኛ? መለያ ፍጠር",
    "customer.login.switchLogin": "ቀድሞ ተመዝግበዋል? ይግቡ",
    "customer.error.access": "ይህ መለያ የደንበኛ ፈቃድ የለውም።",
    "customer.error.auth": "መግባት አልተሳካም።",
    "customer.message.confirm": "መለያው ተፈጥሯል። ኢሜይልዎን ያረጋግጡ እና ከዚያ ይግቡ።"
  }
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readInitialLanguage(): HalloLanguage {
  if (typeof window === "undefined") return "en";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === "om" || saved === "am" || saved === "en" ? saved : "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<HalloLanguage>(readInitialLanguage);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language === "om" ? "om" : language === "am" ? "am" : "en";
  }, [language]);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage: setLanguageState,
    t: (key) => translations[language][key] ?? translations.en[key] ?? key,
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider");
  return context;
}

export function LanguageSwitcher({ dark = false }: { dark?: boolean }) {
  const { language, setLanguage } = useLanguage();
  return (
    <label className={`inline-flex items-center border px-2 py-1.5 text-[10px] font-mono tracking-wide ${dark ? "border-white/15 text-white/70" : "border-asphalt/15 text-steel"}`}>
      <span className="sr-only">Language</span>
      <select
        aria-label="Language"
        value={language}
        onChange={(event) => setLanguage(event.target.value as HalloLanguage)}
        className={`bg-transparent outline-none ${dark ? "text-white" : "text-asphalt"}`}
      >
        <option value="en" className="text-asphalt">EN</option>
        <option value="om" className="text-asphalt">OR</option>
        <option value="am" className="text-asphalt">አማ</option>
      </select>
    </label>
  );
}
