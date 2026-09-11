import { HashRouter, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
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
import {
  AdminPaymentReferenceConflictBanner,
  AdminPaymentReferenceConflicts,
} from "./pages/AdminPaymentReferenceConflicts";
import { AdminFinanceDashboardV3 } from "./pages/AdminFinanceDashboardV3";
import { AdminIntelligence } from "./pages/AdminIntelligence";
import { AdminAiAssistant } from "./pages/AdminAiAssistant";
import { AdminManualDriverDocuments } from "./pages/AdminManualDriverDocuments";
import { AdminPartnerControl } from "./pages/AdminPartnerControl";
import { AdminPartnerFinance } from "./pages/AdminPartnerFinance";
import { AdminPartnerDispatch } from "./pages/AdminPartnerDispatch";
import { AdminPartnerOrderReview } from "./pages/AdminPartnerOrderReview";
import { AdminMore } from "./pages/AdminMore";
import { PartnerDispatch } from "./pages/PartnerDispatch";
import { PartnerOperationsHub } from "./pages/PartnerOperationsHub";
import { PartnerWallet } from "./pages/PartnerWallet";
import { PartnerOrders } from "./pages/PartnerOrders";
import { PartnerOrderNew } from "./pages/PartnerOrderNew";
import { PartnerOrderDetails } from "./pages/PartnerOrderDetails";
import { JobBoard } from "./pages/JobBoard";
import { ActiveTrip } from "./pages/ActiveTrip";
import { Documents } from "./pages/Documents";
import { Earnings } from "./pages/Earnings";
import { DriverWallet } from "./pages/DriverWallet";
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
import { CustomerLiveOrders } from "./pages/CustomerLiveOrders";
import { CustomerProfilePage } from "./pages/CustomerProfilePage";
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
import "./styles/customer-live-orders.css";
import "./styles/customer-live-map-smart.css";
import "./styles/driver-mobile-flow.css";
import "./styles/partner-onboarding.css";
import "./styles/role-navigation.css";

const customerWorkspaceCopy = {
  en: {
    orders: { eyebrow: "ORDER CONTROL", title: "Your transport orders", description: "Review every quote and order, follow assignment progress, open invoices, and manage eligible cancellations.", action: "Plan new transport" },
    payments: { eyebrow: "PAYMENT CONTROL", title: "Payments and verification", description: "Focus on amounts still due or waiting for verification, with invoice and payment evidence available per order.", action: "View all orders" },
  },
  om: {
    orders: { eyebrow: "TO'ANNOO AJAJAA", title: "Ajajoota geejjibaa kee", description: "Quote fi ajaja hunda ilaali, assignment hordofi, invoice bani, cancellation hayyamame bulchi.", action: "Geejjiba haaraa karoorsi" },
    payments: { eyebrow: "TO'ANNOO KAFFALTII", title: "Kaffaltii fi mirkaneessa", description: "Maallaqa hafe ykn mirkaneessa eegaa jiru irratti xiyyeeffadhu; invoice fi ragaa kaffaltii ajaja tokkoon tokkoon ilaali.", action: "Ajajoota hunda ilaali" },
  },
  am: {
    orders: { eyebrow: "የትዕዛዝ መቆጣጠሪያ", title: "የመጓጓዣ ትዕዛዞችዎ", description: "ሁሉንም ዋጋና ትዕዛዝ ይመልከቱ፣ ምደባን ይከታተሉ፣ ደረሰኞችን ይክፈቱ እና የተፈቀዱ ስረዛዎችን ያስተዳድሩ።", action: "አዲስ መጓጓዣ ያቅዱ" },
    payments: { eyebrow: "የክፍያ መቆጣጠሪያ", title: "ክፍያዎች እና ማረጋገጫ", description: "ያልተከፈለ ወይም ማረጋገጫ የሚጠብቅ መጠን ላይ ያተኩሩ፤ ደረሰኝና የክፍያ ማስረጃ በየትዕዛዙ ይመልከቱ።", action: "ሁሉንም ትዕዛዞች ይመልከቱ" },
  },
} as const;

function DriverShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const showPaymentAction = !pathname.startsWith("/driver/payment/");
  const showOperationalAlerts = pathname === "/driver" || pathname === "/driver/jobs" || pathname === "/driver/trip";
  return <div className="driver-mobile-flow min-h-screen bg-bone pb-24 md:pb-0"><OfflineBanner /><Header />{showPaymentAction && <DriverPaymentCollectionBanner />}{showOperationalAlerts && <DriverDocumentExpiryAlert />}{children}</div>;
}
function AdminWorkspace(){return <AdminToolShell><AdminCeoOverview /></AdminToolShell>}
function AdminOperationsWorkspace(){return <><SmartLogistics /><AdminSidebarLeadershipLinks /></>}
function AdminPaymentReviewWorkspace(){return <><AdminPaymentReferenceConflictBanner /><AdminPaymentWorkspace /></>}
function CustomerSectionIntro({ section }: { section: "orders" | "payments" }) {
  const { language } = useLanguage();
  const text = customerWorkspaceCopy[language][section];
  return <section className="customer-section-intro order-2 w-full bg-bone px-4 pt-7 sm:px-6 sm:pt-10">
    <div className="mx-auto flex max-w-6xl min-w-0 flex-col gap-4 overflow-hidden bg-asphalt p-5 text-white sm:flex-row sm:items-end sm:justify-between sm:p-8">
      <div className="min-w-0"><p className="font-mono text-[10px] tracking-[.2em] text-amber">{text.eyebrow}</p><h1 className="mt-3 break-words font-display text-3xl font-bold sm:text-4xl">{text.title}</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">{text.description}</p></div>
      <Link to={section === "orders" ? "/customer" : "/customer/orders"} className="min-h-11 shrink-0 self-start border border-white/20 px-4 py-3 text-xs font-semibold sm:self-auto">{text.action}</Link>
    </div>
  </section>;
}
function CustomerWorkspace({ section }: { section: "home" | "profile" | "orders" | "track" | "payments" }) {
  if (section === "home") return <div className="customer-portal-mobile customer-view-home"><CustomerMapHome /></div>;
  if (section === "track") return <div className="customer-portal-mobile customer-view-track"><CustomerBottomNav /><CustomerLiveOrders /></div>;
  if (section === "profile") return <div className="customer-portal-mobile customer-view-profile"><CustomerProfilePage /></div>;
  const defaultFilter = section === "payments" ? "payment" : "all";
  return <div className={`customer-portal-mobile customer-view-${section}`}><CustomerBottomNav /><CustomerSectionIntro section={section} /><CustomerPortal defaultFilter={defaultFilter} /></div>;
}
function RuntimeLocalization(){const {selectedLanguage}=useLanguage();const runtimeLanguage=selectedLanguage==="so"||selectedLanguage==="ti"?selectedLanguage:null;useRuntimePageTranslation(runtimeLanguage);useRuntimeAdminTranslation(runtimeLanguage);useRuntimeCustomerOperationalTranslation(selectedLanguage);return null;}

