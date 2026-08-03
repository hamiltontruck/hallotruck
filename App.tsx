import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Header } from "./components/layout/Header";
import { OfflineBanner } from "./components/layout/OfflineBanner";
import { JobBoard } from "./pages/JobBoard";
import { ActiveTrip } from "./pages/ActiveTrip";
import { Documents } from "./pages/Documents";
import { Earnings } from "./pages/Earnings";

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-bone">
        <OfflineBanner />
        <Header />
        <Routes>
          <Route path="/" element={<Navigate to="/jobs" replace />} />
          <Route path="/jobs" element={<JobBoard />} />
          <Route path="/trip" element={<ActiveTrip />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/earnings" element={<Earnings />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
