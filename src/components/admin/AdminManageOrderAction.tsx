import type { ButtonHTMLAttributes } from "react";

export type ManageOrderAction = "transit" | "cancel" | "delete" | "assign" | "delivery";

const actionMessages: Record<ManageOrderAction, string> = {
  transit: "Starting transit. Other order actions are temporarily locked until this update finishes.",
  cancel: "Cancelling this order. Other order actions are temporarily locked until this update finishes.",
  delete: "Deleting this order. Other order actions are temporarily locked until this update finishes.",
  assign: "Assigning the truck and driver. Other order actions are temporarily locked until this update finishes.",
  delivery: "Uploading proof of delivery. Other order actions are temporarily locked until this update finishes.",
};

export function manageOrderBusyMessage(action: ManageOrderAction | null) {
  return action ? actionMessages[action] : "";
}

export function manageOrderBusyGuidanceId(orderId: string) {
  return `manage-order-busy-guidance-${orderId}`;
}

export function AdminManageOrderActionStatus({ orderId, action }: { orderId: string; action: ManageOrderAction | null }) {
  if (!action) return null;
  return (
    <p
      id={manageOrderBusyGuidanceId(orderId)}
      role="status"
      aria-live="polite"
      className="mt-4 border border-amber/35 bg-amber/10 p-3 text-xs leading-5 text-asphalt"
    >
      {manageOrderBusyMessage(action)}
    </p>
  );
}

type ManagedActionButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  orderId: string;
  action: ManageOrderAction;
  activeAction: ManageOrderAction | null;
  idleLabel: string;
  busyLabel?: string;
  disabledReason?: string;
  guidanceId?: string;
};

export function AdminManageOrderActionButton({
  orderId,
  action,
  activeAction,
  idleLabel,
  busyLabel,
  disabledReason = "",
  guidanceId,
  className = "",
  disabled = false,
  title,
  ...buttonProps
}: ManagedActionButtonProps) {
  const busy = activeAction !== null;
  const busyReason = manageOrderBusyMessage(activeAction);
  const resolvedDisabled = busy || disabled || Boolean(disabledReason);
  const resolvedDescription = busy
    ? manageOrderBusyGuidanceId(orderId)
    : disabledReason
      ? guidanceId
      : buttonProps["aria-describedby"];
  const resolvedTitle = busy ? busyReason : disabledReason || title;
  const label = activeAction === action ? busyLabel || idleLabel : idleLabel;

  return (
    <button
      {...buttonProps}
      disabled={resolvedDisabled}
      aria-describedby={resolvedDescription}
      title={resolvedTitle}
      className={`${className} disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {label}
    </button>
  );
}
