// The "About Hales Engine" flyer (art/hales-flyer/README.md): a two-page PDF built from art/hales-flyer/flyer.html by render.cjs.
// Node only: the rules are checked on the sources the PDF is built from, and built-from.json ties the committed PDF to those exact sources.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { listFiles } from '../scripts/pwa.mjs';
import { RIGHTS } from '../scripts/credit.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = new URL('../art/hales-flyer/', import.meta.url);
const PDF = new URL('../public/about/hales-engine.pdf', import.meta.url);
const read = (f: string) => readFileSync(new URL(f, dir));
const text = (f: string) => read(f).toString('utf8');
/** What a reader sees: the markup's words, without tags or the stylesheet. */
const seen = (f: string) => text(f).replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');

test('the PDF is there, a PDF, small enough for a phone, and built from the sources as they are now (rebuild with node art/hales-flyer/render.cjs)', () => {
  const b = readFileSync(PDF);
  assert.equal(b.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.ok(statSync(PDF).size < 4 * 1024 * 1024, 'the flyer is over 4 MB');
  const from = JSON.parse(text('built-from.json')) as Record<string, string>;
  assert.deepEqual(Object.keys(from).sort(), ['circuit.svg', 'credit', 'flyer.html', 'page1-bg.jpg', 'page2-bg.jpg']);
  assert.equal(from.credit, RIGHTS, 'the copyright line changed after the PDF was built');
  for (const [f, sha] of Object.entries(from).filter(([k]) => k !== 'credit')) {
    assert.equal(createHash('sha256').update(read(f)).digest('hex'), sha, `${f} changed after the PDF was built`);
  }
});

test('one engine, one app: the flyer never says 2D or 3D, in its words, its alt text or the circuit (owner, 26 Nov 2026)', () => {
  const dim = /\b[23]\s?-?D\b/i;
  const alts = [...text('flyer.html').matchAll(/alt="([^"]*)"/g)].map((m) => m[1]).join(' ');
  assert.ok(!dim.test(seen('flyer.html') + ' ' + alts), 'flyer.html mentions 2D or 3D');
  assert.ok(!dim.test(seen('circuit.svg')), 'the circuit mentions 2D or 3D');
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

test('the circuit names the parts the words explain: the liver\'s three resistors, the collaterals, TIPS, PPG and HVPG', () => {
  const svg = seen('circuit.svg');
  for (const w of ['pre-', 'sinusoidal', 'post-', 'collaterals', 'TIPS', 'PPG', 'HVPG', 'hepatic artery', 'Heart']) assert.ok(svg.includes(w), w);
});

test('the flyer is never held offline: the service worker leaves about/ out, as it does the guides', () => {
  const root = mkdtempSync(join(tmpdir(), 'pwa-'));
  mkdirSync(join(root, 'about'));
  writeFileSync(join(root, 'about', 'hales-engine.pdf'), '%PDF-');
  writeFileSync(join(root, 'index.html'), '');
  assert.deepEqual(listFiles(root), ['index.html']);
});
