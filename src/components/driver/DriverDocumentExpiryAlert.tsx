import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  useLanguage,
  type SupportedLanguage,
} from "../../i18n/LanguageProvider";
import {
  getMyVerificationProfile,
  type DriverVerificationFile,
  type DriverVerificationProfile,
  type VerificationDocumentKey,
} from "../../services/driver.service";

const EXPIRY_WARNING_DAYS = 30;
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const expiryKeys = [
  "license_front",
  "license_back",
  "insurance",
  "transport_permit",
] as const;

type ExpiryDocumentKey = (typeof expiryKeys)[number];
type ComplianceState = "missing" | "pending" | "rejected" | "expired" | "expiring";

type ComplianceItem = {
  key: ExpiryDocumentKey;
  state: ComplianceState;
  expiryDate: string | null;
};

type AlertCopy = {
  kicker: string;
  blockedTitle: string;
  blockedBody: string;
  warningTitle: string;
  warningBody: string;
  update: string;
  expiryDate: string;
  states: Record<ComplianceState, string>;
};

const copy: Record<SupportedLanguage, AlertCopy> = {
  en: {
    kicker: "DOCUMENT COMPLIANCE",
    blockedTitle: "New jobs are blocked",
    blockedBody: "A required license, insurance or permit is missing, rejected, pending review or expired. Upload the correct document and wait for verification before accepting another load.",
    warningTitle: "Renew documents soon",
    warningBody: "A required document expires within 30 days. Renew it early to avoid an interruption in job access.",
    update: "Update documents",
    expiryDate: "Expiry",
    states: {
      missing: "Missing",
      pending: "Pending review",
      rejected: "Rejected",
      expired: "Expired",
      expiring: "Expires soon",
    },
  },
  om: {
    kicker: "SANADA SEERA GUUTUU",
    blockedTitle: "Hojiin haaraan siif cufameera",
    blockedBody: "Hayyamni konkolaachisummaa, inshuraansiin ykn hayyamni geejjibaa dirqamaa hin jiru, fudhatama hin arganne, qorannoo eeggachaa jira ykn yeroon isaa darbeera. Sanada sirrii olkaa'i; hojii haaraa fudhachuu dura mirkaneessa eegi.",
    warningTitle: "Sanada kee yeroo dhihootti haaromsi",
    warningBody: "Sanadni dirqamaa tokko guyyoota 30 keessatti xumurama. Hojii irraa akka hin cinneef dursee haaromsi.",
    update: "Sanada haaromsi",
    expiryDate: "Guyyaa xumuramu",
    states: {
      missing: "Hin jiru",
      pending: "Qorannoo eeggachaa jira",
      rejected: "Fudhatama hin arganne",
      expired: "Yeroon darbe",
      expiring: "Yeroo dhihootti xumurama",
    },
  },
  am: {
    kicker: "የሰነድ ተገዢነት",
    blockedTitle: "አዲስ ሥራዎች ታግደዋል",
    blockedBody: "አስፈላጊ መንጃ ፈቃድ፣ ኢንሹራንስ ወይም የትራንስፖርት ፈቃድ ጠፍቷል፣ ውድቅ ተደርጓል፣ ማረጋገጫ እየጠበቀ ነው ወይም ጊዜው አልፏል። ትክክለኛውን ሰነድ ይጫኑና አዲስ ጭነት ከመቀበልዎ በፊት ማረጋገጫ ይጠብቁ።",
    warningTitle: "ሰነዶችን በቅርቡ ያድሱ",
    warningBody: "አስፈላጊ ሰነድ በ30 ቀናት ውስጥ ጊዜው ያበቃል። የሥራ መዳረሻዎ እንዳይቋረጥ ቀድመው ያድሱት።",
    update: "ሰነዶችን ያድሱ",
    expiryDate: "የሚያበቃበት ቀን",
    states: {
      missing: "የጠፋ",
      pending: "ማረጋገጫ በመጠበቅ ላይ",
      rejected: "ውድቅ የተደረገ",
      expired: "ጊዜው ያለፈ",
      expiring: "በቅርቡ የሚያበቃ",
    },
  },
  so: {
    kicker: "U HOGGAANSANAANTA DUKUMENTIGA",
    blockedTitle: "Shaqooyinka cusub waa la xannibay",
    blockedBody: "Liisan, caymis ama oggolaansho gaadiid oo waajib ah ayaa maqan, la diiday, sugaya xaqiijin ama dhacay. Soo geli dukumentiga saxda ah oo sug xaqiijinta ka hor intaadan qaadan xamuul kale.",
    warningTitle: "Dukumentiyada dhowaan cusboonaysii",
    warningBody: "Dukumenti waajib ah ayaa ku dhacaya 30 maalmood gudahood. Hore u cusboonaysii si gelitaanka shaqadu uusan u hakad gelin.",
    update: "Cusboonaysii dukumentiyada",
    expiryDate: "Taariikhda dhicista",
    states: {
      missing: "Maqan",
      pending: "Xaqiijin sugaya",
      rejected: "La diiday",
      expired: "Dhacay",
      expiring: "Dhowaan dhacaya",
    },
  },
  ti: {
    kicker: "ምኽባር ሰነዳት",
    blockedTitle: "ሓደስቲ ስራሓት ተዓጽዮም",
    blockedBody: "ኣድላዪ ፍቓድ መዘወሪ፣ ኢንሹራንስ ወይ ፍቓድ መጓዓዝያ የለን፣ ተነጺጉ፣ ምርግጋጽ ይጽበ ኣሎ ወይ ግዜኡ ሓሊፉ። ቅኑዕ ሰነድ ስቐል፣ ቅድሚ ካልእ ጽዕነት ምቕባልካ ድማ ምርግጋጽ ተጸበ።",
    warningTitle: "ሰነዳትካ ቀልጢፍካ ኣሐድስ",
    warningBody: "ኣድላዪ ሰነድ ኣብ ውሽጢ 30 መዓልቲ ግዜኡ ይውዳእ። ስራሕ ከይቋረጽ ኣቐዲምካ ኣሐድሶ።",
    update: "ሰነዳት ኣሐድስ",
    expiryDate: "ዝውድኣሉ ዕለት",
    states: {
      missing: "ዘየለ",
      pending: "ምርግጋጽ ይጽበ ኣሎ",
      rejected: "ተነጺጉ",
      expired: "ግዜኡ ሓሊፉ",
      expiring: "ቀልጢፉ ዝውዳእ",
    },
  },
};

