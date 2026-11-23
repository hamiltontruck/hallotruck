import type { CustomerLanguage } from "./customer-language";
import {
  CUSTOMER_CARGO_CATEGORIES,
  type CustomerCargoCategory,
} from "./customer-cargo-contract";

/**
 * Detailed cargo items are an optional UI/catalog refinement, NOT new DB
 * cargo_category values. Orders continue to store a canonical category while
 * the selected item is carried through the existing bounded cargo_notes text.
 */
export const CUSTOMER_CARGO_ITEM_OPTIONS = {
  food: [
    { id: "soft_drinks", en: "Soft drinks", om: "Dhugaatii lallaafaa (Soft drink)", am: "ለስላሳ መጠጦች" },
    { id: "bottled_water", en: "Bottled drinking water (Highland)", om: "Bishaan qaruuraa (Highland)", am: "የታሸገ ውሃ (ሃይላንድ)" },
    { id: "sugar", en: "Sugar", om: "Sukkaara", am: "ስኳር" },
    { id: "fresh_vegetables", en: "Fresh vegetables", om: "Kuduraa haaraa", am: "ትኩስ አትክልት" },
    { id: "fresh_fruit", en: "Fresh fruit", om: "Fuduraalee haaraa", am: "ትኩስ ፍራፍሬ" },
    { id: "frozen_food", en: "Frozen food", om: "Nyaata qabbanaa'e", am: "የቀዘቀዘ ምግብ" },
    { id: "dairy_products", en: "Milk & dairy products", om: "Aannan fi oomisha aannan", am: "ወተትና የወተት ውጤቶች" },
    { id: "meat_products", en: "Meat products", om: "Oomisha foonii", am: "የስጋ ምርቶች" },
    { id: "packaged_food", en: "Packaged food", om: "Nyaata qophaa'ee kuufame", am: "የታሸገ ምግብ" },
    { id: "beverages", en: "Beverages", om: "Dhugaatii", am: "መጠጦች" },
    { id: "sugar_flour", en: "Sugar / flour", om: "Sukkaara / daakuu", am: "ስኳር / ዱቄት" },
  ],
  grain_rice: [
    { id: "beans", en: "Haricot beans", om: "Boloqqee", am: "ቦሎቄ" },
    { id: "teff", en: "Teff", om: "Xaafii", am: "ጤፍ" },
    { id: "wheat", en: "Wheat", om: "Qamadii", am: "ስንዴ" },
    { id: "maize", en: "Maize / corn", om: "Boqqolloo", am: "በቆሎ" },
    { id: "barley", en: "Barley", om: "Garbuu", am: "ገብስ" },
    { id: "sorghum", en: "Sorghum", om: "Mishingaa", am: "ማሽላ" },
    { id: "rice", en: "Rice", om: "Ruuzii", am: "ሩዝ" },
    { id: "coffee_beans", en: "Coffee beans", om: "Buna", am: "የቡና ፍሬ" },
    { id: "sesame", en: "Sesame", om: "Saliixii", am: "ሰሊጥ" },
    { id: "pulses", en: "Beans / pulses", om: "Baaqelaa / atara", am: "ባቄላ / አተር" },
  ],
  cooking_oil: [
    { id: "bottled_oil", en: "Bottled cooking oil", om: "Zayita nyaataa qaruuraa", am: "በጠርሙስ የታሸገ ዘይት" },
    { id: "jerrycan_oil", en: "Jerrycan cooking oil", om: "Zayita nyaataa jeriikaanii", am: "በጀሪካን ያለ ዘይት" },
    { id: "drum_oil", en: "Drum-packed cooking oil", om: "Zayita nyaataa dramii", am: "በበርሜል ያለ ዘይት" },
    { id: "bulk_oil", en: "Bulk edible oil", om: "Zayita nyaataa baay'inaan", am: "የጅምላ የምግብ ዘይት" },
  ],
  metal_steel: [
    { id: "metal_products", en: "Metal products", om: "Bu'aalee / meeshaalee sibiilaa", am: "የብረት ውጤቶች / እቃዎች" },
    { id: "rebar", en: "Reinforcement bars (rebar)", om: "Sibiila ijaarsaa (rebar)", am: "የማጠናከሪያ ብረት" },
    { id: "steel_coils", en: "Steel coils", om: "Sibiila maramaa", am: "የተጠቀለለ ስቲል" },
    { id: "steel_sheets", en: "Steel sheets", om: "Sibiila diriiraa", am: "የስቲል ሉሆች" },
    { id: "steel_pipes", en: "Steel pipes", om: "Ujummoo sibiilaa", am: "የብረት ቧንቧዎች" },
    { id: "aluminum", en: "Aluminium products", om: "Oomisha aluminiyeemii", am: "የአሉሚኒየም ምርቶች" },
    { id: "scrap_metal", en: "Scrap metal", om: "Sibiila iskiraappii (hafe)", am: "የተረፈ ብረት" },
  ],
  construction_materials: [
    { id: "construction_supplies", en: "Construction supplies", om: "Meeshaalee ijaarsaa", am: "የግንባታ እቃዎች" },
    { id: "cement", en: "Cement", om: "Simintoo", am: "ሲሚንቶ" },
    { id: "sand", en: "Sand", om: "Cirracha", am: "አሸዋ" },
    { id: "gravel", en: "Gravel / aggregate", om: "Dhagaa caccabaa", am: "ጠጠር" },
    { id: "bricks_blocks", en: "Bricks / concrete blocks", om: "Xuubii / bilookii", am: "ጡብ / ብሎኬት" },
    { id: "ceramic_tiles", en: "Ceramic tiles", om: "Taayilii", am: "ሴራሚክ ንጣፍ" },
    { id: "timber", en: "Timber / wood", om: "Mukaa", am: "እንጨት" },
    { id: "roofing_sheets", en: "Roofing sheets", om: "Sibiila bantii", am: "የጣሪያ ቆርቆሮ" },
    { id: "gypsum", en: "Gypsum board", om: "Gabatee jiipsamii", am: "ጂፕሰም ቦርድ" },
    { id: "glass_panels", en: "Glass panels", om: "Fuullee", am: "የመስታወት ሰሌዳ" },
    { id: "building_pipes", en: "Construction pipes", om: "Ujummoo ijaarsaa", am: "የግንባታ ቧንቧዎች" },
  ],
  general_goods: [
    { id: "empty_barrels", en: "Empty barrels / drums", om: "Barmila / dramii duwwaa", am: "ባዶ በርሜሎች / ድረሞች" },
    { id: "wooden_products", en: "Wooden products", om: "Meeshaalee mukaa", am: "የእንጨት እቃዎች" },
    { id: "assorted_goods", en: "Assorted goods", om: "Meeshaalee adda addaa", am: "የተለያዩ እቃዎች" },
    { id: "industrial_equipment", en: "Factory / industrial equipment", om: "Meeshaalee warshaa fi industirii", am: "የፋብሪካ / የኢንዱስትሪ መሳሪያዎች" },
    { id: "household_goods", en: "Household goods", om: "Meeshaa mana keessaa", am: "የቤት እቃዎች" },
    { id: "furniture", en: "Furniture", om: "Meeshaa manaa", am: "ፈርኒቸር" },
    { id: "electronics", en: "Electronics", om: "Meeshaa elektirooniksii", am: "ኤሌክትሮኒክስ" },
    { id: "appliances", en: "Home appliances", om: "Meeshaalee elektirikii manaa", am: "የቤት ኤሌክትሪክ መሳሪያዎች" },
    { id: "clothing_textiles", en: "Clothing / textiles", om: "Uffata / huccuu", am: "ልብስ / ጨርቃጨርቅ" },
    { id: "retail_goods", en: "Retail merchandise", om: "Sheqaxa adda addaa", am: "የንግድ እቃዎች" },
    { id: "auto_parts", en: "Vehicle spare parts", om: "Qodaa konkolaataa", am: "የመኪና መለዋወጫ" },
    { id: "machinery_parts", en: "Machinery / parts", om: "Maashinii / qooda isaa", am: "ማሽነሪ / መለዋወጫ" },
    { id: "paper_products", en: "Paper / stationery", om: "Waraqaa / meeshaa barreeffamaa", am: "ወረቀት / የጽሕፈት መሣሪያ" },
    { id: "plastic_goods", en: "Plastic goods", om: "Meeshaalee pilaastikii", am: "የፕላስቲክ እቃዎች" },
  ],
} as const satisfies Record<CustomerCargoCategory, readonly {
  id: string; en: string; om: string; am: string;
}[]>;

