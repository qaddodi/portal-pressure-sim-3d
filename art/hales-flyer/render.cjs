#!/usr/bin/env node
// Builds the "About Hales Engine" flyer in two sizes from one set of words (art/hales-flyer/flyer.html):
//   public/about/hales-engine.pdf          8 x 12 in, two pages (flyer.html's own layout)
//   public/about/hales-engine-iphone.pdf   390 x 844 pt pages, the iPhone guide's size (phone.html's styles; the blocks of flyer.html poured in
//                                          order, a new page when the next block does not fit; the portrait circuit-phone.svg; the scene from scene.jpg)
//   node art/hales-flyer/render.cjs [--png <dir>]
// Needs Playwright's Chromium (require('playwright')). It refuses to write either PDF when a rule breaks:
//   - the words "2D" and "3D" appear nowhere (page text, alt text, circuit labels): there is one engine and one app (owner, 26 Nov 2026);
//   - no text runs into a page's footer, no two blocks overlap, nothing overflows its box, no phone block is taller than a page.
// The copyright line is not typed in flyer.html: every <b data-credit> gets RIGHTS from scripts/credit.mjs (its one source, src/ui/shell/words.ts).
// It also writes built-from.json, the sha256 of every source, so tests/hales-flyer.test.ts can tell a PDF that was not rebuilt after an edit.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const here = __dirname;
const out = path.join(here, '../../public/about');
const SOURCES = ['flyer.html', 'phone.html', 'circuit.svg', 'circuit-phone.svg', 'page1-bg.jpg', 'page2-bg.jpg', 'paper-tile.jpg', 'scene.jpg'];
const DIM = /\b[23]\s?-?D\b/i;
const pngAt = process.argv.indexOf('--png');
const pngDir = pngAt > 0 ? process.argv[pngAt + 1] : null;
const SIZES = {
  desk: { file: 'hales-engine.pdf', width: '8in', height: '12in', view: { width: 768, height: 1152 } },
  phone: { file: 'hales-engine-iphone.pdf', width: '5.41667in', height: '11.72222in', view: { width: 520, height: 1126 } },
};

