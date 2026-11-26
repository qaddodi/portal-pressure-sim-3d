// Capture 2274649a, Albumin 3 "Needle out": the same slide read "0.4 L removed" in one picture and "0.8 L removed" in another. The capture's stillness checks asked the page's own systems; none of them knew a tile
// was still moving. The last check asks the screen: nothing printed on a card, a tile or a label is changing (audit/capture-still.ts). Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readingsOf, readingWatch, whatChanged, READING_ROOTS } from '../src/ui/debug/audit/capture-still.ts';

const els = (...t: string[]) => t.map((textContent) => ({ textContent }));

test('what the cards print is read as words, white space folded, empty ones dropped', () => {
  assert.equal(readingsOf(els('  0.8 \n L ', '', 'Ascites', null as unknown as string)), '0.8 L|Ascites');
});
test('a counter that is still moving holds the picture; it is taken once the numbers have stood still for the hold', () => {
  const w = readingWatch(250);
  const at = (t: number, ...x: string[]) => w.see(readingsOf(els(...x)), t);
  assert.equal(at(0, '0.0 L removed'), '');                 // (the first read is the baseline)
  assert.match(at(15, '0.4 L removed'), /changed \(0\.4 L removed\)/);
  assert.match(at(30, '0.4 L removed'), /changed/);         // (unchanged, but not for long enough yet)
  assert.match(at(200, '0.4 L removed'), /changed/);
  assert.match(at(280, '0.8 L removed'), /changed \(0\.8 L removed\)/);   // (the count went on: the hold starts over)
  assert.match(at(400, '0.8 L removed'), /changed/);
  assert.equal(at(540, '0.8 L removed'), '');               // (250 ms of the same number: still)
  assert.equal(w.changes, 2);
});
test('a counter that ticks slower than a poll is not taken between two ticks', () => {
  const w = readingWatch(250);
  let n = 0, said = '';
  w.see('0', 0);
  for (let t = 15; t < 1000; t += 15) { n += t % 150 === 0 ? 1 : 0; said = w.see(String(n), t); }   // (a tick every 150 ms)
  assert.match(said, /changed/);
});
test('a page that never changes is still at once', () => {
  const w = readingWatch(250);
  assert.equal(w.see('a', 0), '');
  assert.equal(w.see('a', 15), '');
});
test('what changed is named by the segments that are new', () => {
  assert.equal(whatChanged('0.8 L|Ascites', '0.4 L removed|0.8 L|Ascites'), '0.4 L removed');
  assert.equal(whatChanged('a', 'a'), 'a reading went');
});
test('the instrument cards and the tiles are among the places read and watched for animation', () => {
  for (const s of ['.dk-card', '.pz-data', '.instrument-view', '.lb-layer']) assert.ok(READING_ROOTS.includes(s), s);
  const src = readFileSync(new URL('../src/ui/debug/audit/capture-all.ts', import.meta.url), 'utf8');
  assert.match(src, /const CONTENT = `\$\{READING_ROOTS\}/);   // (the running-animation check looks in the same places: the Abdomen's belly slides on a CSS transition)
  assert.match(src, /readingWatch\(/);
  assert.match(src, /watch\.see\(readingsNow\(\)/);
});
