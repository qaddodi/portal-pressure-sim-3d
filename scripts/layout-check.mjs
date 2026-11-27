#!/usr/bin/env node
// `npm run layout-check`: the no-GPU headless run for everything that is not pixels (card sizes, placement, clipping, overlap, covered text, labels, menus, the copyright line).
// It starts the dev server, opens the app with `?layout&audit=here` (no WebGL, no figure drawn: src/boot/layout-only.ts) in a headless Chromium at each screen size, walks the
// self-test at speed 20 and prints only the layout findings. Timing findings (frame rates, stalls, fades) are not valid without a GPU and are left out, and said so.
// Full GPU runs stay for how the figure looks (colour, shape, shaders). The owner's rule 20 still applies: a headless run needs his OK, each time, unless he has said otherwise.
//
//   npm run layout-check [-- --sizes iphone,ipad,mac] [--depth quick|full] [--speed 20] [--json] [--print]
//
// Exit 0: no layout finding. Exit 1: findings (listed). Exit 2: the run itself failed (no browser, page error).
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { FRAME_LIMITED_KINDS } from '../src/ui/debug/audit/speed.ts';
import { DEVICES } from '../src/ui/debug/devices.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Findings that read frames, the GPU or the speed of a fade: not valid with no figure drawn and a sped-up clock. */
export const NOT_LAYOUT = new Set([...FRAME_LIMITED_KINDS, 'stall', 'low-fps', 'gpu-bound', 'gpu-memory-climb', 'slow-load', 'anim-too-fast', 'fade-slow', 'fade-instant', 'fade-under-stall', 'tab-hidden']);
export const DEFAULT_SIZES = ['iphone', 'ipad', 'mac'];

/** The command line as plain choices. Pure (tests/layout-check.test.ts). */
export function parseArgs(argv) {
  const o = { sizes: DEFAULT_SIZES, depth: 'quick', speed: 20, json: false, print: false, capMs: 600000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sizes') o.sizes = String(argv[++i] ?? '').split(',').filter(Boolean);
    else if (a === '--depth') o.depth = argv[++i] === 'full' ? 'full' : 'quick';
    else if (a === '--speed') o.speed = Math.max(1, Math.min(20, Number(argv[++i]) || 20));
    else if (a === '--cap') o.capMs = Math.max(10, Number(argv[++i]) || 600) * 1000;
    else if (a === '--json') o.json = true;
    else if (a === '--print') o.print = true;
  }
  const bad = o.sizes.filter((s) => !DEVICES.some((d) => d.id === s));
  if (bad.length) throw new Error(`unknown size: ${bad.join(', ')} (known: ${DEVICES.map((d) => d.id).join(', ')})`);
  return o;
}

/** The layout findings of one audit run's data: [{ step, kind, sev, what, where }], the timing kinds left out. Pure. */
export function layoutFindings(data) {
  const out = [];
  for (const r of data?.rows ?? []) {
    for (const f of r.flags ?? []) {
      if (NOT_LAYOUT.has(f.kind) || f.sev === 'info') continue;
      out.push({ step: `${r.group} > ${r.label}`, kind: f.kind, sev: f.sev, what: f.what, where: f.where });
    }
  }
  return out;
}

/** The address one size opens. Pure. */
export const addressOf = (base, o) => `${base}/?layout&audit=here&speed=${o.speed}&depth=${o.depth}`;

