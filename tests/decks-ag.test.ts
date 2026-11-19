// Batch B13a: decks A to G. The copy is the 2D app's (words, steps, camera names), every slide has a camera and a dependency list, no field of a 2D slide is
// dropped, and every {number} in the words is the engine's, printed as the 2D app prints it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { AG_IDS, loadAgDeck, plate, isAgDeck } from '../src/decks/ag/index.ts';
import type { CopiedDeck, CopiedSlide } from '../src/decks/ag/types.ts';
import { shotOfCam, shotOfBox, regionBox, namedBoxes, growBox, FIT_BOX, slideShots, sceneShot } from '../src/decks/ag/shots.ts';
import { REGIONS_2D, CIRC_REGIONS_2D } from '../src/decks/ag/regions.generated.ts';
import { needsOf, hookOf, unknownNeeds, waitingOn, PRESET_IDS, ACTION_KINDS } from '../src/decks/ag/needs.ts';
import { stepsOf, stateOf, changesModel } from '../src/decks/ag/steps.ts';
import { braces, valueText } from '../src/decks/ag/tokens.ts';
import { TILE } from '../src/ui/charts/tiles.generated.ts';
import { BATCH_NAMES } from '../src/parity/score.ts';
import { x3, y3 } from '../src/scene/frame2d.ts';
import { createCore } from '../src/engine/host/worker-core.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));
interface Inv { rows: { id: string; area: string }[]; decks: { id: string; slides: { id: string }[] }[] }
const inventory = read('parity/inventory.json') as Inv;
interface Nums { decks: Record<string, { slides: { id: string; models: boolean; fp: Record<string, number> }[]; tokens: { where: string; token: string; kind: string; key: string | null; whole: boolean; shown: string | null }[] }> }
const nums = read('tests/fixtures/deck-numbers-ag.json') as Nums;
const GOLDEN = join(root, 'tests/fixtures/deck-needs-ag.json');

const decks: CopiedDeck[] = [];
for (const id of AG_IDS) decks.push(await loadAgDeck(id));
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
  const twoD = process.env.PPS_2D_CHECKOUT ?? join(root, '..', 'portal-pressure-simulator');
  if (!existsSync(join(twoD, 'src/ui/decks.js'))) { t.skip('no 2D checkout beside this one (set PPS_2D_CHECKOUT)'); return; }
  execFileSync('node', ['scripts/copy-decks-ag.mjs', '--from', twoD, '--check', '--no-numbers'], { cwd: root, stdio: 'pipe' });
});

test('every deck has what the cards need: a title, 2 or 3 objectives, a quick check, and the 2D menu\'s names', () => {
  for (const d of decks) {
    assert.ok(d.title && d.summary && d.level, d.id);
    assert.ok(d.objectives.length >= 2 && d.objectives.length <= 3, `${d.id} objectives`);
    assert.ok(d.checks.length > 0 && d.checks.every((c) => c.length === 2 && c[0] && c[1]), `${d.id} checks`);
    assert.ok(d.topic && d.short, `${d.id} has its menu topic and short name`);
  }
});

test('Baveno VIII only: no deck word names Baveno VII', () => {
  for (const { deck, slide } of slides) for (const f of ['title', 'line', 'notes', 'kicker'] as const) assert.ok(!/Baveno VII(?!I)/.test(slide[f]), `${deck.id}/${slide.id}.${f}`);
});

// ---- the camera ----
test('the regions are the 2D app\'s and a box becomes a shot by the one map (frame2d.ts)', () => {
  assert.deepEqual(REGIONS_2D.liver, [344, 166, 862, 522]);
  const s = shotOfBox([344, 166, 862, 522]);
  assert.deepEqual(s.target, [x3(603), y3(344), 0]);
  assert.ok(Math.abs(s.half[0] - (862 - 344) / 600) < 1e-9 && Math.abs(s.half[1] - (522 - 166) / 600) < 1e-9);
  assert.deepEqual(regionBox(['splenic', 'portal']), [520, 230, 1110, 710]);
  assert.equal(shotOfCam(undefined).kind, 'body');
  assert.deepEqual((shotOfCam('fit') as { box: unknown }).box, FIT_BOX);
  assert.throws(() => shotOfCam('nowhere'), /names no region/);
});

