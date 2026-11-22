// The vessel animations that were not 2D's (audit 20 Nov PM, section 1): the branches and tributary fans that popped in after Circuit to Anatomy, the conditional tributaries that were on or off, the one linear
// 320 ms draw-on and retract for every kind of vessel, the selected vessel's glow that snapped off at a view switch, and the two writers of one fade. Each is pinned at its root cause, for every vessel the same cause reaches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CelScene } from '../src/scene/scene.ts';
import { CIRCUIT_VS_HEAD } from '../src/scene/circuit/shader.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { COURSES } from '../src/scene/circuit/course.ts';
import { NETWORK, NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { PRESENCE_TIMES, PresenceTracks, presenceMs } from '../src/scene/vessels/presence-track.ts';
import { FeederLives, LIVE_FLOOR, liveWidth } from '../src/scene/vessels/feeder-live.ts';
import { glowGate } from '../src/scene/highlight.ts';
import { GLOW_GATE_T } from '../src/scene/glow.ts';
import { glowWeightGlsl } from '../src/scene/vessels/glsl-shared.ts';
import { easeMove } from '../src/scene/gesture/ease.ts';
import { withRk } from '../src/scene/vessels/vessel-object.ts';
import { BufferAttribute, BufferGeometry } from 'three';

const src = (p: string): string => readFileSync(new URL(`../src/scene/${p}`, import.meta.url), 'utf8');

// ---- 1.1: a vessel with no map course stays where it is and fades by 2D's 1 - 2 * T0 ----
test('every vessel with no map course (each `~F` group, the liver\'s branching veins) carries zero course attributes, stays where it is in the Circuit\'s change and fades by 2D\'s clamp(1 - 2 * T0)', () => {
  assert.match(CIRCUIT_VS_HEAD, /if \(cl\.y <= 0\.0\) \{ circStay = clamp\(1\.0 - 2\.0 \* circT, 0\.0, 1\.0\); return; \}/, 'the shader fades a vertex with no course by 2D\'s curve and never morphs it');
  assert.match(CIRCUIT_VS_HEAD, /circStay = 1\.0;\n  if \(circT <= 0\.0\) return;/, 'at rest it is whole');
  assert.match(VESSEL_FS, /if \(circStay < 0\.999 &&[^\n]*>= circStay\) discard;/, 'the fragment stage dithers it out in the dive\'s own screen pattern');
  const noCourse = NETWORK.filter((v) => !COURSES.has(v.id));
  assert.ok(noCourse.length >= 4 && noCourse.every((v) => v.feeder), 'the vessels with no map course are exactly the tributary groups');
  assert.ok(noCourse.some((v) => v.id.endsWith('~F:b')), 'the branching veins are among them');
  const s = new CelScene();
  for (const v of noCourse) {
    const o = s.vesselObject(v.id)!;
    const cl = o.group.children.map((c) => (c as unknown as { geometry?: BufferGeometry }).geometry?.getAttribute('cl')).find(Boolean);
    assert.ok(cl, `${v.id} has a cl attribute (not a missing one whose default the shader would trust)`);
    for (let i = 1; i < cl!.array.length; i += 2) assert.equal(cl!.array[i], 0, `${v.id}: no map course length`);
  }
  s.dispose?.();
});

test('a geometry built with no morph attributes gets zeros for all five, and one that has them keeps them', () => {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(9), 3));
  const out = withRk(g);
  for (const [name, size] of [['cC', 3], ['tC', 3], ['fr', 3], ['pk', 2], ['cl', 2]] as const) {
    const a = out.getAttribute(name)!;
    assert.equal(a.itemSize, size, name); assert.equal(a.count, 3, name); assert.ok([...a.array].every((x) => x === 0), name);
  }
  const h = new BufferGeometry();
  h.setAttribute('position', new BufferAttribute(new Float32Array(9), 3));
  h.setAttribute('cl', new BufferAttribute(new Float32Array([5, 6, 5, 6, 5, 6]), 2));
  assert.deepEqual([...withRk(h).getAttribute('cl').array], [5, 6, 5, 6, 5, 6]);
});

