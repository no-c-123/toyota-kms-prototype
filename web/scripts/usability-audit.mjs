// Automated usability/accessibility audit of every page with axe-core (WCAG 2.1 A/AA rules)
// plus simple interaction timings. Requires the app running (npm run preview + node dev-server.mjs).
// Output: src/data/usability.json (shown on the Metrics page).
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('playwright')); }
const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const PAGES = ['asistente', 'explorar', 'clasificar', 'grafo', 'metricas', 'acerca'];
const browser = await chromium.launch();
const results = [];
for (const [device, viewport] of [['escritorio', { width: 1440, height: 900 }], ['móvil', { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport });
  for (const p of PAGES) {
    await page.goto(`${BASE}/#/${p}`);
    await page.waitForTimeout(p === 'grafo' ? 2500 : 600);
    await page.addScriptTag({ content: axeSource });
    const r = await page.evaluate(async () => {
      const out = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
      return { violations: out.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help })), passes: out.passes.length };
    });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    results.push({ device, page: p, ...r, horizontalScroll: overflow });
  }
  await page.close();
}
// task timing: ask the chatbot one question and wait for the answer
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/#/asistente`);
const t0 = Date.now();
await page.fill('#chat-input', '¿Qué hago si se derrama solvente?');
await page.click('.composer button[type=submit]');
await page.waitForSelector('.msg.assistant.intent-answer');
const chatMs = Date.now() - t0;
await browser.close();

const total = results.reduce((s, r) => s + r.violations.length, 0);
const serious = results.reduce((s, r) => s + r.violations.filter((v) => ['serious', 'critical'].includes(v.impact)).length, 0);
const report = {
  generated_at: new Date().toISOString(),
  tool: 'axe-core 4.10 (WCAG 2.1 A/AA) via Playwright/Chromium',
  pages_audited: results.length,
  total_violations: total, serious_or_critical: serious,
  rules_passed_avg: Math.round(results.reduce((s, r) => s + r.passes, 0) / results.length),
  pages_with_horizontal_scroll: results.filter((r) => r.horizontalScroll).map((r) => `${r.page} (${r.device})`),
  chat_answer_ms_end_to_end: chatMs,
  details: results,
};
fs.writeFileSync(new URL('../src/data/usability.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ total, serious, chatMs, overflow: report.pages_with_horizontal_scroll }));
for (const r of results) for (const v of r.violations) console.log(` ${r.device}/${r.page}: ${v.impact} ${v.id} (${v.nodes}) ${v.help}`);
