import type { SupportedLanguage } from "../i18n/LanguageProvider";

export const CARGO_CATEGORIES = [
  "food",
  "grain_rice",
  "cooking_oil",
  "metal_steel",
  "construction_materials",
  "general_goods",
  "other",
] as const;

export const PACKAGING_TYPES = [
  "bagged",
  "drum_tank",
  "pallet",
  "loose_bulk",
  "container_20ft",
  "container_40ft",
  "other",
] as const;

export type CargoCategory = (typeof CARGO_CATEGORIES)[number];
export type PackagingType = (typeof PACKAGING_TYPES)[number];
export type CargoDetailsValidationCode = "other_details_required" | "container_requires_trailer";

type CargoDetailsCopy = {
  category: string;
  packaging: string;
  notes: string;
  notesPlaceholder: string;
  categories: Record<CargoCategory, string>;
  packagingTypes: Record<PackagingType, string>;
  errors: Record<CargoDetailsValidationCode, string>;
};

export const cargoDetailsCopy: Record<SupportedLanguage, CargoDetailsCopy> = {
  en: {
    category: "Cargo category",
    packaging: "Packaging / load type",
    notes: "Additional cargo details",
    notesPlaceholder: "Product name, handling instructions, quantity details…",
    categories: {
      food: "Food",
      grain_rice: "Grain / rice",
      cooking_oil: "Cooking oil",
      metal_steel: "Metal / steel",
      construction_materials: "Construction materials",
      general_goods: "General goods",
      other: "Other",
    },
    packagingTypes: {
      bagged: "Bagged",
      drum_tank: "Drum / tank",
      pallet: "Pallet",
      loose_bulk: "Loose / bulk",
      container_20ft: "20 ft container",
      container_40ft: "40 ft container",
      other: "Other",
    },
    errors: {
      other_details_required: "Describe the cargo when Other is selected.",
      container_requires_trailer: "A 20 ft or 40 ft container requires a Trailer.",
    },
  },
  om: {
    category: "Gosa feʼumsaa",
    packaging: "Akkaataa kuusaa / feʼumsaa",
    notes: "Ibsa feʼumsaa dabalataa",
    notesPlaceholder: "Maqaa meeshaa, qajeelfama qabannaa, ibsa baayʼinaa…",
    categories: {
      food: "Nyaata",
      grain_rice: "Midhaan / ruuzii",
      cooking_oil: "Zayita nyaataa",
      metal_steel: "Sibiila / steel",
      construction_materials: "Meeshaa ijaarsaa",
      general_goods: "Meeshaa waliigalaa",
      other: "Kan biraa",
    },
    packagingTypes: {
      bagged: "Korojoodhaan",
      drum_tank: "Drum / taankii",
      pallet: "Pallet",
      loose_bulk: "Laafaa / baayʼinaan",
      container_20ft: "Container 20 ft",
      container_40ft: "Container 40 ft",
      other: "Kan biraa",
    },
    errors: {
      other_details_required: "Kan biraa yoo filatte feʼumsa ibsi.",
      container_requires_trailer: "Container 20 ft ykn 40 ft Trailer barbaada.",
    },
  },
  am: {
    category: "የጭነት ዓይነት",
    packaging: "የማሸጊያ / የጭነት አይነት",
    notes: "ተጨማሪ የጭነት ዝርዝር",
    notesPlaceholder: "የምርት ስም፣ የአያያዝ መመሪያ፣ የመጠን ዝርዝር…",
    categories: {
      food: "ምግብ",
      grain_rice: "እህል / ሩዝ",
      cooking_oil: "የምግብ ዘይት",
      metal_steel: "ብረት / ስቲል",
      construction_materials: "የግንባታ እቃዎች",
      general_goods: "አጠቃላይ እቃዎች",
      other: "ሌላ",
    },
    packagingTypes: {
      bagged: "በከረጢት",
      drum_tank: "ድረም / ታንክ",
      pallet: "ፓሌት",
      loose_bulk: "ልቅ / በጅምላ",
      container_20ft: "20 ጫማ ኮንቴነር",
      container_40ft: "40 ጫማ ኮንቴነር",
      other: "ሌላ",
    },
    errors: {
      other_details_required: "ሌላ ሲመረጥ ጭነቱን ይግለጹ።",
      container_requires_trailer: "20 ወይም 40 ጫማ ኮንቴነር ትሬለር ያስፈልገዋል።",
    },
  },
  so: {
    category: "Nooca xamuulka",
    packaging: "Baakadka / qaabka xamuulka",
    notes: "Faahfaahin dheeraad ah",
    notesPlaceholder: "Magaca badeecadda, tilmaamaha maaraynta, faahfaahinta tirada…",
    categories: {
      food: "Cunto",
      grain_rice: "Badar / bariis",
      cooking_oil: "Saliid cunto",
      metal_steel: "Bir / steel",
      construction_materials: "Qalabka dhismaha",
      general_goods: "Alaab guud",
      other: "Kale",
    },
    packagingTypes: {
      bagged: "Jawaanno",
      drum_tank: "Foosto / taangi",
      pallet: "Pallet",
      loose_bulk: "Furan / jumlo",
      container_20ft: "Koonteenar 20 ft",
      container_40ft: "Koonteenar 40 ft",
      other: "Kale",
    },
    errors: {
      other_details_required: "Sharax xamuulka marka Kale la doorto.",
      container_requires_trailer: "Koonteenar 20 ft ama 40 ft wuxuu u baahan yahay Trailer.",
    },
  },
  ti: {
    category: "ዓይነት ጽዕነት",
    packaging: "መዐሸጊ / ኣገባብ ጽዕነት",
    notes: "ተወሳኺ ዝርዝር ጽዕነት",
    notesPlaceholder: "ስም ፍርያት፣ መምርሒ ኣተሓሕዛ፣ ዝርዝር ብዝሒ…",
    categories: {
      food: "ምግቢ",
      grain_rice: "እኽሊ / ሩዝ",
      cooking_oil: "ዘይቲ ምግቢ",
      metal_steel: "ሓጺን / steel",
      construction_materials: "ናውቲ ህንጻ",
      general_goods: "ሓፈሻዊ ኣቑሑ",
      other: "ካልእ",
    },
    packagingTypes: {
      bagged: "ብከረጺት",
      drum_tank: "ድራም / ታንኪ",
      pallet: "Pallet",
      loose_bulk: "ፍቱሕ / ብጅምላ",
      container_20ft: "Container 20 ft",
      container_40ft: "Container 40 ft",
      other: "ካልእ",
    },
    errors: {
      other_details_required: "ካልእ እንተመሪጽካ ጽዕነቱ ግለጽ።",
      container_requires_trailer: "Container 20 ft ወይ 40 ft Trailer የድልዮ።",
    },
  },
};

const englishCategoryLabels = cargoDetailsCopy.en.categories;
const englishPackagingLabels = cargoDetailsCopy.en.packagingTypes;

export function isContainerPackaging(packagingType: PackagingType) {
  return packagingType === "container_20ft" || packagingType === "container_40ft";
}

export function validateCargoDetails(input: {
  category: CargoCategory;
  packagingType: PackagingType;
  vehicleType: string;
  notes?: string | null;
}): CargoDetailsValidationCode | null {
  if (input.category === "other" && (input.notes ?? "").trim().length < 3) {
    return "other_details_required";
  }
  if (isContainerPackaging(input.packagingType) && input.vehicleType.trim().toLowerCase() !== "trailer") {
    return "container_requires_trailer";
  }
  return null;
}

export function buildCargoDescription(input: {
  category: CargoCategory;
  packagingType: PackagingType;
  load: string;
  notes?: string | null;
}) {
  const parts = [
    englishCategoryLabels[input.category],
    englishPackagingLabels[input.packagingType],
    input.load,
  ];
  const notes = (input.notes ?? "").trim();
  if (notes) parts.push(notes);
  return parts.join(" · ");
}