export default function App(){return <LanguageProvider><RuntimeLocalization /><PasswordRecoveryGate><HashRouter><Routes>
<Route path="/" element={<PortalLanding />} />
<Route path="/admin" element={<AdminGate><AdminWorkspace /></AdminGate>} />
<Route path="/admin/operations" element={<AdminGate><AdminOperationsWorkspace /></AdminGate>} />
<Route path="/admin/more" element={<AdminGate><AdminToolShell><AdminMore /></AdminToolShell></AdminGate>} />
<Route path="/admin/intelligence" element={<AdminGate><AdminToolShell><AdminIntelligence /></AdminToolShell></AdminGate>} />
<Route path="/admin/ai-assistant" element={<AdminGate><AdminToolShell><AdminAiAssistant /></AdminToolShell></AdminGate>} />
<Route path="/admin/finance" element={<AdminGate><AdminToolShell><AdminFinanceDashboardV3 /></AdminToolShell></AdminGate>} />
<Route path="/admin/partner-finance" element={<AdminGate><AdminToolShell><AdminPartnerFinance /></AdminToolShell></AdminGate>} />
<Route path="/admin/partner-dispatch" element={<AdminGate><AdminToolShell><AdminPartnerDispatch /></AdminToolShell></AdminGate>} />
<Route path="/admin/partner-orders" element={<AdminGate><AdminToolShell><AdminPartnerOrderReview /></AdminToolShell></AdminGate>} />
<Route path="/admin/driver-compliance" element={<AdminGate><AdminToolShell><AdminDriverCompliance /></AdminToolShell></AdminGate>} />
<Route path="/admin/driver-finance-search" element={<AdminGate><AdminToolShell><AdminDriverFinanceSearch /></AdminToolShell></AdminGate>} />
<Route path="/admin/driver-commission" element={<AdminGate><AdminToolShell><AdminDriverCommission /></AdminToolShell></AdminGate>} />
<Route path="/admin/fleet-maintenance" element={<AdminGate><AdminToolShell><div className="fleet-maintenance-mobile"><AdminFleetMaintenance /></div></AdminToolShell></AdminGate>} />
<Route path="/admin/quote-pricing" element={<AdminGate><AdminToolShell><AdminQuotePricing /></AdminToolShell></AdminGate>} />
<Route path="/admin/payment-review" element={<AdminGate><AdminToolShell><AdminPaymentReviewWorkspace /></AdminToolShell></AdminGate>} />
<Route path="/admin/payment-review/reference-conflicts" element={<AdminGate><AdminToolShell><AdminPaymentReferenceConflicts /></AdminToolShell></AdminGate>} />
<Route path="/admin/manual-driver-documents" element={<AdminGate><AdminToolShell><AdminManualDriverDocuments /></AdminToolShell></AdminGate>} />
<Route path="/admin/partners" element={<AdminGate><AdminToolShell><AdminPartnerControl /></AdminToolShell></AdminGate>} />
<Route path="/partner/login" element={<PartnerGate><PartnerOperationsHub /></PartnerGate>} />
<Route path="/partner" element={<PartnerGate><PartnerOperationsHub /></PartnerGate>} />
<Route path="/partner/jobs" element={<PartnerGate><PartnerDispatch /></PartnerGate>} />
<Route path="/partner/wallet" element={<PartnerGate><PartnerWallet /></PartnerGate>} />
<Route path="/partner/orders" element={<PartnerGate><PartnerOrders /></PartnerGate>} />
<Route path="/partner/orders/new" element={<PartnerGate><PartnerOrderNew /></PartnerGate>} />
<Route path="/partner/orders/:orderId" element={<PartnerGate><PartnerOrderDetails /></PartnerGate>} />
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
<Route path="/driver/profile" element={<DriverGate><DriverShell><Documents /></DriverShell></DriverGate>} />
<Route path="/driver/documents" element={<DriverGate><Navigate to="/driver/profile" replace /></DriverGate>} />
<Route path="/driver/wallet" element={<DriverGate><DriverShell><DriverWallet /></DriverShell></DriverGate>} />
<Route path="/driver/earnings" element={<DriverGate><DriverShell><Earnings /></DriverShell></DriverGate>} />
<Route path="/driver/commission" element={<DriverGate><DriverShell><DriverCommission /></DriverShell></DriverGate>} />
<Route path="/driver/payment/:orderId" element={<DriverGate><DriverShell><DriverPaymentCollection /></DriverShell></DriverGate>} />
<Route path="*" element={<Navigate to="/" replace />} />
</Routes></HashRouter></PasswordRecoveryGate></LanguageProvider>}