export type CustomerCargoItem =
  (typeof CUSTOMER_CARGO_ITEM_OPTIONS)[CustomerCargoCategory][number]["id"];

export type CustomerCargoItemValidationCode = "invalid_cargo_item" | "cargo_notes_too_long";

export const customerCargoItemCopy: Record<CustomerLanguage, {
  itemLabel: string;
  itemPlaceholder: string;
  itemHelp: string;
  errors: Record<CustomerCargoItemValidationCode, string>;
}> = {
  en: {
    itemLabel: "Specific cargo item (Optional)",
    itemPlaceholder: "Choose a specific item",
    itemHelp: "Choose an item or describe it in the notes below.",
    errors: {
      invalid_cargo_item: "The selected item does not match this cargo category.",
      cargo_notes_too_long: "Cargo details are too long. Shorten the notes to 500 characters or fewer.",
    },
  },
  om: {
    itemLabel: "Meeshaa fe'umsaa addaa (Filannoo)",
    itemPlaceholder: "Meeshaa addaa filadhu",
    itemHelp: "Meeshaa filadhu yookaan ibsa isaa armaan gaditti barreessi.",
    errors: {
      invalid_cargo_item: "Meeshaan filatame gosa fe'umsaa kana waliin hin walsimu.",
      cargo_notes_too_long: "Ibsi fe'umsaa dheeraa dha. Qubee 500 gadiitti gabaabsi.",
    },
  },
  am: {
    itemLabel: "የጭነት እቃ ዝርዝር (አማራጭ)",
    itemPlaceholder: "የተወሰነ እቃ ይምረጡ",
    itemHelp: "እቃ ይምረጡ ወይም ከታች ዝርዝር ይጻፉ።",
    errors: {
      invalid_cargo_item: "የተመረጠው እቃ ከጭነት ምድቡ ጋር አይዛመድም።",
      cargo_notes_too_long: "የጭነት ዝርዝር ረጅም ነው። ከ500 ቁምፊዎች በታች ያድርጉት።",
    },
  },
};

