import { useEffect, useRef, useState } from "react";
import { cargoToTons, type CargoUnit } from "../../../src/domain/cargo-load";
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

function formatQuoteEtb(amount: number) {
  return `ETB ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount)}`;
}

function TruckImage({ truck }: { truck: CustomerTruckOption }) {
  const [failed, setFailed] = useState(!truck.image);
  return (
    <div className="customer-truck-image-wrap">
      {!failed && truck.image ? (
        <img
          src={truck.image}
          alt={truck.imageAlt}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="customer-truck-image-fallback" role="img" aria-label={`${truck.label} image unavailable`}>
          <span aria-hidden="true">▱</span>
          <small>{truck.label}</small>
        </div>
      )}
    </div>
  );
}

function ProgressStep({ label, ready, active = false }: { label: string; ready: boolean; active?: boolean }) {
  return <span className={`${ready ? "done" : ""} ${active ? "active" : ""}`.trim()}><b aria-hidden="true">{ready ? "✓" : "○"}</b>{label}</span>;
}

export function CustomerBookingFlow({
  pickup,
  dropoff,
  pickupPlace,
  dropoffPlace,
  userId,
  selectedTruck,
  routePreview,
  routeLoading,
  routeError,
  onTruckChange,
  onClose,
  onOrderCreated,
}: {
  pickup: string;
  dropoff: string;
  pickupPlace: CustomerPlaceOption | null;
  dropoffPlace: CustomerPlaceOption | null;
  userId: string;
  selectedTruck: string;
  routePreview: CustomerRoutePreview | null;
  routeLoading: boolean;
  routeError: string;
  onTruckChange: (truckKey: string) => void;
  onClose: () => void;
  onOrderCreated: (order: CreatedCustomerOrder) => void;
}) {
  const { language, text } = useCustomerLanguage();
  const cargoCopy = customerCargoCopy[language];
  const [cargoCategory, setCargoCategory] = useState<CustomerCargoCategory>("general_goods");
  const [packagingType, setPackagingType] = useState<CustomerPackagingType>("loose_bulk");
  const [cargoQuantity, setCargoQuantity] = useState("");
  const [cargoUnit, setCargoUnit] = useState<CargoUnit>("ton");
  const [cargoDetailsOpen, setCargoDetailsOpen] = useState(false);
  const [cargoNotes, setCargoNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<CustomerPaymentMethod>("cash");
  const [quote, setQuote] = useState<CustomerQuotePreview | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submitLockRef = useRef(false);

  const truck = customerTruckByKey(selectedTruck);
  const rawCargoAmount = Number(cargoQuantity);
  const cargoTons = Number.isFinite(rawCargoAmount) && rawCargoAmount > 0
    ? cargoToTons(rawCargoAmount, cargoUnit)
    : 0;
  const routeReady = Boolean(
    pickup.trim()
    && dropoff.trim()
    && pickupPlace
    && dropoffPlace
    && routePreview
    && routePreview.distance_km > 0
    && !routeLoading
    && !routeError,
  );
  const truckReady = Boolean(truck?.label && truck.capacityTons > 0);
  const cargoDetailsErrorCode = validateCustomerCargoDetails({ packagingType, vehicleType: truck.label });
  const cargoReady = Boolean(cargoCategory && packagingType && !cargoDetailsErrorCode);
  const loadReady = cargoTons > 0 && cargoTons <= truck.capacityTons;
  const quoteReady = Boolean(quote && quote.total_quote_etb > 0 && !quoteLoading && !quoteError);
  const paymentReady = paymentMethod === "cash" || paymentMethod === "bank_telebirr";
  const isFormReady = routeReady && truckReady && cargoReady && loadReady && quoteReady && paymentReady;

  useEffect(() => {
    setQuote(null);
    setQuoteError("");
    setSubmitError("");
  }, [pickupPlace, dropoffPlace, selectedTruck, cargoQuantity, cargoUnit]);

  async function calculateQuote() {
    if (!pickupPlace || !dropoffPlace || !routeReady) {
      setQuoteError("Choose a valid pickup and drop-off route first.");
      return null;
    }
    if (!loadReady) {
      setQuoteError(cargoTons <= 0
        ? "Enter a load amount greater than zero."
        : `${truck.label} supports up to ${truck.capacityTons} Ton.`);
      return null;
    }

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

  useEffect(() => {
    if (!routeReady || !loadReady || !pickupPlace || !dropoffPlace) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setQuoteLoading(true);
      setQuoteError("");
      void loadCustomerQuotePreview(userId, {
        pickupQuery: pickup,
        dropoffQuery: dropoff,
        pickupPlace,
        dropoffPlace,
        vehicleType: truck.label,
        cargoTons,
      })
        .then((result) => {
          if (active) setQuote(result);
        })
        .catch((error: unknown) => {
          if (!active) return;
          setQuote(null);
          setQuoteError(error instanceof Error ? error.message : "Quote could not be calculated.");
        })
        .finally(() => {
          if (active) setQuoteLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [cargoTons, dropoff, dropoffPlace, loadReady, pickup, pickupPlace, routeReady, truck.label, userId]);

  async function confirmOrder() {
    if (!isFormReady || !quote || !routePreview || !pickupPlace || !dropoffPlace || submitting || submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting(true);
    setSubmitError("");
    try {
      const freshQuote = await loadCustomerQuotePreview(userId, {
        pickupQuery: pickup,
        dropoffQuery: dropoff,
        pickupPlace,
        dropoffPlace,
        vehicleType: truck.label,
        cargoTons,
      });
      if (Math.abs(freshQuote.total_quote_etb - quote.total_quote_etb) > 0.01) {
        setQuote(freshQuote);
        throw new Error("The transport price changed. Review the refreshed quote and confirm again.");
      }

      const order = await createCustomerMobileOrder({
        userId,
        pickupAddress: routePreview.pickup_label,
        dropoffAddress: routePreview.dropoff_label,
        vehicleType: truck.label,
        distanceKm: routePreview.distance_km,
        pickup: routePreview.pickup,
        dropoff: routePreview.dropoff,
        cargoQuantity: rawCargoAmount,
        cargoUnit,
        cargoCategory,
        packagingType,
        cargoNotes,
        paymentMethod,
        expectedQuoteEtb: freshQuote.total_quote_etb,
      });
      onOrderCreated(order);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Order could not be created. Try again.");
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  }

  function selectPackaging(next: CustomerPackagingType) {
    setPackagingType(next);
    setSubmitError("");
    if (next === "container_20ft" || next === "container_40ft") onTruckChange("trailer");
  }

  const cargoValidationMessage = cargoDetailsErrorCode ? cargoCopy.errors[cargoDetailsErrorCode] : "";
  const loadValidationMessage = cargoQuantity && !loadReady
    ? (cargoTons <= 0 ? "Enter a load amount greater than zero." : `${truck.label}: ${text.maxLoad} ${truck.capacityTons} Ton.`)
    : "";

  return (
    <section className="booking-screen customer-booking-screen" aria-label={text.chooseTruckCargo}>
      <div className="booking-topbar customer-booking-topbar">
        <button type="button" className="round-button" onClick={onClose} aria-label="Back">‹</button>
        <div>
          <small>02 · {text.bookTrip}</small>
          <strong>{text.chooseTruckCargo}</strong>
        </div>
      </div>

      <div className="booking-body customer-booking-body">
        <p className="booking-subtitle">{text.subtitle}</p>
        <div className="booking-step-row" aria-label="Booking progress">
          <ProgressStep label={text.route} ready={routeReady} />
          <ProgressStep label={text.truck} ready={truckReady} active />
          <ProgressStep label={text.cargo} ready={cargoReady} />
          <ProgressStep label={text.load} ready={loadReady} />
          <ProgressStep label={text.quote} ready={quoteReady} />
          <ProgressStep label={text.confirm} ready={false} active={isFormReady} />
        </div>

        {routePreview && (
          <div className="customer-route-summary">
            <small>AUTO ROUTE</small>
            <strong>{routePreview.pickup_label} → {routePreview.dropoff_label}</strong>
            <span>{routePreview.distance_km.toFixed(1)} km · {Math.round(routePreview.duration_minutes)} min · {truck.label}</span>
          </div>
        )}
        {routeLoading && <p className="booking-inline-state">Recalculating the HGV route for {truck.label}…</p>}
        {routeError && <p role="alert" className="booking-error">{routeError}</p>}

        <div className="booking-section-heading"><h2>{text.chooseTruck}</h2><span>{text.required}</span></div>
        <div className="customer-truck-grid" role="group" aria-label={text.chooseTruck}>
          {CUSTOMER_TRUCKS.map((option) => (
            <button
              type="button"
              key={option.key}
              className={`customer-truck-card ${selectedTruck === option.key ? "selected" : ""}`}
              aria-pressed={selectedTruck === option.key}
              onClick={() => { onTruckChange(option.key); setSubmitError(""); }}
            >
              <TruckImage truck={option} />
              <span className="customer-truck-copy">
                <strong>{option.label}</strong>
                <small>{text.maxLoad}: {option.capacityTons} Ton</small>
              </span>
              {selectedTruck === option.key && <span className="customer-truck-check" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>

        <div className="customer-booking-grid">
          <label>
            <span>{text.cargoCategory} <b>{text.required}</b></span>
            <select value={cargoCategory} onChange={(event) => { setCargoCategory(event.target.value as CustomerCargoCategory); setSubmitError(""); }} required>
              {CUSTOMER_CARGO_CATEGORIES.map((category) => <option key={category} value={category}>{cargoCopy.categories[category]}</option>)}
            </select>
          </label>
          <label>
            <span>{text.packaging} <b>{text.required}</b></span>
            <select value={packagingType} onChange={(event) => selectPackaging(event.target.value as CustomerPackagingType)} required>
              {CUSTOMER_PACKAGING_TYPES.map((packaging) => <option key={packaging} value={packaging}>{cargoCopy.packagingTypes[packaging]}</option>)}
            </select>
          </label>
          <label>
            <span>{text.loadAmount} <b>{text.required}</b></span>
            <input
              type="number"
              min="0.1"
              step="0.1"
              inputMode="decimal"
              value={cargoQuantity}
              onChange={(event) => { setCargoQuantity(event.target.value); setSubmitError(""); }}
              aria-invalid={Boolean(loadValidationMessage)}
              placeholder="0.0"
              required
            />
          </label>
          <label>
            <span>{text.unit} <b>{text.required}</b></span>
            <select value={cargoUnit} onChange={(event) => { setCargoUnit(event.target.value as CargoUnit); setSubmitError(""); }} required>
              <option value="ton">Ton</option><option value="quintal">Quintal</option>
            </select>
          </label>
        </div>
        {cargoValidationMessage && <p className="booking-error" role="alert">{cargoValidationMessage}</p>}
        {loadValidationMessage && <p className="booking-error" role="status">{loadValidationMessage}</p>}

        <button
          type="button"
          className="details-row customer-details-row"
          aria-expanded={cargoDetailsOpen}
          aria-controls="customer-cargo-details"
          onClick={() => setCargoDetailsOpen((open) => !open)}
        >
          <span><strong>{text.additionalDetails}</strong><small>{cargoNotes.trim() ? text.detailsAdded : text.optional}</small></span>
          <span aria-hidden="true" className={cargoDetailsOpen ? "is-open" : ""}>⌄</span>
        </button>

        {cargoDetailsOpen && (
          <div id="customer-cargo-details" className="customer-notes-panel">
            <label>
              <span>{text.notes} <b>{text.optional}</b></span>
              <textarea
                value={cargoNotes}
                maxLength={500}
                rows={4}
                onChange={(event) => setCargoNotes(event.target.value)}
                placeholder={cargoCopy.notesPlaceholder}
              />
            </label>
            <div><span>{text.notesHelp}</span><span>{cargoNotes.length}/500</span></div>
          </div>
        )}

        <fieldset className="customer-payment-method">
          <legend>{text.paymentMethod} <b>{text.required}</b></legend>
          <label className={paymentMethod === "cash" ? "selected" : ""}>
            <input type="radio" name="customer-payment-method" checked={paymentMethod === "cash"} onChange={() => setPaymentMethod("cash")} />
            <span>{text.cash}</span>
          </label>
          <label className={paymentMethod === "bank_telebirr" ? "selected" : ""}>
            <input type="radio" name="customer-payment-method" checked={paymentMethod === "bank_telebirr"} onChange={() => setPaymentMethod("bank_telebirr")} />
            <span>{text.bankTelebirr}</span>
          </label>
        </fieldset>

        {quoteError && <p role="alert" className="booking-error">{quoteError}</p>}
        <div className="quote-panel customer-quote-panel">
          <div>
            <small>{text.estimatedQuote}</small>
            <strong>{quote ? formatQuoteEtb(quote.total_quote_etb) : quoteLoading ? text.calculating : "—"}</strong>
            <span>{quote ? text.currentRate : cargoTons > 0 ? "Birr calculates automatically from the secure pricing RPC." : text.enterLoad}</span>
          </div>
          <button type="button" onClick={() => void calculateQuote()} disabled={quoteLoading || !routeReady || !loadReady}>
            {quoteLoading ? text.calculating : quote ? text.refreshQuote : text.calculateQuote}
          </button>
        </div>

        {submitError && <p role="alert" className="booking-error customer-submit-error">{submitError}</p>}
        <div className={`customer-confirm-dock ${isFormReady ? "is-ready" : "is-locked"}`}>
          <p>{isFormReady ? text.ready : text.completeRequired}</p>
          <button
            type="button"
            disabled={!isFormReady || submitting}
            aria-disabled={!isFormReady || submitting}
            onClick={() => void confirmOrder()}
          >
            {submitting ? text.submitting : text.confirmOrder}
          </button>
        </div>
      </div>
    </section>
  );
}
