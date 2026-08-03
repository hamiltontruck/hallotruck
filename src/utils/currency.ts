export function formatEtb(amount: number): string {
  return new Intl.NumberFormat("en-ET", { maximumFractionDigits: 0 }).format(amount) + " ETB";
}

export function formatKm(km: number): string {
  return `${km.toFixed(1)} km`;
}
