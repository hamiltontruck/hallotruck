import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "../../services/supabase.client";
import { LanguageSwitcher, useLanguage } from "../../i18n/LanguageProvider";
import { DriverBottomNav } from "../driver/DriverBottomNav";

const primaryLinks = [
  { to: "/driver", key: "home" as const, end: true },
  { to: "/driver/jobs", key: "jobs" as const, end: true },
  { to: "/driver/trip", key: "trip" as const, end: true },
  { to: "/driver/wallet", key: "wallet" as const, end: true },
  { to: "/driver/documents", key: "profile" as const, end: true },
] as const;

const primaryCopy = {
  en: { home: "Home", jobs: "Jobs", trip: "Trip", wallet: "Wallet", profile: "Profile" },
  om: { home: "Home", jobs: "Hojii", trip: "Imala", wallet: "Wallet", profile: "Profaayilii" },
  am: { home: "መነሻ", jobs: "ስራዎች", trip: "ጉዞ", wallet: "ዋሌት", profile: "መገለጫ" },
} as const;

export function Header() {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const labels = primaryCopy[language];
  const [menuOpen, setMenuOpen] = useState(false);
  const [driverName, setDriverName] = useState("Driver");
  const [driverStatus, setDriverStatus] = useState<string | null>(null);

  const approved = driverStatus === "approved";
  const pendingCopy = language === "om"
    ? {
        workspace: "GALMEESSA DRIVER",
        status: "Eeyyama eegaa",
        title: "Onboarding qofa",
        help: "Jobs, Trip, Wallet fi Profile Admin erga si mirkaneessee booda banamu.",
        continue: "Documents itti fufi",
      }
    : language === "am"
      ? {
          workspace: "የአሽከርካሪ ምዝገባ",
          status: "ማረጋገጫ በመጠበቅ ላይ",
          title: "ለምዝገባ ብቻ",
          help: "Jobs፣ Trip፣ Wallet እና Profile አስተዳዳሪው ካረጋገጠዎት በኋላ ይከፈታሉ።",
          continue: "ሰነዶችን ይቀጥሉ",
        }
      : {
          workspace: "DRIVER ONBOARDING",
          status: "Pending approval",
          title: "Onboarding only",
          help: "Jobs, Trip, Wallet and Profile unlock only after Admin approval.",
          continue: "Continue documents",
        };

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      const { data } = await supabase.auth.getUser();
      if (!active || !data.user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name,driver_status")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!active) return;
      setDriverName(profile?.full_name || data.user.email?.split("@")[0] || "Driver");
      setDriverStatus(profile?.driver_status ?? null);
    }

    void loadProfile();
    const interval = window.setInterval(() => void loadProfile(), 15_000);
    const { data: authListener } = supabase.auth.onAuthStateChange(() => void loadProfile());

    return () => {
      active = false;
      window.clearInterval(interval);
      authListener.subscription.unsubscribe();
    };
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    setMenuOpen(false);
    navigate("/driver/login", { replace: true });
  }

  function goHome() {
    navigate(approved ? "/driver" : "/driver/documents");
  }

  return <>
    <header className="sticky top-0 z-30 bg-asphalt text-white border-b border-white/10">
      <div className="max-w-5xl mx-auto h-20 px-4 sm:px-6 flex items-center justify-between">
        <button onClick={goHome} className="text-left">
          <div className="font-display font-bold text-xl tracking-tight">HALLO<span className="text-amber">TRUCK</span></div>
          <div className="font-mono text-[8px] tracking-[.25em] text-white/40 mt-1">
            {approved ? t("driver.workspace") : pendingCopy.workspace}
          </div>
        </button>
        {approved && (
          <nav className="hidden md:flex items-center gap-6" aria-label="Driver desktop navigation">
            {primaryLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) => `text-sm ${isActive ? "text-amber font-semibold" : "text-white/55 hover:text-white"}`}
              >
                {labels[link.key]}
              </NavLink>
            ))}
          </nav>
        )}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden lg:block"><LanguageSwitcher dark /></div>
          <div className="hidden sm:block text-right">
            <p className="text-xs font-semibold max-w-36 truncate">{driverName}</p>
            <p className={`text-[10px] mt-0.5 ${approved ? "text-emerald-400" : "text-amber"}`}>
              ● {approved ? t("common.online") : pendingCopy.status}
            </p>
          </div>
          <button onClick={() => setMenuOpen((value) => !value)} className="w-11 h-11 border border-white/15 grid place-items-center" aria-label="Open driver menu"><span className="text-xl">{menuOpen ? "×" : "☰"}</span></button>
        </div>
      </div>
      {menuOpen && (
        <div className="absolute right-4 top-[72px] w-72 max-w-[calc(100vw-2rem)] bg-white text-asphalt shadow-xl border border-asphalt/10 p-3">
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-xs text-steel">{t("driver.menu.signedIn")} <b className="text-asphalt">{driverName}</b></p>
              {!approved && <p className="mt-1 text-[10px] font-semibold text-amber-dim">{pendingCopy.status}</p>}
            </div>
            <LanguageSwitcher />
          </div>
          {approved ? primaryLinks.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end} onClick={() => setMenuOpen(false)} className="block px-3 py-3 text-sm hover:bg-[#f5f3ed]">{labels[link.key]}</NavLink>
          )) : (
            <div className="mx-2 my-2 border border-amber/35 bg-amber/10 p-3">
              <p className="text-sm font-semibold">{pendingCopy.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-steel">{pendingCopy.help}</p>
              <button
                type="button"
                onClick={() => { setMenuOpen(false); navigate("/driver/documents"); }}
                className="mt-3 w-full bg-asphalt px-3 py-3 text-sm font-semibold text-white"
              >
                {pendingCopy.continue}
              </button>
            </div>
          )}
          <button onClick={logout} className="w-full text-left px-3 py-3 text-sm text-route border-t border-asphalt/10 mt-2">{t("common.signOut")}</button>
        </div>
      )}
      <div className="h-1 bg-route-dash" />
    </header>
    {approved && <DriverBottomNav />}
  </>;
}
