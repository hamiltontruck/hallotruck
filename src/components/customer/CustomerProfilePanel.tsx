import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { CustomerProfile } from "../../services/customer.service";
import { updateCustomerProfile } from "../../services/customer-profile.service";
import { useLanguage } from "../../i18n/LanguageProvider";
import { getCustomerCopy } from "../../i18n/customerCopy";

interface Props {
  profile: CustomerProfile | null;
  onSaved: () => Promise<void> | void;
}

const CUSTOMER_LOCATION_REQUESTED_KEY = "hallotruck:customer-location-requested";
const CUSTOMER_LOCATION_KEY = "hallotruck:customer-location";

export function CustomerProfilePanel({ profile, onSaved }: Props) {
  const { language } = useLanguage();
  const c = getCustomerCopy(language);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [customerType, setCustomerType] = useState<"individual" | "business">(profile?.customer_type ?? "individual");

  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    if (window.sessionStorage.getItem(CUSTOMER_LOCATION_REQUESTED_KEY) === "1") return;
    window.sessionStorage.setItem(CUSTOMER_LOCATION_REQUESTED_KEY, "1");

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const location = {
          lng: coords.longitude,
          lat: coords.latitude,
          accuracyM: coords.accuracy,
          capturedAt: new Date().toISOString(),
        };
        window.sessionStorage.setItem(CUSTOMER_LOCATION_KEY, JSON.stringify(location));
        window.dispatchEvent(new CustomEvent("hallotruck:customer-location", { detail: location }));
      },
      () => {
        // Location is optional and never blocks customer self-service.
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5 * 60 * 1000,
        timeout: 12_000,
      },
    );
  }, []);

  useEffect(() => setCustomerType(profile?.customer_type ?? "individual"), [profile?.customer_type]);

  const completeness = useMemo(() => {
    if (!profile) return 0;
    const fields = [profile.full_name, profile.phone, profile.email, profile.home_address];
    if (profile.customer_type === "business") fields.push(profile.company_name);
    return Math.round((fields.filter(Boolean).length / fields.length) * 100);
  }, [profile]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await updateCustomerProfile({
        fullName: String(form.get("fullName") ?? ""),
        phone: String(form.get("phone") ?? ""),
        email: String(form.get("email") ?? ""),
        homeAddress: String(form.get("homeAddress") ?? ""),
        customerType,
        companyName: String(form.get("companyName") ?? ""),
      });
      setEditing(false);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : c.profileSaveError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="customer-profile-card">
      <div className="customer-profile-card__header">
        <div className="customer-profile-card__identity">
          <div className="customer-avatar" aria-hidden="true">{(profile?.full_name || "C").trim().charAt(0).toUpperCase()}</div>
          <div>
            <p className="customer-eyebrow">{c.profileLabel}</p>
            <h2>{profile?.full_name || c.completeProfile}</h2>
            <p>{c.profileDesc}</p>
          </div>
        </div>
        <button type="button" onClick={() => setEditing((value) => !value)} className="customer-profile-edit">
          {editing ? c.cancel : c.editProfile}
        </button>
      </div>

      <div className="customer-profile-values">
        <ProfileValue label={c.account} value={profile?.customer_type === "business" ? c.business : c.individual} />
        <ProfileValue label={c.phone} value={profile?.phone || c.missing} />
        <ProfileValue label={c.email} value={profile?.email || c.missing} />
        <ProfileValue label={c.address} value={profile?.home_address || c.missing} />
      </div>

      <div className="customer-profile-progress">
        <div><span>{c.profile}</span><strong>{completeness}% {c.complete}</strong></div>
        <div className="customer-profile-progress__track" aria-label={`${completeness}% ${c.complete}`}><span style={{ width: `${completeness}%` }} /></div>
      </div>

      {profile?.customer_type === "business" && profile.company_name && (
        <div className="customer-company-card"><span>{c.company}</span><strong>{profile.company_name}</strong></div>
      )}

      {editing && (
        <form onSubmit={save} className="customer-profile-form">
          {error && <p className="customer-profile-error">{error}</p>}
          <div className="customer-profile-form__grid">
            <ProfileField name="fullName" label={c.fullName} defaultValue={profile?.full_name ?? ""} required />
            <ProfileField name="phone" label={c.phone} defaultValue={profile?.phone ?? ""} placeholder="09xxxxxxxx or +2519xxxxxxxx" maxLength={13} required />
            <ProfileField name="email" label={c.email} type="email" defaultValue={profile?.email ?? ""} placeholder="name@example.com" />
            <ProfileField name="homeAddress" label={c.homeBusiness} defaultValue={profile?.home_address ?? ""} placeholder="City, sub-city / area" />
            <label className="customer-profile-field">{c.customerType}
              <select value={customerType} onChange={(event) => setCustomerType(event.target.value as "individual" | "business")}>
                <option value="individual">{c.individualCustomer}</option>
                <option value="business">{c.businessCompany}</option>
              </select>
            </label>
            {customerType === "business" && <ProfileField name="companyName" label={c.companyName} defaultValue={profile?.company_name ?? ""} required />}
          </div>
          <button disabled={saving} className="customer-profile-save">{saving ? c.saving : c.saveProfile}</button>
        </form>
      )}
    </section>
  );
}

function ProfileValue({ label, value }: { label: string; value: string }) {
  return <div className="customer-profile-value"><p>{label}</p><strong>{value}</strong></div>;
}

function ProfileField({ name, label, defaultValue, placeholder, type = "text", required = false, maxLength }: { name: string; label: string; defaultValue: string; placeholder?: string; type?: string; required?: boolean; maxLength?: number }) {
  return <label className="customer-profile-field">{label}<input name={name} type={type} required={required} maxLength={maxLength} defaultValue={defaultValue} placeholder={placeholder} /></label>;
}
