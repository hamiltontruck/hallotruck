import { NavLink } from "react-router-dom";
import { useLanguage } from "../../i18n/LanguageProvider";
import { useDriverWorkspace } from "./DriverWorkspaceContext";

const copy = {
  en: { home: "Home", jobs: "Jobs", trip: "Trip", wallet: "Wallet", profile: "Profile" },
  om: { home: "Home", jobs: "Hojii", trip: "Imala", wallet: "Wallet", profile: "Profaayilii" },
  am: { home: "መነሻ", jobs: "ስራዎች", trip: "ጉዞ", wallet: "ዋሌት", profile: "መገለጫ" },
} as const;

const links = [
  { to: "/driver", key: "home" as const, icon: "⌂", end: true },
  { to: "/driver/jobs", key: "jobs" as const, icon: "▦", end: true },
  { to: "/driver/trip", key: "trip" as const, icon: "⌁", end: true },
  { to: "/driver/wallet", key: "wallet" as const, icon: "◫", end: true },
  { to: "/driver/profile", key: "profile" as const, icon: "◎", end: true },
] as const;

export function DriverBottomNav() {
  const workspace = useDriverWorkspace();
  const partnerLinks = [
    { to: "/partner/driver", key: "home" as const, icon: "⌂", end: true },
    ...(workspace?.driver_status === "approved" ? [{ to: "/partner/driver/trip", key: "trip" as const, icon: "⌁", end: true }] : []),
    { to: "/partner/driver/documents", key: "profile" as const, icon: "◎", end: true },
  ];
  const { language } = useLanguage();
  const labels = copy[language];

  return (
    <nav className="driver-bottom-nav md:hidden" aria-label="Driver primary navigation">
      {(workspace?.kind === "partner" ? partnerLinks : links).map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          className={({ isActive }) => `driver-bottom-nav__item${isActive ? " is-active" : ""}`}
        >
          <span className="driver-bottom-nav__icon" aria-hidden="true">{link.icon}</span>
          <span>{labels[link.key]}</span>
        </NavLink>
      ))}
    </nav>
  );
}
