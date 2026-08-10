import { useEffect, useState } from "react";
import { supabase } from "../../services/supabase.client";

export function AdminDriverDocumentsShortcut() {
  const [pendingFiles, setPendingFiles] = useState<number | null>(null);
  const [driverCount, setDriverCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSummary() {
      const [filesResult, driversResult] = await Promise.all([
        supabase
          .from("driver_verification_files")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "driver"),
      ]);

      if (!active) return;
      if (!filesResult.error) setPendingFiles(filesResult.count ?? 0);
      if (!driversResult.error) setDriverCount(driversResult.count ?? 0);
    }

    void loadSummary();

    const channel = supabase
      .channel("admin-driver-document-summary")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "driver_verification_files" },
        () => void loadSummary(),
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  return (
    <a
      href="#/admin/driver-compliance"
      className="fixed bottom-5 right-4 z-30 flex w-[calc(100%-2rem)] max-w-sm items-center gap-3 border border-amber/40 bg-asphalt px-4 py-3 text-white shadow-2xl transition hover:-translate-y-0.5 hover:border-amber sm:right-6 sm:w-auto sm:min-w-80"
      aria-label="Open driver operations and verification"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center bg-amber font-mono text-[10px] font-bold tracking-[.12em] text-asphalt">
        DRV
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-sm font-semibold">Driver control</span>
        <span className="mt-0.5 block text-[11px] text-white/55">
          {pendingFiles === null ? "Checking driver records…" : `${pendingFiles} pending review`}
          {driverCount !== null ? ` · ${driverCount} drivers` : ""}
          {" · trips · commission"}
        </span>
      </span>
      <span className="text-lg text-amber" aria-hidden="true">→</span>
    </a>
  );
}