test('the fans are not on the Circuit\'s own (1 - t) leaving list: that fade, composed with the shader\'s, would take them out early and bring them back late', () => {
  const scene = src('scene.ts');
  assert.match(scene, /else this\.fans\.set\(o, def\.id\)/);
  assert.doesNotMatch(scene, /else this\.leaving\.push\(o\)/);
});

// ---- 1.2: conditional tributaries are graded ----
test('a conditional tributary group is graded by the model\'s live: alpha is live, width is 0.5 + 0.5 * live (2D stage-tubes.js), at the 2D in and out rates, never in one frame', () => {
  assert.equal(liveWidth(0), 0.5); assert.equal(liveWidth(1), 1); assert.equal(liveWidth(0.4), 0.7);
  const seen: number[] = [];
  const obj = { setLiveWidth: (w: number) => seen.push(w) };
  const f = new FeederLives([{ id: 'C3~F:caput', obj: obj as never, conditional: true }, { id: 'X~F:b', obj: obj as never, conditional: false }]);
  f.set('C3~F:caput', 0, true);   // (a first frame puts it where it belongs)
  assert.equal(f.liveOf('C3~F:caput'), 0);
  f.set('C3~F:caput', 1);   // the paraumbilical route opens
  assert.equal(f.liveOf('C3~F:caput'), 0, 'not at once');
  let last = 0, ms = 0;
  while (f.step(16, () => undefined)) { const v = f.liveOf('C3~F:caput'); assert.ok(v > last - 1e-9 && v - last <= 16 / PRESENCE_TIMES.other.in + 1e-9, 'fills in at the 2D rate'); last = v; ms += 16; assert.ok(ms < 4000); }
  assert.ok(ms >= PRESENCE_TIMES.other.in - 32, `took ${ms} ms`);
  assert.equal(f.liveOf('C3~F:caput'), 1);
  f.set('C3~F:caput', 0.3);
  f.step(16, () => undefined);
  assert.ok(f.liveOf('C3~F:caput') < 1 && f.liveOf('C3~F:caput') > 0.9, 'thins out gradually');
  assert.ok(seen.length > 10 && seen.every((w) => w >= 0.5 && w <= 1), 'the width share rides 0.5 to 1');
  f.set('X~F:b', 0.1, true);
  assert.equal(seen[seen.length - 1], 1, 'an unconditional group keeps its full width');
  assert.ok(LIVE_FLOOR > 0 && LIVE_FLOOR < 0.05);
});

