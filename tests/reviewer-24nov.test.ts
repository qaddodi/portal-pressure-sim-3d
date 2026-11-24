// The external reviewer's findings on build e4810ea9 (24 Nov 2026). Node only: the copied decks' words (checked against Baveno VIII 4.13, 5.35 to 5.37, 6.17, 7.4), the contact sheet's header and the table legend.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slidesWord, sheetHeaderLines } from '../src/ui/capture/capture-model.ts';
import { CAUSE_TREATED } from '../src/decks/ag/cause-treated.copied.ts';
import { DOPPLER } from '../src/decks/ag/doppler.copied.ts';
import { ENCEPHALOPATHY } from '../src/decks/ag/encephalopathy.copied.ts';
import { ENDOSCOPY } from '../src/decks/ag/endoscopy.copied.ts';
import { GASTRIC_VARICES } from '../src/decks/ag/gastric-varices.copied.ts';
import { DECK as OUTFLOW } from '../src/decks/hp/data/outflow.copied.ts';
import { RECOMPENSATION } from '../src/decks/rw/copied/recompensation.ts';
import { TEN_YEARS } from '../src/decks/rw/copied/ten-years.ts';
import { TIPS_CANDIDACY } from '../src/decks/rw/copied/tips-candidacy.ts';
import { TIPS_COMPLETE } from '../src/decks/rw/copied/tips-complete.ts';
import { tableModel } from '../src/ui/talk/table-model.ts';

type Slide = Record<string, any>;
const at = (d: { slides: readonly unknown[] }, id: string): Slide => { const s = (d.slides as Slide[]).find((x) => x.id === id); assert.ok(s, id); return s; };
const words = (s: Slide) => `${s.title} ${s.line}`;

test('the contact sheet header says "1 slide" and wraps a long title inside the width instead of running off', () => {
  assert.equal(slidesWord(1), '1 slide'); assert.equal(slidesWord(12), '12 slides');
  const w = (t: string) => t.length * 10;
  const lines = sheetHeaderLines('Decompensation and recompensation of cirrhosis in one patient · 1 slide', 400, w);
  assert.equal(lines.length, 2); assert.ok(lines.every((l) => w(l) <= 400), lines.join('|'));
  assert.deepEqual(sheetHeaderLines('Outflow · 1 slide', 400, w), ['Outflow · 1 slide']);
});

