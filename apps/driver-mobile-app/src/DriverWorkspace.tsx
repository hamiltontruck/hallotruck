import { Component, useEffect, useState, type ReactNode } from "react";
import { DriverActiveTripView } from "./driver/DriverActiveTripView";
import { DriverHomeView, type DriverWorkspaceDestination } from "./driver/DriverHomeView";
import { DriverJobsBoard } from "./driver/DriverJobsBoard";
import { DriverNotificationsView } from "./driver/DriverNotificationsView";
import { DriverOperationsChatLauncher } from "./driver/DriverOperationsChatLauncher";
import { DriverProfileView } from "./driver/DriverProfileView";
import { DriverWalletView } from "./driver/DriverWalletView";
import {
  DRIVER_LANGUAGE_KEY,
  getDriverV4Copy,
  type DriverLanguage,
} from "./driver/driver-v4-i18n";
import { supabase } from "./supabase";

type PrimaryTab = Exclude<DriverWorkspaceDestination, "alerts">;

const DRIVER_TAB_KEY = "hallo-driver-v4-tab";
const DRIVER_TABS: DriverWorkspaceDestination[] = ["home", "jobs", "trip", "wallet", "profile", "alerts"];
function storedDriverTab(userId: string): DriverWorkspaceDestination {
  const saved = window.localStorage.getItem(`${DRIVER_TAB_KEY}:${userId}`);
  return DRIVER_TABS.includes(saved as DriverWorkspaceDestination) ? saved as DriverWorkspaceDestination : "home";
}

const tabs: Array<{ id: PrimaryTab; icon: string }> = [
  { id: "home", icon: "⌂" },
  { id: "jobs", icon: "▣" },
  { id: "trip", icon: "⌖" },
  { id: "wallet", icon: "◈" },
  { id: "profile", icon: "●" },
];

type DriverWorkspaceErrorBoundaryProps = {
  children: ReactNode;
  title: string;
  help: string;
  recoverLabel: string;
  onRecover: () => void;
};

type DriverWorkspaceErrorBoundaryState = {
  failed: boolean;
};

class DriverWorkspaceErrorBoundary extends Component<
  DriverWorkspaceErrorBoundaryProps,
  DriverWorkspaceErrorBoundaryState
> {
  state: DriverWorkspaceErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): DriverWorkspaceErrorBoundaryState {
    return { failed: true };
  }

  private recover = () => {
    this.setState({ failed: false });
    this.props.onRecover();
  };

  render() {
    if (!this.state.failed) return this.props.children;
    return <main
      className="grid min-h-[calc(100dvh-137px)] place-items-center bg-halo-canvas px-4 py-8"
      data-driver-v4-error-boundary
    >
      <section className="w-full max-w-sm rounded-[26px] border border-red-100 bg-white p-6 text-center shadow-halo-card">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-xl text-red-700">!</span>
        <h1 className="mt-4 text-lg font-black text-halo-navy">{this.props.title}</h1>
        <p className="mt-2 text-xs leading-5 text-halo-muted">{this.props.help}</p>
        <button
          type="button"
          onClick={this.recover}
          className="mt-5 min-h-12 w-full rounded-2xl bg-halo-blue px-4 text-sm font-black text-white"
        >
          {this.props.recoverLabel}
        </button>
      </section>
    </main>;
  }
}

