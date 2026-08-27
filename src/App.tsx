import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Header } from "./components/layout/Header";
import { OfflineBanner } from "./components/layout/OfflineBanner";
import { CustomerBottomNav } from "./components/customer/CustomerBottomNav";
import { DriverPaymentCollectionBanner } from "./components/driver/DriverPaymentCollectionBanner";
import { DriverDocumentExpiryAlert } from "./components/driver/DriverDocumentExpiryAlert";
import { AdminSidebarLeadershipLinks } from "./components/admin/AdminSidebarLeadershipLinks";
import { AdminToolShell } from "./components/admin/AdminToolShell";
import { SmartLogistics } from "./pages/SmartLogistics";
import { AdminCeoOverview } from "./pages/AdminCeoOverview";
import { AdminDriverCompliance } from "./pages/AdminDriverCompliance";
import { AdminDriverFinanceSearch } from "./pages/AdminDriverFinanceSearch";
import { AdminDriverCommission } from "./pages/AdminDriverCommission";
import { AdminFleetMaintenance } from "./pages/AdminFleetMaintenance";
import { AdminQuotePricing } from "./pages/AdminQuotePricing";
import { AdminPaymentWorkspace } from "./pages/AdminPaymentWorkspace";
import { AdminFinanceDashboardV3 } from "./pages/AdminFinanceDashboardV3";
import { AdminIntelligence } from "./pages/AdminIntelligence";
import { AdminManualDriverDocuments } from "./pages/AdminManualDriverDocuments";
import { AdminPartnerControl } from "./pages/AdminPartnerControl";
import { AdminPartnerFinance } from "./pages/AdminPartnerFinance";
import { AdminMore } from "./pages/AdminMore";
import { PartnerPortal } from "./pages/PartnerPortal";
import { PartnerWallet } from "./pages/PartnerWallet";
import { JobBoard } from "./pages/JobBoard";
import { ActiveTrip } from "./pages/ActiveTrip";
import { Documents } from "./pages/Documents";
import { Earnings } from "./pages/Earnings";
import { DriverCommission } from "./pages/DriverCommission";
import { DriverPaymentCollection } from "./pages/DriverPaymentCollection";
import { AdminGate } from "./components/auth/AdminGate";
import { PartnerGate } from "./components/auth/PartnerGate";
import { PasswordRecoveryGate } from "./components/auth/PasswordRecoveryGate";
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
import "./styles/partner-onboarding.css";
import "./styles/role-navigation.css";

function DriverShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const showOperationalAlerts = pathname === "/driver" || pathname === "/driver/jobs" || pathname === "/driver/trip";
  return <div className="driver-mobile-flow min-h-screen bg-bone pb-24 md:pb-0"><OfflineBanner /><Header />{showOperationalAlerts && <DriverPaymentCollectionBanner />}{showOperationalAlerts && <DriverDocumentExpiryAlert />}{children}</div>;
}
function AdminWorkspace(){return <AdminToolShell><AdminCeoOverview /></AdminToolShell>}
function AdminOperationsWorkspace(){return <><SmartLogistics /><AdminSidebarLeadershipLinks /></>}
function CustomerWorkspace({ section }: { section: "home" | "profile" | "orders" | "track" | "payments" }) {
  if (section === "home") return <div className="customer-portal-mobile customer-view-home"><CustomerMapHome /></div>;
  const defaultFilter = section === "track" ? "active" : section === "payments" ? "payment" : "all";
  return <div className={`customer-portal-mobile customer-view-${section}`}><CustomerBottomNav /><CustomerPortal defaultFilter={defaultFilter} /></div>;
}
function RuntimeLocalization(){const {selectedLanguage}=useLanguage();const runtimeLanguage=selectedLanguage==="so"||selectedLanguage==="ti"?selectedLanguage:null;useRuntimePageTranslation(runtimeLanguage);useRuntimeAdminTranslation(runtimeLanguage);useRuntimeCustomerOperationalTranslation(selectedLanguage);return null;}