test('the table legend names the units for the whole table and says what the double arrows are', () => {
  const m = tableModel({ cols: ['he', 'ppg'], asc: false, vs: 'first' } as never, [{ spec: { ref: true }, f: null, i: 0, title: 'Healthy', kicker: 'Reference' }] as never);
  assert.match(m.legend, /relative change of ≥40%/); assert.ok(!/Top row/.test(m.legend));
  assert.match(m.legend, /Units: .*HE risk is the model's own index, 0 to 1, not a probability/);
});

test('SOS: the ascites shrinks, it does not "resolve", and mild SOS is not left to watch', () => {
  const s = at(OUTFLOW, 'recover');
  assert.ok(!/resolves/.test(words(s))); assert.match(s.line, /\{asc\}/); assert.match(s.notes, /close monitoring/); assert.ok(!/EBMT/.test(s.notes));
});
test('the first slide of Treating the cause names the LSM-only cut-off and the model', () => {
  const s = at(CAUSE_TREATED, 'before'); assert.match(s.line, /25 kPa that rules CSPH in by stiffness alone/); assert.match(s.line, /ANTICIPATE/);
});
test('the Doppler cut-off is a supportive main portal vein finding, angle corrected', () => {
  const s = at(DOPPLER, 'slow'); assert.match(s.line, /main portal vein velocity/); assert.match(s.line, /supports portal hypertension/); assert.match(s.notes, /<60°/);
});
test('Encephalopathy: the headline is about this patient and the table is a model index', () => {
  assert.match(at(ENCEPHALOPATHY, 'summary').title, /^In this patient/);
});
test('Varix: the headline names the HVPG, not "portal pressure"', () => {
  const s = at(ENDOSCOPY, 'relation'); assert.match(s.title, /HVPG/); assert.ok(!/portal pressure/.test(s.title));
});
test('Gastric varices BRTO: the shunt is marked and the anatomy it needs is said', () => {
  const s = at(GASTRIC_VARICES, 'brto'); assert.deepEqual(s.mark.edges, ['C5']); assert.ok(s.terms.includes('lrv')); assert.match(s.line, /suitable gastrorenal shunt/);
});
test('Recompensation (Baveno VIII 7.4): one row per criterion, the interval on the first four, liver function apart', () => {
  const t = at(RECOMPENSATION, 'recomp').tool; assert.equal(t.rows.length, 5); assert.match(t.lead, /first four each for >6 months/);
  assert.ok(!/ascites.*HE.*rebleeding/i.test(JSON.stringify(t.rows[1])), 'ascites has its own row');
});
test('HE after TIPS (Baveno VIII 6.17): the precipitant and lactulose together; recurrent or persistent HE; embolization allowed', () => {
  for (const [d, id] of [[TEN_YEARS, 'he-answer'], [TIPS_COMPLETE, 'he']] as const) {
    const s = at(d, id); assert.ok(!s.tool.ordered); assert.match(s.title, /together/); assert.match(JSON.stringify(s.tool.rows), /Recurrent or persistent HE/); assert.match(s.line, /embolized/);
  }
});
test('Who should get a TIPS: congestion raises the free and wedged pressures together; the gradients understate the portal pressure', () => {
  const s = at(TIPS_CANDIDACY, 'heart'); assert.ok(!/lowers both gradients/.test(`${s.title} ${s.notes}`)); assert.match(s.notes, /free and the wedged hepatic vein pressures together/);
});
test('TIPS follow-up: a rebleed is a reason to CONSIDER TIPS, and the covered stent is preferred over balloon tamponade (4.13, 5.35)', () => {
  const s = at(TIPS_COMPLETE, 'rescue'); assert.ok(!/means rescue TIPS/.test(s.line)); assert.match(s.line, /consider TIPS/); assert.match(s.line, /preferred over balloon tamponade/); assert.match(s.tool.rule, /5\.35 to 5\.37/);
});

test('the capture waits for the slide\'s state to reach the figure, past the labels\' own give-up (a sped-up page clock spends it at once)', async () => {
  const { setFigurePending, figureWaiting, figurePending } = await import('../src/ui/deck/figure-pending.ts');
  setFigurePending(false); assert.equal(figureWaiting(), false);
  setFigurePending(true); assert.equal(figureWaiting(), true); assert.equal(figurePending(), true);
  setFigurePending(false); assert.equal(figureWaiting(), false);
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync('src/ui/debug/audit/capture-all.ts', 'utf8'), /figureWaiting\(\)\) return/);
});

test('a label never prints the slide before\'s patient: the figure stays pending however long the state takes, there is no timeout fallback', async () => {
  const { setFigurePending, figurePending } = await import('../src/ui/deck/figure-pending.ts');
  const { clock } = await import('../src/clock/frame.ts');
  setFigurePending(false); setFigurePending(true);
  const old = clock.now; (clock as { now: () => number }).now = () => old.call(clock) + 3_600_000;   // an hour of page time later
  try { assert.equal(figurePending(), true, 'still pending after an hour: no give-up'); } finally { (clock as { now: () => number }).now = old; setFigurePending(false); }
  const { readFileSync } = await import('node:fs');
  assert.ok(!/GIVE_UP/.test(readFileSync('src/ui/deck/figure-pending.ts', 'utf8').replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '')));
  assert.match(readFileSync('src/scene/labels/LabelLayer.tsx', 'utf8'), /figurePending\(\)/);
});

// ---- the second report (iPhone captures of build 43583487) ----
import { runStepsNode } from '../src/decks/rw/numbers-node.ts';
import { TWO_INFLOWS } from '../src/decks/rw/copied/two-inflows.ts';
import { CHOOSE_TREATMENT } from '../src/decks/ag/choose-treatment.copied.ts';
import { CARVEDILOL } from '../src/decks/ag/carvedilol.copied.ts';
import { CIRCULATION } from '../src/decks/ag/circulation.copied.ts';
import { VARICEAL_BLEED } from '../src/decks/rw/copied/variceal-bleed.ts';
import { toolPlane, planeReading } from '../src/ui/charts/plane/model.ts';
import { overLeaf } from '../src/ui/charts/path/frame.ts';
import { STIFFNESS } from '../src/decks/rw/copied/stiffness.ts';
import { SHUNTS } from '../src/decks/rw/copied/shunts.ts';

