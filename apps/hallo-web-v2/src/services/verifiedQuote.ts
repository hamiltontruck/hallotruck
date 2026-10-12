export type QuoteRequest = {
 origin: { latitude: number; longitude: number };
 destination: { latitude: number; longitude: number };
 cargoWeightTonnes: number;
 truckTypeId: string;
};
export type VerifiedQuote = {
 distanceKm: number;
 durationMinutes: number;
 currency: 'ETB';
 amount: number;
 routeGeometry: unknown;
 source: 'verified-routing-and-pricing';
};
export class QuoteUnavailableError extends Error {
 constructor(message = 'Verified routing and pricing are unavailable') {
  super(message); this.name = 'QuoteUnavailableError';
 }
}
export function validateQuoteRequest(request: QuoteRequest): void {
 for (const point of [request.origin, request.destination]) {
  if (!Number.isFinite(point.latitude) || Math.abs(point.latitude) > 90 ||
      !Number.isFinite(point.longitude) || Math.abs(point.longitude) > 180) {
   throw new QuoteUnavailableError('Invalid route coordinates');
  }
 }
 if (!Number.isFinite(request.cargoWeightTonnes) || request.cargoWeightTonnes <= 0 ||
     !request.truckTypeId.trim()) throw new QuoteUnavailableError('Cargo and truck are required');
}
export function parseVerifiedQuote(value: unknown): VerifiedQuote {
 if (!value || typeof value !== 'object') throw new QuoteUnavailableError();
 const q = value as Record<string,unknown>;
 if (q.source !== 'verified-routing-and-pricing' || q.currency !== 'ETB' ||
     !Number.isFinite(q.distanceKm) || Number(q.distanceKm) <= 0 ||
     !Number.isFinite(q.durationMinutes) || Number(q.durationMinutes) <= 0 ||
     !Number.isFinite(q.amount) || Number(q.amount) < 0 ||
     !q.routeGeometry || typeof q.routeGeometry !== 'object') throw new QuoteUnavailableError();
 return q as VerifiedQuote;
}
/**
 * No endpoint is connected in V2 yet. Do not call a service-role RPC from a public browser.
 * A future trusted backend adapter must verify HGV route geometry, capacity and approved
 * server-side pricing before returning the signed/validated quote response.
 */
export async function requestVerifiedQuote(request: QuoteRequest): Promise<VerifiedQuote> {
 validateQuoteRequest(request);
 const endpoint = import.meta.env.VITE_HALLO_PUBLIC_QUOTE_ENDPOINT as string | undefined;
 if (!endpoint || !endpoint.startsWith('https://')) {
  throw new QuoteUnavailableError('Trusted live quote endpoint is not configured');
 }
 const controller = new AbortController();
 const timeout = setTimeout(() => controller.abort(), 15000);
 try {
  const response = await fetch(endpoint, {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify(request),
   signal: controller.signal,
   credentials: 'omit',
  });
  if (!response.ok) throw new QuoteUnavailableError('Verified quote is temporarily unavailable');
  return parseVerifiedQuote(await response.json());
 } catch (error) {
  if (error instanceof QuoteUnavailableError) throw error;
  throw new QuoteUnavailableError('Verified quote is temporarily unavailable');
 } finally {
  clearTimeout(timeout);
 }
}
