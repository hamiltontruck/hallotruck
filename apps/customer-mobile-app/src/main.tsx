import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { CustomerAuthBoundary } from "./auth/CustomerAuthBoundary";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CustomerAuthBoundary>
      {(identity) => <App identity={identity} />}
    </CustomerAuthBoundary>
  </StrictMode>,
);
