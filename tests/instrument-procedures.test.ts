import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INSTRUMENT_KINDS, INSTRUMENT_SPECS } from '../src/scene/procedures/instrument-specs.ts';
import { PROCEDURE_PLAYS } from '../src/scene/procedures/plays.ts';
import { legsOf, procPlanOf, specFor, stepsOfPlan, stopOf } from '../src/ui/deck/procs-plan.ts';
import { procFrame, specOf, stepAt, stepMarks, GRAFTS } from '../src/scene/procedures/copied/proc-anim.js';
import { PROCEDURE_SLIDES } from '../scripts/instrument-edits.mjs';
import { HP_IDS, loadHpDeck } from '../src/decks/hp/index.ts';
import { AG_IDS, loadAgDeck } from '../src/decks/ag/index.ts';
import { RW_IDS, RW_LOADERS } from '../src/decks/rw/copied/index.ts';
import { markCards } from '../src/scene/labels/proc-marks.ts';
import { featureOf } from '../src/decks/hp/hooks.ts';
import { PROCEDURES } from '../src/scene/procedures/copied/procedure-names.js';
import { loadSource } from '../src/decks/source.ts';

// R4 (22 Nov 2026): the five Treat orders that had no slide procedure (EVL, balloon tamponade, DIPS, DSRS, paracentesis) play from the slides that show their result.
const NAMES: Record<string, string> = { evl: 'band', tamponade: 'balloon', dips: 'dips', dsrs: 'dsrs', paracentesis: 'paracentesis' };

test('EVL is one step, plays by itself, and its result is in during that step; the scope is the plain one (nothing on its tip)', () => {
  const sp = INSTRUMENT_SPECS.evl!;
  assert.equal(sp.steps.length, 1); assert.equal(sp.stops.length, 1); assert.equal(sp.resultStep, 0);
  assert.equal(sp.auto, true); assert.equal(sp.stops[0], sp.T.end);
  assert.ok(sp.T.apply > 0 && sp.T.apply < sp.stops[0]!, 'the bands come in during the one step');
  assert.match(sp.steps[0]![2], /band is released around the base of each varix/); assert.match(sp.steps[0]![2], /thrombose and slough/);
  for (const k of INSTRUMENT_KINDS) if (k !== 'evl') assert.equal(INSTRUMENT_SPECS[k]!.auto, undefined, `${k} waits for Next`);
});

test('each kind is a timeline the card, the layer and the camera already know: steps to its stops, legs to its end, a mark on the part it works on', () => {
  assert.deepEqual([...INSTRUMENT_KINDS].sort(), ['dips', 'dsrs', 'evl', 'paracentesis', 'tamponade']);
  for (const k of INSTRUMENT_KINDS) {
    const sp = INSTRUMENT_SPECS[k]!;
    assert.ok(PROCEDURE_PLAYS.has(k), `${k} plays`);
    assert.equal(featureOf(`procedure:${k}`)!.landed, true, `${k}: the readiness table follows`);
    assert.equal(specOf(k), sp, `${k} is in the table the layer reads`);
    assert.equal(sp.stops.length, sp.steps.length, `${k}: one stop to a step`);
    assert.ok(sp.stops.every((t, i) => t > (i ? sp.stops[i - 1]! : 0)) && sp.stops.at(-1) === sp.T.end, `${k}: stops rise to the end`);
    assert.ok(sp.T.apply > (sp.stops.length > 1 ? sp.stops[0]! : 0) && sp.T.apply < sp.T.back && sp.T.back < sp.T.end, `${k}: the change comes after the first step and before the way out`);
    // the result comes in during the step whose words describe it (DIPS came in during "Needle across", a step early)
    const lo = sp.stops[sp.resultStep - 1] ?? 0, hi = sp.stops[sp.resultStep]!;
    assert.ok(sp.T.apply >= lo && sp.T.apply < hi, `${k}: the change (${sp.T.apply}) is in step ${sp.resultStep} (${lo} to ${hi})`);
    const legs = legsOf(k);
    assert.equal(legs.length, sp.steps.length, k);
    assert.equal(legs.at(-1)![1], sp.T.end, k);
    for (let i = 0; i < sp.steps.length; i++) { assert.equal(stopOf(k, i), sp.stops[i]); assert.equal(stepAt(k, sp.stops[i]!), i, `${k}: step ${i} ends at its stop`); }
    // a graft's frame: no catheter, the step the clock is in, no shot (the slide's own camera stays)
    // (a one-step kind's only stop is its end, where the frame is already the way out: it is sampled just before)
    const f = procFrame(k, Math.min(sp.stops[0]!, sp.T.end - 1)) as { u: number; step: number; shot: string };
    assert.deepEqual([f.u, f.step, f.shot], [0, 0, k === 'dips' ? 'way' : '']);   // (the DIPS has a catheter on a route: its steps frame it, 'way' then 'tip'; the rest keep the slide's own camera)
    for (const s of sp.steps) assert.ok(s[1].length > 3 && s[2].length > 30 && !/AASLD|EASL|Baveno VII\b|\bWarren\b/.test(s[2]), `${k}: the step words`);
  }
});

