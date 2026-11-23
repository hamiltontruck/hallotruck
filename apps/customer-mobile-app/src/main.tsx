import { StrictMode } from "react";
import * as Sentry from "@sentry/react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { CustomerAuthBoundary } from "./auth/CustomerAuthBoundaryV2";
import { initializeAnalytics } from "./services/analytics";
import { initializeCustomerSentry } from "./services/customer-sentry";
import "./styles.css";
import "./auth-brand.css";
import "./auth-language-compact.css";
import "./auth-language-labels";
import "./customer-language-surface";
import "./customer-booking-responsive.css";
import "./customer-profile-avatar.css";
import "./customer-v4-cancel.css";
import "./customer-final-ui.css";
import "./auth/customer-entry.css";
import "./customer-android-responsive.css";

function syncAndroidViewport() {
  const viewport = window.visualViewport;
  const height = Math.round(viewport?.height ?? window.innerHeight);
  document.documentElement.style.setProperty("--customer-app-height", `${height}px`);
}

initializeCustomerSentry();
initializeAnalytics();
syncAndroidViewport();
window.addEventListener("resize", syncAndroidViewport, { passive: true });
window.addEventListener("orientationchange", syncAndroidViewport, { passive: true });
window.visualViewport?.addEventListener("resize", syncAndroidViewport, { passive: true });
window.visualViewport?.addEventListener("scroll", syncAndroidViewport, { passive: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<main role="alert">Customer V4 is temporarily unavailable. Please reload the page.</main>}>
      <CustomerAuthBoundary>
        {(identity) => <App identity={identity} />}
      </CustomerAuthBoundary>
    </Sentry.ErrorBoundary>
  </StrictMode>,
);
