import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  LanguageProvider as LegacyLanguageProvider,
  useLanguage as useLegacyLanguage,
  type HalloLanguage as LegacyLanguage,
} from "./LegacyLanguageProvider";

export type HalloLanguage = LegacyLanguage;
export type SupportedLanguage = HalloLanguage | "so" | "ti";

type ExtraLanguage = "so" | "ti";

type LanguageContextValue = {
  /**
   * Operational screens that have not yet supplied Somali/Tigrinya copy use
   * English safely instead of rendering an undefined translation object.
   */
  language: HalloLanguage;
  selectedLanguage: SupportedLanguage;
  setLanguage: (language: SupportedLanguage) => void;
  t: (key: string) => string;
};

const EXTENDED_STORAGE_KEY = "hallo_extended_language";

const extraTranslations: Record<ExtraLanguage, Record<string, string>> = {
  so: {
    "common.openPortal": "Fur bogga",
    "common.signOut": "Ka bax",
    "common.online": "Khadka ku jira",
    "common.email": "Iimayl",
    "common.password": "Furaha sirta",
    "common.fullName": "Magaca oo buuxa",
    "common.phone": "Lambarka taleefanka",
    "common.wait": "Fadlan sug…",
    "common.createAccount": "Samee akoon",
    "common.signIn": "Gal",
    "common.backPortal": "Ku noqo xulashada bogga",
    "landing.oneNetwork": "HAL SHABAKAD",
    "landing.chooseWorkspace": "DOORO GOOBTA SHAQADA",
    "landing.hero": "Saad loo dhisay door kasta.",
    "landing.heroText": "Bogag ammaan ah oo loogu talagalay maamulka, darawallada iyo macaamiisha—laguna mideeyey GPS toos ah, jid-marin, lacag-bixin iyo hal shabakad gaadiid.",
    "landing.capabilities": "AWOODAHA MADASHA TOOSKA AH",
    "landing.adminLabel": "MAAMULE / CEO",
    "landing.adminTitle": "Xarunta Xakamaynta",
    "landing.adminDesc": "Dalabyo, hawlgallo toos ah, gaadiid, maaliyad, caddaynta gaarsiinta iyo warbixinno ganacsi.",
    "landing.driverLabel": "DARAWAL",
    "landing.driverTitle": "Goobta Shaqada Moobaylka",
    "landing.driverDesc": "Raadi xamuul, la wadaag GPS toos ah, raac tilmaamaha jidka, maamul safarrada, dukumentiyada iyo dakhliga.",
    "landing.customerLabel": "MACMIIL",
    "landing.customerTitle": "Bogga Casriga ah",
    "landing.customerDesc": "Dalbo gaadiid, hel qiime jidka ku salaysan, si toos ah ula soco gaadhiga, gudbi lacag-bixin oo eeg caddaynta gaarsiinta.",
    "cap.driverGps": "GPS-ka darawalka oo toos ah",
    "cap.customerTracking": "La socodka gaadhiga macmiilka",
    "cap.routeQuote": "Qiime jidka ku salaysan",
    "cap.navigation": "Hagitaan tallaabo-tallaabo ah",
    "cap.autoSteps": "Tallaabooyinka jidka oo otomaatig ah",
    "cap.payment": "Hab lacag-bixin ammaan ah",
    "driver.workspace": "GOOBTA SHAQADA DARAWALKA",
    "driver.nav.jobs": "Shaqooyin",
    "driver.nav.trip": "Safar",
    "driver.nav.docs": "Dukumenti",
    "driver.nav.earnings": "Dakhli",
    "driver.menu.signedIn": "Waxaad ku gashay",
    "driver.login.title": "Gelitaanka darawalka",
    "driver.signup.title": "Samee akoon darawal",
    "driver.login.desc": "Gal si aad u aragto xamuulka jira oo aad u maamusho safarrada.",
    "driver.signup.desc": "Iska diiwaangeli darawal Hallo Truck ahaan.",
    "driver.login.submit": "Gal",
    "driver.signup.submit": "Samee akoon",
    "driver.login.switchSignup": "Darawal cusub? Samee akoon",
    "driver.login.switchLogin": "Hore ma isu diiwaangelisay? Gal",
    "driver.error.namePhone": "Magaca oo buuxa iyo lambarka taleefanka waa waajib.",
    "driver.error.access": "Akoonkan ma laha gelitaanka Darawalka.",
    "driver.error.auth": "Xaqiijinta gelitaanka way fashilantay.",
    "driver.message.pending": "Akoonka waa la sameeyey. Gelitaanka darawalku wuxuu sugayaa ansixin.",
    "driver.message.confirm": "Akoonka waa la sameeyey. Ka hubi iimaylkaaga si aad u xaqiijiso.",
    "customer.smartPortal": "BOGGA CASRIGA AH EE MACMIILKA",
    "customer.hero": "Dalbo. La soco. Guddoon.",
    "customer.heroText": "Dalabyadaada, lacag-bixinnada, qaansheegadaha iyo caddaynta gaarsiinta oo ku jira hal goob ammaan ah.",
    "customer.label": "MACMIIL",
    "customer.login.title": "Soo dhowow mar kale",
    "customer.signup.title": "Samee akoon macmiil",
    "customer.login.desc": "Gal si aad u maamusho xamuulkaaga.",
    "customer.signup.desc": "Bilow dalbashada iyo la socodka gaadiidka.",
    "customer.login.submit": "Fur bogga macmiilka",
    "customer.signup.submit": "Samee akoon",
    "customer.login.switchSignup": "Macmiil cusub? Samee akoon",
    "customer.login.switchLogin": "Hore ma isu diiwaangelisay? Gal",
    "customer.error.access": "Akoonkan ma laha gelitaanka Macmiilka.",
    "customer.error.auth": "Xaqiijinta gelitaanka way fashilantay.",
    "customer.message.confirm": "Akoonka waa la sameeyey. Xaqiiji iimaylkaaga, dabadeed gal."
  },
  ti: {
    "common.openPortal": "ፖርታል ክፈት",
    "common.signOut": "ውጻእ",
    "common.online": "ኦንላይን",
    "common.email": "ኢመይል",
    "common.password": "መሕለፊ ቃል",
    "common.fullName": "ምሉእ ስም",
    "common.phone": "ቁጽሪ ተሌፎን",
    "common.wait": "በጃኻ ተጸበ…",
    "common.createAccount": "ኣካውንት ፍጠር",
    "common.signIn": "እቶ",
    "common.backPortal": "ናብ ምርጫ ፖርታል ተመለስ",
    "landing.oneNetwork": "ሓደ መርበብ",
    "landing.chooseWorkspace": "ናይ ስራሕ ቦታኻ ምረጽ",
    "landing.hero": "ንኹሉ ተራ ዝተሃንጸ ሎጂስቲክስ።",
    "landing.heroText": "ንኣመራርሓ፣ ንመራሕቲ መኪናን ንዓማዊልን ውሑስ ፖርታላት—ብቀጥታ GPS፣ መስመር መንገዲ፣ ክፍሊትን ሓደ መርበብ መጓዓዝያን ዝተኣሳሰሩ።",
    "landing.capabilities": "ዓቕምታት ቀጥታ ፕላትፎርም",
    "landing.adminLabel": "ኣድሚን / CEO",
    "landing.adminTitle": "ማእከል ቁጽጽር",
    "landing.adminDesc": "ትእዛዛት፣ ቀጥታ ስርሒት፣ ፍሊት፣ ፋይናንስ፣ መረጋገጺ ምብጻሕን ናይ ንግዲ ጸብጻባትን።",
    "landing.driverLabel": "መራሕ መኪና",
    "landing.driverTitle": "ናይ ሞባይል ስራሕ ቦታ",
    "landing.driverDesc": "ጽዕነት ድለ፣ ቀጥታ GPS ኣካፍል፣ መምርሒ መንገዲ ተኸተል፣ ጉዕዞ፣ ሰነዳትን ኣታዊን ኣመሓድር።",
    "landing.customerLabel": "ዓሚል",
    "landing.customerTitle": "ስማርት ፖርታል",
    "landing.customerDesc": "መጓዓዝያ ሕተት፣ ኣብ መንገዲ ዝተመርኮሰ ዋጋ ርኸብ፣ መኪና ብቀጥታ ተኸታተል፣ ክፍሊት ኣቕርብን መረጋገጺ ምብጻሕ ርአን።",
    "cap.driverGps": "ቀጥታ GPS መራሕ መኪና",
    "cap.customerTracking": "ምክትታል መኪና ዓሚል",
    "cap.routeQuote": "ኣብ መንገዲ ዝተመርኮሰ ዋጋ",
    "cap.navigation": "ደረጃ ብደረጃ መምርሒ",
    "cap.autoSteps": "ኣውቶማቲክ ደረጃታት መንገዲ",
    "cap.payment": "ውሑስ መስርሕ ክፍሊት",
    "driver.workspace": "ናይ መራሕ መኪና ስራሕ ቦታ",
    "driver.nav.jobs": "ስራሓት",
    "driver.nav.trip": "ጉዕዞ",
    "driver.nav.docs": "ሰነዳት",
    "driver.nav.earnings": "ኣታዊ",
    "driver.menu.signedIn": "ከምዚ ኣቲኻ",
    "driver.login.title": "መእተዊ መራሕ መኪና",
    "driver.signup.title": "ኣካውንት መራሕ መኪና ፍጠር",
    "driver.login.desc": "ዘለዉ ጽዕነታት ንምርኣይን ጉዕዞታት ንምምሕዳርን እቶ።",
    "driver.signup.desc": "ከም መራሕ መኪና Hallo Truck ተመዝገብ።",
    "driver.login.submit": "እቶ",
    "driver.signup.submit": "ኣካውንት ፍጠር",
    "driver.login.switchSignup": "ሓድሽ መራሕ መኪና? ኣካውንት ፍጠር",
    "driver.login.switchLogin": "ቅድሚ ሕጂ ተመዝጊብካ? እቶ",
    "driver.error.namePhone": "ምሉእ ስምን ቁጽሪ ተሌፎንን የድሊ።",
    "driver.error.access": "እዚ ኣካውንት ናይ መራሕ መኪና ፍቓድ የብሉን።",
    "driver.error.auth": "ምርግጋጽ መእተዊ ኣይተዓወተን።",
    "driver.message.pending": "ኣካውንት ተፈጢሩ። ፍቓድ መራሕ መኪና ምጽዳቕ ይጽበ ኣሎ።",
    "driver.message.confirm": "ኣካውንት ተፈጢሩ። ንምርግጋጽ ኢመይልካ ርአ።",
    "customer.smartPortal": "ስማርት ፖርታል ዓሚል",
    "customer.hero": "ኣዝዝ። ተኸታተል። ተቐበል።",
    "customer.heroText": "ትእዛዛትካ፣ ክፍሊታትካ፣ ኢንቮይሳትካን መረጋገጺ ምብጻሕን ኣብ ሓደ ውሑስ ስራሕ ቦታ።",
    "customer.label": "ዓሚል",
    "customer.login.title": "እንቋዕ ደሓን መጻእካ",
    "customer.signup.title": "ኣካውንት ዓሚል ፍጠር",
    "customer.login.desc": "ጽዕነታትካ ንምምሕዳር እቶ።",
    "customer.signup.desc": "መጓዓዝያ ምእዛዝን ምክትታልን ጀምር።",
    "customer.login.submit": "ፖርታል ዓሚል ክፈት",
    "customer.signup.submit": "ኣካውንት ፍጠር",
    "customer.login.switchSignup": "ሓድሽ ዓሚል? ኣካውንት ፍጠር",
    "customer.login.switchLogin": "ቅድሚ ሕጂ ተመዝጊብካ? እቶ",
    "customer.error.access": "እዚ ኣካውንት ናይ ዓሚል ፍቓድ የብሉን።",
    "customer.error.auth": "ምርግጋጽ መእተዊ ኣይተዓወተን።",
    "customer.message.confirm": "ኣካውንት ተፈጢሩ። ኢመይልካ ኣረጋግጽ፣ ድሕሪኡ እቶ።"
  }
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function isSupportedLanguage(value: string | null): value is SupportedLanguage {
  return value === "en" || value === "om" || value === "am" || value === "so" || value === "ti";
}

function readInitialLanguage(): SupportedLanguage {
  if (typeof window === "undefined") return "en";
  const extended = window.localStorage.getItem(EXTENDED_STORAGE_KEY);
  if (isSupportedLanguage(extended)) return extended;
  const legacy = window.localStorage.getItem("hallo_language");
  return isSupportedLanguage(legacy) ? legacy : "en";
}

function LanguageBridge({ children }: { children: ReactNode }) {
  const legacy = useLegacyLanguage();
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage>(readInitialLanguage);
  const language: HalloLanguage = selectedLanguage === "so" || selectedLanguage === "ti" ? "en" : selectedLanguage;

  useEffect(() => {
    window.localStorage.setItem(EXTENDED_STORAGE_KEY, selectedLanguage);
    if (legacy.language !== language) legacy.setLanguage(language);

    const timer = window.setTimeout(() => {
      document.documentElement.lang = selectedLanguage;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [language, legacy, selectedLanguage]);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    selectedLanguage,
    setLanguage: setSelectedLanguage,
    t: (key) => {
      if (selectedLanguage === "so" || selectedLanguage === "ti") {
        return extraTranslations[selectedLanguage][key] ?? legacy.t(key);
      }
      return legacy.t(key);
    },
  }), [language, legacy, selectedLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  return (
    <LegacyLanguageProvider>
      <LanguageBridge>{children}</LanguageBridge>
    </LegacyLanguageProvider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider");
  return context;
}

export function LanguageSwitcher({ dark = false }: { dark?: boolean }) {
  const { selectedLanguage, setLanguage } = useLanguage();
  return (
    <label className={`inline-flex items-center border px-2 py-1.5 text-[10px] font-mono tracking-wide ${dark ? "border-white/15 text-white/70" : "border-asphalt/15 text-steel"}`}>
      <span className="sr-only">Language</span>
      <select
        aria-label="Language"
        value={selectedLanguage}
        onChange={(event) => setLanguage(event.target.value as SupportedLanguage)}
        className={`bg-transparent outline-none ${dark ? "text-white" : "text-asphalt"}`}
      >
        <option value="en" className="text-asphalt">EN</option>
        <option value="om" className="text-asphalt">OR</option>
        <option value="am" className="text-asphalt">አማ</option>
        <option value="so" className="text-asphalt">SO</option>
        <option value="ti" className="text-asphalt">ትግ</option>
      </select>
    </label>
  );
}
