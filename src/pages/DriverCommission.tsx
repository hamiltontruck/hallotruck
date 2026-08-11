import { DriverCommissionWallet } from "../components/driver/DriverCommissionWallet";

export function DriverCommission() {
  return <main className="mx-auto max-w-5xl px-4 py-8 pb-28 sm:px-6 sm:py-12 md:pb-12">
    <div className="mb-6">
      <p className="font-mono text-[10px] uppercase tracking-[.18em] text-amber-dim">DRIVER FINANCE</p>
      <h1 className="mt-2 font-display text-3xl font-bold text-asphalt">HALLO Smart commission</h1>
      <p className="mt-2 max-w-2xl text-sm text-steel">Settle commission created by cash-to-driver freight payments. Your receipt stays pending until Admin/Finance confirms the money in the HALLO Smart account.</p>
    </div>
    <DriverCommissionWallet />
  </main>;
}