const labels: Record<SupportedLanguage, Record<ExpiryDocumentKey, string>> = {
  en: {
    license_front: "Driving license · front",
    license_back: "Driving license · back",
    insurance: "Insurance certificate",
    transport_permit: "Transport permit",
  },
  om: {
    license_front: "Hayyama konkolaachisummaa · fuuldura",
    license_back: "Hayyama konkolaachisummaa · duuba",
    insurance: "Ragaa inshuraansii",
    transport_permit: "Hayyama geejjibaa",
  },
  am: {
    license_front: "መንጃ ፈቃድ · ፊት",
    license_back: "መንጃ ፈቃድ · ጀርባ",
    insurance: "የኢንሹራንስ ማረጋገጫ",
    transport_permit: "የትራንስፖርት ፈቃድ",
  },
  so: {
    license_front: "Liisanka wadista · hore",
    license_back: "Liisanka wadista · gadaal",
    insurance: "Shahaadada caymiska",
    transport_permit: "Oggolaanshaha gaadiidka",
  },
  ti: {
    license_front: "ፍቓድ መዘወሪ · ቅድሚት",
    license_back: "ፍቓድ መዘወሪ · ድሕሪት",
    insurance: "ምስክር ወረቐት ኢንሹራንስ",
    transport_permit: "ፍቓድ መጓዓዝያ",
  },
};

const localeByLanguage: Record<SupportedLanguage, string> = {
  en: "en-US",
  om: "om-ET",
  am: "am-ET",
  so: "so-SO",
  ti: "ti-ET",
};

function isTruckDocument(key: ExpiryDocumentKey) {
  return key === "insurance" || key === "transport_permit";
}

