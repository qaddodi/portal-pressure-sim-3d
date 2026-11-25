#!/usr/bin/env node
// The tester guides' pictures (docs/guides.md): ten shots of the running 3D app, five screens on a Mac-size window (1440x900 at 2x) and on an iPhone-size one (390x844 at 3x), each cut to the
// shape of the place it has in the PDF (scripts/guides-edits.json `pictures`; copy-guides.py --refresh lays them in). Headless Chromium on SwiftShader, so a first page takes about a minute.
//
//   VITE_CHANNEL=preview VITE_BUILD=<branch>@<commit> VITE_FEEDBACK_EMAIL=feedback@example.invalid npx vite --port 5173 --host 127.0.0.1
//   node scripts/capture-guide-shots.mjs <outdir> [mac|phone] [url]
//   python3 scripts/copy-guides.py --refresh --shots <outdir>
//
// VITE_FEEDBACK_EMAIL is what makes the Settings menu show its Send feedback row; give it a made-up address, never the owner's (no picture shows it, and the guides carry no address).
// Needs Playwright (the cloud container has it; elsewhere `npm i -D playwright`). Writes <dev>-1-top, -2-menu, -3-tests, -4-vessel, -5-settings, and <dev>-full-N for a look at each whole screen.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const [, , OUT = 'guide-shots', ONLY = '', URL = 'http://127.0.0.1:5173/'] = process.argv;
mkdirSync(OUT, { recursive: true });
for (const DEV of ['mac', 'phone']) if (!ONLY || ONLY === DEV) await shoot(DEV);
async function shoot(DEV) {
const mac = DEV === 'mac';
const opts = mac ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }
  : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
