import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {createServer} from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
const user={id:'00000000-0000-4000-8000-000000000001',email:'partner@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{}};
const session={access_token:`e30.${Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')}.fixture`,refresh_token:'fixture',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user};
const compiled=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React,{useEffect} from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route,useNavigate,useLocation}from'react-router-dom';import{PartnerOperationsDashboard}from'./src/pages/PartnerOperationsDashboard';import{PartnerDrivers}from'./src/pages/PartnerDrivers';import{PartnerLiveOperations}from'./src/pages/PartnerLiveOperations';import{usePartnerScope,usePartnerResource}from'./src/components/partner/usePartnerOperations';const probeRead=async id=>{window.probeCalls=[...(window.probeCalls||[]),id];return id;};function Probe(){const scope=usePartnerScope();const resource=usePartnerResource(scope.partnerId,probeRead);window.fixtureNavigate=useNavigate();window.fixtureLocation=useLocation().search;useEffect(()=>{if(scope.partnerId==='org-a')window.oldPartnerRefresh=resource.refresh;},[scope.partnerId,resource.refresh]);return null;}createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/partner?organization=unknown']}><Probe/><Routes><Route path='/partner' element={<PartnerOperationsDashboard/>}/><Route path='/partner/drivers' element={<PartnerDrivers/>}/><Route path='/partner/live' element={<PartnerLiveOperations/>}/></Routes></MemoryRouter>);`},bundle:true,write:false,format:'iife',loader:{'.css':'empty'},define:{'import.meta.env.VITE_SUPABASE_URL':'"https://fixture.supabase.co"','import.meta.env.VITE_SUPABASE_ANON_KEY':'"fixture-public"','import.meta.env.VITE_MAPTILER_KEY':'"fixture-map"','process.env.NODE_ENV':'"test"'},plugins:[{name:'no-webgl',setup(b){b.onResolve({filter:/^maplibre-gl$/},()=>({path:'map',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:`class Map{constructor(o){this.container=o.container;window.mapCreations=(window.mapCreations||0)+1;}on(name,handler){if(name==='error')window.fireMapError=handler;}off(){}addControl(){}remove(){}fitBounds(){window.mapFits=(window.mapFits||0)+1;}easeTo(){window.mapFocus=(window.mapFocus||0)+1;}}class Marker{constructor(o){this.element=o.element;}setLngLat(){return this;}setPopup(p){this.popup=p;return this;}addTo(m){m.container.append(this.element);if(this.popup?.node)m.container.append(this.popup.node);return this;}remove(){this.element.remove();this.popup?.node?.remove();}getElement(){return this.element;}}class Popup{setDOMContent(node){this.node=node;return this;}}class Bounds{extend(){return this;}isEmpty(){return false;}}export default{Map,Marker,Popup,LngLatBounds:Bounds,NavigationControl:class{}};` }));}}]});
const cssFile=(await readdir('dist/assets')).find(name=>name.endsWith('.css'));
const css=await readFile('dist/assets/'+cssFile,'utf8');
const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<html><head><meta name='viewport' content='width=device-width,initial-scale=1'><style>${css}</style></head><div id='root'></div><script>localStorage.setItem('sb-fixture-auth-token',${JSON.stringify(JSON.stringify(session))});</script><script>${compiled.outputFiles[0].text}</script></html>`);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||(process.env.CI?'/usr/bin/google-chrome':'/usr/bin/chromium'),args:['--no-sandbox']});
let restrictedReads=0;let delayOld=false;let releaseOld;let jobsFail=false;let noTrips=false;let liveFails=false;
const memberships=['org-a','org-b'].map((id,i)=>({id,user_id:user.id,partner_id:id,member_role:i?'viewer':'owner',active:true,partner_organizations:{id,name:i?'Other Partner':'Own Partner',status:'active',code:id}}));
const jobs=['accepted','confirmed','confirmed','confirmed'].map((status,i)=>({id:'job-'+i,order_id:'order-'+i,partner_id:'org-a',status,offered_at:'2026-10-23',selected_driver_id:'driver',selected_truck_id:'truck'}));
const orders=['placed','accepted','in_transit','delivered'].map((status,i)=>({id:'order-'+i,tracking_id:'REF-'+i,status,driver_id:i?'driver':null,truck_id:i?'truck':null,pickup_address:'Adama',dropoff_address:'Addis Ababa'}));
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(8000);
 await page.route('https://fixture.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;const body=req.method()==='POST'?req.postDataJSON():null;let data=[];
  const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':'*'};
  if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
  const org=body?.p_partner_id??url.searchParams.get('partner_id')?.replace('eq.','');
  if(path.endsWith('/partner_memberships'))data=memberships;
  else if(path.endsWith('/fleet_enterprise_vehicles')){if(liveFails){await route.fulfill({status:503,headers,json:{message:'Fleet unavailable'}});return;}data=org==='org-a'&&!noTrips?[{vehicle_id:'truck',partner_id:org,plate_number:'ET-001',status:'assigned',active_trip_id:'order-2',active_trip_reference:'REF-2',assigned_driver_name:'<img src=x onerror="window.injected=true">',assigned_driver_id:'driver'}]:[];}
  else if(path.endsWith('/partner_get_live_trip'))data=[{order_id:'order-2',status:'in_transit',truck_lng:39,truck_lat:9,recorded_at:new Date().toISOString()}];
  else if(path.endsWith('/partner_job_requests')){if(delayOld&&org==='org-a'){await new Promise(r=>releaseOld=r);}if(jobsFail){await route.fulfill({status:503,headers,json:{message:'Jobs unavailable'}});return;}data=org==='org-a'?jobs:[];}
  else if(path.endsWith('/orders'))data=orders;
  else if(path.endsWith('/list_partner_driver_roster')){if(org==='org-b')restrictedReads++;data=[{id:'driver',partner_id:'org-a',full_name:'Own Driver',driver_status:'approved',truck_id:'truck',plate_number:'ET-001',email:'driver@example.test'}];}
  else if(path.endsWith('/list_partner_driver_registrations')){if(org==='org-b')restrictedReads++;data=[{id:'invite',partner_id:'org-a',full_name:'New Driver',email:'new@example.test',phone:'0911111111',status:'invited',driver_id:null,expires_at:'2099-01-01',token:null}];}
  else if(path.endsWith('/user'))data=user;
  await route.fulfill({status:200,headers,json:data});
 });
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.getByRole('heading',{name:'Fleet operations',exact:true}).waitFor();await page.getByText('REF-2',{exact:true}).waitFor();
 assert.equal(new URLSearchParams(await page.evaluate(()=>window.fixtureLocation)).get('organization'),'org-a','Unknown organization must canonicalize to an authorized membership');
 assert.equal(await page.getByRole('link',{name:'Partner orders',exact:true}).count(),1,'Existing freight order creation/submission must remain discoverable');assert.match(await page.getByRole('link',{name:'Partner orders',exact:true}).getAttribute('href'),/organization=org-a/);
 for(const label of ['Awaiting HALLO confirmation','Assigned · awaiting start','In transit','Delivered'])assert.ok(await page.getByText(label,{exact:true}).count(),label);
 await page.getByRole('link',{name:'Drivers',exact:true}).click();
 await page.getByRole('heading',{name:'Your Partner drivers',exact:true}).waitFor();await page.getByRole('searchbox').fill('ET-001');
 await page.getByText('Own Driver',{exact:true}).waitFor();assert.equal(await page.getByText('New Driver',{exact:true}).count(),0);
 await page.setViewportSize({width:320,height:844});assert.ok((await page.getByRole('searchbox').boundingBox()).width>=220,'Mobile driver search must remain wide enough for names and plates');await page.setViewportSize({width:390,height:844});await page.getByRole('searchbox').fill('new');await page.getByText('New Driver',{exact:true}).first().waitFor();
 await page.getByRole('link',{name:'Live map',exact:true}).click();
 await page.getByRole('heading',{name:'Real GPS fleet map',exact:true}).waitFor();
 await page.getByRole('button',{name:/Select trip REF-2/}).click();
 await page.waitForFunction(()=>Boolean(window.mapFocus));assert.equal(await page.evaluate(()=>window.injected),undefined);
 const firstFocus=await page.evaluate(()=>window.mapFocus);await page.getByRole('button',{name:/Select trip REF-2/}).click();await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.mapFocus),firstFocus+1,'Explicitly selecting the same trip must recenter after panning');
 await page.getByRole('button',{name:'ET-001, GPS LIVE',exact:true}).click();assert.equal(await page.getByRole('button',{name:/Select trip REF-2/}).getAttribute('aria-pressed'),'true');
 await page.evaluate(()=>window.fireMapError());await page.getByRole('alert').filter({hasText:'Map tiles could not be loaded'}).waitFor();const beforeRetry=await page.evaluate(()=>window.mapCreations);await page.getByRole('button',{name:'Retry map',exact:true}).click();await page.waitForFunction(n=>window.mapCreations===n+1,beforeRetry);
 const creations=await page.evaluate(()=>window.mapCreations);await page.getByRole('button',{name:'Refresh',exact:true}).click();
 await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.mapCreations),creations);
 noTrips=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByText('No active Partner trips right now.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.mapCreations),creations);
 liveFails=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('alert').filter({hasText:'Fleet unavailable'}).waitFor();assert.equal(await page.locator('[aria-label="Partner live fleet map"]').count(),1);assert.equal(await page.evaluate(()=>window.mapCreations),creations);
 liveFails=false;noTrips=false;await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.getByRole('button',{name:/Select trip REF-2/}).waitFor();assert.equal(await page.getByRole('button',{name:/Select trip REF-2/}).getAttribute('aria-pressed'),'false','A trip removed by a successful refresh must not reselect itself when it reappears');assert.equal(await page.evaluate(()=>window.mapCreations),creations,'Recovering from failed telemetry must preserve the mounted map and viewport');
 await page.getByRole('link',{name:'Dashboard',exact:true}).click();await page.getByRole('heading',{name:'Fleet operations'}).waitFor();await page.getByText('REF-2',{exact:true}).waitFor();
 delayOld=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();await page.waitForTimeout(100);
 await page.getByRole('combobox',{name:'Organization'}).selectOption('org-b');await page.getByText('Other Partner',{exact:true}).first().waitFor();
 releaseOld?.();await page.waitForTimeout(100);delayOld=false;
 assert.equal(await page.getByText('REF-2',{exact:true}).count(),0,'Late organization response must not restore old data');
 assert.equal(restrictedReads,0);assert.equal(await page.getByRole('link',{name:'Drivers',exact:true}).count(),0);
 const oldReads=await page.evaluate(()=>window.probeCalls.filter(id=>id==='org-a').length);await page.evaluate(()=>window.oldPartnerRefresh());assert.equal(await page.evaluate(()=>window.probeCalls.filter(id=>id==='org-a').length),oldReads,'Stale refresh callbacks must not restart old organization reads');
 await page.evaluate(()=>window.fixtureNavigate('/partner/drivers?organization=org-b'));await page.getByText('Active Partner owner or admin access is required to manage drivers.',{exact:true}).waitFor();assert.equal(restrictedReads,0);
 for(const width of [320,390,768]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 console.log('Partner operations browser: lifecycle, driver search, safe map selection/refresh, role and organization isolation PASS');
}finally{await browser.close();server.close();}