export function DriverWorkspace({ userId }: { userId: string }) {
  const [tab, setTab] = useState<DriverWorkspaceDestination>(() => storedDriverTab(userId));
  const [driverName, setDriverName] = useState("HALLO Driver");
  const [supportOpen, setSupportOpen] = useState(false);
  const [language, setLanguage] = useState<DriverLanguage>(() => {
    const saved = window.localStorage.getItem(DRIVER_LANGUAGE_KEY);
    return saved === "en" || saved === "am" || saved === "om" ? saved : "om";
  });

  const t = getDriverV4Copy(language);

  useEffect(() => {
    window.localStorage.setItem(DRIVER_LANGUAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    window.localStorage.setItem(`${DRIVER_TAB_KEY}:${userId}`, tab);
  }, [tab, userId]);

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
    content = <DriverJobsBoard
      userId={userId}
      fullName={driverName}
      onOpenTrip={() => setTab("trip")}
      language={language}
    />;
  } else if (tab === "trip") {
    content = <DriverActiveTripView
      userId={userId}
      fullName={driverName}
      onOpenWallet={() => setTab("wallet")}
      language={language}
    />;
  } else if (tab === "wallet") {
    content = <DriverWalletView userId={userId} language={language} />;
  } else if (tab === "alerts") {
    content = <DriverNotificationsView userId={userId} language={language} />;
  } else {
    content = <DriverProfileView userId={userId} fallbackName={driverName} language={language} />;
  }

  return <div
    className="driver-app mx-auto min-h-screen w-full max-w-[560px] bg-halo-canvas text-halo-navy shadow-[0_0_60px_rgba(16,33,61,.08)]"
    data-driver-v4-workspace
  >
    <header className="sticky top-0 z-40 flex min-h-16 items-center justify-between gap-2 border-b border-halo-line bg-white/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <button type="button" onClick={() => setTab("home")} className="min-w-0 text-left" aria-label={t.shell.openHome}>
        <strong className="block truncate text-sm">HALLO<span className="text-halo-gold">TRUCK</span></strong>
        <small className="block text-[8px] font-black tracking-[0.14em] text-halo-muted">DRIVER V4</small>
      </button>
      <div className="flex shrink-0 items-center gap-1.5">
        <select
          aria-label={t.shell.language}
          value={language}
          onChange={(event) => setLanguage(event.target.value as DriverLanguage)}
          className="h-10 rounded-xl border border-halo-line bg-white px-2 text-[10px] font-black text-halo-navy shadow-sm"
        >
          <option value="en">EN</option>
          <option value="om">OR</option>
          <option value="am">አማ</option>
        </select>
        <DriverOperationsChatLauncher
          userId={userId}
          open={supportOpen}
          onOpenChange={setSupportOpen}
          language={language}
        />
        <button
          type="button"
          onClick={() => setTab("alerts")}
          className={`grid h-10 w-10 place-items-center rounded-xl border text-sm ${tab === "alerts" ? "border-halo-blue bg-halo-soft text-halo-blue" : "border-halo-line bg-white text-halo-navy"}`}
          aria-label={t.shell.openNotifications}
          title={t.shell.notifications}
        >
          ◆
        </button>
        <button
          type="button"
          onClick={() => void supabase.auth.signOut()}
          className="grid h-10 w-10 place-items-center rounded-xl border border-halo-line bg-white text-sm font-black text-halo-navy"
          aria-label={t.shell.signOut}
          title={t.shell.signOut}
        >
          ↪
        </button>
      </div>
    </header>

    <DriverWorkspaceErrorBoundary
      key={tab}
      title={t.shell.renderErrorTitle}
      help={t.shell.renderErrorHelp}
      recoverLabel={t.shell.recover}
      onRecover={() => setTab("home")}
    >
      {content}
    </DriverWorkspaceErrorBoundary>

    <nav
      className="sticky bottom-0 z-40 grid grid-cols-5 border-t border-halo-line bg-white/95 pb-[calc(6px+env(safe-area-inset-bottom))] pt-1 backdrop-blur-xl"
      aria-label={t.shell.nav.home + " / " + t.shell.nav.jobs + " / " + t.shell.nav.trip}
    >
      {tabs.map((item) => <button
        key={item.id}
        type="button"
        onClick={() => setTab(item.id)}
        className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[9px] font-bold ${tab === item.id ? "text-halo-blue" : "text-halo-muted"}`}
        aria-current={tab === item.id ? "page" : undefined}
      >
        <b className="text-lg leading-none">{item.icon}</b>
        <span className="max-w-full truncate">{t.shell.nav[item.id]}</span>
      </button>)}
    </nav>
  </div>;
}
