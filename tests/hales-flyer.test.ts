// The "About Hales Engine" flyer (art/hales-flyer/README.md): two PDFs (8 x 12 in, and the iPhone's 390 x 844 pt) built from art/hales-flyer/flyer.html by render.cjs.
// Node only: the rules are checked on the sources the PDFs are built from, and built-from.json ties the committed PDFs to those exact sources.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { listFiles } from '../scripts/pwa.mjs';
import { RIGHTS } from '../scripts/credit.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = new URL('../art/hales-flyer/', import.meta.url);
/** The two sizes render.cjs makes from the one flyer.html, with the page size each must have (pt). */
const PDFS = { 'hales-engine.pdf': [576, 864], 'hales-engine-iphone.pdf': [391, 844] } as const;
const pdf = (f: string) => new URL(`../public/about/${f}`, import.meta.url);
const read = (f: string) => readFileSync(new URL(f, dir));
const text = (f: string) => read(f).toString('utf8');
/** What a reader sees: the markup's words, without tags or the stylesheet. */
const seen = (f: string) => text(f).replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');

test('both PDFs are there, PDFs of their own page size (8 x 12 in; the iPhone guide\'s 390 x 844 pt), small enough for a phone', () => {
  for (const [f, [w, h]] of Object.entries(PDFS)) {
    const b = readFileSync(pdf(f));
    assert.equal(b.subarray(0, 5).toString('latin1'), '%PDF-', f);
    assert.ok(statSync(pdf(f)).size < 4 * 1024 * 1024, `${f} is over 4 MB`);
    const boxes = [...b.toString('latin1').matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)];
    assert.ok(boxes.length >= 2, `${f}: fewer than two pages`);
    for (const m of boxes) assert.ok(Math.abs(Number(m[1]) - w) < 1 && Math.abs(Number(m[2]) - h) < 1, `${f}: a page is ${m[1]} x ${m[2]}`);
  }
});

test('both PDFs are built from the sources as they are now (rebuild with node art/hales-flyer/render.cjs)', () => {
  const from = JSON.parse(text('built-from.json')) as Record<string, string>;
  const sources = ['circuit-phone.svg', 'circuit.svg', 'flyer.html', 'page1-bg.jpg', 'page2-bg.jpg', 'paper-tile.jpg', 'phone.html', 'scene.jpg'];
  assert.deepEqual(Object.keys(from).sort(), ['credit', ...sources].sort());
  assert.equal(from.credit, RIGHTS, 'the copyright line changed after the PDF was built');
  for (const [f, sha] of Object.entries(from).filter(([k]) => k !== 'credit')) {
    assert.equal(createHash('sha256').update(read(f)).digest('hex'), sha, `${f} changed after the PDF was built`);
  }
});

test('one engine, one app: the flyer never says 2D or 3D, in its words, its alt text or the circuit (owner, 26 Nov 2026)', () => {
  const dim = /\b[23]\s?-?D\b/i;
  const alts = [...text('flyer.html').matchAll(/alt="([^"]*)"/g)].map((m) => m[1]).join(' ');
  assert.ok(!dim.test(seen('flyer.html') + ' ' + alts), 'flyer.html mentions 2D or 3D');
  for (const f of ['circuit.svg', 'circuit-phone.svg', 'phone.html']) assert.ok(!dim.test(seen(f)), `${f} mentions 2D or 3D`);
});

test('the flyer\'s copyright line comes from the one source (render.cjs fills each data-credit) and its disclaimer is the About page\'s, word for word', () => {
  const words = seen('flyer.html').replace(/\s+/g, ' ');
  assert.equal(text('flyer.html').match(/<b data-credit><\/b>/g)?.length, 2, 'each page\'s footer has an empty data-credit');
  assert.ok(!/©|&copy;/.test(text('flyer.html')), 'flyer.html types a copyright line of its own');
  const about = readFileSync(new URL('../src/ui/shell/about.copied.ts', import.meta.url), 'utf8');
  const line = /Educational simulation\.[^"'`]*/.exec(about)?.[0];
  assert.ok(line, 'the About page no longer has its disclaimer');
  assert.ok(words.includes(line), 'the flyer\'s disclaimer is not the About page\'s');
});

test('both circuits name the parts the words explain: the liver\'s three resistors, the collaterals, TIPS, PPG and HVPG', () => {
  for (const svg of [seen('circuit.svg'), seen('circuit-phone.svg')]) for (const w of ['pre-', 'sinusoidal', 'post-', 'collaterals', 'TIPS', 'PPG', 'HVPG', 'hepatic', 'artery', 'Heart']) assert.ok(svg.includes(w), w);
});

test('the flyer is never held offline: the service worker leaves about/ out, as it does the guides', () => {
  const root = mkdtempSync(join(tmpdir(), 'pwa-'));
  mkdirSync(join(root, 'about'));
  writeFileSync(join(root, 'about', 'hales-engine.pdf'), '%PDF-');
  writeFileSync(join(root, 'index.html'), '');
  assert.deepEqual(listFiles(root), ['index.html']);
});
