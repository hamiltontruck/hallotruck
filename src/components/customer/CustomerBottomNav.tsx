import { NavLink } from "react-router-dom";
import { useLanguage, type HalloLanguage } from "../../i18n/LanguageProvider";

const copy: Record<HalloLanguage, { dashboard: string; home: string; profile: string; orders: string }> = {
  en: { dashboard: "Customer dashboard", home: "Home", profile: "Profile", orders: "Orders" },
  om: { dashboard: "Daashboordii customer", home: "Home", profile: "Profaayilii", orders: "Ajajoota" },
  am: { dashboard: "የደንበኛ ዳሽቦርድ", home: "መነሻ", profile: "መገለጫ", orders: "ትዕዛዞች" },
};

const links = [
  { to: "/customer", key: "home" as const, icon: "⌂", end: true },
  { to: "/customer/orders", key: "orders" as const, icon: "▤", end: true },
  { to: "/customer/profile", key: "profile" as const, icon: "◫", end: true },
];

export function CustomerBottomNav() {
  const { language } = useLanguage();
  const labels = copy[language];

  return (
    <nav className="customer-dashboard-nav" aria-label="Customer portal navigation">
      <div className="customer-dashboard-nav__inner">
        <div className="customer-dashboard-nav__title">
          <span className="customer-dashboard-nav__eyebrow">HALLOTRUCK</span>
          <strong>{labels.dashboard}</strong>
        </div>
        <div className="customer-dashboard-nav__tabs">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => `customer-dashboard-nav__item${isActive ? " is-active" : ""}`}
            >
              <span className="customer-dashboard-nav__icon" aria-hidden="true">{link.icon}</span>
              <span>{labels[link.key]}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}
