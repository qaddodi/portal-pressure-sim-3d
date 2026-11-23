// Settings > Capture screen: the pure parts in node (the page walk and the painter need a browser, so they are read, not run), and the wiring in the source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseShadows, splitTop, maskUrl, maskPlacement, collageLayout, slug, transformed, captureScale, stampText, stampTime, captureFileName, captureRecord, RECORD_MAX, deliverWay, isCaptureKey } from '../src/ui/capture/capture-model.ts';
import { zipParts, zipNames } from '../src/ui/capture/zip.ts';
import { pngWithText, readPngText, crc32, asciiJson } from '../src/ui/capture/png-text.ts';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const at = new Date(2026, 10, 23, 7, 5, 9);   // 23 Nov 2026, 07:05:09 (device time)

/** A real 1x1 PNG: signature, IHDR, one IDAT, IEND, each with its CRC. */
function tinyPng(): Uint8Array {
  const chunk = (type: string, data: number[]) => {
    const body = [...type].map((c) => c.charCodeAt(0)).concat(data), crc = crc32(new Uint8Array(body));
    const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    return [...u32(data.length), ...body, ...u32(crc)];
  };
  return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]), ...chunk('IDAT', [120, 156, 99, 0, 1, 0, 0, 5, 0, 1]), ...chunk('IEND', [])]);
}

test('crc32 is the PNG checksum (the check value of "123456789")', () => {
  assert.equal(crc32(new Uint8Array([...'123456789'].map((c) => c.charCodeAt(0)))), 0xcbf43926);
});

