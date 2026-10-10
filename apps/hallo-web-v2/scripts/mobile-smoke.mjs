import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const widths = [320, 360, 390, 412];
const pages = [
  { path: '/', label: 'landing' },
  { path: '/admin-design', label: 'admin' },
];
const origin = process.env.V2_SMOKE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
let failures = 0;
await mkdir('qa-screenshots', { recursive: true });
try {
  for (const width of widths) {
    for (const pageInfo of pages) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', err => errors.push(err.message));
      await page.goto(origin + pageInfo.path, { waitUntil: 'networkidle' });
      await page.screenshot({ path: `qa-screenshots/${pageInfo.label}-${width}.png`, fullPage: true });
      const measure = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
        heading: !!document.querySelector('h1'),
      }));
      const ok = measure.scroll <= measure.viewport + 1 && measure.heading && errors.length === 0;
      console.log(`${ok ? 'PASS' : 'FAIL'} ${pageInfo.label} ${width}px: scrollWidth=${measure.scroll} viewport=${measure.viewport} heading=${measure.heading} errors=${errors.join(';')}`);
      if (!ok) failures++;
      if (pageInfo.label === 'admin') {
        const cards = await page.locator('.ceo-mobile-trip').count();
        const tableVisible = await page.locator('.ceo-table-scroll').isVisible();
        const cardVisible = await page.locator('.ceo-mobile-trips').isVisible();
        if (cards < 1 || !cardVisible || tableVisible) {
          failures++;
          console.log(`FAIL admin ${width}px: cards=${cards} cardsVisible=${cardVisible} tableVisible=${tableVisible}`);
        }
      }
      await page.close();
    }
  }
} finally {
  await browser.close();
}
if (failures) {
  console.error(`${failures} V2 mobile smoke failures`);
  process.exitCode = 1;
}