function daysUntil(expiryDate: string) {
  const [year, month, day] = expiryDate.split("-").map(Number);
  const expiry = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((expiry.getTime() - today.getTime()) / 86_400_000);
}

function findDocument(
  profile: DriverVerificationProfile,
  key: ExpiryDocumentKey,
): DriverVerificationFile | undefined {
  return profile.documents.find((document) => (
    document.document_key === key
    && (isTruckDocument(key)
      ? Boolean(profile.truck) && document.truck_id === profile.truck?.id
      : document.truck_id === null)
  ));
}

function complianceState(document?: DriverVerificationFile): ComplianceState | null {
  if (!document) return "missing";
  if (document.status === "pending") return "pending";
  if (document.status === "rejected") return "rejected";
  if (!document.expiry_date) return null;
  const days = daysUntil(document.expiry_date);
  if (days < 0) return "expired";
  if (days <= EXPIRY_WARNING_DAYS) return "expiring";
  return null;
}

function collectComplianceItems(profile: DriverVerificationProfile): ComplianceItem[] {
  const requiredKeys: ExpiryDocumentKey[] = profile.truck
    ? [...expiryKeys]
    : ["license_front", "license_back"];

  return requiredKeys.flatMap((key) => {
    const document = findDocument(profile, key);
    const state = complianceState(document);
    return state ? [{ key, state, expiryDate: document?.expiry_date ?? null }] : [];
  });
}

export function DriverDocumentExpiryAlert() {
  const location = useLocation();
  const { selectedLanguage } = useLanguage();
  const c = copy[selectedLanguage];
  const documentLabels = labels[selectedLanguage];
  const [items, setItems] = useState<ComplianceItem[]>([]);

  const load = useCallback(async () => {
    try {
      const profile = await getMyVerificationProfile();
      if (profile.profile.driver_status !== "approved") {
        setItems([]);
        return;
      }
      setItems(collectComplianceItems(profile));
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_INTERVAL_MS);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [load]);

  if (!items.length) return null;

  const blocked = items.some((item) => item.state !== "expiring");
  const title = blocked ? c.blockedTitle : c.warningTitle;
  const body = blocked ? c.blockedBody : c.warningBody;
  const dateFormatter = new Intl.DateTimeFormat(localeByLanguage[selectedLanguage], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <section
      className={`mx-auto mt-4 w-[calc(100%-2rem)] max-w-6xl overflow-hidden border ${blocked ? "border-route/35 bg-route/5" : "border-amber/45 bg-amber/10"}`}
      role={blocked ? "alert" : "status"}
    >
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="min-w-0">
          <p className={`font-mono text-[10px] tracking-[.18em] ${blocked ? "text-route" : "text-amber-dim"}`}>{c.kicker}</p>
          <h2 className="mt-1 font-display text-xl font-bold text-asphalt">{title}</h2>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-steel">{body}</p>
        </div>
        {location.pathname !== "/driver/documents" && (
          <Link
            to="/driver/documents"
            className="inline-flex min-h-11 shrink-0 items-center justify-center bg-asphalt px-4 py-3 text-xs font-semibold text-white"
          >
            {c.update} →
          </Link>
        )}
      </div>

      <div className="grid border-t border-asphalt/10 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.key} className="border-b border-asphalt/10 p-4 last:border-b-0 sm:border-r lg:border-b-0">
            <p className="text-xs font-semibold text-asphalt">{documentLabels[item.key]}</p>
            <p className={`mt-2 text-[10px] font-semibold uppercase tracking-wide ${item.state === "expiring" ? "text-amber-dim" : "text-route"}`}>
              {c.states[item.state]}
            </p>
            {item.expiryDate && (
              <p className="mt-1 text-[11px] text-steel">
                {c.expiryDate}: {dateFormatter.format(new Date(`${item.expiryDate}T00:00:00`))}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function isExpiryDocumentKey(key: VerificationDocumentKey): key is ExpiryDocumentKey {
  return (expiryKeys as readonly VerificationDocumentKey[]).includes(key);
}
