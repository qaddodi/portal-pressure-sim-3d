#!/usr/bin/env node
// Card CSS twins, before and after (scripts/dk-in-twins.mjs): the 3D card is `.dk-card.pz-data > .dk-in > (.pz-dh, .pz-tool, ...)`, the 2D rules say `.pz-data > .pz-tool`. This opens the same slides on two
// dev servers (twins off, twins on), on an iPhone, an iPad and a Mac sized window, and writes for each: a screenshot of the cards, and the measurements of every card's header, tool and data box (size, font size,
// zoom, container type, display). `node scripts/capture-card-twins.mjs --diff <outdir>` lists what moved.
//
//   VITE_CHANNEL=preview npx vite --port 5173 --host 127.0.0.1                     (twins off)
//   PPS_DK_TWINS=1 VITE_CHANNEL=preview npx vite --port 5174 --host 127.0.0.1       (twins on)
//   node scripts/capture-card-twins.mjs <outdir> [off|on] [iphone|ipad|mac]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

/** One slide of each card kind the twin rules touch: [deck, slide number (1-based), what it shows]. */
export const SLIDES = [
  ['albumin', 1, 'criteria'], ['albumin', 2, 'abdomen'], ['albumin', 3, 'flowtime'], ['ascites', 1, 'fluid'], ['ascites', 9, 'doppler'], ['ascites', 10, 'saag'],
  ['budd-chiari', 8, 'flows'], ['carvedilol', 4, 'hvpg'], ['carvedilol', 11, 'profile'], ['circuit', 2, 'profile only'], ['cause-treated', 1, 'fibroscan'],
  ['cause-treated', 4, 'tiles only'], ['cause-treated', 13, 'curve'], ['day', 4, 'trace'], ['doppler', 1, 'doppler only'], ['endoscopy', 1, 'scope'], ['gradients', 2, 'reading'],
];
export const DEVICES = {
  iphone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  ipad: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  mac: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
};
const PORTS = { off: 5173, on: 5174 };

/** What the page reports about every card: run in the page. */
export function measure() {
  const r = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
  const out = [];
  for (const card of document.querySelectorAll('.dk-card')) {
    const row = { card: card.dataset.card, rect: r(card), parts: {} };
    for (const sel of ['.pz-dh', '.pz-tool', '.pz-ghost', '.pz-dh .pz-h', '.pz-dh .pz-reads']) {
      const e = card.querySelector(sel); if (!e) continue;
      const c = getComputedStyle(e);
      row.parts[sel] = { rect: r(e), fontSize: c.fontSize, zoom: c.zoom, containerType: c.containerType, display: c.display, width: c.width };
    }
    out.push(row);
  }
  return out;
}

if (process.argv[2] === '--diff') {
  const dir = process.argv[3];
  let moved = 0, same = 0;
  for (const dev of Object.keys(DEVICES)) for (const [deck, n, what] of SLIDES) {
    const f = (v) => `${dir}/${v}-${dev}-${deck}-${n}.json`;
    if (!existsSync(f('off')) || !existsSync(f('on'))) { console.log(`${dev} ${deck}#${n} ${what}: missing`); continue; }
    const a = JSON.parse(readFileSync(f('off'), 'utf8')), b = JSON.parse(readFileSync(f('on'), 'utf8'));
    const d = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i], y = b[i];
      if (!x || !y) { d.push(`card ${i} only in ${x ? 'off' : 'on'}`); continue; }
      if (JSON.stringify(x.rect) !== JSON.stringify(y.rect)) d.push(`${x.card}: card ${x.rect} -> ${y.rect}`);
      for (const k of new Set([...Object.keys(x.parts), ...Object.keys(y.parts)])) if (JSON.stringify(x.parts[k]) !== JSON.stringify(y.parts[k])) d.push(`${x.card} ${k}: ${JSON.stringify(x.parts[k])} -> ${JSON.stringify(y.parts[k])}`);
    }
    if (d.length) { moved++; console.log(`${dev} ${deck}#${n} (${what}) MOVED\n  ${d.join('\n  ')}`); } else same++;
  }
  console.log(`${moved} moved, ${same} the same`);
} else {
  const { chromium } = createRequire(import.meta.url)('playwright');
  const [, , OUT = 'card-twins', VARIANT = '', DEV = ''] = process.argv;
  mkdirSync(OUT, { recursive: true });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const v of ['off', 'on']) if (!VARIANT || VARIANT === v) for (const dev of Object.keys(DEVICES)) if (!DEV || DEV === dev) {
    const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
    const p = await (await b.newContext(DEVICES[dev])).newPage();
    p.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 200)));
    for (const [deck, n, what] of SLIDES) {
      const t0 = Date.now();
      await p.goto(`http://127.0.0.1:${PORTS[v]}/?script=${deck}&slide=${n}`, { waitUntil: 'load' });
      try { await p.waitForSelector('.dk-card[data-phase="on"], .dk-card', { timeout: 240000 }); } catch { console.log(`${v} ${dev} ${deck}#${n}: no card`); }
      await sleep(9000);
      const base = `${OUT}/${v}-${dev}-${deck}-${n}`;
      writeFileSync(`${base}.json`, JSON.stringify(await p.evaluate(measure)));
      await p.screenshot({ path: `${base}.png` });
      console.log(`${v} ${dev} ${deck}#${n} ${what} ${(Date.now() - t0) / 1000 | 0}s`);
    }
    await b.close();
  }
}
