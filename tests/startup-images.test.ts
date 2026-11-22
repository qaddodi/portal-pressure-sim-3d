// Home-screen launch images (splash plan A8, 22 Nov): the cover as it paints, Light and Dark, for each phone and iPad size, so an iPhone's launch screen, the cover and the figure follow on with nothing changing between them.
// scripts/startup-images.py writes the files and the <link> block; this holds the block to the files (they exist, are exactly the device's pixels, and have the cover's ground) and the ground to the look table.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { LOOKS } from '../src/looks/looks.ts';

const html = readFileSync('index.html', 'utf8');
const block = html.slice(html.indexOf('<!-- startup-images:begin -->'), html.indexOf('<!-- startup-images:end -->'));
const links = [...block.matchAll(/<link rel="apple-touch-startup-image" media="\(device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: (\d)\) and \(orientation: (portrait|landscape)\) and \(prefers-color-scheme: (light|dark)\)" href="\.\/brand\/launch\/([^"]+)">/g)]
  .map((m) => ({ w: +m[1]!, h: +m[2]!, d: +m[3]!, o: m[4]!, scheme: m[5]!, file: m[6]! }));

function png(file: string) {
  const b = readFileSync(`public/brand/launch/${file}`);
  assert.equal(b.subarray(1, 4).toString(), 'PNG');
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20), colour = b[25];
  const idat: Buffer[] = []; for (let i = 8; i < b.length;) { const n = b.readUInt32BE(i), t = b.subarray(i + 4, i + 8).toString(); if (t === 'IDAT') idat.push(b.subarray(i + 8, i + 8 + n)); i += 12 + n; }
  const row = inflateSync(Buffer.concat(idat)).subarray(0, 4);   // (the first pixel: every filter gives its raw bytes, there is nothing to its left or above)
  return { w, h, colour, first: `#${[...row.subarray(1, 4)].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}` };
}

test('every launch link names a file that exists, with exactly the device\'s pixels and the cover\'s ground (Light and Dark)', () => {
  assert.ok(links.length >= 40, `phones and iPads, both orientations of the iPads, both looks (${links.length})`);
  for (const l of links) {
    assert.ok(existsSync(`public/brand/launch/${l.file}`), l.file);
    const p = png(l.file);
    assert.equal(p.colour, 2, `${l.file} is plain RGB`);
    const pw = l.w * l.d, ph = l.h * l.d;
    assert.deepEqual([p.w, p.h], [pw, ph], l.file);
    assert.equal(l.file, `${pw}x${ph}-${l.scheme}.png`);
    assert.equal(p.first, l.scheme === 'dark' ? LOOKS.dark.bg.toUpperCase() : LOOKS.light.bg.toUpperCase(), `${l.file}: the cover's ground`);
    if (l.o === 'portrait') assert.ok(l.h > l.w, l.file); else assert.ok(l.w > l.h, l.file);
  }
});

test('both looks for every size, and the iPads in both orientations; the generator keeps the same grounds and name colours as the look table', () => {
  const keys = new Set(links.map((l) => `${l.w}x${l.h}@${l.d}/${l.o}`));
  for (const k of keys) for (const s of ['light', 'dark']) assert.ok(links.some((l) => `${l.w}x${l.h}@${l.d}/${l.o}` === k && l.scheme === s), `${k} ${s}`);
  assert.ok(links.some((l) => l.o === 'landscape' && l.w >= 1024), 'an iPad on its side');
  const py = readFileSync('scripts/startup-images.py', 'utf8');
  assert.match(py, new RegExp(`'light': \\('${LOOKS.light.bg}', '${LOOKS.light.text}'\\)`.replace(/#/g, '#')), 'Light ground and name colour as the look table');
  assert.match(py, new RegExp(`'dark': \\('${LOOKS.dark.bg}', '${LOOKS.dark.text}'\\)`), 'Dark ground and name colour');
});
