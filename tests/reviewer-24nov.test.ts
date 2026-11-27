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
  assert.match(pipeline(), /figureWaiting\(\)\) return/);
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
test('TIPS and shunts: the 12 mmHg is the variceal-bleed reference, and this ascites patient\'s stent is small (W6c, 27 Nov)', () => { assert.match(at(SHUNTS, 'tips').line, /under the 12 mmHg reference for a variceal bleed\. For her ascites the stent is small/); });
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
  assert.match(pipeline(), /files\.filter\(\(f\) => f\.name\.endsWith\('\.jpg'\)\)\.length, slidesSeen\.size/);
});

// ---- third report (build 3252079e, 440 x 736): the words say what the model's values show; no grade bands on a volume axis; the <12 target is the gradient's ----
import { ASCITES } from '../src/decks/ag/ascites.copied.ts';
import { courseOf, layout } from '../src/ui/charts/curve/course-pure.generated.js';
import { scriptById } from '../src/ui/tests/ir/copied/reading-scripts.copied.js';

test('TIPS follow-up 7 and candidacy: "reduces", not "clears", and the share of portal blood that bypasses the liver is shown', () => {
  for (const d of [TIPS_COMPLETE, TIPS_CANDIDACY]) {
    const s = at(d, 'price');
    assert.match(s.title, /reduces the ascites/); assert.ok(!/clears/.test(s.title) && !/clears the ascites/.test(s.notes));
    assert.match(s.line, /\{shunt\} of portal blood bypasses the liver/); assert.ok(s.tiles.includes('shunt'));
    assert.match(s.notes, /shunt fraction, 92%/);
  }
});
test('TIPS follow-up 11: a raised right atrial pressure supports a cardiac contribution, with the atrial reading on the figure', () => {
  const s = at(TIPS_COMPLETE, 'heart');
  assert.match(s.title, /supports a cardiac contribution to the ascites/); assert.match(s.line, /raise venous return/);
  assert.ok(!/not the liver/.test(s.title)); assert.equal(s.mark, undefined, 'the cardiac output is the instrument\'s, not a second note'); assert.ok(s.labels.includes('RA') && s.sites.includes('ra'));
});
test('TIPS follow-up 22: the Doppler velocities are this case\'s findings, and venography with pressures evaluates a suspected dysfunction', () => {
  const s = at(TIPS_COMPLETE, 'jet'); assert.match(s.line, /In this case/); assert.match(s.line, /Doppler criteria vary/); assert.match(s.line, /venography with pressure measurements/);
});
test('Ascites 22: the course has no grade bands on its volume axis, and the line gives the model\'s own end value', () => {
  const s = at(ASCITES, 'relation'); assert.equal(s.tool.zones, false);
  assert.match(s.line, /reduces it further, to \{asc\} at the end/); assert.ok(!/1\.5 L|5 L/.test(s.notes)); assert.match(s.notes, /grade 1 is ascites seen only on ultrasound/);
  const c = courseOf(s.tool), G = layout(400, 300, 12, c, null);
  assert.equal(G.zones.length, 1); assert.ok(G.zones.every((z: { name: string }) => !z.name)); assert.ok(G.ticks.length >= 3 && G.ticks.every((t: { rate: unknown }) => !t.rate), JSON.stringify(G.ticks));
  assert.ok(layout(400, 300, 12, courseOf({ ...s.tool, zones: undefined }), null).zones.length > 1, 'a course that does not ask keeps its bands');
  assert.ok(!/clears it by/.test(at(ASCITES, 'summary').notes)); assert.match(at(ASCITES, 'tips').line, /falls over weeks to \{asc\}/);
});
test('TIPS 14: the <12 mmHg target is not a line on the catheter-pressure axis; it stands beside the PPG result', () => {
  const S = scriptById('tips'); assert.ok(S); assert.ok(!S.target && !S.targetWord); assert.match(S.result.word, /PPG \(reference <12\)/);
});

// ---- fourth and fifth reports (build 3252079e): one source for numbers and strips, no volume grades, preferred bridge, decisions on the rows ----
import { TREATMENT } from '../src/decks/rw/copied/treatment.ts';
import { TIPS_DOPPLER } from '../src/decks/rw/copied/tips-doppler.ts';
import { ALBUMIN } from '../src/decks/ag/albumin.copied.ts';
import { beatAgrees } from '../src/ui/tests/slide/beat-agree.ts';
import { TILE } from '../src/ui/charts/tiles.generated.ts';
import { cardTitle } from '../src/ui/talk/tool-title.ts';
import { StationExtras } from '../src/scene/labels/readings.ts';

