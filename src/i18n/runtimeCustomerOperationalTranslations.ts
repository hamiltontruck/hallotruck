import { useEffect } from "react";
import type { SupportedLanguage } from "./LanguageProvider";

type CustomerOperationalLanguage = Exclude<SupportedLanguage, "en">;
type OperationalKey =
  | "quoted"
  | "placed"
  | "assigned"
  | "accepted"
  | "inTransit"
  | "delivered"
  | "cancelled"
  | "unpaid"
  | "pending"
  | "pendingVerification"
  | "initiated"
  | "heldEscrow"
  | "released"
  | "refunded"
  | "failed"
  | "paid"
  | "partiallyPaid"
  | "verified"
  | "rejected"
  | "driver"
  | "invoice"
  | "invoiceReceiptPdf"
  | "cashToDriver"
  | "close"
  | "closeNewOrder"
  | "orderFilters"
  | "orderSteps";

type OperationalCopy = {
  labels: Record<OperationalKey, string>;
  vehicles: Record<string, string>;
  units: {
    ton: string;
    tons: string;
    quintal: string;
  };
  callName: (name: string) => string;
};

type TextState = { source: string; translated: string };
type AttributeState = { source: string; translated: string };

const textState = new WeakMap<Text, TextState>();
const attributeState = new WeakMap<Element, Map<string, AttributeState>>();
const translatedAttributes = ["placeholder", "aria-label", "title", "alt"] as const;
const customerSurfaceSelector = '[class*="customer-"], .customer-portal-mobile';

const sourceKeys: Record<string, OperationalKey> = {
  quoted: "quoted",
  placed: "placed",
  assigned: "assigned",
  accepted: "accepted",
  "in transit": "inTransit",
  delivered: "delivered",
  cancelled: "cancelled",
  canceled: "cancelled",
  unpaid: "unpaid",
  pending: "pending",
  "pending verification": "pendingVerification",
  initiated: "initiated",
  "held escrow": "heldEscrow",
  released: "released",
  refunded: "refunded",
  failed: "failed",
  paid: "paid",
  "partially paid": "partiallyPaid",
  verified: "verified",
  rejected: "rejected",
  driver: "driver",
  invoice: "invoice",
  "invoice / receipt pdf": "invoiceReceiptPdf",
  "cash to driver": "cashToDriver",
  close: "close",
  "close new order": "closeNewOrder",
  "order filters": "orderFilters",
  "order steps": "orderSteps",
};

