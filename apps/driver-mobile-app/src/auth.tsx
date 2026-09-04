import { useState, type FormEvent } from 'react';
import { supabase } from './supabase';

export function Login() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [language, setLanguage] = useState('English');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setConfirmation('');
    try {
      if (mode === 'signup') {
        if (!/^\d{6}$/.test(password)) throw new Error('Password must be exactly 6 numeric digits.');
        const { data, error: signupError } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: fullName.trim(), phone: phone.trim(), role: 'driver', language } } });
        if (signupError) throw signupError;
        if (!data.session) setConfirmation('Account created. Confirm your email, then sign in to continue to Driver Documents.');
      } else {
        const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (loginError) throw loginError;
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Authentication failed.'); }
    finally { setBusy(false); }
  }
  return <div className="auth"><div className="auth-brand"><span className="mark big">H</span><h1>Driver Mobile V4</h1><p>{mode === 'signup' ? 'Create your driver account.' : 'Sign in to HALLO Driver.'}</p></div><form onSubmit={submit} className="panel">{mode === 'signup' && <><label>Language<select value={language} onChange={(event) => setLanguage(event.target.value)}><option>English</option><option>Amharic</option><option>Afaan Oromoo</option></select></label><label>Full name<input required autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} /></label><label>Phone<input required type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></label></>}<label>Email<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>Password<input required type="password" inputMode={mode === 'signup' ? 'numeric' : undefined} pattern={mode === 'signup' ? '[0-9]{6}' : undefined} minLength={mode === 'signup' ? 6 : undefined} maxLength={mode === 'signup' ? 6 : undefined} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <p className="error">{error}</p>}{confirmation && <p className="success">{confirmation}</p>}<button className="primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in securely'}</button></form><button className="link-button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setConfirmation(''); }}>{mode === 'login' ? 'Create a driver account' : 'Sign in instead'}</button></div>;
}
