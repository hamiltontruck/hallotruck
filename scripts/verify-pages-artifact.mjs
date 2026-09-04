import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, resolve, sep } from "node:path";

const pagesRoot = resolve(process.cwd(), "dist");
const mobileRoot = resolve(pagesRoot, "mobile");
const customerMobileRoot = resolve(pagesRoot, "customer-mobile");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function listFiles(directory) {
  const files = [];

  for (const entry of readdirSync(directory)) {
    const path = resolve(directory, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      files.push(...listFiles(path));
    } else {
      files.push(path);
    }
  }

  return files;
}

function getLocalAssetReferences(html) {
  const references = [];
  const pattern = /(?:src|href)=["']([^"']+)["']/g;

  for (const match of html.matchAll(pattern)) {
    const reference = match[1];

    if (
      reference.startsWith("http://") ||
      reference.startsWith("https://") ||
      reference.startsWith("data:") ||
      reference.startsWith("#")
    ) {
      continue;
    }

    references.push(reference.split(/[?#]/, 1)[0]);
  }

  return references;
}

function assertReferencesExist(
  indexPath,
  applicationRoot,
  { publishedBase = null, requireRelative = false } = {},
) {
  const html = readFileSync(indexPath, "utf8");
  const references = getLocalAssetReferences(html);

  assert(references.length > 0, `${indexPath} does not reference any local assets.`);

  for (const reference of references) {
    let assetPath;

    if (reference.startsWith("/")) {
      assert(
        !requireRelative,
        `${indexPath} contains an absolute asset path (${reference}); the mobile app must remain subpath-safe.`,
      );
      assert(
        publishedBase &&
          (reference === publishedBase || reference.startsWith(`${publishedBase}/`)),
        `${indexPath} contains an asset outside the approved published base ${publishedBase}: ${reference}`,
      );

      const relativeReference = reference
        .slice(publishedBase.length)
        .replace(/^\/+/, "");
      assetPath = resolve(applicationRoot, relativeReference);
    } else {
      assetPath = resolve(dirname(indexPath), reference);
    }

    const rootPrefix = `${applicationRoot}${sep}`;

    assert(
      assetPath === applicationRoot || assetPath.startsWith(rootPrefix),
      `${indexPath} references an asset outside its application root: ${reference}`,
    );
    assert(existsSync(assetPath), `${indexPath} references a missing asset: ${reference}`);
  }

  return html;
}

const rootIndex = resolve(pagesRoot, "index.html");
const mobileIndex = resolve(mobileRoot, "index.html");
const customerMobileIndex = resolve(customerMobileRoot, "index.html");

assert(existsSync(rootIndex), "Root Pages artifact is missing dist/index.html.");
assert(existsSync(mobileIndex), "Mobile Pages artifact is missing dist/mobile/index.html.");
assert(existsSync(customerMobileIndex), "Customer Mobile Pages artifact is missing dist/customer-mobile/index.html.");

assertReferencesExist(rootIndex, pagesRoot, {
  publishedBase: "/hallotruck",
});
const mobileHtml = assertReferencesExist(mobileIndex, mobileRoot, {
  requireRelative: true,
});
const customerMobileHtml = assertReferencesExist(customerMobileIndex, customerMobileRoot, {
  requireRelative: true,
});

assert(
  !mobileHtml.includes('src="/assets/') && !mobileHtml.includes('href="/assets/'),
  "Mobile index contains root-absolute /assets references and will fail under /hallotruck/mobile/.",
);
assert(
  !customerMobileHtml.includes('src="/assets/') && !customerMobileHtml.includes('href="/assets/'),
  "Customer Mobile index contains root-absolute /assets references and will fail under /hallotruck/customer-mobile/.",
);

const mobileJavaScript = listFiles(mobileRoot)
  .filter((path) => path.endsWith(".js"))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

assert(mobileJavaScript.length > 0, "Mobile Pages artifact contains no JavaScript bundle.");

const requiredProductionBoundaries = [
  "get_available_jobs",
  "claim_order_with_truck",
  "driver_finish_trip",
  "driver_financial_summary",
  "submit_driver_commission_payment",
  "driver-verification",
  "hallo-mobile-auth-v1",
];

for (const boundary of requiredProductionBoundaries) {
  assert(
    mobileJavaScript.includes(boundary),
    `Mobile Pages bundle is missing the production boundary ${boundary}.`,
  );
}

const customerMobileJavaScript = listFiles(customerMobileRoot)
  .filter((path) => path.endsWith(".js"))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

assert(customerMobileJavaScript.length > 0, "Customer Mobile Pages artifact contains no JavaScript bundle.");

const requiredCustomerBoundaries = [
  "hallo-customer-mobile-auth-v1",
  "customer_driver_assignment_cards",
  "customer_get_live_trip",
  "calculate_transport_quote_v2",
  "/quote-route",
];

for (const boundary of requiredCustomerBoundaries) {
  assert(
    customerMobileJavaScript.includes(boundary),
    `Customer Mobile Pages bundle is missing the production boundary ${boundary}.`,
  );
}

console.log(
  "Combined Pages artifact verified: root web, shared mobile app, and subpath-safe standalone Customer Mobile App.",
);
