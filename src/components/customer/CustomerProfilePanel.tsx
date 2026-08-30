import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { CustomerProfile } from "../../services/customer.service";
import { updateCustomerProfile } from "../../services/customer-profile.service";
import { useLanguage, type HalloLanguage } from "../../i18n/LanguageProvider";
import { getCustomerCopy } from "../../i18n/customerCopy";

interface Props {
  profile: CustomerProfile | null;
  onSaved: () => Promise<void> | void;
  saveProfile?: typeof updateCustomerProfile;
}

const profileBusyCopy: Record<HalloLanguage, string> = {
  en: "Saving your customer profile. Editing and closing are temporarily locked until the update finishes.",
  om: "Piroofaayila maamilaa kee olkaa'aa jira. Hanga haaromsi xumuramutti gulaaluu fi cufuun yeroo gabaabaaf dhoorkameera.",
  am: "የደንበኛ መገለጫዎን በማስቀመጥ ላይ ነው። ማዘመኑ እስኪጠናቀቅ ድረስ ማርትዕና መዝጋት ለጊዜው ተቆልፏል።",
};

export function CustomerProfilePanel({ profile, onSaved, saveProfile = updateCustomerProfile }: Props) {
  const { language } = useLanguage();
  const c = getCustomerCopy(language);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [customerType, setCustomerType] = useState<"individual" | "business">(profile?.customer_type ?? "individual");
  const busyGuidanceId = "customer-profile-save-guidance";
  const busyMessage = profileBusyCopy[language];

  useEffect(() => setCustomerType(profile?.customer_type ?? "individual"), [profile?.customer_type]);

  const completeness = useMemo(() => {
    if (!profile) return 0;
    const fields = [profile.full_name, profile.phone, profile.email, profile.home_address];
    if (profile.customer_type === "business") fields.push(profile.company_name);
    return Math.round((fields.filter(Boolean).length / fields.length) * 100);
  }, [profile]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await saveProfile({
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
    <section className="customer-profile-card" aria-busy={saving} aria-describedby={saving ? busyGuidanceId : undefined}>
      <div className="customer-profile-card__header">
        <div className="customer-profile-card__identity">
          <div className="customer-avatar" aria-hidden="true">{(profile?.full_name || "C").trim().charAt(0).toUpperCase()}</div>
          <div>
            <p className="customer-eyebrow">{c.profileLabel}</p>
            <h2>{profile?.full_name || c.completeProfile}</h2>
            <p>{c.profileDesc}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditing((value) => !value)}
          disabled={saving}
          aria-describedby={saving ? busyGuidanceId : undefined}
          title={saving ? busyMessage : editing ? c.cancel : c.editProfile}
          className="customer-profile-edit disabled:cursor-not-allowed disabled:opacity-50"
        >
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
        <form onSubmit={save} className="customer-profile-form" aria-busy={saving} aria-describedby={saving ? busyGuidanceId : undefined}>
          {saving && (
            <p id={busyGuidanceId} role="status" aria-live="polite" className="rounded-xl border border-sky-700/25 bg-sky-50 px-4 py-3 text-xs font-semibold text-sky-900">
              {busyMessage}
            </p>
          )}
          {error && <p role="alert" className="customer-profile-error">{error}</p>}
          <div className="customer-profile-form__grid">
            <ProfileField name="fullName" label={c.fullName} defaultValue={profile?.full_name ?? ""} required disabled={saving} />
            <ProfileField name="phone" label={c.phone} defaultValue={profile?.phone ?? ""} placeholder="09xxxxxxxx or +2519xxxxxxxx" maxLength={13} required disabled={saving} />
            <ProfileField name="email" label={c.email} type="email" defaultValue={profile?.email ?? ""} placeholder="name@example.com" disabled={saving} />
            <ProfileField name="homeAddress" label={c.homeBusiness} defaultValue={profile?.home_address ?? ""} placeholder="City, sub-city / area" disabled={saving} />
            <label className="customer-profile-field">{c.customerType}
              <select value={customerType} onChange={(event) => setCustomerType(event.target.value as "individual" | "business")} disabled={saving}>
                <option value="individual">{c.individualCustomer}</option>
                <option value="business">{c.businessCompany}</option>
              </select>
            </label>
            {customerType === "business" && <ProfileField name="companyName" label={c.companyName} defaultValue={profile?.company_name ?? ""} required disabled={saving} />}
          </div>
          <button
            type="submit"
            disabled={saving}
            aria-describedby={saving ? busyGuidanceId : undefined}
            title={saving ? busyMessage : c.saveProfile}
            className="customer-profile-save disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? c.saving : c.saveProfile}
          </button>
        </form>
      )}
    </section>
  );
}

function ProfileValue({ label, value }: { label: string; value: string }) {
  return <div className="customer-profile-value"><p>{label}</p><strong>{value}</strong></div>;
}

function ProfileField({ name, label, defaultValue, placeholder, type = "text", required = false, maxLength, disabled = false }: { name: string; label: string; defaultValue: string; placeholder?: string; type?: string; required?: boolean; maxLength?: number; disabled?: boolean }) {
  return <label className="customer-profile-field">{label}<input name={name} type={type} required={required} maxLength={maxLength} defaultValue={defaultValue} placeholder={placeholder} disabled={disabled} /></label>;
}
