import { AuthBrand } from './brand';
import truck from './assets/splash.webp';

export function Splash({ onContinue }: { onContinue?: () => void }) {
  return <main className="driver-welcome" style={{ backgroundImage: `url(${truck})` }} aria-label="HALLO Driver">
    <div className="driver-welcome-heading"><AuthBrand /><p>Move Anything. Anywhere.<br />Safer. Faster. Together.</p></div>
    <div className="driver-welcome-bottom">
      {onContinue ? <button type="button" onClick={onContinue}>Continue</button> : <p role="status">Loading…</p>}
      <p>Reliable Trucking for a Stronger Ethiopia</p>
      <small>People <span aria-hidden="true">|</span> Business <span aria-hidden="true">|</span> Progress</small>
    </div>
  </main>;
}
