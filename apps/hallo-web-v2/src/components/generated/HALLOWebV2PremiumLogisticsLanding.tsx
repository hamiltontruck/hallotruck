import React, { useState } from 'react';
import './HALLOWebV2PremiumLogisticsLanding.css';
type Lang = 'EN' | 'OR' | 'AM';
type Role = 'Shippers' | 'Drivers' | 'Partners';
const words = {
  EN: {
    eyebrow: 'ETHIOPIA • SMART FREIGHT NETWORK',
    title: 'Logistics that moves',
    accent: 'business forward.',
    sub: 'Book freight, coordinate trusted drivers, and follow every delivery in one connected logistics experience.',
    cta: 'Explore our services',
    secondary: 'See how it works'
  },
  OR: {
    eyebrow: 'ITOOPHIYAA • GEEJJIBA AMMAYYAA',
    title: 'Geejjiba hojii kee',
    accent: 'gara fuulduraatti.',
    sub: 'Fe’umsa ajaji, konkolaachiftoota waliin hojjedhu, geejjiba kee iddoo tokko irraa hordofi.',
    cta: 'Tajaajila keenya ilaali',
    secondary: 'Akkaataa itti hojjetu'
  },
  AM: {
    eyebrow: 'ኢትዮጵያ • ዘመናዊ የጭነት አገልግሎት',
    title: 'ንግድዎን ወደ ፊት',
    accent: 'የሚያንቀሳቅስ ሎጂስቲክስ።',
    sub: 'ጭነት ይዘዙ፣ ከአሽከርካሪዎች ጋር ይስሩ እና ጉዞዎችን በአንድ ቦታ ይከታተሉ።',
    cta: 'አገልግሎቶችን ይመልከቱ',
    secondary: 'እንዴት እንደሚሰራ'
  }
};
const roles: Record<Role, {
  label: string;
  desc: string;
  points: string[];
  number: string;
}> = {
  Shippers: {
    label: 'Move freight with clarity.',
    desc: 'A straightforward journey from route planning to delivery confirmation.',
    points: ['Smart booking workflow', 'Transparent quote review', 'Order updates and live tracking'],
    number: '01'
  },
  Drivers: {
    label: 'Every job, in one place.',
    desc: 'Purpose-built tools for verified drivers on the road.',
    points: ['Job offers and trip workflow', 'Documents and approval status', 'GPS-based trip updates'],
    number: '02'
  },
  Partners: {
    label: 'Grow your fleet network.',
    desc: 'Coordinate trucks, orders, and operations from a single partner workspace.',
    points: ['Fleet and driver oversight', 'Smart order management', 'Trip and settlement visibility'],
    number: '03'
  }
};
function Icon({
  name,
  size = 20
}: {
  name: string;
  size?: number;
}) {
  const paths: Record<string, React.ReactNode> = {
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    truck: <><path d="M3 6h11v11H3zM14 10h4l3 4v3h-7z" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    shield: <><path d="m12 2 9 4v6c0 6-4 9-9 11-5-2-9-5-9-11V6z" /><path d="m8 12 3 3 5-6" /></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20V8" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c-5 5-5 13 0 18M12 3c5 5 5 13 0 18" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    close: <><path d="M5 5l14 14M19 5 5 19" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    route: <><circle cx="5" cy="5" r="2" /><circle cx="19" cy="19" r="2" /><path d="M7 5h6a5 5 0 0 1 0 10h-2a4 4 0 0 0 0 8h6" /></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
export const HALLOWebV2PremiumLogisticsLanding = () => {
  const [lang, setLang] = useState<Lang>('EN');
  const [menuOpen, setMenuOpen] = useState(false);
  const [role, setRole] = useState<Role>('Shippers');
  const t = words[lang];
  const scroll = (id: string) => {
    document.getElementById(id)?.scrollIntoView({
      behavior: 'smooth'
    });
    setMenuOpen(false);
  };
  return <div className="hallo-v2">
   <div className="hallo-topline"><div className="hallo-wrap"><span><span className="hallo-pulse" /> A connected freight experience for Ethiopia</span><span className="hallo-top-right">DESIGN CONCEPT <span className="hallo-sep">/</span> WEB V2</span></div></div>
   <header className="hallo-header"><div className="hallo-wrap hallo-header-inner">
    <button className="hallo-brand" onClick={() => scroll('top')} aria-label="HALLO home"><span className="hallo-mark"><span>H</span><i /></span><span className="hallo-brand-name"><b>HALLO<span>TRUCK</span></b><small>SMART LOGISTICS</small></span></button>
    <nav className={'hallo-nav ' + (menuOpen ? 'hallo-nav-open' : '')} aria-label="Main navigation">
     <button onClick={() => scroll('services')}>Solutions</button><button onClick={() => scroll('how')}>How it works</button><button onClick={() => scroll('network')}>Our network</button><button onClick={() => scroll('contact')}>Contact</button>
    </nav>
    <div className="hallo-actions"><label className="hallo-language"><Icon name="globe" size={17} /><select value={lang} onChange={e => setLang(e.target.value as Lang)} aria-label="Language"><option value="EN">EN</option><option value="OR">OR</option><option value="AM">አማ</option></select></label><button className="hallo-header-cta" onClick={() => scroll('services')}>Get started <Icon name="arrow" size={17} /></button><button className="hallo-menu" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><Icon name={menuOpen ? 'close' : 'menu'} size={23} /></button></div>
   </div></header>
   <main id="top">
    <section className="hallo-hero"><div className="hallo-wrap hallo-hero-grid">
     <div className="hallo-hero-copy"><div className="hallo-eyebrow"><span className="hallo-eyebrow-line" />{t.eyebrow}</div><h1>{t.title}<br /><em>{t.accent}</em></h1><p>{t.sub}</p><div className="hallo-hero-buttons"><button className="hallo-primary" onClick={() => scroll('services')}>{t.cta}<Icon name="arrow" size={20} /></button><button className="hallo-ghost" onClick={() => scroll('how')}><span className="hallo-play">▶</span>{t.secondary}</button></div><div className="hallo-hero-trust"><span className="hallo-trust-line" /><span>BUILT AROUND REAL-WORLD OPERATIONS</span></div></div>
     <div className="hallo-visual" aria-label="Illustrative logistics network map, not live tracking"><div className="hallo-map-grid" /><div className="hallo-map-caption"><span className="hallo-caption-dot" /> NETWORK OVERVIEW <span>ILLUSTRATIVE</span></div>
       <svg className="hallo-map-route" viewBox="0 0 620 490" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><path className="hallo-map-street" d="M0 125Q155 80 265 185T620 220M10 390Q190 315 335 350T620 285M100 0Q135 140 105 230T230 490M490 0Q450 140 495 230T470 490" /><path className="hallo-route-shadow" d="M125 345C165 310 165 230 265 238S385 195 475 115" /><path className="hallo-route" d="M125 345C165 310 165 230 265 238S385 195 475 115" /><circle cx="125" cy="345" r="10" fill="#f0ad48" stroke="#172d3b" strokeWidth="6" /><circle cx="475" cy="115" r="10" fill="#f0ad48" stroke="#172d3b" strokeWidth="6" /><circle cx="300" cy="231" r="22" fill="#e4a542" opacity=".14" /></svg>
       <div className="hallo-city hallo-city-a"><small>ORIGIN</small><strong>Adama</strong><span>ETHIOPIA</span></div><div className="hallo-city hallo-city-b"><small>DESTINATION</small><strong>Addis Ababa</strong><span>ETHIOPIA</span></div>
       <div className="hallo-truck-badge"><Icon name="truck" size={27} /></div>
       <div className="hallo-floating-card"><span className="hallo-floating-icon"><Icon name="route" size={21} /></span><div><small>SMART ROUTE PLANNING</small><b>Connected from pickup to delivery</b><span>Real routing belongs in the live app</span></div></div>
       <div className="hallo-visual-foot"><span>01 / PLAN</span><span>02 / DISPATCH</span><span>03 / TRACK</span></div>
     </div>
    </div><div className="hallo-wrap hallo-hero-bottom"><span>ONE PLATFORM. MULTIPLE POSSIBILITIES.</span><span className="hallo-scroll-indicator">EXPLORE BELOW <span>↓</span></span></div></section>
    <section className="hallo-features" id="services"><div className="hallo-wrap"><div className="hallo-section-heading"><div><div className="hallo-kicker">THE HALLO ECOSYSTEM</div><h2>Made for every move.<br /><span>Built for every role.</span></h2></div><p>One connected experience designed for the people who keep freight moving.</p></div><div className="hallo-role-tabs" role="tablist" aria-label="Choose logistics role">{(Object.keys(roles) as Role[]).map((r, i) => <button key={r} role="tab" aria-selected={role === r} className={role === r ? 'selected' : ''} onClick={() => setRole(r)}><span>0{i + 1}</span>{r}<Icon name="arrow" size={18} /></button>)}</div><div className="hallo-role-panel" role="tabpanel"><div className="hallo-role-art"><div className="hallo-role-art-ring" /><span className="hallo-role-art-index">{roles[role].number}</span><span className="hallo-role-art-symbol"><Icon name={role === 'Shippers' ? 'truck' : role === 'Drivers' ? 'pin' : 'chart'} size={65} /></span><div className="hallo-role-art-caption">HALLO / {role.toUpperCase()}</div></div><div className="hallo-role-detail"><span className="hallo-kicker">TAILORED EXPERIENCE — {role.toUpperCase()}</span><h3>{roles[role].label}</h3><p>{roles[role].desc}</p><ul>{roles[role].points.map(x => <li key={x}><span><Icon name="check" size={15} /></span>{x}</li>)}</ul><button className="hallo-link" onClick={() => scroll('contact')}>Discover the possibilities <Icon name="arrow" size={19} /></button></div></div></div></section>
    <section className="hallo-process" id="how"><div className="hallo-wrap"><div className="hallo-kicker">HOW IT COMES TOGETHER</div><div className="hallo-process-head"><h2>From first mile<br />to final delivery.</h2><p>A clear operational journey, designed to reduce complexity at every step.</p></div><div className="hallo-steps">{[{
              n: '01',
              t: 'Plan your shipment',
              d: 'Enter the route and cargo details to start a transport request.',
              icon: 'route'
            }, {
              n: '02',
              t: 'Connect the right truck',
              d: 'Match cargo requirements with eligible fleet capacity.',
              icon: 'truck'
            }, {
              n: '03',
              t: 'Stay in the loop',
              d: 'Follow trip progress with authenticated GPS updates.',
              icon: 'pin'
            }, {
              n: '04',
              t: 'Close with confidence',
              d: 'Complete delivery and review the supporting records.',
              icon: 'shield'
            }].map(s => <div className="hallo-step" key={s.n}><span className="hallo-step-num">{s.n}</span><div className="hallo-step-icon"><Icon name={s.icon} size={30} /></div><h3>{s.t}</h3><p>{s.d}</p></div>)}</div></div></section>
    <section className="hallo-network" id="network"><div className="hallo-wrap hallo-network-inner"><div><span className="hallo-kicker">A BETTER CONNECTED NETWORK</span><h2>Technology with<br /><em>the road in mind.</em></h2><p>Purpose-built workflows for freight bookings, driver operations, fleet coordination and delivery visibility.</p><button className="hallo-primary hallo-primary-light" onClick={() => scroll('contact')}>Explore HALLO <Icon name="arrow" size={19} /></button></div><div className="hallo-network-cards"><div><Icon name="route" size={27} /><b>Smart planning</b><span>Route and cargo workflows</span></div><div><Icon name="shield" size={27} /><b>Trusted operations</b><span>Role-based access and review</span></div><div><Icon name="pin" size={27} /><b>Live visibility</b><span>GPS-backed tracking workflows</span></div><div><Icon name="chart" size={27} /><b>Clear oversight</b><span>Operational and finance views</span></div></div></div></section>
    <section className="hallo-contact" id="contact"><div className="hallo-wrap hallo-contact-inner"><div><span className="hallo-kicker">LET'S MOVE FORWARD</span><h2>Ready for a smarter<br />way to move?</h2><p>Discover a logistics experience built around your business.</p></div><button className="hallo-primary" onClick={() => scroll('top')}>Back to top <Icon name="arrow" size={19} /></button></div></section>
   </main><footer className="hallo-footer"><div className="hallo-wrap hallo-footer-inner"><div className="hallo-footer-brand">HALLO<span>TRUCK</span><small>SMART LOGISTICS</small></div><span>© HALLO Smart Logistics · Web V2 design concept</span><span>EN · OR · AM</span></div></footer>
 </div>;
};