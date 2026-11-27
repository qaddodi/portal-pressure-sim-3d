// Words that contradict the model on screen (external review of capture 3531bdfa, group G5). The rules, each held across every deck rather than the one slide that showed it:
//   1. A slide whose catheter cannot enter a hepatic vein (`cath: 'blocked'`, Budd-Chiari) draws no HVPG and no EUS-PPG bracket, and a slide whose words say these cannot be measured is such a slide.
//   2. A slide whose words say the plane's trail stays in one zone has every point of the trail, and the slide's own, in that zone (17.10 said "stays inside the CSPH region" and ended in Indeterminate).
//   3. A slide that compares a reading with "before the TIPS" says it as the model has it (31.12 said "no lower than before TIPS" at 16.3 against 17.0).
//   4. The title's own typography: an abbreviation of two words never breaks between them, and a mixed-case acronym keeps its case in a title set in capitals.
//   5. The FibroScan's shear-wave picture reads the stiffness (the review took two readings 0.8 kPa apart for one picture).
// Node only: the engine's own chain for a deck's states, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { chainOf, sequencer } from '../src/decks/hp/numbers.ts';
import { deckOrder, loadBuiltin } from '../src/decks/registry.ts';
import { copiedOf } from '../src/decks/hp/deck.ts';
import { spansFor, spansOf, catheterBlocked, HEPATIC_VEIN_SPANS, planProfile, goalOf, profileOf, profileWords, SPANS, type Fp } from '../src/ui/charts/profile/model.ts';
import { profileFrameAtRest } from '../src/ui/charts/profile/frame.ts';
import { hvpgNotMeasurable } from '../src/ui/cuts.ts';
import { csphFingerprint } from '../scripts/gen-engine-fixture.mjs';
import { ctxOf } from './charts-helpers.ts';
import { toolPlane, shownReading, zoneOf } from '../src/ui/charts/plane/model.ts';
import { titleUnits } from '../src/ui/talk/tool-title.ts';
import { tieAbbreviations } from '../src/ui/cards/title-breaks.ts';
import { shearSpeed, elastogramPixels } from '../src/ui/tests/fibro/copied/fibro-model.copied.js';
import type { CopiedDeck, CopiedSlide } from '../src/decks/hp/types.ts';
import type { TextShape } from '../src/ui/charts/scene.ts';


let all: Promise<CopiedDeck[]> | null = null;
/** Every talk's copied words, in the registered order. */
function decks(): Promise<CopiedDeck[]> {
  all ??= (async () => {
    const out: CopiedDeck[] = [];
    for (const id of deckOrder()) { await loadBuiltin(id); const c = copiedOf(id); if (c) out.push(c); }
    return out;
  })();
  return all;
}
/** The engine's state at each slide of a deck (index i is slide i), by the host's own `sequence`; one chain a deck, shared by every test. */
const chains = new Map<string, { n: number; run: Promise<Record<string, number | null>[]> }>();
/** The engine's state at each slide of a deck up to slide `upto` (index i is slide i), by the host's own `sequence`; one chain a deck, kept for the next test and run again only for a later slide. */
function statesOf(d: CopiedDeck, upto = d.slides.length - 1): Promise<Record<string, number | null>[]> {
  const had = chains.get(d.id);
  if (had && had.n >= upto) return had.run;
  const run = (async () => {
    const seq = sequencer(1);
    const core = createCore((m: never) => seq.message(m));
    core.handle({ type: 'run', running: false });
    await core.handle({ type: 'sequence', steps: chainOf(d.slides.slice(0, upto + 1) as never), reqId: 1 });
    core.dispose();
    return d.slides.slice(0, upto + 1).map((_, i) => (seq.results[i + 1]?.fp ?? {}) as Record<string, number | null>);
  })();
  chains.set(d.id, { n: upto, run });
  return run;
}
const words = (s: CopiedSlide): string => [s.title, s.line, ...((s.ask as string[] | undefined) ?? [])].join(' ');

