import type { ErrorEvent as SentryErrorEvent } from "@sentry/react";

// Deliberately emit an allowlisted error envelope. Never forward the SDK's raw
// request URL, auth fragments, exception message, breadcrumbs, contexts, user,
// extra data, fingerprint or stack frame locals.
const ERROR_TYPES = new Set([
  "Error",
  "TypeError",
  "ReferenceError",
  "RangeError",
  "SyntaxError",
  "URIError",
  "EvalError",
  "AggregateError",
  "DOMException",
]);

function safeLocation(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) &&
    value > 0 && value <= 10000000 ? value : undefined;
}

export function sanitizeCustomerSentryEvent(event: SentryErrorEvent): SentryErrorEvent | null {
  const firstException = event.exception?.values?.[0];
  // Only unexpected exceptions are in scope; no raw messages or HTTP bodies.
  if (!firstException) return null;

  const type = typeof firstException.type === "string" && ERROR_TYPES.has(firstException.type)
    ? firstException.type : "ApplicationError";

  const frames = (firstException.stacktrace?.frames ?? []).slice(-12).map((frame) => ({
    filename: "customer-v4.bundle.js",
    lineno: safeLocation(frame.lineno),
    colno: safeLocation(frame.colno),
  })).filter((frame) => frame.lineno !== undefined || frame.colno !== undefined);

  const lastFrame = frames[frames.length - 1];
  const safeId = typeof event.event_id === "string" &&
    /^[a-f0-9]{32}$/i.test(event.event_id) ? event.event_id : undefined;

  return {
    event_id: safeId,
    type: "error",
    level: "error",
    platform: "javascript",
    exception: {
      values: [{
        type,
        value: "Customer V4 unexpected exception",
        ...(frames.length ? { stacktrace: { frames } } : {}),
      }],
    },
    tags: {
      application: "customer-v4",
      telemetry_policy: "qa-strict",
    },
    fingerprint: [
      "customer-v4",
      type,
      String(lastFrame?.lineno ?? "unknown"),
      String(lastFrame?.colno ?? "unknown"),
    ],
  };
}
