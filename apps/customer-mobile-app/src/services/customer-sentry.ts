import * as Sentry from "@sentry/react";
import { sanitizeCustomerSentryEvent } from "./customer-sentry-privacy";

// Explicit opt-in only for QA builds. A normal production deploy is always off.
// The DSN is a public ingestion address, never a Sentry personal API token.
function allowedQADsn(raw: string): boolean {
  try {
    const url = new URL(raw);
    const allowedHost = /^o[0-9]+\.ingest\.(?:us|de)\.sentry\.io$/.test(url.hostname) ||
      /^o[0-9]+\.ingest\.sentry\.io$/.test(url.hostname);
    return url.protocol === "https:" && allowedHost &&
      /^[a-f0-9]+$/i.test(url.username) && !url.password &&
      /^\/[0-9]+\/?$/.test(url.pathname) && !url.search && !url.hash;
  } catch {
    return false;
  }
}

// A QA env flag is not enough: never initialize on HALLO production hosts.
function isQAHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" ||
    /^deploy-preview-[0-9]+--[a-z0-9-]+\.netlify\.app$/.test(hostname);
}

export function initializeCustomerSentry(): boolean {
  const env = String(import.meta.env.VITE_CUSTOMER_SENTRY_ENVIRONMENT ?? "").toLowerCase();
  const dsn = String(import.meta.env.VITE_CUSTOMER_SENTRY_DSN ?? "").trim();
  const enabled = import.meta.env.PROD &&
    isQAHost(window.location.hostname) &&
    import.meta.env.VITE_CUSTOMER_SENTRY_ENABLED === "true" &&
    (env === "qa" || env === "staging") &&
    allowedQADsn(dsn);

  if (!enabled) return false;

  Sentry.init({
    dsn,
    environment: "customer-v4-" + env,
    enabled: true,
    sendDefaultPii: false,
    // Only unexpected global errors and the React ErrorBoundary below.
    // Disable automatic HTTP, breadcrumb, replay and tracing integrations.
    defaultIntegrations: false,
    integrations: [Sentry.globalHandlersIntegration({
      onerror: true,
      onunhandledrejection: true,
    })],
    beforeSend: sanitizeCustomerSentryEvent,
    beforeBreadcrumb: () => null,
    maxBreadcrumbs: 0,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
  return true;
}
