import type { CustomerLanguage } from "./customer-language";

// Existing Customer order values supported by the shared orders contract.
// `other` cargo category is intentionally not offered here so handling notes
// remain optional on Customer Mobile as required by this booking flow.
export const CUSTOMER_CARGO_CATEGORIES = [
  "food",
  "grain_rice",
  "cooking_oil",
  "metal_steel",
  "construction_materials",
  "general_goods",
] as const;

export const CUSTOMER_PACKAGING_TYPES = [
  "bagged",
  "drum_tank",
  "pallet",
  "loose_bulk",
  "container_20ft",
  "container_40ft",
  "other",
] as const;

export type CustomerCargoCategory = (typeof CUSTOMER_CARGO_CATEGORIES)[number];
export type CustomerPackagingType = (typeof CUSTOMER_PACKAGING_TYPES)[number];
export type CustomerCargoValidationCode = "container_requires_trailer";

const ENGLISH_CATEGORY_LABELS: Record<CustomerCargoCategory, string> = {
  food: "Food",
  grain_rice: "Grain / rice",
  cooking_oil: "Cooking oil",
  metal_steel: "Metal / steel",
  construction_materials: "Construction materials",
  general_goods: "General goods",
};

const ENGLISH_PACKAGING_LABELS: Record<CustomerPackagingType, string> = {
  bagged: "Bagged",
  drum_tank: "Drum / tank",
  pallet: "Pallet",
  loose_bulk: "Loose / bulk",
  container_20ft: "20 ft container",
  container_40ft: "40 ft container",
  other: "Other",
};

export const customerCargoCopy: Record<CustomerLanguage, {
  notesPlaceholder: string;
  categories: Record<CustomerCargoCategory, string>;
  packagingTypes: Record<CustomerPackagingType, string>;
  errors: Record<CustomerCargoValidationCode, string>;
}> = {
  en: {
    notesPlaceholder: "Product name, handling instructions, quantity details…",
    categories: ENGLISH_CATEGORY_LABELS,
    packagingTypes: ENGLISH_PACKAGING_LABELS,
    errors: { container_requires_trailer: "A 20 ft or 40 ft container requires a Trailer." },
  },
  om: {
    notesPlaceholder: "Maqaa meeshaa, qajeelfama qabannaa, ibsa baayʼinaa…",
    categories: {
      food: "Nyaata",
      grain_rice: "Midhaan / ruuzii",
      cooking_oil: "Zayita nyaataa",
      metal_steel: "Sibiila / steel",
      construction_materials: "Meeshaa ijaarsaa",
      general_goods: "Meeshaa waliigalaa",
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
    errors: { container_requires_trailer: "Container 20 ft ykn 40 ft Trailer barbaada." },
  },
  am: {
    notesPlaceholder: "የምርት ስም፣ የአያያዝ መመሪያ፣ የመጠን ዝርዝር…",
    categories: {
      food: "ምግብ",
      grain_rice: "እህል / ሩዝ",
      cooking_oil: "የምግብ ዘይት",
      metal_steel: "ብረት / ስቲል",
      construction_materials: "የግንባታ እቃዎች",
      general_goods: "አጠቃላይ እቃዎች",
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
    errors: { container_requires_trailer: "20 ወይም 40 ጫማ ኮንቴነር ትሬለር ያስፈልገዋል።" },
  },
};

export function isCustomerContainerPackaging(packagingType: CustomerPackagingType) {
  return packagingType === "container_20ft" || packagingType === "container_40ft";
}

export function validateCustomerCargoDetails(input: {
  packagingType: CustomerPackagingType;
  vehicleType: string;
}): CustomerCargoValidationCode | null {
  if (isCustomerContainerPackaging(input.packagingType) && input.vehicleType.trim().toLowerCase() !== "trailer") {
    return "container_requires_trailer";
  }
  return null;
}

export function buildCustomerCargoDescription(input: {
  category: CustomerCargoCategory;
  packagingType: CustomerPackagingType;
  load: string;
  notes?: string | null;
}) {
  const parts = [
    ENGLISH_CATEGORY_LABELS[input.category],
    ENGLISH_PACKAGING_LABELS[input.packagingType],
    input.load,
  ];
  const notes = input.notes?.trim();
  if (notes) parts.push(notes);
  return parts.join(" · ");
}
