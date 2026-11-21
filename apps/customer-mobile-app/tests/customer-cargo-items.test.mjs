import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const compiled = await build({
  entryPoints: [fileURLToPath(new URL("../src/customer-cargo-items.ts", import.meta.url))],
  bundle: true, platform: "node", format: "esm", write: false,
});
const source = compiled.outputFiles[0].text;
const {
  CUSTOMER_CARGO_ITEM_OPTIONS, customerCargoItemCopy,
  getCustomerCargoItems, customerCargoItemBelongsToCategory,
  buildCustomerCargoNotes, validateCustomerCargoItem,
} = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));

const categories = ["food", "grain_rice", "cooking_oil", "metal_steel", "construction_materials", "general_goods"];
const supportedLanguages = ["en", "om", "am"];

test("cargo item catalog covers all six canonical database categories with translated distinct items", () => {
  assert.deepEqual(Object.keys(CUSTOMER_CARGO_ITEM_OPTIONS).sort(), [...categories].sort());
  const ids = new Set();
  for (const category of categories) {
    const entries = CUSTOMER_CARGO_ITEM_OPTIONS[category];
    assert.ok(entries.length >= 4, category + " should offer multiple detailed items");
    for (const option of entries) {
      assert.match(option.id, /^[a-z][a-z0-9_]*$/, option.id);
      assert.ok(!ids.has(option.id), "duplicate cargo item " + option.id);
      ids.add(option.id);
      for (const lang of supportedLanguages) {
        assert.ok(option[lang]?.trim().length >= 2, category + ":" + option.id + ":" + lang);
        const localized = getCustomerCargoItems(category, lang).find(item => item.id === option.id);
        assert.equal(localized?.label, option[lang]);
      }
    }
  }
  assert.ok(ids.size >= 40, "cargo list should materially expand beyond the original 6 categories");
  for (const lang of supportedLanguages) {
    assert.ok(customerCargoItemCopy[lang].itemLabel.length > 2);
    assert.ok(customerCargoItemCopy[lang].itemPlaceholder.length > 2);
    assert.ok(customerCargoItemCopy[lang].errors.cargo_notes_too_long.length > 2);
  }
});

test("specific cargo item is optional and must belong to its selected canonical category", () => {
  assert.equal(validateCustomerCargoItem({ category: "food", item: "" }), null);
  assert.equal(validateCustomerCargoItem({ category: "construction_materials", item: "cement" }), null);
  assert.equal(customerCargoItemBelongsToCategory("construction_materials", "cement"), true);
  assert.equal(customerCargoItemBelongsToCategory("food", "cement"), false);
  assert.equal(validateCustomerCargoItem({ category: "food", item: "cement" }), "invalid_cargo_item");
  assert.equal(validateCustomerCargoItem({ category: "food", item: "invented_item" }), "invalid_cargo_item");
});

test("selected details are stored in existing cargo notes with no new category or enum value", () => {
  assert.equal(buildCustomerCargoNotes({ category: "food", item: "" }), "");
  assert.equal(buildCustomerCargoNotes({
    category: "grain_rice", item: "teff", notes: "100 bags, keep dry",
  }), "Cargo item: Teff · 100 bags, keep dry");
  assert.equal(buildCustomerCargoNotes({
    category: "construction_materials", item: "cement", notes: "  Secure bags  ",
  }), "Cargo item: Cement · Secure bags");
  assert.equal(validateCustomerCargoItem({
    category: "grain_rice", item: "teff", notes: "x".repeat(480),
  }), "cargo_notes_too_long");
  assert.equal(validateCustomerCargoItem({
    category: "general_goods", item: "", notes: "x".repeat(500),
  }), null);
  assert.equal(validateCustomerCargoItem({
    category: "general_goods", item: "", notes: "x".repeat(501),
  }), "cargo_notes_too_long");
});

test("active Customer V4 journey uses optional item choices, category reset and a save-time guard", () => {
  const journey = readFileSync(new URL("../src/CustomerBookingJourney.tsx", import.meta.url), "utf8");
  const service = readFileSync(new URL("../src/customer-order.service-v2.ts", import.meta.url), "utf8");
  const legacyContract = readFileSync(new URL("../src/customer-cargo-contract.ts", import.meta.url), "utf8");
  assert.match(journey, /const \[cargoItem, setCargoItem\] = useState<CustomerCargoItem \| "">\("">\)/);
  assert.match(journey, /getCustomerCargoItems\(cargoCategory, language\)\.map/);
  assert.match(journey, /setCargoCategory\(event\.target\.value as CustomerCargoCategory\); setCargoItem\("">\)/);
  assert.match(journey, /validateCustomerCargoItem\(\{ category: cargoCategory, item: cargoItem, notes: note \}\)/);
  assert.match(journey, /cargoItem,\s*packagingType,\s*cargoNotes: note/);
  assert.match(service, /validateCustomerCargoItem\(\{/);
  assert.match(service, /buildCustomerCargoNotes\(\{/);
  assert.match(service, /cargo_notes: cargoNotes/);
  assert.match(service, /cargo_category: input\.cargoCategory/);
  assert.doesNotMatch(legacyContract.match(/CUSTOMER_CARGO_CATEGORIES = \[([\s\S]*?)\] as const;/)?.[1] || "", /"other"/);
  assert.match(legacyContract, /container_requires_trailer/);
});
