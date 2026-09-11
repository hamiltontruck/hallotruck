import { useEffect, useState, type FormEvent } from "react";
import { customerSupabase } from "./auth/customer-supabase";
import { loadCustomerMobileData, type CustomerMobileProfile } from "./customer-data.service";
import { updateCustomerMobileProfile } from "./customer-profile.service";

function customerInitials(name: string | null | undefined) {
  const parts = (name || "Customer").trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "CU";
}

export function CustomerProfileV4Page({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<CustomerMobileProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [customerType, setCustomerType] = useState<"individual" | "business">("individual");
  const [signingOut, setSigningOut] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await loadCustomerMobileData(userId);
      setProfile(data.profile);
      setCustomerType(data.profile?.customer_type === "business" ? "business" : "individual");
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Customer profile could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [userId]);

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
      await load();
      setEditing(false);
      setSuccess("Profile updated successfully.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Profile could not be saved.");
    } finally {
      setSaving(false);
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
    return <main className="customer-v4-page"><section className="customer-v4-card customer-v4-state"><strong>Customer profile not available</strong><span>{error || "customer_get_profile returned no Customer record."}</span><button type="button" onClick={() => void load()}>Retry</button></section></main>;
  }

  const joined = profile.created_at ? new Date(profile.created_at).toLocaleDateString() : "—";
  const initials = customerInitials(profile.full_name);

  return (
    <main className="customer-v4-page">
      <header className="customer-v4-page-header"><div><strong>HALLO<span>TRUCK</span></strong><small>CUSTOMER PROFILE</small></div><b>Verified Customer</b></header>
      <section className="customer-v4-profile-hero">
        <div className="customer-v4-profile-avatar" aria-label="Customer avatar fallback"><strong>{initials}</strong></div>
        <div><small>YOUR ACCOUNT</small><h1>{profile.full_name || "Customer"}</h1><p>{profile.customer_type === "business" ? profile.company_name || "Business account" : "Individual account"}</p></div>
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

      <section className="customer-v4-card customer-v4-photo-limit">
        <div className="customer-v4-profile-avatar customer-v4-profile-avatar--small"><strong>{initials}</strong></div>
        <div><strong>Profile photo</strong><p>Customer photo upload is not exposed by the current Customer profile RPC/storage contract. Initials are used safely instead of storing an image in an unrelated bucket.</p></div>
      </section>

      <button type="button" className="customer-v4-secondary" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh profile"}</button>
      <button type="button" className="customer-v4-danger" onClick={() => void signOut()} disabled={signingOut}>{signingOut ? "Signing out…" : "Sign out"}</button>
    </main>
  );
}

function ProfileValue({ label, value }: { label: string; value: string | null | undefined }) {
  return <div><small>{label}</small><strong>{value?.trim() || "—"}</strong></div>;
}
