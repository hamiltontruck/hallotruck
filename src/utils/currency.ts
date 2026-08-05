export function formatEtb(amount: number | null | undefined): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "Price pending";
  return new Intl.NumberFormat("en-ET", { maximumFractionDigits: 0 }).format(value) + " ETB";
}

export function formatKm(km: number | null | undefined): string {
  const value = Number(km);
  if (!Number.isFinite(value) || value <= 0) return "Distance pending";
  return `${value.toFixed(1)} km`;
}