const say = (m) => console.log(`[layout-check ${new Date().toISOString().slice(11, 19)}] ${m}`);

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.print) { console.log(addressOf('http://localhost:<port>', o), o.sizes.join(',')); return 0; }
  spawnSync(process.execPath, [resolve(ROOT, 'scripts/ensure-baked.mjs')], { stdio: 'inherit' });
  let chromium;
  try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { console.error('layout-check: playwright is not installed here (the cloud container has it; on a Mac: npm i -g playwright)'); return 2; }
  const { createServer } = await import(pathToFileURL(resolve(ROOT, 'node_modules/vite/dist/node/index.js')).href);
  const t0 = Date.now();
  const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
  await server.listen(); say('dev server up');
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const browser = await chromium.launch({ args: ['--disable-gpu', '--disable-webgl', '--disable-webgl2'] });
  say('browser launched');
  let all = [], failed = false;
  try {
    for (const id of o.sizes) {
      const d = DEVICES.find((x) => x.id === id);
      const ctx = await browser.newContext({ viewport: { width: d.w, height: d.h }, deviceScaleFactor: 1, hasTouch: d.touch, isMobile: false });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e.message ?? e)));
      const s0 = Date.now(), lines = [], open = new Set();
      page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning' || /boot|audit/i.test(m.text())) lines.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
      page.on('request', (r) => open.add(r.url())); page.on('requestfinished', (r) => open.delete(r.url())); page.on('requestfailed', (r) => { open.delete(r.url()); lines.push(`request failed: ${r.url()}`); });
      say(`opening ${addressOf(base, o)}`);
      await page.goto(addressOf(base, o), { waitUntil: 'commit', timeout: 60000 }); say('page answered');
      try { await page.waitForFunction(() => window.pps && window.pps.audit, null, { timeout: 90000, polling: 200 }); } catch (e) {
        // (the page never reached the self-test: say where it stands, so the cause is read from the output and not guessed)
        const where = await Promise.race([new Promise((r) => setTimeout(() => r('the page does not answer (its main thread is busy)'), 8000)), page.evaluate(() => ({ boot: document.documentElement.dataset.boot, cover: document.getElementById('boot')?.className, root: document.getElementById('root')?.childElementCount, errs: window.ppsBootErrors })).catch(() => null)]);
        console.error(`${id}: the page did not reach the self-test in 90 s after ${((Date.now() - s0) / 1000).toFixed(1)} s`, JSON.stringify(where));
        console.error(lines.slice(0, 15).join('\n')); console.error(`still loading: ${[...open].slice(0, 10).join(' | ')}`);
        await Promise.race([ctx.close(), new Promise((r) => setTimeout(r, 5000))]); failed = true; continue;
      }
      // (the walk is capped, so a stuck page ends the run with its state printed and never waits for ever)
      say(`${id}: self-test running`);
      // (progress: the panel's own status line every 10 s while the walk runs, so a slow or stuck step is named in the output)
      let lastStatus = '';
      const ticker = setInterval(() => {
        Promise.race([page.evaluate(() => `${document.querySelector('#au-root [role=status]')?.textContent ?? ''} | ${document.querySelector('#au-root progress')?.value ?? ''}%`), new Promise((r) => setTimeout(() => r('(page busy)'), 4000))])
          .then((t) => { if (t !== lastStatus) { lastStatus = t; say(`${id}: ${String(t).slice(0, 160)}`); } }).catch(() => undefined);
      }, 10000);
      const json = await Promise.race([
        page.evaluate(async (depth) => { await window.pps.audit.run(depth); return window.pps.audit.json(); }, o.depth),
        new Promise((r) => setTimeout(() => r(null), o.capMs)),
      ]);
      clearInterval(ticker);
      if (!json) { console.error(`${id}: the self-test did not finish in ${o.capMs / 1000} s`); failed = true; await Promise.race([ctx.close(), new Promise((r) => setTimeout(r, 5000))]); continue; }
      const bundle = JSON.parse(json);
      const part = bundle.parts?.[0];
      const found = layoutFindings(part).map((f) => ({ size: id, ...f }));
      all = all.concat(found);
      if (errors.length) { failed = true; console.error(`${id}: page errors: ${errors.slice(0, 3).join(' | ')}`); }
      console.log(`${id} ${d.w}x${d.h}: ${part?.rows?.length ?? 0} steps, ${found.length} layout finding(s), ${((Date.now() - s0) / 1000).toFixed(1)} s`);
      await ctx.close();
    }
  } finally { await browser.close(); await server.close(); }
  if (o.json) console.log(JSON.stringify(all, null, 1));
  else for (const f of all) console.log(`  [${f.size}] ${f.sev} ${f.kind}: ${f.step}: ${f.what}${f.where ? ` (${f.where})` : ''}`);
  console.log(`layout-check: ${all.length} finding(s), ${((Date.now() - t0) / 1000).toFixed(1)} s in all. Layout only: the figure was not drawn, so colour, shape and shaders are not checked; frame rates and fades are left out.`);
  return failed ? 2 : all.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(2); });
