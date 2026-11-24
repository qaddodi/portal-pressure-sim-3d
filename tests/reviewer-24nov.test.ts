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
