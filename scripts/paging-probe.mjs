#!/usr/bin/env node
// Which slides page or scroll (owner 28 Nov: no card pages, no scrolling instrument card). Opens every talk in the no-GPU layout page at one screen size, goes to each stop, waits for the cards to land and
// settle, and prints the stops whose words card has pages (`pageCount` > 1) or whose card holds something that scrolls.
//   node scripts/paging-probe.mjs <iphone|ipad|mac|...> [deck,deck] [--out file.json]
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { DEVICES } from '../src/ui/debug/devices.ts';
import { UI } from '../src/ui/strings.generated.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), size = args[0] ?? 'iphone';
const only = args[1] && !args[1].startsWith('--') ? args[1].split(',') : null;
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const d = DEVICES.find((x) => x.id === size);
if (!d) throw new Error(`unknown size ${size}`);
const ids = only ?? UI.decks.map((x) => x.id);
const { chromium } = createRequire(import.meta.url)('playwright');
const { createServer } = await import(pathToFileURL(resolve(ROOT, 'node_modules/vite/dist/node/index.js')).href);
const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ args: ['--disable-gpu', '--disable-webgl', '--disable-webgl2'] });
const found = [];
for (const id of ids) {
  const ctx = await browser.newContext({ viewport: { width: d.w, height: d.h }, deviceScaleFactor: 1, hasTouch: d.touch, isMobile: false });
  const p = await ctx.newPage();
  await p.addInitScript(() => { import('/src/ui/ui-store.ts').then((m) => { window.__ui = m.useUi.getState(); setInterval(() => { window.__ui = m.useUi.getState(); }, 100); }); });
  p.on('pageerror', (e) => console.error(id, 'page error', String(e.message).slice(0, 160)));
  try {
    await p.goto(`${base}/?layout&script=${id}&slide=1`, { waitUntil: 'commit', timeout: 60000 });
    await p.waitForFunction(() => window.__ui && window.__ui.stops.length > 0 && document.querySelectorAll('.dk-card[data-phase="in"]').length > 0, null, { timeout: 120000, polling: 300 });
    const n = await p.evaluate(async () => (await import('/src/ui/ui-store.ts')).useUi.getState().stops.length);
    let rows = 0;
    for (let k = 0; k < n; k++) {
      const r = await p.evaluate(async (k) => {
        const m = await import('/src/ui/ui-store.ts'), s = m.useUi.getState();
        s.go(k);
        const sleep = (ms) => new Promise((f) => setTimeout(f, ms));
        let last = '', still = 0;
        for (let t = 0; t < 120 && still < 6; t++) {
          await sleep(150);
          const cards = [...document.querySelectorAll('.dk-card[data-card]')];
          const sig = JSON.stringify([m.useUi.getState().pos, m.useUi.getState().pageCount, cards.map((c) => [c.getAttribute('data-phase'), Math.round(c.getBoundingClientRect().height)])]);
          const landed = cards.length > 0 && cards.every((c) => c.getAttribute('data-phase') === 'in');
          still = landed && sig === last ? still + 1 : 0; last = sig;
        }
        const st = m.useUi.getState();
        const scrolls = [];
        for (const c of document.querySelectorAll('.dk-card[data-card][data-phase="in"]')) {
          for (const e of [c, ...c.querySelectorAll('*')]) {
            const cs = getComputedStyle(e);
            if (/(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 1) scrolls.push(`${c.getAttribute('data-card')}: ${e.className} ${e.scrollHeight}>${e.clientHeight}`);
          }
        }
        const name = document.querySelector('.pz-pageno')?.textContent ?? null;
        return { stop: k, slide: st.stops[k]?.kind === 'slide' ? st.stops[k].slide.id : st.stops[k]?.kind, pages: st.pageCount, pageno: name, scrolls, landed: still >= 6 };
      }, k);
      rows++;
      if (r.pages > 1 || r.scrolls.length || !r.landed) { found.push({ size, deck: id, ...r }); console.log(JSON.stringify({ size, deck: id, ...r })); }
    }
    console.error(`${size} ${id}: ${n} stops`);
  } catch (e) { console.error(`${size} ${id}: failed ${String(e.message).slice(0, 200)}`); found.push({ size, deck: id, failed: true }); }
  await Promise.race([ctx.close(), new Promise((r) => setTimeout(r, 5000))]);
}
await browser.close(); await server.close();
if (out) writeFileSync(out, JSON.stringify(found, null, 1));
console.error(`${size}: ${found.length} entries`);
