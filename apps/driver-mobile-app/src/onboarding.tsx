import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import './onboarding.css';

type DriverStatus = 'pending' | 'approved' | 'suspended' | string | null;
type Profile = { role: string | null; driver_status: DriverStatus };
type Truck = { id: string; plate_number: string; vehicle_type: string; capacity_tons: number | null };
type DocumentKey = 'driver_photo' | 'license_front' | 'license_back' | 'national_id_front' | 'national_id_back' | 'vehicle_registration' | 'insurance' | 'truck_front' | 'truck_side';
type Document = { id: string; document_key: DocumentKey; truck_id: string | null; file_path: string; status: string };

const driverDocuments: readonly [DocumentKey, string][] = [
  ['driver_photo', 'Driver photo'],
  ['license_front', 'License front'],
  ['license_back', 'License back'],
  ['national_id_front', 'National ID front'],
  ['national_id_back', 'National ID back'],
];
const vehicleDocuments: readonly [DocumentKey, string][] = [
  ['vehicle_registration', 'Vehicle registration'],
  ['insurance', 'Insurance certificate'],
  ['truck_front', 'Truck photo front'],
  ['truck_side', 'Truck photo side'],
];
const photoKeys = new Set<DocumentKey>(['driver_photo', 'truck_front', 'truck_side']);
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

function cleanName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(-90) || 'document';
}

async function uploadDocument(userId: string, key: DocumentKey, file: File, truckId: string | null, current?: Document) {
  if (!file.name || !allowedTypes.has(file.type) || file.size <= 0 || file.size > 10 * 1024 * 1024) throw new Error('Use a JPG, PNG, WebP or PDF file up to 10 MB.');
  if (photoKeys.has(key) && !file.type.startsWith('image/')) throw new Error('Photo fields require an image file.');
  const scope = truckId ? `truck-${truckId}` : 'identity';
  const path = `${userId}/${scope}/${key}/${crypto.randomUUID()}-${cleanName(file.name)}`;
  const upload = await supabase.storage.from('driver-verification').upload(path, file, { contentType: file.type, upsert: false });
  if (upload.error) throw new Error(upload.error.message);
  const record = { driver_id: userId, truck_id: truckId, document_key: key, file_path: path, original_name: file.name, mime_type: file.type, expiry_date: null, status: 'pending', rejection_reason: null, reviewed_by: null, reviewed_at: null, updated_at: new Date().toISOString() };
  const result = current
    ? await supabase.from('driver_verification_files').update(record).eq('id', current.id).eq('driver_id', userId).select('id').maybeSingle()
    : await supabase.from('driver_verification_files').insert(record).select('id').maybeSingle();
  if (result.error || !result.data?.id) {
    await supabase.storage.from('driver-verification').remove([path]);
    throw new Error(result.error?.message || 'The document record was not saved.');
  }
  if (current?.file_path) await supabase.storage.from('driver-verification').remove([current.file_path]);
}

export async function getDriverProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select('role,driver_status').eq('id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? { role: null, driver_status: null };
}

export function DriverAccess({ session, children }: { session: Session; children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { void getDriverProfile(session.user.id).then(setProfile).catch((reason: Error) => setError(reason.message)); }, [session.user.id]);
  if (error) return <AccessDenied message={error} />;
  if (!profile) return <div className="splash"><b>Loading driver account…</b></div>;
  if (profile.role !== 'driver' || profile.driver_status === 'suspended') return <AccessDenied message="This driver account is not allowed to access the Driver Mobile App." />;
  if (profile.driver_status === 'approved') return <>{children}</>;
  return <Onboarding session={session} />;
}

function AccessDenied({ message }: { message: string }) { return <div className="auth"><div className="panel"><h1>Access denied</h1><p className="error">{message}</p><button className="secondary" onClick={() => void supabase.auth.signOut()}>Sign out</button></div></div>; }

