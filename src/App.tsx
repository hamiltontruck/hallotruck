import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Header } from "./components/layout/Header";
import { OfflineBanner } from "./components/layout/OfflineBanner";
import { CustomerAssignmentNotice } from "./components/customer/CustomerAssignmentNotice";
import { AdminSidebarLeadershipLinks } from "./components/admin/AdminSidebarLeadershipLinks";
import { AdminToolShell } from "./components/admin/AdminToolShell";
import { SmartLogistics } from "./pages/SmartLogistics";
import { AdminDriverCompliance } from "./pages/AdminDriverCompliance";
import { AdminDriverCommission } from "./pages/AdminDriverCommission";
import { JobBoard } from "./pages/JobBoard";
import { ActiveTrip } from "./pages/ActiveTrip";
import { Documents } from "./pages/Documents";
import { Earnings } from "./pages/Earnings";
import { DriverCommission } from "./pages/DriverCommission";
import { AdminGate } from "./components/auth/AdminGate";
import { CustomerGate } from "./components/auth/CustomerGate";
import { PortalLanding } from "./pages/PortalLanding";
import { CustomerLogin } from "./pages/CustomerLogin";
import { CustomerPortal } from "./pages/CustomerPortal";
import { DriverGate } from "./components/auth/DriverGate";
import { Login } from "./pages/Login";
import { LanguageProvider } from "./i18n/LanguageProvider";

function DriverShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bone">
      <OfflineBanner />
      <Header />
      {children}
    </div>
  );
}

function AdminWorkspace() {
  return (
    <>
      <SmartLogistics />
      <AdminSidebarLeadershipLinks />
    </>
  );
}

function CustomerWorkspace() {
  return (
    <>
      <CustomerAssignmentNotice />
      <CustomerPortal />
    </>
  );
}

export default function App() {
throw new Error("Sentry test error");

  return (
    <LanguageProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<PortalLanding />} />
          <Route path="/admin" element={<AdminGate><AdminWorkspace /></AdminGate>} />
          <Route path="/admin/driver-compliance" element={<AdminGate><AdminToolShell><AdminDriverCompliance /></AdminToolShell></AdminGate>} />
          <Route path="/admin/driver-commission" element={<AdminGate><AdminToolShell><AdminDriverCommission /></AdminToolShell></AdminGate>} />
          <Route path="/customer/login" element={<CustomerLogin />} />
          <Route path="/customer" element={<CustomerGate><CustomerWorkspace /></CustomerGate>} />
          <Route path="/driver/login" element={<Login />} />
          <Route path="/driver" element={<Navigate to="/driver/jobs" replace />} />
          <Route path="/driver/jobs" element={<DriverGate><DriverShell><JobBoard /></DriverShell></DriverGate>} />
          <Route path="/driver/trip" element={<DriverGate><DriverShell><ActiveTrip /></DriverShell></DriverGate>} />
          <Route path="/driver/documents" element={<DriverGate><DriverShell><Documents /></DriverShell></DriverGate>} />
          <Route path="/driver/earnings" element={<DriverGate><DriverShell><Earnings /></DriverShell></DriverGate>} />
          <Route path="/driver/commission" element={<DriverGate><DriverShell><DriverCommission /></DriverShell></DriverGate>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </LanguageProvider>
  );
}
