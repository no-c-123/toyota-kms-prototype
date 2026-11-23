// Takes evidence screenshots of every page with Playwright (requires the app running:
// `npm run build && npm run preview` plus `node dev-server.mjs`). Output: ../docs/screenshots/
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('playwright')); }
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const OUT = new URL('../../docs/screenshots/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
const shot = (name, full = false) => page.screenshot({ path: `${OUT}${name}.png`, fullPage: full });

await page.goto(`${BASE}/#/asistente`);
await page.waitForSelector('.composer input');
for (const q of ['¿Qué hago si se derrama solvente en pintura?', '¿y a quién se evacua?'.replace('a quién se evacua', 'cuándo se evacua')]) {
  await page.fill('#chat-input', q);
  await page.click('.composer button[type=submit]');
  await page.waitForTimeout(700);
}
await page.fill('#chat-input', '¿Qué es el jidoka?');
await page.click('.composer button[type=submit]');
await page.waitForTimeout(900);
await shot('01-asistente');

await page.goto(`${BASE}/#/explorar`);
await page.fill('#search-input', 'ruido en la cabina');
await page.click('form[role=search] button[type=submit]');
await page.waitForTimeout(800);
await shot('02-explorar');
await page.click('.doc-card');
await page.waitForTimeout(700);
await shot('03-documento-relacionados');
await page.keyboard.press('Escape');

await page.goto(`${BASE}/#/clasificar`);
await page.click('.chips .chip >> nth=0');
await page.waitForTimeout(800);
await shot('04-clasificar');

await page.goto(`${BASE}/#/grafo`);
await page.waitForTimeout(3500);
await page.fill('#graph-q', 'andon');
await page.click('.graph-search button');
await page.waitForTimeout(1800);
await shot('05-grafo');

await page.goto(`${BASE}/#/metricas`);
await page.waitForTimeout(500);
await shot('06-metricas', true);

await page.goto(`${BASE}/#/acerca`);
await page.waitForTimeout(500);
await shot('07-arquitectura', true);

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await mobile.goto(`${BASE}/#/asistente`);
await mobile.fill('#chat-input', 'What permit do I need to enter a paint tank?');
await mobile.click('.composer button[type=submit]');
await mobile.waitForTimeout(900);
await mobile.screenshot({ path: `${OUT}08-movil.png` });
await browser.close();
console.log('Screenshots saved in docs/screenshots/');
