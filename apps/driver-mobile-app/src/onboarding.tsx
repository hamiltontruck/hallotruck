import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import './onboarding.css';

type DriverStatus = 'pending' | 'approved' | 'suspended' | string | null;
type Profile = { role: string | null; driver_status: DriverStatus };
type Truck = { id: string; plate_number: string; vehicle_type: string; capacity_tons: number | null };
type DocumentKey = 'driver_photo' | 'license_front' | 'license_back' | 'national_id_front' | 'national_id_back' | 'vehicle_registration' | 'truck_front' | 'truck_side';
type Document = { id: string; document_key: DocumentKey; truck_id: string | null; file_path: string; status: string; expiry_date: string | null };
type DocumentSpec = readonly [DocumentKey, string, boolean?];

const driverDocuments: readonly DocumentSpec[] = [
  ['driver_photo', 'Driver photo'],
  ['license_front', 'License front', true],
  ['license_back', 'License back'],
  ['national_id_front', 'National ID front', true],
  ['national_id_back', 'National ID back'],
];
const vehicleDocuments: readonly DocumentSpec[] = [
  ['vehicle_registration', 'Vehicle registration'],
  ['truck_front', 'Truck photo front'],
  ['truck_side', 'Truck photo side'],
];
const photoKeys = new Set<DocumentKey>(['driver_photo', 'truck_front', 'truck_side']);
const expiryKeys = new Set<DocumentKey>(['license_front', 'national_id_front']);
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']);
const uploadAccept = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf';

function cleanName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(-90) || 'document';
}

function currentExpiry(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const expiry = Date.parse(`${value}T23:59:59.999Z`);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Number.isFinite(expiry) && expiry >= today.getTime();
}

async function uploadDocument(
  userId: string,
  key: DocumentKey,
  file: File,
  truckId: string | null,
  expiryDate: string | null,
  current?: Document,
) {
  if (!file.name || !allowedTypes.has(file.type) || file.size <= 0 || file.size > 10 * 1024 * 1024) throw new Error('Use a JPG, PNG, WebP, HEIC, HEIF or PDF file up to 10 MB.');
  if (photoKeys.has(key) && !file.type.startsWith('image/')) throw new Error('Photo fields require an image file.');
  if (expiryKeys.has(key) && (!expiryDate || !currentExpiry(expiryDate))) throw new Error('License and National ID front require a current expiry date.');
  if (!expiryKeys.has(key) && expiryDate) throw new Error('Expiry date is used only for the license or National ID front.');
  const scope = truckId ? `truck-${truckId}` : 'identity';
  const path = `${userId}/${scope}/${key}/${crypto.randomUUID()}-${cleanName(file.name)}`;
  const upload = await supabase.storage.from('driver-verification').upload(path, file, { contentType: file.type, upsert: false });
  if (upload.error) throw new Error(upload.error.message);
  const record = {
    driver_id: userId,
    truck_id: truckId,
    document_key: key,
    file_path: path,
    original_name: file.name,
    mime_type: file.type,
    expiry_date: expiryKeys.has(key) ? expiryDate : null,
    status: 'pending',
    rejection_reason: null,
    reviewed_by: null,
    reviewed_at: null,
    updated_at: new Date().toISOString(),
  };
  const result = current
    ? await supabase.from('driver_verification_files').update(record).eq('id', current.id).eq('driver_id', userId).select('id').maybeSingle()
    : await supabase.from('driver_verification_files').insert(record).select('id').maybeSingle();
  if (result.error || !result.data?.id) {
    await supabase.storage.from('driver-verification').remove([path]);
    throw new Error(result.error?.message || 'The document record was not saved.');
  }
  if (current?.file_path) await supabase.storage.from('driver-verification').remove([current.file_path]);
}

