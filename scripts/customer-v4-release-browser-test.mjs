import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
// Shipping auth boundary, booking UI, date/cargo rules, insertion service and telemetry.
// Only remote auth/database, quote and map providers are local fixtures. No GPS proof.
const fixture=`
let session=null;const user={id:'fixture-customer',email:'qa@example.test'};
export const customerSupabaseConfigured=true;
export const customerSupabase={auth:{
 getSession:async()=>({data:{session}}),getUser:async()=>({data:{user:session?.user}}),
 onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
 signInWithPassword:async({password})=>password==='123456'?(session={user},{data:{session}}):({error:new Error('Invalid login credentials')}),
 signOut:async()=>{session=null;return{}},resetPasswordForEmail:async()=>({}),
},rpc:async()=>({data:{total_quote_etb:10150}}),from(table){
 const profile={role:new URLSearchParams(location.search).get('role')||'customer',full_name:'QA Customer',phone:''};
 return {select:()=>({eq:()=>({maybeSingle:async()=>({data:profile}),single:async()=>({data:profile})})}),
 insert(value){window.insertedOrder=value;return{select:()=>({single:async()=>({data:{id:'fixture-order',...value}})})}}};
}};`;
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{CustomerAuthBoundary}from'./apps/customer-mobile-app/src/auth/CustomerAuthBoundaryV2';
import{CustomerBookingJourney}from'./apps/customer-mobile-app/src/CustomerBookingJourney';
import{initializeAnalytics}from'./apps/customer-mobile-app/src/services/analytics';
window.telemetry=[];window.posthog={__loaded:true,init(_token,config){this.config=config},capture(event,properties){window.telemetry.push(this.config.before_send({event,properties}))}};initializeAnalytics();
const route={pickup_label:'Adama',dropoff_label:'Addis Ababa',pickup:[39.27,8.54],dropoff:[38.75,9.03],vehicle_type:'Isuzu 5 Ton',distance_km:100,duration_minutes:100,route_coordinates:[[39.27,8.54],[38.75,9.03]]};
function Journey({identity}){const[truck,setTruck]=useState('isuzu-5-ton');return <CustomerBookingJourney userId={identity.userId} pickup='Adama' dropoff='Addis Ababa' pickupPlace={{label:'Adama',coordinates:route.pickup}} dropoffPlace={{label:'Addis Ababa',coordinates:route.dropoff}} selectedTruck={truck} routePreview={route} routeLoading={false} routeError='' onTruckChange={setTruck} onCreated={()=>{}} onViewOrder={()=>{}} onPickupChange={()=>{}} onDropoffChange={()=>{}} onPickupSelect={()=>{}} onDropoffSelect={()=>{}} onSwap={()=>{}} onReset={()=>{}} onClose={()=>{}}/>}
createRoot(document.getElementById('root')).render(<CustomerAuthBoundary>{identity=><Journey identity={identity}/>}</CustomerAuthBoundary>);`},bundle:true,write:false,format:'iife',loader:{'.webp':'dataurl','.svg':'dataurl','.png':'dataurl'},alias:{react:process.cwd()+'/node_modules/react'},define:{'process.env.NODE_ENV':'"test"','import.meta.env':JSON.stringify({BASE_URL:'/',MODE:'test',VITE_POSTHOG_PROJECT_TOKEN:'phc_syntheticReleaseTestToken12345'})},plugins:[{name:'isolated-remote-providers',setup(b){
 b.onLoad({filter:/auth\/customer-supabase\.ts$/},()=>({contents:fixture,loader:'js'}));
 b.onResolve({filter:/\/customer-quote\.service$/},()=>({path:'quote',namespace:'fixture'}));
 b.onResolve({filter:/\/CustomerBookingMap$/},()=>({path:'map',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'jsx',contents:a.path==='quote'?`export async function loadCustomerQuotePreview(){return {total_quote_etb:10150}}`:`import React from 'react';export function CustomerBookingMap(p){return <button onClick={p.onBook}>Start fixture booking</button>}`}));
}}]});
const css=['styles.css','auth-brand.css','auth-language-compact.css','auth-language-labels.css','customer-final-ui.css','auth/customer-entry.css','customer-android-responsive.css'].filter(p=>{try{readFileSync('apps/customer-mobile-app/src/'+p);return true}catch{return false}}).map(p=>readFileSync('apps/customer-mobile-app/src/'+p,'utf8')).join('\n');
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/fixture.js'?'application/javascript':req.url==='/fixture.css'?'text/css':'text/html');res.end(req.url==='/fixture.js'?bundle.outputFiles[0].text:req.url==='/fixture.css'?css:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>')});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||(process.env.CI?'/usr/bin/google-chrome':'/usr/bin/chromium'),args:['--no-sandbox']});
mkdirSync('verification/customer-release',{recursive:true});
try{
 for(const language of ['en','om','am'])for(const width of [320,360,390,412,430,768]){
  const context=await browser.newContext({viewport:{width,height:900},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36'});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(lang=>{localStorage.setItem('hallo-customer-language',lang);sessionStorage.setItem('hallo-customer-splash-seen','1')},language);
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('input[type=email]').fill('qa@example.test');await page.locator('input[type=password]').fill('000000');await page.locator('button[type=submit]').click();await page.locator('.customer-entry-alert.is-error').waitFor();await page.locator('input[type=password]').fill('123456');await page.locator('button[type=submit]').click();
  await page.getByRole('button',{name:'Start fixture booking'}).click();
  await page.locator('.customer-final-truck-row').first().click();
  await page.locator('.customer-final-truck-action button').click();
  const check=async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${language}/${width}: horizontal overflow`);
  await check();const date=page.locator('input[type=date]');await date.fill('2000-01-01');assert(await page.locator('.customer-final-primary').last().isDisabled());await date.fill('2099-01-01');
  const category=page.locator('select').filter({has:page.locator('option[value=grain_rice]')});await category.selectOption('grain_rice');
  const item=page.locator('.customer-final-select-row--cargo-item select');await item.selectOption('teff');const itemLabel=await item.locator('option:checked').textContent();
  await category.selectOption('food');assert.equal(await item.inputValue(),'');await category.selectOption('grain_rice');await item.selectOption('teff');
  await page.locator('textarea').first().fill('Keep dry');await page.locator('textarea').last().fill('Handle carefully');
  await page.locator('.customer-final-primary').last().click();await page.locator('.customer-final-quote-truck').waitFor();await check();assert((await page.locator('.customer-final-quote-truck').textContent()).includes(itemLabel));
  await page.locator('.customer-final-back').click();assert.equal(await date.inputValue(),'2099-01-01');assert.equal(await item.inputValue(),'teff');assert.equal(await page.locator('textarea').first().inputValue(),'Keep dry');
  await page.locator('.customer-final-primary').last().click();await page.locator('.customer-final-quote-truck').waitFor();
  await page.locator('.customer-final-primary').last().click();await page.locator('.customer-final-review-card').waitFor();assert.equal(await page.locator('input[type=date]').count(),0);assert((await page.locator('.customer-final-review-card').textContent()).includes('2099-01-01'));await check();
  await page.screenshot({path:`verification/customer-release/${language}-${width}.png`,fullPage:true});
  await page.locator('input[type=checkbox]').check();await page.locator('.customer-final-primary').last().click();await page.waitForFunction(()=>Boolean(window.insertedOrder));
  const result=await page.evaluate(()=>({order:window.insertedOrder,events:window.telemetry}));assert.equal(result.order.service_date,'2099-01-01');assert.equal(result.order.cargo_category,'grain_rice');assert.match(result.order.cargo_notes,/Teff/);assert.match(result.order.cargo_notes,/Keep dry/);
  for(const name of ['login_failed','login_succeeded','quote_created','order_placed'])assert(result.events.some(e=>e.event===name),name);
  assert(!JSON.stringify(result.events).includes('qa@example.test'));assert(!JSON.stringify(result.events).includes('fixture-order'));assert.deepEqual(errors,[]);
  await context.close();
 }
 const page=await browser.newPage();await page.addInitScript(()=>{localStorage.setItem('hallo-customer-language','en');sessionStorage.setItem('hallo-customer-splash-seen','1')});await page.goto(`http://127.0.0.1:${server.address().port}/?role=admin`);await page.locator('input[type=email]').fill('qa@example.test');await page.locator('input[type=password]').fill('123456');await page.locator('button[type=submit]').click();await page.getByText('Customer account required',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Start fixture booking'}).count(),0);
 console.log('PASS: active auth boundary → cargo/date → real order-service local fixture, EN/OR/AM × six widths, static telemetry and admin isolation. Android browser emulation; no external auth, routes, GPS or remote ingestion claimed.');
}finally{await browser.close();server.close()}