test('a blocked catheter draws no HVPG or EUS-PPG bracket, on every slide that has one', async () => {
  assert.deepEqual(spansFor(['hvpg', 'eus', 'ppg'], null, true).map((s) => s[0]), ['ppg']);
  assert.deepEqual(spansFor(['hvpg', 'eus', 'ppg'], null).map((s) => s[0]), ['hvpg', 'eus', 'ppg'], 'an open vein keeps all three');
  assert.deepEqual(spansFor(undefined, null, true).map((s) => s[0]), ['ppg'], 'a slide that names none gets the default pair, less the HVPG');
  assert.deepEqual(spansFor(['hvpg'], null, true), spansOf([]), 'a slide asking only for the HVPG has nothing left to draw');
  assert.ok(catheterBlocked({ cath: 'blocked' }) && !catheterBlocked({ cath: 'free' }) && !catheterBlocked(null));
  let seen = 0;
  for (const d of await decks()) {
    for (const s of d.slides as CopiedSlide[]) {
      const tool = (s.tool ?? {}) as { kind?: string; spans?: string[] };
      if (catheterBlocked(s) && tool.kind === 'profile') {
        seen++;
        const got = spansFor(tool.spans, null, catheterBlocked(s)).map((x) => x[0]);
        assert.ok(!got.some((k) => HEPATIC_VEIN_SPANS.includes(k)), `${d.id}/${s.id}: a blocked catheter draws ${got.join(', ')}`);
      }
      // the words and the flag are one fact: "cannot be measured" about the HVPG or the EUS-PPG belongs to a slide whose catheter is blocked
      const w = `${s.title} ${s.line}`;
      // (or the slide's state is one: a patient whose hepatic vein is blocked by the model, which a treatment or a control can make or undo; ui/cuts.ts)
      if (/\b(HVPG|EUS-PPG)\b[^.]*\b(cannot be measured|not measurable)\b/i.test(w)) {
        // (a plane or a table that sets cases side by side speaks of the cases it holds: its `of` names earlier slides of the deck)
        const i = d.slides.indexOf(s), st = await statesOf(d, i), of = ((s as { of?: { id: string }[] }).of ?? []).map((c) => d.slides.findIndex((x) => x.id === c.id));
        const flagged = [i, ...of].some((n) => n >= 0 && hvpgNotMeasurable(st[n]));
        assert.ok(catheterBlocked(s) || flagged, `${d.id}/${s.id}: the words say it cannot be measured, neither the slide's catheter nor its state (nor a case it holds) is blocked`);
      }
    }
  }
  assert.ok(seen >= 1, 'at least the Gradients Budd-Chiari slide is a blocked profile');
});

test('the Budd-Chiari profile on a blocked slide prints no HVPG or EUS-PPG number, in words or in the picture', async () => {
  const fp = (await csphFingerprint('budd-chiari')) as Fp, healthy = profileOf((await csphFingerprint('healthy')) as Fp)!, p = profileOf(fp)!;
  assert.ok(Math.abs(p.hvpg) < 1, `the model's own HVPG for this patient is ${p.hvpg}: a number that would read as a normal one`);
  const shown = spansFor(['hvpg', 'eus', 'ppg'], fp, true), c = ctxOf('light', 400), f = Math.max(12, c.type.sm);
  const plan = planProfile(400, 0, f, goalOf(p, healthy, null), healthy, null, shown);
  const labels = profileFrameAtRest(plan, c).shapes.filter((s): s is TextShape => s.k === 'text').map((t) => t.s).join('|');
  assert.doesNotMatch(labels, /HVPG|EUS/, labels);
  assert.doesNotMatch(profileWords(plan.goal, shown), /HVPG|EUS/);
  // (and it is the flag that did it: the same patient on an open slide still prints its HVPG)
  const open = planProfile(400, 0, f, goalOf(p, healthy, null), healthy, null, SPANS);
  assert.match(profileFrameAtRest(open, c).shapes.filter((s): s is TextShape => s.k === 'text').map((t) => t.s).join('|'), /HVPG/);
});

test('words that say the plane\'s trail stays in a zone hold for every point of the trail', async () => {
  const STAYS = /\b(?:stays?|remains?)\s+(?:inside|in|within)\s+the\s+(No CSPH|CSPH|indeterminate)\s+(?:region|zone)|\bdoes not leave the\s+(No CSPH|CSPH|indeterminate)\s+(?:region|zone)/i;
  const zoneName = (n: string) => (/^indeterminate$/i.test(n) ? 'Indeterminate' : n);
  let checked = 0;
  for (const d of await decks()) {
    const slides = d.slides as CopiedSlide[], claims = slides.map((s, i) => ({ s, i, m: STAYS.exec(words(s)) })).filter((x) => x.m && (x.s.tool as { kind?: string } | undefined)?.kind === 'plane');
    if (!claims.length) continue;
    const reads = claims.flatMap(({ s, i }) => [i, ...(((s.tool as { trail?: { slide: string }[] }).trail ?? []).map((t) => slides.findIndex((x) => x.id === t.slide)))]);
    // (a slide a later test reads in this deck is in the same chain, so the deck's states are worked out once)
    const later = d.id === 'cause-treated' ? slides.findIndex((x) => x.id === 'high2-plane') : 0;
    const fps = await statesOf(d, Math.max(...reads, later));
    for (const { s, i, m } of claims) {
      const tool = s.tool as { plane?: never; trail?: { slide: string }[] }, pl = toolPlane(tool as never)!;
      const want = zoneName((m![1] ?? m![2])!);
      const at = [i, ...(tool.trail ?? []).map((t) => slides.findIndex((x) => x.id === t.slide))];
      for (const j of at) {
        const z = zoneOf(pl, shownReading(pl, fps[j] as never) as never)?.t;
        assert.equal(z, want, `${d.id}/${s.id}: the words say the trail stays in ${want}, slide ${slides[j]!.id} is in ${z}`);
      }
      checked++;
    }
  }
  // (no slide may make the claim falsely, and today none makes it at all: the rule stays for the next one)
  assert.ok(checked >= 0);
});

