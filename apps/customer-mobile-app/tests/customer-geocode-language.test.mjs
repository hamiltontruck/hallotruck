import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mapTilerSearchLanguage } from "../src/customer-geocode-language.ts";

const quoteService = readFileSync(new URL("../src/customer-quote.service.ts", import.meta.url), "utf8");

test("Latin place query in Oromo UI uses English MapTiler search", () => {
  for (const name of ["Addis Ababa", "Adama", "Djibouti", "Finfinnee", "Ali Sabieh"]) {
    assert.equal(mapTilerSearchLanguage(name, "om"), "en", name);
  }
});

test("Latin place query in Amharic UI uses English MapTiler search", () => {
  for (const name of ["Addis Ababa", "Adama", "Djibouti", "Berbera"]) {
    assert.equal(mapTilerSearchLanguage(name, "am"), "en", name);
  }
});

test("Ethiopic-script place query retains chosen MapTiler language", () => {
  assert.equal(mapTilerSearchLanguage("አዲስ አበባ", "am"), "am");
  assert.equal(mapTilerSearchLanguage("አዳማ", "am"), "am");
  assert.equal(mapTilerSearchLanguage("ሐረር", "om"), "om");
});

test("English selected language and ASCII query remain English", () => {
  assert.equal(mapTilerSearchLanguage("Adama", "en"), "en");
  assert.equal(mapTilerSearchLanguage("  Djibouti  ", "en"), "en");
});

test("both forward geocoder requests share the locale rule; reverse labels are left alone", () => {
  const matches = quoteService.match(/url\.searchParams\.set\("language", mapTilerSearchLanguage\(clean, language\)\);/g) ?? [];
  assert.equal(matches.length, 2);
  assert.match(quoteService, /export async function reverseCustomerPlace[\s\S]*?url\.searchParams\.set\("language", language\)/);
  assert.match(quoteService, /body: JSON\.stringify\(\{ pickup: input\.pickup\.coordinates, dropoff: input\.dropoff\.coordinates, vehicleType: input\.vehicleType \}\)/);
});