const copies: Record<CustomerOperationalLanguage, OperationalCopy> = {
  om: {
    labels: {
      quoted: "Gatiin kenname",
      placed: "Ajajni uumame",
      assigned: "Ramadame",
      accepted: "Fudhatame",
      inTransit: "Imala irra",
      delivered: "Geessame",
      cancelled: "Dhiifame",
      unpaid: "Hin kaffalamne",
      pending: "Eeggachaa jira",
      pendingVerification: "Mirkaneessa eeggachaa jira",
      initiated: "Ergame",
      heldEscrow: "Kaffaltiin qabame",
      released: "Gadi lakkifame",
      refunded: "Deebifame",
      failed: "Hin milkoofne",
      paid: "Kaffalame",
      partiallyPaid: "Gartokkoon kaffalame",
      verified: "Mirkanaa'e",
      rejected: "Fudhatama hin arganne",
      driver: "Konkolaachisaa",
      invoice: "Waraqaa gatii",
      invoiceReceiptPdf: "Waraqaa gatii / ragaa kaffaltii PDF",
      cashToDriver: "Maallaqa konkolaachisaaf",
      close: "Cufi",
      closeNewOrder: "Ajaja haaraa cufi",
      orderFilters: "Ajajoota calali",
      orderSteps: "Tarkaanfii ajajaa",
    },
    vehicles: {
      pickup: "Piikaappii",
      van: "Vaanii",
      "isuzu 5 ton": "Isuzu Tonii 5",
      "dry cargo": "Konkolaataa fe'umsaa gogaa",
      refrigerated: "Konkolaataa qabbanaa'aa",
      "truck 22 ton": "Truck Tonii 22",
      "truck 25 ton": "Truck Tonii 25",
      "truck 30 ton": "Truck Tonii 30",
      trailer: "Tireelarii",
    },
    units: { ton: "tonii", tons: "tonii", quintal: "kuntaala" },
    callName: (name) => `Bilbili: ${name}`,
  },
  am: {
    labels: {
      quoted: "ዋጋ ተሰጥቷል",
      placed: "ትዕዛዙ ተፈጥሯል",
      assigned: "ተመድቧል",
      accepted: "ተቀባይነት አግኝቷል",
      inTransit: "በመንገድ ላይ",
      delivered: "ደርሷል",
      cancelled: "ተሰርዟል",
      unpaid: "ያልተከፈለ",
      pending: "በመጠበቅ ላይ",
      pendingVerification: "ማረጋገጫ በመጠበቅ ላይ",
      initiated: "ተጀምሯል",
      heldEscrow: "ክፍያው ተይዟል",
      released: "ተለቋል",
      refunded: "ተመላሽ ተደርጓል",
      failed: "አልተሳካም",
      paid: "ተከፍሏል",
      partiallyPaid: "በከፊል ተከፍሏል",
      verified: "ተረጋግጧል",
      rejected: "ውድቅ ተደርጓል",
      driver: "አሽከርካሪ",
      invoice: "የክፍያ መጠየቂያ",
      invoiceReceiptPdf: "የክፍያ መጠየቂያ / ደረሰኝ PDF",
      cashToDriver: "ለአሽከርካሪ በጥሬ ገንዘብ",
      close: "ዝጋ",
      closeNewOrder: "አዲስ ትዕዛዝ ዝጋ",
      orderFilters: "የትዕዛዝ ማጣሪያዎች",
      orderSteps: "የትዕዛዝ ደረጃዎች",
    },
    vehicles: {
      pickup: "ፒካፕ",
      van: "ቫን",
      "isuzu 5 ton": "ኢሱዙ 5 ቶን",
      "dry cargo": "ደረቅ ጭነት",
      refrigerated: "ማቀዝቀዣ መኪና",
      "truck 22 ton": "22 ቶን መኪና",
      "truck 25 ton": "25 ቶን መኪና",
      "truck 30 ton": "30 ቶን መኪና",
      trailer: "ተጎታች",
    },
    units: { ton: "ቶን", tons: "ቶን", quintal: "ኩንታል" },
    callName: (name) => `ይደውሉ: ${name}`,
  },
  so: {
    labels: {
      quoted: "Qiime la bixiyey",
      placed: "Dalab la sameeyey",
      assigned: "La qoondeeyey",
      accepted: "La aqbalay",
      inTransit: "Jidka ku jira",
      delivered: "La gaarsiiyey",
      cancelled: "La joojiyey",
      unpaid: "Aan la bixin",
      pending: "Sugaya",
      pendingVerification: "Xaqiijin sugaya",
      initiated: "La bilaabay",
      heldEscrow: "Lacagta waa la hayaa",
      released: "La sii daayey",
      refunded: "Dib loo celiyey",
      failed: "Fashilmay",
      paid: "La bixiyey",
      partiallyPaid: "Qayb ahaan la bixiyey",
      verified: "La xaqiijiyey",
      rejected: "La diiday",
      driver: "Darawal",
      invoice: "Qaansheegad",
      invoiceReceiptPdf: "Qaansheegad / rasiidh PDF",
      cashToDriver: "Lacag caddaan ah oo darawalka la siiyey",
      close: "Xir",
      closeNewOrder: "Xir dalabka cusub",
      orderFilters: "Shaandhaynta dalabyada",
      orderSteps: "Tallaabooyinka dalabka",
    },
    vehicles: {
      pickup: "Pikab",
      van: "Faan",
      "isuzu 5 ton": "Isuzu 5 tan",
      "dry cargo": "Gaadhi xamuul qalalan",
      refrigerated: "Gaadhi qaboojiye",
      "truck 22 ton": "Gaadhi 22 tan",
      "truck 25 ton": "Gaadhi 25 tan",
      "truck 30 ton": "Gaadhi 30 tan",
      trailer: "Tareelar",
    },
    units: { ton: "tan", tons: "tan", quintal: "kiintaal" },
    callName: (name) => `Wac: ${name}`,
  },
  ti: {
    labels: {
      quoted: "ዋጋ ተዋሂቡ",
      placed: "ትእዛዝ ተፈጢሩ",
      assigned: "ተመዲቡ",
      accepted: "ተቐቢሉ",
      inTransit: "ኣብ መንገዲ",
      delivered: "በጺሑ",
      cancelled: "ተሰሪዙ",
      unpaid: "ዘይተኸፍለ",
      pending: "ይጽበ ኣሎ",
      pendingVerification: "ምርግጋጽ ይጽበ ኣሎ",
      initiated: "ተጀሚሩ",
      heldEscrow: "ክፍሊት ተታሒዙ",
      released: "ተለቒቑ",
      refunded: "ተመሊሱ",
      failed: "ኣይተዓወተን",
      paid: "ተኸፊሉ",
      partiallyPaid: "ብኸፊል ተኸፊሉ",
      verified: "ተረጋጊጹ",
      rejected: "ተነጺጉ",
      driver: "መራሕ መኪና",
      invoice: "ደረሰኝ",
      invoiceReceiptPdf: "ደረሰኝ / መረጋገጺ ክፍሊት PDF",
      cashToDriver: "ጥረ ገንዘብ ንመራሕ መኪና",
      close: "ዕጾ",
      closeNewOrder: "ሓድሽ ትእዛዝ ዕጾ",
      orderFilters: "መጻረዪ ትእዛዛት",
      orderSteps: "ደረጃታት ትእዛዝ",
    },
    vehicles: {
      pickup: "ፒካፕ",
      van: "ቫን",
      "isuzu 5 ton": "ኢሱዙ 5 ቶን",
      "dry cargo": "ደረቕ ጽዕነት",
      refrigerated: "መኪና መዝሓሊ",
      "truck 22 ton": "መኪና 22 ቶን",
      "truck 25 ton": "መኪና 25 ቶን",
      "truck 30 ton": "መኪና 30 ቶን",
      trailer: "ትሬለር",
    },
    units: { ton: "ቶን", tons: "ቶን", quintal: "ኩንታል" },
    callName: (name) => `ደውል: ${name}`,
  },
};

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
}

