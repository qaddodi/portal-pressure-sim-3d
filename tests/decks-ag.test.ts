// Batch B13a: decks A to G. The copy is the 2D app's (words, steps, camera names), every slide has a camera and a dependency list, no field of a 2D slide is
// dropped, and every {number} in the words is the engine's, printed as the 2D app prints it.
import { loadSource } from '../src/decks/source.ts';
import { varixFloorWord } from '../src/ui/cuts.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { AG_IDS, isAgDeck } from '../src/decks/ag/index.ts';
import type { CopiedDeck, CopiedSlide } from '../src/decks/ag/types.ts';
import { camPlan } from '../src/decks/hp/cams.ts';
import { CIRC_REGIONS_2D } from '../src/decks/ag/regions.generated.ts';
import { chainOf, changes, tokensOf, valueText } from '../src/decks/hp/numbers.ts';
import { box2Of, placedRegionBox } from '../src/scene/anatomy/source.ts';
import { placedFitBox } from '../src/decks/rw/cams.ts';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { pinned2D } from './two-d-pin.ts';
import { assertNear } from './close.ts';
import { AG_FIRST_STEP_DECKS, departures } from './engine-departures.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));
interface Inv { rows: { id: string; area: string }[]; decks: { id: string; slides: { id: string }[] }[] }
const inventory = read('parity/inventory.json') as Inv;
interface Nums { decks: Record<string, { slides: { id: string; models: boolean; fp: Record<string, number> }[]; tokens: { where: string; token: string; kind: string; key: string | null; whole: boolean; shown: string | null }[] }> }
const nums = read('tests/fixtures/deck-numbers-ag.json') as Nums;

const decks: CopiedDeck[] = [];
for (const id of AG_IDS) decks.push(await loadSource(id, false) as CopiedDeck);
const slides = decks.flatMap((d) => d.slides.map((s) => ({ deck: d, slide: s })));

test('the batch is the 14 decks whose ids run A to G, all of the 2D inventory\'s, with every slide of each', () => {
  const inv = inventory.decks.filter((d) => /^[a-g]/.test(d.id));
  assert.deepEqual([...AG_IDS].sort(), inv.map((d) => d.id).sort());
  assert.equal(decks.length, 14);
  for (const d of decks) {
    assert.deepEqual(d.slides.map((s) => s.id), inventory.decks.find((x) => x.id === d.id)!.slides.map((s) => s.id), `${d.id}: the slide ids and their order are the 2D app's`);
  }
  assert.equal(slides.length, 167);
  for (const { deck, slide } of slides) assert.ok(inventory.rows.some((r) => r.id === `slide:${deck.id}/${slide.id}`), `${deck.id}/${slide.id} has an inventory row`);
  assert.ok(isAgDeck('albumin') && !isAgDeck('hvpg'));
});

test('the copy is the 2D app\'s: with a 2D checkout at hand, scripts/copy-decks-ag.mjs --check finds no difference', (t) => {
  // (only when asked: whatever the 2D clone beside this one happens to have checked out differs from machine to machine)
  const two = pinned2D('src/ui/decks.js');
  if (two.skip) { t.skip(two.skip); return; }
  execFileSync('node', ['scripts/copy-decks-ag.mjs', '--from', two.repo, '--check', '--no-numbers'], { cwd: root, stdio: 'pipe' });
});

test('every deck has what the cards need: a title, 2 to 4 objectives, a quick check, and the 2D menu\'s names', () => {
  for (const d of decks) {
    assert.ok(d.title && d.summary && d.level, d.id);
    assert.ok(d.objectives.length >= 2 && d.objectives.length <= 4, `${d.id} objectives`);
    assert.ok(d.checks.length > 0 && d.checks.every((c) => c.length === 2 && c[0] && c[1]), `${d.id} checks`);
    assert.ok(d.topic && d.short, `${d.id} has its menu topic and short name`);
  }
});

test('Baveno VIII only: no deck word names Baveno VII', () => {
  for (const { deck, slide } of slides) for (const f of ['title', 'line', 'notes', 'kicker'] as const) assert.ok(!/Baveno VII(?!I)/.test(slide[f] ?? ''), `${deck.id}/${slide.id}.${f}`);
});

// ---- the camera ----
// (The cameras are the live planner's, hp/cams.ts camPlan: the 2D box-to-shot copy that used to sit here framed the old plate and was reached only by tests, so it is gone.)
test('a by-name camera frames the vessels and stations it names, grown a little, inside its near region\'s union', () => {
  const sp = camPlan({ on: ['V_INT', 'V_SPL', 'V_IMV', 'SIN_RR', 'SIN_LL', 'RA'], near: 'route' });
  assert.equal(sp.kind, 'body');
  // (the near region is the placed one, placedRegionBox, which the camera's placed box holds)
  const route = box2Of(placedRegionBox('route')!);
  const box = (sp as { box: readonly number[] }).box;
  assert.ok(box[0]! <= route[0] + 1e-9 && box[1]! <= route[1] + 1e-9 && box[2]! >= route[2] - 1e-9 && box[3]! >= route[3] - 1e-9, 'the box holds its near region');
  assert.equal(camPlan(undefined).kind, 'body');
  assert.deepEqual((camPlan('fit') as { box: unknown }).box, box2Of(placedFitBox()));
  assert.throws(() => camPlan('nowhere' as never), /nowhere|region/);
});