const rec = (n: number, pv: number, hv: number) => ({ t: Array.from({ length: n }, (_, i) => i * 0.1), ch: { whvp: Array(n).fill(hv + 4), RHV: Array(n).fill(hv), CONF: Array(n).fill(pv) } });
test('the beat card is done only when its strip holds the whole past and averages to the numbers beside it (Resuscitating 15: 17 and 3 against 20.1 and 4.1)', () => {
  const pin = { pv: 20.1, fhvp: 4.1, whvp: 8.1, hvpg: 4, hr: 70 };
  assert.equal(beatAgrees(rec(300, 17, 3), pin, 20), false, 'still easing: the lines sit at 17 and 3');
  assert.equal(beatAgrees(rec(60, 20.1, 4.1), pin, 20), false, 'only a stub of history, 6 s of 20');
  assert.equal(beatAgrees(rec(300, 20.1, 4.1), pin, 20), true);
  assert.equal(beatAgrees(rec(300, 17, 4.1), pin, 20, true), true, 'a slide that hides the portal vein is not held by it');
});
test('Resuscitating 15: the covered stent is the preferred bridge, the balloon the fallback (Baveno VIII 5.35)', () => {
  const s = at(VARICEAL_BLEED, 'bridge'); assert.match(s.title, /preferred bridge/); assert.match(s.title, /balloon tamponade is the fallback/); assert.match(s.line, /5\.35/); assert.match(s.mark.label, /fallback/);
});
test('endoscopy within 12 hours follows the first resuscitation (Resuscitating 8, Gastric varices 4)', () => {
  assert.match(at(VARICEAL_BLEED, 'band').line, /after initial resuscitation, and as soon as feasible if instability persists/);
  assert.match(at(GASTRIC_VARICES, 'bleed').line, /after initial resuscitation, endoscopy within 12 hours of presentation/);
});
test('Lowering portal pressure 12: the baseline row carries no second copy of the HVPG, and a TIPS row prints no HVPG arrow (the gradient read after a stent is the PPG)', () => {
  assert.ok(!/16\.5/.test(JSON.stringify(at(TREATMENT, 'summary'))));
  const f = (hvpg: number, tipsFlow: number | null) => ({ hvpg, ppg: 9, tipsFlow });
  const m = tableModel({ cols: ['hvpg', 'ppg'], asc: false, vs: 'first' } as never, [{ spec: { ref: true }, f: f(16.1, null), i: 0, title: 'Baseline', kicker: '' }, { spec: {}, f: f(8, 1.5), i: 1, title: 'TIPS', kicker: '' }] as never);
  assert.equal(m.rows[1]!.cells[0]!.kind, 'blank'); assert.match(m.rows[1]!.cells[0]!.sr, /PPG/); assert.equal(m.rows[1]!.cells[1]!.kind, 'dir'); assert.match(m.legend, /HVPG not read after a TIPS \(the PPG is\)/);
});
test('Who should get a TIPS 13: every row carries a decision and its reason', () => {
  const s = at(TIPS_CANDIDACY, 'summary'); assert.equal(s.note, 'Decision and reason');
  for (const r of s.of.filter((x: Slide) => !x.ref)) assert.match(r.note, /:/, r.title);
  assert.match(s.of[5].note, /Cardiac evaluation first/); assert.match(s.of[1].note, /Preemptive TIPS/);
});
test('Gastric varices 13: each treatment is compared with its own scenario, named by what it is for, with both varix sites named', () => {
  const s = at(GASTRIC_VARICES, 'summary'); const by = (id: string) => s.of.find((r: Slide) => r.id === id);
  assert.equal(by('tips').vs, 'classes'); assert.equal(by('brto').vs, 'classes'); assert.equal(by('eusglue').vs, 'svt'); assert.equal(s.of.at(-1).vs, 'svt');
  assert.match(by('classes').note, /acute hemostasis/); assert.match(by('tips').note, /Definitive/);
  const m = tableModel({ cols: ['gv', 'varix'], asc: false } as never, [{ spec: { ref: true }, f: { gv: 2, varix: 2 }, i: 0, title: 'Healthy', kicker: '' }] as never);
  assert.deepEqual(m.cols.map((c) => c.label), ['Fundal varix', 'Esophageal varix']); assert.match(m.legend, /2 mm is the normal vein/);
});
test('Albumin 3 and Ascites 6, 7: the dose rule apart from the serum albumin; combined lymph and a balance that holds; both albumins of the SAAG', () => {
  assert.match(at(ALBUMIN, 'tap').line, /more than 5 L, albumin is recommended at \{6 to 8 g\} per liter removed\. His serum albumin \(\{salb\}\) is a separate reading/);
  const b = at(ASCITES, 'balance'); assert.match(b.line, /hepatic and intestinal together/); assert.match(b.line, /returns almost all of it, so the ascites grows only slowly/); assert.ok(!/every day/.test(b.line));
  const g = at(ASCITES, 'saag'); assert.match(g.line, /\{salb\}.*\{aalb\}.*\{saag\}/); assert.match(g.line, /supports portal hypertensive physiology/); assert.ok(TILE.aalb);
});
test('no gauge, tile or chart axis prints a clinical ascites grade from a volume', () => {
  const words = ['Grade 1', 'Grade 2', 'Grade 3'];
  for (const t of Object.values(TILE) as { long?: string }[]) for (const w of words) assert.ok(!(t.long ?? '').includes(w));
  const src = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8');
  for (const f of ['../src/ui/tests/copied/dock-tiles.copied.js', '../src/ui/tests/copied/abdomen-slice.copied.js', '../src/ui/tests/copied/table-marks.copied.js', '../src/ui/bigtime/frame.ts']) for (const w of words) assert.ok(!src(f).includes(`'${w}'`) && !src(f).includes('`' + w), `${f} ${w}`);
});
test('the suggestions Mohammad picked: PVT velocities by case, the embolization site, the Doppler velocities and the HVPG before and after in the words', () => {
  assert.match(at(DECK_PREHEPATIC, 'anticoag-lumen').line, /who has a normal liver, the portal flow velocity is \{pvVel\}/); assert.match(at(DECK_PREHEPATIC, 'pvt-anticoag-lumen').line, /who has cirrhosis.*\{pvVel\}/);
  assert.deepEqual(at(ENCEPHALOPATHY, 'embolize').mark, { edges: ['C6'], label: 'Embolized splenorenal shunt', kind: 'treat' }); assert.equal(TILE.he!.n, 'Model HE index');
  assert.match(at(TIPS_DOPPLER, 'backup').line, /\{pvVel\}.*\{pvVel@mpv\}.*\{pvVel@before\}/);
  assert.match(at(TREATMENT, 'carv-sin').line, /\{hvpg@target\} to \{hvpg\}/);
});
test('a pressure label says what its change is a change from (Where is the resistance 4)', () => {
  assert.equal(cardTitle({ tool: { kind: 'profile' } }, false), 'Pressure, gut to heart, mmHg'); assert.ok(StationExtras);
});
import { readFileSync } from 'node:fs';
import { DECK as DECK_PREHEPATIC } from '../src/decks/hp/data/prehepatic.copied.ts';
import { pipeline } from './capture-source.ts';
test('round 6 (fourth review): the tables compare each row with the state before it, and the model index has one name', async () => {
  const { DECK: KIDNEY } = await import('../src/decks/hp/data/kidney.copied.ts');
  const { DECK: HVPG } = await import('../src/decks/hp/data/hvpg.copied.ts');
  const { ALBUMIN } = await import('../src/decks/ag/albumin.copied.ts');
  const { COLS } = await import('../src/ui/deck/from2d/table-marks.js');
  const k = at(KIDNEY, 'summary') as Slide & { cols: string[]; of: { id: string; vs?: string }[] };
  assert.deepEqual(k.cols, ['map', 'iap', 'rpp']); assert.ok(COLS.iap && COLS.rpp);   // MAP, IAP and APP, the three numbers that make the APP
  assert.deepEqual(k.of.map((r) => r.vs ?? null), [null, 'arteries', 'tense', 'arteries', 'carv', 'hold']);
  const a = at(ALBUMIN, 'summary') as Slide & { of: { id: string; vs?: string; ref?: boolean }[] };
  assert.deepEqual(a.of.map((r) => r.vs ?? (r.ref ? 'ref' : null)), ['ref', 'ind', 'ind', 'ref', 'terli', 'terli-alb']);   // each scenario against its own start
  assert.match(at(HVPG, 'wedge').line as string, /triplicate.*time-compressed/);
  assert.equal(COLS.he, 'Model HE index'); assert.equal(TILE.he!.t, 'Model HE index');
});
