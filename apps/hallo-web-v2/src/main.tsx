import React from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

function App() {
  return (
    <main>
      <header className="topbar"><a className="brand" href="/" aria-label="HALLO V2 home">HALLO<span>V2</span></a><span className="preview">V2 DEVELOPMENT PREVIEW</span></header>
      <section className="hero">
        <div className="eyebrow">SMART LOGISTICS PLATFORM</div>
        <h1>Logistics built for <em>what's next.</em></h1>
        <p>HALLO Web V2 is being built in isolation. Live bookings, maps, tracking and executive metrics will appear only after secure integrations and verified end-to-end tests.</p>
        <div className="actions"><a href="#platform" className="primary">Explore V2 foundation</a><a href="https://hamiltontruck.github.io/hallotruck/" className="secondary" rel="noreferrer">Existing HALLO V1 ↗</a></div>
      </section>
      <section id="platform" className="features" aria-label="Planned HALLO V2 platform modules">
        <article><span>01</span><h2>Shippers</h2><p>Real routes, eligible trucks, authoritative quotes and live order visibility.</p></article>
        <article><span>02</span><h2>Drivers & Partners</h2><p>Secure assignments, fleet operations and tenant-scoped workflows.</p></article>
        <article><span>03</span><h2>Admin / CEO</h2><p>Verified operations, financial reporting and GPS status with role-based access.</p></article>
      </section>
      <footer>Design foundation only · No sample operational data · No production integrations</footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
