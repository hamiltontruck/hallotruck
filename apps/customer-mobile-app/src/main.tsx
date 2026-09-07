import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { CustomerAuthBoundary } from "./auth/CustomerAuthBoundaryV2";
import "./styles.css";
import "./auth-brand.css";
import "./auth-language-compact.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CustomerAuthBoundary>
      {(identity) => <App identity={identity} />}
    </CustomerAuthBoundary>
  </StrictMode>,
);
