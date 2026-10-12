import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVerifiedQuote, requestVerifiedQuote, QuoteUnavailableError } from '../src/services/verifiedQuote.ts';
const valid = {origin:{latitude:8.54,longitude:39.27},destination:{latitude:9.03,longitude:38.74},cargoWeightTonnes:12,truckTypeId:'verified-truck-id'};
test('no backend means no invented ETB quote', async () => {
 await assert.rejects(requestVerifiedQuote(valid), QuoteUnavailableError);
});
test('rejects missing or invalid route and truck inputs', async () => {
 await assert.rejects(requestVerifiedQuote({...valid,origin:{latitude:999,longitude:39}}), QuoteUnavailableError);
 await assert.rejects(requestVerifiedQuote({...valid,cargoWeightTonnes:0}), QuoteUnavailableError);
 await assert.rejects(requestVerifiedQuote({...valid,truckTypeId:''}), QuoteUnavailableError);
});
test('rejects price-only responses without authoritative route geometry', () => {
 assert.throws(() => parseVerifiedQuote({distanceKm:100,durationMinutes:90,currency:'ETB',amount:123,source:'verified-routing-and-pricing'}), QuoteUnavailableError);
 assert.throws(() => parseVerifiedQuote({distanceKm:100,durationMinutes:90,currency:'ETB',amount:123,routeGeometry:{},source:'sample'}), QuoteUnavailableError);
});
test('accepts only complete verified backend response', () => {
 const quote={distanceKm:100,durationMinutes:90,currency:'ETB',amount:123,routeGeometry:{type:'LineString',coordinates:[[39.27,8.54],[38.74,9.03]]},source:'verified-routing-and-pricing'};
 assert.deepEqual(parseVerifiedQuote(quote),quote);
});
