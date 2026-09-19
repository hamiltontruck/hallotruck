import { useEffect, useMemo, useRef, useState } from "react";
import { cargoToTons, type CargoUnit } from "../../../src/domain/cargo-load";
import { CustomerBookingMap } from "./CustomerBookingMap";
import {
  CUSTOMER_CARGO_CATEGORIES,
  CUSTOMER_PACKAGING_TYPES,
  customerCargoCopy,
  validateCustomerCargoDetails,
  type CustomerCargoCategory,
  type CustomerPackagingType,
} from "./customer-cargo-contract";
import {
  loadCustomerQuotePreview,
  type CustomerPlaceOption,
  type CustomerQuotePreview,
  type CustomerRoutePreview,
} from "./customer-quote.service";
import {
  createCustomerMobileOrder,
  type CreatedCustomerOrder,
  type CustomerPaymentMethod,
} from "./customer-order.service-v2";
import { CUSTOMER_TRUCKS, customerTruckByKey, type CustomerTruckOption } from "./customer-vehicle-catalog";
import { useCustomerLanguage } from "./customer-language";
import { getCustomerFinalCopy } from "./customer-final-copy";

type BookingStep = "route" | "cargo" | "truck" | "quote" | "review" | "success";
const STEPS: Exclude<BookingStep, "success">[] = ["route", "cargo", "truck", "quote", "review"];

function formatEtb(amount: number) {
  return `ETB ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount)}`;
}

function TruckImage({ truck }: { truck: CustomerTruckOption }) {
  const [failed, setFailed] = useState(!truck.image);
  return (
    <div className="customer-final-truck-image">
      {!failed && truck.image ? <img src={truck.image} alt={truck.imageAlt} loading="lazy" onError={() => setFailed(true)} /> : <span aria-hidden="true">🚚</span>}
    </div>
  );
}

