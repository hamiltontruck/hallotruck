import assert from "node:assert/strict";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";
import { chromium } from "playwright-core";

// Real React component and form lifecycle; only external I/O is synthetic.
const result = await build({
  stdin: { contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {AdminOperationsControl} from './src/components/admin/AdminOperationsControl';
    import {AdminFleetMaintenance} from './src/pages/AdminFleetMaintenance';
    window.queries=[]; window.recorded=[]; window.rpcCalls=[];
    const order={id:'qa-order',tracking_id:'QA-549',pickup_address:'Addis',dropoff_address:'Adama',vehicle_type:'Truck',price_etb:100,status:'placed',payment_status:'unpaid',created_at:'2026-11-28T00:00:00Z'};
    const fixture={vehicles:[],records:[],branches:[],audit:[],drivers:[],summary:{total:0,available:0,assigned:0,on_trip:0,maintenance:0,suspended:0,inactive:0,expiry_alerts:0,service_alerts:0,dispatch_ready:0}};
    createRoot(document.getElementById('root')).render(new URL(location.href).searchParams.has('fleet') ? <AdminFleetMaintenance fixture={fixture}/> : <AdminOperationsControl view={new URL(location.href).searchParams.get('view')} order={order} allOrders={[order]} trucks={[]} drivers={[]} onClose={()=>{}}/>);
  `, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, write: false, format: "iife", jsx: "automatic",
  plugins: [{ name: "fixture-io", setup(builder) {
    builder.onResolve({ filter: /(?:services\/|\.\/)supabase\.client$/ }, () => ({ path: "supabase", namespace: "fixture" }));
    builder.onResolve({ filter: /services\/admin.service$/ }, () => ({ path: "admin", namespace: "fixture" }));
    builder.onResolve({ filter: /tracking\/CustomerLiveTripMap$/ }, () => ({ path: "map", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({path}) => ({ contents: path === 'supabase' ? `
      export const supabase={async rpc(name,args){window.rpcCalls.push({name,args});await new Promise(r=>setTimeout(r,20));return {data:null,error:window.failRpc?{message:'This GPS IMEI is already linked to another vehicle'}:null}},from(table){window.queries.push(table);const fail=new URL(location.href).searchParams.get('fail'); const value={data:table==='payments'?window.recorded:table==='orders'?{distance_km:12}:null,error:fail===table?{message:'Fixture '+table+' denied'}:null};const q={select(){return q},eq(){return q},order(){return Promise.resolve(value)},maybeSingle(){return Promise.resolve(value)},single(){return Promise.resolve(value)}};return q}};
    ` : path === 'admin' ? `
      export async function recordPayment(input){await new Promise(r=>setTimeout(r,20));window.recorded.push({id:'qa-payment',order_id:input.orderId,amount_etb:input.amountEtb,provider:input.provider,event:input.event,created_at:new Date().toISOString()})}
      export async function assignOrder(){}; export function openDeliveryProof(){};export function printInvoice(){};
    ` : `export function CustomerLiveTripMap(){return null}` }));
  } }],
});
const server = http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<div id="root"></div><script>${result.outputFiles[0].text}</script>`)});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`;
const chromePath = [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']
  .filter(Boolean).find(candidate => spawnSync(candidate, ['--version'], { encoding: 'utf8' }).status === 0);
let browser;
try {
  assert.ok(chromePath, 'Install Chrome/Chromium or set CHROME_BIN for browser QA');
  browser=await chromium.launch({executablePath:chromePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const externalRequests=[];
  await page.route('**/*',route=>{if(new URL(route.request().url()).hostname==='127.0.0.1') return route.continue(); externalRequests.push(route.request().url()); return route.abort();});
  await page.goto(`${url}?view=operations&fail=payments`);
  await page.getByRole('heading',{name:'Dispatch',exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.queries),['delivery_proofs','orders'],'Operations must not query the payment ledger');
  assert.equal(await page.getByText('Record customer payment',{exact:true}).count(),0);
  console.log('PASS operations remain usable without Finance data');
  await page.goto(`${url}?view=payments&fail=delivery_proofs`);
  await page.getByRole('heading',{name:'Record customer payment',exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.queries),['payments'],'Finance must not query delivery proof or trip geometry');
  assert.equal(await page.getByRole('heading',{name:'Dispatch',exact:true}).count(),0);
  console.log('PASS Finance remains usable without delivery proof data');
  await page.locator('select[name="provider"]').selectOption('cash');
  await page.locator('input[name="amountEtb"]').fill('40');
  await page.getByRole('button',{name:'Record as initiated'}).click();
  await page.waitForFunction(()=>window.recorded.length===1 && window.queries.filter(t=>t==='payments').length===2);
  assert.equal(await page.getByText(/Cannot read properties/).count(),0,'Successful payment must not throw from a released React event');
  assert.equal(await page.locator('input[name="amountEtb"]').inputValue(),'','Successful payment resets form');
  assert.equal((await page.evaluate(()=>window.recorded))[0].amount_etb,40);
  console.log('PASS asynchronous payment records once, resets form, and reloads ledger');
  await page.goto(`${url}?fleet`);
  await page.getByRole('button',{name:'Link GPS',exact:true}).click();
  await page.getByLabel('Plate number',{exact:true}).fill('AA-123');
  await page.getByLabel('GPS IMEI',{exact:true}).fill('123');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  assert.equal((await page.evaluate(()=>window.rpcCalls)).length,0,'Invalid IMEI must not submit');
  await page.getByLabel('GPS IMEI',{exact:true}).fill('123456789012345');
  await page.evaluate(()=>{window.failRpc=true});
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'already linked to another'}).waitFor();
  assert.equal(await page.getByLabel('GPS IMEI',{exact:true}).inputValue(),'123456789012345','Server rejection preserves the form');
  await page.evaluate(()=>{window.failRpc=false});
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByRole('status').filter({hasText:'GPS device linked.'}).waitFor();
  const calls=await page.evaluate(()=>window.rpcCalls);
  assert.equal(calls.length,2);
  assert.deepEqual(calls[1],{name:'admin_link_fleet_gps',args:{p_plate_number:'AA-123',p_imei:'123456789012345'}});
  assert.equal(await page.getByLabel('GPS IMEI',{exact:true}).count(),0,'Successful link closes modal');
  assert.deepEqual(externalRequests,[],'Fixture QA must never contact external services');
  console.log('PASS mobile GPS form validates IMEI, preserves rejected input and retries the authorized RPC');

} finally { await browser?.close(); await new Promise(resolve=>server.close(resolve)); }
