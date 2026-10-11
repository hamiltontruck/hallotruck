import { spawn, spawnSync } from "node:child_process";
import { readdir, rm, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import path from "node:path";

const root=process.cwd(),host="127.0.0.1",port=4198,baseUrl=`http://${host}:${port}/hallotruck/`;
const viteEntry=path.join(root,"node_modules","vite","bin","vite.js"),fixture=path.join(root,"dist","partner-smart-order-v2-e2e.html");
function chrome(){for(const c of [process.env.CHROME_BIN,"google-chrome","google-chrome-stable","chromium","chromium-browser"].filter(Boolean)){const r=spawnSync(c,["--version"],{encoding:"utf8"});if(!r.error&&r.status===0){if(path.isAbsolute(c))return c;const resolved=spawnSync("which",[c],{encoding:"utf8"});if(resolved.status===0)return resolved.stdout.trim();}}throw new Error("No supported Chrome/Chromium binary found.");}
async function wait(){for(let i=0;i<120;i+=1){try{if((await fetch(baseUrl)).ok)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw new Error("Preview server did not start.");}
const assets=await readdir(path.join(root,"dist","assets"));const css=assets.find(f=>/^index-.*\.css$/.test(f));if(!css)throw new Error("Built CSS not found.");
await writeFile(fixture,`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./assets/${css}"></head><body><main class="min-h-screen overflow-x-hidden bg-[#f5f3ed] px-4 py-6 text-asphalt sm:px-7"><section class="mx-auto max-w-3xl"><p>PARTNER SMART ORDER V2 · ROUTE</p><h1 class="text-3xl font-bold">Choose pickup and destination</h1><div class="mt-5 grid min-w-0 gap-4"><input class="min-h-12 min-w-0 w-full border px-3" value="Adama, Ethiopia"><input class="min-h-12 min-w-0 w-full border px-3" value="Djibouti, Djibouti"><div class="h-[52vh] min-h-72 w-full overflow-hidden border"></div><dl class="partner-smart-metrics grid min-w-0 grid-cols-2 gap-3 bg-white p-4 text-center"><div><dt>Distance</dt><dd>755.2 km</dd></div><div><dt>ETA</dt><dd>703 min</dd></div></dl></div></section></main><script>requestAnimationFrame(()=>requestAnimationFrame(()=>{document.documentElement.dataset.overflow=String(document.documentElement.scrollWidth>document.documentElement.clientWidth||document.body.scrollWidth>document.documentElement.clientWidth);document.documentElement.dataset.ready="true";}));</script></body></html>`,"utf8");
const preview=spawn(process.execPath,[viteEntry,"preview","--host",host,"--port",String(port),"--strictPort"],{cwd:root,stdio:"ignore"});
let browser;
try {
  await wait();
  browser = await chromium.launch({ executablePath: chrome(), args: ["--no-sandbox", "--disable-gpu"] });
  for (const width of [320, 360, 390, 412]) {
    const page = await browser.newPage({ viewport: { width, height: 1200 } });
    try {
      await page.goto(`${baseUrl}partner-smart-order-v2-e2e.html`, { waitUntil: "load" });
      // DOM dump can finish before animation-frame callbacks run. Wait for the
      // fixture's readiness condition instead of accepting a premature snapshot.
      await page.waitForFunction(() => document.documentElement.dataset.ready === "true", undefined, { timeout: 10000 });
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth || document.body.scrollWidth > document.documentElement.clientWidth);
      if (overflow) throw new Error(`V2 ${width}px smoke has horizontal overflow`);
      const dom = await page.content();
      for (const expected of ['data-ready="true"', 'data-overflow="false"', "PARTNER SMART ORDER V2", "Distance", "ETA"]) {
        if (!dom.includes(expected)) throw new Error(`V2 ${width}px smoke missing ${expected}`);
      }
    } finally { await page.close(); }
  }
  console.log("Partner Smart Order V2 responsive smoke passed at 320, 360, 390 and 412px.");
} finally {
  if (browser) await browser.close();
  preview.kill("SIGTERM");
  await rm(fixture, { force: true });
}