test('Circuit slides carry a circuit camera, lobule slides a lobule camera, the rest the anatomy, and every one has a Shot but the Circuit', () => {
  for (const { deck, slide } of slides) {
    const main = camPlan(slide.cam, slide.view ?? undefined);
    const where = `${deck.id}/${slide.id}`;
    if (slide.view === 'circuit') { assert.equal(main.kind, 'circuit', where); assert.ok(main.box.every(Number.isFinite), where); continue; }
    else if (typeof slide.cam === 'string' && /^(lobule|sinusoid)/.test(slide.cam)) assert.equal(main.kind, 'lobule', where);
    else assert.equal(main.kind, 'body', where);
    if (main.kind === 'body') {
      assert.ok(main.shot.half[0] > 0 && main.shot.half[1] > 0, where);
      assert.ok(Math.abs(main.shot.target[0]) < 3.5 && Math.abs(main.shot.target[1]) < 4, `${where}: the target is on the plate`);
    }
    const shot = main.shot;
    assert.ok(Number.isFinite(shot.yaw) && Number.isFinite(shot.r) && shot.half[0] > 0, where);
  }
  assert.ok(Object.keys(CIRC_REGIONS_2D).length >= 9);
});

// ---- the model's steps and the numbers ----
/** The index of the slide whose engine state slide i shows: its own, or the last before it that changed the model (the first slide always has its own). */
const stateOf = (slides: readonly CopiedSlide[]): number[] => { let last = 0; return slides.map((s, i) => (changes(s) || i === 0 ? (last = i) : last)); };

test('the chain is the 2D presenter\'s own rule (the outline first, then a step per slide), and the fixture has the same slides', () => {
  for (const d of decks) {
    const chain = chainOf(d.slides), own = stateOf(d.slides), fx = nums.decks[d.id]!;
    assert.equal(chain.length, d.slides.length + 1);
    assert.deepEqual(fx.slides.map((s) => s.id), d.slides.map((s) => s.id), d.id);
    d.slides.forEach((s: CopiedSlide, i) => {
      assert.equal(fx.slides[i]!.models, changes(s) || i === 0, `${d.id}/${s.id}: the fixture and the steps agree on which slides move the model`);
      assert.equal(JSON.stringify(fx.slides[own[i]!]!.fp), JSON.stringify(fx.slides[i]!.fp), `${d.id}/${s.id} shows the state of slide ${own[i]}`);
    });
    assert.equal(own[0], 0);
  }
});

test('every {number} in a slide\'s words is a reading the engine gives, printed as its tile prints it', () => {
  let n = 0;
  for (const d of decks) {
    const fx = nums.decks[d.id]!;
    for (const tk of fx.tokens) {
      const where = `${d.id} ${tk.where} {${tk.token}}`;
      const b = tokensOf(`{${tk.token}}`)[0]!.token;
      assert.equal(b.kind === 'value' ? (b.at ? 'tile-at' : 'tile') : b.kind === 'cut' ? 'cutoff' : b.kind, tk.kind, where);
      if (b.kind !== 'value') continue;
      assert.ok(tk.shown, `${where}: the engine gives no number for it`);
      const slideId = tk.where.startsWith('check') ? d.slides.at(-1)!.id : tk.where.split(/[.[]/)[0]!;
      const own = stateOf(d.slides), idx = (id: string) => d.slides.findIndex((s) => s.id === id);
      const fp = fx.slides[b.at ? idx(b.at) : own[idx(slideId)]!]!.fp;
      // (28 Nov review: a varix under the engine's 2.5 mm cut-off is the vein's own caliber and prints "None", never a size)
      assert.equal(valueText(b.key, fp, b.whole), varixFloorWord(b.key, fp[b.key] as number) ?? tk.shown, where);
      n++;
    }
  }
  assert.ok(n > 100, `${n} readings checked`);
});

test('replaying the first model step of five decks in the engine gives the fixture\'s numbers (within float tolerance)', async () => {
  // (the 2D app's numbers, except where this engine has moved on: deck-numbers-ag-3d.json, scripts/gen-ag-numbers-3d.mjs, npm run gen:departures)
  const moved = departures('deck-numbers-ag-3d.json') as Record<string, { fp: Record<string, number> }>;
  for (const id of AG_FIRST_STEP_DECKS) {
    const d = decks.find((x) => x.id === id)!;
    const fps: Record<string, number>[] = [];
    const core = createCore((m: { type: string; i: number; fp: Record<string, number> }) => { if (m.type === 'seqStep') fps[m.i] = m.fp; });
    core.handle({ type: 'run', running: false });
    await core.handle({ type: 'sequence', steps: chainOf(d.slides).slice(0, 1), reqId: 1 });
    core.dispose();
    for (const [k, v] of Object.entries(moved[id]?.fp ?? nums.decks[id]!.slides[0]!.fp)) assertNear(fps[0]![k], v, `${id}.${k}`);
  }
});
