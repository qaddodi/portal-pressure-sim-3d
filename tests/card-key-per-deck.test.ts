// A-D5, B-D*, D-D1 of capture 3531bdfa (Mac 04.5: the words box 461 px for 387 px of words, the data card drawn over its foot; 461 is the box of 01.9). Root cause, proven here from the real decks: a card's key was
// the slide id alone ("teach:eus-ladder"; "title", "check" and the kept "ladder" card had no slide at all), slide ids are only unique inside a talk, and everything the card layer keeps for a card hangs on its key: the
// heights it measured (a card was let in on ANOTHER talk's number and, drawn at the plan's height on its first frame, stood that tall: box-lock.ts freezeOf), its pages, ladder step, fit, rekeys and the frame's lock.
// The rule pinned over every talk, slide and beat: a card key belongs to one talk; a lock key is the key (talk and slide), the width and the step; the first height a card lands at is its own measure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { stopsOf, viewAt, lastSlideShot } from '../src/ui/deck/presenter-machine.ts';
import { dataKeys } from '../src/ui/cards/keep.ts';
import { cardKey, wordsCardKey } from '../src/ui/cards/card-key.ts';
import { freezeOf, boxOf, BOX_START } from '../src/ui/cards/box-lock.ts';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('every card key of every talk, slide and beat belongs to one talk; the slide-id-only key it had collides across talks', async () => {
  const owner = new Map<string, string>(), bare = new Map<string, Set<string>>();
  let cards = 0;
  for (const { id } of UI.decks) {
    const d = (await loadBuiltin(id))!, stops = stopsOf(d), data = dataKeys(d, stops);
    stops.forEach((st, i) => {
      const beats = st.kind === 'slide' ? st.beats : 1;
      for (let beat = 0; beat < beats; beat++) {
        const v = viewAt(stops, { stop: i, beat }, lastSlideShot(stops));
        const oldKey = v.slide && (v.words === 'teach' || v.words === 'case' || v.words === 'visual') ? `${v.words}:${v.slide.id}` : v.words;
        const keys = [[wordsCardKey(id, v.words, v.slide?.id), oldKey], ...(v.data && data[i] ? [[cardKey(id, data[i]!.key), data[i]!.key]] : [])];
        for (const [k, old] of keys) {
          cards++;
          assert.ok(k!.startsWith(`${id}/`), `${id}: ${k}`);
          assert.ok(!owner.has(k!) || owner.get(k!) === id, `the key ${k} is in two talks`);
          owner.set(k!, id);
          bare.set(old!, (bare.get(old!) ?? new Set()).add(id));
        }
      }
    });
  }
  const shared = [...bare].filter(([, t]) => t.size > 1);
  assert.ok(cards > 500, `cards walked: ${cards}`);
  // the cause, in numbers: before, this many card keys stood in more than one talk (the outline, the quick check and the kept instrument in every talk, and the slides that share an id)
  assert.ok(shared.length > 30 && shared.some(([k]) => k === 'teach:eus-ladder'), `${shared.length} card keys were shared by several talks`);
});

test('the layer builds every key under its talk, and the frame\'s lock is the card\'s key, its width and its step', () => {
  const layer = src('src/ui/cards/CardLayer.tsx'), frame = src('src/ui/cards/CardFrame.tsx');
  assert.match(layer, /const keyOfWords = \(v: NonNullable<typeof view>\) => wordsCardKey\(deck\.id, v\.words, v\.slide\?\.id\)/);
  assert.match(layer, /const baseKey = cardKey\(deck\.id, here\?\.key \?\? 'ladder'\)/);
  assert.doesNotMatch(layer, /\? `\$\{view\.words\}:\$\{view\.slide\.id\}`/, 'no key made of the slide id alone');
  assert.match(frame, /const lockKey = `\$\{entry\.key\}\|\$\{Math\.round\(rect\.w\)\}\|\$\{stepKey\}`/);
  // the lock of one card is never the lock of the same slide id in another talk, nor of the same slide at another width or step
  const lock = (deck: string, slide: string, w: number, step: string) => `${wordsCardKey(deck, 'teach', slide)}|${w}|${step}`;
  const set = new Set([lock('hvpg', 'eus-ladder', 340, 'a'), lock('ncph', 'eus-ladder', 340, 'a'), lock('ncph', 'eus-ladder', 390, 'a'), lock('ncph', 'eus-ladder', 340, 'b')]);
  assert.equal(set.size, 4);
});

test('the first height a card is drawn at is its own measure: a plan still on another number is followed until it is the card\'s (04.5 at 461 for 387 px of words), then held', () => {
  const K = 'ncph/teach:eus-ladder|340|';
  // the card is let in at its own measure of 387 while the plan, which read another card's 461, gives the box 461 first and 387 two frames later
  const plan = [461, 461, 387, 387, 461, 300];
  let f = null as ReturnType<typeof freezeOf> | null; const drawn: number[] = [];
  plan.forEach((h) => { f = freezeOf(f, K, h, 387); drawn.push(f.h); });
  assert.deepEqual(drawn, [461, 461, 387, 387, 387, 387], 'drawn at 461 only while the plan is on the wrong number, never held there');
  // and the lock itself: a card measured before it shows takes every measure; after it shows the box stands
  let s = boxOf(BOX_START, { t: 'measure', key: K, h: 461, fresh: true, shown: false }).state;
  s = boxOf(s, { t: 'measure', key: K, h: 387, fresh: true, shown: false }).state;
  assert.equal(boxOf(s, { t: 'show', key: K }).state.h, 387);
});