test('the state rides inside the PNG as a text chunk right after the header, and reads back; every other chunk is untouched', () => {
  const png = tinyPng(), record = { v: 1, link: 'https://x/#s=abc', state: { look: 'dark', note: 'café – naïve' } };
  const out = pngWithText(png, 'portal-state', asciiJson(record));
  assert.ok(out.length > png.length);
  assert.deepEqual([...out.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(String.fromCharCode(...out.subarray(12, 16)), 'IHDR');
  assert.equal(String.fromCharCode(...out.subarray(37, 41)), 'tEXt', 'the chunk stands straight after IHDR (8 signature + 25 header)');
  assert.deepEqual(JSON.parse(readPngText(out, 'portal-state')!), record, 'what was written is what is read, accents included');
  assert.equal(readPngText(out, 'other'), null);
  const tail = (b: Uint8Array) => [...b.subarray(b.length - 24)];
  assert.deepEqual(tail(out), tail(png), 'the image data and the end are as they were');
  assert.equal(readPngText(png, 'portal-state'), null);
});

test('the chunk\'s own checksum is right, and a file that is not a PNG is handed back as it was', () => {
  const out = pngWithText(tinyPng(), 'portal-state', '{"a":1}');
  const at0 = 33, len = (out[at0]! << 24) | (out[at0 + 1]! << 16) | (out[at0 + 2]! << 8) | out[at0 + 3]!;
  const body = out.subarray(at0 + 4, at0 + 8 + len), crc = ((out[at0 + 8 + len]! << 24) | (out[at0 + 9 + len]! << 16) | (out[at0 + 10 + len]! << 8) | out[at0 + 11 + len]!) >>> 0;
  assert.equal(crc, crc32(body));
  const junk = new Uint8Array([1, 2, 3]);
  assert.equal(pngWithText(junk, 'k', 'v'), junk);
  assert.equal(pngWithText(tinyPng(), '', 'v').length, tinyPng().length, 'no key, no chunk');
});

test('asciiJson keeps the chunk Latin-1 safe', () => {
  assert.equal(asciiJson({ a: 'é–' }), '{"a":"\\u00e9\\u2013"}');
  assert.ok(/^[\x20-\x7e]*$/.test(asciiJson({ s: 'Ångström ≥ 5 mmHg' })));
});

test('a box shadow is read from its computed form: outer ones only, offsets, blur, spread, the colour whole', () => {
  assert.deepEqual(parseShadows('rgba(0, 0, 0, 0.12) 0px 4px 12px 0px'), [{ ox: 0, oy: 4, blur: 12, spread: 0, color: 'rgba(0, 0, 0, 0.12)' }]);
  assert.deepEqual(parseShadows('rgba(0, 0, 0, 0.1) 0px 1px 2px 0px, rgb(10, 20, 30) 2px -3px 6px 1px'), [
    { ox: 0, oy: 1, blur: 2, spread: 0, color: 'rgba(0, 0, 0, 0.1)' }, { ox: 2, oy: -3, blur: 6, spread: 1, color: 'rgb(10, 20, 30)' }]);
  assert.deepEqual(parseShadows('rgba(0, 0, 0, 0.1) 0px 1px 2px 0px inset'), [], 'inset is inside the box: left out');
  assert.deepEqual(parseShadows('0px 0px 10px color(srgb 0.1 0.2 0.3 / 0.5)'), [{ ox: 0, oy: 0, blur: 10, spread: 0, color: 'color(srgb 0.1 0.2 0.3 / 0.5)' }]);
  assert.deepEqual(parseShadows('none'), []);
  assert.deepEqual(splitTop('a(1, 2), b(3, (4, 5)), c'), ['a(1, 2)', 'b(3, (4, 5))', 'c']);
});

test('text-transform is applied to the words the canvas draws', () => {
  assert.equal(transformed('hvpg', 'uppercase'), 'HVPG');
  assert.equal(transformed('Portal', 'lowercase'), 'portal');
  assert.equal(transformed('portal vein', 'capitalize'), 'Portal Vein');
  assert.equal(transformed('Portal', 'none'), 'Portal');
});

test('the picture is made at the device\'s pixel ratio, kept inside what a phone\'s canvas can hold', () => {
  assert.equal(captureScale({ w: 430, h: 932 }, 3), 3, 'an iPhone: 3x (1290 x 2796)');
  assert.equal(captureScale({ w: 1180, h: 820 }, 2), 2, 'an iPad: 2x');
  assert.equal(captureScale({ w: 1512, h: 982 }, 2), 2, 'a laptop: 2x');
  assert.ok(captureScale({ w: 2560, h: 1440 }, 3) < 3, 'a big screen at 3x is over the pixel budget: it steps down');
  assert.ok(captureScale({ w: 2560, h: 1440 }, 3) >= 1);
  assert.equal(captureScale({ w: 1000, h: 800 }, 0), 1, 'an unknown ratio is 1x');
  assert.equal(captureScale({ w: 0, h: 0 }, 2), 1);
});

test('the stamp and the file name carry the build and the device\'s time', () => {
  assert.equal(stampTime(at), '2026-11-23 07:05:09');
  assert.equal(stampText('v1.0.0-beta.1 · PREVIEW · 48b3b5e4', at), 'v1.0.0-beta.1 · PREVIEW · 48b3b5e4 · 2026-11-23 07:05:09');
  assert.equal(captureFileName('lobule', 'cirr-decomp', '48b3b5e4', at), 'portal-pressure-capture-lobule-cirr-decomp-48b3b5e4-20261123-070509.png');
  assert.equal(captureFileName('anatomic', null, 'local', at), 'portal-pressure-capture-anatomic-local-20261123-070509.png');
});

test('the record in the file: when, which build, the link that reopens the view, the state; a state too big is dropped, the link stays', () => {
  const r = captureRecord({ at, build: 'b', screen: '430x932 at 3x', link: 'https://x/#s=abc', state: { x: { look: 'dark' } } });
  assert.equal(r.v, 1); assert.equal(r.at, at.toISOString()); assert.equal(r.link, 'https://x/#s=abc'); assert.deepEqual(r.state, { x: { look: 'dark' } });
  const big = captureRecord({ at, build: 'b', screen: 's', link: 'https://x/#s=abc', state: { log: 'x'.repeat(RECORD_MAX) } });
  assert.equal(big.state, null); assert.equal(big.link, 'https://x/#s=abc');
});

test('a touch device with a share sheet that takes files shares; a laptop (and a phone without the sheet) downloads', () => {
  assert.equal(deliverWay({ touchPoints: 5, canShareFiles: true }), 'share');
  assert.equal(deliverWay({ touchPoints: 5, canShareFiles: false }), 'download');
  assert.equal(deliverWay({ touchPoints: 0, canShareFiles: true }), 'download', 'a Mac has a share sheet too, but a file in Downloads is what a laptop wants');
});

test('the shortcut is Option + Shift + S by its place on the board, and nothing else', () => {
  assert.ok(isCaptureKey({ code: 'KeyS', key: 'Í', altKey: true, shiftKey: true }));
  assert.ok(!isCaptureKey({ code: 'KeyS', key: 's', shiftKey: true }));
  assert.ok(!isCaptureKey({ code: 'KeyS', key: 's', altKey: true, shiftKey: true, metaKey: true }));
  assert.ok(!isCaptureKey({ code: 'KeyS', key: 's', altKey: true, shiftKey: true, repeat: true }), 'a held key is one capture');
});

test('the wiring: a Settings row, the shortcut, words in one place, nothing off the app', () => {
  assert.match(src('src/ui/settings/SettingsSheet.tsx'), /<CaptureRow \/>/);
  assert.match(src('src/ui/settings/SettingsSheet.tsx'), /captureScreen\(\{ settle: true \}\)/, 'the sheet lets go first so it is not in the picture');
  assert.match(src('src/ui/keys/useKeys.ts'), /isCaptureKey\(e\)/);
  const cap = src('src/ui/capture/capture.ts');
  assert.match(cap, /navigator\.share\(/); assert.match(cap, /pngWithText\(/); assert.match(cap, /shareLinkNow\(\)/);
  assert.ok(!/VITE_FEEDBACK_EMAIL|@gmail|mailto:/.test(cap + src('src/ui/capture/capture-dom.ts') + src('src/ui/capture/capture-model.ts')), 'the owner\'s address is never in the capture');
  assert.ok(!/localStorage|fetch\(|XMLHttpRequest|sendBeacon/.test(cap), 'the picture goes only where the person sends it');
  assert.ok(!/em dash|—/.test(src('src/ui/shell/words.ts').match(/export const CAPTURE = \{[\s\S]*?\} as const;/)![0]), 'no em dash in the words');
});

test('the page walk keeps the rules: no raw time, no frame loop, every layout read through layout-snap', () => {
  const dom = src('src/ui/capture/capture-dom.ts');
  assert.ok(!/requestAnimationFrame|setTimeout|setInterval|performance\.now|Date\.now|getBoundingClientRect|getComputedStyle/.test(dom));
  assert.match(dom, /readBox/); assert.match(dom, /readTextRects/);
});

test('an icon of the atlas is its colour seen through one cell of the picture: the cell is found from the computed size and position', () => {
  assert.equal(maskUrl('url("https://x.test/brand/icons/icons-r.png")'), 'https://x.test/brand/icons/icons-r.png');
  assert.equal(maskUrl('none'), null);
  assert.equal(maskUrl('linear-gradient(red, blue)'), null);
  const box = { w: 24, h: 24 }, nat = { w: 960, h: 768 };
  const p = maskPlacement('1000% 800%', '11.1111% 14.2857%', box, nat);   // (the atlas is 10 x 8 cells: cell 1 across, 1 down)
  assert.equal(p.w, 240); assert.equal(p.h, 192);
  assert.ok(Math.abs(p.x - -24) < 0.01 && Math.abs(p.y - -24) < 0.01, `the cell's corner is at the box's corner (${p.x}, ${p.y})`);
  assert.deepEqual(maskPlacement('1000% 800%', '0% 0%', box, nat), { x: 0, y: 0, w: 240, h: 192 }, 'cell 0, 0');
  assert.deepEqual(maskPlacement('contain', 'center', { w: 20, h: 10 }, { w: 40, h: 40 }), { x: 5, y: 0, w: 10, h: 10 }, 'contain, centred');
  assert.deepEqual(maskPlacement('calc(100%) auto', 'calc(0%) calc(0%)', { w: 20, h: 10 }, { w: 40, h: 20 }), { x: 0, y: 0, w: 20, h: 10 }, 'one side auto keeps the shape');
});

test('what the page keeps for a screen reader is never drawn; letter-spaced words are drawn a letter at a time; the stamp is solid', () => {
  const dom = src('src/ui/capture/capture-dom.ts'), cap = src('src/ui/capture/capture.ts');
  assert.match(dom, /visuallyHidden\(cs\)/); assert.match(dom, /if \(spaced\)/); assert.match(dom, /loadMasks/);
  assert.match(cap, /await loadMasks\(/);
  assert.ok(!/globalAlpha = 0\.[0-9]/.test(cap), 'a translucent fill over a translucent halo came out as mush');
});

test('a zip of stored files lists, checks and unpacks: names (accents too), sizes, checksums, offsets', () => {
  const files = [{ name: '01-hvpg/01-outline.jpg', data: new Uint8Array([1, 2, 3, 4, 5]) }, { name: '01-hvpg/01-outline.json', data: new TextEncoder().encode('{"a":"café"}') }, { name: 'README.txt', data: new Uint8Array(0) }];
  const parts = zipParts(files, at), zip = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { zip.set(p, o); o += p.length; }
  const list = zipNames(zip);
  assert.deepEqual(list.map((f) => f.name), files.map((f) => f.name));
  assert.deepEqual(list.map((f) => f.size), [5, 13, 0]);
  assert.equal(list[0]!.crc, crc32(files[0]!.data));
  // the first local header stands at 0 and the central directory's first offset says so
  assert.equal(new DataView(zip.buffer).getUint32(0, true), 0x04034b50);
});

test('a deck\'s contact sheet: three across for a laptop or iPad, five for a phone, every slide in its own place under the header', () => {
  const l = collageLayout(11, { w: 2360, h: 1640 });
  assert.equal(l.cols, 3); assert.equal(l.cells.length, 11); assert.equal(l.cellW, 480);
  assert.equal(l.cellH, Math.round((480 * 1640) / 2360));
  assert.deepEqual(l.cells[0], { x: l.pad, y: l.pad + l.headH });
  assert.equal(l.cells[3]!.x, l.pad); assert.ok(l.cells[3]!.y > l.cells[0]!.y, 'the fourth starts a new row');
  const last = l.cells[10]!;
  assert.ok(last.x + l.cellW <= l.width && last.y + l.cellH + l.labelH <= l.height, 'the last slide and its words are inside the sheet');
  const p = collageLayout(12, { w: 1290, h: 2796 });
  assert.equal(p.cols, 5); assert.equal(p.cellW, 300);
  assert.equal(collageLayout(2, { w: 100, h: 100 }).cols, 2, 'two slides: two across, not three');
  assert.equal(slug('Portal blood drains the intestine and spleen, then some more words'), 'portal-blood-drains-the-intestine-and-sp');
  assert.equal(slug('???'), 'slide');
});

test('Capture all decks: in the audit panel, every talk and stop, kept out of its own pictures, saved from a fresh tap', () => {
  const page = src('src/ui/debug/audit/page.ts'), all = src('src/ui/debug/audit/capture-all.ts');
  assert.match(page, /btn\('Capture all decks'/); assert.match(page, /data-capture-skip/); assert.match(page, /Save zip/); assert.match(page, /Share contact sheets/);
  assert.match(all, /loadAllDecks\(\)/); assert.match(all, /builtinDecks\(\)/); assert.match(all, /ui\.stop\(\)/); assert.match(all, /stillPage\(real\)/); assert.match(all, /drawScreen\(/); assert.match(all, /'image\/jpeg'/); assert.match(all, /contact-sheet\.png/);
  assert.ok(!/fetch\(|sendBeacon|XMLHttpRequest/.test(all), 'nothing leaves the device');
});

test('Capture all decks runs the page fast: the clock at speed, the animations at speed, encoding off the main thread, the page put back', () => {
  const all = src('src/ui/debug/audit/capture-all.ts');
  assert.match(all, /clock\.setScale\(speed\)/); assert.match(all, /speedAnimations\(document, speed\)/); assert.match(all, /clock\.setScale\(1\)/);
  assert.match(all, /encoding\.push\(/); assert.match(all, /await Promise\.all\(encoding\)/);
  assert.match(all, /ratio: innerWidth < 600/, 'a laptop and an iPad at 1x');
  assert.ok(!/Date\.now|performance\.now/.test(all), 'wall time is read from a Date, not the scaled clock or a raw time call');
});
