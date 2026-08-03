import { useOfflineSync } from "../../hooks/useOfflineSync";

export function OfflineBanner() {
  const { isOnline, pendingCount } = useOfflineSync();

  if (isOnline && pendingCount === 0) return null;

  if (!isOnline) {
    return (
      <div className="bg-asphalt text-bone text-center py-2 font-mono text-xs">
        No signal — your location updates are being saved and will send once you're back in
        range.
        {pendingCount > 0 && ` (${pendingCount} queued)`}
      </div>
    );
  }

  return (
    <div className="bg-amber text-asphalt text-center py-2 font-mono text-xs">
      Sending {pendingCount} queued location update{pendingCount > 1 ? "s" : ""}…
    </div>
  );
}
