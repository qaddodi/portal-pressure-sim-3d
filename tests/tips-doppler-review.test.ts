// TIPS Doppler review (23 Nov 2026, capture 5f2dbfd3): the deck's own words and data, the table that compares a stenosed stent with the patent one (never "better"), the readings' width (no gap after a reading),
// proportional figures in prose, and the Doppler probe keeping off the figure's colour key. Node only, static.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TIPS_DOPPLER } from '../src/decks/rw/copied/tips-doppler.ts';
import { tableModel, type ResolvedRow, type Fp } from '../src/ui/talk/table-model.ts';
import { reserveOf } from '../src/ui/cards/roll-reserve.ts';
import { parseWords } from '../src/decks/rw/numbers.ts';
import { probeCards } from '../src/scene/devices/probes/cards.ts';
import { setKeyRoom } from '../src/scene/labels/probe-boxes.ts';
import { TIPS_DOPPLER_REVIEW } from '../scripts/source-edits.mjs';

const slide = (id: string) => (TIPS_DOPPLER.slides as readonly Record<string, any>[]).find((s) => s.id === id)!;
const css = readFileSync(new URL('../src/ui/deck-ui.css', import.meta.url), 'utf8');
const nums = JSON.parse(readFileSync(new URL('./fixtures/rw-numbers.json', import.meta.url), 'utf8')).decks['tips-doppler'] as Fp[];

test('the review patches are all in the copied deck (a re-copy from 2D gives the same words)', () => {
  assert.ok(TIPS_DOPPLER_REVIEW.length >= 11);
  assert.match(slide('before').line, /indigo or blue on the velocity map/, 'the portal veins are not "pale": the figure draws indigo and blue');
  assert.doesNotMatch(slide('before').line, /pale/);
  assert.equal(slide('alias').lens, 'velocity', 'the aliasing slide keeps the velocity lens the slides around it teach');
  assert.deepEqual(slide('jet').cam, [520, 300, 630, 450], 'the first view is centred between the portal end and the middle of the stent, not on the right portal vein alone');
  assert.match(slide('narrow').line, /\{tipsVel\}, past the \{190 cm\/s\} cut-off/, 'the jet is named by its reading');
  assert.ok(nums[6]!.tipsVel! > 190 && nums[6]!.tipsVel! < 700, 'the model has a jet reading for the words to print');
  const p = slide('fix').compare[0].params;
  assert.deepEqual(p.stenosisSite, { TIPS: 'distal' }, 'slide 10 samples the stenosis where slide 7 does');
});

test('the stenosed row of the summary table is compared with the patent stent: worse is red, never the green "better"', () => {
  const t = slide('summary');
  assert.deepEqual(t.cols, ['ppg', 'pvVel', 'wave']);
  assert.equal(t.wave, 'TIPS');
  assert.equal(t.of[2].vs, 'jet');
  const row = (i: number, id: string, fi: number): ResolvedRow => ({ spec: t.of[i], i: i + 1, f: nums[fi] ?? null, title: t.of[i].title, kicker: t.of[i].kicker ?? '', trace: { t: [0, 1], v: [0, 0] } });
  const m = tableModel({ cols: t.cols, of: t.of, vs: t.vs, wave: t.wave, note: t.note, rowHead: t.rowHead, asc: false } as never, [row(0, 'before', 1), row(1, 'jet', 2), row(2, 'narrow', 6)]);
  const [before, patent, stenosed] = m.rows;
  assert.ok(before!.ref, 'the baseline row keeps its numbers');
  assert.equal(before!.cells[2]!.kind, 'blank', 'a stent that is not there has no trace');
  assert.equal(patent!.cells[0]!.eff, 'good', 'the stent lowers the PPG: better than before');
  assert.equal(patent!.cells[1]!.eff, 'good', 'and raises the portal vein velocity past 30 cm/s: better than before');
  assert.equal(stenosed!.cells[0]!.arrow > 0 && stenosed!.cells[0]!.eff, 'bad', 'the PPG is higher than the patent stent: worse');
  assert.equal(stenosed!.cells[1]!.arrow < 0 && stenosed!.cells[1]!.eff, 'bad', 'the portal vein velocity is lower than the patent stent: worse');
  assert.match(stenosed!.vs, /vs patent TIPS/i);
  assert.equal(stenosed!.cells[2]!.kind, 'wave');
  assert.match(m.legend, /pressures in mmHg, portal vein velocity in cm\/s/, 'the legend gives the velocity column its own unit');
});