export default function App(){return <LanguageProvider><RuntimeLocalization /><PasswordRecoveryGate><HashRouter><Routes>
<Route path="/" element={<PortalLanding />} />
<Route path="/admin" element={<AdminGate><AdminWorkspace /></AdminGate>} />
<Route path="/admin/operations" element={<AdminGate><AdminOperationsWorkspace /></AdminGate>} />
<Route path="/admin/more" element={<AdminGate><AdminToolShell><AdminMore /></AdminToolShell></AdminGate>} />
<Route path="/admin/intelligence" element={<AdminGate><AdminToolShell><AdminIntelligence /></AdminToolShell></AdminGate>} />
<Route path="/admin/finance" element={<AdminGate><AdminToolShell><AdminFinanceDashboardV3 /></AdminToolShell></AdminGate>} />
<Route path="/admin/partner-finance" element={<AdminGate><AdminToolShell><AdminPartnerFinance /></AdminToolShell></AdminGate>} />
<Route path="/admin/driver-compliance" element={<AdminGate><AdminToolShell><AdminDriverCompliance /></AdminToolShell></AdminGate>} />
<Route path="/admin/driver-finance-search" element={<AdminGate><AdminToolShell><AdminDriverFinanceSearch /></AdminToolShell></AdminGate>} />
<Route path="/admin/driver-commission" element={<AdminGate><AdminToolShell><AdminDriverCommission /></AdminToolShell></AdminGate>} />
<Route path="/admin/fleet-maintenance" element={<AdminGate><AdminToolShell><div className="fleet-maintenance-mobile"><AdminFleetMaintenance /></div></AdminToolShell></AdminGate>} />
<Route path="/admin/quote-pricing" element={<AdminGate><AdminToolShell><AdminQuotePricing /></AdminToolShell></AdminGate>} />
<Route path="/admin/payment-review" element={<AdminGate><AdminToolShell><AdminPaymentWorkspace /></AdminToolShell></AdminGate>} />
<Route path="/admin/manual-driver-documents" element={<AdminGate><AdminToolShell><AdminManualDriverDocuments /></AdminToolShell></AdminGate>} />
<Route path="/admin/partners" element={<AdminGate><AdminToolShell><AdminPartnerControl /></AdminToolShell></AdminGate>} />
<Route path="/partner/login" element={<PartnerGate><PartnerPortal /></PartnerGate>} />
<Route path="/partner" element={<PartnerGate><PartnerPortal /></PartnerGate>} />
<Route path="/partner/wallet" element={<PartnerGate><PartnerWallet /></PartnerGate>} />
<Route path="/customer/login" element={<CustomerLogin />} />
<Route path="/customer" element={<CustomerGate><CustomerWorkspace section="home" /></CustomerGate>} />
<Route path="/customer/orders" element={<CustomerGate><CustomerWorkspace section="orders" /></CustomerGate>} />
<Route path="/customer/track" element={<CustomerGate><CustomerWorkspace section="track" /></CustomerGate>} />
<Route path="/customer/payments" element={<CustomerGate><CustomerWorkspace section="payments" /></CustomerGate>} />
<Route path="/customer/profile" element={<CustomerGate><CustomerWorkspace section="profile" /></CustomerGate>} />
<Route path="/customer/tracking/:orderId" element={<CustomerGate><CustomerTrackingPage /></CustomerGate>} />
<Route path="/driver/login" element={<Login />} />
<Route path="/driver" element={<DriverGate><DriverShell><JobBoard /></DriverShell></DriverGate>} />
<Route path="/driver/jobs" element={<DriverGate><DriverShell><JobBoard /></DriverShell></DriverGate>} />
<Route path="/driver/trip" element={<DriverGate><DriverShell><ActiveTrip /></DriverShell></DriverGate>} />
<Route path="/driver/documents" element={<DriverGate><DriverShell><Documents /></DriverShell></DriverGate>} />
<Route path="/driver/earnings" element={<DriverGate><DriverShell><Earnings /></DriverShell></DriverGate>} />
<Route path="/driver/commission" element={<DriverGate><DriverShell><DriverCommission /></DriverShell></DriverGate>} />
<Route path="/driver/payment/:orderId" element={<DriverGate><DriverShell><DriverPaymentCollection /></DriverShell></DriverGate>} />
<Route path="*" element={<Navigate to="/" replace />} />
</Routes></HashRouter></PasswordRecoveryGate></LanguageProvider>}
