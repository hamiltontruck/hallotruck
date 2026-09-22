import wordmark from './assets/wordmark.webp';
import skyline from './assets/skyline.webp';

export function AuthBrand() {
  return <div className="driver-auth-brand"><img src={wordmark} alt="HALLO" width="240" height="72" /><p>Smart Logistics</p></div>;
}
export function AuthFooter() {
  return <footer className="driver-auth-footer"><img src={skyline} alt="" /><div><strong>HALLO Smart Logistics</strong><span>Move Anything. Anywhere.</span></div></footer>;
}
