import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Header } from "./components/layout/Header";
import { OfflineBanner } from "./components/layout/OfflineBanner";
import { SmartLogistics } from "./pages/SmartLogistics";
import { JobBoard } from "./pages/JobBoard";
import { ActiveTrip } from "./pages/ActiveTrip";
import { Documents } from "./pages/Documents";
import { Earnings } from "./pages/Earnings";
import { AdminGate } from "./components/auth/AdminGate";
import { DriverGate } from "./components/auth/DriverGate";
import { Login } from "./pages/Login";

function DriverShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bone">
      <OfflineBanner />
      <Header />
      {children}
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<AdminGate><SmartLogistics /></AdminGate>} />
        <Route path="/driver/login" element={<Login />} />
        <Route path="/driver" element={<Navigate to="/driver/jobs" replace />} />
        <Route path="/driver/jobs" element={<DriverGate><DriverShell><JobBoard /></DriverShell></DriverGate>} />
        <Route path="/driver/trip" element={<DriverGate><DriverShell><ActiveTrip /></DriverShell></DriverGate>} />
        <Route path="/driver/documents" element={<DriverGate><DriverShell><Documents /></DriverShell></DriverGate>} />
        <Route path="/driver/earnings" element={<DriverGate><DriverShell><Earnings /></DriverShell></DriverGate>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
