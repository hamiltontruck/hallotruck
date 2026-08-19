import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  calculateTransportQuote,
  getQuotePricingRules,
  updateQuotePricingRule,
  type QuoteBreakdown,
  type QuotePricingRule,
} from "../services/quote-pricing.service";

export function AdminQuotePricing() {
  const [rules, setRules] = useState<QuotePricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [distanceKm, setDistanceKm] = useState("900");
  const [cargoTons, setCargoTons] = useState("45");
  const [vehicleKey, setVehicleKey] = useState("trailer");
  const [preview, setPreview] = useState<QuoteBreakdown | null>(null);
  const [previewing, setPreviewing] = useState(false);

  async function load() {
    try {
      const result = await getQuotePricingRules();
      setRules(result);
      if (result.length && !result.some((rule) => rule.vehicle_key === vehicleKey)) {
        setVehicleKey(result[0].vehicle_key);
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load quote pricing.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const selectedVehicle = useMemo(
    () => rules.find((rule) => rule.vehicle_key === vehicleKey),
    [rules, vehicleKey],
  );

  async function runPreview(event: FormEvent) {
    event.preventDefault();
    if (!selectedVehicle) return;
    setPreviewing(true);
    setError("");
    try {
      setPreview(await calculateTransportQuote(
        Number(distanceKm),
        selectedVehicle.vehicle_type,
        Number(cargoTons),
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not calculate quote.");
    } finally {
      setPreviewing(false);
    }
  }

  async function save(rule: QuotePricingRule) {
    setSaving(rule.vehicle_key);
    setError("");
    try {
      await updateQuotePricingRule(rule);
      await load();
      if (preview && selectedVehicle?.vehicle_key === rule.vehicle_key) {
        setPreview(await calculateTransportQuote(Number(distanceKm), rule.vehicle_type, Number(cargoTons)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update pricing.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f3ed] p-4 text-asphalt sm:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[10px] tracking-[.18em] text-amber-dim">ADMIN / LIVE QUOTE CONTROL</p>
            <h1 className="mt-2 font-display text-3xl font-bold">Ton-kilometre pricing</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-steel">
              Final transport cost is load tons × distance kilometres × ETB per ton-km. Base fee and fuel/market adjustment are then applied. HALLO commission stays fixed at 2% inside the final quote.
            </p>
          </div>
          <Link to="/admin" className="self-start border border-asphalt px-4 py-3 text-sm font-semibold">← Back to Control Center</Link>
        </div>

        {error && <p className="mb-5 border border-route/30 bg-route/10 p-3 text-sm text-route">{error}</p>}

        <section className="mb-6 border border-asphalt/10 bg-asphalt p-5 text-white sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr] lg:items-end">
            <div>
              <p className="font-mono text-[10px] tracking-[.18em] text-amber">FORMULA TEST</p>
              <h2 className="mt-2 font-display text-2xl font-semibold">Check the current live rate</h2>
              <p className="mt-2 text-sm text-white/55">Example: 45 tons × 900 km = 40,500 ton-km. At 22.222222 ETB per ton-km, the transport charge rounds to ETB 900,000.</p>
            </div>
            <form onSubmit={runPreview} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="text-[10px] uppercase tracking-wide text-white/55">Vehicle
                <select value={vehicleKey} onChange={(event) => setVehicleKey(event.target.value)} className="mt-2 block w-full bg-white px-3 py-3 text-sm text-asphalt">
                  {rules.map((rule) => <option key={rule.vehicle_key} value={rule.vehicle_key}>{rule.vehicle_type}</option>)}
                </select>
              </label>
              <NumberField label="Distance km" value={distanceKm} onChange={setDistanceKm} min="0.1" step="0.1" dark />
              <NumberField label="Load tons" value={cargoTons} onChange={setCargoTons} min="0.1" step="0.1" dark />
              <button disabled={previewing || !rules.length} className="self-end bg-amber px-4 py-3 text-sm font-bold text-asphalt disabled:opacity-40">{previewing ? "Calculating…" : "Calculate"}</button>
            </form>
          </div>

          {preview && (
            <div className="mt-5 border-t border-white/10 pt-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className={`px-2.5 py-1.5 text-[10px] font-semibold ${preview.pricing_formula === "ton_km" ? "bg-emerald-100 text-emerald-900" : "bg-amber text-asphalt"}`}>
                  {preview.pricing_formula === "ton_km" ? "TON-KM ACTIVE" : "LEGACY FALLBACK"}
                </span>
                {preview.pricing_formula === "legacy" && <span className="text-xs text-white/55">Save a ton-km rate for this vehicle to activate the new formula.</span>}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <PreviewValue label="Ton-km" value={preview.ton_kilometers.toLocaleString()} />
                <PreviewValue label="ETB / ton-km" value={preview.rate_per_ton_km.toLocaleString(undefined, { maximumFractionDigits: 6 })} />
                <PreviewValue label="ETB / ton" value={`ETB ${preview.route_rate_per_ton_etb.toLocaleString()}`} />
                <PreviewValue label="Transport" value={`ETB ${preview.transport_charge_etb.toLocaleString()}`} />
                <PreviewValue label="Fuel / market" value={`ETB ${preview.market_adjustment_etb.toLocaleString()}`} />
                <PreviewValue label="Final quote" value={`ETB ${preview.total_quote_etb.toLocaleString()}`} strong />
              </div>
              <div className="mt-3 text-xs text-white/50">HALLO 2%: ETB {preview.commission_etb.toLocaleString()} · Driver 98%: ETB {preview.driver_net_etb.toLocaleString()}.</div>
            </div>
          )}
        </section>

        <div className="mb-4 flex items-center justify-between gap-3">
          <div><h2 className="font-display text-xl font-semibold">Vehicle pricing rules</h2><p className="mt-1 text-xs text-steel">Changes apply only to new quotes. Existing orders keep their saved amount.</p></div>
          <span className="font-mono text-xs text-steel">{rules.length} vehicles</span>
        </div>

        {loading ? (
          <p className="border border-asphalt/10 bg-white p-10 text-center text-sm text-steel">Loading pricing…</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {rules.map((rule) => (
              <PricingRuleCard
                key={`${rule.vehicle_key}-${rule.updated_at}`}
                rule={rule}
                saving={saving === rule.vehicle_key}
                onSave={save}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function PricingRuleCard({ rule, saving, onSave }: {
  rule: QuotePricingRule;
  saving: boolean;
  onSave: (rule: QuotePricingRule) => Promise<void>;
}) {
  const [draft, setDraft] = useState(rule);
  const [referenceDistance, setReferenceDistance] = useState("900");
  const [targetPerTon, setTargetPerTon] = useState("20000");

  function setNumber(key: keyof Pick<QuotePricingRule, "rate_per_ton_km" | "base_fee_etb" | "minimum_fare_etb" | "market_adjustment_percent">, value: string) {
    setDraft((current) => ({ ...current, [key]: value === "" ? null : Number(value) }));
  }

  const convertedRate = Number(referenceDistance) > 0 && Number(targetPerTon) > 0
    ? Number(targetPerTon) / Number(referenceDistance)
    : 0;
  const active = Boolean(rule.rate_per_ton_km && rule.rate_per_ton_km > 0);
  const validDraft = Boolean(draft.rate_per_ton_km && draft.rate_per_ton_km > 0);

  return (
    <form onSubmit={(event) => { event.preventDefault(); void onSave(draft); }} className="border border-asphalt/10 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div><p className="font-display text-xl font-bold">{rule.vehicle_type}</p><p className="mt-1 text-xs text-steel">Updated {new Date(rule.updated_at).toLocaleString()}</p></div>
        <span className={`px-2.5 py-1.5 text-[10px] font-semibold ${active ? "bg-emerald-50 text-emerald-800" : "bg-amber/15 text-amber-dim"}`}>{active ? "TON-KM ACTIVE" : "SET TON-KM RATE"}</span>
      </div>

      <div className="mt-5">
        <NumberField label="ETB per ton-km" value={draft.rate_per_ton_km == null ? "" : String(draft.rate_per_ton_km)} onChange={(value) => setNumber("rate_per_ton_km", value)} min="0.000001" step="0.000001" />
        <p className="mt-2 text-[11px] text-steel">Core formula: load tons × distance km × this rate.</p>
      </div>

      <div className="mt-4 border border-asphalt/10 bg-[#f5f3ed] p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-steel">Convert ETB per ton to ton-km</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <NumberField label="Reference distance km" value={referenceDistance} onChange={setReferenceDistance} min="0.1" step="0.1" />
          <NumberField label="Target ETB per ton" value={targetPerTon} onChange={setTargetPerTon} min="0.01" step="0.01" />
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-steel">Calculated rate: <strong className="text-asphalt">{convertedRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ETB / ton-km</strong></p>
          <button type="button" disabled={!convertedRate} onClick={() => setDraft((current) => ({ ...current, rate_per_ton_km: Number(convertedRate.toFixed(6)) }))} className="border border-asphalt px-3 py-2 text-xs font-semibold disabled:opacity-40">Use calculated rate</button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <NumberField label="Base fee ETB" value={String(draft.base_fee_etb)} onChange={(value) => setNumber("base_fee_etb", value)} min="0" step="0.01" />
        <NumberField label="Minimum quote ETB" value={String(draft.minimum_fare_etb)} onChange={(value) => setNumber("minimum_fare_etb", value)} min="1" step="0.01" />
        <div className="col-span-2">
          <NumberField label="Fuel / market adjustment %" value={String(draft.market_adjustment_percent)} onChange={(value) => setNumber("market_adjustment_percent", value)} min="-50" max="300" step="0.1" />
          <p className="mt-2 text-[11px] text-steel">For the exact 45 tons × ETB 20,000 = ETB 900,000 example, use 900 km and ETB 20,000 in the converter, then set base fee and adjustment to zero.</p>
        </div>
      </div>
      <button disabled={saving || !validDraft} className="mt-5 w-full bg-asphalt px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{saving ? "Saving…" : `Save ${rule.vehicle_type} ton-km rate`}</button>
    </form>
  );
}

function NumberField({ label, value, onChange, min, max, step, dark = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  step?: string;
  dark?: boolean;
}) {
  return <label className={`text-[10px] uppercase tracking-wide ${dark ? "text-white/55" : "text-steel"}`}>{label}<input required type="number" inputMode="decimal" value={value} min={min} max={max} step={step} onChange={(event) => onChange(event.target.value)} className={`mt-2 block w-full border px-3 py-3 text-sm outline-none ${dark ? "border-white/10 bg-white text-asphalt" : "border-asphalt/15 bg-white text-asphalt focus:border-amber"}`} /></label>;
}

function PreviewValue({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={`p-3 ${strong ? "bg-amber text-asphalt" : "bg-white/5"}`}><p className={`text-[9px] uppercase tracking-wide ${strong ? "text-asphalt/60" : "text-white/45"}`}>{label}</p><p className="mt-2 font-display text-lg font-bold">{value}</p></div>;
}
