import { Documents } from "./pages/Documents";
import { ActiveTrip } from "./pages/ActiveTrip";
import { PartnerDriverGate } from "./components/auth/PartnerDriverGate";
import { PartnerDriverLogin } from "./pages/PartnerDriverLogin";
import { PartnerDriverHome } from "./pages/PartnerDriverHome";
import { PartnerDrivers } from "./pages/PartnerDrivers";
import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { AdminGate } from "./components/auth/AdminGate";
import { PartnerGate } from "./components/auth/PartnerGate";
import { PasswordRecoveryGate } from "./components/auth/PasswordRecoveryGate";
import { LanguageProvider } from "./i18n/LanguageProvider";
import { PartnerOperationsHub } from "./pages/PartnerOperationsHub";
import { PartnerDispatch } from "./pages/PartnerDispatch";
import { PartnerLiveOperations } from "./pages/PartnerLiveOperations";
import { PartnerWallet } from "./pages/PartnerWallet";
import { PartnerOrders } from "./pages/PartnerOrders";
import { PartnerOrderNew } from "./pages/PartnerOrderNew";
import { PartnerOrderDetails } from "./pages/PartnerOrderDetails";
import { AdminPartnerControl } from "./pages/AdminPartnerControl";
import { AdminPartnerFinance } from "./pages/AdminPartnerFinance";
import { AdminPartnerDispatch } from "./pages/AdminPartnerDispatch";
import { AdminPartnerOrderReview } from "./pages/AdminPartnerOrderReview";
import { PartnerDriverJoin } from "./pages/PartnerDriverJoin";
import { AdminPartnerDrivers } from "./pages/AdminPartnerDrivers";
import { AdminDriverCompliance } from "./pages/AdminDriverCompliance";
import "./index.css";
import "./styles/partner-onboarding.css";
import "./styles/driver-mobile-flow.css";

function AdminPartnerWorkspace({ children }: { children: React.ReactNode }) {
  return <AdminGate>
    <nav aria-label="Admin Partner controls" className="flex flex-wrap gap-3 bg-asphalt p-4 text-sm text-white">
      <Link to="/admin/partners">Partners</Link>
      <Link to="/admin/partner-orders">Order review</Link>
      <Link to="/admin/partner-drivers">Partner drivers</Link>
      <Link to="/admin/partner-dispatch">Dispatch</Link>
      <Link to="/admin/partner-finance">Commission & settlements</Link>
    </nav>
    {children}
  </AdminGate>;
}

// The same production pages and authorization gates, with a Partner/Admin-only entry.
// Deploy separately; never replace the complete application with this artifact.
createRoot(document.getElementById("root")!).render(
  <React.StrictMode><LanguageProvider><PasswordRecoveryGate><HashRouter><Routes>
    <Route path="/partner/login" element={<PartnerGate><PartnerOperationsHub /></PartnerGate>} />
    <Route path="/partner/driver-join" element={<PartnerDriverJoin />} />
    <Route path="/partner/drivers" element={<PartnerGate><PartnerDrivers /></PartnerGate>} />
    <Route path="/partner/driver/login" element={<PartnerDriverLogin />} />
    <Route path="/partner/driver" element={<PartnerDriverGate><PartnerDriverHome /></PartnerDriverGate>} />
    <Route path="/partner/driver/documents" element={<PartnerDriverGate><Documents /></PartnerDriverGate>} />
    <Route path="/partner/driver/trip" element={<PartnerDriverGate><ActiveTrip /></PartnerDriverGate>} />
    <Route path="/partner" element={<PartnerGate><PartnerOperationsHub /></PartnerGate>} />
    <Route path="/partner/jobs" element={<PartnerGate><PartnerDispatch /></PartnerGate>} />
    <Route path="/partner/live" element={<PartnerGate><PartnerLiveOperations /></PartnerGate>} />
    <Route path="/partner/wallet" element={<PartnerGate><PartnerWallet /></PartnerGate>} />
    <Route path="/partner/orders" element={<PartnerGate><PartnerOrders /></PartnerGate>} />
    <Route path="/partner/orders/new" element={<PartnerGate><PartnerOrderNew /></PartnerGate>} />
    <Route path="/partner/orders/:orderId" element={<PartnerGate><PartnerOrderDetails /></PartnerGate>} />
    <Route path="/admin" element={<Navigate to="/admin/partners" replace />} />
    <Route path="/admin/partners" element={<AdminPartnerWorkspace><AdminPartnerControl /></AdminPartnerWorkspace>} />
    <Route path="/admin/partner-finance" element={<AdminPartnerWorkspace><AdminPartnerFinance /></AdminPartnerWorkspace>} />
    <Route path="/admin/partner-dispatch" element={<AdminPartnerWorkspace><AdminPartnerDispatch /></AdminPartnerWorkspace>} />
    <Route path="/admin/partner-orders" element={<AdminPartnerWorkspace><AdminPartnerOrderReview /></AdminPartnerWorkspace>} />
    <Route path="/admin/partner-drivers" element={<AdminPartnerWorkspace><AdminPartnerDrivers /></AdminPartnerWorkspace>} />
    <Route path="/admin/driver-compliance" element={<AdminPartnerWorkspace><AdminDriverCompliance /></AdminPartnerWorkspace>} />
    <Route path="/driver/*" element={<main className="p-6"><h1>HALLO Driver workspace</h1><a href="https://hamiltontruck.github.io/hallotruck/#/driver/login">Open HALLO Driver login</a></main>} />
    <Route path="*" element={<Navigate to="/partner" replace />} />
  </Routes></HashRouter></PasswordRecoveryGate></LanguageProvider></React.StrictMode>,
);
