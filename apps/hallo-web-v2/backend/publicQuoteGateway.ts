/**
 * V2-only public quote gateway specification.
 * Deploy ONLY after dedicated rate limiter, bot verification, allowed origins,
 * server-side canonical pricing and HGV routing have been configured.
 * This module intentionally refuses requests until those dependencies exist.
 */
export type Point = { latitude: number; longitude: number };
export type PublicQuoteInput = {
 origin: Point; destination: Point; cargoWeightTonnes: number; truckTypeId: string;
};
export type Route = { provider: 'openrouteservice'; profile: 'driving-hgv'; distanceKm: number; durationMinutes: number; coordinates: [number,number][] };
export type Pricing = { currency: 'ETB'; amount: number; verifiedVehicleCapacityTonnes: number };
export type PublicQuoteDeps = {
 authorizeRequest(request: Request): Promise<boolean>; // origin policy + bot token; never just CORS
 consumeRateLimit(request: Request): Promise<boolean>; // persistent distributed limiter; fail closed
 resolveVehicleType(id: string): Promise<{canonicalVehicleType: string; capacityTonnes: number} | null>;
 calculateHgvRoute(origin: Point, destination: Point): Promise<Route>;
 calculateCanonicalPrice(distanceKm: number, vehicleType: string, cargoTonnes: number): Promise<Pricing>;
};
const isPoint=(p:unknown):p is Point=>!!p&&typeof p==='object'&&
 Number.isFinite((p as Point).latitude)&&Math.abs((p as Point).latitude)<=90&&
 Number.isFinite((p as Point).longitude)&&Math.abs((p as Point).longitude)<=180;
const isLine=(coordinates:unknown):coordinates is [number,number][]=>Array.isArray(coordinates)&&coordinates.length>=2&&coordinates.length<=100000&&coordinates.every(
 (p:unknown)=>Array.isArray(p)&&p.length===2&&p.every((n:unknown)=>typeof n==='number'&&Number.isFinite(n))&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90);
export function parseInput(value:unknown):PublicQuoteInput {
 if(!value||typeof value!=='object')throw Error('invalid_input');
 const v=value as Record<string,unknown>;
 if(!isPoint(v.origin)||!isPoint(v.destination)||
 (v.origin.latitude===v.destination.latitude&&v.origin.longitude===v.destination.longitude)||
 typeof v.cargoWeightTonnes!=='number'||!Number.isFinite(v.cargoWeightTonnes)||v.cargoWeightTonnes<=0||v.cargoWeightTonnes>1000||
 typeof v.truckTypeId!=='string'||!/^[-a-zA-Z0-9_]{1,80}$/.test(v.truckTypeId))throw Error('invalid_input');
 return v as PublicQuoteInput;
}
function json(status:number,body:object){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})}
export async function handlePublicQuote(request:Request,deps:PublicQuoteDeps):Promise<Response>{
 if(request.method!=='POST')return json(405,{error:'method_not_allowed'});
 try{
  if(!(await deps.authorizeRequest(request)))return json(403,{error:'verification_required'});
  if(!(await deps.consumeRateLimit(request)))return json(429,{error:'rate_limited'});
 }catch{return json(503,{error:'security_services_unavailable'})}
 if(Number(request.headers.get('content-length')||0)>8192)return json(413,{error:'payload_too_large'});
 let input:PublicQuoteInput;
 try{
  const body=await request.text();
  if(body.length>8192)throw Error('too_large');
  input=parseInput(JSON.parse(body));
 }catch{return json(400,{error:'invalid_input'})}
 try{
  const vehicle=await deps.resolveVehicleType(input.truckTypeId);
  if(!vehicle||!Number.isFinite(vehicle.capacityTonnes)||vehicle.capacityTonnes<input.cargoWeightTonnes)return json(422,{error:'truck_capacity_unavailable'});
  const route=await deps.calculateHgvRoute(input.origin,input.destination);
  if(route.provider!=='openrouteservice'||route.profile!=='driving-hgv'||!isLine(route.coordinates)||
  !Number.isFinite(route.distanceKm)||route.distanceKm<=0||!Number.isFinite(route.durationMinutes)||route.durationMinutes<=0)return json(502,{error:'invalid_hgv_route'});
  const price=await deps.calculateCanonicalPrice(route.distanceKm,vehicle.canonicalVehicleType,input.cargoWeightTonnes);
  if(price.currency!=='ETB'||!Number.isFinite(price.amount)||price.amount<0||
  !Number.isFinite(price.verifiedVehicleCapacityTonnes)||price.verifiedVehicleCapacityTonnes<input.cargoWeightTonnes)return json(503,{error:'pricing_unavailable'});
  return json(200,{source:'verified-routing-and-pricing',currency:'ETB',amount:price.amount,distanceKm:route.distanceKm,durationMinutes:route.durationMinutes,routeGeometry:{type:'LineString',coordinates:route.coordinates}});
 }catch{return json(503,{error:'verified_quote_unavailable'})}
}
/** Never wire this handler to the network with placeholder dependencies. */