test('the pressure-versus-stenosis curve runs the patent stent slide\'s own patient, so 0% is the 36 cm/s and 9.7 mmHg of slide 5', () => {
  const tool = slide('relation').tool;
  assert.equal(tool.patient.preset, 'cirr-decomp');
  assert.equal(tool.days, 30);
  const jet = slide('jet'), before = slide('before');
  assert.deepEqual({ ...tool.patient.params }, { ...before.params, ...jet.params }, 'the patient is the before slide\'s with the jet slide\'s changes on it');
  assert.equal(jet.days, tool.days, 'the same month after the stent');
});

test('a reading that cannot change size reserves its own width: no gap before the next word (the padding is for sliders and patient switches)', () => {
  assert.equal(reserveOf('18.2 mmHg', 'ppg', false, true), '18.2 mmHg');
  assert.equal(reserveOf('1.1 L', 'asc', false, true), '1.1 L');
  assert.equal(reserveOf('1.1 L', 'asc'), '00.0 L', 'with a control that can change it, the padded reserve is kept (Plan 45)');
  assert.notEqual(reserveOf('…', 'asc', false, true), '…', 'a reading not yet in still reserves its typical value');
  const line = readFileSync(new URL('../src/ui/cards/Line.tsx', import.meta.url), 'utf8'), card = readFileSync(new URL('../src/ui/cards/TeachingCard.tsx', import.meta.url), 'utf8');
  assert.match(line, /reserveOf\(text, p\.key, p\.decimals === 0, still, \{/);
  assert.match(card, /still = !slide\.lapse && !ctl\?\.whatIf && !ctl\?\.strain && !ctl\?\.compare\?\.opts\.some\(\(o\) => o\.preset \|\| o\.slide\)/);
  // the two slides the review saw it on carry compare buttons that only move the gate or the stenosis site: they hold still
  for (const id of ['jet', 'narrow']) assert.ok(parseWords(slide(id).line).some((p) => p.t === 'value'), id);
});

test('prose figures are proportional (a "1" is not a full-width cell: ">190" read ">1 90"), the readings\' own boxes stay tabular', () => {
  // (important, both: the lifted 2D sheet ends with `* { font-variant-numeric: tabular-nums !important }`, which beat the plain rules this test used to pin: the figures were never proportional, 23 Nov multi-size review)
  assert.match(css, /\.deck-ui :is\(\.pz-h, \.pz-line, \.pz-side-p, [^)]*\) \{ font-variant-numeric: lining-nums proportional-nums !important; \}/);
  assert.match(css, /\.deck-ui :is\(\.pz-line, \.pz-side-p, \.pz-h\) :is\([^)]*\) \{ font-variant-numeric: tabular-nums lining-nums !important; \}/);
  const all = readFileSync(new URL('../src/ui/css2d/app-11-deck-visuals.css', import.meta.url), 'utf8');
  assert.match(all, /\*, \*::before, \*::after \{ font-variant-numeric: tabular-nums lining-nums !important;/, 'the universal important rule these must outrank');
  const layer = readFileSync(new URL('../src/ui/charts/text-layer.ts', import.meta.url), 'utf8');
  assert.match(layer, /w\.tab \? 'tabular-nums lining-nums' : 'proportional-nums lining-nums'/, 'chart words are proportional unless they count in place');
  assert.match(layer, /setProperty\('font-variant-numeric', nums, 'important'\)/);
});

test('the Doppler probe keeps off the figure\'s colour key as off a card, and a label keeps 9 px off its body', async () => {
  const none = probeCards({ x: 0, y: 0, w: 0, h: 0 });
  setKeyRoom({ x0: 100, y0: 600, x1: 300, y1: 640 });
  const withKey = probeCards({ x: 0, y: 0, w: 0, h: 0 });
  setKeyRoom(null);
  assert.equal(withKey.length, none.length + 1, 'the key is one more box');
  assert.ok(withKey.some((b) => b.x0 === 94 && b.y0 === 594 && b.x1 === 306 && b.y1 === 646), 'grown by the cards\' 6 px');
  assert.equal(probeCards({ x: 0, y: 0, w: 0, h: 0 }).length, none.length, 'and gone with the key');
  const probe = readFileSync(new URL('../src/scene/devices/probes/doppler-probe.ts', import.meta.url), 'utf8');
  assert.match(probe, /BODY_CLAIM_PAD = 9/);
  assert.match(probe, /const own = v\.id === id;/, 'the sampled vessel\'s own course away from the gate counts as busy');
});