test('the model change of each: params for the balloon, the DIPS and the DSRS (taken back and put back as Treat\'s button does); an engine morph for EVL and paracentesis', () => {
  const treat = (k: string, p: Record<string, unknown>) => { const sp = INSTRUMENT_SPECS[k]!; assert.equal(sp.had(p), false, `${k}: not yet`); const after = sp.apply(structuredClone(p)); assert.equal(sp.had(after), true, `${k}: had`); assert.equal(sp.had(sp.undo(structuredClone(after))), false, `${k}: undo`); return after; };
  assert.equal(treat('tamponade', { balloonGas: false }).balloonGas, true);
  assert.equal(treat('dips', { dips: { on: false, d: 0 } }).dips.d, 8, 'Treat\'s default diameter');
  assert.equal(treat('dsrs', { dsrs: false }).dsrs, true);
  for (const k of ['evl', 'paracentesis']) { const sp = INSTRUMENT_SPECS[k]!; assert.equal(sp.morph, true); assert.equal(sp.had({}), false); assert.equal(sp.can({}), ''); }
  assert.equal(INSTRUMENT_SPECS.evl!.scope, 'scope', 'EVL puts the plain scope on the figure, with nothing on its tip');
  assert.equal(INSTRUMENT_SPECS.dips!.can({ dips: { on: true } }) !== '', true, 'a DIPS already in is said');
  for (const k of ['tamponade', 'dips', 'dsrs']) assert.ok(INSTRUMENT_SPECS[k]!.before, `${k}: the state before, for the slide's sequence`);
  assert.equal(Object.keys(GRAFTS).includes('rex'), true, 'the Meso-Rex graft is still there, untouched');
});

test('each is named as the Treat order is (one table of procedure names), and the callouts stand on a vessel (none for the tap, which has no vessel)', () => {
  for (const [k, id] of Object.entries(NAMES)) {
    const label = (PROCEDURES as Record<string, { label: string }>)[id]!.label;
    assert.ok(label.includes(INSTRUMENT_SPECS[k]!.label) || INSTRUMENT_SPECS[k]!.name === label || label.includes(INSTRUMENT_SPECS[k]!.name), `${k}: "${INSTRUMENT_SPECS[k]!.name}" vs Treat's "${label}"`);
  }
  for (const k of INSTRUMENT_KINDS) INSTRUMENT_SPECS[k]!.steps.forEach((_, i) => {
    const cards = markCards(stepMarks(k, i) as never);
    assert.equal(cards.length, k === 'paracentesis' ? 0 : 1, `${k} step ${i}`);
  });
});

test('every slide that shows one of these results plays it, and nothing else asks for these kinds', async () => {
  const seen = new Map<string, string | undefined>();
  const add = (d: { id: string; slides: { id: string; procedure?: unknown }[] }) => { for (const s of d.slides) { const base = typeof s.procedure === 'string' ? s.procedure : (s.procedure as { kind?: string } | undefined)?.kind; if (INSTRUMENT_KINDS.includes(base ?? '')) seen.set(`${d.id}/${s.id}`, base); if (PROCEDURE_SLIDES[`${d.id}/${s.id}` as keyof typeof PROCEDURE_SLIDES]) assert.ok(base, `${d.id}/${s.id} has its procedure`); } };
  for (const id of AG_IDS) add((await loadAgDeck(id)) as never);
  for (const id of RW_IDS) add((await loadSource(id)) as never);
  for (const id of HP_IDS) add((await loadHpDeck(id)) as never);
  assert.deepEqual([...seen.keys()].sort(), Object.keys(PROCEDURE_SLIDES).sort());
  for (const [slide, kind] of Object.entries(PROCEDURE_SLIDES)) assert.equal(seen.get(slide), kind, slide);
  const plan = procPlanOf({ procedure: 'evl' })!;
  assert.equal(specFor(plan.kind)!.name, 'Band (EVL)');
  assert.equal(stepsOfPlan(plan).length, 1, 'EVL has no steps to walk: one "Varices banded"');
  assert.equal(plan.auto, true, 'the EVL slide plays as it lands (the slides do not say auto)');
  assert.equal(procPlanOf({ procedure: 'tamponade' })!.auto, false, 'the other kinds still wait for the first Next');
});

test('the link plays a morph kind between the slide before and the slide itself, and a params kind through the order\'s own change', () => {
  const link = readFileSync(new URL('../src/ui/deck/procs-link.ts', import.meta.url), 'utf8');
  assert.match(link, /type: 'morph', snap: on \? c\.snaps\.own : c\.snaps\.before/, 'the change is a morph between the two states');
  assert.match(link, /res\?\.\[i - 1\]\?\.snap/, 'the state before is the slide before it in the chain');
  assert.doesNotMatch(link, /snap: c\.snaps\.own, ms: MORPH_BACK_MS/, 'Back from step 1 leaves the slide as it landed (before its procedure), it never puts the result back');
  assert.match(link, /setEndoscope\(want \? \{ on: true, mode: scope, \.\.\.\(hold \? \{ place: true \} : \{\}\) \} : \{ on: false \}\)/, 'the plain scope follows the run, stood at its station for a kind that holds');
  assert.match(link, /HOLD_KINDS: ReadonlySet<string> = new Set\(\['eusglue', 'evl'\]\)/, 'the EVL slide\'s scope stands until the slide is left');
  assert.match(link, /snaps = morph \? snapsOfSlide\(\)/, 'the morph still runs from the slide before');
  assert.match(link, /snap: sn\.before/, 'the first Next goes to the state before');
});
