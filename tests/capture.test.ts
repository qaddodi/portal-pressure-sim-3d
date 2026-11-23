// Settings > Capture screen: the pure parts in node (the page walk and the painter need a browser, so they are read, not run), and the wiring in the source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseShadows, splitTop, maskUrl, maskPlacement, backdropBlur, blurHalvings, collageLayout, slug, transformed, captureScale, stampText, stampTime, captureFileName, captureRecord, RECORD_MAX, deliverWay, isCaptureKey } from '../src/ui/capture/capture-model.ts';
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
  assert.match(dom, /visuallyHidden\(cs\)/); assert.match(dom, /const apart = spaced \|\|/); assert.match(dom, /loadMasks/);
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
  assert.match(page, /btn\('Capture'/); assert.match(page, /data-capture-skip/); assert.match(page, /Save zip/); assert.match(page, /Share contact sheets/);
  assert.match(all, /loadAllDecks\(\)/); assert.match(all, /builtinDecks\(\)/); assert.match(all, /ui\.stop\(\)/); assert.match(all, /stillPage\(real, /); assert.match(all, /drawScreen\(/); assert.match(all, /'image\/jpeg'/); assert.match(all, /contact-sheet\.png/);
  assert.ok(!/fetch\(|sendBeacon|XMLHttpRequest/.test(all), 'nothing leaves the device');
});

test('Capture all decks runs the page fast: the clock at speed, the animations at speed, encoding off the main thread, the page put back', () => {
  const all = src('src/ui/debug/audit/capture-all.ts');
  assert.match(all, /clock\.setScale\(speed\)/); assert.match(all, /speedAnimations\(document, speed\)/); assert.match(all, /clock\.setScale\(1\)/);
  assert.match(all, /encoding\.push\(/); assert.match(all, /await Promise\.all\(encoding\)/);
  assert.match(all, /ratio: Math\.min\(devicePixelRatio, 2\)/, 'the device\'s own sharpness, 2x at most');
  assert.ok(!/Date\.now|performance\.now/.test(all), 'wall time is read from a Date, not the scaled clock or a raw time call');
});

test('Capture this deck: a Settings row inside a talk, a Stop in the toast that keeps what is done, one Save at the end; the audit has a talk picker and a big Stop', () => {
  const sheet = src('src/ui/settings/SettingsSheet.tsx'), deck = src('src/ui/capture/capture-deck.ts'), page = src('src/ui/debug/audit/page.ts'), all = src('src/ui/debug/audit/capture-all.ts');
  assert.match(sheet, /talk \? <MenuItem icon="grid" label=\{CAPTURE\.deckRow\}/);
  assert.match(deck, /only: id/); assert.match(deck, /stop: \(\) => stopped/); assert.match(deck, /restore: back/); assert.match(deck, /CAPTURE\.save/);
  assert.match(all, /ui\.only/); assert.match(all, /ui\.restore/);
  assert.match(src('src/ui/debug/audit/capture-pick.ts'), /Random 25 slides/); assert.match(page, /pickerUi\(/); assert.match(page, /Stop and keep what/); assert.match(page, /decks: sel\.decks/);
  assert.ok(!/—/.test(src('src/ui/shell/words.ts').match(/export const CAPTURE = \{[\s\S]*?\} as const;/)![0]));
});

test('the frosted glass: the blur radius is read from the computed backdrop-filter, and the canvas blur (no filter on a canvas in Safari) halves the region as far as the radius asks', () => {
  assert.equal(backdropBlur('blur(22px) saturate(1.15)'), 22);
  assert.equal(backdropBlur('saturate(1.2) blur(8.5px)'), 8.5);
  assert.equal(backdropBlur('none'), 0);
  assert.equal(blurHalvings(0, 400, 300), 0);
  assert.equal(blurHalvings(22, 340, 400), 4, 'a 22 px blur: 4 halvings (a 16th of the size) and back');
  assert.equal(blurHalvings(66, 340, 400), 6);
  assert.ok(blurHalvings(500, 20, 20) <= 3, 'a small region is never halved to nothing');
});

test('Capture draws what the page draws: the glass blur, the pills\' pseudo-element faces, no counters or build pill; the talk is walked by Next, which says whether it did anything', () => {
  const dom = src('src/ui/capture/capture-dom.ts'), all = src('src/ui/debug/audit/capture-all.ts'), store = src('src/ui/ui-store.ts');
  assert.match(dom, /k: 'blur'/); assert.match(dom, /pseudoBox\(c, el, '::before'/); assert.match(dom, /pseudoBox\(c, el, '::after'/); assert.match(dom, /function blurBehind/);
  for (const f of ['src/ui/shell/Diagnostics.tsx', 'src/ui/shell/BuildPill.tsx']) assert.match(src(f), /data-capture-skip/);
  assert.match(store, /move\(m: Move\): boolean/); assert.match(store, /if \(m === 'next' && lapseNext\(\)\) return true;/); assert.match(store, /if \(samePos\(to, pos\)\) return false;/);
  assert.match(all, /useUi\.getState\(\)\.move\('next'\)/); assert.match(all, /await grab\(\)/);
  assert.ok(!/useUi\.getState\(\)\.go\(k\)/.test(all), 'no jumps by number: a jump skips the case card and the steps within a stop');
  assert.match(all, /: 60,/, 'no animation is seen: the clock runs 60 times faster');
});

test('Capture all decks waits on arrivals only (not the audit\'s every-animation check) and takes both words of a blocked catheter', () => {
  const all = src('src/ui/debug/audit/capture-all.ts');
  assert.ok(!/\bsettle\b/.test(all.replace(/\/\/.*$/gm, '')), 'the audit settle counts every running animation: a perpetual one kept each picture waiting five seconds');
  assert.match(all, /function arriving\(/); assert.match(all, /endTime\) > 2500/, 'a long or endless animation is not a slide settling');
  assert.match(all, /cel\.rig\.isMoving/); assert.match(all, /data-phase="out"/);
  assert.match(all, /BLOCKED_SAYS\.first/); assert.match(all, /BLOCKED_SAYS\.then/); assert.match(all, /blockedThen\(\)/, 'Occluded and then No reading are two pictures');
  assert.match(all, /still not still after 5 s/, 'a wait that gave up says why in the README');
});

test('Capture draws a list\'s numbers, ticks and arrows (generated content and glyphs a font may lack), and no stamp in the talk\'s pictures', async () => {
  const m = await import('../src/ui/capture/capture-model.ts');
  assert.equal(m.contentString('"01"'), '01'); assert.equal(m.contentString('"\\00a0· mmHg"'), '\u00a0· mmHg'); assert.equal(m.contentString('none'), ''); assert.equal(m.contentString('normal'), '');
  assert.deepEqual(m.counterCall('counter(dko, decimal-leading-zero)'), { name: 'dko', style: 'decimal-leading-zero' }); assert.equal(m.counterCall('"01"'), null);
  assert.equal(m.counterText(3, 'decimal-leading-zero'), '03'); assert.equal(m.counterText(12, 'decimal-leading-zero'), '12'); assert.equal(m.counterText(3, 'decimal'), '3');
  assert.equal(m.counterStep('dko', 'dko'), 1); assert.equal(m.counterStep('a 2 dko 3', 'dko'), 3); assert.equal(m.counterStep('none', 'dko'), null); assert.equal(m.counterStep('', 'dko'), null);
  assert.ok(m.SYMBOLS.test('↑') && m.SYMBOLS.test('✓') && !m.SYMBOLS.test('a'));
  for (const ch of ['↑', '↓', '←', '→', '✓']) assert.match(m.symbolPath(ch, 0, 0, 12, 12), /^M[\d. -]+L/, ch);
  const dom = src('src/ui/capture/capture-dom.ts'), cap = src('src/ui/capture/capture.ts'), all = src('src/ui/debug/audit/capture-all.ts');
  assert.match(dom, /function pseudoFlow/); assert.match(dom, /pseudoWords\(/); assert.match(dom, /counterValue\(/, 'a counter Safari leaves unresolved is worked out');
  assert.match(dom, /Math\.abs\(mw - tr\.width\)/, 'a word set at another width than the browser did goes one letter at a time');
  assert.match(cap, /opts\.stamp !== false/); assert.match(all, /stamp: false/); assert.match(all, /Math\.min\(devicePixelRatio, 2\)/); assert.match(all, /pictures are \$\{shape0\.w\}x\$\{shape0\.h\} px/);
  assert.match(all, /clock\.moving/); assert.match(all, /blockedSlide\(k\)/, 'a blocked-catheter slide waits for its words');
});

test('Capture: halos under every letter, polygon clips (the table arrows), the Doppler\'s acquiring wait, and a stalled-frame cap that follows the audit speed', () => {
  const dom = src('src/ui/capture/capture-dom.ts'), all = src('src/ui/debug/audit/capture-all.ts'), frame = src('src/clock/frame.ts');
  assert.match(dom, /halos\.push/); assert.match(dom, /c\.out\.push\(\.\.\.halos, \.\.\.fills\)/, 'every halo first, then every letter: no letter\'s outline covers the one before');
  assert.match(dom, /function polygonClip/); assert.match(dom, /polygon\\\(/);
  assert.match(all, /the Doppler is acquiring/);
  assert.match(frame, /hitchCap\(realMs: number\)/);
  for (const f of ['src/ui/deck/scene-link.ts', 'src/ui/cards/dock.ts', 'src/ui/cards/card-zoom.ts', 'src/ui/cards/rail.ts']) assert.match(src(f), /hitchCap\(/, `${f} counts a stalled frame by the clock's hitchCap`);
  assert.ok(!/Math\.min\(dt, 64\)/.test(src('src/ui/deck/cath-clock.ts')), 'the catheter\'s frame cap is a parameter');
});

test('Capture picks: ticked slides, a seeded random sample from random talks, and the outer page gives each size its own frame', async () => {
  const p = await import('../src/ui/debug/audit/capture-pick.ts');
  const decks = [{ id: 'a', title: 'A', slides: [{ title: 'a1' }, { title: 'a2' }, { title: 'a3' }] }, { id: 'b', title: 'B', slides: [{ title: 'b1' }, { title: 'b2' }] }];
  assert.deepEqual(p.slideKeys(decks), ['a:1', 'a:2', 'a:3', 'b:1', 'b:2']);
  const r1 = p.randomPick(decks, 3, 7), r2 = p.randomPick(decks, 3, 7);
  assert.deepEqual(r1, r2, 'the same seed, the same slides'); assert.equal(new Set(r1).size, 3); assert.equal(p.randomPick(decks, 100, 1).length, 5, 'asking for more than there are takes all');
  assert.deepEqual(r1, p.slideKeys(decks).filter((k) => r1.includes(k)), 'in talk order');
  const seen = new Set<string>(); for (let s = 0; s < 40; s++) for (const k of p.randomPick(decks, 2, s)) seen.add(k);
  assert.equal(seen.size, 5, 'every slide can be drawn');
  const set = p.unpackPick(p.packPick(['a:2', 'b:1']))!; assert.ok(set.has('a:2') && set.has('b:1') && set.size === 2); assert.equal(p.unpackPick(''), null); assert.equal(p.unpackPick('junk,;;'), null);
  assert.equal(p.lastPicked(set, 'a'), 2); assert.equal(p.lastPicked(set, 'c'), -1);
  assert.equal(p.pickWords(['a:2', 'a:3', 'b:1']), 'a 2, 3; b 1');
  const outer = await import('../src/ui/debug/audit/capture-outer.ts');
  assert.equal(outer.captureSrc('/x/', '?audit=frames&sizes=mac&speed=20&look=dark', { speed: 20, pick: ['a:1', 'b:2'], decks: ['a', 'b'] }), '/x/?audit=capture&speed=20&pick=a:1,b:2&decks=a,b&look=dark');
  assert.match(outer.captureZipName('abc123', ['iphone', 'mac'], new Date(2026, 10, 23, 9, 5, 7)), /^portal-pressure-capture-abc123-iphone\+mac-20261123-090507\.zip$/);
  const all = src('src/ui/debug/audit/capture-all.ts'), child = src('src/ui/debug/audit/capture-child.ts'), mount = src('src/ui/debug/mount.ts');
  assert.match(all, /pick\.has\(stopKey\(d\.id, k\)\)/, 'a slide not picked is walked past'); assert.match(all, /pos\.stop > last/, 'the walk ends after the last picked slide');
  assert.match(child, /captureAllDecks\(/); assert.match(mount, /audit === 'capture'/);
});