export function CustomerBookingJourney({
  userId,
  pickup,
  dropoff,
  pickupPlace,
  dropoffPlace,
  selectedTruck,
  routePreview,
  routeLoading,
  routeError,
  onPickupChange,
  onDropoffChange,
  onPickupSelect,
  onDropoffSelect,
  onSwap,
  onReset,
  onTruckChange,
  onClose,
  onCreated,
  onViewOrder,
}: {
  userId: string;
  pickup: string;
  dropoff: string;
  pickupPlace: CustomerPlaceOption | null;
  dropoffPlace: CustomerPlaceOption | null;
  selectedTruck: string;
  routePreview: CustomerRoutePreview | null;
  routeLoading: boolean;
  routeError: string;
  onPickupChange: (value: string) => void;
  onDropoffChange: (value: string) => void;
  onPickupSelect: (place: CustomerPlaceOption) => void;
  onDropoffSelect: (place: CustomerPlaceOption) => void;
  onSwap: () => void;
  onReset: () => void;
  onTruckChange: (truckKey: string) => void;
  onClose: () => void;
  onCreated: (order: CreatedCustomerOrder) => void;
  onViewOrder: (orderId: string) => void;
}) {
  const { language } = useCustomerLanguage();
  const c = getCustomerFinalCopy(language);
  const cargoCopy = customerCargoCopy[language];
  const [step, setStep] = useState<BookingStep>("route");
  const [cargoCategory, setCargoCategory] = useState<CustomerCargoCategory>("general_goods");
  const [packagingType, setPackagingType] = useState<CustomerPackagingType>("loose_bulk");
  const [cargoQuantity, setCargoQuantity] = useState("");
  const [cargoUnit, setCargoUnit] = useState<CargoUnit>("ton");
  const [cargoNotes, setCargoNotes] = useState("");
  const [specialRequirements, setSpecialRequirements] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<CustomerPaymentMethod>("cash");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [quote, setQuote] = useState<CustomerQuotePreview | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<CreatedCustomerOrder | null>(null);
  const submitLock = useRef(false);

  const truck = customerTruckByKey(selectedTruck);
  const rawAmount = Number(cargoQuantity);
  const cargoTons = Number.isFinite(rawAmount) && rawAmount > 0 ? cargoToTons(rawAmount, cargoUnit) : 0;
  const routeReady = Boolean(pickupPlace && dropoffPlace && routePreview && routePreview.distance_km > 0 && !routeLoading && !routeError);
  const cargoDetailsError = validateCustomerCargoDetails({ packagingType, vehicleType: truck.label });
  const cargoReady = Boolean(cargoCategory && packagingType && cargoTons > 0 && !cargoDetailsError);
  const truckReady = cargoReady && cargoTons <= truck.capacityTons;
  const quoteReady = Boolean(quote && quote.total_quote_etb > 0 && !quoteLoading && !quoteError);
  const note = [cargoNotes.trim(), specialRequirements.trim()].filter(Boolean).join(" · ");
  const activeIndex = step === "success" ? STEPS.length : STEPS.indexOf(step);

  useEffect(() => {
    setQuote(null);
    setQuoteError("");
    setSubmitError("");
  }, [pickupPlace, dropoffPlace, selectedTruck, cargoCategory, packagingType, cargoQuantity, cargoUnit]);

  useEffect(() => {
    if ((packagingType === "container_20ft" || packagingType === "container_40ft") && selectedTruck !== "trailer") {
      onTruckChange("trailer");
    }
  }, [onTruckChange, packagingType, selectedTruck]);

  const routeDuration = useMemo(() => {
    if (!routePreview) return "—";
    const hours = Math.floor(routePreview.duration_minutes / 60);
    const minutes = Math.round(routePreview.duration_minutes % 60);
    return `${hours ? `${hours}h ` : ""}${minutes}m`;
  }, [routePreview]);

  async function calculateQuote() {
    if (!routeReady || !pickupPlace || !dropoffPlace || !truckReady) return null;
    setQuoteLoading(true);
    setQuoteError("");
    try {
      const result = await loadCustomerQuotePreview(userId, {
        pickupQuery: pickup,
        dropoffQuery: dropoff,
        pickupPlace,
        dropoffPlace,
        vehicleType: truck.label,
        cargoTons,
      });
      setQuote(result);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Quote could not be calculated.";
      setQuoteError(message);
      setQuote(null);
      return null;
    } finally {
      setQuoteLoading(false);
    }
  }

  async function goToQuote() {
    if (!truckReady) return;
    setStep("quote");
    await calculateQuote();
  }

  async function confirm() {
    if (!termsAccepted || !quoteReady || !quote || !routePreview || !pickupPlace || !dropoffPlace || submitting || submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    setSubmitError("");
    try {
      const fresh = await loadCustomerQuotePreview(userId, {
        pickupQuery: pickup,
        dropoffQuery: dropoff,
        pickupPlace,
        dropoffPlace,
        vehicleType: truck.label,
        cargoTons,
      });
      if (Math.abs(fresh.total_quote_etb - quote.total_quote_etb) > 0.01) {
        setQuote(fresh);
        setStep("quote");
        throw new Error(c.quoteChanged);
      }
      const order = await createCustomerMobileOrder({
        userId,
        pickupAddress: routePreview.pickup_label,
        dropoffAddress: routePreview.dropoff_label,
        vehicleType: truck.label,
        distanceKm: routePreview.distance_km,
        pickup: routePreview.pickup,
        dropoff: routePreview.dropoff,
        cargoQuantity: rawAmount,
        cargoUnit,
        cargoCategory,
        packagingType,
        cargoNotes: note,
        paymentMethod,
        expectedQuoteEtb: fresh.total_quote_etb,
      });
      setCreatedOrder(order);
      setStep("success");
      onCreated(order);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Order could not be created.");
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  function restart() {
    setCreatedOrder(null);
    setStep("route");
    setCargoQuantity("");
    setCargoNotes("");
    setSpecialRequirements("");
    setQuote(null);
    setTermsAccepted(false);
    setSubmitError("");
    onReset();
  }

  if (step === "success" && createdOrder) {
    return (
      <section className="customer-final-booking-shell">
        <main className="customer-final-success">
          <button type="button" className="customer-final-back" onClick={onClose} aria-label={c.close}>‹</button>
          <div className="customer-final-success-check" aria-hidden="true">✓</div>
          <h1>{c.bookingConfirmed}</h1>
          <p>{c.orderCreated}</p>
          <section className="customer-final-summary-card">
            <div><small>{c.orderNumber}</small><strong>{createdOrder.trackingId}</strong></div>
            <div><small>{c.route}</small><strong>{createdOrder.pickupAddress} → {createdOrder.dropoffAddress}</strong></div>
            <div><small>{c.truck}</small><strong>{createdOrder.vehicleType}</strong></div>
            <div><small>{c.totalAmount}</small><strong>{formatEtb(createdOrder.priceEtb)}</strong></div>
          </section>
          <button type="button" className="customer-final-primary" onClick={() => onViewOrder(createdOrder.id)}>{c.viewOrder}</button>
          <button type="button" className="customer-final-secondary" onClick={restart}>{c.createAnother}</button>
        </main>
      </section>
    );
  }

  return (
    <section className="customer-final-booking-shell" aria-label={c.routeTitle}>
      <header className="customer-final-booking-header">
        <button type="button" className="customer-final-back" onClick={step === "route" ? onClose : () => setStep(STEPS[Math.max(0, activeIndex - 1)])} aria-label={c.back}>‹</button>
        <h1>{step === "cargo" ? c.cargoTitle : step === "truck" ? c.chooseTruck : step === "quote" ? c.yourQuote : step === "review" ? c.reviewBooking : c.routeTitle}</h1>
        <span aria-hidden="true" />
      </header>
      <div className="customer-final-stepper" aria-label="Booking progress">
        {STEPS.map((item, index) => <div key={item} className={index === activeIndex ? "active" : index < activeIndex ? "done" : ""}><span>{index < activeIndex ? "✓" : index + 1}</span><small>{c[item]}</small></div>)}
      </div>

      {step === "route" && (
        <div className="customer-final-route-step">
          <CustomerBookingMap
            pickup={pickup}
            dropoff={dropoff}
            pickupPlace={pickupPlace}
            dropoffPlace={dropoffPlace}
            routePreview={routePreview}
            routeLoading={routeLoading}
            routeError={routeError}
            vehicleType={truck.label}
            onPickupChange={onPickupChange}
            onDropoffChange={onDropoffChange}
            onPickupSelect={onPickupSelect}
            onDropoffSelect={onDropoffSelect}
            onSwap={onSwap}
            onReset={onReset}
            onBook={() => { if (routeReady) setStep("cargo"); }}
          />
        </div>
      )}

      {step === "cargo" && (
        <main className="customer-final-step-body">
          <p className="customer-final-step-help">{c.stepCargoHelp}</p>
          <label className="customer-final-select-row"><span><b>{c.cargoType}</b><small>{cargoCopy.categories[cargoCategory]}</small></span><select value={cargoCategory} onChange={(event) => setCargoCategory(event.target.value as CustomerCargoCategory)}>{CUSTOMER_CARGO_CATEGORIES.map((value) => <option value={value} key={value}>{cargoCopy.categories[value]}</option>)}</select></label>
          <div className="customer-final-weight-row">
            <label><span>{c.totalWeight}</span><input type="number" min="0.1" step="0.1" inputMode="decimal" value={cargoQuantity} onChange={(event) => setCargoQuantity(event.target.value)} placeholder="0.0" /></label>
            <label><span>Unit</span><select value={cargoUnit} onChange={(event) => setCargoUnit(event.target.value as CargoUnit)}><option value="ton">Ton</option><option value="quintal">Quintal</option></select></label>
          </div>
          <label className="customer-final-select-row"><span><b>{c.packagingType}</b><small>{cargoCopy.packagingTypes[packagingType]}</small></span><select value={packagingType} onChange={(event) => setPackagingType(event.target.value as CustomerPackagingType)}>{CUSTOMER_PACKAGING_TYPES.map((value) => <option value={value} key={value}>{cargoCopy.packagingTypes[value]}</option>)}</select></label>
          <label className="customer-final-field"><span>{c.loadDescription}</span><textarea rows={3} maxLength={300} value={cargoNotes} onChange={(event) => setCargoNotes(event.target.value)} placeholder={c.loadPlaceholder} /></label>
          <label className="customer-final-field"><span>{c.specialRequirements}</span><textarea rows={3} maxLength={200} value={specialRequirements} onChange={(event) => setSpecialRequirements(event.target.value)} placeholder={c.requirementsPlaceholder} /></label>
          {cargoDetailsError && <p className="customer-final-error">{cargoCopy.errors[cargoDetailsError]}</p>}
          {cargoQuantity && cargoTons <= 0 && <p className="customer-final-error">{c.weightRequired}</p>}
          <button type="button" className="customer-final-primary" disabled={!cargoReady} onClick={() => setStep("truck")}>{c.next} →</button>
        </main>
      )}

      {step === "truck" && (
        <main className="customer-final-step-body">
          <p className="customer-final-step-help">{c.stepTruckHelp}</p>
          <div className="customer-final-truck-filter"><button type="button" className="active">{c.all}</button><span>{cargoTons.toLocaleString(undefined,{maximumFractionDigits:2})} ton</span></div>
          <div className="customer-final-truck-list">
            {CUSTOMER_TRUCKS.map((option) => {
              const fits = cargoTons > 0 && cargoTons <= option.capacityTons;
              return <button type="button" key={option.key} className={`customer-final-truck-row ${selectedTruck === option.key ? "selected" : ""}`} disabled={!fits} onClick={() => onTruckChange(option.key)}>
                <TruckImage truck={option} />
                <span><strong>{option.label}</strong><small>{c.maxLoad} {option.capacityTons} Ton</small></span>
                <b aria-hidden="true">{selectedTruck === option.key ? "✓" : "○"}</b>
              </button>;
            })}
          </div>
          {!truckReady && <p className="customer-final-error">{c.weightExceeds}</p>}
          <button type="button" className="customer-final-primary" disabled={!truckReady} onClick={() => void goToQuote()}>{c.next} →</button>
        </main>
      )}

      {step === "quote" && (
        <main className="customer-final-step-body">
          <p className="customer-final-step-help">{c.stepQuoteHelp}</p>
          {routePreview && <section className="customer-final-route-summary"><span>●</span><div><strong>{routePreview.pickup_label} → {routePreview.dropoff_label}</strong><small>{routePreview.distance_km.toFixed(1)} km · {routeDuration}</small></div></section>}
          <section className="customer-final-quote-truck"><TruckImage truck={truck}/><div><strong>{truck.label}</strong><small>{cargoCopy.categories[cargoCategory]} · {cargoTons.toLocaleString(undefined,{maximumFractionDigits:2})} ton</small></div></section>
          <section className="customer-final-price-card">
            <div><span>{c.authoritativeQuote}</span><strong>{quote ? formatEtb(quote.total_quote_etb) : "—"}</strong></div>
            <div className="total"><span>{c.total}</span><strong>{quote ? formatEtb(quote.total_quote_etb) : "—"}</strong></div>
          </section>
          <p className="customer-final-info">ⓘ {c.quoteNote}</p>
          {quoteError && <p className="customer-final-error" role="alert">{quoteError}</p>}
          <button type="button" className="customer-final-secondary" disabled={quoteLoading} onClick={() => void calculateQuote()}>{quoteLoading ? c.calculating : c.calculateQuote}</button>
          <button type="button" className="customer-final-primary" disabled={!quoteReady} onClick={() => setStep("review")}>{c.next} →</button>
        </main>
      )}

      {step === "review" && routePreview && quote && (
        <main className="customer-final-step-body">
          <p className="customer-final-step-help">{c.stepReviewHelp}</p>
          <section className="customer-final-review-card">
            <div><span>⌖</span><p><small>{c.route}</small><strong>{routePreview.pickup_label} → {routePreview.dropoff_label}</strong><em>{routePreview.distance_km.toFixed(1)} km · {routeDuration}</em></p></div>
            <div><span>▣</span><p><small>{c.cargo}</small><strong>{cargoCopy.categories[cargoCategory]} · {cargoTons.toLocaleString(undefined,{maximumFractionDigits:2})} ton</strong><em>{cargoCopy.packagingTypes[packagingType]}</em></p></div>
            <div><span>🚚</span><p><small>{c.truck}</small><strong>{truck.label}</strong></p></div>
            <div className="total"><p><small>{c.total}</small><strong>{formatEtb(quote.total_quote_etb)}</strong></p></div>
          </section>
          <fieldset className="customer-final-payment-choice">
            <legend>{c.paymentMethod}</legend>
            <label className={paymentMethod === "cash" ? "selected" : ""}><input type="radio" checked={paymentMethod === "cash"} onChange={() => setPaymentMethod("cash")} />{c.payOnDelivery}</label>
            <label className={paymentMethod === "bank_telebirr" ? "selected" : ""}><input type="radio" checked={paymentMethod === "bank_telebirr"} onChange={() => setPaymentMethod("bank_telebirr")} />{c.bankTelebirr}</label>
          </fieldset>
          <label className="customer-final-terms"><input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} /><span>{c.termsAgree}</span></label>
          {!termsAccepted && <small className="customer-final-muted">{c.termsRequired}</small>}
          {submitError && <p className="customer-final-error" role="alert">{submitError}</p>}
          <button type="button" className="customer-final-primary" disabled={!termsAccepted || submitting} onClick={() => void confirm()}>{submitting ? c.creatingOrder : c.confirmBooking}</button>
        </main>
      )}
    </section>
  );
}
