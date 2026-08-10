import { useEffect, useMemo, useState, type FormEvent } from "react";
import { updateCustomerProfile, type CustomerProfile } from "../../services/customer.service";

interface Props {
  profile: CustomerProfile | null;
  onSaved: () => Promise<void> | void;
}

export function CustomerProfilePanel({ profile, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [customerType, setCustomerType] = useState<"individual" | "business">(profile?.customer_type ?? "individual");

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
      setError(err instanceof Error ? err.message : "Profile could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-7 border border-asphalt/10 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-[.2em] text-emerald-700">CUSTOMER PROFILE</p>
          <h2 className="mt-2 font-display text-xl font-bold">{profile?.full_name || "Complete your profile"}</h2>
          <p className="mt-1 text-xs text-steel">Professional contact details used for orders, invoices and dispatch communication.</p>
        </div>
        <button type="button" onClick={() => setEditing((value) => !value)} className="border border-asphalt px-4 py-2.5 text-xs font-semibold">
          {editing ? "Cancel" : "Edit profile"}
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <ProfileValue label="Account" value={profile?.customer_type === "business" ? "Business" : "Individual"} />
        <ProfileValue label="Phone" value={profile?.phone || "Missing"} />
        <ProfileValue label="Email" value={profile?.email || "Missing"} />
        <ProfileValue label="Address" value={profile?.home_address || "Missing"} />
        <ProfileValue label="Profile" value={`${completeness}% complete`} />
      </div>

      {profile?.customer_type === "business" && profile.company_name && (
        <div className="mt-3 border-l-4 border-emerald-700 bg-emerald-50 px-4 py-3 text-sm">
          <span className="text-steel">Company</span><strong className="ml-2">{profile.company_name}</strong>
        </div>
      )}

      {editing && (
        <form onSubmit={save} className="mt-6 border-t border-asphalt/10 pt-5">
          {error && <p className="mb-4 border border-route/30 bg-route/5 p-3 text-sm text-route">{error}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <ProfileField name="fullName" label="Full name" defaultValue={profile?.full_name ?? ""} required />
            <ProfileField name="phone" label="Phone" defaultValue={profile?.phone ?? ""} placeholder="09xxxxxxxx or +2519xxxxxxxx" maxLength={13} required />
            <ProfileField name="email" label="Email" type="email" defaultValue={profile?.email ?? ""} placeholder="name@example.com" />
            <ProfileField name="homeAddress" label="Home / business address" defaultValue={profile?.home_address ?? ""} placeholder="City, sub-city / area" />
            <label className="text-sm">Customer type
              <select value={customerType} onChange={(event) => setCustomerType(event.target.value as "individual" | "business")} className="mt-2 block w-full border border-line bg-white px-4 py-3">
                <option value="individual">Individual customer</option>
                <option value="business">Business / company</option>
              </select>
            </label>
            {customerType === "business" && <ProfileField name="companyName" label="Company name" defaultValue={profile?.company_name ?? ""} required />}
          </div>
          <button disabled={saving} className="mt-5 bg-emerald-700 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save profile"}</button>
        </form>
      )}
    </section>
  );
}

function ProfileValue({ label, value }: { label: string; value: string }) {
  return <div className="bg-bone p-3"><p className="text-[10px] uppercase tracking-wider text-steel">{label}</p><p className="mt-1 break-words text-sm font-semibold">{value}</p></div>;
}

function ProfileField({ name, label, defaultValue, placeholder, type = "text", required = false, maxLength }: { name: string; label: string; defaultValue: string; placeholder?: string; type?: string; required?: boolean; maxLength?: number }) {
  return <label className="text-sm">{label}<input name={name} type={type} required={required} maxLength={maxLength} defaultValue={defaultValue} placeholder={placeholder} className="mt-2 block w-full border border-line px-4 py-3" /></label>;
}
