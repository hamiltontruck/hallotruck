import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const chrome = await readFile("mobile/customer/android/app/src/main/java/com/hallo/logistics/customer/CustomerUnifiedChrome.kt", "utf8");
const parity = await readFile("mobile/customer/android/app/src/main/java/com/hallo/logistics/customer/CustomerParityUiV2.kt", "utf8");
const nav = await readFile("mobile/customer/android/app/src/main/java/com/hallo/logistics/customer/CustomerNavButton.kt", "utf8");
const en = await readFile("mobile/customer/android/app/src/main/res/values/customer_unified_strings.xml", "utf8");
const om = await readFile("mobile/customer/android/app/src/main/res/values-om/customer_unified_strings.xml", "utf8");
const am = await readFile("mobile/customer/android/app/src/main/res/values-am/customer_unified_strings.xml", "utf8");

assert.match(chrome, /navigation\.weightSum = 6f/, "Customer Android bottom navigation must expose six destinations");
assert.match(chrome, /R\.id\.navHome[\s\S]*R\.id\.navOrders[\s\S]*book[\s\S]*R\.id\.navTrack[\s\S]*R\.id\.navBook[\s\S]*R\.id\.navProfile/, "Approved navigation order must be Home, Orders, Book, Track, Payments, Profile");
assert.match(chrome, /R\.id\.startBooking\)\?\.performClick\(\)/, "Central Book navigation must reuse the authoritative booking handler");
assert.match(chrome, /R\.id\.pageBook\)\?\.visibility == View\.VISIBLE/, "Central Book action must receive booking-page active state");
assert.match(chrome, /CustomerParityUiV2\.install\(root\)/, "Unified chrome must install the approved Customer parity layer");
assert.match(nav, /CustomerUnifiedChrome\.install\(rootView\)/, "Existing native navigation must install the six-destination chrome");

assert.match(parity, /TAG_TOP_CHROME/, "Customer parity layer must provide one shared top chrome");
assert.match(parity, /R\.string\.dash_quick_actions/, "Home must expose the approved quick-action composition");
assert.match(parity, /R\.string\.metric_delivered/, "Home KPI panel must include delivered orders");
assert.match(parity, /R\.string\.dash_promo_title/, "Home must include the approved cargo commitment promo");
assert.match(parity, /R\.string\.booking_progress_route[\s\S]*R\.string\.booking_progress_cargo[\s\S]*R\.string\.booking_progress_truck[\s\S]*R\.string\.booking_progress_quote/, "Booking progress must follow Route, Cargo, Truck, Quote");
assert.match(parity, /Regex\("\^Order \(\.\+\) created\$"\)/, "Successful booking must render an explicit success state from the authoritative created order");
assert.doesNotMatch(parity, /Contact Support|support@|tel:\+|https?:\/\/wa\.me/i, "Customer parity UI must not fabricate an unverified support target");

assert.match(en, />Book</, "English Book navigation label is required");
assert.match(om, />Ajaji</, "Afaan Oromoo Book navigation label is required");
assert.match(am, />ይዘዙ</, "Amharic Book navigation label is required");
assert.match(en, /Booking successful!/, "English booking success copy is required");
assert.match(om, /Ajajni milkaa’eera!/, "Afaan Oromoo booking success copy is required");
assert.match(am, /ትዕዛዙ ተሳክቷል!/, "Amharic booking success copy is required");

console.log("Customer Android unified navigation and approved UI parity regression guards passed.");
