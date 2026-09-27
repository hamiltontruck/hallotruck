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
import { CUSTOMER_TRUCKS, customerTruckByKey, customerTruckDisplayLabel, type CustomerTruckOption } from "./customer-vehicle-catalog";
import { useCustomerLanguage } from "./customer-language";
import { getCustomerFinalCopy } from "./customer-final-copy";

type BookingStep = "route" | "truck" | "cargo" | "quote" | "review" | "success";
const STEPS: Exclude<BookingStep, "success">[] = ["route", "truck", "cargo", "quote", "review"];

function formatEtb(amount: number) {
  return `ETB ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount)}`;
}

function TruckImage({ truck, alt }: { truck: CustomerTruckOption; alt?: string }) {
  const [failed, setFailed] = useState(!truck.image);
  return (
    <div className="customer-final-truck-image">
      {!failed && truck.image ? <img src={truck.image} alt={alt ?? truck.imageAlt} loading="lazy" onError={() => setFailed(true)} /> : <span aria-hidden="true">🚚</span>}
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
  const todayServiceDate = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Addis_Ababa" });
  const [serviceDate, setServiceDate] = useState(todayServiceDate);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [quote, setQuote] = useState<CustomerQuotePreview | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<CreatedCustomerOrder | null>(null);
  const submitLock = useRef(false);
  const truckListRef = useRef<HTMLDivElement | null>(null);

  const truck = customerTruckByKey(selectedTruck);
  const truckDisplayLabel = customerTruckDisplayLabel(truck, language);
  const rawAmount = truck.capacityTons;
  const cargoTons = truck.capacityTons;
  const routeReady = Boolean(pickupPlace && dropoffPlace && routePreview && routePreview.distance_km > 0 && !routeLoading && !routeError);
  const cargoDetailsError = validateCustomerCargoDetails({ packagingType, vehicleType: truck.label });
  const cargoReady = Boolean(cargoCategory && packagingType && cargoTons > 0 && !cargoDetailsError);
  const truckFitsCargo = cargoTons <= 0 || cargoTons <= truck.capacityTons;
  const truckReady = cargoReady && truckFitsCargo;
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

  function resetTruckSelection() {
    onTruckChange("");
    requestAnimationFrame(() => truckListRef.current?.scrollTo({ top: 0, behavior: "smooth" }));
  }

  function openTruckStep() {
    resetTruckSelection();
    setStep("truck");
  }

  function goBack() {
    if (step === "truck") {
      resetTruckSelection();
      setStep("route");
      return;
    }
    setStep(STEPS[Math.max(0, activeIndex - 1)]);
  }

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
        language,
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
        language,
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
        serviceDate,
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
    setServiceDate(todayServiceDate);
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
            <div><small>{c.truck}</small><strong>{truckDisplayLabel}</strong></div>
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
        <button type="button" className="customer-final-back" onClick={step === "route" ? onClose : goBack} aria-label={c.back}>‹</button>
        <h1>{step === "cargo" ? c.cargoTitle : step === "truck" ? c.chooseTruck : step === "quote" ? c.yourQuote : step === "review" ? c.reviewBooking : c.routeTitle}</h1>
        <span aria-hidden="true" />
      </header>
      <div className="customer-final-stepper" aria-label={c.bookingProgress}>
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
            vehicleDisplayName={truckDisplayLabel}
            onPickupChange={onPickupChange}
            onDropoffChange={onDropoffChange}
            onPickupSelect={onPickupSelect}
            onDropoffSelect={onDropoffSelect}
            onSwap={onSwap}
            onReset={onReset}
            onBook={() => { if (routeReady) openTruckStep(); }}
          />
        </div>
      )}

      {step === "cargo" && (
        <main className="customer-final-step-body">
          <p className="customer-final-step-help">{c.stepCargoHelp}</p>
          <label className="customer-final-select-row"><span><b>{c.cargoType}</b><small>{cargoCopy.categories[cargoCategory]}</small></span><select value={cargoCategory} onChange={(event) => setCargoCategory(event.target.value as CustomerCargoCategory)}>{CUSTOMER_CARGO_CATEGORIES.map((value) => <option value={value} key={value}>{cargoCopy.categories[value]}</option>)}</select></label>
          <div className="customer-final-weight-row">
            <label><span>{c.totalWeight}</span><input type="number" value={truck.capacityTons} readOnly aria-readonly="true" /></label>
            <label><span>{c.unit}</span><select value={cargoUnit} onChange={(event) => setCargoUnit(event.target.value as CargoUnit)}><option value="ton">{c.ton}</option><option value="quintal">{c.quintal}</option></select></label>
          </div>
          <label className="customer-final-select-row"><span><b>{c.packagingType}</b><small>{cargoCopy.packagingTypes[packagingType]}</small></span><select value={packagingType} onChange={(event) => setPackagingType(event.target.value as CustomerPackagingType)}>{CUSTOMER_PACKAGING_TYPES.map((value) => <option value={value} key={value}>{cargoCopy.packagingTypes[value]}</option>)}</select></label>
          <label className="customer-final-field"><span>{c.loadDescription}</span><textarea rows={3} maxLength={300} value={cargoNotes} onChange={(event) => setCargoNotes(event.target.value)} placeholder={c.loadPlaceholder} /></label>
          <label className="customer-final-field"><span>{c.specialRequirements}</span><textarea rows={3} maxLength={200} value={specialRequirements} onChange={(event) => setSpecialRequirements(event.target.value)} placeholder={c.requirementsPlaceholder} /></label>
          {cargoDetailsError && <p className="customer-final-error">{cargoCopy.errors[cargoDetailsError]}</p>}
          {cargoQuantity && cargoTons <= 0 && <p className="customer-final-error">{c.weightRequired}</p>}
          {cargoReady && !truckFitsCargo && <p className="customer-final-error">{c.weightExceeds}</p>}
          <button type="button" className="customer-final-primary" disabled={!truckReady} onClick={() => void goToQuote()}>{c.next} →</button>
        </main>
      )}

      {step === "truck" && (
        <main className="customer-final-step-body customer-final-step-body--truck">
          <p className="customer-final-step-help">{c.stepTruckHelp}</p>
          <div className="customer-final-truck-filter"><button type="button" className="active">{c.all}</button><span>{cargoTons > 0 ? `${cargoTons.toLocaleString(undefined,{maximumFractionDigits:2})} ${c.ton}` : "—"}</span></div>
          <div className="customer-final-truck-list" ref={truckListRef}>
            {CUSTOMER_TRUCKS.map((option) => {
              const fits = cargoTons <= 0 || cargoTons <= option.capacityTons;
              const displayLabel = customerTruckDisplayLabel(option, language);
              return <button type="button" key={option.key} className={`customer-final-truck-row ${selectedTruck === option.key ? "selected" : ""}`} onClick={() => onTruckChange(option.key)}>
                <TruckImage truck={option} alt={displayLabel} />
                <span><strong>{displayLabel}</strong><small>{c.maxLoad} {option.capacityTons} {c.ton}</small></span>
                <b aria-hidden="true">{selectedTruck === option.key ? "✓" : "○"}</b>
              </button>;
            })}
          </div>
          <div className="customer-final-truck-action"><button type="button" className="customer-final-primary" disabled={!selectedTruck} onClick={() => setStep("cargo")}>{c.continue} →</button></div>
        </main>
      )}

      {step === "quote" && (
        <main className="customer-final-step-body">
          <p className="customer-final-step-help">{c.stepQuoteHelp}</p>
          {routePreview && <section className="customer-final-route-summary"><span>●</span><div><strong>{routePreview.pickup_label} → {routePreview.dropoff_label}</strong><small>{routePreview.distance_km.toFixed(1)} km · {routeDuration}</small></div></section>}
          <section className="customer-final-quote-truck"><TruckImage truck={truck} alt={truckDisplayLabel}/><div><strong>{truckDisplayLabel}</strong><small>{cargoCopy.categories[cargoCategory]} · {cargoTons.toLocaleString(undefined,{maximumFractionDigits:2})} {c.ton}</small></div></section>
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
              <label className="customer-final-service-date"><span>Order Date</span><input type="date" min={todayServiceDate} value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} /></label>
          <section className="customer-final-review-card">
            <div><span>⌖</span><p><small>{c.route}</small><strong>{routePreview.pickup_label} → {routePreview.dropoff_label}</strong><em>{routePreview.distance_km.toFixed(1)} km · {routeDuration}</em></p></div>
            <div><span>▣</span><p><small>{c.cargo}</small><strong>{cargoCopy.categories[cargoCategory]} · {cargoTons.toLocaleString(undefined,{maximumFractionDigits:2})} {c.ton}</strong><em>{cargoCopy.packagingTypes[packagingType]}</em></p></div>
            <div><span>🚚</span><p><small>{c.truck}</small><strong>{truckDisplayLabel}</strong></p></div>
                <div><span>◷</span><p><small>Order Date</small><strong>{serviceDate}</strong></p></div>
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
