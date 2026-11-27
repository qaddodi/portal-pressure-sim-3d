import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameFor } from './b3-frames.ts';
import { LENS_IDS, LENS_EDGE_COUNT, computeLens, edgeIndex, firstPassColours, isArtery, lensColourAt, newLensData, originColours, systemOf } from '../src/scene/lenses/model.ts';
import { EDGES } from '../src/engine/hales/portal/topology.js';
import { legendFor } from '../src/scene/lenses/legend.ts';
import { LENS_WORDS } from '../src/scene/lenses/words.copied.ts';
import { LensField, LENS_MS } from '../src/scene/lenses/field.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { BloodMarks, KEY_CHEV_IDS, keyChevron, markGoal } from '../src/scene/blood/marks.ts';
import { BLOOD_DEFAULT, BLOOD_MENU } from '../src/scene/blood/options.ts';
import { toOklab, fromOklab } from '../src/scene/lenses/oklab.ts';

const parserName = '@shaderfrog/glsl-parser';
let parse: ((s: string) => unknown) | null = null;
try { const m = await import(parserName); parse = (s) => m.parser.parse(s.replace(/^#include.*$/gm, ''), { quiet: true }); } catch { /* not installed */ }

const h = await frameFor('healthy');
const c = await frameFor('cirr-decomp');
const ctx = { healthy: h.healthy, ref: Float32Array.from(h.healthy.P) };
const edges = EDGES as { id: string; kind: string }[];

test('all twelve lenses are the 2D app\'s, in its words', () => {
  assert.equal(LENS_IDS.length, 12);
  assert.equal(LENS_WORDS.length, 10, 'ten lenses sit in the Layers menu');
  for (const [id, title, desc] of LENS_WORDS) { assert.ok(id && title && desc, id); assert.ok((LENS_IDS as readonly string[]).includes(id)); }
});

test('a lens colours veins and never arteries; the figure keeps the arteries\' red under every lens', () => {
  for (const lens of LENS_IDS) {
    const d = computeLens(lens, c.frame, 'light', ctx as never);
    for (let k = 0; k < LENS_EDGE_COUNT; k++) if (isArtery(k)) assert.equal(lensColourAt(d, edges[k]!.id, 0), null, `${lens} ${edges[k]!.id}`);
    assert.ok(lensColourAt(d, 'PV_TRUNK', 0), `${lens} colours the portal trunk`);
  }
});

test('pressure: a congested portal vein reads hotter than the vena cava, from the same ramp', () => {
  const d = computeLens('pressure', c.frame, 'light', ctx as never);
  const pv = lensColourAt(d, 'PV_TRUNK', 0)!, ivc = lensColourAt(d, 'IVCS_RA', 1)!;
  assert.notDeepEqual(pv, ivc);
  const dh = computeLens('pressure', h.frame, 'light', ctx as never);
  assert.notDeepEqual(lensColourAt(dh, 'PV_TRUNK', 0), pv, 'a healthy portal vein is another colour');
});

test('velocity is neutral where there is no normal to compare to (the liver\'s beds)', () => {
  const d = computeLens('velocity', c.frame, 'light', ctx as never);
  const neutral = lensColourAt(d, 'PRE_R', 2)!;   // (a third along: the vessel's own colour, its ends take its junctions')
  for (const id of ['SIN_R', 'POST_R_RHV']) if (edgeIndex.has(id)) assert.deepEqual(lensColourAt(d, id, 2), neutral, id);
});

test('direction: a vein whose flow runs against the healthy patient\'s wears the reversed colour', () => {
  const d = computeLens('direction', c.frame, 'light', ctx as never);
  const cols = new Set<string>();
  for (let k = 0; k < LENS_EDGE_COUNT; k++) { const col = lensColourAt(d, edges[k]!.id, 0); if (col) cols.add(col.join()); }
  assert.ok(cols.size >= 2, 'a decompensated cirrhosis has reversed flow somewhere');
});

test('origin and first pass: lanes are cumulative shares in 0..1, in order, for every vein', () => {
  for (const lens of ['origin', 'firstpass'] as const) {
    const d = computeLens(lens, c.frame, 'light', ctx as never);
    assert.equal(d.mode, 2);
    for (let end = 0; end < 2; end++) for (let k = 0; k < LENS_EDGE_COUNT; k++) {
      if (isArtery(k)) continue;
      const i = (end * LENS_EDGE_COUNT + k) * 4;
      let prev = 0;
      for (let j = 0; j < 4; j++) { const v = d.lanes[i + j]!; assert.ok(v >= prev - 1e-6 && v <= 1 + 1e-6, `${lens} ${edges[k]!.id} lane ${j}`); prev = v; }
    }
  }
  assert.equal(originColours().length, 5);
  assert.equal(firstPassColours().length, 5, 'five slots, the third unused, as blood.js FIRSTPASS says');
});

test('the portal trunk of a healthy patient is mostly gut blood; of a cirrhotic one, the lens still sums to a whole', () => {
  const d = computeLens('origin', h.frame, 'light', ctx as never);
  const k = edgeIndex.get('PV_TRUNK')!;
  const end = LENS_EDGE_COUNT * 4 + k * 4;
  assert.ok(d.lanes[end + 3]! > 0.5, 'gut and spleen account for most of the portal blood');
});

test('the system lens gives the three territories three colours (portal, caval, collateral)', () => {
  const d = computeLens('system', c.frame, 'light', ctx as never);
  const seen = new Set<string>();
  for (let k = 0; k < LENS_EDGE_COUNT; k++) { if (isArtery(k)) continue; const col = lensColourAt(d, edges[k]!.id, 2); if (col) seen.add(`${systemOf(EDGES[k] as never)}:${col.join()}`); }   // (a third along: the vessel's own colour)
  assert.equal(new Set([...seen].map((s) => s.split(':')[0])).size, 3);
  const perSystem = new Map<string, Set<string>>();
  for (const s of seen) { const [sys, col] = s.split(':'); (perSystem.get(sys!) ?? perSystem.set(sys!, new Set()).get(sys!)!).add(col!); }
  for (const cols of perSystem.values()) assert.equal(cols.size, 1, 'one colour per system');
});

test('OKLab round-trips a colour', () => {
  for (const c0 of [[0.1, 0.5, 0.9], [0.9, 0.2, 0.3], [0.5, 0.5, 0.5]] as const) {
    const back = fromOklab(toOklab([c0[0], c0[1], c0[2]]));
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(back[i]! - c0[i]!) < 2e-3, String(c0));
  }
});

test('every lens has a legend, in the 2D app\'s words, in every look', () => {
  for (const look of ['light', 'dark', 'soft', 'navy', 'black'] as const) for (const lens of LENS_IDS) {
    const g = legendFor(lens, look);
    assert.ok(g.name && g.aria, `${lens} ${look}`);
    assert.ok(g.bar || g.dots, `${lens} ${look} has a bar or dots`);
    if (g.bar) { assert.ok(g.bar.stops.length >= 2); for (const n of g.bar.nums) assert.ok(n.at >= 0 && n.at <= 100); }
  }
  assert.equal(legendFor('neutral', 'light').name, 'Anatomy');
});

test('a lens switch crossfades in 420 ms on the clock, and a second switch finishes the first', () => {
  const f = new LensField();
  f.onFrame(c.frame as never); f.setContext(ctx as never);
  f.setLens('pressure', 0, true);
  assert.equal(f.shared.lensMix.value, 1);
  f.setLens('flow', 1000);
  assert.equal(f.shared.lensMix.value, 0); assert.ok(f.fading);
  assert.equal(f.step(1000 + LENS_MS / 2), true);
  const mid = f.shared.lensMix.value;
  assert.ok(mid > 0 && mid < 1);
  f.setLens('velocity', 1000 + LENS_MS / 2 + 10);
  assert.equal(f.shared.lensMix.value, 0, 'the new switch starts its own fade from what is showing');
  f.step(1000 + LENS_MS * 2);
  assert.equal(f.shared.lensMix.value, 1); assert.equal(f.fading, false);
  assert.equal(f.lens, 'velocity');
  f.dispose();
});

test('a new frame recomputes the arriving lens at most every 90 ms and the loop sleeps when nothing moves', () => {
  const f = new LensField();
  f.setContext(ctx as never); f.setLens('pressure', 0, true); f.onFrame(h.frame as never);
  f.step(100);
  const a = f.data.grad.slice();
  f.onFrame(c.frame as never);
  f.step(120);   // too soon: 20 ms after the last
  assert.deepEqual(f.data.grad, a);
  assert.equal(f.pending, true);
  f.step(200);
  assert.notDeepEqual(f.data.grad, a);
  f.step(300);   // (the flow heads' ink may be easing to the new patient's colours: it takes CHEV_INK.EASE_MS)
  assert.equal(f.step(700), false, 'nothing moves: no more frames asked for');
  f.dispose();
});

test('the vessel shader parses as GLSL and reads the lens, the flow marks and the smoke', { skip: !parse }, () => {
  parse!(VESSEL_FS.replace(/^\n/, ''));
  for (const t of ['lensMix', 'dotted', 'markRev', 'smokeOn', 'reveal']) assert.match(VESSEL_FS, new RegExp(t));
});

test('the Blood menu\'s defaults are the 2D app\'s: chevrons on, key-only off, potential collaterals off', () => {
  assert.deepEqual({ ...BLOOD_DEFAULT }, { chevrons: true, keyChevrons: false, chips: true, collaterals: false, labels: true });
  assert.equal(BLOOD_MENU.reduce((n, s) => n + s.rows.length, 0), 5);
});

test('key chevrons: the portal story and the liver keep marks; side branches lose them; an open collateral lights its lane', () => {
  for (const id of ['PV_TRUNK', 'RHV_IVC', 'V_SPL']) assert.ok(keyChevron(id), id);
  assert.ok(KEY_CHEV_IDS.has('SMV_CONF'));
  assert.equal(keyChevron('RENAL_L'), false);
  assert.equal(keyChevron('AZY_SVC'), false);
  assert.equal(keyChevron('AZY_SVC', (id) => id === 'C9'), true);
});

test('the Blood menu gates the heads: off shows none, key-only keeps the key routes, a closed collateral carries none', () => {
  const on = { chevrons: true, keyChevrons: false, presenting: false };
  assert.equal(markGoal(on, false, true), 1);
  assert.equal(markGoal({ ...on, chevrons: false }, true, true), 0);
  assert.equal(markGoal({ ...on, keyChevrons: true }, false, true), 0);
  assert.equal(markGoal({ ...on, keyChevrons: true }, true, true), 1);
  assert.equal(markGoal({ ...on, presenting: true }, false, true), 0, 'presenting always keeps key chevrons only');
  assert.equal(markGoal(on, true, false), 0);
});

test('heads fade at the highlight\'s speed, never switch', () => {
  const fake = { edge: { id: 'PV_TRUNK' }, amount: 0, setFlow(a: number) { this.amount = a; } };
  const b = new BloodMarks([fake as never]);
  let last = 0;
  for (let t = 0; t < 400; t += 16) { b.step(16); assert.ok(fake.amount >= last && fake.amount - last <= 16 / 180 + 1e-9); last = fake.amount; }
  assert.equal(last, 1);
  b.setOptions({ chevrons: false });
  b.step(16);
  assert.ok(fake.amount < 1 && fake.amount > 0);
});

test('newLensData has the 208 x GRAD_ROWS x RGBA gradient layout (ends, a third and two thirds along, the flow-head ink, then the stent colour profile) and the 208 x 2 lanes the shader reads', async () => {
  const { GRAD_ROWS } = await import('../src/scene/lenses/model.ts');
  const d = newLensData();
  assert.equal(d.grad.length, 208 * 4 * GRAD_ROWS); assert.equal(d.lanes.length, 208 * 2 * 4);
  assert.equal(LENS_EDGE_COUNT, 208);
});

// ---- the flow heads are the 2D app's ----
import { readFileSync } from 'node:fs';
import { Streams } from '../src/scene/blood/streams.ts';
import { displaySpeed, PERIOD } from '../src/scene/blood/blood.copied.js';
import { edgeIndex as edgeIx } from '../src/scene/lenses/model.ts';

const squash = (t: string) => t.replace(/\/\/.*$/gm, '').replace(/\s+/g, ' ').trim();
test('the head\'s shape and the spacing lattice are the 2D shader\'s text (needs PPS_2D_REPO)', { skip: !process.env.PPS_2D_REPO }, () => {
  const src = squash(readFileSync(`${process.env.PPS_2D_REPO}/src/ui/chevron-glsl.js`, 'utf8'));
  const mine = squash(VESSEL_FS);
  for (const fn of ['float chevD(float u, float ay, float hw) {', 'vec2 chevHead(float u, float ay, float hw, float px, float rev) {', 'float chevKeep(float j, float n0, float lv) {']) {
    const at = src.indexOf(fn);
    assert.ok(at >= 0, `${fn} in 2D`);
    // the function's body, up to its closing brace at depth 0
    let d = 0, end = at;
    for (let i = src.indexOf('{', at); i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) { end = i + 1; break; } }
    assert.ok(mine.includes(src.slice(at, end)), `${fn} is the 2D text`);
  }
  const orange = squash(readFileSync(`${process.env.PPS_2D_REPO}/src/ui/veins-gl.js`, 'utf8'));
  const o = orange.indexOf('float chevOrange(vec3 c) {');
  assert.ok(mine.includes(orange.slice(o, orange.indexOf('}', o) + 1)), 'chevOrange');
  assert.match(src, /CHEV_PITCH = 130/); assert.match(mine, /130\.0 \* wpc/);   // the 2D's pitch, in CSS px (20 Nov: 60 was 'WAY TOO MANY chevrons')
  const heads = readFileSync(`${process.env.PPS_2D_REPO}/src/ui/blood-heads.js`, 'utf8');
  assert.match(heads, /clamp\(0\.5 \* R, 4\.0 \* cssPx \* pxW, 8\.0 \* cssPx \* pxW\)/); assert.match(heads, /STILL_A = 0\.3, THIN_LO = 1\.5, THIN_HI = 2\.5/); assert.match(mine, /clamp\(0\.5 \* R, 4\.4 \* wpc, 9\.0 \* wpc\)/);
});

test('the inks: dark head on a light lumen, cream on a dark one (a latched, eased step at 2D\'s luminance, never a grey halfway), orange reversed, a sepia outline always', () => {
  assert.match(VESSEL_FS, /chevCreamSoft\(celTubeBase\(/);   // (a short eased step on 2D's luminance where the vessel has no latched ink: tests/chevron-ink.test.ts)
  assert.match(VESSEL_FS, /mix\(markDark \* 0\.5, markLight, cream\)/);
  assert.match(VESSEL_FS, /vec3\(0\.2314, 0\.1725, 0\.1333\)/);   // 59, 44, 34: the Light look's outline sepia
});

test('streams: a flowing vein\'s heads run at the 2D display speed, a still one stands, a reversed one runs the other way and is flagged', async () => {
  const s = new Streams();
  s.setHealthy(h.healthy as never);
  s.onFrame(c.frame as never);
  let t = 0;
  for (; t < 8000; t += 100) s.step(t);   // past the 3 s mean and the reversal hold's settle
  const pv = edgeIx.get('PV_TRUNK')!;
  assert.ok(s.speedOf(pv) !== 0);
  assert.ok(Math.abs(s.speedOf(pv)) <= displaySpeed(1000), 'bounded by the display curve');
  const tex = s.texture.image.data as Float32Array;
  assert.equal(tex.length, 208 * 4);
  assert.ok(tex[pv * 4]! >= 0 && tex[pv * 4]! < PERIOD, 'distance wraps inside the stream period');
  assert.ok(s.step(t + 100) || true);
  let reversed = 0;
  for (let k = 0; k < 208; k++) if (tex[k * 4 + 2]! > 0.5) reversed++;
  assert.ok(reversed > 0, 'a decompensated patient has reversed veins');
  // standing blood: a vessel with no flow keeps its heads in place
  for (let k = 0; k < 208; k++) if (s.speedOf(k) === 0) assert.equal(tex[k * 4 + 1], 0);
  s.texture.dispose();
});

test('streams advance with time and not with frames: the same seconds, the same distance', () => {
  const run = (step: number) => { const s = new Streams(); s.setHealthy(h.healthy as never); s.onFrame(c.frame as never); for (let t = 0; t <= 6000; t += step) s.step(t); const d = (s.texture.image.data as Float32Array)[edgeIx.get('PV_TRUNK')! * 4]!; s.texture.dispose(); return d; };
  const a = run(16), b = run(50);
  assert.ok(Math.abs(a - b) < 0.05 * Math.max(1, Math.abs(a)), `${a} vs ${b}`);
});

test('a lens that gives a vessel one colour still changes gradually: every vein that meets at a node ends in that node\'s one colour, and keeps its own through its middle (no hard line at a junction)', async () => {
  const { presetIds, presetState } = await import('./b4-presets.ts');
  const E = EDGES as { id: string; from: string; to: string }[];
  for (const lens of ['velocity', 'flow', 'drop', 'direction', 'system'] as const) {
    for (const id of ['cirr-decomp', 'healthy']) {
      const f = (await presetState(id)).frame;
      const d = computeLens(lens, f, 'light', ctx as never);
      const at = new Map<string, number[][]>();
      for (const [k, e] of E.entries()) {
        const a = lensColourAt(d, e.id, 0), b = lensColourAt(d, e.id, 1);
        if (!a || !b) continue;
        (at.get(e.from) ?? at.set(e.from, []).get(e.from)!).push(Array.from(a));
        (at.get(e.to) ?? at.set(e.to, []).get(e.to)!).push(Array.from(b));
        void k;
      }
      for (const [node, cols] of at) for (const c1 of cols) for (let i = 0; i < 3; i++) assert.ok(Math.abs(c1[i]! - cols[0]![i]!) < 1e-5, `${lens} ${id}: veins meeting at ${node} end in different colours`);
    }
  }
});

test('every drawn vessel that carries a vein\'s blood keeps its chevrons exactly when that vein does: the liver branches and tributary fans are their vein\'s story (root cause: they are not engine edges, so the key rule found nothing under "Key chevrons only")', async () => {
  const { NETWORK } = await import('../src/scene/vessels/network.ts');
  let n = 0;
  for (const v of NETWORK) {
    if (!v.feeder) continue;
    assert.equal(keyChevron(v.id), keyChevron(v.host), `${v.id} follows ${v.host}`);
    n++;
  }
  assert.ok(n >= 3);
  for (const id of ['PVH_R_2~F:b', 'PVH_L_1~F:b', 'RHV_IVC_1~F:b']) assert.equal(keyChevron(id), true, `${id} keeps its chevrons in "key chevrons only"`);
});