export async function getDriverProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('role,driver_status').eq('id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export function DriverAccess({ session, children }: { session: Session; children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [error, setError] = useState('');

  async function refreshProfile() {
    setError('');
    try { setProfile(await getDriverProfile(session.user.id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Driver profile could not be loaded.'); }
  }

  useEffect(() => { void refreshProfile(); }, [session.user.id]);

  if (error) return <AccessDenied message={error} />;
  if (profile === undefined) return <div className="splash"><b>Loading driver account…</b></div>;
  if (profile === null) return <DriverProfileCompletion session={session} onCompleted={refreshProfile} />;
  if (profile.role !== 'driver' || profile.driver_status === 'suspended') return <AccessDenied message="This driver account is not allowed to access the Driver Mobile App." />;
  if (profile.driver_status === 'approved') return <>{children}</>;
  return <Onboarding session={session} />;
}

type DriverOnboardingLanguage = 'om' | 'en' | 'am';

const DRIVER_PROFILE_COPY = {
  om: {
    eyebrow: 'GOOGLE GALMEE',
    title: 'Driver profile kee xumuri',
    description: 'Google\'n seenteetta. Driver onboarding itti fufuuf maqaa fi lakkoofsa bilbilaa Itoophiyaa mirkaneessi. Sana booda plate fi document 8 guutuu galchita.',
    fullName: 'Maqaa guutuu',
    phone: 'Bilbila',
    submit: 'DRIVER GALMEE ITTI FUFI',
    saving: 'GALMEE XUMURAA JIRA…',
    invalidName: 'Maqaan guutuun qubee 2–120 qabaachuu qaba.',
    invalidPhone: 'Bilbila sirrii galchi: 09xxxxxxxx, 07xxxxxxxx, +2519xxxxxxxx ykn +2517xxxxxxxx.',
    failed: 'Driver profile uumuu hin dandeenye. Odeeffannoo kee ilaalii irra deebi\'i.',
    signOut: 'Ba\'i',
  },
  en: {
    eyebrow: 'GOOGLE ONBOARDING',
    title: 'Complete your Driver profile',
    description: 'Google sign-in succeeded. Confirm your name and Ethiopian mobile number. Next you will add your plate, vehicle details and all 8 required verification files.',
    fullName: 'Full name',
    phone: 'Phone',
    submit: 'CONTINUE DRIVER ONBOARDING',
    saving: 'COMPLETING SETUP…',
    invalidName: 'Full name must contain 2–120 characters.',
    invalidPhone: 'Enter 09xxxxxxxx, 07xxxxxxxx, +2519xxxxxxxx or +2517xxxxxxxx.',
    failed: 'The Driver profile could not be created. Check your details and try again.',
    signOut: 'Sign out',
  },
  am: {
    eyebrow: 'GOOGLE ምዝገባ',
    title: 'የDriver profile ያጠናቁ',
    description: 'በGoogle መግባት ተሳክቷል። ስምዎን እና የኢትዮጵያ ሞባይል ቁጥርዎን ያረጋግጡ። ቀጥሎ plate፣ የተሽከርካሪ መረጃ እና 8 አስፈላጊ ሰነዶችን ያስገባሉ።',
    fullName: 'ሙሉ ስም',
    phone: 'ስልክ',
    submit: 'DRIVER ምዝገባ ቀጥል',
    saving: 'ምዝገባ በማጠናቀቅ ላይ…',
    invalidName: 'ሙሉ ስም 2–120 ፊደላት መሆን አለበት።',
    invalidPhone: 'ትክክለኛ የኢትዮጵያ ሞባይል ቁጥር ያስገቡ።',
    failed: 'የDriver profile መፍጠር አልተቻለም። መረጃዎን ያረጋግጡና እንደገና ይሞክሩ።',
    signOut: 'ውጣ',
  },
} as const;

function normalizeDriverPhone(value: string) {
  const compact = value.trim().replace(/[\s()-]/g, '');
  if (!/^(?:\+251|251|0)?[79]\d{8}$/.test(compact)) return null;
  if (compact.startsWith('+251')) return `0${compact.slice(4)}`;
  if (compact.startsWith('251')) return `0${compact.slice(3)}`;
  if (/^[79]/.test(compact)) return `0${compact}`;
  return compact;
}

function DriverProfileCompletion({ session, onCompleted }: { session: Session; onCompleted: () => Promise<void> }) {
  const [language, setLanguage] = useState<DriverOnboardingLanguage>(() => {
    const value = window.localStorage.getItem('hallo-driver-language');
    return value === 'en' || value === 'am' || value === 'om' ? value : 'om';
  });
  const copy = DRIVER_PROFILE_COPY[language];
  const initialName = String(session.user.user_metadata?.full_name ?? session.user.user_metadata?.name ?? session.user.email?.split('@')[0] ?? '');
  const [fullName, setFullName] = useState(initialName);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    window.localStorage.setItem('hallo-driver-language', language);
    document.documentElement.lang = language;
  }, [language]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const cleanName = fullName.trim().replace(/\s+/g, ' ');
    if (cleanName.length < 2 || cleanName.length > 120) { setError(copy.invalidName); return; }
    const normalizedPhone = normalizeDriverPhone(phone);
    if (!normalizedPhone) { setError(copy.invalidPhone); return; }
    setBusy(true);
    setError('');
    try {
      const { error: profileError } = await supabase.rpc('complete_public_mobile_profile', {
        p_role: 'driver',
        p_full_name: cleanName,
        p_phone: normalizedPhone,
      });
      if (profileError) throw profileError;
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw refreshError;
      await onCompleted();
    } catch {
      setError(copy.failed);
    } finally {
      setBusy(false);
    }
  }

  return <main className="onboarding">
    <header className="onboarding-head"><span className="mark">H</span><div><b>HALLO DRIVER V4</b><small>{copy.eyebrow}</small></div></header>
    <section className="onboarding-panel">
      <label>Language<select value={language} disabled={busy} onChange={(event) => setLanguage(event.target.value as DriverOnboardingLanguage)}><option value="en">EN</option><option value="om">OR</option><option value="am">አማ</option></select></label>
      <h1>{copy.title}</h1>
      <p className="notice">{copy.description}</p>
      {error && <p className="error notice-box" role="alert">{error}</p>}
      <form onSubmit={submit}>
        <label>{copy.fullName}<input autoComplete="name" maxLength={120} value={fullName} disabled={busy} onChange={(event) => setFullName(event.target.value)} /></label>
        <label>{copy.phone}<input type="tel" inputMode="tel" autoComplete="tel" placeholder="09xxxxxxxx / 07xxxxxxxx" maxLength={17} value={phone} disabled={busy} onChange={(event) => setPhone(event.target.value)} /></label>
        <button className="primary" disabled={busy}>{busy ? copy.saving : copy.submit}</button>
      </form>
      <button className="secondary" type="button" disabled={busy} onClick={() => void supabase.auth.signOut()}>{copy.signOut}</button>
    </section>
  </main>;
}

function AccessDenied({ message }: { message: string }) {
  return <div className="auth"><div className="panel"><h1>Access denied</h1><p className="error">{message}</p><button className="secondary" onClick={() => void supabase.auth.signOut()}>Sign out</button></div></div>;
}

export function Onboarding({ session }: { session: Session }) {
  const [step, setStep] = useState<'driver' | 'vehicle'>('driver');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [truck, setTruck] = useState<Truck | null>(null);
  const [plate, setPlate] = useState('');
  const [vehicleType, setVehicleType] = useState('Isuzu 5 Ton');
  const [capacityTons, setCapacityTons] = useState('5');
  const [expiryDates, setExpiryDates] = useState<Partial<Record<DocumentKey, string>>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const byKey = useMemo(() => new Map(documents.map((document) => [`${document.document_key}:${document.truck_id ?? ''}`, document])), [documents]);

  async function refresh() {
    const [docs, trucks] = await Promise.all([
      supabase.from('driver_verification_files').select('id,document_key,truck_id,file_path,status,expiry_date').eq('driver_id', session.user.id),
      supabase.from('trucks').select('id,plate_number,vehicle_type,capacity_tons').eq('driver_id', session.user.id).order('updated_at', { ascending: false }),
    ]);
    if (docs.error) throw new Error(docs.error.message);
    if (trucks.error) throw new Error(trucks.error.message);
    const existingTruck = trucks.data?.[0] as Truck | undefined;
    const nextDocuments = (docs.data ?? []) as Document[];
    setDocuments(nextDocuments);
    setExpiryDates((current) => {
      const next = { ...current };
      for (const document of nextDocuments) if (expiryKeys.has(document.document_key) && document.expiry_date) next[document.document_key] = document.expiry_date;
      return next;
    });
    setTruck(existingTruck ?? null);
    setPlate(existingTruck?.plate_number ?? '');
  }

  useEffect(() => { setLoading(true); void refresh().catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false)); }, [session.user.id]);

  async function upload(key: DocumentKey, file?: File) {
    if (!file) return;
    setBusy(true); setError(''); setNotice('');
    const truckId = step === 'vehicle' ? truck?.id ?? null : null;
    const expiryDate = expiryKeys.has(key) ? expiryDates[key]?.trim() || null : null;
    try {
      await uploadDocument(session.user.id, key, file, truckId, expiryDate, byKey.get(`${key}:${truckId ?? ''}`));
      await refresh();
      setNotice('Document submitted for review.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Upload failed.');
    } finally { setBusy(false); }
  }

  async function continueToVehicle(event: FormEvent) { event.preventDefault(); setError(''); setNotice(''); setStep('vehicle'); }
  const identityComplete = driverDocuments.every(([key]) => byKey.has(`${key}:`));
  const vehicleComplete = Boolean(truck) && vehicleDocuments.every(([key]) => byKey.has(`${key}:${truck?.id ?? ''}`));
  const onboardingComplete = identityComplete && vehicleComplete;

  async function saveVehicle() {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const capacity = Number(capacityTons);
      if (plate.trim().length < 3 || !Number.isFinite(capacity) || capacity < .1 || capacity > 60) throw new Error('Enter a valid plate and capacity between 0.1 and 60 tons.');
      const { error: saveError } = await supabase.rpc('driver_save_vehicle_profile', { p_plate_number: plate.trim(), p_vehicle_type: vehicleType, p_capacity_tons: capacity });
      if (saveError) throw new Error(saveError.message);
      await refresh(); setNotice('Vehicle profile saved. Upload the vehicle documents.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Vehicle profile could not be saved.'); }
    finally { setBusy(false); }
  }

  const vehicleBlocked = !truck;
  function submitVehicle() {
    if (!vehicleComplete) {
      setError('Upload all three required vehicle files before submitting for verification.');
      setNotice('');
      return;
    }
    setError('');
    setNotice('All eight required files are submitted. HALLO Admin/CEO review is pending.');
  }

  if (loading) return <div className="splash"><b>Loading Driver onboarding…</b></div>;
  if (onboardingComplete) return <main className="onboarding"><header className="onboarding-head"><span className="mark">H</span><div><b>HALLO DRIVER V4</b><small>VERIFICATION</small></div></header><section className="onboarding-panel"><h1>Verification pending</h1><p className="notice">Driver and vehicle documents are complete. HALLO Admin/CEO review is required before jobs become available.</p><p className="success notice-box">8 of 8 required files submitted.</p>{error && <p className="error notice-box">{error}</p>}<button className="secondary" type="button" disabled={busy} onClick={() => { setBusy(true); setError(''); void refresh().catch((reason: Error) => setError(reason.message)).finally(() => setBusy(false)); }}>{busy ? 'Refreshing…' : 'Refresh status'}</button><button className="secondary" type="button" disabled={busy} onClick={() => void supabase.auth.signOut()}>Sign out</button></section></main>;

  return <main className="onboarding"><header className="onboarding-head"><span className="mark">H</span><div><b>HALLO DRIVER V4</b><small>ONBOARDING</small></div></header><div className="stepper"><span className={step === 'driver' ? 'active' : ''}>01 Driver Documents</span><span className={step === 'vehicle' ? 'active' : ''}>02 Vehicle Documents</span></div>{error && <p className="error notice-box">{error}</p>}{notice && <p className="success notice-box">{notice}</p>}{step === 'driver' ? <form className="onboarding-panel" onSubmit={continueToVehicle}><h1>Driver Documents</h1>{driverDocuments.map(([key, label, requiresExpiry]) => <DocumentField key={key} label={label} busy={busy} uploaded={byKey.has(`${key}:`)} requiresExpiry={Boolean(requiresExpiry)} expiryDate={expiryDates[key] ?? ''} onExpiryChange={(value) => setExpiryDates((current) => ({ ...current, [key]: value }))} onChange={(file) => void upload(key, file)} />)}<button className="primary" disabled={busy || !identityComplete}>Continue</button></form> : <section className="onboarding-panel"><h1>Vehicle Documents</h1><label>Plate No<input value={plate} onChange={(event) => setPlate(event.target.value)} disabled={Boolean(truck)} required /></label>{!truck&&<><label>Vehicle type<select value={vehicleType} onChange={(event)=>setVehicleType(event.target.value)}>{['Pickup','Van','Isuzu 5 Ton','Dry Cargo','Refrigerated','Truck 22 Ton','Truck 25 Ton','Truck 30 Ton','Trailer'].map(value=><option key={value}>{value}</option>)}</select></label><label>Capacity tons<input type="number" min="0.1" max="60" step="0.1" value={capacityTons} onChange={(event)=>setCapacityTons(event.target.value)}/></label><button className="primary" type="button" disabled={busy} onClick={()=>void saveVehicle()}>Save vehicle profile</button></>}{vehicleDocuments.map(([key, label]) => <DocumentField key={key} label={label} busy={busy || vehicleBlocked} uploaded={Boolean(truck) && byKey.has(`${key}:${truck?.id ?? ''}`)} onChange={(file) => void upload(key, file)} />)}{vehicleBlocked && <p className="notice">Save the vehicle profile before uploading vehicle documents.</p>}<button className="primary" disabled={busy || vehicleBlocked || !vehicleComplete} onClick={submitVehicle}>Submit for verification</button><button className="secondary" type="button" onClick={() => setStep('driver')}>Back</button></section>}</main>;
}

function DocumentField({ label, busy, uploaded, requiresExpiry = false, expiryDate = '', onExpiryChange, onChange }: {
  label: string;
  busy: boolean;
  uploaded: boolean;
  requiresExpiry?: boolean;
  expiryDate?: string;
  onExpiryChange?: (value: string) => void;
  onChange: (file?: File) => void;
}) {
  return <div className="document-field"><label><span>{label}{uploaded ? ' ✓ Uploaded' : ''}</span>{requiresExpiry && <input type="date" required value={expiryDate} disabled={busy} onChange={(event) => onExpiryChange?.(event.target.value)} aria-label={`${label} expiry date`} />}<input type="file" accept={uploadAccept} disabled={busy || (requiresExpiry && !expiryDate)} onChange={(event) => onChange(event.target.files?.[0])} /></label></div>;
}
