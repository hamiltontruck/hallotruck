import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';

await assert.doesNotReject(access('src/components/auth/PartnerDriverGate.tsx'), 'Partner Driver gate must exist before drivers can use a separate workspace');
const id='00000000-0000-4000-8000-000000000004';
const user={id,email:'driver@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{role:'driver'}};
const session={access_token:`e30.${Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')}.test`,refresh_token:'TEST',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user};
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,Routes,Route} from 'react-router-dom';import {PartnerDriverGate} from './src/components/auth/PartnerDriverGate';import {DriverGate} from './src/components/auth/DriverGate';import {PartnerDriverLogin} from './src/pages/PartnerDriverLogin';import {PartnerDriverHome} from './src/pages/PartnerDriverHome';import {Documents} from './src/pages/Documents';import {ActiveTrip} from './src/pages/ActiveTrip';import {AdminDriverCompliance} from './src/pages/AdminDriverCompliance';import {LanguageProvider} from './src/i18n/LanguageProvider';
const path=new URLSearchParams(location.search).get('path')||'/partner/driver';createRoot(document.getElementById('root')).render(<LanguageProvider><MemoryRouter initialEntries={[path]}><Routes><Route path='/partner/driver/login' element={<PartnerDriverLogin/>}/><Route path='/partner/driver' element={<PartnerDriverGate><PartnerDriverHome/></PartnerDriverGate>}/><Route path='/partner/driver/documents' element={<PartnerDriverGate><Documents/></PartnerDriverGate>}/><Route path='/partner/driver/trip' element={<PartnerDriverGate><ActiveTrip/></PartnerDriverGate>}/><Route path='/admin/driver-compliance' element={<AdminDriverCompliance/>}/><Route path='/admin/partner-driver-compliance' element={<AdminDriverCompliance scope='partner'/>}/><Route path='/driver/login' element={<p>HALLO login</p>}/><Route path='/driver/jobs' element={<DriverGate><p>HALLO jobs</p></DriverGate>}/><Route path='/driver/documents' element={<DriverGate><p>HALLO documents</p></DriverGate>}/></Routes></MemoryRouter></LanguageProvider>);`},bundle:true,write:false,format:'iife',loader:{'.css':'empty'},define:{'import.meta.env':'{}','import.meta.env.VITE_SUPABASE_URL':'"https://fixture.supabase.co"','import.meta.env.VITE_SUPABASE_ANON_KEY':'"TEST-key"','import.meta.env.VITE_SUPABASE_FUNCTIONS_URL':'"https://fixture.supabase.co/functions/v1"','import.meta.env.VITE_MAPTILER_KEY':'"TEST-map-key"','import.meta.env.VITE_MAPTILER_API_KEY':'"TEST-map-key"','process.env.NODE_ENV':'"test"'}});
const html=`<html><body><div id='root'></div><script>if(!location.search.includes('signedout'))localStorage.setItem('sb-fixture-auth-token',${JSON.stringify(JSON.stringify(session))});</script><script>${bundle.outputFiles[0].text}</script></body></html>`;
const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end(html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||(process.env.CI?'/usr/bin/google-chrome':'/usr/bin/chromium'),args:['--no-sandbox']});
let workspace={kind:'partner',driver_id:id,partner_id:'TEST-partner',partner_name:'TEST Partner',organization_active:true,driver_status:'approved',registration_status:'approved'};let contextFailure=false;
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.route('https://fixture.supabase.co/**',async route=>{
  const path=new URL(route.request().url()).pathname;const headers={'Access-Control-Allow-Origin':'*','Content-Type':'application/json'};
  if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
  let data=[];
  if(path.endsWith('/admin_driver_compliance_workspace')){const scope=route.request().postDataJSON().p_scope;data={drivers:[{id,full_name:scope==='partner'?'TEST Partner Driver':'TEST HALLO Driver',phone:'0944444444',email:'driver@example.test',driver_status:'pending',partner_name:scope==='partner'?'TEST Partner':null}],trucks:[],documents:[],orders:[],payments:[]};}
  else if(path.endsWith('/get_my_driver_workspace')){if(contextFailure){await route.fulfill({status:503,headers,json:{message:'Workspace unavailable'}});return;}data=workspace;}
  else if(path.endsWith('/get_partner_driver_active_trip'))data=null;
  else if(path.endsWith('/profiles'))data={id,role:'driver',full_name:'TEST Driver',phone:'0944444444',driver_status:workspace.driver_status};
  else if(path.endsWith('/get_partner_driver_vehicle')||path.endsWith('/trucks'))data={id:'TEST-truck',plate_number:'TEST-001',vehicle_type:'Truck 22 Ton',capacity_tons:22,status:'inactive'};
  else if(path.endsWith('/user'))data=user;
  else if(path.endsWith('/token'))data=session;
  else if(path.endsWith('/logout')){await route.fulfill({status:204,headers});return;}
  await route.fulfill({status:200,headers,json:data});
 });
 await page.goto(url);await page.getByRole('heading',{name:'Partner Driver workspace',exact:true}).waitFor();
 assert.equal(await page.getByRole('link',{name:'Wallet',exact:true}).count(),0);
 await page.getByRole('link',{name:'Trip',exact:true}).first().click();await page.getByRole('button',{name:'Return to Partner Driver home'}).waitFor();assert.equal(await page.getByRole('button',{name:/browse jobs/i}).count(),0);await page.getByRole('button',{name:'Return to Partner Driver home'}).click();
 await page.getByRole('link',{name:'Documents',exact:true}).click();await page.getByText('Partner vehicle details are managed by Admin.',{exact:false}).waitFor();
 assert.equal(await page.getByRole('button',{name:/save vehicle/i}).count(),0);
 workspace={...workspace,driver_status:'pending',registration_status:'registered'};
 await page.goto(url);await page.getByText('Verification center',{exact:true}).waitFor();
 await page.goto(url+'?path=/driver/jobs');await page.getByText('Verification center',{exact:true}).waitFor();assert.equal(await page.getByText('HALLO jobs',{exact:true}).count(),0);
 workspace={...workspace,kind:'hallo',partner_id:null,partner_name:null,driver_status:'approved',registration_status:null};
 await page.goto(url);await page.getByText('HALLO jobs',{exact:true}).waitFor();
 workspace={...workspace,kind:'partner',partner_id:'TEST-partner',partner_name:'TEST Partner',registration_status:'approved'};contextFailure=true;
 await page.goto(url);await page.getByRole('alert').getByText('Workspace unavailable',{exact:false}).waitFor();assert.equal(await page.getByText('HALLO jobs',{exact:true}).count(),0);
 contextFailure=false;await page.getByRole('button',{name:'Retry'}).click();await page.getByRole('heading',{name:'Partner Driver workspace',exact:true}).waitFor();
 workspace={...workspace,organization_active:false};await page.goto(url);await page.getByText('Partner driver access is unavailable',{exact:true}).waitFor();
 workspace={...workspace,organization_active:true};await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByRole('heading',{name:'Partner Driver login',exact:true}).waitFor();
 await page.getByLabel('Email',{exact:true}).fill('driver@example.test');await page.getByLabel('Six-digit driver PIN',{exact:true}).fill('123456');await page.getByRole('button',{name:'Open Partner Driver workspace',exact:true}).click();await page.getByRole('heading',{name:'Partner Driver workspace',exact:true}).waitFor();
 await page.goto(url+'?path=/admin/driver-compliance');await page.getByRole('heading',{name:'HALLO driver operations & verification'}).waitFor();await page.getByRole('heading',{name:'TEST HALLO Driver',exact:true}).waitFor();assert.equal(await page.getByText('TEST Partner Driver',{exact:true}).count(),0);
 await page.goto(url+'?path=/admin/partner-driver-compliance');await page.getByRole('heading',{name:'Partner driver documents & verification'}).waitFor();await page.getByRole('heading',{name:'TEST Partner Driver · TEST Partner',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Approve driver',exact:true}).count(),0);
 console.log('Partner Driver browser: ownership routing, pending documents, wrong portal, failure denial, retry, inactive org, account switch and login PASS');
}finally{await browser.close();await new Promise(r=>server.close(r));}
