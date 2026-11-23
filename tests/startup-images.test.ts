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

// ---- plan 49 (23 Nov): the cover has its wait-bar track from the first paint, so every launch image has the empty track too (172 x 3 CSS px, 14% of the text colour over the ground), centred, below the name ----
function pixels(file: string) {
  const b = readFileSync(`public/brand/launch/${file}`);
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20), idat: Buffer[] = [];
  for (let i = 8; i < b.length;) { const n = b.readUInt32BE(i), t = b.subarray(i + 4, i + 8).toString(); if (t === 'IDAT') idat.push(b.subarray(i + 8, i + 8 + n)); i += 12 + n; }
  const raw = inflateSync(Buffer.concat(idat)), bpp = 3, stride = w * bpp, out = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]!, src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp]! : 0, up = y ? out[(y - 1) * stride + x]! : 0, c = x >= bpp && y ? out[(y - 1) * stride + x - bpp]! : 0;
      const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? up : f === 3 ? (a + up) >> 1 : (pa <= pb && pa <= pc ? a : pb <= pc ? up : c);
      out[y * stride + x] = (src[x]! + pred) & 255;
    }
  }
  return { w, h, at: (x: number, y: number) => [...out.subarray(y * stride + x * bpp, y * stride + x * bpp + 3)] };
}
test('every launch image has the empty wait-bar track at the cover\'s offset: 172 x 3 CSS px, centred, in 14% of the text colour over the ground', () => {
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  for (const l of links) {
    const im = pixels(l.file), look = l.scheme === 'dark' ? LOOKS.dark : LOOKS.light, bg = hex(look.bg), ink = hex(look.text);
    const track = bg.map((v, k) => Math.round(v + (ink[k]! - v) * 0.14)), cx = im.w >> 1;
    let y = im.h - 1; while (y > 0 && im.at(cx, y).join() === bg.join()) y--;   // the last row of anything on the centre column: the track's bottom
    let top = y; while (top > 0 && im.at(cx, top - 1).join() === track.join()) top--;
    assert.deepEqual(im.at(cx, y), track, `${l.file}: the last mark on the centre column is the track`);
    assert.ok(Math.abs((y - top + 1) - 3 * l.d) <= 1, `${l.file}: 3 CSS px tall (${y - top + 1} px; the half pixel of the centring rounds)`);
    const mid = (top + y) >> 1; let x0 = cx; while (im.at(x0 - 1, mid).join() === track.join()) x0--; let x1 = cx; while (im.at(x1 + 1, mid).join() === track.join()) x1++;
    assert.ok(Math.abs((x1 - x0 + 1) - 172 * l.d) <= 2, `${l.file}: 172 CSS px wide (${x1 - x0 + 1})`);
    assert.ok(Math.abs((x0 + x1 + 1) / 2 - im.w / 2) <= 1, `${l.file}: centred`);
    assert.ok(Math.abs(y - im.h / 2) < im.h / 4, `${l.file}: near the middle of the screen, under the name`);
  }
});
