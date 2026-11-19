// Every self-check rule has a case that fires and a case that must not (a rule that fires wrongly wastes as much time as no rule), and the screen report is plain data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildScreen, stableReport, screenText } from '../src/ui/debug/screen/build.ts';
import { ruleList, ruleFamilies, clashes } from '../src/ui/debug/core/rules.copied.js';
import { app, dom, card } from './debug-helpers.ts';
import type { RawLabel } from '../src/ui/debug/screen/raw.ts';

const fires = (id: string, a: ReturnType<typeof app>, d: ReturnType<typeof dom>) => buildScreen({ app: a, dom: d, only: undefined }).findings.filter((f: { rule: string }) => f.rule === id);
const label = (name: string, x: number, y: number, over: Partial<RawLabel> = {}): RawLabel => ({ name, kind: 'label', x, y, w: 80, h: 18, opacity: 1, on: true, tone: '', ...over });

test('the registry has every family and no id twice, and each rule names its owner file and its reason', () => {
  buildScreen({ app: app(), dom: dom() });
  assert.deepEqual(clashes(), []);
  for (const r of ruleList()) { assert.ok(r.owner && r.why, r.id); assert.match(r.owner, /^(src\/|index\.html)/, r.id); }
  for (const f of ['fit', 'edge', 'label', 'figure', 'pressure', 'a11y', 'motion', 'wording']) assert.ok(ruleFamilies().includes(f), f);
});

test('a clean page has no findings', () => {
  const s = buildScreen({ app: app(), dom: dom() });
  assert.deepEqual(s.findings, [], JSON.stringify(s.findings));
  assert.equal(s.errors, undefined);
});

test('fit rules', () => {
  const d = (c: Partial<ReturnType<typeof card>>) => dom({ cards: [card(c)] });
  assert.equal(fires('fit-scroll', app(), d({ scrollsY: true })).length, 1);
  assert.equal(fires('fit-scroll', app(), d({})).length, 0);
  assert.equal(fires('fit-sideways', app(), d({ scrollsX: true })).length, 1);
  const small = card(); small.texts[2]!.px = 11;
  assert.equal(fires('fit-small', app(), dom({ cards: [small] })).length, 1);
  assert.equal(fires('fit-small', app(), dom({ cards: [card({ phase: 'out' })] })).length, 0, 'a card going out is not judged');
  // title 24 over body 16 is 1.5; 20 over 16 is 1.25, under even the phone ratio
  const thin = card(); thin.texts[1]!.px = 20;
  assert.equal(fires('fit-ratio', app(), dom({ cards: [thin] })).length, 1);
  assert.equal(fires('fit-ratio', app(), dom()).length, 0);
  const shrunk = card(); shrunk.texts[2]!.px = 13;
  assert.equal(fires('fit-shrink', app(), dom({ cards: [shrunk] })).length, 1);
  assert.equal(fires('fit-styled', app(), dom({ fontsLoaded: false })).length, 1);
  assert.equal(fires('fit-off', app(), d({ x: 300 })).length, 1);
  assert.equal(fires('fit-off', app(), d({})).length, 0);
});

test('edge rules', () => {
  const cut = card(); cut.texts[2]!.bottom = 720;           // the card ends at 700
  assert.equal(fires('edge-cutoff', app(), dom({ cards: [cut] })).length, 1);
  assert.equal(fires('edge-cutoff', app(), dom()).length, 0);
  const off = card({ x: 16 }); off.texts[2]!.right = 400;   // the screen is 390 wide
  assert.equal(fires('edge-off', app(), dom({ cards: [off] })).length, 1);
});

