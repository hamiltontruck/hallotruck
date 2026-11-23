/**
 * HALLO Customer V4 remote acceptance preflight.
 *
 * Validates QA target isolation without network requests or logging secrets.
 * Run only with explicitly approved QA environment variables:
 *   QA_PREVIEW_URL, QA_SUPABASE_URL, PROD_SUPABASE_URL,
 *   QA_EXPECTED_SUPABASE_REF, QA_SUPABASE_PUBLIC_KEY,
 *   QA_POSTHOG_PROJECT_TOKEN, PROD_POSTHOG_PROJECT_TOKEN,
 *   QA_SENTRY_ENABLED, QA_SENTRY_ENVIRONMENT, QA_SENTRY_DSN.
 *
 * This is a configuration gate, NOT an authenticated acceptance test.
 */
import { pathToFileURL } from "node:url";

const supabaseProjectPattern = /^[a-z0-9]{20}$/;
const sentryHostPattern = /^o\d+\.ingest\.(?:us|de)\.sentry\.io$|^o\d+\.ingest\.sentry\.io$/;

function endpoint(value) {
  try {
    const url = new URL(String(value ?? "").trim());
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    if (url.pathname !== "/" && url.pathname !== "") return null;
    return url;
  } catch {
    return null;
  }
}

function validSupabaseURL(value) {
  const url = endpoint(value);
  if (!url) return null;
  const match = url.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/);
  return match ? { origin: url.origin, ref: match[1] } : null;
}

function validSentryDSN(value) {
  try {
    const url = new URL(String(value ?? "").trim());
    return url.protocol === "https:" && sentryHostPattern.test(url.hostname) &&
      /^[a-f0-9]+$/i.test(url.username) && !url.password &&
      /^\/\d+\/?$/.test(url.pathname) && !url.search && !url.hash;
  } catch {
    return false;
  }
}

export function validateCustomerV4QAPreflight(env) {
  const errors = [];
  const add = (condition, code) => { if (!condition) errors.push(code); };

  const preview = endpoint(env.QA_PREVIEW_URL);
  add(Boolean(preview && /^deploy-preview-\d+--hallotruck\.netlify\.app$/.test(preview.hostname)),
    "QA_PREVIEW_HOST_NOT_APPROVED");

  const qa = validSupabaseURL(env.QA_SUPABASE_URL);
  const prod = validSupabaseURL(env.PROD_SUPABASE_URL);
  add(Boolean(qa), "QA_SUPABASE_URL_INVALID");
  add(Boolean(prod), "PROD_SUPABASE_URL_INVALID");
  add(Boolean(qa && prod && qa.ref !== prod.ref), "QA_SUPABASE_EQUALS_PRODUCTION");

  const expectedRef = String(env.QA_EXPECTED_SUPABASE_REF ?? "").trim();
  add(Boolean(supabaseProjectPattern.test(expectedRef) && qa?.ref === expectedRef),
    "QA_SUPABASE_REF_NOT_ATTESTED");
  const publicKey = String(env.QA_SUPABASE_PUBLIC_KEY ?? "").trim();
  add(publicKey.startsWith("sb_publishable_") || publicKey.startsWith("eyJ"),
    "QA_SUPABASE_PUBLIC_KEY_MISSING");

  const qaPostHogToken = String(env.QA_POSTHOG_PROJECT_TOKEN ?? "").trim();
  const prodPostHogToken = String(env.PROD_POSTHOG_PROJECT_TOKEN ?? "").trim();
  add(Boolean(qaPostHogToken && prodPostHogToken && qaPostHogToken !== prodPostHogToken),
    "QA_POSTHOG_NOT_ISOLATED");

  add(env.QA_SENTRY_ENABLED === "true", "QA_SENTRY_NOT_ENABLED");
  add(["qa", "staging"].includes(String(env.QA_SENTRY_ENVIRONMENT ?? "").toLowerCase()),
    "QA_SENTRY_ENVIRONMENT_INVALID");
  add(validSentryDSN(env.QA_SENTRY_DSN), "QA_SENTRY_DSN_INVALID");

  return { ok: errors.length === 0, errors };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outcome = validateCustomerV4QAPreflight(process.env);
  // Only safe diagnostic identifiers; no URL/ref, token, key, or DSN values.
  console.log(JSON.stringify({ status: outcome.ok ? "PASS" : "BLOCKED", reasons: outcome.errors }));
  if (!outcome.ok) process.exitCode = 1;
}