const W = opts.viewport.width, H = opts.viewport.height;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const ctx = await b.newContext(opts); const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 300)));
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForSelector('#btnMenu', { timeout: 150000 });
  await sleep(10000);
  const tap = (sel) => p.locator(sel).first().click();
  const full = (n) => p.screenshot({ path: `${OUT}/${DEV}-full-${n}.png` });
  const clip = (n, x, y, w, h) => p.screenshot({ path: `${OUT}/${DEV}-${n}.png`, clip: { x, y, width: w, height: h } });
  const rect = (sel) => p.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel);
  // an orange ring (the colour of the PREVIEW tab) round an element; removed by hl(null)
  const hl = (sel, pad = 4) => p.evaluate(([s, pad]) => {
    document.getElementById('guide-hl')?.remove();
    if (!s) return;
    const el = document.querySelector(s); if (!el) return;
    const r = el.getBoundingClientRect(), col = getComputedStyle(document.getElementById('preview-badge')).backgroundColor;
    const d = document.createElement('div'); d.id = 'guide-hl';
    d.style.cssText = `position:fixed;z-index:99999;pointer-events:none;border:2.5px solid ${col};border-radius:10px;left:${r.x - pad}px;top:${r.y - pad}px;width:${r.width + 2 * pad}px;height:${r.height + 2 * pad}px;`;
    document.body.appendChild(d);
  }, [sel, pad]);
  const pill = await rect('#preview-badge');
  const info = await p.evaluate(() => ({ pill: document.getElementById('preview-badge')?.textContent, ua: navigator.userAgent.slice(0, 40) }));
  console.log(DEV, JSON.stringify(info), JSON.stringify(pill));

  // 1. top bar with the PREVIEW tab
  if (mac) await clip('1-top', pill.x - 4, 0, 398, 58);   // (from the PREVIEW tab to the end of the pressure key: Treat and Tests stay out)
  else await clip('1-top', 0, 0, 390, 70);
  await full('1');

  // 2. main menu open
  await hl('#btnMenu'); await tap('#btnMenu'); await sleep(2500);
  await hl('#btnMenu'); await full('2');
  if (mac) await clip('2-menu', 0, 0, 490, 750); else await clip('2-menu', 0, 0, 390, 260);
  await p.keyboard.press('Escape'); await sleep(1500);
  if (await p.locator('.sh-sheet[data-open="true"], .menu').count()) { await hl(null); }

  // 3. Tests open
  await hl(null);
  await tap(mac ? '#tabInstruments' : '.nb-tab[data-tab="tests"]'); await sleep(6000);
  await hl(mac ? '#tabInstruments' : '.nb-tab[data-tab="tests"]'); await full('3');
  if (mac) await clip('3-tests', W - 870, 0, 870, 777); else await clip('3-tests', 0, H - 554, 390, 554);
  await tap(mac ? '#tabInstruments' : '.nb-tab[data-tab="tests"]'); await sleep(2500); await hl(null);

  // 4. a vessel card (portal vein): scan a few points just right of its label until the card ("Narrow" slider) shows
  await p.keyboard.press('Escape'); await sleep(1500);
  const target = mac ? [700, 392] : [186, 372];
  const shot = (await p.screenshot()).toString('base64');
  const cands = await p.evaluate(async ([b64, tx, ty, dsf, H, W]) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data, out = [];
    for (let y = 100 * dsf; y < (H - 220) * dsf; y += 3) for (let x = 0; x < W * dsf; x += 3) {
      const i = (y * c.width + x) * 4, r = d[i], gg = d[i + 1], bb = d[i + 2];
      if (bb > 170 && bb - r > 80 && bb - gg > 50) out.push([x / dsf, y / dsf, Math.hypot(x / dsf - tx, y / dsf - ty)]);
    }
    return out.sort((a, b) => a[2] - b[2]);
  }, [shot, target[0], target[1], opts.deviceScaleFactor, H, W]);
  console.log('blue candidates', cands.length, JSON.stringify(cands.slice(0, 3)));
  let hit = false;
  const which = () => p.evaluate(() => { const e = [...document.querySelectorAll('body *')].find((x) => x.children.length === 0 && (x.textContent || '').trim() === 'Stenosis' && x.getBoundingClientRect().width > 0); if (!e) return ''; const c = e.closest('.card,[class*=vcard],[role=dialog],section,aside') || e.parentElement.parentElement; return (c.innerText || '').trim().slice(0, 40).replace(/\n/g, ' | '); });
  for (let k = 0; k < Math.min(cands.length, 90) && !hit; k += 3) {
    await p.mouse.click(cands[k][0], cands[k][1]); await sleep(2500);
    const w = await which(); if (w) console.log('card', JSON.stringify(w), 'at', cands[k]);
    if (/portal vein|^PV/i.test(w)) hit = true;
  }
  if (!hit) console.log('NO VESSEL CARD');
  await sleep(3500); await full('4');
  if (mac) await clip('4-vessel', 0, 0, 920, 660); else await clip('4-vessel', 0, H - 604, 390, 604);
  await p.keyboard.press('Escape'); await sleep(1500);

  // 5. settings: Send feedback
  await tap(mac ? '#btnSettings' : '.nb-tab[data-tab="settings"]'); await sleep(3000);
  const fb = p.getByText('Send feedback').first();
  console.log('feedback row', await fb.isVisible().catch(() => false));
  const fr = await fb.evaluate((e) => { const r = (e.closest('button,[role=menuitem],li,a') || e).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await p.evaluate(([x, y, w, h]) => { const col = getComputedStyle(document.getElementById('preview-badge')).backgroundColor, d = document.createElement('div'); d.id = 'guide-hl'; d.style.cssText = `position:fixed;z-index:99999;pointer-events:none;border:2.5px solid ${col};border-radius:8px;left:${x - 3}px;top:${y - 3}px;width:${w + 6}px;height:${h + 6}px;`; document.body.appendChild(d); }, [fr.x, fr.y, fr.w, fr.h]);
  if (mac) await p.evaluate(() => { const r = document.getElementById('btnSettings').getBoundingClientRect(), col = getComputedStyle(document.getElementById('preview-badge')).backgroundColor, d = document.createElement('div'); d.style.cssText = `position:fixed;z-index:99999;pointer-events:none;border:2.5px solid ${col};border-radius:10px;left:${r.x - 4}px;top:${r.y - 4}px;width:${r.width + 8}px;height:${r.height + 8}px;`; document.body.appendChild(d); });
  await full('5');
  if (mac) await clip('5-settings', W - 480, 0, 480, 270); else await clip('5-settings', 0, Math.max(0, fr.y - 60), 390, 160);
  await b.close();
}
