// Playing a deck as 2D plays it (audit 20 Nov PM, §3.1–3.8 and 3.10): one "slide landed" signal for what waits for the end of a slide's move, the time-lapse's tiles that climb with the days,
// a new patient put in under a dimmed figure, devices that ease out, the lens reset, and one animated way out of a talk. Pure parts are run; the wiring is held to its source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeLanding, MIN_MS, SEEN_MS, POLL_MS, GIVE_UP_MS, type LandingEnv } from '../src/ui/deck/landing-core.ts';
import { freshPatient, changeKind, morphMsFor, MORPH_ONE_MS, MORPH_CATH_MS } from '../src/decks/hp/slide-motion.ts';
import { liveResults, tilesAt } from '../src/ui/cards/tiles-2d.ts';
import { setLapseSkip, lapseNext } from '../src/ui/deck/lapse-next.ts';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/** A clock the test turns by hand. */
function world(still = () => true, cardsIn = () => true) {
  let now = 0, id = 0;
  const q = new Map<number, { at: number; fn: () => void }>();
  const env: LandingEnv = {
    still: () => still(), cardsIn: () => cardsIn(), now: () => now,
    later: (fn, ms) => { q.set(++id, { at: now + ms, fn }); return id; },
    cancel: (h) => { q.delete(h as number); },
  };
  const run = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const next = [...q.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      q.delete(next[0]); now = next[1].at; next[1].fn();
    }
    now = end;
  };
  return { env, run };
}

test('a slide lands once its camera has been still and its cards in for a moment, never at the press', () => {
  const w = world();
  const L = makeLanding(w.env);
  const landed: string[] = [];
  L.on((k) => landed.push(k));
  L.begin('a');
  w.run(MIN_MS - POLL_MS);
  assert.deepEqual(landed, [], 'not sooner than MIN_MS after the press');
  w.run(MIN_MS + SEEN_MS + 3 * POLL_MS);
  assert.deepEqual(landed, ['a']);
  assert.equal(L.landed, true);
  w.run(1000);
  assert.deepEqual(landed, ['a'], 'told once');
});

test('a camera still moving, or a card still coming in, holds the landing; a move that starts again restarts the count', () => {
  let moving = true, cards = false;
  const w = world(() => !moving, () => cards);
  const L = makeLanding(w.env);
  let n = 0; L.on(() => n++);
  L.begin('s');
  w.run(2000); assert.equal(n, 0, 'the camera is on its way');
  moving = false; w.run(2000); assert.equal(n, 0, 'the cards are not in');
  cards = true; w.run(SEEN_MS - POLL_MS * 2); assert.equal(n, 0, 'they have to stay in for SEEN_MS');
  moving = true; w.run(POLL_MS * 2); moving = false;   // (a glide begins again in the middle of the count)
  w.run(SEEN_MS - POLL_MS); assert.equal(n, 0, 'the count started over');
  w.run(SEEN_MS + 2 * POLL_MS); assert.equal(n, 1);
});

test('a new position drops the landing of the one before; a landing that never settles lands anyway', () => {
  const w = world(() => false);
  const L = makeLanding(w.env);
  const keys: string[] = []; L.on((k) => keys.push(k));
  L.begin('one'); w.run(500);
  L.begin('two'); w.run(GIVE_UP_MS - 100);
  assert.deepEqual(keys, [], 'the first slide never lands once the second begins');
  w.run(200);
  assert.deepEqual(keys, ['two'], 'the second gives up after GIVE_UP_MS and lands, so nothing waits for good');
  L.ensure('two'); assert.equal(L.landed, true, 'ensure keeps the same position');
  L.ensure('three'); assert.equal(L.landed, false, 'ensure begins a new one');
});

