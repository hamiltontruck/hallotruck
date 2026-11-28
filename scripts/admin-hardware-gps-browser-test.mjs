import assert from 'node:assert/strict';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
const result = await build({ stdin: { contents: `
import React from 'react'; import { createRoot } from 'react-dom/client';
import { AdminLiveTripsPanel } from './src/components/admin/AdminLiveTripsPanel';
window.calls=[]; window.fail=false;
const orders=[{id:'order-one',truck_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',driver_id:'driver-one',tracking_id:'QA-TRIP',status:'in_transit',pickup_address:'Addis',dropoff_address:'Adama'}];
createRoot(document.getElementById('root')).render(<AdminLiveTripsPanel orders={orders} trucks={[{id:orders[0].truck_id,plate_number:'AA-123'}]} drivers={[{id:'driver-one',full_name:'QA Driver'}]} onManage={()=>{}}/>);
`, resolveDir: process.cwd(), loader: 'tsx' }, loader:{'.css':'empty'},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'import.meta.env':'{}'},plugins:[{name:'fixture',setup(b){
b.onResolve({filter:/supabase\.client$/},()=>({path:'supabase',namespace:'fixture'}));
b.onResolve({filter:/tracking\/CustomerLiveTripMap$/},()=>({path:'map',namespace:'fixture'}));
b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({loader:'jsx',resolveDir:process.cwd(),contents:path==='map'?`import React from 'react'; export function CustomerLiveTripMap({hardwarePosition}){return <div data-testid="map-position">{hardwarePosition?.location?.longitude ?? 'none'}</div>}`:`
export const supabase={functions:{async invoke(name,args){window.calls.push({name,args});return window.fail?{error:{message:'denied'}}:{data:{positions:[{truck_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',plate_number:'AA-123',source:'traccar',status:'LIVE',recorded_at:new Date(Date.now()-10000).toISOString(),location:{longitude:38,latitude:9,speed_kmh:18.52,heading:90}}]}}}},async rpc(){return {data:[{recorded_at:new Date(Date.now()-3600000).toISOString(),speed_kmh:1,heading:10}]}},from(table){const q={select(){return q},eq(){return q},not(){return Promise.resolve({data:[]})},order(){return Promise.resolve({data:[]})},single(){return Promise.resolve({data:{distance_km:100}})}};return q}};` }));
}}] });
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<div id="root"></div><script>${result.outputFiles[0].text}</script>`)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
 const chromePath=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean).find(path=>spawnSync(path,['--version'],{encoding:'utf8'}).status===0);
 assert.ok(chromePath,'Install Chrome/Chromium or set CHROME_BIN');
 browser=await chromium.launch({executablePath:chromePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:390,height:844}}); const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.getByText(/Hardware GPS · Updated/).waitFor();
 assert.equal(await page.getByTestId('map-position').textContent(),'38');
 assert.equal(await page.getByText('1 LIVE',{exact:true}).count(),1);
 assert.equal(await page.getByText('0 AVAILABLE',{exact:true}).count(),1,'Hardware must not imply driver availability');
 assert.equal(await page.getByText('19 km/h',{exact:true}).count(),1);
 assert.equal(await page.getByText(/Record payment/).count(),0);
 assert.deepEqual((await page.evaluate(()=>window.calls))[0],{name:'admin-hardware-gps',args:{body:{truckIds:['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']}}});
 await page.evaluate(()=>{window.fail=true});
 await page.getByRole('status').filter({hasText:'Hardware GPS unavailable'}).waitFor({timeout:12000});
 assert.equal(await page.getByTestId('map-position').textContent(),'none','Failed reads clear previous hardware fix');
 await page.getByText(/Driver app · Updated/).waitFor();
 assert.deepEqual(errors,[]);
 console.log('PASS mobile Live trips: hardware position/speed/fleet, no false availability, Finance separation, unavailable fallback');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
