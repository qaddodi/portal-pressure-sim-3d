#!/usr/bin/env node
// Builds the "About Hales Engine" flyer: art/hales-flyer/flyer.html -> public/about/hales-engine.pdf (8 x 12 in, two pages).
//   node art/hales-flyer/render.cjs [--png <dir>]
// Needs Playwright's Chromium (require('playwright')). It refuses to write the PDF when a rule breaks:
//   - the words "2D" and "3D" appear nowhere (page text, alt text, circuit labels): there is one engine and one app (owner, 26 Nov 2026);
//   - no text runs into a page's footer and no two blocks overlap.
// The copyright line is not typed in flyer.html: every <b data-credit> gets RIGHTS from scripts/credit.mjs (its one source, src/ui/shell/words.ts).
// It also writes built-from.json, the sha256 of every source, so tests/hales-flyer.test.ts can tell a PDF that was not rebuilt after an edit.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const here = __dirname;
const html = path.join(here, 'flyer.html');
const pdf = path.join(here, '../../public/about/hales-engine.pdf');
const SOURCES = ['flyer.html', 'circuit.svg', 'page1-bg.jpg', 'page2-bg.jpg'];
const DIM = /\b[23]\s?-?D\b/i;
const pngAt = process.argv.indexOf('--png');
const pngDir = pngAt > 0 ? process.argv[pngAt + 1] : null;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 768, height: 1152 }, deviceScaleFactor: 2 });
  const { RIGHTS } = await import(path.join(here, '../../scripts/credit.mjs'));
  await p.goto('file://' + html);
  await p.evaluate((line) => document.querySelectorAll('[data-credit]').forEach((e) => { e.textContent = line; }), RIGHTS);
  await p.waitForTimeout(400);
  const bad = await p.evaluate((src) => {
    const re = new RegExp(src, 'i');
    const r = [];
    const alts = [...document.querySelectorAll('img')].map((i) => i.alt).join(' ');
    if (re.test(document.body.innerText + ' ' + alts)) r.push('mentions 2D/3D in page text');
    document.querySelectorAll('section.page').forEach((pg, i) => {
      const foot = pg.querySelector('.foot').getBoundingClientRect();
      const blocks = [...pg.querySelectorAll('.title,.body,.fig,.legend')].map((e) => [e, e.getBoundingClientRect()]);
      for (const [e, bx] of blocks) {
        // the content's real bottom: the lowest child (columns put the last child at the top of the second column)
        const kids = [...e.children];
        const bottom = kids.length ? Math.max(...kids.map((k) => k.getBoundingClientRect().bottom)) : bx.bottom;
        if (bottom > foot.top + 0.5) r.push(`page ${i + 1}: ${e.className} runs into the footer`);
      }
      for (let a = 0; a < blocks.length; a++) {
        for (let c = a + 1; c < blocks.length; c++) {
          const x = blocks[a][1], y = blocks[c][1];
          const hit = x.left < y.right && y.left < x.right && x.top < y.bottom - 0.5 && y.top < x.bottom - 0.5;
          if (hit) r.push(`page ${i + 1}: ${blocks[a][0].className} overlaps ${blocks[c][0].className}`);
        }
      }
    });
    document.querySelectorAll('.body,.legend,.foot').forEach((e) => {
      if (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1) r.push('overflow: ' + e.className);
    });
    return r;
  }, DIM.source);
  const svgText = fs.readFileSync(path.join(here, 'circuit.svg'), 'utf8').replace(/<[^>]+>/g, ' ');
  if (DIM.test(svgText)) bad.push('circuit mentions 2D/3D');
  if (bad.length) {
    console.error('FAIL\n' + bad.join('\n'));
    await b.close();
    process.exit(1);
  }
  if (pngDir) {
    const pages = await p.$$('section.page');
    for (let i = 0; i < pages.length; i++) await pages[i].screenshot({ path: path.join(pngDir, `page${i + 1}.png`) });
  }
  fs.mkdirSync(path.dirname(pdf), { recursive: true });
  await p.pdf({ path: pdf, width: '8in', height: '12in', printBackground: true });
  await b.close();
  const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(here, f))).digest('hex');
  const from = { ...Object.fromEntries(SOURCES.map((f) => [f, sha(f)])), credit: RIGHTS };
  fs.writeFileSync(path.join(here, 'built-from.json'), JSON.stringify(from, null, 2) + '\n');
  console.log('ok: public/about/hales-engine.pdf');
})();
