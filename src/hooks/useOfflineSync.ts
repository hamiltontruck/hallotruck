import { useEffect, useState } from "react";
import { syncPendingPings, getPendingPingCount } from "../services/offline.service";

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(getPendingPingCount());

  useEffect(() => {
    async function runSync() {
      await syncPendingPings();
      setPendingCount(getPendingPingCount());
    }
    function handleOnline() {
      setIsOnline(true);
      runSync();
    }
    function handleOffline() {
      setIsOnline(false);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    if (navigator.onLine) runSync();
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { isOnline, pendingCount };
}
