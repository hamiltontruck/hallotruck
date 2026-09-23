import { useEffect, useState } from "react";
import { DriverActiveTripView } from "./driver/DriverActiveTripView";
import { DriverHomeView, type DriverWorkspaceDestination } from "./driver/DriverHomeView";
import { DriverJobsBoard } from "./driver/DriverJobsBoard";
import { DriverNotificationsView } from "./driver/DriverNotificationsView";
import { DriverOperationsChatLauncher } from "./driver/DriverOperationsChatLauncher";
import { DriverProfileView } from "./driver/DriverProfileView";
import { DriverWalletView } from "./driver/DriverWalletView";
import { supabase } from "./supabase";

type PrimaryTab = Exclude<DriverWorkspaceDestination, "alerts">;
type DriverLanguage = "om" | "en" | "am";
const DRIVER_LANGUAGE_KEY = "hallo-driver-language";
const navCopy: Record<DriverLanguage, Record<PrimaryTab,string>> = {
  en:{home:"Home",jobs:"Jobs",trip:"Trip",wallet:"Wallet",profile:"Profile"},
  om:{home:"Mana",jobs:"Hojii",trip:"Imala",wallet:"Wallet",profile:"Profile"},
  am:{home:"መነሻ",jobs:"ስራዎች",trip:"ጉዞ",wallet:"Wallet",profile:"Profile"}
};
const tabs: Array<{ id: PrimaryTab; icon: string }> = [
  { id: "home", icon: "⌂" },
  { id: "jobs", icon: "▣" },
  { id: "trip", icon: "⌖" },
  { id: "wallet", icon: "◈" },
  { id: "profile", icon: "●" },
];

export function DriverWorkspace({ userId }: { userId: string }) {
  const [tab, setTab] = useState<DriverWorkspaceDestination>("home");
  const [driverName, setDriverName] = useState("HALLO Driver");
  const [supportOpen, setSupportOpen] = useState(false);
  const [language, setLanguage] = useState<DriverLanguage>(() => {
    const saved = window.localStorage.getItem(DRIVER_LANGUAGE_KEY);
    return saved === "en" || saved === "am" || saved === "om" ? saved : "om";
  });
  useEffect(() => {
    window.localStorage.setItem(DRIVER_LANGUAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  let content;
  if (tab === "home") {
    content = <DriverHomeView
      userId={userId}
      onNavigate={setTab}
      onProfileName={setDriverName}
      onOpenSupport={() => setSupportOpen(true)}
      language={language}
    />;
  } else if (tab === "jobs") {
    content = <DriverJobsBoard userId={userId} fullName={driverName} onOpenTrip={() => setTab("trip")} language={language} />;
  } else if (tab === "trip") {
    content = <DriverActiveTripView userId={userId} fullName={driverName} onOpenWallet={() => setTab("wallet")} language={language} />;
  } else if (tab === "wallet") {
    content = <DriverWalletView userId={userId} language={language} />;
  } else if (tab === "alerts") {
    content = <DriverNotificationsView userId={userId} language={language} />;
  } else {
    content = <DriverProfileView userId={userId} fallbackName={driverName} language={language} />;
  }

  return <div className="driver-app mx-auto min-h-screen w-full max-w-[560px] bg-halo-canvas text-halo-navy shadow-[0_0_60px_rgba(16,33,61,.08)]" data-driver-v4-workspace>
    <header className="sticky top-0 z-40 flex min-h-16 items-center justify-between gap-2 border-b border-halo-line bg-white/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <button type="button" onClick={() => setTab("home")} className="min-w-0 text-left" aria-label="Open Driver Home">
        <strong className="block truncate text-sm">HALLO<span className="text-halo-gold">TRUCK</span></strong>
        <small className="block text-[8px] font-black tracking-[0.14em] text-halo-muted">DRIVER V4</small>
      </button>
      <div className="flex shrink-0 items-center gap-1.5">
        <select aria-label="Driver language" value={language} onChange={(event) => setLanguage(event.target.value as DriverLanguage)} className="h-10 rounded-xl border border-halo-line bg-white px-2 text-[10px] font-black text-halo-navy shadow-sm"><option value="en">EN</option><option value="om">OR</option><option value="am">አማ</option></select>
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
        <span className="max-w-full truncate">{navCopy[language][item.id]}</span>
      </button>)}
    </nav>
  </div>;
}
