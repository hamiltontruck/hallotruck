import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";

const token="00000000-0000-4000-8000-000000000099";
const driver="00000000-0000-4000-8000-000000000004";
const user={id:driver,email:"driver@example.test",role:"authenticated",aud:"authenticated",app_metadata:{provider:"email"},user_metadata:{role:"driver"}};
const jwt=`e30.${Buffer.from(JSON.stringify({sub:driver,exp:Math.floor(Date.now()/1000)+3600,role:"authenticated"})).toString("base64url")}.test`;
const session={access_token:jwt,refresh_token:"TEST-refresh",token_type:"bearer",expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user};
const partnerSession={...session,user:{...user,id:"00000000-0000-4000-8000-000000000001",email:"partner@example.test",user_metadata:{role:"partner"}}};
const stored=JSON.stringify(partnerSession);
const truck="00000000-0000-4000-8000-000000000020";
const compiled=await build({stdin:{resolveDir:process.cwd(),loader:"tsx",contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import {PartnerDriversPanel} from './src/components/partner/PartnerDriversPanel';import {PartnerDriverJoin} from './src/pages/PartnerDriverJoin';import {AdminPartnerDrivers} from './src/pages/AdminPartnerDrivers'; const mode=location.hash;createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/partner/driver-join?token=${token}']}>{mode==='#join'?<PartnerDriverJoin/>:mode==='#admin'?<AdminPartnerDrivers/>:<PartnerDriversPanel partnerId='TEST-partner'/>}</MemoryRouter>);`},bundle:true,write:false,format:"iife",define:{"import.meta.env.VITE_SUPABASE_URL":'"https://fixture.supabase.co"',"import.meta.env.VITE_SUPABASE_ANON_KEY":'"TEST-public-key"',"process.env.NODE_ENV":'"test"'}});
const directory=await mkdtemp(join(tmpdir(),"partner-drivers-"));
const cssFile=(await readdir('dist-partner-platform/assets')).find(path=>path.endsWith('.css'));
const css=await readFile(`dist-partner-platform/assets/${cssFile}`,'utf8');
const fixture=join(directory,'index.html');
await writeFile(fixture,`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>localStorage.setItem('sb-fixture-auth-token',${JSON.stringify(stored)});</script><script>${compiled.outputFiles[0].text}</script></body></html>`);
const html=await readFile(fixture,'utf8');
const server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end(html);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const fixtureUrl=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||(process.env.CI?'/usr/bin/google-chrome':'/usr/bin/chromium'),args:['--no-sandbox']});
 let rows=[]; const requests=[];let documentsReady=false;
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.route('https://fixture.supabase.co/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  const body=req.method()==='POST'?req.postDataJSON():null;requests.push({path,body});
  const headers={'Access-Control-Allow-Origin':'*','Content-Type':'application/json'};
  if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
  if(path.endsWith('/signup')||path.endsWith('/token')){await route.fulfill({status:200,headers,json:session});return;}
  if(path.endsWith('/logout')){await route.fulfill({status:204,headers});return;}
  if(path.endsWith('/validate_partner_driver_registration')){await route.fulfill({status:200,headers,json:body.p_email==='driver@example.test'&&body.p_phone==='0944444444'});return;}
  if(path.endsWith('/fleet_enterprise_vehicles')){await route.fulfill({status:200,headers,json:[{vehicle_id:truck,partner_id:'TEST-partner',plate_number:'TEST-PARTNER-001',status:'available',assigned_driver_id:null,active_trip_id:null},{vehicle_id:'OTHER-truck',partner_id:'OTHER-partner',plate_number:'OTHER-PARTNER',status:'available'}]});return;}
  if(path.endsWith('/link_partner_driver_onboarding_vehicle')){await route.fulfill({status:200,headers,json:null});return;}
  if(path.endsWith('/list_partner_driver_registrations')){await route.fulfill({status:200,headers,json:rows});return;}
  if(path.endsWith('/create_partner_driver_registration')){
   rows=[{id:token,partner_id:'TEST-partner',partner_name:'TEST Partner',full_name:body.p_full_name,email:body.p_email,phone:body.p_phone,status:'invited',driver_id:null,driver_status:null,expires_at:'2099-01-01',token,review_note:null}];
   await route.fulfill({status:200,headers,json:{id:token,token,expires_at:'2099-01-01'}});return;
  }
  if(path.endsWith('/claim_partner_driver_registration')){await route.fulfill({status:200,headers,json:token});return;}
  if(path.endsWith('/review_partner_driver_registration')){
   if(body.p_decision==='approved'&&!documentsReady){await route.fulfill({status:400,headers,json:{message:'Verify documents before approval',code:'23514'}});return;}
   rows[0].status=body.p_decision;rows[0].driver_status='approved';await route.fulfill({status:200,headers,json:null});return;
  }
  if(path.startsWith('/rest/v1/')){await route.fulfill({status:200,headers,json:[]});return;}
  await route.fulfill({status:404,headers,json:{message:'Unexpected fixture request'}});
 });
 await page.goto(fixtureUrl);
 await page.getByText('Add driver',{exact:true}).click();
 await page.getByLabel('Full name',{exact:true}).fill('TEST Driver');
 await page.getByLabel('Email',{exact:true}).fill('DRIVER@example.test');
 await page.getByLabel('Phone',{exact:true}).fill('+251944444444');
 await page.getByRole('button',{name:'Create driver registration'}).click();
 await page.getByText('Driver registration created.',{exact:false}).waitFor();
 const created=requests.find(r=>r.path.endsWith('/create_partner_driver_registration')).body;
 assert.equal(created.p_partner_id,'TEST-partner');assert.equal(created.p_email,'driver@example.test');assert.equal(created.p_phone,'0944444444');
 assert.ok((await page.getByLabel('Private driver registration link').inputValue()).includes(token));
 await page.goto(fixtureUrl+'#join');await page.reload();
 await page.getByLabel('Full name',{exact:true}).fill('TEST Driver');
 await page.getByLabel('Email',{exact:true}).fill('wrong@example.test');
 await page.getByLabel('Phone',{exact:true}).fill('0944444444');
 await page.getByLabel('Six-digit driver PIN',{exact:true}).fill('123456');
 await page.getByRole('button',{name:'Create my driver account'}).click();
 await page.getByRole('alert').getByText('Registration link is closed',{exact:false}).waitFor();
 assert.equal(requests.filter(r=>r.path.endsWith('/signup')).length,0,'mismatched recipient must not create an account');
 await page.getByLabel('Email',{exact:true}).fill('driver@example.test');
 await page.getByRole('button',{name:'Create my driver account'}).click();
 await page.getByText('Registration completed.',{exact:false}).waitFor();
 assert.equal(await page.evaluate(()=>localStorage.getItem('sb-fixture-auth-token')),stored,'driver signup must preserve Partner browser session');
 assert.equal(requests.find(r=>r.path.endsWith('/signup')).body.data.role,'driver');
 assert.equal(requests.find(r=>r.path.endsWith('/claim_partner_driver_registration')).body.p_token,token);
 rows[0]={...rows[0],status:'registered',driver_id:driver,driver_status:'pending',token:null};
 await page.goto(fixtureUrl+'#admin');await page.reload();
 await page.getByText('Registration: registered',{exact:false}).waitFor();
 await page.getByRole('option',{name:'Approve verified Partner driver'}).waitFor({state:'attached'});
 await page.getByRole('button',{name:'Load Partner vehicles'}).click();
 await page.getByRole('option',{name:'TEST-PARTNER-001 · available'}).waitFor({state:'attached'});
 assert.equal(await page.getByRole('option',{name:'OTHER-PARTNER · available'}).count(),0,'other organization vehicles are excluded');
 await page.getByRole('combobox',{name:'Partner onboarding truck'}).selectOption(truck);
 await page.getByRole('button',{name:'Link onboarding vehicle'}).click();
 await page.getByText('Vehicle linked for document onboarding.',{exact:false}).waitFor();
 assert.equal(requests.find(r=>r.path.endsWith('/link_partner_driver_onboarding_vehicle')).body.p_truck_id,truck);
 await page.locator('select[name="decision"]').selectOption('approved');
 await page.getByRole('textbox',{name:'Review reason'}).fill('TEST documents verified');
 await page.getByRole('button',{name:'Save review'}).click();
 await page.getByRole('alert').getByText('Verify documents before approval').waitFor();
 assert.equal(await page.getByText('Registration: approved',{exact:false}).count(),0,'failed approval stays pending');
 documentsReady=true;
 await page.getByRole('button',{name:'Save review'}).click();
 await page.getByText('Registration: approved',{exact:false}).waitFor();
 assert.equal(requests.find(r=>r.path.endsWith('/review_partner_driver_registration')).body.p_registration_id,token);
 console.log('Partner driver UI: create registration, isolated real SDK signup, private link claim, Admin approval gating PASS');
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
