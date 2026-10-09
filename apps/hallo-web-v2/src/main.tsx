import React from "react";
import { createRoot } from "react-dom/client";
import { HALLOWebV2PremiumLogisticsLanding } from "./components/generated/HALLOWebV2PremiumLogisticsLanding";
import { HALLOAdminCEOExecutiveControlCenterV2 } from "./components/generated/HALLOAdminCEOExecutiveControlCenterV2";
import "./style.css";

const path = window.location.pathname.replace(/\/$/, "");
const isAdminDesign = path === "/admin-design";

function App() {
  return (
    <>
      <div className="v2-preview-banner" role="status">
        HALLO WEB V2 — DESIGN PREVIEW ONLY · NO LIVE SUPABASE OR GPS DATA
        <nav aria-label="V2 design preview navigation">
          <a href="/">Landing design</a>
          <a href="/admin-design">Admin/CEO design</a>
        </nav>
      </div>
      {isAdminDesign ? <HALLOAdminCEOExecutiveControlCenterV2 /> : <HALLOWebV2PremiumLogisticsLanding />}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
