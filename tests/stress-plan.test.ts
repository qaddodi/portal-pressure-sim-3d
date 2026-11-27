// The stress capture (src/ui/debug/stress): the plan stays inside the sizes Mohammad approved (27 Nov 2026: about 200 pictures, 300 at most, one small zip), every slide and move it names exists,
// the layouts are real frame devices, and the report says what each picture shows. The page part needs a browser; here it is pinned by the pure parts and by what the wiring must keep.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { builtinDecks, lazyDecks, loadBuiltin } from '../src/decks/registry.ts';
import { FRAME_DEVICES } from '../src/ui/debug/frame/frame.ts';
import { FLAGS } from '../src/ui/debug/flags.ts';
import { STRESS_LAYOUTS, STRESS_SLIDES, STRESS_MOVES, STRESS_MENUS, STRESS_SHEETS, MOVE_FRAMES, MOVE_SLOW, MOVE_SHOTS, PICTURE_CAP, stressPictures, stressSteps, layoutSteps, layoutOf, stressFlag } from '../src/ui/debug/stress/plan.ts';
import { stressSrc, stressLayouts } from '../src/ui/debug/stress/outer.ts';
import { targetOf, baseOf } from '../src/ui/debug/promo/slides.ts';
import { HISTORIES } from '../src/ui/histories/index.generated.ts';

const src = (p: string): string => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('a run is about two hundred pictures and never over the cap', () => {
  const n = stressPictures();
  assert.ok(n >= 120 && n <= PICTURE_CAP, `${n} pictures`);
  for (const l of STRESS_LAYOUTS) assert.ok(stressPictures([l]) <= 100, `${l.id} makes ${stressPictures([l])}`);
  assert.equal(stressSteps(), STRESS_LAYOUTS.reduce((s, l) => s + layoutSteps(l), 0));
});

test('every layout is a real frame device, and the frame address names it', () => {
  for (const l of STRESS_LAYOUTS) { assert.ok(Object.hasOwn(FRAME_DEVICES, l.id), l.id); assert.equal(layoutOf(l.id), l); assert.equal(stressFlag(l), `stress=${l.id}`); }
  assert.equal(layoutOf('tv'), null);
  assert.deepEqual(stressLayouts('iphone,tv,mac').map((l) => l.id), ['iphone', 'mac']);
  assert.equal(stressLayouts(null).length, STRESS_LAYOUTS.length);
  assert.equal(stressSrc('/preview/', '?stress&go=1&layouts=mac&look=light', STRESS_LAYOUTS[0]!), '/preview/?audit=capture&stress=iphone&safe=47,0,34,0&look=light', 'the page\'s own flags are dropped, a phone carries its safe edges');
  assert.equal(stressSrc('/preview/', '?stress', STRESS_LAYOUTS[2]!), '/preview/?audit=capture&stress=mac');
});

test('every named slide and move is a real place in a real talk, once', async () => {
  await Promise.all(lazyDecks().map((l) => loadBuiltin(l.id)));
  const decks = new Map(builtinDecks().map((d) => [d.id, d]));
  assert.equal(new Set(STRESS_SLIDES.map((s) => s.key)).size, STRESS_SLIDES.length);
  for (const s of STRESS_SLIDES) {
    const t = targetOf(s.key);
    assert.equal(t?.kind, 'slide', s.key);
    if (t?.kind !== 'slide') continue;
    const d = decks.get(t.deck);
    assert.ok(d, `talk ${t.deck}`); assert.ok(t.slide >= 1 && t.slide <= d!.slides.length, `${s.key} is outside 1 to ${d!.slides.length}`); assert.ok(s.why.length > 10);
  }
  assert.equal(new Set(STRESS_MOVES.map((m) => m.id)).size, STRESS_MOVES.length);
  for (const m of STRESS_MOVES) {
    const d = decks.get(m.deck);
    assert.ok(d, `talk ${m.deck}`);
    // (the stops are the title card, the slides, then the close: a Next must exist from `from`)
    assert.ok(m.from >= 1 && m.from < d!.slides.length, `${m.id}: from ${m.from} has no Next in ${d!.slides.length} slides`);
    assert.ok(m.id.startsWith(`${m.deck}-${m.from}-`), `${m.id} names its place`);
  }
});

test('the menus and pages it takes are keys the promotion pass knows, and the case has the stop', () => {
  for (const k of STRESS_MENUS) assert.ok(targetOf(k), k);
  assert.equal(new Set(STRESS_MENUS.map(baseOf)).size, STRESS_MENUS.length, 'no two pictures share a file');
  const ask = STRESS_MENUS.map(targetOf).filter((t) => t?.kind === 'history');
  assert.equal(ask.length, 1);
  assert.ok((HISTORIES.find((h) => h.id === 'hist-ascites')!.play!.stops!.length) >= 4);
  assert.deepEqual([...STRESS_SHEETS], ['settings', 'help', 'search']);
});

test('a move is start, middle and end, with the page slowed so a picture does not move it', () => {
  assert.deepEqual(MOVE_FRAMES.map((f) => f.name), ['start', 'middle']);
  assert.equal(MOVE_SHOTS, 3);
  assert.ok(MOVE_FRAMES[0]!.at < MOVE_FRAMES[1]!.at);
  assert.ok(MOVE_SLOW > 0 && MOVE_SLOW <= 0.1);
});

test('the wiring the run stands on stays: one frame at a time, the capture\'s own parts, the page\'s flags, no browser run', () => {
  const o = src('src/ui/debug/stress/outer.ts');
  assert.match(o, /for \(const l of layouts\)/, 'layouts one after the other');
  assert.doesNotMatch(o, /Promise\.all\(layouts/, 'never every frame at once');
  assert.match(o, /openSession/); assert.match(o, /deliverUi/); assert.match(o, /recoverUi/); assert.match(o, /pace\(/);
  const r = src('src/ui/debug/stress/run.ts');
  assert.match(r, /captureAllDecks\(/); assert.match(r, /noChoices: true/); assert.match(r, /realTime: true/, 'the slides run at the page\'s own speed'); assert.match(r, /capturePromoExtras\(/);
  assert.match(src('src/ui/debug/audit/capture-all.ts'), /ui\.promo \|\| ui\.noChoices/);
  assert.match(src('src/ui/debug/audit/capture-all.ts'), /ui\.promo \|\| ui\.realTime \? 1/);
  const m = src('src/ui/debug/stress/moves.ts');
  assert.match(m, /clock\.setScale\(MOVE_SLOW\)/); assert.match(m, /updatePlaybackRate/); assert.match(m, /clock\.setScale\(1\)/, 'the clock is always let go');
  assert.match(src('src/ui/debug/audit/capture-child.ts'), /flagValue\('stress'\)/);
  // (the page's own `?stress` must not catch its own frame, which carries stress=<layout> and audit=capture)
  assert.match(src('src/entry.ts'), /flagOn\('stress'\) && flagValue\('audit'\) !== 'capture'/);
  for (const id of ['stress', 'go', 'layouts']) assert.ok(FLAGS.some((f) => f.id === id && f.gate === 'local'), `?${id} is a local flag`);
});
