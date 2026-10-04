import { useState } from 'react';
import { Eye, EyeOff, Headphones, MapPinned, ShieldCheck, Truck, WalletCards, WifiOff } from 'lucide-react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/Select';
import { createDriverApiAdapter } from '../helpers/driverApiAdapter';
import { dictionaries, type DriverLocale } from '../helpers/driverI18n';
import styles from './login.module.css';

const api = createDriverApiAdapter();

export default function DriverLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [locale, setLocale] = useState<DriverLocale>('en');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const copy = dictionaries[locale];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password) return setError(`${copy.email} / ${copy.password}`);
    setBusy(true); setError('');
    try {
      const result = await api.login(email.trim(), password);
      if (result.access === 'approved') window.location.href = '/';
      else setError('This account is not an active approved driver.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in.');
    } finally { setBusy(false); }
  }

  return <main className={styles.shell}>
    <section className={styles.hero}>
      <img src="/_cdn/static/7730e567-65b1-4295-9142-a790787d308d.png" alt="HALLO logistics truck on the road" />
      <div className={styles.heroOverlay} />
      <div className={styles.topbar}>
        <div className={styles.wordmark}><span className={styles.logo}><Truck size={25}/></span><strong>HALLO</strong></div>
        <div className={styles.languageWrap} aria-label={copy.language}>
          <Select value={locale} onValueChange={(value) => setLocale(value as DriverLocale)}>
            <SelectTrigger className={styles.language}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="en">EN</SelectItem><SelectItem value="or">OR</SelectItem><SelectItem value="am">AM</SelectItem></SelectContent>
          </Select>
        </div>
      </div>
      <div className={styles.heroCopy}><span>HALLO SMART LOGISTICS</span><h1>{copy.welcomeDrivers}</h1><p>{copy.driverSubtitle}</p></div>
    </section>

    <section className={styles.content}>
      <form className={styles.card} onSubmit={submit}>
        <label>{copy.email}<Input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="driver@example.com" /></label>
        <label>{copy.password}<span className={styles.passwordField}><Input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder={copy.password} /><button type="button" className={styles.eyeButton} onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff/> : <Eye/>}</button></span></label>
        <div className={styles.authMeta}><button type="button" className={styles.textAction} disabled title="Password recovery is not yet connected in Driver V6">{copy.forgotPassword}</button></div>
        {error && <div className={styles.error} role="alert"><WifiOff size={17}/><span>{error}</span></div>}
        <Button type="submit" size="lg" className={styles.submit} disabled={busy}>{busy ? copy.signingIn : copy.signInAction}</Button>
        <div className={styles.divider}><span/>or<span/></div>
        <Button type="button" variant="outline" size="lg" className={styles.google} disabled title="Google OAuth is not yet connected in Driver V6">G&nbsp;&nbsp;{copy.googleSignIn}</Button>
      </form>
      <section className={styles.features} aria-label="Driver login benefits">
        <div><ShieldCheck/><span><strong>{copy.secureLogin}</strong><small>{copy.secureLoginDetail}</small></span></div>
        <div><WalletCards/><span><strong>{copy.fastPayouts}</strong><small>{copy.fastPayoutsDetail}</small></span></div>
        <div><MapPinned/><span><strong>{copy.liveTracking}</strong><small>{copy.liveTrackingDetail}</small></span></div>
        <div><Headphones/><span><strong>{copy.support247}</strong><small>{copy.support247Detail}</small></span></div>
      </section>
      <p className={styles.note}>Real HALLO authentication only. No demo driver data, fake GPS, or fake map state.</p>
    </section>
  </main>;
}
