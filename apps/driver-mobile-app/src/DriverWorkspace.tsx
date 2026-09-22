import { useState } from "react";
import { DriverActiveTripView } from "./driver/DriverActiveTripView";
import { DriverHomeView, type DriverWorkspaceDestination } from "./driver/DriverHomeView";
import { DriverJobsBoard } from "./driver/DriverJobsBoard";
import { DriverNotificationsView } from "./driver/DriverNotificationsView";
import { DriverOperationsChatLauncher } from "./driver/DriverOperationsChatLauncher";
import { DriverProfileView } from "./driver/DriverProfileView";
import { DriverWalletView } from "./driver/DriverWalletView";
import { supabase } from "./supabase";

type PrimaryTab = Exclude<DriverWorkspaceDestination, "alerts">;

const tabs: Array<{ id: PrimaryTab; icon: string; label: string }> = [
  { id: "home", icon: "⌂", label: "Home" },
  { id: "jobs", icon: "▣", label: "Jobs" },
  { id: "trip", icon: "⌖", label: "Trip" },
  { id: "wallet", icon: "◈", label: "Wallet" },
  { id: "profile", icon: "●", label: "Profile" },
];

export function DriverWorkspace({ userId }: { userId: string }) {
  const [tab, setTab] = useState<DriverWorkspaceDestination>("home");
  const [driverName, setDriverName] = useState("HALLO Driver");
  const [supportOpen, setSupportOpen] = useState(false);

  let content;
  if (tab === "home") {
    content = <DriverHomeView
      userId={userId}
      onNavigate={setTab}
      onProfileName={setDriverName}
      onOpenSupport={() => setSupportOpen(true)}
    />;
  } else if (tab === "jobs") {
    content = <DriverJobsBoard userId={userId} fullName={driverName} onOpenTrip={() => setTab("trip")} />;
  } else if (tab === "trip") {
    content = <DriverActiveTripView userId={userId} fullName={driverName} onOpenWallet={() => setTab("wallet")} />;
  } else if (tab === "wallet") {
    content = <DriverWalletView userId={userId} />;
  } else if (tab === "alerts") {
    content = <DriverNotificationsView userId={userId} />;
  } else {
    content = <DriverProfileView userId={userId} fallbackName={driverName} />;
  }

  return <div className="mx-auto min-h-screen w-full max-w-[560px] bg-halo-canvas text-halo-navy shadow-[0_0_60px_rgba(16,33,61,.08)]" data-driver-v4-workspace>
    <header className="sticky top-0 z-40 flex min-h-16 items-center justify-between gap-2 border-b border-halo-line bg-white/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <button type="button" onClick={() => setTab("home")} className="min-w-0 text-left" aria-label="Open Driver Home">
        <strong className="block truncate text-sm">HALLO<span className="text-halo-gold">TRUCK</span></strong>
        <small className="block text-[8px] font-black tracking-[0.14em] text-halo-muted">DRIVER V4</small>
      </button>
      <div className="flex shrink-0 items-center gap-1.5">
        <DriverOperationsChatLauncher userId={userId} open={supportOpen} onOpenChange={setSupportOpen} />
        <button
          type="button"
          onClick={() => setTab("alerts")}
          className={`grid h-10 w-10 place-items-center rounded-xl border text-sm ${tab === "alerts" ? "border-halo-blue bg-halo-soft text-halo-blue" : "border-halo-line bg-white text-halo-navy"}`}
          aria-label="Open Driver notifications"
          title="Notifications"
        >
          ◆
        </button>
        <button
          type="button"
          onClick={() => void supabase.auth.signOut()}
          className="grid h-10 w-10 place-items-center rounded-xl border border-halo-line bg-white text-sm font-black text-halo-navy"
          aria-label="Sign out"
          title="Sign out"
        >
          ↪
        </button>
      </div>
    </header>

    {content}

    <nav className="sticky bottom-0 z-40 grid grid-cols-5 border-t border-halo-line bg-white/95 pb-[calc(6px+env(safe-area-inset-bottom))] pt-1 backdrop-blur-xl" aria-label="Driver primary navigation">
      {tabs.map((item) => <button
        key={item.id}
        type="button"
        onClick={() => setTab(item.id)}
        className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[9px] font-bold ${tab === item.id ? "text-halo-blue" : "text-halo-muted"}`}
        aria-current={tab === item.id ? "page" : undefined}
      >
        <b className="text-lg leading-none">{item.icon}</b>
        <span className="max-w-full truncate">{item.label}</span>
      </button>)}
    </nav>
  </div>;
}
