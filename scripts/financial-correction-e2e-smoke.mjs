import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const host = "127.0.0.1";
const port = 4188;
const baseUrl = `http://${host}:${port}/hallotruck/`;
const viteBinary = path.join(root,"node_modules",".bin",process.platform==="win32"?"vite.cmd":"vite");
const esbuildBinary = path.join(root,"node_modules",".bin",process.platform==="win32"?"esbuild.cmd":"esbuild");
const testDirectory = path.join(root,".financial-correction-e2e");
const entryFile = path.join(testDirectory,"entry.mjs");
const bundleFile = path.join(root,"dist","financial-correction-e2e.js");
const htmlFile = path.join(root,"dist","financial-correction-e2e.html");

function findChrome(){for(const candidate of [process.env.CHROME_BIN,"google-chrome","google-chrome-stable","chromium","chromium-browser"].filter(Boolean)){const result=spawnSync(candidate,["--version"],{encoding:"utf8"});if(!result.error&&result.status===0)return candidate;}throw new Error("No supported Chrome/Chromium binary found.");}
async function waitForServer(url,timeoutMs=30000){const deadline=Date.now()+timeoutMs;while(Date.now()<deadline){try{const response=await fetch(url);if(response.ok)return;}catch{/* retry */}await new Promise(resolve=>setTimeout(resolve,250));}throw new Error("Preview server did not start in time.");}
function render(chrome,width,profile){const args=["--no-sandbox","--disable-gpu","--disable-dev-shm-usage","--hide-scrollbars",`--window-size=${width},915`,"--virtual-time-budget=3000",`--user-data-dir=${profile}`,"--dump-dom",`${baseUrl}financial-correction-e2e.html`];for(const flag of ["--headless=new","--headless"]){const result=spawnSync(chrome,[flag,...args],{cwd:root,encoding:"utf8",maxBuffer:20*1024*1024,timeout:30000});if(!result.error&&result.status===0&&result.stdout)return result.stdout;}throw new Error(`Chrome could not render financial correction at ${width}px.`);}

await mkdir(testDirectory,{recursive:true});
const assetFiles=await readdir(path.join(root,"dist","assets"));
const cssFile=assetFiles.find(file=>/^index-.*\.css$/.test(file));
if(!cssFile)throw new Error("Built CSS not found.");
const fixtureSource=`
import React from "react";
import { createRoot } from "react-dom/client";
import { PaymentCorrectionForm } from ${JSON.stringify(path.join(root,"src","components","admin","PaymentCorrectionForm.tsx"))};
const pendingCorrection=()=>new Promise(()=>{});
createRoot(document.getElementById("root")).render(React.createElement("main",{className:"min-h-screen overflow-x-hidden bg-[#f5f3ed] p-3"},React.createElement(PaymentCorrectionForm,{paymentId:"payment-fixture",paymentAmountEtb:24500,onCancel:()=>{},onSubmitted:async()=>{},submitCorrection:pendingCorrection})));
await new Promise(resolve=>setTimeout(resolve,200));
const form=document.querySelector("form");
const reason=document.querySelector('textarea[name="correctionReason"]');
if(form&&reason){reason.value="Duplicate payment correction";form.requestSubmit();}
await new Promise(resolve=>setTimeout(resolve,250));
const guidance=document.querySelector('[role="status"]');
const cancelButton=document.querySelector('button[type="button"]');
const submitButton=document.querySelector('button[type="submit"]');
const fields=[...document.querySelectorAll("select,input,textarea")];
const busyReason="Recording this immutable correction. Wait for the ledger update to finish before closing or changing the form.";
document.documentElement.dataset.busyGuidance=String(Boolean(guidance&&guidance.textContent?.includes(busyReason)));
document.documentElement.dataset.formBusy=String(form?.getAttribute("aria-busy")==="true"&&form?.getAttribute("aria-describedby")===guidance?.id);
document.documentElement.dataset.fieldsDisabled=String(fields.length===3&&fields.every(field=>field.disabled&&field.getAttribute("aria-describedby")===guidance?.id));
document.documentElement.dataset.describedDisabled=String(Boolean(cancelButton?.disabled&&submitButton?.disabled&&cancelButton.getAttribute("aria-describedby")===guidance?.id&&submitButton.getAttribute("aria-describedby")===guidance?.id&&cancelButton.title===busyReason&&submitButton.title===busyReason));
document.documentElement.dataset.submitLabel=String(Boolean(submitButton?.textContent?.includes("Recording correction")));
document.documentElement.dataset.overflow=String(document.documentElement.scrollWidth>document.documentElement.clientWidth||document.body.scrollWidth>document.body.clientWidth);
document.documentElement.dataset.ready="true";
`;
await writeFile(entryFile,fixtureSource,"utf8");
const bundled=spawnSync(esbuildBinary,[entryFile,"--bundle","--platform=browser","--format=esm","--target=chrome120",`--outfile=${bundleFile}`,"--define:import.meta.env.VITE_SUPABASE_URL=\"https://example.supabase.co\"","--define:import.meta.env.VITE_SUPABASE_ANON_KEY=\"ci-anon-key\""],{cwd:root,encoding:"utf8"});
if(bundled.status!==0)throw new Error(bundled.stderr||"Financial correction fixture bundle failed.");
await writeFile(htmlFile,`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="./assets/${cssFile}"></head><body><div id="root"></div><script type="module" src="./financial-correction-e2e.js"></script></body></html>`,"utf8");

const preview=spawn(viteBinary,["preview","--host",host,"--port",String(port),"--strictPort"],{cwd:root,stdio:["ignore","pipe","pipe"]});
try{
  await waitForServer(baseUrl);
  const chrome=findChrome();
  for(const width of [320,360,390,412,430,768]){
    const profile=await mkdtemp(path.join(os.tmpdir(),"hallotruck-financial-correction-"));
    try{const dom=render(chrome,width,profile);for(const expected of ['data-ready="true"','data-overflow="false"','data-busy-guidance="true"','data-form-busy="true"','data-fields-disabled="true"','data-described-disabled="true"','data-submit-label="true"',"Recording this immutable correction","Correction type","Correction amount ETB","Required audit reason","Recording correction"]){if(!dom.includes(expected))throw new Error(`Financial correction ${width}px smoke missing: ${expected}`);}}finally{await rm(profile,{recursive:true,force:true});}
  }
  console.log("Financial correction browser smoke passed at 320px, 360px, 390px, 412px, 430px and 768px with visible busy guidance, described disabled controls, locked inputs and no horizontal overflow.");
}finally{
  preview.kill("SIGTERM");
  await Promise.race([new Promise(resolve=>preview.once("exit",resolve)),new Promise(resolve=>setTimeout(resolve,2000))]);
  if(preview.exitCode===null)preview.kill("SIGKILL");
  await Promise.all([rm(testDirectory,{recursive:true,force:true}),rm(bundleFile,{force:true}),rm(htmlFile,{force:true})]);
}
