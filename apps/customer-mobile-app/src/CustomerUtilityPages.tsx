import { useEffect, useState } from "react";
import { loadCustomerMobileData, type CustomerMobileProfile } from "./customer-data.service";
import { CustomerLanguageSwitcher, useCustomerLanguage } from "./customer-language";
import { getCustomerFinalCopy } from "./customer-final-copy";

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return <header className="customer-final-page-title"><button type="button" onClick={onBack} aria-label="Back">‹</button><h1>{title}</h1><span aria-hidden="true" /></header>;
}

function MenuRow({ icon, title, body, onClick }: { icon: string; title: string; body?: string; onClick?: () => void }) {
  const contents = <><span className="customer-final-menu-icon" aria-hidden="true">{icon}</span><span><strong>{title}</strong>{body && <small>{body}</small>}</span><b aria-hidden="true">›</b></>;
  return onClick
    ? <button type="button" className="customer-final-menu-row" onClick={onClick}>{contents}</button>
    : <div className="customer-final-menu-row is-static">{contents}</div>;
}

export function CustomerSavedLocationsPage({ userId, onBack, onProfile }: { userId: string; onBack: () => void; onProfile: () => void }) {
  const { language } = useCustomerLanguage();
  const c = getCustomerFinalCopy(language);
  const [profile, setProfile] = useState<CustomerMobileProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void loadCustomerMobileData(userId)
      .then((data) => { if (active) setProfile(data.profile); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId]);

  return <main className="customer-final-page">
    <Header title={c.savedTitle} onBack={onBack}/>
    {loading ? <div className="customer-final-state" role="status">{c.loading}</div> : (
      <section className="customer-final-menu-card">
        {profile?.home_address
          ? <MenuRow icon="⌂" title={c.homeAddress} body={profile.home_address} onClick={onProfile}/>
          : <div className="customer-final-state compact"><strong>{c.noHomeAddress}</strong><span>{c.editProfileToSave}</span><button type="button" onClick={onProfile}>{c.personalInformation}</button></div>}
      </section>
    )}
    <p className="customer-final-truth-note">{c.noFakeData}</p>
  </main>;
}

export function CustomerHelpPage({ onBack, onOrders }: { onBack: () => void; onOrders: () => void }) {
  const { language } = useCustomerLanguage();
  const c = getCustomerFinalCopy(language);
  return <main className="customer-final-page">
    <Header title={c.helpTitle} onBack={onBack}/>
    <section className="customer-final-menu-card">
      <MenuRow icon="?" title={c.faq} body={c.faqHelp}/>
      <MenuRow icon="◌" title={c.contactUs} body={c.contactHelp} onClick={onOrders}/>
      <MenuRow icon="△" title={c.reportIssue} body={c.reportHelp} onClick={onOrders}/>
      <MenuRow icon="◇" title={c.safetyTips} body={c.safetyHelp}/>
      <MenuRow icon="▤" title={c.termsPrivacy} body={c.termsHelp}/>
    </section>
  </main>;
}

export function CustomerSettingsPage({ onBack }: { onBack: () => void }) {
  const { language } = useCustomerLanguage();
  const c = getCustomerFinalCopy(language);
  return <main className="customer-final-page">
    <Header title={c.settingsTitle} onBack={onBack}/>
    <section className="customer-final-settings-language">
      <h2>{c.language}</h2>
      <CustomerLanguageSwitcher />
      <div className="customer-final-language-names">
        <span className={language === "en" ? "active" : ""}>{c.english}</span>
        <span className={language === "om" ? "active" : ""}>{c.oromo}</span>
        <span className={language === "am" ? "active" : ""}>{c.amharic}</span>
      </div>
    </section>
    <h2 className="customer-final-section-label">{c.appSettings}</h2>
    <section className="customer-final-menu-card">
      <MenuRow icon="●" title={c.notifications} body={c.notificationsHelp}/>
      <MenuRow icon="◐" title={c.appearance} body={c.appearanceHelp}/>
      <MenuRow icon="◉" title={c.privacy} body={c.privacyHelp}/>
      <MenuRow icon="i" title={c.about} body={c.aboutHelp}/>
    </section>
  </main>;
}