test('a by-name camera frames the vessels and stations it names, grown a little, inside its near region\'s union', () => {
  const sp = shotOfCam({ on: ['V_INT', 'V_SPL', 'V_IMV', 'SIN_RR', 'SIN_LL', 'RA'], near: 'route' });
  assert.equal(sp.kind, 'body');
  const { boxes, unknown } = namedBoxes(['V_INT', 'RA', 'nothing']);
  assert.equal(boxes.length, 2);
  assert.deepEqual(unknown, ['nothing']);
  const route = REGIONS_2D.route!;
  const box = (sp as { box: readonly number[] }).box;
  assert.ok(box[0]! <= route[0] && box[1]! <= route[1] && box[2]! >= route[2] && box[3]! >= route[3], 'the box holds its near region');
  assert.deepEqual(growBox(null, null), null);
});

test('Circuit slides carry a circuit camera, lobule slides a lobule camera, the rest the anatomy', () => {
  for (const { deck, slide } of slides) {
    const { main } = slideShots(slide);
    const where = `${deck.id}/${slide.id}`;
    if (slide.view === 'circuit') { assert.equal(main.kind, 'circuit', where); assert.ok(main.box.every(Number.isFinite), where); }
    else if (typeof slide.cam === 'string' && /^(lobule|sinusoid)/.test(slide.cam)) assert.equal(main.kind, 'lobule', where);
    else assert.equal(main.kind, 'body', where);
    if (main.kind === 'body') {
      assert.ok(main.shot.half[0] > 0 && main.shot.half[1] > 0, where);
      assert.ok(Math.abs(main.shot.target[0]) < 3.5 && Math.abs(main.shot.target[1]) < 4, `${where}: the target is on the plate`);
    }
  }
  assert.ok(Object.keys(CIRC_REGIONS_2D).length >= 9);
});

test('a spec becomes the scene\'s Shot: the anatomy\'s, the lobule\'s own, none yet for the Circuit', () => {
  for (const { slide } of slides) {
    const { main } = slideShots(slide);
    const shot = sceneShot(main);
    if (main.kind === 'circuit') assert.equal(shot, null);
    else { assert.ok(shot, slide.id); assert.ok(Number.isFinite(shot.yaw) && Number.isFinite(shot.r) && shot.half[0] > 0); }
  }
});

// ---- the dependency lists: a test for every slide ----
const golden: Record<string, string[]> = existsSync(GOLDEN) ? read('tests/fixtures/deck-needs-ag.json') : {};
if (process.env.PPS_UPDATE_GOLDEN) {
  const next: Record<string, string[]> = {};
  for (const { deck, slide } of slides) next[`${deck.id}/${slide.id}`] = needsOf(slide);
  writeFileSync(GOLDEN, `${JSON.stringify(next, null, 1)}\n`);
  Object.assign(golden, next);
}

for (const { deck, slide } of slides) {
  const where = `${deck.id}/${slide.id}`;
  test(`slide ${where}: its dependency list is complete, owned and recorded`, () => {
    const needs = needsOf(slide);
    assert.deepEqual(unknownNeeds(needs), [], `${where} has a need nobody owns`);
    assert.ok(!needs.some((n) => n.startsWith('field:')), `${where}: a 2D slide field no hook holds (${needs.filter((n) => n.startsWith('field:')).join(', ')}): add it to FIELD_HOOKS in decks/ag/needs.ts`);
    assert.deepEqual(needs, golden[where], `${where}: the dependency list changed from tests/fixtures/deck-needs-ag.json (PPS_UPDATE_GOLDEN=1 to record it)`);
    for (const n of needs) { const h = hookOf(n)!; assert.ok(h.owner in BATCH_NAMES || h.owner === 'ENGINE', `${n}: owner ${h.owner}`); assert.equal(typeof h.landed(), 'boolean', n); }
    // what the slide asks of the model is something the engine can do
    if (slide.preset) assert.ok(PRESET_IDS.has(slide.preset), `${where}: no patient "${slide.preset}"`);
    for (const t of [...(slide.tiles ?? []), ...(slide.key ?? [])]) assert.ok(TILE[t] || needs.includes(`reading:${t}`), `${where}: "${t}" is neither a tile nor a derived reading with a hook`);
    const waiting = waitingOn(needs);
    assert.ok(waiting.every((w) => w.owner !== 'ENGINE'), `${where}: nothing waits on the engine, which runs every step`);
    assert.ok(needs.includes('present:slide-plate'));
  });
}