function translateKnownValue(value: string, language: CustomerOperationalLanguage) {
  const copy = copies[language];
  const normalized = normalize(value);
  const key = sourceKeys[normalized];
  if (key) return copy.labels[key];
  return copy.vehicles[normalized] ?? value;
}

function translateOperationalCore(value: string, language: CustomerOperationalLanguage) {
  const direct = translateKnownValue(value, language);
  if (direct !== value) return direct;

  const copy = copies[language];
  const loadMatch = value.match(/^([\d,.]+)\s+(ton|tons|quintal)$/i);
  if (loadMatch) {
    const unit = loadMatch[2].toLowerCase() as "ton" | "tons" | "quintal";
    return `${loadMatch[1]} ${copy.units[unit]}`;
  }

  const truckCapacityMatch = value.match(/^(.+?)\s*·\s*([\d,.]+)\s+(ton|tons)$/i);
  if (truckCapacityMatch) {
    const vehicle = translateKnownValue(truckCapacityMatch[1], language);
    const unit = truckCapacityMatch[3].toLowerCase() as "ton" | "tons";
    return `${vehicle} · ${truckCapacityMatch[2]} ${copy.units[unit]}`;
  }

  const paymentParts = value.split(/\s*·\s*/);
  if (paymentParts.length >= 3 && paymentParts.some((part) => /^ETB\s/i.test(part))) {
    const next = [...paymentParts];
    next[0] = translateKnownValue(next[0], language);
    next[next.length - 1] = translateKnownValue(next[next.length - 1], language);
    return next.join(" · ");
  }

  const callMatch = value.match(/^Call\s+(.+)$/i);
  if (callMatch) return copy.callName(callMatch[1]);

  return value;
}