test('the scene draws the fan groups from one composed fade: the dive\'s dissolve, the model\'s live and the Circuit\'s change are min()ed, one writer', () => {
  const s = new CelScene() as unknown as { fans: Map<unknown, string>; feeders: FeederLives; fadeNow: number; leavingSet: Set<unknown>; lastFade: number; pushFades(): void; composeFade(o: unknown): number; vesselObject(id: string): { fade: number; group: { visible: boolean } } };
  const caput = s.vesselObject('C3~F:caput');
  s.feeders.set('C3~F:caput', 0.4, true);
  s.pushFades();
  assert.equal(caput.fade, 0.4, 'the model\'s live alone');
  s.fadeNow = 0.25; s.pushFades();
  assert.equal(caput.fade, 0.25, 'the dive\'s dissolve is the smaller');
  s.fadeNow = 1; s.feeders.set('C3~F:caput', 0, true); s.pushFades();
  assert.equal(caput.group.visible, false, 'a group with nothing to show is not drawn');
  s.feeders.set('C3~F:caput', 1, true); s.pushFades();
  assert.equal(caput.fade, 1); assert.equal(caput.group.visible, true);
  for (const o of s.leavingSet) { s.lastFade = 0.3; s.fadeNow = 0.8; assert.equal(s.composeFade(o), 0.3, 'what leaves with the organs: the Circuit\'s share when it is the smaller'); s.lastFade = 1; s.fadeNow = 1; break; }
  const text = src('scene.ts');
  assert.equal((text.match(/\.setFade\(/g) ?? []).length, 4, 'objects\' fade is written in pushFades only (the rest are the disease layer\'s and the procedures\' own)');
});

// ---- 1.3: per-kind eased draw-on and retract ----
test('draw-on and retract take 2D\'s time for the kind (rex 2600 / 1200, shunt 900 / 700, collateral 1150, the epigastric veins 1500 / 1100) on 2D\'s easeInOut, never one linear 320 ms', () => {
  assert.deepEqual(presenceMs('REX'), { in: 2600, out: 1200 });
  assert.deepEqual(presenceMs('TIPS'), { in: 900, out: 700 });
  assert.deepEqual(presenceMs('C1a'), { in: 1150, out: 1150 });
  assert.deepEqual(presenceMs('EPI_SVC'), { in: 1500, out: 1100 });
  for (const v of NETWORK) { const m = presenceMs(v.id); assert.ok(m.in >= 900 && m.out >= 700, `${v.id}: ${JSON.stringify(m)}`); }
  assert.ok(NETWORK_BY_ID.get('REX')!.kind === 'shunt' && NETWORK_BY_ID.get('C3')!.kind === 'collateral');
  const o = { edge: { id: 'TIPS' }, group: { visible: true }, reveal: 1, setReveal(a: number) { this.reveal = a; }, setDotted() { /* */ } };
  const t = new PresenceTracks([o as never]);
  t.set('TIPS', 'hidden', true);
  t.set('TIPS', 'shown');
  t.step(0);   // (the frame the goal is taken)
  t.step(225);   // a quarter of its 900 ms
  assert.ok(Math.abs(o.reveal - easeMove(0.25)) < 1e-9 && o.reveal < 0.25, `eased, not straight: ${o.reveal}`);
  t.step(225);
  assert.ok(Math.abs(o.reveal - 0.5) < 1e-9, 'half way at half the time');
  while (t.step(16));
  assert.equal(o.reveal, 1);
  t.set('TIPS', 'hidden');
  t.step(350);   // half of its 700 ms retract
  assert.ok(Math.abs(o.reveal - 0.5) < 1e-9, `retracts over 700, not 900: ${o.reveal}`);
  t.set('TIPS', 'shown');   // it turns round from where it is, no jump
  const at = o.reveal; t.step(16);
  assert.ok(o.reveal >= at && o.reveal - at < 0.05, 'turns from where it was');
});

// ---- 1.4: the glow eases at the view switch ----
test('the selected vessel\'s glow eases away over the first 15 % of the Circuit\'s change and back, never snaps at the switch', () => {
  assert.equal(glowGate(0), 1);
  assert.equal(glowGate(0.15), 0);
  assert.equal(glowGate(1), 0);
  assert.ok(glowGate(0.03) < 1 && glowGate(0.03) > 0.8, 'the first frame of the change is not a snap');
  let last = 1;
  for (let t = 0; t <= 0.15; t += 0.005) { const g = glowGate(t); assert.ok(g <= last + 1e-12); assert.ok(last - g < 0.12, 'small steps'); last = g; }
  const scene = src('scene.ts');
  assert.match(scene, /setGlowShown\(glowGate\(this\.circuit\.t\)\)/);
  assert.doesNotMatch(scene, /setGlowShown\(this\.circuit\.t < 0\.02/);
  assert.equal(GLOW_GATE_T, 0.15, 'the shader\'s gate is the same 15 %');
  assert.ok(glowWeightGlsl('h').includes('(1.0 - smoothstep(0.0, 0.15, circT))'), 'the halo eases away in the shader with the Circuit\'s own change');
});
