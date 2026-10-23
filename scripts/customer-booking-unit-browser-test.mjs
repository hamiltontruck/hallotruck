import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';

// Exercise the shipping component's UI and booking boundary; external services
// are isolated so this test cannot create a production order.
const bundle = await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React,{useState} from 'react';window.React=React;import {createRoot} from 'react-dom/client';
import {CustomerBookingJourney} from './apps/customer-mobile-app/src/CustomerBookingJourney';
const route={pickup_label:'Adama',dropoff_label:'Addis Ababa',pickup:[39.27,8.54],dropoff:[38.75,9.03],vehicle_type:'Isuzu 5 Ton',distance_km:100,duration_minutes:100,route_coordinates:[[39.27,8.54],[38.75,9.03]]};window.fixtureRoute=route;
function App(){const [truck,setTruck]=useState('isuzu-5-ton');return <CustomerBookingJourney userId='fixture' pickup='Adama' dropoff='Addis Ababa' pickupPlace={{label:'Adama',coordinates:route.pickup}} dropoffPlace={{label:'Addis Ababa',coordinates:route.dropoff}} selectedTruck={truck} routePreview={route} routeLoading={false} routeError='' onTruckChange={setTruck} onCreated={()=>{}} onViewOrder={()=>{}} onPickupChange={()=>{}} onDropoffChange={()=>{}} onPickupSelect={()=>{}} onDropoffSelect={()=>{}} onSwap={()=>{}} onReset={()=>{}} onClose={()=>{}}/>}createRoot(document.getElementById('root')).render(<App/>);`},bundle:true,write:false,format:'iife',alias:{react:process.cwd()+'/node_modules/react'},define:{'process.env.NODE_ENV':'"test"','import.meta.env.BASE_URL':'"/"'},plugins:[{name:'isolated-services',setup(b){
 b.onResolve({filter:/\/customer-quote\.service$/},()=>({path:'quote',namespace:'fixture'}));
 b.onResolve({filter:/\/customer-order\.service-v2$/},()=>({path:'order',namespace:'fixture'}));
 b.onResolve({filter:/\/CustomerBookingMap$/},()=>({path:'map',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'jsx',contents:args.path==='quote'?`export async function loadCustomerQuotePreview(_user,input){window.quoteTons=input.cargoTons;return {...window.fixtureRoute,cargo_tons:input.cargoTons,total_quote_etb:input.cargoTons*2030,pricing_formula:'ton_km'};}`:args.path==='order'?`export async function createCustomerMobileOrder(input){window.bookingPayload=input;return {id:'fixture',trackingId:'FIXTURE',...input};}`:`export function CustomerBookingMap(props){return window.React.createElement('button',{onClick:props.onBook},'Start fixture booking')}` }));
 }}]});
const server=createServer((_req,res)=>res.end(`<html><div id="root"></div><script>${bundle.outputFiles[0].text}</script></html>`));
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||(process.env.CI?'/usr/bin/google-chrome':'/usr/bin/chromium'),args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.addInitScript(()=>localStorage.setItem('hallo-customer-language','en'));await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.getByRole('button',{name:'Start fixture booking'}).click();
 await page.getByRole('button',{name:/Isuzu 5 Ton/}).click();
 await page.getByRole('button',{name:/Continue/}).click();
 const weight=page.locator('input[type="number"]');assert.equal(await weight.inputValue(),'5');
 const unit=page.locator('select').filter({has:page.locator('option[value="quintal"]')});
 await unit.selectOption('quintal');assert.equal(await weight.inputValue(),'50','Five tons must display as 50 quintals');
 await unit.selectOption('ton');assert.equal(await weight.inputValue(),'5');await unit.selectOption('quintal');
 await page.getByRole('button',{name:/Next/}).click();
 await page.getByRole('button',{name:/Next/}).click();
 await page.locator('input[type="checkbox"]').check();
 await page.getByRole('button',{name:'Confirm Booking',exact:true}).click();
 await page.waitForFunction(()=>Boolean(window.bookingPayload));
 const result=await page.evaluate(()=>({payload:window.bookingPayload,tons:window.quoteTons}));
 assert.equal(result.payload.cargoQuantity,50);assert.equal(result.payload.cargoUnit,'quintal');assert.equal(result.tons,5);
 assert.equal(result.payload.cargoQuantity/10,result.tons);assert.equal(result.payload.expectedQuoteEtb,10150);
 console.log('Customer booking: 5 ton ⇄ 50 quintal, quote and submitted weight/price remain identical PASS');
}finally{await browser.close();server.close();}