export function getCustomerCargoItems(
  category: CustomerCargoCategory,
  language: CustomerLanguage,
): ReadonlyArray<{ id: CustomerCargoItem; label: string }> {
  return CUSTOMER_CARGO_ITEM_OPTIONS[category].map((entry) => ({
    id: entry.id,
    label: entry[language],
  }));
}

export function customerCargoItemBelongsToCategory(
  category: CustomerCargoCategory,
  item: CustomerCargoItem | string | null | undefined,
): boolean {
  return !item || getCustomerCargoItems(category, "en").some((option) => option.id === item);
}

function englishCargoItemLabel(item: CustomerCargoItem): string {
  for (const category of CUSTOMER_CARGO_CATEGORIES) {
    const label = getCustomerCargoItems(category, "en").find((entry) => entry.id === item)?.label;
    if (label) return label;
  }
  return "";
}

/** Uses the existing cargo_notes text (max 500 chars); never changes DB enums. */
export function buildCustomerCargoNotes(input: {
  category: CustomerCargoCategory;
  item?: CustomerCargoItem | "" | null;
  notes?: string | null;
}): string {
  const itemLabel = input.item && customerCargoItemBelongsToCategory(input.category, input.item)
    ? englishCargoItemLabel(input.item) : "";
  return [itemLabel ? `Cargo item: ${itemLabel}` : "", input.notes?.trim() ?? ""]
    .filter(Boolean).join(" · ");
}

export function validateCustomerCargoItem(input: {
  category: CustomerCargoCategory;
  item?: CustomerCargoItem | "" | null;
  notes?: string | null;
}): CustomerCargoItemValidationCode | null {
  if (!customerCargoItemBelongsToCategory(input.category, input.item)) return "invalid_cargo_item";
  if (buildCustomerCargoNotes(input).length > 500) return "cargo_notes_too_long";
  return null;
}
