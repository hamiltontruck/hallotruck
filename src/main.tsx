import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App";
import "./index.css";

Sentry.init({
  dsn: "https://39d0747775820c372496eb775ff63b29@o4511917722894336.ingest.us.sentry.io/4511917875068928",
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