test('the action kinds the decks use are the ones the engine host applies', () => {
  const host = readFileSync(join(root, 'src/engine/host/worker-core.js'), 'utf8');
  for (const k of ACTION_KINDS) assert.ok(host.includes(`case '${k}'`), `the host has no action "${k}"`);
  for (const { slide } of slides) for (const a of (Array.isArray(slide.action) ? slide.action : slide.action ? [slide.action] : []) as { kind: string }[]) assert.ok((ACTION_KINDS as readonly string[]).includes(a.kind), a.kind);
});

test('what the slides wait for, by batch (printed; every slide is present, a slide is wired when this is empty)', () => {
  const by: Record<string, number> = {};
  let wired = 0;
  for (const { slide } of slides) {
    const w = waitingOn(needsOf(slide));
    if (!w.length) wired++;
    for (const o of new Set(w.map((x) => x.owner))) by[o] = (by[o] ?? 0) + 1;
  }
  console.log(`decks A to G: ${slides.length} slides present, ${wired} wired | slides waiting on ${Object.entries(by).sort().map(([o, n]) => `${o} ${n}`).join(' · ')}`);
  assert.ok(wired <= slides.length);
});

// ---- the model's steps and the numbers ----
test('one step per slide, in the 2D presenter\'s own rule, and the fixture has the same slides', () => {
  for (const d of decks) {
    const steps = stepsOf(d.slides), own = stateOf(d.slides), fx = nums.decks[d.id]!;
    assert.equal(steps.length, d.slides.length);
    assert.deepEqual(fx.slides.map((s) => s.id), d.slides.map((s) => s.id), d.id);
    d.slides.forEach((s: CopiedSlide, i) => {
      assert.equal(fx.slides[i]!.models, changesModel(s) || i === 0, `${d.id}/${s.id}: the fixture and the steps agree on which slides move the model`);
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
      const b = braces(`{${tk.token}}`)[0]!.token;
      assert.equal(b.kind === 'tile' ? (b.at ? 'tile-at' : 'tile') : b.kind, tk.kind, where);
      if (b.kind !== 'tile') continue;
      assert.ok(tk.shown, `${where}: the engine gives no number for it`);
      const slideId = tk.where.startsWith('check') ? d.slides.at(-1)!.id : tk.where.split(/[.[]/)[0]!;
      const own = stateOf(d.slides), idx = (id: string) => d.slides.findIndex((s) => s.id === id);
      const fp = fx.slides[b.at ? idx(b.at) : own[idx(slideId)]!]!.fp;
      assert.equal(valueText(b.key, fp, b.whole), tk.shown, where);
      n++;
    }
  }
  assert.ok(n > 100, `${n} readings checked`);
});

test('replaying the first model step of five decks in the engine gives the fixture\'s numbers to the digit', async () => {
  for (const id of ['circulation', 'circuit', 'day', 'endoscopy', 'gradients'] as const) {
    const d = decks.find((x) => x.id === id)!;
    const fps: Record<string, number>[] = [];
    const core = createCore((m: { type: string; i: number; fp: Record<string, number> }) => { if (m.type === 'seqStep') fps[m.i] = m.fp; });
    core.handle({ type: 'run', running: false });
    await core.handle({ type: 'sequence', steps: stepsOf(d.slides).slice(0, 1), reqId: 1 });
    core.dispose();
    for (const [k, v] of Object.entries(nums.decks[id]!.slides[0]!.fp)) assert.equal(fps[0]![k], v, `${id}.${k}`);
  }
});

test('plate() gathers a deck: its steps, states, cameras and what each slide waits for', () => {
  const p = plate(decks[0]!);
  assert.equal(p.plates.length, decks[0]!.slides.length);
  assert.equal(p.steps.length, p.plates.length);
  assert.ok(p.plates.every((x) => x.needs.includes('present:slide-plate') && x.shots.main));
});