test('Cause treated 10 names the zone the trail ends in, and the HVPG that stays', async () => {
  const d = (await decks()).find((x) => x.id === 'cause-treated')!, slides = d.slides as CopiedSlide[];
  const s = slides.find((x) => x.id === 'high2-plane')!, fps = await statesOf(d, slides.findIndex((x) => x.id === 'high2-plane'));
  const pl = toolPlane(s.tool as never)!, zone = (id: string) => zoneOf(pl, shownReading(pl, fps[slides.findIndex((x) => x.id === id)] as never) as never)?.t;
  assert.equal(zone('high'), 'CSPH', 'the trail starts in the CSPH zone');
  assert.equal(zone('high2-plane'), 'Indeterminate', 'and ends outside it');
  assert.match((s.title ?? ''), /ends in the indeterminate zone/);
  assert.match((s.line ?? ''), /ends in the indeterminate zone/);
  assert.match((s.line ?? ''), /\{hvpg\}/, 'the HVPG that stays is the slide\'s own reading');
  assert.ok((fps[slides.findIndex((x) => x.id === 'high2-plane')]!.hvpg as number) >= 10, 'and it is 10 mmHg or more, as the words say');
});

test('Shunts 12 says the occluded gradient as the model has it: close to the pre-TIPS gradient, not "no lower"', async () => {
  const d = (await decks()).find((x) => x.id === 'shunts')!, slides = d.slides as CopiedSlide[], fps = await statesOf(d, slides.findIndex((x) => x.id === 'occl'));
  const at = (id: string) => fps[slides.findIndex((x) => x.id === id)]!.ppg as number;
  const occl = slides.find((x) => x.id === 'occl')!;
  assert.doesNotMatch((occl.line ?? ''), /no lower than before/);
  assert.match((occl.line ?? ''), /\{ppg@own\}/, 'the pre-TIPS number is the first slide\'s own reading');
  assert.ok(Math.abs(at('occl') - at('own')) <= 1.5, `occluded ${at('occl')} against ${at('own')} before the TIPS: close`);
  assert.ok(at('occl') > at('tips') + 5, 'and far above the open stent\'s');
});

test('a title never breaks inside a two-word abbreviation, and a mixed-case acronym keeps its case', async () => {
  assert.equal(tieAbbreviations('Right heart failure (Rt HF): every pressure rises'), 'Right heart failure (Rt HF): every pressure rises');
  assert.equal(tieAbbreviations('No abbreviation here'), 'No abbreviation here');
  assert.deepEqual(titleUnits('First visit with cACLD'), ['First visit with ', 'cACLD', '']);
  assert.deepEqual(titleUnits('Fluid balance · mL/day'), ['Fluid balance · ', 'mL/day', '']);
  assert.deepEqual(titleUnits('Pressures'), ['Pressures']);
  for (const d of await decks()) for (const s of d.slides as CopiedSlide[]) {
    const t = tieAbbreviations((s.title ?? ''));
    assert.ok(!/\bRt HF\b/.test(t), `${d.id}/${s.id}: "${t}" can break inside Rt HF`);
  }
});

test('the shear-wave picture follows the liver stiffness: the speed is the square root of E over 3 rho, so 25 kPa runs 2.2 times faster than 5', () => {
  assert.ok(Math.abs(shearSpeed(25) / shearSpeed(5) - Math.sqrt(5)) < 1e-9);
  const a = elastogramPixels(24, shearSpeed(5), 0) as Uint8ClampedArray, b = elastogramPixels(24, shearSpeed(25), 0) as Uint8ClampedArray, c = elastogramPixels(24, shearSpeed(5.8), 0) as Uint8ClampedArray;
  const apart = (x: Uint8ClampedArray, y: Uint8ClampedArray) => { let n = 0; for (let i = 0; i < x.length; i++) if (Math.abs(x[i]! - y[i]!) > 24) n++; return n / x.length; };
  assert.ok(apart(a, b) > 0.15, `5 and 25 kPa differ in ${(apart(a, b) * 100).toFixed(0)} % of the picture`);
  assert.ok(apart(a, c) < apart(a, b), '5.0 and 5.8 kPa (3.10 and 4.7 of the review) are nearer one another than 5 and 25');
});