test('2D slide-motion: a new patient dips, a lapse plays its days, a treated patient eases; a slide with a catheter or instrument eases for longer', () => {
  assert.equal(freshPatient({ preset: 'cirrhosis' }, false, false), true);
  assert.equal(freshPatient({ preset: 'cirrhosis' }, true, false), false, 'a lapse keeps its own way in');
  assert.equal(freshPatient({ preset: 'cirrhosis' }, false, true), false, 'a procedure from the state before keeps its own way in');
  assert.equal(freshPatient({}, false, false), false);
  assert.equal(changeKind({ preset: 'x' }, false, false), 'patient');
  assert.equal(changeKind({ lapse: {} }, false, false), 'time');
  assert.equal(changeKind({ params: {} }, false, false), 'treat');
  assert.equal(changeKind({}, false, false), 'same');
  assert.equal(morphMsFor({}), MORPH_ONE_MS);
  assert.equal(morphMsFor({ cath: 'route' }), MORPH_CATH_MS);
  assert.ok(MORPH_ONE_MS === 1200 && MORPH_CATH_MS === 2000, '2D MORPH_ONE_MS and MORPH_MS');
});

test('the tiles of a running time-lapse read the live figure, not the slide\'s end; the rest of the deck stays', () => {
  const slides = [{ id: 'a', kicker: '', title: '', line: '', notes: '', ask: ['', ''], tiles: ['hvpg'] }, { id: 'b', kicker: '', title: '', line: '', notes: '', ask: ['', ''], days: 60, lapse: { seconds: 8 }, tiles: ['hvpg'] }] as never;
  const end = [{ fp: { hvpg: 6 } }, { fp: { hvpg: 14 } }];
  const live = liveResults(end, 1, { hvpg: 9.1 });
  assert.equal(live[1]!.fp.hvpg, 9.1);
  assert.equal(live[0]!.fp.hvpg, 6, 'the other slides are untouched');
  assert.equal(end[1]!.fp.hvpg, 14, 'the slide\'s own end is not written');
  const t = (r: unknown) => tilesAt(slides, r as never, 1, false)?.tiles.find((x) => x.k === 'hvpg')?.text;
  assert.notEqual(t(end), t(live), 'the card prints the live number while the days run');
});

test('the tiles stand at the days\' start until a day has run, then follow the live figure, then ease to the end', () => {
  const t = src('src/ui/cards/TilesCard.tsx');
  assert.match(t, /lap > 0 \? liveFp\(\) : lap === 0 \? startOf\(results, i\) : null/);
  assert.match(t, /\(s\.d >= 1 \? s\.d : 0\) : -1/);
  assert.match(src('src/ui/cards/Roll.tsx'), /if \(still\)/, 'a number that follows a clock changes in place, no roll on every poll');
});

test('Next while a lapse is only being set up moves on (a quick Next-Next never stops on a lapse slide); once the days run it runs them out', () => {
  const l = src('src/decks/hp/lapse.ts');
  assert.match(l, /r\.phase === 'settle' \|\| r\.phase === 'fast' \|\| r\.phase === 'landing'\) return false/);
  setLapseSkip(null); assert.equal(lapseNext(), false, 'no lapse: Next goes on');
  let calls = 0; setLapseSkip(() => (++calls === 1)); assert.equal(lapseNext(), true); assert.equal(lapseNext(), false); setLapseSkip(null);
});