export function Onboarding({ session }: { session: Session }) {
  const [step, setStep] = useState<'driver' | 'vehicle'>('driver');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [truck, setTruck] = useState<Truck | null>(null);
  const [plate, setPlate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const byKey = useMemo(() => new Map(documents.map((document) => [`${document.document_key}:${document.truck_id ?? ''}`, document])), [documents]);
  async function refresh() {
    const [docs, trucks] = await Promise.all([
      supabase.from('driver_verification_files').select('id,document_key,truck_id,file_path,status').eq('driver_id', session.user.id),
      supabase.from('trucks').select('id,plate_number,vehicle_type,capacity_tons').eq('driver_id', session.user.id).order('updated_at', { ascending: false }),
    ]);
    if (docs.error) throw new Error(docs.error.message);
    if (trucks.error) throw new Error(trucks.error.message);
    const existingTruck = trucks.data?.[0] as Truck | undefined;
    setDocuments((docs.data ?? []) as Document[]); setTruck(existingTruck ?? null); setPlate(existingTruck?.plate_number ?? '');
  }
  useEffect(() => { void refresh().catch((reason: Error) => setError(reason.message)); }, [session.user.id]);
  async function upload(key: DocumentKey, file?: File) {
    if (!file) return; setBusy(true); setError(''); setNotice('');
    try { await uploadDocument(session.user.id, key, file, step === 'vehicle' ? truck?.id ?? null : null, byKey.get(`${key}:${step === 'vehicle' ? truck?.id ?? '' : ''}`)); await refresh(); setNotice('Document submitted for review.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Upload failed.'); } finally { setBusy(false); }
  }
  async function continueToVehicle(event: FormEvent) { event.preventDefault(); setError(''); setNotice(''); setStep('vehicle'); }
  const identityComplete = driverDocuments.every(([key]) => byKey.has(`${key}:`));
  const vehicleBlocked = !truck;
  function submitVehicle() {
    const complete = vehicleDocuments.every(([key]) => byKey.has(`${key}:${truck?.id ?? ''}`));
    setError(complete ? '' : 'Upload all vehicle documents before submitting for verification.');
    setNotice(complete ? 'Vehicle documents submitted for verification.' : '');
  }
  return <main className="onboarding"><header className="onboarding-head"><span className="mark">H</span><div><b>HALLO DRIVER V4</b><small>ONBOARDING</small></div></header><div className="stepper"><span className={step === 'driver' ? 'active' : ''}>01 Driver Documents</span><span className={step === 'vehicle' ? 'active' : ''}>02 Vehicle Documents</span></div>{error && <p className="error notice-box">{error}</p>}{notice && <p className="success notice-box">{notice}</p>}{step === 'driver' ? <form className="onboarding-panel" onSubmit={continueToVehicle}><h1>Driver Documents</h1>{driverDocuments.map(([key, label]) => <DocumentField key={key} label={label} busy={busy} onChange={(file) => void upload(key, file)} />)}<button className="primary" disabled={busy || !identityComplete}>Continue</button></form> : <section className="onboarding-panel"><h1>Vehicle Documents</h1><label>Plate No<input value={plate} onChange={(event) => setPlate(event.target.value)} disabled={Boolean(truck)} required /></label>{vehicleDocuments.map(([key, label]) => <DocumentField key={key} label={label} busy={busy || vehicleBlocked} onChange={(file) => void upload(key, file)} />)}{vehicleBlocked && <p className="error">Plate No cannot be saved yet. Existing backend path driver_save_vehicle_profile requires plate number, vehicle type, and capacity; this app will not invent either value.</p>}<button className="primary" disabled={busy || vehicleBlocked} onClick={submitVehicle}>Submit for verification</button><button className="secondary" type="button" onClick={() => setStep('driver')}>Back</button></section>}</main>;
}

function DocumentField({ label, busy, onChange }: { label: string; busy: boolean; onChange: (file?: File) => void }) { return <label className="document-field"><span>{label}</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={busy} onChange={(event) => onChange(event.target.files?.[0])} /></label>; }