test('Dual blood supply: the chart is the clot slide\'s own patient, so its end points are the 79% and 44% the line and notes give', async () => {
  const s = at(TWO_INFLOWS, 'relation'); assert.equal(s.tool.patient.preset, 'pvt-acute');
  const clot = at(TWO_INFLOWS, 'clot'); assert.equal(clot.preset, 'pvt-acute');
  const [withB, noB, chartWith, chartNo] = await runStepsNode([{ preset: 'pvt-acute' }, { preset: 'pvt-acute', params: { habrStrength: 0 } }, { preset: s.tool.patient.preset, params: { thrombus: { PV_TRUNK: 1 } } }, { preset: s.tool.patient.preset, params: { thrombus: { PV_TRUNK: 1 }, habrStrength: 0 } }]);
  assert.equal(Math.round(withB!.liver as number), 79); assert.equal(Math.round(noB!.liver as number), 44);
  assert.ok(Math.abs((chartWith!.liver as number) - (withB!.liver as number)) < 1e-6); assert.ok(Math.abs((chartNo!.liver as number) - (noB!.liver as number)) < 1e-6);
  assert.match(s.notes, /79% with the buffer and 44% without/);
});
test('Choose the treatment: homozygous factor V Leiden means long-term anticoagulation (Baveno VIII 9.10a)', () => {
  assert.match(at(CHOOSE_TREATMENT, 'a4').line, /permanent major risk factor, so it continues long term/);
});
test('The portal circulation: the HVPG definition is scoped to sinusoidal portal hypertension', () => {
  const s = at(CIRCULATION, 'define'); assert.match(s.title, /sinusoidal portal hypertension/); assert.match(s.notes, /presinusoidal/);
});
test('Carvedilol in ascites carries its stop conditions (Baveno VIII 4.6, 4.7)', () => {
  const l = at(CARVEDILOL, 'ascites').line; assert.match(l, /<90 mmHg/); assert.match(l, /<65 mmHg/); assert.match(l, /HRS-AKI/);
});
test('Acute variceal bleed: the airway and resuscitation lead, the drugs go in together, and intubation names active hematemesis (5.5)', () => {
  const t = at(VARICEAL_BLEED, 'oct').tool; assert.ok(!t.ordered); assert.match(t.rows[0], /Airway/); assert.match(t.rows[0], /active hematemesis/); assert.match(t.rows[1], /at once and together/);
});
test('Stiffness 14: a presinusoidal case prints no zone, and the reading says the criteria do not apply', () => {
  const t = at(STIFFNESS, 'a5').tool, pl = toolPlane(t)!;
  assert.ok(pl.noWords); assert.match(planeReading(pl, { lsm: 8, plt: 90 } as never), /Criteria don't apply in this case$/); assert.ok(!/Indeterminate/.test(planeReading(pl, { lsm: 20, plt: 120 } as never)));
});
test('TIPS and shunts: the 12 mmHg is this patient\'s bleeding target', () => { assert.match(at(SHUNTS, 'tips').line, /target for preventing rebleeding in this patient/); });
test('A tree\'s root over the middle of an odd row of leaves draws no dot (PVT 3: the white marker sat over Partial)', () => {
  const leaf = { id: 'x' }; const tree = { id: 'root', kids: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
  assert.equal(overLeaf(tree, tree), true); assert.equal(overLeaf(tree, { id: 'a' }), false);
  assert.equal(overLeaf({ id: 'r', kids: [{ id: 'a' }, { id: 'b' }] }, { id: 'r' }), false); void leaf;
});

test('a tile\'s status word is one short row under its value, and the README counts pictures and slides from the final list', async () => {
  const { ratedShown } = await import('../src/ui/cards/tiles-2d.ts');
  const w = ratedShown('ppg', { ppg: 9.1 } as never, true)[1];
  assert.equal(w, 'Below 12 mmHg'); assert.ok(w.length <= 14, 'one row in a narrow tile');
  const { countWords } = await import('../src/ui/capture/capture-model.ts');
  assert.equal(countWords(53, 43, 10), '53 pictures of 43 slides in 10 talks'); assert.equal(countWords(1, 1, 1), '1 picture of 1 slide in 1 talk');
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync('src/ui/debug/audit/capture-all.ts', 'utf8'), /files\.filter\(\(f\) => f\.name\.endsWith\('\.jpg'\)\)\.length, slidesSeen\.size/);
});
