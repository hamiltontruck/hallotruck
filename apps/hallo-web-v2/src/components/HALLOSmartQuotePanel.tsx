import React,{useState} from 'react';
import {requestVerifiedQuote,type VerifiedQuote,QuoteUnavailableError} from '../services/verifiedQuote';
type Place={name:string;latitude:number;longitude:number};
type Props={origin:Place|null;destination:Place|null;cargoWeightTonnes:number;truckTypeId:string};
export function HALLOSmartQuotePanel({origin,destination,cargoWeightTonnes,truckTypeId}:Props){
 const [quote,setQuote]=useState<VerifiedQuote|null>(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 async function calculate(){
  setQuote(null);setError('');setBusy(true);
  try{
   if(!origin||!destination)throw new QuoteUnavailableError('Select verified geocoder results for both cities');
   const result=await requestVerifiedQuote({origin:{latitude:origin.latitude,longitude:origin.longitude},destination:{latitude:destination.latitude,longitude:destination.longitude},cargoWeightTonnes,truckTypeId});
   setQuote(result);
  }catch(e){setError(e instanceof Error?e.message:'Verified quote unavailable')}
  finally{setBusy(false)}
 }
 return <section aria-label="Smart quote calculator" className="hallo-public-quote">
  <h4>Smart Quote — verified only</h4>
  <p>Pickup: {origin?.name??'Not geocoded'} · Destination: {destination?.name??'Not geocoded'}</p>
  <p>Cargo: {Number.isFinite(cargoWeightTonnes)&&cargoWeightTonnes>0?cargoWeightTonnes+' tonnes':'Not entered'}</p>
  <button type="button" disabled={busy||!origin||!destination||!(cargoWeightTonnes>0)||!truckTypeId} onClick={calculate}>{busy?'Calculating…':'Calculate verified quote'}</button>
  {error&&<p role="alert">{error}</p>}
  {quote&&<div role="status"><p>Distance: {quote.distanceKm.toLocaleString()} km</p><p>ETA: {quote.durationMinutes.toLocaleString()} minutes</p><p>Price: {quote.amount.toLocaleString()} ETB</p><p>Route: verified HGV road geometry</p></div>}
  <p>No order is created or approved. No price is shown without a verified backend response.</p>
 </section>;
}
