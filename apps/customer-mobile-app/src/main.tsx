import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { CustomerAuthBoundary } from "./auth/CustomerAuthBoundaryV2";
import "./styles.css";
import "./auth-brand.css";
import "./auth-language-compact.css";
import "./auth-language-labels";
import "./customer-language-surface";
import "./customer-orders-language-surface";
import "./customer-booking-responsive.css";
import "./customer-profile-avatar.css";
import "./customer-v4-cancel.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CustomerAuthBoundary>
      {(identity) => <App identity={identity} />}
    </CustomerAuthBoundary>
  </StrictMode>,
);
