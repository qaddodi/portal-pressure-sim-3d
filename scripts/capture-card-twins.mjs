#!/usr/bin/env node
// Card CSS twins, before and after (scripts/dk-in-twins.mjs): the 3D card is `.dk-card.pz-data > .dk-in > (.pz-dh, .pz-tool, ...)`, the 2D rules say `.pz-data > .pz-tool`. This opens the same slides on two
// dev servers (twins off, twins on), on an iPhone, an iPad and a Mac sized window, and writes for each: a screenshot of the cards, and the measurements of every card's header, tool and data box (size, font size,
// zoom, container type, display). `node scripts/capture-card-twins.mjs --diff <outdir>` lists what moved.
//
//   VITE_CHANNEL=preview npx vite --port 5173 --host 127.0.0.1                     (twins off)
//   (the twins are on by default since 27 Nov; to capture "off" again, take dkInTwins() out of vite.config.ts for that server)
//   node scripts/capture-card-twins.mjs <outdir> [off|on] [iphone|ipad|mac]
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';

/** The decks walked, and how many slides of each: the walk presses the arrow key and stops to capture whenever a card kind (a tool's `data-kind`, or tiles alone) shows that this walk has not seen yet. */
const ALL = [['albumin', 12], ['ascites', 16], ['budd-chiari', 10], ['carvedilol', 14], ['cause-treated', 14], ['day', 8], ['endoscopy', 8]];
/** CAP_DECKS=albumin,cause-treated walks only those (a window of a Mac's size takes long on software GL). */
export const DECKS = process.env.CAP_DECKS ? ALL.filter(([d]) => process.env.CAP_DECKS.split(',').includes(d)) : ALL;
export const DEVICES = {
  iphone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  ipad: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  mac: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};
const PORTS = { off: 5173, on: 5174 };

/** What the page reports about every card: run in the page. */
export function measure() {
  const r = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
  const out = [];
  for (const card of document.querySelectorAll('.dk-card')) {
    const row = { card: card.dataset.card, kind: card.querySelector('.pz-tool')?.dataset.kind ?? null, rect: r(card), parts: {} };
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
  const { readdirSync } = await import('node:fs');
  const dir = process.argv[3];
  let moved = 0, same = 0;
  for (const f of readdirSync(dir).filter((n) => n.startsWith('off-') && n.endsWith('.json')).sort()) {
    // (the walk may reach a card a slide apart in the two runs, so a pair is the same device, deck and card kind, whatever the slide number)
    const name = f.slice(4, -5), key = (n) => n.replace(/-\d+-/, '-'), g = readdirSync(dir).find((n) => n.startsWith('on-') && n.endsWith('.json') && key(n.slice(3, -5)) === key(name));
    if (!g) { console.log(`${name}: no twin-on capture`); continue; }
    const a = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')), b = JSON.parse(readFileSync(`${dir}/${g}`, 'utf8'));
    const d = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i], y = b[i];
      if (!x || !y) { d.push(`card ${i} only in ${x ? 'off' : 'on'}`); continue; }
      for (const k of new Set([...Object.keys(x.parts), ...Object.keys(y.parts)])) if (JSON.stringify(x.parts[k]) !== JSON.stringify(y.parts[k])) d.push(`${x.card} ${k}: ${JSON.stringify(x.parts[k])} -> ${JSON.stringify(y.parts[k])}`);
    }
    if (d.length) { moved++; console.log(`${name} MOVED\n  ${d.join('\n  ')}`); } else same++;
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
    const seen = new Set();
    for (const [deck, count] of DECKS) {
      await p.goto(`http://127.0.0.1:${PORTS[v]}/?script=${deck}&slide=1`, { waitUntil: 'load' });
      try { await p.waitForSelector('.dk-card', { timeout: 240000 }); } catch { console.log(`${v} ${dev} ${deck}: no card`); }
      await sleep(6000);
      for (let n = 1; n <= count; n++) {
        if (n > 1) { await p.keyboard.press('ArrowRight'); await sleep(3500); }
        const cards = await p.evaluate(measure);
        const kinds = cards.map((c) => c.kind ?? (c.parts['.pz-dh'] ? 'tiles' : null)).filter(Boolean);
        const fresh = [...new Set(kinds)].filter((k) => !seen.has(k));
        if (!fresh.length) continue;
        fresh.forEach((k) => seen.add(k));
        const base = `${OUT}/${v}-${dev}-${deck}-${n}-${fresh.join('+')}`;
        await sleep(2500);
        writeFileSync(`${base}.json`, JSON.stringify(await p.evaluate(measure)));
        try { await p.screenshot({ path: `${base}.png`, timeout: 240000 }); } catch (e) { console.log(`${base}: no screenshot (${String(e).slice(0, 60)})`); }
        console.log(`${v} ${dev} ${deck}#${n} ${fresh.join('+')}`);
      }
    }
    await b.close();
  }
}
