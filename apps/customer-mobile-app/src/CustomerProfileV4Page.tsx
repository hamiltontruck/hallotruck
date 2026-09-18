import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { customerSupabase } from "./auth/customer-supabase";
import { updateCustomerMobileProfile } from "./customer-profile.service";
import {
  clearCustomerAvatar,
  createCustomerAvatarUrl,
  loadCustomerMobileAvatarProfile,
  uploadCustomerAvatar,
  type CustomerMobileAvatarProfile,
} from "./customer-profile-avatar.service";

function customerInitials(name: string | null | undefined) {
  const parts = (name || "Customer").trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "CU";
}

export function CustomerProfileV4Page({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<CustomerMobileAvatarProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [customerType, setCustomerType] = useState<"individual" | "business">("individual");
  const [signingOut, setSigningOut] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [avatarProgress, setAvatarProgress] = useState(0);
  const [avatarStage, setAvatarStage] = useState("");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [retryAvatarFile, setRetryAvatarFile] = useState<File | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  async function load(showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      const nextProfile = await loadCustomerMobileAvatarProfile(userId);
      setProfile(nextProfile);
      setCustomerType(nextProfile?.customer_type === "business" ? "business" : "individual");
      setError("");
      setAvatarError("");
      setAvatarUrl(null);
      if (nextProfile?.avatar_path) {
        setAvatarLoading(true);
        try {
          setAvatarUrl(await createCustomerAvatarUrl(userId, nextProfile.avatar_path));
        } catch (caught) {
          setAvatarError(caught instanceof Error ? caught.message : "Profile photo could not be loaded.");
        } finally {
          setAvatarLoading(false);
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Customer profile could not be loaded.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => { void load(true); }, [userId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await updateCustomerMobileProfile(userId, {
        fullName: String(form.get("fullName") || ""),
        phone: String(form.get("phone") || ""),
        email: String(form.get("email") || ""),
        homeAddress: String(form.get("homeAddress") || ""),
        customerType,
        companyName: String(form.get("companyName") || ""),
      });
      await load(false);
      setEditing(false);
      setSuccess("Profile updated successfully.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Profile could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function saveAvatar(file: File) {
    if (avatarBusy) return;
    setAvatarBusy(true);
    setRetryAvatarFile(file);
    setAvatarError("");
    setSuccess("");
    setAvatarProgress(0);
    setAvatarStage("Preparing photo");
    try {
      await uploadCustomerAvatar(userId, file, (percent, stage) => {
        setAvatarProgress(percent);
        setAvatarStage(stage);
      });
      await load(false);
      setRetryAvatarFile(null);
      setSuccess("Profile photo updated successfully.");
    } catch (caught) {
      setAvatarError(caught instanceof Error ? caught.message : "Profile photo could not be uploaded.");
    } finally {
      setAvatarBusy(false);
    }
  }

  function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void saveAvatar(file);
  }

  async function removeAvatar() {
    if (avatarBusy || !profile?.avatar_path) return;
    setAvatarBusy(true);
    setAvatarError("");
    setSuccess("");
    setAvatarProgress(20);
    setAvatarStage("Removing profile photo");
    try {
      await clearCustomerAvatar(userId);
      setAvatarUrl(null);
      setRetryAvatarFile(null);
      setAvatarProgress(100);
      await load(false);
      setSuccess("Profile photo removed.");
    } catch (caught) {
      setAvatarError(caught instanceof Error ? caught.message : "Profile photo could not be removed.");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function signOut() {
    if (signingOut) return;
    const client = customerSupabase;
    if (!client) return setError("Customer session client is not configured.");
    setSigningOut(true);
    try {
      const { error: signOutError } = await client.auth.signOut();
      if (signOutError) throw signOutError;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign-out failed.");
    } finally {
      setSigningOut(false);
    }
  }

  if (loading && !profile) {
    return <main className="customer-v4-page"><section className="customer-v4-card customer-v4-state"><strong>Loading profile…</strong><span>Reading your Customer profile from the secure backend.</span></section></main>;
  }

  if (!profile) {
    return <main className="customer-v4-page"><section className="customer-v4-card customer-v4-state"><strong>Customer profile not available</strong><span>{error || "customer_get_profile_v2 returned no Customer record."}</span><button type="button" onClick={() => void load(true)}>Retry</button></section></main>;
  }

  const joined = profile.created_at ? new Date(profile.created_at).toLocaleDateString() : "—";
  const initials = customerInitials(profile.full_name);

  return (
    <main className="customer-v4-page">
      <header className="customer-v4-page-header"><div><strong>HALLO<span>TRUCK</span></strong><small>CUSTOMER PROFILE</small></div><b>Verified Customer</b></header>
      <section className="customer-v4-profile-hero">
        <ProfileAvatar imageUrl={avatarUrl} initials={initials} name={profile.full_name} loading={avatarLoading} onImageError={() => { setAvatarUrl(null); setAvatarError("Profile photo could not be displayed. Initials are shown instead."); }}/>
        <div><small>YOUR ACCOUNT</small><h1>{profile.full_name || "Customer"}</h1><p>{profile.customer_type === "business" ? profile.company_name || "Business account" : "Individual account"}</p></div>
      </section>

      <section className="customer-v4-card customer-v4-avatar-card">
        <div className="customer-v4-avatar-card__top">
          <ProfileAvatar imageUrl={avatarUrl} initials={initials} name={profile.full_name} compact loading={avatarLoading} onImageError={() => setAvatarUrl(null)}/>
          <div><small>PROFILE PHOTO</small><strong>{profile.avatar_path ? "Your secure Customer photo" : "Add a Customer photo"}</strong><p>Private image. Only your authenticated Customer account can read or replace this avatar.</p></div>
        </div>
        <div className="customer-v4-avatar-actions">
          <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={avatarBusy}>Camera</button>
          <button type="button" onClick={() => galleryInputRef.current?.click()} disabled={avatarBusy}>Photo library</button>
          {profile.avatar_path && <button type="button" className="is-danger" onClick={() => void removeAvatar()} disabled={avatarBusy}>Remove photo</button>}
        </div>
        <input ref={cameraInputRef} className="customer-v4-avatar-input" type="file" accept="image/jpeg,image/png,image/webp" capture="user" onChange={chooseAvatar}/>
        <input ref={galleryInputRef} className="customer-v4-avatar-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseAvatar}/>
        {avatarBusy && <div className="customer-v4-avatar-progress" role="status" aria-live="polite"><div><span>{avatarStage || "Uploading photo"}</span><strong>{avatarProgress}%</strong></div><progress max="100" value={avatarProgress}/></div>}
        {avatarError && <div className="customer-v4-avatar-error" role="alert"><span>{avatarError}</span>{retryAvatarFile && <button type="button" onClick={() => void saveAvatar(retryAvatarFile)} disabled={avatarBusy}>Retry photo upload</button>}</div>}
      </section>

      <section className="customer-v4-card">
        <div className="customer-v4-section-heading"><div><small>PROFILE DETAILS</small><h2>Contact &amp; account</h2></div><button type="button" onClick={() => { setEditing((value) => !value); setSuccess(""); }} disabled={saving}>{editing ? "Cancel" : "Edit profile"}</button></div>
        {!editing ? (
          <div className="customer-v4-profile-grid">
            <ProfileValue label="Full name" value={profile.full_name}/><ProfileValue label="Phone" value={profile.phone}/><ProfileValue label="Email" value={profile.email}/><ProfileValue label="Home address" value={profile.home_address}/><ProfileValue label="Account type" value={profile.customer_type}/><ProfileValue label="Company" value={profile.customer_type === "business" ? profile.company_name : "Not applicable"}/><ProfileValue label="Joined" value={joined}/>
          </div>
        ) : (
          <form className="customer-v4-profile-form" onSubmit={save} aria-busy={saving}>
            <label>Full name<input name="fullName" defaultValue={profile.full_name || ""} required disabled={saving}/></label>
            <label>Phone<input name="phone" defaultValue={profile.phone || ""} placeholder="09xxxxxxxx or +2519xxxxxxxx" required disabled={saving}/></label>
            <label>Email<input name="email" type="email" defaultValue={profile.email || ""} disabled={saving}/></label>
            <label>Home address<input name="homeAddress" defaultValue={profile.home_address || ""} disabled={saving}/></label>
            <label>Account type<select value={customerType} onChange={(event) => setCustomerType(event.target.value as "individual" | "business")} disabled={saving}><option value="individual">Individual</option><option value="business">Business</option></select></label>
            {customerType === "business" && <label>Company<input name="companyName" defaultValue={profile.company_name || ""} required disabled={saving}/></label>}
            <button className="customer-v4-primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save profile"}</button>
          </form>
        )}
        {success && <p className="customer-v4-success" role="status">{success}</p>}
        {error && <p className="customer-v4-error" role="alert">{error}</p>}
      </section>

      <button type="button" className="customer-v4-secondary" onClick={() => void load(true)} disabled={loading || avatarBusy}>{loading ? "Refreshing…" : "Refresh profile"}</button>
      <button type="button" className="customer-v4-danger" onClick={() => void signOut()} disabled={signingOut}>{signingOut ? "Signing out…" : "Sign out"}</button>
    </main>
  );
}

function ProfileAvatar({ imageUrl, initials, name, compact = false, loading = false, onImageError }: { imageUrl: string | null; initials: string; name: string | null; compact?: boolean; loading?: boolean; onImageError: () => void }) {
  return <div className={`customer-v4-profile-avatar${compact ? " customer-v4-profile-avatar--small" : ""}`} aria-label={imageUrl ? "Customer profile photo" : "Customer avatar fallback"}>{imageUrl ? <img src={imageUrl} alt={`${name || "Customer"} profile`} onError={onImageError}/> : <strong>{loading ? "…" : initials}</strong>}</div>;
}

function ProfileValue({ label, value }: { label: string; value: string | null | undefined }) {
  return <div><small>{label}</small><strong>{value?.trim() || "—"}</strong></div>;
}
