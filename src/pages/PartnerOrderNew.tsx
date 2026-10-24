import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getCurrentPartnerMemberships } from "../services/partner.service";
import { savePartnerOrderDraft, type PartnerOrderPayload } from "../services/partner-order.service";
import { PartnerRoadDistance, type PartnerRoadSelection } from "../components/partner/PartnerRoadDistance";
import { PartnerSmartOrderV2 } from "./PartnerSmartOrderV2";

const field = (form: FormData, name: string) => String(form.get(name)??"").trim();
function Input({ name, label, type = "text", required = true }: { name: string; label: string; type?: string; required?: boolean }) {
  return <label className="block min-w-0 text-xs font-semibold">{label}<input name={name} type={type} required={required} step={type === "number" ? (name === "quantity" ? "1" : "any") : undefined} className="mt-1 block min-h-11 w-full min-w-0 max-w-full appearance-none rounded-lg border border-asphalt/15 bg-white px-3 text-base font-normal outline-none focus:border-amber" /></label>;
}

export function PartnerOrderNew() {
  return import.meta.env.VITE_PARTNER_SMART_ORDER_V2 === "true" ? <PartnerSmartOrderV2 /> : <PartnerOrderLegacy />;
}

function PartnerOrderLegacy() {
  const [step, setStep] = useState(0);
  const [summary, setSummary] = useState<FormData | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const steps = ["Route", "Cargo & truck", "Schedule & contacts", "Review"];
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current !== step) headingRef.current?.focus();
    previousStep.current = step;
  }, [step]);
  function validate(panel: HTMLElement) {
    const invalid = Array.from(panel.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input,select,textarea")).find(input => !input.checkValidity());
    if (!invalid) return true;
    let parent = invalid.parentElement;
    while (parent && parent !== panel) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement; }
    invalid.reportValidity(); invalid.focus();
    return false;
  }
  function next() {
    const form = formRef.current;
    if (!form || !allowed || !road || !validate(form.querySelector<HTMLElement>(`[data-step="${step}"]`)!)) return;
    setError(""); setSummary(new FormData(form)); setStep(value => Math.min(3, value + 1));
  }
  const [road,setRoad]=useState<PartnerRoadSelection|null>(null);
  const [params] = useSearchParams(); const navigate=useNavigate();
  const [partnerId,setPartnerId]=useState(""); const [allowed,setAllowed]=useState(false); const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  useEffect(()=>{void (async()=>{const memberships=await getCurrentPartnerMemberships();const requested=params.get("organization");const membership=memberships.find((item)=>item.partner_id===requested)??memberships[0];setPartnerId(membership?.partner_id??"");setAllowed(["owner","admin"].includes(membership?.member_role??""));})().catch((reason)=>setError(reason instanceof Error?reason.message:"Partner access could not be verified."));},[]); // eslint-disable-line react-hooks/exhaustive-deps
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();if(step < 3){next();return;}if(!partnerId||!allowed||busy)return;
    const formElement = event.currentTarget;
    for (let index = 0; index < 4; index++) {
      const panel = formElement.querySelector<HTMLElement>(`[data-step="${index}"]`)!;
      const invalid = Array.from(panel.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input,select,textarea")).some(input => !input.checkValidity());
      if (invalid) { setStep(index); window.setTimeout(() => validate(panel), 0); return; }
    }
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      if (!road) throw new Error("Choose pickup and destination and wait for the road route before saving.");
      const payload: PartnerOrderPayload = {
        pickup_location: {
          country: field(form, "pickupCountry"), region: field(form, "pickupRegion"),
          city: field(form, "pickupCity"), address: field(form, "pickupAddress"),
          longitude: road.pickup.coordinates[0], latitude: road.pickup.coordinates[1],
        },
        dropoff_location: {
          country: field(form, "dropoffCountry"), region: field(form, "dropoffRegion"),
          city: field(form, "dropoffCity"), address: field(form, "dropoffAddress"),
          longitude: road.dropoff.coordinates[0], latitude: road.dropoff.coordinates[1],
        },
        cargo: {
          category: field(form, "cargoCategory"), description: field(form, "cargoDescription"),
          weight_tons: Number(field(form, "weight")), quantity: Number(field(form, "quantity")),
          fragile: form.has("fragile"), hazardous: form.has("hazardous"), temperature_controlled: form.has("temperature"),
        },
        vehicle_requirements: {
          truck_type: field(form, "truckType"), required_capacity_tons: Number(field(form, "capacity")),
          body_type: field(form, "bodyType"), refrigeration_required: form.has("refrigeration"),
        },
        schedule: {
          pickup_date: field(form, "pickupDate"), pickup_time: field(form, "pickupTime"),
          delivery_deadline: field(form, "deadline"), priority: field(form, "priority"),
        },
        pickup_contact: { name: field(form, "pickupName"), phone: field(form, "pickupPhone"), email: field(form, "pickupEmail") },
        delivery_contact: { name: field(form, "deliveryName"), phone: field(form, "deliveryPhone"), email: field(form, "deliveryEmail") },
        pricing: { state: "pending_calculation" },
        payment: { method: field(form, "paymentMethod"), status: "unpaid" },
        partner_notes: field(form, "notes"),
        route: { provider: road.route.provider, profile: road.route.profile, distance_km: road.route.distanceKm, duration_minutes: road.route.durationMinutes },
      };
      const order = await savePartnerOrderDraft(partnerId, payload);
      navigate(`/partner/orders/${order.id}?organization=${encodeURIComponent(partnerId)}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Partner order draft could not be saved.");
    } finally { setBusy(false); }
  }

  const back = partnerId ? `/partner/orders?organization=${encodeURIComponent(partnerId)}` : "/partner/orders";
  return <main className="partner-mobile-touch-safe min-h-screen overflow-x-hidden bg-[#f5f3ed] text-asphalt">
    <header className="bg-asphalt px-4 py-4 text-white sm:px-7"><div className="mx-auto max-w-3xl">
      <Link to={back} className="inline-flex min-h-11 items-center text-sm text-white/70">← Orders</Link>
      <h1 className="font-display text-2xl font-bold">New Partner order</h1>
      <p className="mt-1 text-sm text-white/60">Save a draft, then send it to HALLO for review.</p>
    </div></header>
    <form ref={formRef} noValidate onSubmit={submit} className="mx-auto max-w-3xl space-y-4 px-4 py-4 sm:px-7">
      <ol aria-label="Order steps" className="grid grid-cols-4 gap-2">{steps.map((title,index) => <li key={title} aria-current={index === step ? "step" : undefined} className={`min-w-0 border-t-4 pt-2 text-[11px] font-semibold ${index <= step ? "border-amber text-asphalt" : "border-asphalt/10 text-steel"}`}><span className="block">{index < step ? "✓" : index + 1}</span>{title}</li>)}</ol>
      <h2 ref={headingRef} tabIndex={-1} className="font-display text-xl font-bold outline-none">{step === 3 ? "Review order" : steps[step]}</h2>
      {error && <p role="alert" className="border border-route/30 bg-route/5 p-3 text-sm text-route">{error}</p>}
      {!allowed && partnerId && <p className="bg-white p-3 text-sm">Only Partner owners and admins can create orders.</p>}
      <div data-step="0" hidden={step !== 0} className="space-y-4">
        <PartnerRoadDistance onChange={setRoad}/>
        <Section title="Pickup location"><Input name="pickupCountry" label="Country"/><Input name="pickupRegion" label="Region / state"/><Input name="pickupCity" label="City"/><Input name="pickupAddress" label="Detailed address"/></Section>
        <Section title="Drop-off location"><Input name="dropoffCountry" label="Country"/><Input name="dropoffRegion" label="Region / state"/><Input name="dropoffCity" label="City"/><Input name="dropoffAddress" label="Detailed address"/></Section>
      </div>
      <div data-step="1" hidden={step !== 1} className="space-y-4">
        <Section title="Cargo and vehicle">
          <Input name="cargoCategory" label="Cargo category"/><Input name="cargoDescription" label="Cargo description"/>
          <Input name="weight" label="Weight (tons)" type="number"/><Input name="quantity" label="Quantity" type="number"/>
          <Input name="truckType" label="Truck type"/><Input name="capacity" label="Required capacity (tons)" type="number"/>
          <details className="col-span-2 min-w-0 border-t border-asphalt/10 pt-2"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">Additional cargo & truck options</summary><div className="grid gap-3 pt-2"><Input name="bodyType" label="Trailer / body type" required={false}/><Check name="fragile" label="Fragile"/><Check name="hazardous" label="Hazardous"/><Check name="temperature" label="Temperature controlled"/><Check name="refrigeration" label="Refrigeration required"/></div></details>
        </Section>
      </div>
      <div data-step="2" hidden={step !== 2} className="space-y-4">
        <Section title="Schedule & contacts">
          <div className="col-span-2 min-w-0"><Input name="pickupDate" label="Requested pickup date" type="date"/></div>
          <Input name="pickupName" label="Pickup contact name"/><Input name="pickupPhone" label="Pickup phone" type="tel"/>
          <Input name="deliveryName" label="Delivery contact name"/><Input name="deliveryPhone" label="Delivery phone" type="tel"/>
          <details className="col-span-2 min-w-0 border-t border-asphalt/10 pt-2"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">More schedule & contact options</summary><div className="grid min-w-0 gap-3 pt-2 sm:grid-cols-2">
            <Input name="pickupTime" label="Requested pickup time" type="time" required={false}/><Input name="deadline" label="Delivery deadline" type="datetime-local" required={false}/>
            <Input name="pickupEmail" label="Pickup email" type="email" required={false}/><Input name="deliveryEmail" label="Delivery email" type="email" required={false}/>
            <label className="min-w-0 text-xs font-semibold">Priority<select aria-label="Priority" name="priority" className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-asphalt/15 bg-white px-3 text-base font-normal"><option>standard</option><option>urgent</option><option>critical</option></select></label>
          </div></details>
        </Section>
      </div>
      <div data-step="3" hidden={step !== 3} className="space-y-4">
        {summary && <dl aria-label="Order summary" className="space-y-3 rounded-xl border border-asphalt/10 bg-white p-4 text-sm">
          <Summary title="Route">{field(summary,"pickupCity")} → {field(summary,"dropoffCity")}<span className="block text-steel">{field(summary,"pickupAddress")} → {field(summary,"dropoffAddress")}</span><span className="block text-steel">{road?.route.distanceKm.toFixed(1)} km · {Math.ceil(road?.route.durationMinutes ?? 0)} min</span></Summary>
          <Summary title="Cargo & truck">{field(summary,"cargoDescription")} · {field(summary,"weight")} tons<span className="block text-steel">{field(summary,"truckType")} · {field(summary,"capacity")} tons capacity · {field(summary,"quantity")} units</span><span className="block text-steel">{[summary.has("fragile") && "Fragile", summary.has("hazardous") && "Hazardous", summary.has("temperature") && "Temperature controlled", summary.has("refrigeration") && "Refrigerated"].filter(Boolean).join(" · ")}</span></Summary>
          <Summary title="Pickup date">{field(summary,"pickupDate")} {field(summary,"pickupTime")}</Summary>
          <Summary title="Contacts"><span className="block">Pickup: {field(summary,"pickupName")} · {field(summary,"pickupPhone")}</span><span className="block">Delivery: {field(summary,"deliveryName")} · {field(summary,"deliveryPhone")}</span></Summary>
        </dl>}
        <Section title="Payment and notes">
          <label className="col-span-2 min-w-0 text-xs font-semibold">Payment method<select aria-label="Payment method" name="paymentMethod" className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-asphalt/15 bg-white px-3 text-base font-normal"><option value="invoice">Invoice</option><option value="bank">Bank transfer</option><option value="telebirr">Telebirr</option></select></label>
          <details className="col-span-2 min-w-0"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">Add Partner notes</summary><label className="block text-xs font-semibold">Partner notes<textarea name="notes" maxLength={4000} className="mt-1 min-h-24 w-full min-w-0 rounded-lg border border-asphalt/15 p-3 text-base font-normal"/></label></details>
        </Section>
        <p className="text-xs leading-5 text-steel">This saves a draft only. HALLO reviews the price after you submit the order.</p>
      </div>
      <div className="sticky bottom-0 flex gap-3 border-t border-asphalt/10 bg-[#f5f3ed] py-3">
        {step > 0 && <button type="button" disabled={busy} onClick={() => { setError(""); setStep(value => value - 1); }} className="min-h-12 rounded-lg border border-asphalt/20 bg-white px-5 text-sm font-semibold disabled:opacity-40">Back</button>}
        {step < 3 ? <button key="next" type="button" onClick={next} disabled={!allowed || !road} className="min-h-12 flex-1 rounded-lg bg-asphalt px-5 font-bold text-white disabled:opacity-40">Next</button> : <button key="save" type="submit" disabled={busy || !allowed || !road} className="min-h-12 flex-1 rounded-lg bg-asphalt px-5 font-bold text-white disabled:opacity-40">{busy ? "Saving secure draft…" : "Save draft"}</button>}
      </div>
    </form>
  </main>;
}
function Section({title,children}:{title:string;children:React.ReactNode}){return <fieldset className="grid min-w-0 grid-cols-2 gap-3 rounded-xl border border-asphalt/10 bg-white p-3 sm:grid-cols-2 sm:p-4"><legend className="px-1 font-display text-base font-bold">{title}</legend>{children}</fieldset>}
function Check({name,label}:{name:string;label:string}){return <label className="flex min-h-11 items-center gap-3 rounded-lg border border-asphalt/10 px-3 text-sm"><input name={name} type="checkbox"/>{label}</label>}
function Summary({title,children}:{title:string;children:React.ReactNode}){return <div className="min-w-0 break-words"><dt className="text-xs font-semibold text-steel">{title}</dt><dd className="mt-1">{children}</dd></div>}
