import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const chrome = await readFile("mobile/customer/android/app/src/main/java/com/hallo/logistics/customer/CustomerUnifiedChrome.kt", "utf8");
const nav = await readFile("mobile/customer/android/app/src/main/java/com/hallo/logistics/customer/CustomerNavButton.kt", "utf8");
const en = await readFile("mobile/customer/android/app/src/main/res/values/customer_unified_strings.xml", "utf8");
const om = await readFile("mobile/customer/android/app/src/main/res/values-om/customer_unified_strings.xml", "utf8");
const am = await readFile("mobile/customer/android/app/src/main/res/values-am/customer_unified_strings.xml", "utf8");

assert.match(chrome, /navigation\.weightSum = 6f/, "Customer Android bottom navigation must expose six destinations");
assert.match(chrome, /R\.id\.navHome[\s\S]*R\.id\.navOrders[\s\S]*book[\s\S]*R\.id\.navTrack[\s\S]*R\.id\.navBook[\s\S]*R\.id\.navProfile/, "Approved navigation order must be Home, Orders, Book, Track, Payments, Profile");
assert.match(chrome, /R\.id\.startBooking\)\?\.performClick\(\)/, "Central Book navigation must reuse the authoritative booking handler");
assert.match(chrome, /R\.id\.pageBook\)\?\.visibility == View\.VISIBLE/, "Central Book action must receive booking-page active state");
assert.match(nav, /CustomerUnifiedChrome\.install\(rootView\)/, "Existing native navigation must install the six-destination chrome");
assert.match(en, />Book</, "English Book navigation label is required");
assert.match(om, />Ajaji</, "Afaan Oromoo Book navigation label is required");
assert.match(am, />ይዘዙ</, "Amharic Book navigation label is required");

console.log("Customer Android unified six-destination navigation regression guards passed.");
