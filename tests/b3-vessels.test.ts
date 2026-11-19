import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EDGES, NODES } from '../src/engine/hales/portal/topology.js';
import { EDGE_IDS, hasVessel, indexOf } from '../src/engine/vessel-data.ts';
import { DRAWN_EDGE_IDS, NETWORK, NETWORK_BY_ID, NEEDS_C3_IDS, collateralOpen, presenceOf, recruitFrac, radiusOf, softFloor, MAX_RADIUS, MIN_RADIUS, FLOOR_ASYMPTOTE } from '../src/scene/vessels/network.ts';
import { PresenceTracks, PRESENCE_MS } from '../src/scene/vessels/presence-track.ts';
import { frameFor } from './b3-frames.ts';
import { HIDDEN_EDGES } from '../src/scene/vessels/paths.copied.ts';

const nodeIds = new Set((NODES as { id: string }[]).map((n) => n.id));
const edge = new Map((EDGES as { id: string; kind: string; from: string; to: string }[]).map((e) => [e.id, e]));

test('every vessel the 2D figure draws is a vessel here, named by its engine edge id', () => {
  const have = new Set(NETWORK.map((v) => v.id));
  for (const id of DRAWN_EDGE_IDS) assert.ok(have.has(id), `${id} is missing from the network`);
  assert.equal(have.size, NETWORK.length, 'ids are unique');
  for (const v of NETWORK) assert.ok(hasVessel(v.id) && EDGE_IDS[indexOf(v.id)] === v.id, `${v.id} has a texel`);
});

test('hidden edges (the wedge, the diode, the caudate, the surgical shunts) are not in the network', () => {
  for (const id of HIDDEN_EDGES) assert.ok(!NETWORK_BY_ID.has(id), id);
  for (const id of ['WEDGE', 'CAUD']) assert.ok(!NETWORK_BY_ID.has(id));
});

test('every vessel has geometry that starts and ends in the finite plate', () => {
  for (const v of NETWORK) {
    assert.ok(v.pts.length >= 2, `${v.id} has points`);
    for (const p of v.pts) for (const c of p) assert.ok(Number.isFinite(c), `${v.id} finite`);
    assert.ok(nodeIds.has(v.from) && nodeIds.has(v.to), `${v.id} runs between two engine nodes`);
    assert.ok(v.pts.every((p) => p[1] > FLOOR_ASYMPTOTE - 1e-6), `${v.id} stays on the plate`);
  }
});

test('nothing falls below the plate: the floor eases toward an asymptote and never passes it', () => {
  for (let y = -9; y < 3; y += 0.25) assert.ok(softFloor(y) > FLOOR_ASYMPTOTE - 1e-9, `y ${y}`);
  assert.equal(softFloor(1), 1);
  assert.ok(softFloor(-2) === -2, 'above the knee nothing moves');
  for (let y = -8; y < -2.4; y += 0.5) assert.ok(softFloor(y + 0.25) >= softFloor(y), 'monotone');
});

test('a vessel\'s radius follows its diameter inside the clamp', () => {
  assert.equal(radiusOf(0.1), MIN_RADIUS);
  assert.equal(radiusOf(100), MAX_RADIUS);
  assert.ok(radiusOf(12) > radiusOf(6));
});

test('collaterals open by growth or flow; the epigastric veins follow the paraumbilical (C3)', async () => {
  const healthy = await frameFor('healthy');
  const cirr = await frameFor('cirr-decomp');
  const closed = (id: string, f: typeof healthy.frame) => presenceOf({ id, kind: 'collateral' }, f, { collaterals: false });
  assert.equal(closed('C1a', healthy.frame), 'hidden');
  assert.equal(presenceOf({ id: 'C1a', kind: 'collateral' }, healthy.frame, { collaterals: true }), 'ghost');
  let opened = 0;
  for (const v of NETWORK) if (v.kind === 'collateral' && collateralOpen(v.id, cirr.frame)) opened++;
  assert.ok(opened > 0, 'a decompensated cirrhosis has open collaterals');
  for (const id of NEEDS_C3_IDS) {
    const want = recruitFrac('C3', cirr.frame) > 0.15 ? 'shown' : 'hidden';
    assert.equal(presenceOf({ id, kind: edge.get(id)!.kind }, cirr.frame, { collaterals: false }), want, id);
    assert.equal(presenceOf({ id, kind: edge.get(id)!.kind }, healthy.frame, { collaterals: true }), 'hidden', `${id} healthy`);
  }
  // an ordinary vein is always drawn
  assert.equal(presenceOf({ id: 'PV_TRUNK', kind: 'vein' }, healthy.frame, { collaterals: false }), 'shown');
});

interface Fake { edge: { id: string }; group: { visible: boolean }; reveal: number; dotted: boolean; setReveal(a: number): void; setDotted(on: boolean): void }
const fake = (id: string): Fake => ({ edge: { id }, group: { visible: true }, reveal: 1, dotted: false, setReveal(a) { this.reveal = a; }, setDotted(on) { this.dotted = on; } });

test('a vessel that comes and goes draws on and retracts along its flow, and never pops', () => {
  const a = fake('C1a');
  const t = new PresenceTracks([a as never]);
  t.set('C1a', 'hidden', true);
  assert.equal(a.group.visible, false);
  t.set('C1a', 'shown');
  let last = 0, steps = 0;
  while (t.step(16)) { assert.ok(a.reveal >= last - 1e-9, 'draws on monotonically'); assert.ok(a.reveal - last <= 16 / PRESENCE_MS + 1e-9, 'a step is small'); last = a.reveal; steps++; assert.ok(steps < 200); }
  assert.equal(a.reveal, 1); assert.equal(a.group.visible, true);
  t.set('C1a', 'hidden');
  t.step(16);
  assert.ok(a.reveal < 1 && a.reveal > 0, 'retracts, does not vanish');
  while (t.step(16));
  assert.equal(a.group.visible, false);
});

test('a closed collateral changing to dotted retracts the solid one first, then draws the dotted', () => {
  const a = fake('C2');
  const t = new PresenceTracks([a as never]);
  t.set('C2', 'shown', true);
  t.set('C2', 'ghost');
  t.step(16);
  assert.equal(a.dotted, false, 'still solid while it retracts');
  while (t.step(16));
  assert.equal(a.dotted, true); assert.equal(a.reveal, 1);
});