test('label rules', () => {
  assert.equal(fires('label-under-card', app(), dom({ labels: [label('Portal vein', 40, 450)] })).length, 1, 'over the teaching card');
  assert.equal(fires('label-under-card', app(), dom({ labels: [label('Portal vein', 40, 100)] })).length, 0);
  assert.equal(fires('label-under-card', app(), dom({ labels: [label('Portal vein', 40, 450, { opacity: 0.2 })] })).length, 0, 'a fading label is judged when it has settled');
  assert.equal(fires('label-off-screen', app(), dom({ labels: [label('Spleen', 350, 100)] })).length, 1);
  assert.equal(fires('label-overlap', app(), dom({ labels: [label('A', 10, 100), label('B', 20, 102)] })).length, 1);
  assert.equal(fires('label-overlap', app(), dom({ labels: [label('A', 10, 100), label('B', 200, 100)] })).length, 0);
});

test('figure, pressure and accessibility rules', () => {
  assert.equal(fires('figure-engine', app({ engine: { status: 'crashed', frames: 0, crash: 'x', running: false, day: null } }), dom()).length, 1);
  assert.equal(fires('pressure-colour', app(), dom({ readouts: [{ label: 'HVPG', value: 11.1, sev: 'caution' }] })).length, 1, 'HVPG 11.1 is red');
  assert.equal(fires('pressure-colour', app(), dom({ readouts: [{ label: 'HVPG', value: 7.5, sev: 'caution' }, { label: 'PPG', value: 5, sev: 'ok' }] })).length, 0);
  const a = dom().a11y;
  assert.equal(fires('a11y-figure-named', app(), dom({ a11y: { ...a, figureName: '' } })).length, 1);
  assert.equal(fires('a11y-figure-named', app(), dom({ a11y: { ...a, figureDescription: '' } })).length, 1);
  assert.equal(fires('a11y-live-region', app(), dom({ a11y: { ...a, live: false } })).length, 1);
  assert.equal(fires('a11y-lang', app(), dom({ a11y: { ...a, lang: '' } })).length, 1);
  assert.equal(fires('a11y-control-name', app(), dom({ a11y: { ...a, unnamed: ['button.x'] } })).length, 1);
  assert.equal(fires('a11y-colour-cue', app(), dom({ cues: [{ el: 'i.dot', tone: 'danger', text: '', named: false }] })).length, 1, 'a colour alone');
  assert.equal(fires('a11y-colour-cue', app(), dom({ cues: [{ el: 'i.dot', tone: 'danger', text: '', named: true }] })).length, 0, 'named for a reader');
  assert.equal(fires('a11y-colour-cue', app(), dom()).length, 0, 'a number beside it');
});

test('wording rules read the words on the cards', () => {
  const c = card(); c.texts[2]!.text = 'Baveno VII says so — and the oesophagus';
  const f = buildScreen({ app: app(), dom: dom({ cards: [c] }) }).findings.map((x: { rule: string }) => x.rule);
  for (const r of ['wording-em-dash', 'wording-older-baveno', 'wording-british']) assert.ok(f.includes(r), r);
  const ok = card(); ok.texts[2]!.text = 'Baveno VIII recommends carvedilol';
  assert.equal(buildScreen({ app: app(), dom: dom({ cards: [ok] }) }).findings.length, 0);
});

test('the screen report is plain data with the 2D app\'s parts, a summary text under 2 KB, and a stable form without times or memory', () => {
  const s = buildScreen({ app: app(), dom: dom({ labels: [label('Portal vein', 40, 100)] }), detail: 'full' });
  for (const p of ['page', 'camera', 'cards', 'labels', 'figure', 'deck', 'a11y', 'health', 'findings']) assert.ok(p in s, p);
  assert.doesNotThrow(() => JSON.stringify(s));
  const stable = stableReport(s);
  assert.ok(!('health' in stable));
  assert.ok(screenText(buildScreen({ app: app(), dom: dom() })).length < 2000, 'the summary text is about 2 KB');
  assert.match(screenText(s), /Card teach \(in\)/);
  assert.ok(buildScreen({ app: app(), dom: dom() }).findings.length === 0);
});

test('a reader that throws is named, the other parts still come', () => {
  const s = buildScreen({ app: app(), dom: { ...dom(), cards: null as never } });
  assert.ok(s.errors?.cards);
  assert.ok(s.page && s.figure);
});
