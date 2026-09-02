import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App";
import { initializeAnalytics } from "./services/analytics";
import "./index.css";
import "./styles/customer-quote-restoration.css";
import "./styles/customer-mobile-confirm-overlay.css";
import "./styles/admin-order-cleanup.css";
import "./styles/shared-portal-logo.css";

Sentry.init({
  dsn: "https://39d0747775820c372496eb775ff63b29@o4511917722894336.ingest.us.sentry.io/4511917875068928",
  enabled: import.meta.env.PROD,
  sendDefaultPii: false,
});

initializeAnalytics();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary
      fallback={() => (
        <main className="grid min-h-screen place-items-center bg-asphalt p-6 text-white">
          <section className="w-full max-w-lg border border-white/10 bg-white/5 p-7 text-center">
            <p className="font-mono text-[10px] tracking-[.2em] text-amber">HALLOTRUCK RECOVERY</p>
            <h1 className="mt-4 font-display text-2xl font-bold">This workspace could not be displayed.</h1>
            <p className="mt-3 text-sm leading-6 text-white/60">The error was recorded securely. Reload the latest version and try again.</p>
            <button type="button" onClick={() => window.location.reload()} className="mt-6 min-h-12 bg-amber px-5 py-3 text-sm font-semibold text-asphalt">Reload workspace</button>
          </section>
        </main>
      )}
    >
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
);