/** In the page: the rules every flyer page keeps. Returns the broken ones. */
function rules(src) {
  const re = new RegExp(src, 'i');
  const r = [];
  const alts = [...document.querySelectorAll('img')].map((i) => i.alt).join(' ');
  if (re.test(document.body.innerText + ' ' + alts)) r.push('mentions 2D/3D in page text');
  document.querySelectorAll('section.page').forEach((pg, i) => {
    const foot = pg.querySelector('.foot').getBoundingClientRect();
    const blocks = [...pg.querySelectorAll('.title,.body,.fig,.legend,.content')]
      .filter((e) => !e.parentElement.closest('.content')).map((e) => [e, e.getBoundingClientRect()]);
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
  // every line of a title is centred: its own text-align is center (a page-wide p rule once left the subtitle flush left on the iPhone,
  // 26 Nov 2026), and a spaced-out heading is padded on the left by its letter-spacing, which the browser adds after the last letter too
  document.querySelectorAll('.title, .title *').forEach((e) => {
    const cs = getComputedStyle(e);
    if (e.textContent.trim() && cs.textAlign !== 'center') r.push(`a title line is not centred: "${e.textContent.trim().slice(0, 30)}"`);
    const ls = parseFloat(cs.letterSpacing) || 0;
    if (ls > 0 && Math.abs(parseFloat(cs.paddingLeft) - ls) > 0.5) r.push(`"${e.textContent.trim().slice(0, 30)}" is spaced out but not padded by its spacing`);
  });
  document.querySelectorAll('.body,.legend,.foot,.content').forEach((e) => {
    if (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1) r.push('overflow: ' + e.className);
  });
  return r;
}

/** In the page (phone.html): pour flyer.html's blocks into 390 x 844 pt pages. A heading travels with the block after it. */
async function pour(flyer) {
  const doc = new DOMParser().parseFromString(flyer, 'text/html');
  const p1 = doc.querySelector('.p1'), p2 = doc.querySelector('.p2');
  const el = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; };
  const kids = (e) => [...e.children].filter((k) => !k.classList.contains('desk-only')).map((k) => document.importNode(k, true));
  const section = document.importNode(p2.querySelector('.title'), true);
  section.className = 'title section';
  const blocks = [
    document.importNode(p1.querySelector('.title'), true),
    el('<div class="fig scene"><img src="scene.jpg" alt="Stephen Hales measuring the blood pressure of a mare, as an 18th-century engraving"></div>'),
    ...kids(p1.querySelector('.body')),
    section,
    ...kids(p2.querySelector('.intro')),
    el('<div class="fig"><img src="circuit-phone.svg" alt="The portal circulation drawn as an electrical circuit"></div>'),
    document.importNode(p2.querySelector('.legend'), true),
    ...kids(p2.querySelector('.rest')),
    el(`<div class="credits">${p1.querySelector('.credits-line').innerHTML}</div>`),
  ];
  const units = [];
  for (let i = 0; i < blocks.length; i++) {
    const head = blocks[i].tagName === 'H2' || blocks[i].classList.contains('section');
    if (head && blocks[i + 1]) {
      const u = document.createElement('div');
      u.className = 'unit';
      u.append(blocks[i], blocks[i + 1]);
      units.push(u);
      i++;
    } else units.push(blocks[i]);
  }
  const page = () => {
    const s = el('<section class="page"><div class="content"></div><div class="foot"><b data-credit></b></div></section>');
    document.body.append(s);
    return s.querySelector('.content');
  };
  const over = (c) => c.scrollHeight > c.clientHeight + 0.5;
  const errors = [];
  let c = page();
  for (const u of units) {
    c.append(u);
    await Promise.all([...u.querySelectorAll('img')].map((im) => im.decode().catch(() => errors.push('image: ' + im.src))));
    if (!over(c)) continue;
    if (c.children.length === 1) { errors.push('a block is taller than a page: ' + u.textContent.slice(0, 40)); continue; }
    u.remove();
    c = page();
    c.append(u);
    if (over(c)) errors.push('a block is taller than a page: ' + u.textContent.slice(0, 40));
  }
  // a page that holds only the credits is a wasted page: shorten the words or the credits until they fit on the page before
  if (c.children.length === 1 && c.firstElementChild.classList.contains('credits')) errors.push('the credits stand alone on the last page');
  return errors;
}

(async () => {
  const { RIGHTS } = await import(path.join(here, '../../scripts/credit.mjs'));
  const b = await chromium.launch();
  const svgs = ['circuit.svg', 'circuit-phone.svg'].map((f) => fs.readFileSync(path.join(here, f), 'utf8').replace(/<[^>]+>/g, ' '));
  const bad = svgs.some((t) => DIM.test(t)) ? ['a circuit mentions 2D/3D'] : [];
  // every label of both circuits lies inside its drawing with room to spare, and no two labels touch (HVPG, cut by the iPhone page's edge, 26 Nov 2026)
  for (const f of ['circuit.svg', 'circuit-phone.svg']) {
    const p = await b.newPage();
    const svg = fs.readFileSync(path.join(here, f), 'utf8');
    const w = Number(/viewBox="0 0 ([\d.]+) /.exec(svg)[1]);
    await p.setContent(`<body style="margin:0">${svg.replace('<svg ', `<svg width="${w}" `)}</body>`);
    await p.evaluate(() => document.fonts.ready);
    const errs = await p.evaluate(() => {
      const r = [];
      const root = document.querySelector('svg');
      const vb = root.viewBox.baseVal, at = root.getBoundingClientRect();
      const M = 3;
      const boxes = [...root.querySelectorAll('text')].filter((t) => t.textContent.trim()).map((t) => [t.textContent, t.getBoundingClientRect()]);
      for (const [s, bx] of boxes) {
        const x0 = bx.left - at.left, y0 = bx.top - at.top, x1 = bx.right - at.left, y1 = bx.bottom - at.top;
        if (x0 < M || y0 < M || x1 > vb.width - M || y1 > vb.height - M) r.push(`"${s}" reaches the drawing's edge`);
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i][1], c = boxes[j][1];
          if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) r.push(`"${boxes[i][0]}" touches "${boxes[j][0]}"`);
        }
      }
      return r;
    });
    bad.push(...errs.map((e) => `${f}: ${e}`));
    await p.close();
  }
  const pages = {};
  for (const [kind, size] of Object.entries(SIZES)) {
    const p = await b.newPage({ viewport: size.view, deviceScaleFactor: 2 });
    pages[kind] = p;
    if (kind === 'desk') await p.goto('file://' + path.join(here, 'flyer.html'));
    else {
      await p.goto('file://' + path.join(here, 'phone.html'));
      await p.evaluate(() => document.fonts.ready);
      const errs = await p.evaluate(pour, fs.readFileSync(path.join(here, 'flyer.html'), 'utf8'));
      bad.push(...errs.map((e) => `${kind}: ${e}`));
    }
    await p.evaluate((line) => document.querySelectorAll('[data-credit]').forEach((e) => { e.textContent = line; }), RIGHTS);
    await p.waitForTimeout(400);
    bad.push(...(await p.evaluate(rules, DIM.source)).map((e) => `${kind}: ${e}`));
  }
  if (bad.length) {
    console.error('FAIL\n' + bad.join('\n'));
    await b.close();
    process.exit(1);
  }
  fs.mkdirSync(out, { recursive: true });
  for (const [kind, size] of Object.entries(SIZES)) {
    const p = pages[kind];
    if (pngDir) {
      const secs = await p.$$('section.page');
      for (let i = 0; i < secs.length; i++) await secs[i].screenshot({ path: path.join(pngDir, `${kind}-page${i + 1}.png`) });
    }
    await p.pdf({ path: path.join(out, size.file), width: size.width, height: size.height, printBackground: true });
    console.log(`ok: public/about/${size.file} (${(await p.$$('section.page')).length} pages)`);
  }
  await b.close();
  const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(here, f))).digest('hex');
  const from = { ...Object.fromEntries(SOURCES.map((f) => [f, sha(f)])), credit: RIGHTS };
  fs.writeFileSync(path.join(here, 'built-from.json'), JSON.stringify(from, null, 2) + '\n');
})();