test('what waits for the end of a slide\'s move asks the one landing signal: the figure\'s marks, the time-lapse and the auto procedure', () => {
  const fig = src('src/ui/deck/figure-link.ts');
  assert.match(fig, /apply\(EMPTY_CALLS\); pending = calls; applied = false;/, 'the slide before\'s marks go at the press, this one\'s are held');
  assert.match(fig, /onLanded\(flush\)/, 'and painted when the slide lands');
  const hp = src('src/decks/hp/link.ts');
  assert.match(hp, /waiting = \{ stop: pos\.stop, run: \(\) => playLapse\(/, 'the days begin when it lands');
  assert.match(hp, /viewAt\(stops, pos\)\.words === 'case'\) return/, 'and after a case card is lifted');
  const pr = src('src/ui/deck/procs-link.ts');
  assert.match(pr, /auto = \{ g: gen, key: k \}; tryAuto\(\)/);
  assert.doesNotMatch(pr, /PLAY_DELAY_MS/, 'no timer from the press');
  const dk = src('src/ui/DeckUi.tsx');
  assert.match(dk, /linkLanding\(\)/);
});

test('a new patient blends in over the slide\'s own time, nothing darkens, nothing cuts (owner, 24 Nov 2026)', () => {
  const hp = src('src/decks/hp/link.ts');
  assert.match(hp, /engine\(\)\.send\(\{ type: 'morph', snap, ms: morphMsFor\(cs\) \}\)/);
  assert.doesNotMatch(hp, /dipIn|dipOut|dipTo/, 'no wash on a slide change');
  const dm = src('src/ui/talk/deck-model.ts');
  assert.doesNotMatch(dm, /dipIn|dipOut/);
  assert.match(dm, /seen === null \? firstModel\(stops\)/, 'the first slide\'s patient is in under the cover');
});

test('the lens is the slide\'s own, pressure on the title and after a talk', () => {
  const sl = src('src/ui/deck/scene-link.ts');
  assert.match(sl, /v\.scene\?\.lens \?\? DEFAULT_LENS/);
  assert.match(sl, /sceneApi\.setLens\(DEFAULT_LENS\)/, 'leaving puts pressure back');
});

test('devices a leaving slide left standing ease out in place (650 ms, the balloon in 400), not in one frame', () => {
  const ly = src('src/scene/procedures/layer.ts');
  assert.match(ly, /LEAVE_BALLOON_MS = 400, LEAVE_MS = 650/);
  assert.match(ly, /if \(!keep\) this\.clear\(LEAVE_MS\)/);
  assert.match(ly, /this\.leaving = null; this\.clear\(\)/, 'the last frame clears for good');
});

test('Esc, the ✕, Finish and a swipe past the last slide leave through one animated stopTalk, and the address forgets the talk', () => {
  const t = src('src/ui/shell/talk.ts');
  assert.match(t, /export function stopTalk\(\): void/);
  assert.match(t, /rail\.leave\(/);
  assert.match(t, /dipIn\(who\)/);
  assert.match(t, /searchParams\.delete\('script'\); u\.searchParams\.delete\('slide'\)/);
  assert.match(src('src/ui/deck/useDeckInput.ts'), /else stopTalk\(\); break;/);
  assert.match(src('src/ui/deck/PresenterBar.tsx'), /onClick=\{\(\) => stopTalk\(\)\}/);
  assert.match(src('src/ui/cards/finish.ts'), /stopTalk\(\)/);
  assert.match(src('src/ui/keys/useKeys.ts'), /step === 'talk'\) stopTalk\(\)/);
});

test('a talk opens behind 2D\'s "Preparing the slides" cover, and the cover lifts when the first slide has landed', () => {
  const t = src('src/ui/shell/talk.ts');
  assert.match(t, /coverUp\(deck\.title\)/);
  assert.match(t, /onLanded\(\(\) => \{ off\(\); if \(mine === startGen\) void coverDown\(\)/);
  assert.match(src('src/ui/deck/words.ts'), /preparing: 'Preparing the slides'/);
  const c = src('src/ui/shell/curtain.ts');
  assert.match(c, /classList\.add\('pz-covered'\)/);
  assert.match(c, /COVER_MAX_MS = 12000/, 'never left up');
});

test('the figure is never dimmed by a case card or a slide change: no veil dip, no .pz-out rule (owner, 24 Nov 2026)', () => {
  const layer = src('src/ui/cards/CardLayer.tsx');
  assert.doesNotMatch(layer, /on dip/, 'no wash behind a case card');
  assert.doesNotMatch(src('src/ui/deck-ui.css'), /pz-veil\.dip/);
  // (the lifted 2D rule `#stageView.pz-out { opacity: .22 }` stays in the lifted css, but nothing in the 3D app ever puts the class on the view)
  for (const f of ['src/ui/cards/CardLayer.tsx', 'src/ui/cards/CardFrame.tsx', 'src/ui/shell/talk.ts', 'src/ui/talk/deck-model.ts', 'src/decks/hp/link.ts', 'src/ui/shell/figure-dip.ts']) assert.doesNotMatch(src(f).replace(/\/\/.*$/gm, ''), /['"`]pz-out['"`]/, f);
  assert.match(src('src/ui/css2d/app-04-presenter.css'), /#labels \.lb\.unlit[^}]*opacity: var\(--label-dim\)/, 'the lit/unlit label dim stays');
});
