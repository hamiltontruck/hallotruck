import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

// Replace only the remote client; execute the real service and date rules.
const compiled = await build({
  entryPoints: [fileURLToPath(new URL("../src/customer-order.service-v2.ts", import.meta.url))],
  bundle: true, platform: "node", format: "esm", write: false,
  plugins: [{ name: "local-client", setup(builder) {
    builder.onLoad({ filter: /customer-supabase\.ts$/ }, () => ({
      contents: "export const customerSupabase = globalThis.__serviceDateClient;", loader: "js",
    }));
  } }],
});
const input = {
  userId: "customer", pickupAddress: "Addis", dropoffAddress: "Adama",
  pickup: [38.7, 9], dropoff: [39.3, 8.5], distanceKm: 100,
  vehicleType: "Isuzu", cargoQuantity: 1, cargoUnit: "ton",
  cargoCategory: "grain_rice", packagingType: "bagged",
  cargoNotes: "Keep dry", paymentMethod: "cash", expectedQuoteEtb: 1000,
  serviceDate: "2026-11-20",
};
let moduleCase = 0;
async function runOrder({ serviceDate = input.serviceDate, rollOverAt } = {}) {
  const RealDate = globalThis.Date;
  let now = "2026-11-20T20:59:59Z";
  let inserted;
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
  };
  globalThis.__serviceDateClient = {
    auth: { getUser: async () => ({ data: { user: { id: "customer" } } }) },
    rpc: async () => {
      if (rollOverAt === "quote") now = "2026-11-20T21:00:00Z";
      return { data: { total_quote_etb: 1000 } };
    },
    from: (table) => table === "profiles" ? {
      select: () => ({ eq: () => ({ single: async () => {
        if (rollOverAt === "profile") now = "2026-11-20T21:00:00Z";
        return { data: { full_name: "Customer", phone: "" } };
      } }) }),
    } : {
      insert: (value) => {
        inserted = value;
        return { select: () => ({ single: async () => ({ data: { id: "order", ...value } }) }) };
      },
    },
  };
  try {
    const module = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text + `\n// case ${moduleCase++}`).toString("base64")}`);
    let error;
    try { await module.createCustomerMobileOrder({ ...input, serviceDate }); }
    catch (caught) { error = caught; }
    return { error, inserted };
  } finally {
    globalThis.Date = RealDate;
    delete globalThis.__serviceDateClient;
  }
}
test("order service rejects malformed, impossible and past dates without insertion", async () => {
  for (const serviceDate of ["", "tomorrow", "2026-02-30", "2026-11-19"]) {
    const { error, inserted } = await runOrder({ serviceDate });
    assert.match(error?.message ?? "", /valid service date/, serviceDate);
    assert.equal(inserted, undefined);
  }
});
for (const rollOverAt of ["quote", "profile"]) {
  test(`order service revalidates Ethiopia date after awaited ${rollOverAt} crosses midnight`, async () => {
    const { error, inserted } = await runOrder({ rollOverAt });
    assert.match(error?.message ?? "", /valid service date/);
    assert.equal(inserted, undefined, "newly past date must never reach insert");
  });
}
test("a future service date survives midnight and preserves cargo notes", async () => {
  const { error, inserted } = await runOrder({ serviceDate: "2026-11-21", rollOverAt: "profile" });
  assert.equal(error, undefined);
  assert.equal(inserted.service_date, "2026-11-21");
  assert.equal(inserted.cargo_category, "grain_rice");
  assert.equal(inserted.cargo_notes, "Keep dry");
});
