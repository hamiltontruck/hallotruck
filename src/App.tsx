import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Header } from "./components/layout/Header";
import { OfflineBanner } from "./components/layout/OfflineBanner";
import { CustomerBottomNav } from "./components/customer/CustomerBottomNav";
import { DriverPaymentCollectionBanner } from "./components/driver/DriverPaymentCollectionBanner";
import { DriverDocumentExpiryAlert } from "./components/driver/DriverDocumentExpiryAlert";
import { AdminSidebarLeadershipLinks } from "./components/admin/AdminSidebarLeadershipLinks";
import { AdminToolShell } from "./components/admin/AdminToolShell";
import { SmartLogistics } from "./pages/SmartLogistics";
import { AdminDriverCompliance } from "./pages/AdminDriverCompliance";
import { AdminDriverCommission } from "./pages/AdminDriverCommission";
import { AdminFleetMaintenance } from "./pages/AdminFleetMaintenance";
import { AdminQuotePricing } from "./pages/AdminQuotePricing";
import { AdminPaymentReview } from "./pages/AdminPaymentReview";
import { AdminManualDriverDocuments } from "./pages/AdminManualDriverDocuments";
import { JobBoard } from "./pages/JobBoard";
import { ActiveTrip } from "./pages/ActiveTrip";
import { Documents } from "./pages/Documents";
import { Earnings } from "./pages/Earnings";
import { DriverCommission } from "./pages/DriverCommission";
import { DriverPaymentCollection } from "./pages/DriverPaymentCollection";
import { AdminGate } from "./components/auth/AdminGate";
import { CustomerGate } from "./components/auth/CustomerGate";
import { PortalLanding } from "./pages/PortalLanding";
import { CustomerLogin } from "./pages/CustomerLogin";
import { CustomerPortal } from "./pages/CustomerPortal";
import { CustomerMapHome } from "./pages/CustomerMapHome";
import { CustomerTrackingPage } from "./pages/CustomerTrackingPage";
import { DriverGate } from "./components/auth/DriverGate";
import { Login } from "./pages/Login";
import { LanguageProvider, useLanguage } from "./i18n/LanguageProvider";
import { useRuntimePageTranslation } from "./i18n/runtimePageTranslations";
import { useRuntimeAdminTranslation } from "./i18n/runtimeAdminTranslations";
import { useRuntimeCustomerOperationalTranslation } from "./i18n/runtimeCustomerOperationalTranslations";
import "./styles/fleet-maintenance-mobile.css";
import "./styles/customer-portal-mobile.css";
import "./styles/customer-portal-sections.css";
import "./styles/customer-header-map-polish.css";
import "./styles/customer-map-home.css";
import "./styles/customer-nearby-tracking.css";
import "./styles/customer-nearby-home-bridge.css";
import "./styles/driver-mobile-flow.css";

function DriverShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="driver-mobile-flow min-h-screen bg-bone">
      <OfflineBanner />
      <Header />
      <DriverPaymentCollectionBanner />
      <DriverDocumentExpiryAlert />
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

function CustomerWorkspace({ section }: { section: "home" | "profile" | "orders" }) {
  if (section === "home") {
    return <div className="customer-portal-mobile customer-view-home"><CustomerMapHome /></div>;
  }

  return (
    <div className={`customer-portal-mobile customer-view-${section}`}>
      <CustomerBottomNav />
      <CustomerPortal />
    </div>
  );
}

function RuntimeLocalization() {
  const { selectedLanguage } = useLanguage();
  const runtimeLanguage = selectedLanguage === "so" || selectedLanguage === "ti"
    ? selectedLanguage
    : null;
  useRuntimePageTranslation(runtimeLanguage);
  useRuntimeAdminTranslation(runtimeLanguage);
  useRuntimeCustomerOperationalTranslation(selectedLanguage);
  return null;
}

export default function App() {
  return (
    <LanguageProvider>
      <RuntimeLocalization />
      <HashRouter>
        <Routes>
          <Route path="/" element={<PortalLanding />} />
          <Route path="/admin" element={<AdminGate><AdminWorkspace /></AdminGate>} />
          <Route path="/admin/driver-compliance" element={<AdminGate><AdminToolShell><AdminDriverCompliance /></AdminToolShell></AdminGate>} />
          <Route path="/admin/driver-commission" element={<AdminGate><AdminToolShell><AdminDriverCommission /></AdminToolShell></AdminGate>} />
          <Route path="/admin/fleet-maintenance" element={<AdminGate><AdminToolShell><div className="fleet-maintenance-mobile"><AdminFleetMaintenance /></div></AdminToolShell></AdminGate>} />
          <Route path="/admin/quote-pricing" element={<AdminGate><AdminToolShell><AdminQuotePricing /></AdminToolShell></AdminGate>} />
          <Route path="/admin/payment-review" element={<AdminGate><AdminToolShell><AdminPaymentReview /></AdminToolShell></AdminGate>} />
          <Route path="/admin/manual-driver-documents" element={<AdminGate><AdminToolShell><AdminManualDriverDocuments /></AdminToolShell></AdminGate>} />
          <Route path="/customer/login" element={<CustomerLogin />} />
          <Route path="/customer" element={<CustomerGate><CustomerWorkspace section="home" /></CustomerGate>} />
          <Route path="/customer/orders" element={<CustomerGate><CustomerWorkspace section="orders" /></CustomerGate>} />
          <Route path="/customer/profile" element={<CustomerGate><CustomerWorkspace section="profile" /></CustomerGate>} />
          <Route path="/customer/tracking/:orderId" element={<CustomerGate><CustomerTrackingPage /></CustomerGate>} />
          <Route path="/driver/login" element={<Login />} />
          <Route path="/driver" element={<Navigate to="/driver/jobs" replace />} />
          <Route path="/driver/jobs" element={<DriverGate><DriverShell><JobBoard /></DriverShell></DriverGate>} />
          <Route path="/driver/trip" element={<DriverGate><DriverShell><ActiveTrip /></DriverShell></DriverGate>} />
          <Route path="/driver/documents" element={<DriverGate><DriverShell><Documents /></DriverShell></DriverGate>} />
          <Route path="/driver/earnings" element={<DriverGate><DriverShell><Earnings /></DriverShell></DriverGate>} />
          <Route path="/driver/commission" element={<DriverGate><DriverShell><DriverCommission /></DriverShell></DriverGate>} />
          <Route path="/driver/payment/:orderId" element={<DriverGate><DriverShell><DriverPaymentCollection /></DriverShell></DriverGate>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </LanguageProvider>
  );
}
