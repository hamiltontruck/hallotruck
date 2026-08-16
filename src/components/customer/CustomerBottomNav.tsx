import { NavLink } from "react-router-dom";
import { useLanguage, type HalloLanguage } from "../../i18n/LanguageProvider";

const copy: Record<HalloLanguage, { profile: string; orders: string }> = {
  en: { profile: "Profile", orders: "Orders" },
  om: { profile: "Profaayilii", orders: "Ajajoota" },
  am: { profile: "መገለጫ", orders: "ትዕዛዞች" },
};

const links = [
  { to: "/customer", key: "profile" as const, icon: "◫", end: true },
  { to: "/customer/orders", key: "orders" as const, icon: "▤", end: false },
];

export function CustomerBottomNav() {
  const { language } = useLanguage();
  const labels = copy[language];

  return (
    <nav className="customer-bottom-nav" aria-label="Customer portal navigation">
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          className={({ isActive }) => `customer-bottom-nav__item${isActive ? " is-active" : ""}`}
        >
          <span className="customer-bottom-nav__icon" aria-hidden="true">{link.icon}</span>
          <span>{labels[link.key]}</span>
        </NavLink>
      ))}
    </nav>
  );
}
