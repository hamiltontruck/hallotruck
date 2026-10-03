import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const quoteRoute = fs.readFileSync(
  new URL("../../../supabase/functions/quote-route/index.ts", import.meta.url), "utf8",
);
const bookingRoute = fs.readFileSync(
  new URL("../../../supabase/functions/customer-booking/index.ts", import.meta.url), "utf8",
);

for (const [name, source] of [["quote-route", quoteRoute], ["customer-booking", bookingRoute]]) {
  test(`${name} rejects a Djibouti to Adama western HGV detour`, () => {
    assert.match(source, /DJIBOUTI_ADAMA_GUARD/);
    assert.match(source, /routeNeedsDjiboutiAdamaGuard/);
    assert.match(source, /routeNeedsDjiboutiAdamaGuard\([^)]*dropoff[^)]*pickup\)/);
    assert.match(source, /routeHasWesternDetour/);
    assert.match(source, /routeHasDestinationOvershoot/);
    assert.match(source, /DJIBOUTI_ADAMA_MAX_ROUTE_KM/);
    assert.match(source, /preference/);
    assert.match(source, /requestRoute/);
    assert.match(source, /"recommended"/);
    assert.match(source, /isRouteAcceptable/);
    assert.match(source, /!isRouteAcceptable\(\)/);
    assert.match(source, /distanceKm/);
    assert.match(source, /durationMinutes/);
  });
}

test("Djibouti Adama keeps the authoritative recommended HGV route instead of replacing it with shortest", () => {
  for (const [name, source] of [["quote-route", quoteRoute], ["customer-booking", bookingRoute]]) {
    assert.doesNotMatch(
      source,
      /guardedRoute\s*&&\s*!isRouteAcceptable\(\)[\s\S]*?requestRoute\("shortest"\)/,
      `${name} must not replace a valid recommended driving-hgv route with a shortest fallback`,
    );
  }
});
