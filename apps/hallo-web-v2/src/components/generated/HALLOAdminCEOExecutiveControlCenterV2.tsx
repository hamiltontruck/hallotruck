import React, { useState } from 'react';
import './HALLOAdminCEOExecutiveControlCenterV2.css';
type Page = 'Overview' | 'Live Operations' | 'Fleet & Drivers' | 'Finance' | 'Customers' | 'Partners' | 'Reports';
const menu: Page[] = ['Overview', 'Live Operations', 'Fleet & Drivers', 'Finance', 'Customers', 'Partners', 'Reports'];
const symbols: Record<Page, string> = {
  'Overview': '◫',
  'Live Operations': '⌁',
  'Fleet & Drivers': '▣',
  'Finance': '◈',
  'Customers': '♙',
  'Partners': '◇',
  'Reports': '▤'
};
const initial = [{
  id: 'HT-2026-0458',
  from: 'Addis Ababa',
  to: 'Adama',
  driver: 'Driver A',
  truck: 'ET-4281',
  status: 'In transit',
  kind: 'live'
}, {
  id: 'HT-2026-0457',
  from: 'Dire Dawa',
  to: 'Djibouti',
  driver: 'Driver B',
  truck: 'ET-7163',
  status: 'Delayed',
  kind: 'delayed'
}, {
  id: 'HT-2026-0456',
  from: 'Hawassa',
  to: 'Addis Ababa',
  driver: 'Driver C',
  truck: 'ET-3094',
  status: 'Delivered',
  kind: 'done'
}, {
  id: 'HT-2026-0455',
  from: 'Adama',
  to: 'Harar',
  driver: 'Unassigned',
  truck: '—',
  status: 'Needs dispatch',
  kind: 'pending'
}];
function Icon({
  name,
  size = 19
}: {
  name: string;
  size?: number;
}) {
  const d: Record<string, React.ReactNode> = {
    search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    truck: <><path d="M2 6h12v11H2zM14 10h4l4 4v3h-8z" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="2" /></>,
    refresh: <><path d="M20 6v6h-6M4 18v-6h6" /><path d="M6 9a7 7 0 0 1 12-2l2 5M4 12l2 5a7 7 0 0 0 12-2" /></>,
    check: <path d="m4 12 5 5L20 6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>,
    filter: <path d="M3 6h18M7 12h10M10 18h4" />,
    chevron: <path d="m8 10 4 4 4-4" />
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d[name]}</svg>;
}
export const HALLOAdminCEOExecutiveControlCenterV2 = () => {
  const [page, setPage] = useState<Page>('Overview');
  const [nav, setNav] = useState(false);
  const [filter, setFilter] = useState('All trips');
  const [query, setQuery] = useState('');
  const [range, setRange] = useState('Last 30 days');
  const [notice, setNotice] = useState('');
  const [language, setLanguage] = useState('EN');
  const show = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(''), 4300);
  };
  const trips = initial.filter(t => (filter === 'All trips' || t.status === filter) && Object.values(t).join(' ').toLowerCase().includes(query.toLowerCase()));
  const select = (p: Page) => {
    setPage(p);
    setNav(false);
    setFilter('All trips');
    setQuery('');
  };
  return <div className="ceo-v2">
  <aside className={'ceo-sidebar ' + (nav ? 'is-open' : '')}><div className="ceo-logo"><span className="ceo-logo-icon">H<span>•</span></span><div><strong>HALLO<span>TRUCK</span></strong><small>SMART LOGISTICS</small></div></div><div className="ceo-workspace"><span className="ceo-avatar-small">H</span><div><strong>HALLO Workspace</strong><small>Executive management</small></div><Icon name="chevron" size={15} /></div><div className="ceo-menu-label">WORKSPACE</div><nav aria-label="Admin navigation">{menu.map(m => <button key={m} className={'ceo-nav-item ' + (page === m ? 'active' : '')} onClick={() => select(m)}><span className="ceo-nav-icon">{symbols[m]}</span><span>{m}</span>{m === 'Live Operations' && <i className="ceo-nav-count">4</i>}</button>)}</nav><div className="ceo-menu-label ceo-secondary-label">MANAGEMENT</div><nav><button className="ceo-nav-item" onClick={() => show('Compliance review is part of the full HALLO admin platform.')}><span className="ceo-nav-icon">⬡</span> Compliance & Docs</button><button className="ceo-nav-item" onClick={() => show('Settings will be connected during implementation.')}><span className="ceo-nav-icon">⚙</span> Settings</button></nav><div className="ceo-sidebar-bottom"><div className="ceo-health-dot" /> <div><strong>System design preview</strong><small>Sample data · No live connection</small></div></div></aside>
  {nav && <button className="ceo-scrim" aria-label="Close menu" onClick={() => setNav(false)} />}
  <div className="ceo-main"><header className="ceo-header"><div className="ceo-header-left"><button className="ceo-hamburger" onClick={() => setNav(!nav)} aria-label="Toggle menu"><Icon name="menu" /></button><span className="ceo-breadcrumb">HALLO / <strong>{page}</strong></span></div><div className="ceo-header-actions"><span className="ceo-demo-pill"><span /> DESIGN PREVIEW</span><button className="ceo-header-icon" aria-label="Notifications" onClick={() => show('No live notifications in design preview.')}><Icon name="bell" /></button><label className="ceo-lang"><select value={language} onChange={e => setLanguage(e.target.value)} aria-label="Language"><option>EN</option><option>OR</option><option>AM</option></select></label><span className="ceo-user">CEO</span></div></header>
   <main className="ceo-content"><div className="ceo-title-row"><div><div className="ceo-eyebrow">EXECUTIVE COMMAND CENTER <span> / </span> WEB V2</div><h1>{page === 'Overview' ? 'Good morning, leadership.' : page}</h1><p>{page === 'Overview' ? 'A clearer view of your logistics business, all in one place.' : 'A focused workspace for HALLO logistics operations.'}</p></div><div className="ceo-title-actions"><select value={range} onChange={e => setRange(e.target.value)} aria-label="Date range"><option>Last 30 days</option><option>Last 7 days</option><option>Today</option></select><button className="ceo-dark-button" onClick={() => show('This is a design concept. No live report was generated.')}>Export report <Icon name="arrow" size={17} /></button></div></div>
    <div className="ceo-preview-alert"><span>◈</span><strong>INTERACTIVE DESIGN PROTOTYPE</strong><span>All figures, driver names, trips and map markers shown here are illustrative — not connected to Supabase or real GPS.</span></div>
    <div className="ceo-metric-grid">{[{
            label: 'Total orders',
            value: '1,284',
            delta: '+12.8%',
            type: 'up',
            sub: 'Illustrative order volume',
            icon: '▤'
          }, {
            label: 'Active trips',
            value: '38',
            delta: '+6.2%',
            type: 'up',
            sub: 'Sample trips in progress',
            icon: '↗'
          }, {
            label: 'Revenue overview',
            value: 'ETB 5.42M',
            delta: '+8.4%',
            type: 'up',
            sub: 'Illustrative released revenue',
            icon: '◈'
          }, {
            label: 'Needs attention',
            value: '07',
            delta: 'Review',
            type: 'warn',
            sub: 'Sample operational exceptions',
            icon: '!'
          }].map((m, i) => <article className="ceo-metric" key={m.label}><div className="ceo-metric-top"><span>{m.label}</span><span className={'ceo-metric-icon metric-' + i}>{m.icon}</span></div><div className="ceo-metric-value">{m.value}</div><div className="ceo-metric-foot"><span className={'ceo-delta ' + m.type}>{m.delta}</span><span>{m.sub}</span></div></article>)}</div>
    <div className="ceo-analytics-grid"><section className="ceo-panel ceo-revenue"><div className="ceo-panel-head"><div><span className="ceo-panel-overline">FINANCIAL PERFORMANCE</span><h2>Revenue trends</h2></div><div className="ceo-chart-legend"><i /> Revenue <span>Illustrative</span></div></div><div className="ceo-chart-total">ETB 5,420,900 <span>+8.4% vs previous period</span></div><div className="ceo-chart"><div className="ceo-chart-lines"><span>6M</span><span>4.5M</span><span>3M</span><span>1.5M</span><span>0</span></div><svg viewBox="0 0 720 240" preserveAspectRatio="none" aria-label="Illustrative revenue trend"><defs><linearGradient id="ceoGradient" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#d7a14e" stopOpacity=".22" /><stop offset="1" stopColor="#d7a14e" stopOpacity="0" /></linearGradient></defs><path d="M0 225H720M0 170H720M0 115H720M0 60H720M0 5H720" stroke="#e9ece8" strokeDasharray="4 6" /><path d="M0 190C50 185 85 160 120 165S185 125 230 138 300 170 345 119 420 127 455 92 520 113 570 70 650 91 720 27V240H0Z" fill="url(#ceoGradient)" /><path d="M0 190C50 185 85 160 120 165S185 125 230 138 300 170 345 119 420 127 455 92 520 113 570 70 650 91 720 27" stroke="#d7a14e" strokeWidth="3.5" fill="none" strokeLinecap="round" /><circle cx="720" cy="27" r="6" fill="#d7a14e" stroke="white" strokeWidth="3" /></svg></div><div className="ceo-months"><span>APR</span><span>MAY</span><span>JUN</span><span>JUL</span><span>AUG</span><span>SEP</span><span>OCT</span></div></section>
     <section className="ceo-panel ceo-operations"><div className="ceo-panel-head"><div><span className="ceo-panel-overline">FLEET PULSE</span><h2>Trip status</h2></div><span className="ceo-light-tag">Sample</span></div><div className="ceo-donut-wrap"><div className="ceo-donut"><div><b>128</b><span>TOTAL TRIPS</span></div></div></div><div className="ceo-donut-list">{[{
                c: '#2d8d77',
                n: 'Delivered',
                v: '72',
                p: '56%'
              }, {
                c: '#dba44d',
                n: 'In transit',
                v: '38',
                p: '30%'
              }, {
                c: '#ed866a',
                n: 'Delayed',
                v: '11',
                p: '9%'
              }, {
                c: '#a8b6bd',
                n: 'Pending',
                v: '7',
                p: '5%'
              }].map(x => <div key={x.n}><i style={{
                  background: x.c
                }} /><span>{x.n}</span><b>{x.v}</b><small>{x.p}</small></div>)}</div></section></div>
    <div className="ceo-lower-grid"><section className="ceo-panel ceo-trips"><div className="ceo-panel-head"><div><span className="ceo-panel-overline">OPERATIONS</span><h2>Recent shipments</h2></div><button className="ceo-view-link" onClick={() => select('Live Operations')}>View operations <Icon name="arrow" size={16} /></button></div><div className="ceo-table-controls"><label className="ceo-search"><Icon name="search" size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search trips..." aria-label="Search trips" /></label><label className="ceo-filter"><Icon name="filter" size={16} /><select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter trip status"><option>All trips</option><option>In transit</option><option>Delayed</option><option>Delivered</option><option>Needs dispatch</option></select></label></div><div className="ceo-table-scroll"><table><thead><tr><th>SHIPMENT</th><th>ROUTE</th><th>DRIVER</th><th>STATUS</th></tr></thead><tbody>{trips.map(t => <tr key={t.id}><td><strong>{t.id}</strong><small>{t.truck}</small></td><td><strong>{t.from} → {t.to}</strong><small>Sample route</small></td><td>{t.driver}</td><td><span className={'ceo-status ' + t.kind}><i />{t.status}</span></td></tr>)}</tbody></table>{trips.length === 0 && <div className="ceo-empty">No sample trips match your filters. <button onClick={() => {
                  setFilter('All trips');
                  setQuery('');
                }}>Clear filters</button></div>}</div></section>
     <section className="ceo-panel ceo-attention"><div className="ceo-panel-head"><div><span className="ceo-panel-overline">PRIORITY QUEUE</span><h2>Needs your attention</h2></div><span className="ceo-attention-badge">07</span></div><div className="ceo-task-list">{[{
                icon: '!',
                color: 'orange',
                title: 'Delayed shipments',
                detail: '3 trips need follow-up',
                time: 'HIGH PRIORITY'
              }, {
                icon: '▣',
                color: 'blue',
                title: 'Driver document review',
                detail: '2 files awaiting approval',
                time: 'COMPLIANCE'
              }, {
                icon: '◈',
                color: 'gold',
                title: 'Payment verification',
                detail: '1 payment needs review',
                time: 'FINANCE'
              }, {
                icon: '⌁',
                color: 'green',
                title: 'Unassigned orders',
                detail: '1 order awaiting dispatch',
                time: 'OPERATIONS'
              }].map(x => <button key={x.title} className="ceo-task" onClick={() => show('Sample queue item. Live action will be connected during implementation.')}><span className={'ceo-task-icon ' + x.color}>{x.icon}</span><span><strong>{x.title}</strong><small>{x.detail}</small></span><em>{x.time}</em><Icon name="arrow" size={15} /></button>)}</div><button className="ceo-task-all" onClick={() => select('Live Operations')}>Open operations workspace <Icon name="arrow" size={16} /></button></section></div>
    <footer className="ceo-footer"><span>HALLO Smart Logistics <b>·</b> Executive UI concept V2</span><span>DESIGN ONLY · NOT LIVE DATA</span></footer>
   </main></div>{notice && <div className="ceo-toast" role="status">{notice}<button onClick={() => setNotice('')}>×</button></div>}</div>;
};