function translatePreservingWhitespace(value: string, language: CustomerOperationalLanguage) {
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  const core = value.slice(leading.length, value.length - trailing.length);
  if (!core) return value;
  return `${leading}${translateOperationalCore(core, language)}${trailing}`;
}

function isCustomerSurface(element: Element | null) {
  return Boolean(element?.closest(customerSurfaceSelector));
}

function shouldSkipText(node: Text) {
  const parent = node.parentElement;
  return !parent
    || !isCustomerSurface(parent)
    || Boolean(parent.closest("script, style, code, pre, textarea, [data-no-runtime-translate]"));
}

function processText(node: Text, language: CustomerOperationalLanguage | null) {
  if (shouldSkipText(node)) return;
  const current = node.nodeValue ?? "";
  const previous = textState.get(node);

  if (!language) {
    if (previous && current === previous.translated) node.nodeValue = previous.source;
    textState.delete(node);
    return;
  }

  const source = previous && current === previous.translated ? previous.source : current;
  const translated = translatePreservingWhitespace(source, language);
  if (translated === source) {
    textState.delete(node);
    return;
  }

  textState.set(node, { source, translated });
  if (current !== translated) node.nodeValue = translated;
}

function processAttribute(element: Element, attribute: string, language: CustomerOperationalLanguage | null) {
  if (!isCustomerSurface(element) || element.closest("[data-no-runtime-translate]")) return;
  const current = element.getAttribute(attribute);
  if (current === null) return;

  const states = attributeState.get(element) ?? new Map<string, AttributeState>();
  const previous = states.get(attribute);

  if (!language) {
    if (previous && current === previous.translated) element.setAttribute(attribute, previous.source);
    states.delete(attribute);
    if (states.size) attributeState.set(element, states);
    else attributeState.delete(element);
    return;
  }

  const source = previous && current === previous.translated ? previous.source : current;
  const translated = translatePreservingWhitespace(source, language);
  if (translated === source) {
    states.delete(attribute);
    if (states.size) attributeState.set(element, states);
    else attributeState.delete(element);
    return;
  }

  states.set(attribute, { source, translated });
  attributeState.set(element, states);
  if (current !== translated) element.setAttribute(attribute, translated);
}

function processElement(element: Element, language: CustomerOperationalLanguage | null) {
  for (const attribute of translatedAttributes) processAttribute(element, attribute, language);
}

function localizeTree(root: Node, language: CustomerOperationalLanguage | null) {
  if (root.nodeType === Node.TEXT_NODE) {
    processText(root as Text, language);
    return;
  }

  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE) processElement(root as Element, language);

  const textWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let textNode = textWalker.nextNode();
  while (textNode) {
    processText(textNode as Text, language);
    textNode = textWalker.nextNode();
  }

  if ("querySelectorAll" in root) {
    (root as ParentNode)
      .querySelectorAll("[placeholder], [aria-label], [title], [alt]")
      .forEach((element) => processElement(element, language));
  }
}

export function useRuntimeCustomerOperationalTranslation(language: SupportedLanguage | null) {
  const operationalLanguage = language && language !== "en" ? language : null;

  useEffect(() => {
    const root = document.body;
    localizeTree(root, operationalLanguage);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          processText(mutation.target as Text, operationalLanguage);
          continue;
        }
        if (mutation.type === "attributes") {
          processAttribute(mutation.target as Element, mutation.attributeName ?? "", operationalLanguage);
          continue;
        }
        mutation.addedNodes.forEach((node) => localizeTree(node, operationalLanguage));
      }
    });

    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...translatedAttributes],
    });

    return () => observer.disconnect();
  }, [operationalLanguage]);
}
