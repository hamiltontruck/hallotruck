import { useId } from "react";

export type AdminCreateOrderActionState = {
  createdTrackingId: string;
  saving: boolean;
  quoteLoading: boolean;
  routeReady: boolean;
  vehicleReady: boolean;
  cargoValidation: string;
  quoteAvailable: boolean;
  quoteError: string;
  quoteEtb: number | null;
};

export function getAdminCreateOrderDisabledReason({
  createdTrackingId,
  saving,
  quoteLoading,
  routeReady,
  vehicleReady,
  cargoValidation,
  quoteAvailable,
  quoteError,
}: AdminCreateOrderActionState) {
  if (createdTrackingId) return `Order ${createdTrackingId} was already created. Close this form before starting another order.`;
  if (saving) return "Creating this order. Wait for the save to finish.";
  if (!routeReady) return "Select pickup and drop-off places and wait for the road distance.";
  if (!vehicleReady) return "Select a vehicle type.";
  if (cargoValidation) return cargoValidation;
  if (quoteLoading) return "Waiting for the latest server price.";
  if (!quoteAvailable) return quoteError ? `Latest server price is unavailable: ${quoteError}` : "The latest server price is unavailable. Try again.";
  return "";
}

export function AdminCreateOrderAction(props: AdminCreateOrderActionState) {
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const guidanceId = `admin-create-order-action-guidance-${reactId}`;
  const disabledReason = getAdminCreateOrderDisabledReason(props);
  const disabled = disabledReason.length > 0;
  const readyMessage = props.quoteEtb != null
    ? `Order details are complete. The latest server quote is ETB ${props.quoteEtb.toLocaleString()}.`
    : "Order details are complete and the latest server price is ready.";
  const buttonLabel = props.createdTrackingId
    ? `Order ${props.createdTrackingId} created`
    : props.saving
      ? "Creating order…"
      : props.quoteLoading
        ? "Getting latest price…"
        : props.quoteEtb != null
          ? `Create order · ETB ${props.quoteEtb.toLocaleString()}`
          : "Create order";

  return <>
    <p
      id={guidanceId}
      role="status"
      aria-live="polite"
      className={`mt-4 border p-3 text-xs leading-5 [overflow-wrap:anywhere] ${disabled ? "border-amber/30 bg-amber/10 text-asphalt" : "border-emerald-700/25 bg-emerald-50 text-emerald-800"}`}
    >
      {disabledReason || readyMessage}
    </p>
    <button
      type="submit"
      disabled={disabled}
      aria-describedby={guidanceId}
      title={disabledReason || "Create order with the latest server price"}
      className="mt-3 w-full bg-asphalt py-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
    >
      {buttonLabel}
    </button>
  </>;
}
