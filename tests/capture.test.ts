// Settings > Capture screen: the pure parts in node (the page walk and the painter need a browser, so they are read, not run), and the wiring in the source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseShadows, splitTop, transformed, captureScale, stampText, stampTime, captureFileName, captureRecord, RECORD_MAX, deliverWay, isCaptureKey } from '../src/ui/capture/capture-model.ts';
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
